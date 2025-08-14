import os
import csv
import logging
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional
from app.models import db, Product, SyncRecord
from app.services.database_service import DatabaseService

logger = logging.getLogger(__name__)

class SyncHistoryService:
    """
    Database-powered sync history service
    Replaces the file-based JSON system with PostgreSQL storage
    """
    
    def __init__(self):
        """Initialize the sync history service"""
        self.db_service = DatabaseService()
        logger.info("SyncHistoryService initialized with database backend")
    
    def load_products_from_csv(self, csv_path: str) -> List[Dict[str, str]]:
        """
        Load product information from CSV file
        Enhanced version with better error handling and validation
        """
        products = []
        
        try:
            if not os.path.exists(csv_path):
                logger.warning(f"CSV file not found: {csv_path}")
                return products
            
            with open(csv_path, 'r', encoding='utf-8') as file:
                # Detect CSV format
                sample = file.read(1024)
                file.seek(0)
                
                try:
                    sniffer = csv.Sniffer()
                    delimiter = sniffer.sniff(sample).delimiter
                except:
                    delimiter = ','
                
                # Check for headers
                first_line = file.readline().strip()
                file.seek(0)
                
                has_headers = False
                if first_line:
                    first_row_values = first_line.split(delimiter)
                    header_indicators = ['sku', 'id', 'product', 'name', 'category', 'type', 'class']
                    has_headers = any(indicator in first_row_values[0].lower() for indicator in header_indicators)
                
                if has_headers:
                    reader = csv.DictReader(file, delimiter=delimiter)
                    headers = [header.strip().lower() for header in reader.fieldnames]
                    logger.info(f"CSV headers found: {headers}")
                    
                    # Map columns intelligently
                    sku_col = self._find_column(headers, reader.fieldnames, ['sku', 'id', 'product_id', 'item_id', 'part_number'])
                    name_col = self._find_column(headers, reader.fieldnames, ['name', 'product_name', 'title', 'description', 'item_name'])
                    category_col = self._find_column(headers, reader.fieldnames, ['category', 'product_category', 'type', 'class', 'group'])
                    
                    if not sku_col:
                        sku_col = reader.fieldnames[0]
                    
                    logger.info(f"Using columns - SKU: {sku_col}, Name: {name_col}, Category: {category_col}")
                    
                    # Process rows
                    for row_num, row in enumerate(reader, start=2):
                        try:
                            sku = row.get(sku_col, '').strip()
                            if sku:
                                name = row.get(name_col, '').strip() if name_col else None
                                category = row.get(category_col, '').strip() if category_col else 'Unsorted'
                                
                                category = self._normalize_category(category)
                                
                                products.append({
                                    'sku': sku,
                                    'name': name,
                                    'category': category,
                                    'source': 'csv'
                                })
                        except Exception as e:
                            logger.warning(f"Error processing row {row_num}: {e}")
                
                else:
                    # No headers - assume first column is SKU
                    reader = csv.reader(file, delimiter=delimiter)
                    for row_num, row in enumerate(reader, start=1):
                        try:
                            if row and row[0].strip():
                                sku = row[0].strip()
                                name = row[1].strip() if len(row) > 1 and row[1].strip() else None
                                category = row[2].strip() if len(row) > 2 and row[2].strip() else 'Unsorted'
                                
                                category = self._normalize_category(category)
                                
                                products.append({
                                    'sku': sku,
                                    'name': name,
                                    'category': category,
                                    'source': 'csv'
                                })
                        except Exception as e:
                            logger.warning(f"Error processing row {row_num}: {e}")
            
            logger.info(f"Successfully loaded {len(products)} products from CSV")
            return products
            
        except Exception as e:
            logger.error(f"Failed to load products from CSV {csv_path}: {e}")
            return []
    
    def _find_column(self, headers: List[str], fieldnames: List[str], possible_names: List[str]) -> Optional[str]:
        """Find column name from possible alternatives"""
        for possible in possible_names:
            if possible in headers:
                return fieldnames[headers.index(possible)]
        return None
    
    def _normalize_category(self, category: str) -> str:
        """Normalize category names"""
        if not category or not isinstance(category, str):
            return 'Unsorted'
        
        category = category.strip()
        if not category or category.lower() in ['', 'none', 'null', 'n/a']:
            return 'Unsorted'
        
        # Capitalize first letter of each word
        return ' '.join(word.capitalize() for word in category.split())
    
    def bulk_init_skus(self, products_data: List[Dict[str, str]]) -> bool:
        """
        Initialize sync records for bulk SKUs
        Now saves directly to database instead of JSON
        """
        try:
            logger.info(f"Bulk initializing {len(products_data)} SKUs in database")
            
            # Use database service to bulk add products
            added_count = self.db_service.bulk_add_products(products_data)
            
            # Create initial sync records for tracking
            for product_data in products_data:
                sku = product_data.get('sku')
                if sku:
                    product = self.db_service.get_product(sku)
                    if product:
                        # Create initial sync record
                        self.db_service.add_sync_record(
                            product_id=str(product.id),
                            sync_type='initialization',
                            status='completed',
                            sync_data={'source': 'csv_import', 'initial_data': product_data}
                        )
            
            logger.info(f"Successfully initialized {added_count} products in database")
            return True
            
        except Exception as e:
            logger.error(f"Failed to bulk initialize SKUs: {e}")
            return False
    
    def record_sync(self, sku: str, sync_type: str, status: str = 'pending', 
                   data: Dict = None, error_message: str = None) -> bool:
        """
        Record a sync operation for a SKU
        """
        try:
            # Get or create product
            product = self.db_service.get_product(sku)
            if not product:
                product = self.db_service.add_product(sku, source='sync')
            
            # Create sync record
            sync_record = self.db_service.add_sync_record(
                product_id=str(product.id),
                sync_type=sync_type,
                status=status,
                sync_data=data,
                error_message=error_message
            )
            
            logger.info(f"Recorded {sync_type} sync for SKU {sku}: {status}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to record sync for SKU {sku}: {e}")
            return False
    
    def update_sync_status(self, sku: str, sync_type: str, status: str, 
                          data: Dict = None, error_message: str = None) -> bool:
        """
        Update the status of a sync operation
        """
        try:
            product = self.db_service.get_product(sku)
            if not product:
                logger.warning(f"Product not found for SKU {sku}")
                return False
            
            # Find the most recent sync record of this type
            sync_record = SyncRecord.query.filter_by(
                product_id=product.id,
                sync_type=sync_type
            ).order_by(SyncRecord.sync_started_at.desc()).first()
            
            if sync_record:
                self.db_service.update_sync_record(
                    record_id=str(sync_record.id),
                    status=status,
                    sync_data=data,
                    error_message=error_message
                )
                logger.info(f"Updated sync status for SKU {sku}: {status}")
                return True
            else:
                # Create new sync record if none exists
                self.record_sync(sku, sync_type, status, data, error_message)
                return True
                
        except Exception as e:
            logger.error(f"Failed to update sync status for SKU {sku}: {e}")
            return False
    
    def get_sync_history(self, sku: str = None, sync_type: str = None) -> List[Dict]:
        """
        Get sync history for a specific SKU or all SKUs
        """
        try:
            if sku:
                product = self.db_service.get_product(sku)
                if not product:
                    return []
                product_id = str(product.id)
            else:
                product_id = None
            
            sync_records = self.db_service.get_sync_history(
                product_id=product_id,
                sync_type=sync_type
            )
            
            return [record.to_dict() for record in sync_records]
            
        except Exception as e:
            logger.error(f"Failed to get sync history: {e}")
            return []
    
    def get_sync_stats(self) -> Dict[str, Any]:
        """
        Get comprehensive sync statistics
        """
        try:
            return self.db_service.get_sync_stats()
        except Exception as e:
            logger.error(f"Failed to get sync stats: {e}")
            return {}
    
    def get_known_skus(self, category: str = None, limit: int = None) -> List[str]:
        """
        Get list of known SKUs with optional filtering
        """
        try:
            products = self.db_service.get_products(category=category, limit=limit)
            return [product.sku for product in products]
        except Exception as e:
            logger.error(f"Failed to get known SKUs: {e}")
            return []
    
    def search_products(self, search_term: str) -> List[Dict]:
        """
        Search products by SKU or name
        """
        try:
            products = self.db_service.search_products(search_term)
            return [product.to_dict() for product in products]
        except Exception as e:
            logger.error(f"Failed to search products: {e}")
            return []
    
    def update_product_data(self, sku: str, data_type: str, data: Dict) -> bool:
        """
        Update product data (pimly_data, krowne_data, salesforce_data)
        """
        try:
            return self.db_service.update_product_data(sku, data_type, data)
        except Exception as e:
            logger.error(f"Failed to update product data for SKU {sku}: {e}")
            return False
    
    def get_categories(self) -> List[str]:
        """
        Get list of all product categories
        """
        try:
            result = db.session.query(Product.category).distinct().all()
            return [row[0] for row in result if row[0]]
        except Exception as e:
            logger.error(f"Failed to get categories: {e}")
            return []
    
    # Backward compatibility methods for existing code
    def cleanup_old_records(self, days_old: int = 90) -> int:
        """Clean up old sync records (placeholder for now)"""
        # TODO: Implement if needed
        logger.info(f"Cleanup requested for records older than {days_old} days")
        return 0