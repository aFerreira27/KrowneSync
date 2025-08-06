"""
This module handles the mapping and comparison of product data between different systems:
- Salesforce/Pimly (with properties array structure)
- Krowne Website (with direct fields and specifications)
- Future systems can be easily added

The mapper normalizes different field names and structures into a common format for comparison.
"""

import re
import logging
from typing import Dict, List, Any, Optional, Tuple
from dataclasses import dataclass
from enum import Enum

logger = logging.getLogger(__name__)

class DataSource(Enum):
    """Enum for different data sources"""
    SALESFORCE = "salesforce"
    KROWNE = "krowne"
    UNKNOWN = "unknown"

@dataclass
class FieldMapping:
    """Represents a field mapping between different systems"""
    canonical_name: str  # The standardized field name
    salesforce_names: List[str]  # All possible Salesforce field names
    krowne_names: List[str]  # All possible Krowne field names
    field_type: str  # 'text', 'price', 'number', 'boolean', 'date'
    description: str  # Human-readable description

@dataclass
class PropertyValue:
    """Represents a normalized property value"""
    canonical_name: str
    value: Any
    source: DataSource
    original_name: str
    field_type: str

@dataclass
class ComparisonResult:
    """Result of comparing a single field between sources"""
    field_name: str
    salesforce_value: Any
    krowne_value: Any
    is_match: bool
    is_mismatch: bool
    has_partial_data: bool
    notes: str

class ProductMapper:
    """Main class for mapping and comparing product data between different systems"""
    
    def __init__(self):
        self.field_mappings = self._initialize_field_mappings()
        self.price_pattern = re.compile(r'[^\d.]')
        
    def _initialize_field_mappings(self) -> Dict[str, FieldMapping]:
        """Initialize the field mappings between different systems"""
        mappings = [
            # Core Product Information
            FieldMapping(
                canonical_name="product_name",
                salesforce_names=["name", "Name", "Product_Name", "ProductName"],
                krowne_names=["name", "productName", "title"],
                field_type="text",
                description="Primary product name"
            ),
            FieldMapping(
                canonical_name="product_code",
                salesforce_names=["Id", "ProductCode", "SKU", "Product_Code"],
                krowne_names=["productCode", "sku", "modelNumber", "partNumber"],
                field_type="text",
                description="Product identifier/SKU"
            ),
            FieldMapping(
                canonical_name="description",
                salesforce_names=["Description", "Product_Description", "LongDescription", "Product_Description__c"],
                krowne_names=["description", "longDescription", "summary"],
                field_type="text",
                description="Product description"
            ),
            FieldMapping(
                canonical_name="list_price",
                salesforce_names=["List_Price", "ListPrice", "Price", "StandardPrice", "UnitPrice"],
                krowne_names=["price", "listPrice", "msrp", "retailPrice"],
                field_type="price",
                description="List/retail price"
            ),
            FieldMapping(
                canonical_name="series",
                salesforce_names=["Series", "Product_Series", "ProductSeries"],
                krowne_names=["series", "productSeries", "line"],
                field_type="text",
                description="Product series or line"
            ),
            FieldMapping(
                canonical_name="warranty",
                salesforce_names=["Warranty", "Warranty_Period", "WarrantyInfo"],
                krowne_names=["warranty", "warrantyPeriod", "warrantyInfo"],
                field_type="text",
                description="Warranty information"
            ),
            
            # Physical Specifications
            FieldMapping(
                canonical_name="weight",
                salesforce_names=["Product_Weight_(lbs.)", "Weight", "Product_Weight"],
                krowne_names=["weight", "productWeight", "weightLbs"],
                field_type="number",
                description="Product weight in pounds"
            ),
            FieldMapping(
                canonical_name="dimensions",
                salesforce_names=["Dimensions", "Product_Dimensions", "Size"],
                krowne_names=["dimensions", "size", "measurements"],
                field_type="text",
                description="Product dimensions"
            ),
            FieldMapping(
                canonical_name="length",
                salesforce_names=["Product_Length_(in.)", "Length", "Product_Length"],
                krowne_names=["length", "productLength", "lengthIn"],
                field_type="number",
                description="Product length in inches"
            ),
            FieldMapping(
                canonical_name="height",
                salesforce_names=["Product_Height_(in.)", "Height", "Product_Height"],
                krowne_names=["height", "productHeight", "heightIn"],
                field_type="number",
                description="Product height in inches"
            ),
            FieldMapping(
                canonical_name="depth",
                salesforce_names=["Product_Depth_(in.)", "Depth", "Product_Depth"],
                krowne_names=["depth", "productDepth", "depthIn"],
                field_type="number",
                description="Product depth in inches"
            ),
            
            # Plumbing/Faucet Specific
            FieldMapping(
                canonical_name="mounting_style",
                salesforce_names=["Mounting_Style", "MountingStyle", "Mount_Type"],
                krowne_names=["mountingStyle", "mountType", "installation"],
                field_type="text",
                description="How the product mounts (wall, deck, etc.)"
            ),
            FieldMapping(
                canonical_name="spout_style",
                salesforce_names=["Spout_Style", "SpoutStyle", "Spout_Type"],
                krowne_names=["spoutStyle", "spoutType"],
                field_type="text",
                description="Style of spout (gooseneck, straight, etc.)"
            ),
            FieldMapping(
                canonical_name="spout_size",
                salesforce_names=["Spout_Size_(in.)", "Spout_Size", "SpoutSize"],
                krowne_names=["spoutSize", "spoutLength"],
                field_type="text",
                description="Spout size/length"
            ),
            FieldMapping(
                canonical_name="handle_type",
                salesforce_names=["Handle_Type", "HandleType", "Handles"],
                krowne_names=["handles", "handleType", "handleStyle"],
                field_type="text",
                description="Type of handles (lever, knob, etc.)"
            ),
            FieldMapping(
                canonical_name="valve_type",
                salesforce_names=["Valve_Type", "ValveType", "Valves"],
                krowne_names=["valves", "valveType"],
                field_type="text",
                description="Type of valves"
            ),
            FieldMapping(
                canonical_name="flow_rate",
                salesforce_names=["Flow_Rate_(GPM)", "Flow_Rate", "FlowRate"],
                krowne_names=["flowRate", "gpm"],
                field_type="text",
                description="Water flow rate"
            ),
            FieldMapping(
                canonical_name="inlet",
                salesforce_names=["Inlet", "Inlet_Size", "Connection"],
                krowne_names=["inlet", "connection", "inletSize"],
                field_type="text",
                description="Inlet connection type/size"
            ),
            FieldMapping(
                canonical_name="finish",
                salesforce_names=["Finish", "Surface_Finish", "Material"],
                krowne_names=["finish", "material", "surfaceFinish"],
                field_type="text",
                description="Product finish/material"
            ),
            FieldMapping(
                canonical_name="centers",
                salesforce_names=["Centers", "Center_Distance", "Spacing"],
                krowne_names=["centers", "spacing", "centerDistance"],
                field_type="text",
                description="Center-to-center spacing"
            ),
            
            # Certifications
            FieldMapping(
                canonical_name="nsf_certification",
                salesforce_names=["NSF_Certification", "NSF", "NSF_Cert"],
                krowne_names=["nsfCertification", "nsf"],
                field_type="text",
                description="NSF certification status"
            ),
            FieldMapping(
                canonical_name="csa_certification",
                salesforce_names=["CSA_Certification", "CSA", "CSA_Cert"],
                krowne_names=["csaCertification", "csa"],
                field_type="text",
                description="CSA certification status"
            ),
            FieldMapping(
                canonical_name="cec_certification",
                salesforce_names=["CEC_Listed_Certification", "CEC_Certification", "CEC"],
                krowne_names=["cecCertification", "cec"],
                field_type="text",
                description="CEC certification status"
            ),
            
            # Packaging Information
            FieldMapping(
                canonical_name="case_quantity",
                salesforce_names=["Case_Quantity", "CaseQuantity", "Pack_Size"],
                krowne_names=["caseQuantity", "packSize"],
                field_type="number",
                description="Quantity per case/pack"
            ),
            FieldMapping(
                canonical_name="case_weight",
                salesforce_names=["Case_Weight_(lbs.)", "Case_Weight", "CaseWeight"],
                krowne_names=["caseWeight", "packWeight"],
                field_type="number",
                description="Weight of full case/pack"
            ),
            FieldMapping(
                canonical_name="shipping_weight",
                salesforce_names=["Shipping_Weight_(lbs.)", "Shipping_Weight", "ShippingWeight"],
                krowne_names=["shippingWeight"],
                field_type="number",
                description="Shipping weight"
            ),
            
            # Additional Fields
            FieldMapping(
                canonical_name="upc",
                salesforce_names=["UPC", "UPC_Code", "Barcode"],
                krowne_names=["upc", "barcode"],
                field_type="text",
                description="UPC/barcode"
            ),
            FieldMapping(
                canonical_name="hts_code",
                salesforce_names=["HTS_Code", "HTS", "TariffCode"],
                krowne_names=["htsCode", "tariffCode"],
                field_type="text",
                description="HTS/tariff code"
            ),
            FieldMapping(
                canonical_name="temperature_range",
                salesforce_names=["Temperature_Range", "TempRange", "Operating_Temperature"],
                krowne_names=["temperatureRange", "tempRange"],
                field_type="text",
                description="Operating temperature range"
            ),
            FieldMapping(
                canonical_name="main_image_url",
                salesforce_names=["Main_Image_Url", "ImageUrl", "MainImage"],
                krowne_names=["mainImageUrl"],
                field_type="url",
                description="Primary product image URL"
            ),
            FieldMapping(
                canonical_name="downloads",
                salesforce_names=["Downloads", "Download_Links"],
                krowne_names=["downloads"],
                field_type="list",
                description="List of downloadable product documents"
            ),
            FieldMapping(
                canonical_name="features",
                salesforce_names=["Features", "Key_Features", "Product_Features"],
                krowne_names=["features"],
                field_type="list",
                description="Bullet point product features"
            ),
            FieldMapping(
                canonical_name="breadcrumb",
                salesforce_names=[],
                krowne_names=["breadcrumb"],
                field_type="list",
                description="Breadcrumb navigation path for product"
            ),
            FieldMapping(
                canonical_name="categories",
                salesforce_names=["Product_Category", "Categories"],
                krowne_names=["categories"],
                field_type="list",
                description="Product category hierarchy"
            ),
            FieldMapping(
                canonical_name="related_products",
                salesforce_names=["Related_Products", "Related_SKUs"],
                krowne_names=["relatedProducts"],
                field_type="list",
                description="Related or recommended products"
            ),
            FieldMapping(
                canonical_name="spec_sheet_url",
                salesforce_names=["Spec_Sheet_URL", "SpecSheet"],
                krowne_names=["specSheetUrl"],
                field_type="url",
                description="URL to product specification sheet"
            ),
            FieldMapping(
                canonical_name="warranty_info",
                salesforce_names=["Warranty_Info_URL", "Warranty_Link"],
                krowne_names=["warrantyInfo"],
                field_type="url",
                description="Link to warranty information page"
            ),
            FieldMapping(
                canonical_name="properties",
                salesforce_names=["Properties", "Attributes"],
                krowne_names=["properties"],
                field_type="list",
                description="List of product properties as name-value pairs"
            )
        ]
        
        # Convert to dictionary with canonical name as key
        return {mapping.canonical_name: mapping for mapping in mappings}
    
    def extract_salesforce_value(self, sf_data: Dict[str, Any], field_name: str) -> Optional[Any]:
        """Extract a value from Salesforce data structure"""
        if not sf_data:
            return None
            
        mapping = self.field_mappings.get(field_name)
        if not mapping:
            return None
            
        # Check direct fields first
        for sf_name in mapping.salesforce_names:
            if sf_name in sf_data:
                return sf_data[sf_name]
        
        # Check properties array
        properties = sf_data.get('properties', [])
        if isinstance(properties, list):
            for prop in properties:
                prop_admin_name = prop.get('propertyAdminName', '')
                prop_name = prop.get('propertyName', '')
                
                for sf_name in mapping.salesforce_names:
                    if prop_admin_name == sf_name or prop_name == sf_name:
                        return prop.get('value')
        
        return None
    
    def extract_krowne_value(self, krowne_data: Dict[str, Any], field_name: str) -> Optional[Any]:
        """Extract a value from Krowne data structure"""
        if not krowne_data:
            return None
            
        mapping = self.field_mappings.get(field_name)
        if not mapping:
            return None
            
        # Check direct fields first
        for krowne_name in mapping.krowne_names:
            if krowne_name in krowne_data:
                return krowne_data[krowne_name]
        
        # Check specifications dict
        specifications = krowne_data.get('specifications', {})
        if isinstance(specifications, dict):
            for krowne_name in mapping.krowne_names:
                if krowne_name in specifications:
                    return specifications[krowne_name]
                # Also check with space/underscore variations
                name_with_spaces = krowne_name.replace('_', ' ')
                name_with_underscores = krowne_name.replace(' ', '_')
                if name_with_spaces in specifications:
                    return specifications[name_with_spaces]
                if name_with_underscores in specifications:
                    return specifications[name_with_underscores]
        
        # Check properties array (if exists)
        properties = krowne_data.get('properties', [])
        if isinstance(properties, list):
            for prop in properties:
                prop_admin_name = prop.get('propertyAdminName', '')
                prop_name = prop.get('propertyName', '')
                
                for krowne_name in mapping.krowne_names:
                    if (prop_admin_name == krowne_name or prop_name == krowne_name or
                        prop_admin_name == krowne_name.replace(' ', '_') or
                        prop_name == krowne_name.replace('_', ' ')):
                        return prop.get('value')
        
        return None
    
    def normalize_value(self, value: Any, field_type: str) -> Any:
        """Normalize a value based on its field type"""
        if value is None:
            return None
            
        if field_type == "price":
            return self._normalize_price(value)
        elif field_type == "number":
            return self._normalize_number(value)
        elif field_type == "boolean":
            return self._normalize_boolean(value)
        elif field_type == "text":
            return self._normalize_text(value)
        else:
            return str(value).strip() if value else None
    
    def _normalize_price(self, price: Any) -> Optional[float]:
        """Normalize price values to float"""
        if price is None:
            return None
        
        if isinstance(price, (int, float)):
            return float(price)
        
        if isinstance(price, str):
            # Remove currency symbols, commas, and whitespace
            clean_price = self.price_pattern.sub('', price.strip())
            try:
                return float(clean_price) if clean_price else None
            except ValueError:
                return None
        
        return None
    
    def _normalize_number(self, number: Any) -> Optional[float]:
        """Normalize numeric values to float"""
        if number is None:
            return None
        
        if isinstance(number, (int, float)):
            return float(number)
        
        if isinstance(number, str):
            # Extract numeric value from string
            clean_num = re.sub(r'[^\d.-]', '', number.strip())
            try:
                return float(clean_num) if clean_num else None
            except ValueError:
                return None
        
        return None
    
    def _normalize_boolean(self, value: Any) -> Optional[bool]:
        """Normalize boolean values"""
        if value is None:
            return None
        
        if isinstance(value, bool):
            return value
        
        if isinstance(value, str):
            value_lower = value.strip().lower()
            if value_lower in ['true', 'yes', '1', 'y', 'on']:
                return True
            elif value_lower in ['false', 'no', '0', 'n', 'off']:
                return False
        
        return None
    
    def _normalize_text(self, text: Any) -> Optional[str]:
        """Normalize text values"""
        if text is None:
            return None
        
        return str(text).strip() if text else None
    
    def compare_values(self, sf_value: Any, krowne_value: Any, field_type: str) -> Tuple[bool, str]:
        """Compare two values and return (is_match, notes)"""
        # Normalize both values
        norm_sf = self.normalize_value(sf_value, field_type)
        norm_krowne = self.normalize_value(krowne_value, field_type)
        
        # Both are None
        if norm_sf is None and norm_krowne is None:
            return True, "Both values are empty"
        
        # One is None
        if norm_sf is None or norm_krowne is None:
            return False, f"Only one source has data"
        
        # Compare based on field type
        if field_type == "price":
            return self._compare_prices(norm_sf, norm_krowne)
        elif field_type == "number":
            return self._compare_numbers(norm_sf, norm_krowne)
        elif field_type == "text":
            return self._compare_text(str(norm_sf), str(norm_krowne))
        elif field_type == "boolean":
            return norm_sf == norm_krowne, "Boolean comparison"
        else:
            return str(norm_sf) == str(norm_krowne), "String comparison"
    
    def _compare_prices(self, price1: float, price2: float) -> Tuple[bool, str]:
        """Compare price values with tolerance"""
        tolerance = 0.01  # 1 cent tolerance
        diff = abs(price1 - price2)
        
        if diff <= tolerance:
            return True, f"Prices match within tolerance (${diff:.2f} difference)"
        else:
            return False, f"Price difference: ${diff:.2f}"
    
    def _compare_numbers(self, num1: float, num2: float) -> Tuple[bool, str]:
        """Compare numeric values with tolerance"""
        tolerance = 0.001  # Small tolerance for floating point comparison
        diff = abs(num1 - num2)
        
        if diff <= tolerance:
            return True, f"Numbers match within tolerance"
        else:
            return False, f"Numeric difference: {diff}"
    
    def _compare_text(self, text1: str, text2: str) -> Tuple[bool, str]:
        """Compare text values with normalization"""
        # Normalize for comparison (lowercase, strip whitespace)
        norm1 = text1.lower().strip()
        norm2 = text2.lower().strip()
        
        if norm1 == norm2:
            return True, "Text matches exactly"
        
        # Check for similar content (remove punctuation, extra spaces)
        clean1 = re.sub(r'[^\w\s]', '', norm1)
        clean1 = re.sub(r'\s+', ' ', clean1).strip()
        clean2 = re.sub(r'[^\w\s]', '', norm2)
        clean2 = re.sub(r'\s+', ' ', clean2).strip()
        
        if clean1 == clean2:
            return True, "Text matches after normalization"
        
        # Check if one contains the other (for cases like "16-281 - Product Name" vs "Product Name")
        if clean1 in clean2 or clean2 in clean1:
            return True, "Text partially matches (one contains the other)"
        
        return False, "Text does not match"
    
    def compare_products(self, salesforce_data: Dict[str, Any], krowne_data: Dict[str, Any]) -> List[ComparisonResult]:
        """Compare all mapped fields between Salesforce and Krowne data"""
        results = []
        
        for field_name, mapping in self.field_mappings.items():
            # Extract values from both sources
            sf_value = self.extract_salesforce_value(salesforce_data, field_name)
            krowne_value = self.extract_krowne_value(krowne_data, field_name)
            
            # Compare values
            is_match, notes = self.compare_values(sf_value, krowne_value, mapping.field_type)
            
            # Determine status
            has_data = sf_value is not None or krowne_value is not None
            has_both = sf_value is not None and krowne_value is not None
            is_mismatch = has_both and not is_match
            has_partial_data = has_data and not has_both
            
            result = ComparisonResult(
                field_name=mapping.canonical_name,
                salesforce_value=sf_value,
                krowne_value=krowne_value,
                is_match=is_match,
                is_mismatch=is_mismatch,
                has_partial_data=has_partial_data,
                notes=notes
            )
            
            results.append(result)
        
        return results
    
    def get_all_canonical_fields(self) -> List[str]:
        """Get list of all canonical field names"""
        return list(self.field_mappings.keys())
    
    def get_field_description(self, canonical_name: str) -> str:
        """Get description for a canonical field name"""
        mapping = self.field_mappings.get(canonical_name)
        return mapping.description if mapping else "Unknown field"
    
    def add_custom_mapping(self, mapping: FieldMapping):
        """Add a custom field mapping"""
        self.field_mappings[mapping.canonical_name] = mapping
        logger.info(f"Added custom mapping for field: {mapping.canonical_name}")


# Convenience functions for backward compatibility
def calculate_product_mismatches(salesforce_data: Dict[str, Any], krowne_data: Dict[str, Any]) -> List[Dict[str, Any]]:
    """
    Backward compatibility function that returns mismatches in the original format
    """
    mapper = ProductMapper()
    comparison_results = mapper.compare_products(salesforce_data, krowne_data)
    
    # Convert to original mismatch format
    mismatches = []
    for result in comparison_results:
        if result.is_mismatch:
            mismatches.append({
                'field': result.field_name.replace('_', ' ').title(),
                'salesforce': result.salesforce_value,
                'krowne': result.krowne_value
            })
    
    return mismatches