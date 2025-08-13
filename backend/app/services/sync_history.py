# app/services/sync_history.py
"""
Sync History Service - Tracks synchronization history for SKUs
Stores data in JSON files for simplicity, can be upgraded to database later
"""

import os
import json
import csv
import logging
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional

logger = logging.getLogger(__name__)

class SyncHistoryService:
    def __init__(self, data_dir: str = "data"):
        """Initialize the sync history service
        
        Args:
            data_dir: Directory to store sync history files
        """
        self.data_dir = data_dir
        self.history_file = os.path.join(data_dir, "sync_history.json")
        
        # Create data directory if it doesn't exist
        os.makedirs(data_dir, exist_ok=True)
        
        # Initialize history file if it doesn't exist
        if not os.path.exists(self.history_file):
            self._init_history_file()
    
    def _init_history_file(self):
        """Initialize empty history file"""
        initial_data = {
            "metadata": {
                "created": datetime.now(timezone.utc).isoformat(),
                "version": "1.0",
                "description": "Sync history for KrowneSync application"
            },
            "sync_records": {}
        }
        
        with open(self.history_file, 'w') as f:
            json.dump(initial_data, f, indent=2, default=str)
        
        logger.info(f"Initialized sync history file: {self.history_file}")
    
    def _load_history(self) -> Dict[str, Any]:
        """Load sync history from file"""
        try:
            with open(self.history_file, 'r') as f:
                return json.load(f)
        except (FileNotFoundError, json.JSONDecodeError) as e:
            logger.warning(f"Could not load history file: {e}. Reinitializing...")
            self._init_history_file()
            return self._load_history()
    
    def _save_history(self, history_data: Dict[str, Any]):
        """Save sync history to file"""
        try:
            with open(self.history_file, 'w') as f:
                json.dump(history_data, f, indent=2, default=str)
        except Exception as e:
            logger.error(f"Failed to save history file: {e}")
            raise
    
    def load_products_from_csv(self, csv_path: str) -> List[Dict[str, str]]:
        """Load product information from CSV file
        
        Args:
            csv_path: Path to the CSV file
            
        Returns:
            List of dictionaries with 'sku', 'name', and 'category' keys
        """
        products = []
        
        try:
            if not os.path.exists(csv_path):
                logger.warning(f"CSV file not found: {csv_path}")
                return products
            
            with open(csv_path, 'r', encoding='utf-8') as file:
                # Try to detect the CSV format
                sample = file.read(1024)
                file.seek(0)
                
                # Use csv.Sniffer to detect delimiter
                try:
                    sniffer = csv.Sniffer()
                    delimiter = sniffer.sniff(sample).delimiter
                except:
                    delimiter = ','  # Default to comma
                
                # Check if first row looks like headers
                first_line = file.readline().strip()
                file.seek(0)
                
                has_headers = False
                if first_line:
                    first_row_values = first_line.split(delimiter)
                    # Check if first row contains header-like terms
                    header_indicators = ['sku', 'id', 'product', 'name', 'category', 'type', 'class']
                    has_headers = any(indicator in first_row_values[0].lower() for indicator in header_indicators)
                
                if has_headers:
                    # Use DictReader for files with headers
                    reader = csv.DictReader(file, delimiter=delimiter)
                    
                    headers = [header.strip().lower() for header in reader.fieldnames]
                    logger.info(f"CSV headers found: {headers}")
                    
                    # Map possible column names to our standard names
                    sku_col = None
                    name_col = None
                    category_col = None
                    
                    # Find columns
                    for possible_sku in ['sku', 'id', 'product_id', 'item_id', 'part_number']:
                        if possible_sku in headers:
                            sku_col = reader.fieldnames[headers.index(possible_sku)]
                            break
                    
                    for possible_name in ['name', 'product_name', 'title', 'description', 'item_name']:
                        if possible_name in headers:
                            name_col = reader.fieldnames[headers.index(possible_name)]
                            break
                    
                    for possible_category in ['category', 'product_category', 'type', 'class', 'group']:
                        if possible_category in headers:
                            category_col = reader.fieldnames[headers.index(possible_category)]
                            break
                    
                    if not sku_col:
                        sku_col = reader.fieldnames[0]
                    
                    logger.info(f"Using columns - SKU: {sku_col}, Name: {name_col}, Category: {category_col}")
                    
                    # Process rows with headers
                    for row_num, row in enumerate(reader, start=2):
                        try:
                            sku = row.get(sku_col, '').strip()
                            if sku:
                                name = row.get(name_col, '').strip() if name_col else None
                                category = row.get(category_col, '').strip() if category_col else 'Unsorted'
                                
                                # Validate and normalize category
                                category = self._normalize_category(category)
                                
                                products.append({
                                    'sku': sku,
                                    'name': name,
                                    'category': category
                                })
                        except Exception as e:
                            logger.warning(f"Error processing row {row_num} in CSV: {e}")
                            continue
                
                else:
                    # No headers - assume fixed column positions
                    # Column A (0) = SKU, Column B (1) = Category
                    logger.info("No headers detected, assuming Column A=SKU, Column B=Category")
                    
                    reader = csv.reader(file, delimiter=delimiter)
                    
                    for row_num, row in enumerate(reader, start=1):
                        try:
                            if len(row) >= 1 and row[0].strip():
                                sku = row[0].strip()
                                
                                # Get category from column B if it exists
                                category = 'Unsorted'
                                if len(row) >= 2 and row[1].strip():
                                    category = row[1].strip()
                                
                                # Validate and normalize category
                                category = self._normalize_category(category)
                                
                                products.append({
                                    'sku': sku,
                                    'name': None,  # No name column in this format
                                    'category': category
                                })
                        
                        except Exception as e:
                            logger.warning(f"Error processing row {row_num} in CSV: {e}")
                            continue
            
            logger.info(f"Loaded {len(products)} products from CSV")
            
            # Log category distribution
            categories = {}
            for product in products:
                cat = product['category']
                categories[cat] = categories.get(cat, 0) + 1
            
            logger.info(f"Category distribution: {dict(sorted(categories.items()))}")
            
            return products
            
        except Exception as e:
            logger.error(f"Failed to load products from CSV {csv_path}: {e}")
            return products
    
    def _normalize_category(self, category: str) -> str:
        """Normalize and validate category name
        
        Args:
            category: Raw category string
            
        Returns:
            Normalized category name or 'Unsorted'
        """
        if not category:
            return 'Unsorted'
        
        # Known categories list
        known_categories = [
            'Unsorted', 'Unit_Parts_&_Accessories', 'Faucets', 
            'Plumbing_Parts_&_Accessories', 'Remote_Spouts',
            'Beverage_Dispensing_Parts_&_Accessories', 'Electronic_Sensor_Faucets',
            'Pre-Rinse_Units', 'Dump_Sink_Stations', 'Bar_Sinks',
            'Liquor_Display_Units', 'Ice_Bin', 'Drainboards',
            'Storage_Cabinets', 'Utility_Faucet_&_Pot_Filler', 'Spouts',
            'Foodservice_Parts_&_Accessories', 'Krowne_Home_Faucets',
            'Air_Switches', 'Soap_Dispensers', 'Pet_Grooming',
            'Drains', 'Hose_Reels', 'Casters', 'Alchemy',
            'Gas_Connectors', 'Workstations', 'Bottle_Coolers',
            'Dispensing_Faucets', 'Gas_System', 'Dry_Storage_Cabinets',
            'Beverage_Dispensing_Kits', 'Refrigeration', 'Sinks',
            'Towers', 'Gas_Connector_Parts_&_Accessories', 'Direct_Draw_Cooler',
            'Mug_FrosterFreezers', 'Glass_Chiller', 'Glass_Washer',
            'Regulator_Panels', 'Power_Packs', 'Drainers_&_Rinsers',
            'Soda_Gun_Holders', 'Specialized_Underbar_Stations', 'Speed_Units',
            'Perforated_Inserts', 'Locking_Covers', 'Trash_Chute',
            'Mixology_Kits', 'HydroSift_Water_Filters', 'Pass_Thru_Units',
            'Robotic_Bartenders', 'Trunk_Lines', 'Vinyl_Wrap',
            'Mop_Floor_Sinks', 'MoveWell'
        ]
        
        # Clean up category name
        normalized = category.replace(' ', '_').replace('&', '&').strip()
        
        # Check exact match first
        if normalized in known_categories:
            return normalized
        
        # Try case-insensitive match
        normalized_lower = normalized.lower()
        for known_cat in known_categories:
            if known_cat.lower() == normalized_lower:
                return known_cat
        
        # Try partial matches for common variations
        category_mappings = {
            'unit_parts': 'Unit_Parts_&_Accessories',
            'plumbing_parts': 'Plumbing_Parts_&_Accessories',
            'beverage_dispensing_parts': 'Beverage_Dispensing_Parts_&_Accessories',
            'electronic_sensor': 'Electronic_Sensor_Faucets',
            'pre_rinse': 'Pre-Rinse_Units',
            'dump_sink': 'Dump_Sink_Stations',
            'bar_sink': 'Bar_Sinks',
            'liquor_display': 'Liquor_Display_Units',
            'storage_cabinet': 'Storage_Cabinets',
            'utility_faucet': 'Utility_Faucet_&_Pot_Filler',
            'foodservice_parts': 'Foodservice_Parts_&_Accessories',
            'krowne_home': 'Krowne_Home_Faucets',
            'air_switch': 'Air_Switches',
            'soap_dispenser': 'Soap_Dispensers',
            'pet_groom': 'Pet_Grooming',
            'hose_reel': 'Hose_Reels',
            'gas_connector': 'Gas_Connectors',
            'bottle_cooler': 'Bottle_Coolers',
            'dispensing_faucet': 'Dispensing_Faucets',
            'gas_system': 'Gas_System',
            'dry_storage': 'Dry_Storage_Cabinets',
            'beverage_dispensing_kit': 'Beverage_Dispensing_Kits',
            'gas_connector_parts': 'Gas_Connector_Parts_&_Accessories',
            'direct_draw': 'Direct_Draw_Cooler',
            'mug_froster': 'Mug_FrosterFreezers',
            'glass_chill': 'Glass_Chiller',
            'glass_wash': 'Glass_Washer',
            'regulator_panel': 'Regulator_Panels',
            'power_pack': 'Power_Packs',
            'drainer': 'Drainers_&_Rinsers',
            'soda_gun': 'Soda_Gun_Holders',
            'specialized_underbar': 'Specialized_Underbar_Stations',
            'speed_unit': 'Speed_Units',
            'perforated_insert': 'Perforated_Inserts',
            'locking_cover': 'Locking_Covers',
            'trash_chute': 'Trash_Chute',
            'mixology_kit': 'Mixology_Kits',
            'hydrosift': 'HydroSift_Water_Filters',
            'pass_thru': 'Pass_Thru_Units',
            'robotic_bartender': 'Robotic_Bartenders',
            'trunk_line': 'Trunk_Lines',
            'vinyl_wrap': 'Vinyl_Wrap',
            'mop_floor': 'Mop_Floor_Sinks'
        }
        
        normalized_lower = normalized.lower()
        for key, mapped_category in category_mappings.items():
            if key in normalized_lower:
                return mapped_category
        
        # If no match found, return Unsorted
        logger.debug(f"Unknown category '{category}' mapped to 'Unsorted'")
        return 'Unsorted'
    
    def record_sync(self, sku: str, status: str, details: Optional[Dict[str, Any]] = None) -> bool:
        """Record a sync operation for a SKU
        
        Args:
            sku: Product SKU
            status: Sync status ('success', 'failed', 'pending')
            details: Additional details about the sync operation
                    Can include 'name' and 'category' to update product info
            
        Returns:
            bool: True if recorded successfully
        """
        try:
            history_data = self._load_history()
            
            current_time = datetime.now(timezone.utc).isoformat()
            
            # Initialize SKU record if it doesn't exist
            if sku not in history_data["sync_records"]:
                history_data["sync_records"][sku] = {
                    "sku": sku,
                    "name": None,
                    "category": "Unsorted",
                    "first_sync": current_time,
                    "last_sync": None,
                    "sync_count": 0,
                    "success_count": 0,
                    "failed_count": 0,
                    "status": "never",
                    "sync_history": []
                }
            
            sku_record = history_data["sync_records"][sku]
            
            # Update product info if provided in details
            if details:
                if 'name' in details and details['name']:
                    sku_record['name'] = details['name']
                if 'category' in details and details['category']:
                    sku_record['category'] = details['category']
            
            # Update sync record
            sync_entry = {
                "timestamp": current_time,
                "status": status,
                "details": details or {}
            }
            
            # Update counters
            sku_record["sync_count"] += 1
            sku_record["last_sync"] = current_time
            sku_record["status"] = status
            
            if status == "success":
                sku_record["success_count"] += 1
            elif status == "failed":
                sku_record["failed_count"] += 1
            
            # Add to history (keep last 10 entries per SKU)
            sku_record["sync_history"].append(sync_entry)
            if len(sku_record["sync_history"]) > 10:
                sku_record["sync_history"] = sku_record["sync_history"][-10:]
            
            # Save updated history
            self._save_history(history_data)
            
            logger.info(f"Recorded sync for SKU {sku}: {status}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to record sync for SKU {sku}: {e}")
            return False
    
    def get_sync_history(self, sku: Optional[str] = None) -> List[Dict[str, Any]]:
        """Get sync history for a specific SKU or all SKUs
        
        Args:
            sku: Optional SKU to filter by
            
        Returns:
            List of sync records
        """
        try:
            history_data = self._load_history()
            sync_records = history_data.get("sync_records", {})
            
            if sku:
                # Return single SKU record
                if sku in sync_records:
                    return [sync_records[sku]]
                else:
                    return []
            else:
                # Return all records, sorted by last sync date
                records = list(sync_records.values())
                
                # Sort by last_sync date (newest first, never synced last)
                def sort_key(record):
                    if record.get("last_sync"):
                        try:
                            return datetime.fromisoformat(record["last_sync"].replace('Z', '+00:00'))
                        except:
                            return datetime.min.replace(tzinfo=timezone.utc)
                    else:
                        return datetime.min.replace(tzinfo=timezone.utc)
                
                records.sort(key=sort_key, reverse=True)
                return records
                
        except Exception as e:
            logger.error(f"Failed to get sync history: {e}")
            return []
    
    def get_sync_stats(self) -> Dict[str, Any]:
        """Get sync statistics
        
        Returns:
            Dictionary with sync statistics
        """
        try:
            history_data = self._load_history()
            sync_records = history_data.get("sync_records", {})
            
            total_skus = len(sync_records)
            success_count = len([r for r in sync_records.values() if r.get("status") == "success"])
            failed_count = len([r for r in sync_records.values() if r.get("status") == "failed"])
            never_synced = len([r for r in sync_records.values() if r.get("status") == "never"])
            pending_count = len([r for r in sync_records.values() if r.get("status") == "pending"])
            
            total_syncs = sum(r.get("sync_count", 0) for r in sync_records.values())
            
            # Find last sync time
            last_sync = None
            for record in sync_records.values():
                if record.get("last_sync"):
                    if not last_sync or record["last_sync"] > last_sync:
                        last_sync = record["last_sync"]
            
            return {
                "total_skus": total_skus,
                "success_count": success_count,
                "failed_count": failed_count,
                "never_synced": never_synced,
                "pending_count": pending_count,
                "total_syncs": total_syncs,
                "last_sync": last_sync,
                "created": history_data.get("metadata", {}).get("created")
            }
            
        except Exception as e:
            logger.error(f"Failed to get sync stats: {e}")
            return {
                "total_skus": 0,
                "success_count": 0,
                "failed_count": 0,
                "never_synced": 0,
                "pending_count": 0,
                "total_syncs": 0,
                "last_sync": None,
                "created": None
            }
    
    def bulk_init_skus(self, skus_data: List[Dict[str, str]]) -> bool:
        """Initialize sync records for multiple SKUs with product information
        
        Args:
            skus_data: List of dictionaries with 'sku', 'name', and 'category' keys
                      OR List of strings (SKUs only) for backward compatibility
            
        Returns:
            bool: True if successful
        """
        try:
            history_data = self._load_history()
            sync_records = history_data["sync_records"]
            
            current_time = datetime.now(timezone.utc).isoformat()
            
            # Handle both old format (list of strings) and new format (list of dicts)
            for item in skus_data:
                if isinstance(item, str):
                    # Old format - just SKU
                    sku = item
                    name = None
                    category = "Unsorted"
                else:
                    # New format - dict with sku, name, category
                    sku = item.get('sku', '')
                    name = item.get('name')
                    category = item.get('category', 'Unsorted')
                
                if sku and sku not in sync_records:
                    sync_records[sku] = {
                        "sku": sku,
                        "name": name,
                        "category": category,
                        "first_sync": current_time,
                        "last_sync": None,
                        "sync_count": 0,
                        "success_count": 0,
                        "failed_count": 0,
                        "status": "never",
                        "sync_history": []
                    }
            
            self._save_history(history_data)
            logger.info(f"Initialized {len(skus_data)} SKUs in sync history")
            return True
            
        except Exception as e:
            logger.error(f"Failed to bulk initialize SKUs: {e}")
            return False
    
    def cleanup_old_records(self, days_old: int = 90) -> int:
        """Clean up old sync history records
        
        Args:
            days_old: Remove detailed history older than this many days
            
        Returns:
            Number of records cleaned up
        """
        try:
            history_data = self._load_history()
            cleanup_count = 0
            
            cutoff_date = datetime.now(timezone.utc).timestamp() - (days_old * 24 * 60 * 60)
            
            for sku_record in history_data["sync_records"].values():
                original_count = len(sku_record.get("sync_history", []))
                
                # Keep only recent history entries
                sku_record["sync_history"] = [
                    entry for entry in sku_record.get("sync_history", [])
                    if datetime.fromisoformat(entry["timestamp"].replace('Z', '+00:00')).timestamp() > cutoff_date
                ]
                
                cleanup_count += original_count - len(sku_record.get("sync_history", []))
            
            self._save_history(history_data)
            logger.info(f"Cleaned up {cleanup_count} old sync history records")
            return cleanup_count
            
        except Exception as e:
            logger.error(f"Failed to cleanup old records: {e}")
            return 0