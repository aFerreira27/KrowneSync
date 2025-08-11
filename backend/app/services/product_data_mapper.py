import json
import re
import logging
from typing import Dict, List, Any, Optional, Union
from dataclasses import dataclass, asdict
from pathlib import Path

logger = logging.getLogger(__name__)


@dataclass
class ProductMapping:
    """Structured product data mapping"""
    name: str = ""
    sku: str = ""
    series: str = ""
    features: List[str] = None
    specifications: Dict[str, Any] = None
    certifications: Dict[str, bool] = None
    images: List[str] = None
    files: Dict[str, List[str]] = None
    related_items: Dict[str, List[str]] = None
    additions_replacement_parts: List[str] = None
    pimly_only: Dict[str, Any] = None

    def __post_init__(self):
        """Initialize empty collections"""
        if self.features is None:
            self.features = []
        if self.specifications is None:
            self.specifications = {}
        if self.certifications is None:
            self.certifications = {}
        if self.images is None:
            self.images = []
        if self.files is None:
            self.files = {"spec_sheets": [], "manuals": [], "sell_sheets": [], "brochures": []}
        if self.related_items is None:
            self.related_items = {"related_products": [], "parts_accessories": []}
        if self.additions_replacement_parts is None:
            self.additions_replacement_parts = []
        if self.pimly_only is None:
            self.pimly_only = {}


class ProductDataMapper:
    """Maps product data from Pimly/Krowne JSON to standardized categories"""
    
    def __init__(self):
        # Field mappings from your provided list
        self.field_mappings = {
            # Core Product Info
            "Product_Description": {"krowne": "Name", "category": "name"},
            "SKU": {"krowne": "sku", "category": "sku"},
            "Series": {"krowne": "series_value", "category": "series"},
            
            # Features
            "Features": {"krowne": "features_value", "category": "features"},
            
            # Specifications - Dimensions
            "Shipping_Dimensions": {"krowne": "size", "category": "specifications"},
            "Product_Length_(in.)": {"krowne": "length_inches_value", "category": "specifications"},
            "Product_Weight_(lbs.)": {"krowne": "weight_value", "category": "specifications"},
            "Product_Height_(in.)": {"krowne": "overall_height_value", "category": "specifications"},
            "Product_Depth_(in.)": {"krowne": "depth_front_to_back_value", "category": "specifications"},
            "Product_Width_(in.)": {"krowne": "width_value", "category": "specifications"},
            "Product_Weight": {"krowne": "weight_value", "category": "specifications"},
            
            # Specifications - Performance
            "Flow_Rate_(GPM)": {"krowne": "flow_rate_value", "category": "specifications"},
            "Number_of_Taps": {"krowne": "number_of_taps", "category": "specifications"},
            "Glycol_Lines": {"krowne": "glycol_lines", "category": "specifications"},
            "Ice_Capacity_(lbs.)": {"krowne": "ice_capacity_value", "category": "specifications"},
            "BTUhr_(K)": {"krowne": "btu_value", "category": "specifications"},
            "Interior_Diameter_(in.)": {"krowne": "interior_size_value", "category": "specifications"},
            "Wheel_Diameter_(in.)": {"krowne": "wheel_diameter_value", "category": "specifications"},
            "Spray_Head_Flow_Rate_(GPM)": {"krowne": "flow_rate_value", "category": "specifications"},
            "Hose_Length_(in.)": {"krowne": "hose_length_value", "category": "specifications"},
            "Hose_Length_(ft.)": {"krowne": "hose_length_value", "category": "specifications"},
            "Chase_Diameter_(in.)": {"krowne": "chase_value", "category": "specifications"},
            "Hertz_(Hz.)": {"krowne": "electrical_value", "category": "specifications"},
            
            # Specifications - Components
            "Compressor_Location": {"krowne": "compressor_location_value", "category": "specifications"},
            "Top_Finish_Options": {"krowne": "top_finish", "category": "specifications"},
            "Cold_Plate": {"krowne": "cold_plate_value", "category": "specifications"},
            "Handle_Type": {"krowne": "handles_value", "category": "specifications"},
            "Spout_Style": {"krowne": "spout_style_value", "category": "specifications"},
            "Brakes": {"krowne": "brakes_value", "category": "specifications"},
            "Inlet": {"krowne": "inlet_value", "category": "specifications"},
            "Bottle_Capacity": {"krowne": "liquor_bottles_value", "category": "specifications"},
            "Refrigerant": {"krowne": "refrigerant", "category": "specifications"},
            "Spout_Size_(in.)": {"krowne": "spout_size_value", "category": "specifications"},
            "Thread": {"krowne": "thread_value", "category": "specifications"},
            "Pumps": {"krowne": "pumps", "category": "specifications"},
            "Wrap_Style": {"krowne": "wrap_style", "category": "specifications"},
            "Spray_Head_Pattern": {"krowne": "spray_head_value", "category": "specifications"},
            "Type": {"krowne": "product_type", "category": "specifications"},
            "Front_Finish": {"krowne": "door_finish", "category": "specifications"},
            "DoorDrawer_Finish_Options": {"krowne": "door_finish", "category": "specifications"},
            "Mounting_Style": {"krowne": "mounting_style_value", "category": "specifications"},
            "Bowl_Location": {"krowne": "bowl_location_value", "category": "specifications"},
            "Centers": {"krowne": "centers_value", "category": "specifications"},
            "DoorDrawer_Style": {"krowne": "door_style", "category": "specifications"},
            "Drain_Size": {"krowne": "drain_size_value", "category": "specifications"},
            "Outlet": {"krowne": "outlet_type_value", "category": "specifications"},
            "HP": {"krowne": "compressor_hp", "category": "specifications"},
            "Ice_Bin_Location": {"krowne": "ice_bin_location_value", "category": "specifications"},
            "Power_Source": {"krowne": "power_source_value", "category": "specifications"},
            "Voltage": {"krowne": "electrical_value", "category": "specifications"},
            "Valve_Type": {"krowne": "valves_value", "category": "specifications"},
            "Finish": {"krowne": "finish_value", "category": "specifications"},
            "Operating_Range": {"krowne": "operating_range_value", "category": "specifications"},
            "Temperature_Range": {"krowne": "temperature_range", "category": "specifications"},
            "Beverage_Lines": {"krowne": "beer_lines", "category": "specifications"},
            "Bowl_Size_(in.)": {"krowne": "bowl_size_value", "category": "specifications"},
            "Includes": {"krowne": "includes_value", "category": "specifications"},
            "Amps": {"krowne": "amps_value", "category": "specifications"},
            "Load_Capacity_(lbs._per_caster)": {"krowne": "weight_capacity_value", "category": "specifications"},
            "Plate_Size_(in.)": {"krowne": "plate_size_value", "category": "specifications"},
            "Warranty": {"krowne": "warranty_value", "category": "specifications"},
            
            # Pricing
            "List_Price": {"krowne": "List Price", "category": "specifications"},
            
            # Certifications
            "Massachusetts_Listed_Certification": {"krowne": "massachusetts_logo", "category": "certifications"},
            "CEC_Listed_Certification": {"krowne": "cec_logo", "category": "certifications"},
            "NSF_Certification": {"krowne": "nsf_logo", "category": "certifications"},
            "CSA_Certification": {"krowne": "csa_logo", "category": "certifications"},
            "UL_Certification": {"krowne": "ul_logo", "category": "certifications"},
            "ETL_Certification": {"krowne": "etl_logo", "category": "certifications"},
            "ASSE_Certification": {"krowne": "asse_logo", "category": "certifications"},
            "IAMPO_Certification": {"krowne": "iapmo_logo", "category": "certifications"},
            
            # Media Files
            "Images": {"krowne": "Images", "category": "images"},
            "Videos": {"krowne": "Vimeo video, Youtube video", "category": "files"},
            "Spec_Sheet": {"krowne": "Downloads", "category": "files"},
            "Manuals": {"krowne": "Same Section as Spec Sheets", "category": "files"},
            "Sell_Sheet": {"krowne": "Same Section as Spec Sheets", "category": "files"},
            "Brochure": {"krowne": "Same Section as Spec Sheets", "category": "files"},
            
            # Related Items
            "Parts_&_Accessories": {"krowne": "Related Parts/Accessories", "category": "related_items"},
            "Related_Products": {"krowne": "Related Products", "category": "related_items"},
        }
        
        # Fields that should go to PIMLY_ONLY (N/A or blank Krowne mapping)
        self.pimly_only_fields = {
            "Family", "Products_Available_to_Serve", "Case_Dimensions_(in.)",
            "MAP_Price", "UPC", "HTS_Code", "Pallet_Quantity", "Case_Quantity",
            "Case_Price", "Case_Weight_(lbs.)", "Shipping_Weight_(lbs.)",
            "Working_Height_(in.)", "Trunk_Line_Length_(in.)", "Height_of_Ceiling_(in.)",
            "Diameter_(in.)", "Caster_Quantity", "Mug_Capacity", "Gallon_Capacity",
            "Beverage_Line_Diameter_(in.)", "Glycol_Line_Diameter_(in.)",
            "ADA_Compliance", "Freight_Class", "Country_of_Origin", "Production_Code",
            "Product_Status", "Gas_System_Compatibility", "Restock_Fee", "Din_Cables",
            "Heat_Recovery", "Stream_Type", "Cabinet_Side_Finish", "Division",
            "Visibility", "Tower_Style", "Underbar_Structure_Options",
            "Beverage_Compatibility_Options", "Tower_Location", "Tower_Finish",
            "Tower_Mounting", "Drain_Location", "PSI_Range", "Plug_Type",
            "Collaboration", "ERP_Description", "Materials", "Raises_Equipment",
            "AQ_Description", "Design_Upgrades", "FAQs", "IssuesSolutions",
            "Upsell_Items", "Parent_Products", "Backsplash_Height_(in.)",
            "Perforated_Inserts", "Compressor_Size_(in.)", "Phase", "PartsByKrowne",
            "Caster_Overall_Height_(in.)", "Keg_Capacity", "Drain_Outlet",
            "California_Prop_Warning", "Website_Link", "Product_Height_Without_Legs_(in)",
            "INTERNAL_ONLY_PRODUCT", "COO"
        }

    def normalize_field_name(self, field_name: str) -> str:
        """Normalize field names for consistent mapping"""
        # Remove common Pimly prefixes
        if field_name.startswith('pimly__'):
            field_name = field_name[7:]  # Remove 'pimly__'
        
        # Remove trailing __c (Salesforce custom field suffix)
        if field_name.endswith('__c'):
            field_name = field_name[:-3]
        
        # Replace underscores with spaces for better matching
        normalized = field_name.replace('_', ' ').strip()
        
        return normalized

    def extract_value(self, data: Dict[str, Any], field_path: str) -> Any:
        """Extract value from nested JSON using dot notation"""
        keys = field_path.split('.')
        value = data
        
        try:
            for key in keys:
                if isinstance(value, dict):
                    value = value.get(key)
                else:
                    return None
                    
            return value
        except (KeyError, TypeError):
            return None

    def parse_list_value(self, value: Any) -> List[str]:
        """Parse various formats into a list of strings"""
        if not value:
            return []
        
        if isinstance(value, list):
            return [str(item) for item in value if item]
        
        if isinstance(value, str):
            # Handle pipe-separated values
            if ' | ' in value:
                return [item.strip() for item in value.split(' | ') if item.strip()]
            # Handle comma-separated values
            elif ',' in value:
                return [item.strip() for item in value.split(',') if item.strip()]
            else:
                return [value.strip()] if value.strip() else []
        
        return [str(value)]

    def parse_boolean_value(self, value: Any) -> bool:
        """Parse various formats into boolean"""
        if isinstance(value, bool):
            return value
        
        if isinstance(value, str):
            return value.lower() in ('true', '1', 'yes', 'on', 'enabled')
        
        if isinstance(value, (int, float)):
            return bool(value)
        
        return False

    def map_pimly_data(self, pimly_data: Dict[str, Any]) -> ProductMapping:
        """Enhanced Pimly data mapping with proper field extraction"""
        mapping = ProductMapping()
        
        if not pimly_data:
            return mapping
        
        logger.info(f"Processing Pimly data with {len(pimly_data)} fields")
        
        # Process each field in the data
        for field_name, field_value in pimly_data.items():
            if not field_value:  # Skip empty values
                continue
                
            try:
                # Clean field name for processing
                clean_field_name = self._clean_field_name(field_name)
                
                # Process based on field name patterns
                if clean_field_name in ['adminname', 'admin_name']:
                    mapping.sku = self._extract_simple_value(field_value)
                
                elif clean_field_name in ['name']:
                    mapping.name = self._extract_simple_value(field_value)
                
                elif clean_field_name in ['properties']:
                    self._process_pimly_properties(field_value, mapping)
                
                elif clean_field_name in ['digitalassets', 'digital_assets']:
                    self._process_digital_assets(field_value, mapping)
                
                elif clean_field_name in ['categories']:
                    self._process_categories(field_value, mapping)
                
                elif clean_field_name in ['family']:
                    self._process_family(field_value, mapping)
                
                elif clean_field_name in ['relatedproducts', 'related_products']:
                    self._process_related_products(field_value, mapping)
                
                elif clean_field_name in ['mainasset', 'main_asset']:
                    self._process_main_asset(field_value, mapping)
                
                else:
                    # Put unrecognized fields in pimly_only
                    processed_value = self._process_complex_value(field_value)
                    mapping.pimly_only[field_name] = processed_value
                    
            except Exception as e:
                logger.warning(f"Error processing field {field_name}: {e}")
                # Still add to pimly_only but as string
                mapping.pimly_only[field_name] = str(field_value)
        
        logger.info(f"Mapped Pimly data: name='{mapping.name}', sku='{mapping.sku}', "
                   f"features={len(mapping.features)}, specs={len(mapping.specifications)}")
        
        return mapping

    def map_krowne_data(self, krowne_data: Dict[str, Any]) -> ProductMapping:
        """Map Krowne JSON data to standardized categories"""
        mapping = ProductMapping()
        
        # Create reverse mapping from Krowne field names
        krowne_to_category = {}
        for pimly_field, config in self.field_mappings.items():
            krowne_field = config["krowne"]
            if krowne_field and krowne_field != "N/A":
                krowne_to_category[krowne_field] = (config["category"], pimly_field)
        
        # Process Krowne data
        for field_name, field_value in krowne_data.items():
            if not field_value:
                continue
            
            # Check if field maps to a category
            if field_name in krowne_to_category:
                category, original_field = krowne_to_category[field_name]
                
                if category == "name":
                    mapping.name = str(field_value)
                elif category == "sku":
                    mapping.sku = str(field_value)
                elif category == "series":
                    mapping.series = str(field_value)
                elif category == "features":
                    mapping.features.extend(self.parse_list_value(field_value))
                elif category == "specifications":
                    spec_key = original_field.replace('(', '').replace(')', '').replace('.', '')
                    mapping.specifications[spec_key] = field_value
                elif category == "certifications":
                    cert_name = original_field.replace('_Certification', '').replace('_Listed', '')
                    mapping.certifications[cert_name] = self.parse_boolean_value(field_value)
                elif category == "images":
                    if isinstance(field_value, list):
                        mapping.images.extend([str(img) for img in field_value if img])
                    else:
                        mapping.images.append(str(field_value))
                elif category == "files":
                    file_list = self.parse_list_value(field_value)
                    if "Downloads" in field_name:
                        mapping.files["spec_sheets"].extend(file_list)
                    elif "video" in field_name.lower():
                        if "videos" not in mapping.files:
                            mapping.files["videos"] = []
                        mapping.files["videos"].extend(file_list)
                elif category == "related_items":
                    item_list = self.parse_list_value(field_value)
                    if "Parts" in field_name or "Accessories" in field_name:
                        mapping.related_items["parts_accessories"].extend(item_list)
                        mapping.additions_replacement_parts.extend(item_list)
                    elif "Related" in field_name:
                        mapping.related_items["related_products"].extend(item_list)
            else:
                # Unknown Krowne field - could be custom
                mapping.pimly_only[f"krowne_{field_name}"] = field_value
        
        return mapping

    def merge_mappings(self, pimly_mapping: ProductMapping, krowne_mapping: ProductMapping) -> ProductMapping:
        """Merge Pimly and Krowne mappings, preferring non-empty values"""
        merged = ProductMapping()
        
        # Basic fields - prefer non-empty values
        merged.name = pimly_mapping.name or krowne_mapping.name
        merged.sku = pimly_mapping.sku or krowne_mapping.sku
        merged.series = pimly_mapping.series or krowne_mapping.series
        
        # Lists - combine and deduplicate
        merged.features = list(set(pimly_mapping.features + krowne_mapping.features))
        merged.images = list(set(pimly_mapping.images + krowne_mapping.images))
        
        # Dictionaries - merge with Pimly taking precedence
        merged.specifications = {**krowne_mapping.specifications, **pimly_mapping.specifications}
        merged.certifications = {**krowne_mapping.certifications, **pimly_mapping.certifications}
        merged.pimly_only = {**pimly_mapping.pimly_only, **krowne_mapping.pimly_only}
        
        # Files - merge all categories
        for file_type in ["spec_sheets", "manuals", "sell_sheets", "brochures", "videos"]:
            pimly_files = pimly_mapping.files.get(file_type, [])
            krowne_files = krowne_mapping.files.get(file_type, [])
            merged.files[file_type] = list(set(pimly_files + krowne_files))
        
        # Related items - merge both types
        for item_type in ["related_products", "parts_accessories"]:
            pimly_items = pimly_mapping.related_items.get(item_type, [])
            krowne_items = krowne_mapping.related_items.get(item_type, [])
            merged.related_items[item_type] = list(set(pimly_items + krowne_items))
        
        # Replacement parts
        merged.additions_replacement_parts = list(set(
            pimly_mapping.additions_replacement_parts + 
            krowne_mapping.additions_replacement_parts
        ))
        
        return merged

    def process_json_data(self, 
                         data: Union[str, Dict[str, Any]], 
                         source_type: str = "auto") -> ProductMapping:
        """
        Process JSON data from either Pimly or Krowne
        
        Args:
            data: JSON string or dictionary
            source_type: "pimly", "krowne", or "auto" to detect
        
        Returns:
            ProductMapping object with categorized data
        """
        # Parse JSON if string
        if isinstance(data, str):
            try:
                data = json.loads(data)
            except json.JSONDecodeError as e:
                raise ValueError(f"Invalid JSON data: {e}")
        
        if not isinstance(data, dict):
            raise ValueError("Data must be a dictionary or JSON string")
        
        # Auto-detect source type if not specified
        if source_type == "auto":
            # Look for Pimly-specific field patterns
            pimly_indicators = sum(1 for key in data.keys() if 
                                 key.startswith('pimly__') or key.endswith('__c'))
            krowne_indicators = sum(1 for key in data.keys() if 
                                  '_value' in key or '_logo' in key)
            
            if pimly_indicators > krowne_indicators:
                source_type = "pimly"
            else:
                source_type = "krowne"
        
        # Map based on source type
        if source_type == "pimly":
            return self.map_pimly_data(data)
        elif source_type == "krowne":
            return self.map_krowne_data(data)
        else:
            raise ValueError("source_type must be 'pimly', 'krowne', or 'auto'")

    def export_mapping(self, mapping: ProductMapping, format: str = "dict") -> Union[Dict, str]:
        """Export mapping in various formats"""
        if format == "dict":
            return asdict(mapping)
        elif format == "json":
            return json.dumps(asdict(mapping), indent=2, default=str)
        else:
            raise ValueError("format must be 'dict' or 'json'")


    def validate_mapping(self, mapping: ProductMapping) -> Dict[str, List[str]]:
        """Validate mapped data and return warnings/errors"""
        issues = {"errors": [], "warnings": []}
        
        # Required fields validation
        if not mapping.sku:
            issues["errors"].append("SKU is required but missing")
        
        if not mapping.name:
            issues["warnings"].append("Product name is missing")
        
        # Data quality checks
        if mapping.specifications:
            for key, value in mapping.specifications.items():
                if isinstance(value, str) and not value.strip():
                    issues["warnings"].append(f"Empty specification value for {key}")
        
        # Check for missing certifications that might be expected
        cert_fields = ["NSF", "UL", "ETL", "CSA"]
        missing_certs = [cert for cert in cert_fields if cert not in mapping.certifications]
        if missing_certs:
            issues["warnings"].append(f"Missing certification data: {', '.join(missing_certs)}")
        
        return issues

    def generate_krowne_import_format(self, mapping: ProductMapping) -> Dict[str, Any]:
        """Generate data in format suitable for Krowne CMS import"""
        krowne_format = {
            # Basic info
            "sku": mapping.sku,
            "name": mapping.name,
            "series_value": mapping.series,
            
            # Features as pipe-separated string
            "features_value": " | ".join(mapping.features) if mapping.features else "",
            
            # Specifications mapped to Krowne field names
            "specifications": {},
            
            # Certifications as logo flags
            "certifications": {
                f"{cert.lower()}_logo": enabled 
                for cert, enabled in mapping.certifications.items()
            },
            
            # Media
            "images": mapping.images,
            "downloads": mapping.files.get("spec_sheets", []),
            "videos": mapping.files.get("videos", []),
            
            # Related items
            "related_products": mapping.related_items.get("related_products", []),
            "related_parts_accessories": mapping.related_items.get("parts_accessories", [])
        }
        
        # Map specifications to Krowne field names
        for spec_key, spec_value in mapping.specifications.items():
            # Find corresponding Krowne field name
            for pimly_field, config in self.field_mappings.items():
                if (pimly_field.replace('(', '').replace(')', '').replace('.', '') == spec_key and 
                    config["krowne"] != "N/A"):
                    krowne_format["specifications"][config["krowne"]] = spec_value
                    break
        
        return krowne_format

    def generate_comparison_report(self, pimly_mapping: ProductMapping, 
                                 krowne_mapping: ProductMapping) -> Dict[str, Any]:
        """Generate a detailed comparison report between Pimly and Krowne data"""
        report = {
            "sku": pimly_mapping.sku or krowne_mapping.sku,
            "summary": {
                "total_fields_compared": 0,
                "matches": 0,
                "mismatches": 0,
                "pimly_only": 0,
                "krowne_only": 0
            },
            "field_comparisons": [],
            "recommendations": []
        }
        
        # Compare basic fields
        basic_fields = ["name", "sku", "series"]
        for field in basic_fields:
            pimly_val = getattr(pimly_mapping, field, "")
            krowne_val = getattr(krowne_mapping, field, "")
            
            comparison = {
                "field": field,
                "pimly_value": pimly_val,
                "krowne_value": krowne_val,
                "status": "match" if pimly_val == krowne_val else "mismatch"
            }
            
            if pimly_val and not krowne_val:
                comparison["status"] = "pimly_only"
            elif krowne_val and not pimly_val:
                comparison["status"] = "krowne_only"
            
            report["field_comparisons"].append(comparison)
            report["summary"]["total_fields_compared"] += 1
            report["summary"][comparison["status"]] += 1
        
        # Compare specifications
        all_spec_keys = set(pimly_mapping.specifications.keys()) | set(krowne_mapping.specifications.keys())
        for spec_key in all_spec_keys:
            pimly_val = pimly_mapping.specifications.get(spec_key)
            krowne_val = krowne_mapping.specifications.get(spec_key)
            
            comparison = {
                "field": f"spec_{spec_key}",
                "pimly_value": pimly_val,
                "krowne_value": krowne_val,
                "status": "match" if pimly_val == krowne_val else "mismatch"
            }
            
            if pimly_val and not krowne_val:
                comparison["status"] = "pimly_only"
            elif krowne_val and not pimly_val:
                comparison["status"] = "krowne_only"
            
            report["field_comparisons"].append(comparison)
            report["summary"]["total_fields_compared"] += 1
            report["summary"][comparison["status"]] += 1
        
        # Generate recommendations
        if report["summary"]["mismatches"] > 0:
            report["recommendations"].append("Review mismatched fields and update accordingly")
        
        if report["summary"]["pimly_only"] > 0:
            report["recommendations"].append("Consider adding Pimly-only data to Krowne")
        
        if report["summary"]["krowne_only"] > 0:
            report["recommendations"].append("Update Pimly with Krowne-specific data")
        
        return report
    
    def _clean_field_name(self, field_name: str) -> str:
        """Clean field name for consistent processing"""
        clean_name = field_name.lower()
        
        # Remove common Pimly prefixes/suffixes
        if clean_name.startswith('pimly__'):
            clean_name = clean_name[7:]
        if clean_name.endswith('__c'):
            clean_name = clean_name[:-3]
        
        # Replace underscores with empty string for matching
        clean_name = clean_name.replace('_', '')
        
        return clean_name
    
    def _extract_simple_value(self, value: Any) -> str:
        """Extract simple string value from various formats"""
        if isinstance(value, str):
            return value
        elif isinstance(value, dict):
            # Try common Salesforce field patterns
            return (value.get('Name') or 
                   value.get('pimly__Admin_Name__c') or 
                   value.get('value') or 
                   str(value))
        elif isinstance(value, list) and value:
            return str(value[0])
        else:
            return str(value) if value else ""
    
    def _process_pimly_properties(self, properties: Any, mapping: ProductMapping):
        """Process Pimly Properties array into specifications and features"""
        if not isinstance(properties, list):
            return
        
        for prop in properties:
            try:
                if isinstance(prop, dict):
                    prop_name = prop.get('Name') or prop.get('pimly__Property_Name__c', '')
                    prop_value = (prop.get('pimly__Property_Value__c') or 
                                prop.get('Value') or 
                                prop.get('value', ''))
                    
                    if prop_name and prop_value:
                        # Clean property name
                        clean_prop_name = prop_name.replace(' ', '_').replace('(', '').replace(')', '')
                        
                        # Categorize the property
                        if self._is_feature_property(prop_name):
                            # Add to features if it's a feature-type property
                            if isinstance(prop_value, str) and '|' in prop_value:
                                mapping.features.extend([f.strip() for f in prop_value.split('|')])
                            else:
                                mapping.features.append(str(prop_value))
                        else:
                            # Add to specifications
                            mapping.specifications[clean_prop_name] = prop_value
                            
            except Exception as e:
                logger.warning(f"Error processing property: {e}")
                continue
    
    def _process_digital_assets(self, assets: Any, mapping: ProductMapping):
        """Process digital assets into images and files"""
        if not isinstance(assets, list):
            return
        
        for asset in assets:
            try:
                if isinstance(asset, dict):
                    asset_type = asset.get('pimly__Type__c', '').lower()
                    asset_url = asset.get('pimly__URL__c')
                    asset_name = asset.get('Name') or asset.get('pimly__Admin_Name__c', '')
                    
                    if asset_url:
                        if asset_type == 'image':
                            mapping.images.append(asset_url)
                        elif asset_type in ['document', 'pdf', 'spec_sheet']:
                            mapping.files.setdefault('spec_sheets', []).append(asset_url)
                        elif asset_type == 'video':
                            mapping.files.setdefault('videos', []).append(asset_url)
                        else:
                            # Default to spec sheets for unknown document types
                            mapping.files.setdefault('misc_files', []).append(asset_url)
                            
            except Exception as e:
                logger.warning(f"Error processing digital asset: {e}")
                continue
    
    def _process_categories(self, categories: Any, mapping: ProductMapping):
        """Process categories - could be used for series or features"""
        if not isinstance(categories, list):
            return
        
        for category in categories:
            try:
                if isinstance(category, dict):
                    cat_name = category.get('Name') or category.get('pimly__Admin_Name__c', '')
                    if cat_name:
                        # Could be series or just additional info
                        if not mapping.series:
                            mapping.series = cat_name
                        else:
                            mapping.features.append(f"Category: {cat_name}")
                            
            except Exception as e:
                logger.warning(f"Error processing category: {e}")
                continue
    
    def _process_family(self, family: Any, mapping: ProductMapping):
        """Process product family"""
        if isinstance(family, dict):
            family_name = family.get('Name') or family.get('pimly__Admin_Name__c', '')
            if family_name and not mapping.series:
                mapping.series = family_name
    
    def _process_related_products(self, related: Any, mapping: ProductMapping):
        """Process related products"""
        if not isinstance(related, list):
            return
        
        for item in related:
            try:
                if isinstance(item, dict):
                    item_name = item.get('Name') or item.get('pimly__Admin_Name__c', '')
                    item_sku = item.get('pimly__SKU__c') or item.get('SKU', '')
                    
                    if item_name or item_sku:
                        display_name = item_sku if item_sku else item_name
                        mapping.related_items.setdefault('related_products', []).append(display_name)
                        
            except Exception as e:
                logger.warning(f"Error processing related product: {e}")
                continue
    
    def _process_main_asset(self, main_asset: Any, mapping: ProductMapping):
        """Process main product asset"""
        if isinstance(main_asset, dict):
            asset_url = main_asset.get('pimly__URL__c')
            if asset_url and asset_url not in mapping.images:
                mapping.images.insert(0, asset_url)  # Main image goes first
    
    def _is_feature_property(self, prop_name: str) -> bool:
        """Determine if a property should be treated as a feature"""
        feature_indicators = [
            'feature', 'capability', 'includes', 'has', 'with',
            'color', 'material', 'finish', 'style', 'type'
        ]
        prop_lower = prop_name.lower()
        return any(indicator in prop_lower for indicator in feature_indicators)
    
    def _process_complex_value(self, value: Any) -> Any:
        """Process complex values for display"""
        if isinstance(value, dict):
            # Extract meaningful information from Salesforce objects
            if 'Name' in value:
                return value['Name']
            elif 'pimly__Admin_Name__c' in value:
                return value['pimly__Admin_Name__c']
            elif 'value' in value:
                return value['value']
            else:
                # Return a simplified version of the object
                simplified = {}
                for key, val in value.items():
                    if key in ['Name', 'Id', 'pimly__Admin_Name__c', 'pimly__Value__c', 'value']:
                        simplified[key] = val
                return simplified if simplified else str(value)
        
        elif isinstance(value, list):
            # Process list of objects
            processed_list = []
            for item in value:
                if isinstance(item, dict):
                    processed_item = self._process_complex_value(item)
                    processed_list.append(processed_item)
                else:
                    processed_list.append(item)
            return processed_list
        
        else:
            return value
    
    def export_mapping(self, mapping: ProductMapping, format: str = "dict") -> Any:
        """Enhanced export with better value formatting"""
        if format == "dict":
            result = asdict(mapping)
            
            # Post-process the result to clean up display values
            result = self._clean_exported_data(result)
            return result
            
        elif format == "json":
            result = asdict(mapping)
            result = self._clean_exported_data(result)
            return json.dumps(result, indent=2, default=str)
        else:
            raise ValueError("format must be 'dict' or 'json'")
    
    def _clean_exported_data(self, data: Any) -> Any:
        """Clean exported data for better display"""
        if isinstance(data, dict):
            cleaned = {}
            for key, value in data.items():
                cleaned[key] = self._clean_exported_data(value)
            return cleaned
        
        elif isinstance(data, list):
            return [self._clean_exported_data(item) for item in data]
        
        elif isinstance(data, str):
            # Don't return [object Object] strings
            if data == '[object Object]':
                return 'Complex Object'
            return data
        
        else:
            return data