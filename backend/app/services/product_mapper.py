"""
This module handles the mapping and comparison of product data between different systems:
- Salesforce/Pimly (with properties array structure)
- Krowne Website (with direct fields and specifications)
- Krowne CMS (with specific property field mappings)
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
    KROWNE_CMS = "krowne_cms"
    UNKNOWN = "unknown"

@dataclass
class FieldMapping:
    """Represents a field mapping between different systems"""
    canonical_name: str  # The standardized field name
    salesforce_names: List[str]  # All possible Salesforce field names
    krowne_names: List[str]  # All possible Krowne field names
    krowne_cms_names: List[str]  # Krowne CMS property names
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
                krowne_cms_names=["Name"],
                field_type="text",
                description="Primary product name"
            ),
            FieldMapping(
                canonical_name="product_code",
                salesforce_names=["Id", "ProductCode", "SKU", "Product_Code"],
                krowne_names=["productCode", "sku", "modelNumber", "partNumber"],
                krowne_cms_names=["SKU", "Product_Code"],
                field_type="text",
                description="Product identifier/SKU"
            ),
            FieldMapping(
                canonical_name="description",
                salesforce_names=["Description", "Product_Description", "LongDescription", "Product_Description__c"],
                krowne_names=["description", "longDescription", "summary"],
                krowne_cms_names=["Product_Description", "ERP_Description", "AQ_Description"],
                field_type="text",
                description="Product description"
            ),
            FieldMapping(
                canonical_name="list_price",
                salesforce_names=["List_Price", "ListPrice", "Price", "StandardPrice", "UnitPrice"],
                krowne_names=["price", "listPrice", "msrp", "retailPrice"],
                krowne_cms_names=["List_Price"],
                field_type="price",
                description="List/retail price"
            ),
            FieldMapping(
                canonical_name="map_price",
                salesforce_names=["MAP_Price", "MinimumAdvertisedPrice"],
                krowne_names=["mapPrice", "minPrice"],
                krowne_cms_names=["MAP_Price"],
                field_type="price",
                description="Minimum Advertised Price"
            ),
            FieldMapping(
                canonical_name="series",
                salesforce_names=["Series", "Product_Series", "ProductSeries"],
                krowne_names=["series", "productSeries", "line"],
                krowne_cms_names=["Series"],
                field_type="text",
                description="Product series or line"
            ),
            FieldMapping(
                canonical_name="warranty",
                salesforce_names=["Warranty", "Warranty_Period", "WarrantyInfo"],
                krowne_names=["warranty", "warrantyPeriod", "warrantyInfo"],
                krowne_cms_names=["Warranty"],
                field_type="text",
                description="Warranty information"
            ),
            FieldMapping(
                canonical_name="features",
                salesforce_names=["Features", "Key_Features", "Product_Features"],
                krowne_names=["features"],
                krowne_cms_names=["Features"],
                field_type="list",
                description="Bullet point product features"
            ),
            
            # Physical Specifications
            FieldMapping(
                canonical_name="weight",
                salesforce_names=["Product_Weight_(lbs.)", "Weight", "Product_Weight"],
                krowne_names=["weight", "productWeight", "weightLbs"],
                krowne_cms_names=["Product_Weight_(lbs.)", "Product_Weight"],
                field_type="number",
                description="Product weight in pounds"
            ),
            FieldMapping(
                canonical_name="shipping_weight",
                salesforce_names=["Shipping_Weight_(lbs.)", "Shipping_Weight", "ShippingWeight"],
                krowne_names=["shippingWeight"],
                krowne_cms_names=["Shipping_Weight_(lbs.)"],
                field_type="number",
                description="Shipping weight in pounds"
            ),
            FieldMapping(
                canonical_name="case_weight",
                salesforce_names=["Case_Weight_(lbs.)", "Case_Weight", "CaseWeight"],
                krowne_names=["caseWeight", "packWeight"],
                krowne_cms_names=["Case_Weight_(lbs.)"],
                field_type="number",
                description="Weight of full case/pack"
            ),
            FieldMapping(
                canonical_name="length",
                salesforce_names=["Product_Length_(in.)", "Length", "Product_Length"],
                krowne_names=["length", "productLength", "lengthIn"],
                krowne_cms_names=["Product_Length_(in.)"],
                field_type="number",
                description="Product length in inches"
            ),
            FieldMapping(
                canonical_name="height",
                salesforce_names=["Product_Height_(in.)", "Height", "Product_Height"],
                krowne_names=["height", "productHeight", "heightIn"],
                krowne_cms_names=["Product_Height_(in.)"],
                field_type="number",
                description="Product height in inches"
            ),
            FieldMapping(
                canonical_name="depth",
                salesforce_names=["Product_Depth_(in.)", "Depth", "Product_Depth"],
                krowne_names=["depth", "productDepth", "depthIn"],
                krowne_cms_names=["Product_Depth_(in.)"],
                field_type="number",
                description="Product depth in inches"
            ),
            FieldMapping(
                canonical_name="width",
                salesforce_names=["Product_Width_(in.)", "Width", "Product_Width"],
                krowne_names=["width", "productWidth", "widthIn"],
                krowne_cms_names=["Product_Width_(in.)"],
                field_type="number",
                description="Product width in inches"
            ),
            
            # Plumbing/Faucet Specific
            FieldMapping(
                canonical_name="mounting_style",
                salesforce_names=["Mounting_Style", "MountingStyle", "Mount_Type"],
                krowne_names=["mountingStyle", "mountType", "installation"],
                krowne_cms_names=["Mounting_Style"],
                field_type="text",
                description="How the product mounts (wall, deck, etc.)"
            ),
            FieldMapping(
                canonical_name="spout_style",
                salesforce_names=["Spout_Style", "SpoutStyle", "Spout_Type"],
                krowne_names=["spoutStyle", "spoutType"],
                krowne_cms_names=["Spout_Style"],
                field_type="text",
                description="Style of spout (gooseneck, straight, etc.)"
            ),
            FieldMapping(
                canonical_name="spout_size",
                salesforce_names=["Spout_Size_(in.)", "Spout_Size", "SpoutSize"],
                krowne_names=["spoutSize", "spoutLength"],
                krowne_cms_names=["Spout_Size_(in.)"],
                field_type="text",
                description="Spout size/length"
            ),
            FieldMapping(
                canonical_name="handle_type",
                salesforce_names=["Handle_Type", "HandleType", "Handles"],
                krowne_names=["handles", "handleType", "handleStyle"],
                krowne_cms_names=["Handle_Type"],
                field_type="text",
                description="Type of handles (lever, knob, etc.)"
            ),
            FieldMapping(
                canonical_name="valve_type",
                salesforce_names=["Valve_Type", "ValveType", "Valves"],
                krowne_names=["valves", "valveType"],
                krowne_cms_names=["Valve_Type"],
                field_type="text",
                description="Type of valves"
            ),
            FieldMapping(
                canonical_name="flow_rate",
                salesforce_names=["Flow_Rate_(GPM)", "Flow_Rate", "FlowRate"],
                krowne_names=["flowRate", "gpm"],
                krowne_cms_names=["Flow_Rate_(GPM)"],
                field_type="text",
                description="Water flow rate"
            ),
            FieldMapping(
                canonical_name="inlet",
                salesforce_names=["Inlet", "Inlet_Size", "Connection"],
                krowne_names=["inlet", "connection", "inletSize"],
                krowne_cms_names=["Inlet"],
                field_type="text",
                description="Inlet connection type/size"
            ),
            FieldMapping(
                canonical_name="finish",
                salesforce_names=["Finish", "Surface_Finish", "Material"],
                krowne_names=["finish", "material", "surfaceFinish"],
                krowne_cms_names=["Finish", "Materials"],
                field_type="text",
                description="Product finish/material"
            ),
            FieldMapping(
                canonical_name="centers",
                salesforce_names=["Centers", "Center_Distance", "Spacing"],
                krowne_names=["centers", "spacing", "centerDistance"],
                krowne_cms_names=["Centers"],
                field_type="text",
                description="Center-to-center spacing"
            ),
            FieldMapping(
                canonical_name="drain_size",
                salesforce_names=["Drain_Size", "DrainSize"],
                krowne_names=["drainSize"],
                krowne_cms_names=["Drain_Size"],
                field_type="text",
                description="Drain size"
            ),
            FieldMapping(
                canonical_name="outlet_type",
                salesforce_names=["Outlet", "Outlet_Type"],
                krowne_names=["outlet", "outletType"],
                krowne_cms_names=["Outlet"],
                field_type="text",
                description="Outlet type"
            ),
            FieldMapping(
                canonical_name="bowl_size",
                salesforce_names=["Bowl_Size_(in.)", "Bowl_Size"],
                krowne_names=["bowlSize"],
                krowne_cms_names=["Bowl_Size_(in.)"],
                field_type="text",
                description="Bowl size in inches"
            ),
            FieldMapping(
                canonical_name="bowl_location",
                salesforce_names=["Bowl_Location"],
                krowne_names=["bowlLocation"],
                krowne_cms_names=["Bowl_Location"],
                field_type="text",
                description="Bowl location"
            ),
            
            # Bar Systems & Refrigeration
            FieldMapping(
                canonical_name="ice_capacity",
                salesforce_names=["Ice_Capacity_(lbs.)", "Ice_Capacity"],
                krowne_names=["iceCapacity"],
                krowne_cms_names=["Ice_Capacity_(lbs.)"],
                field_type="number",
                description="Ice capacity in pounds"
            ),
            FieldMapping(
                canonical_name="number_of_taps",
                salesforce_names=["Number_of_Taps", "Tap_Count"],
                krowne_names=["numberOfTaps", "tapCount"],
                krowne_cms_names=["Number_of_Taps"],
                field_type="number",
                description="Number of beverage taps"
            ),
            FieldMapping(
                canonical_name="glycol_lines",
                salesforce_names=["Glycol_Lines"],
                krowne_names=["glycolLines"],
                krowne_cms_names=["Glycol_Lines"],
                field_type="number",
                description="Number of glycol lines"
            ),
            FieldMapping(
                canonical_name="beverage_lines",
                salesforce_names=["Beverage_Lines"],
                krowne_names=["beverageLines"],
                krowne_cms_names=["Beverage_Lines"],
                field_type="number",
                description="Number of beverage lines"
            ),
            FieldMapping(
                canonical_name="compressor_hp",
                salesforce_names=["Compressor_HP", "HP"],
                krowne_names=["compressorHP", "hp"],
                krowne_cms_names=["HP"],
                field_type="number",
                description="Compressor horsepower"
            ),
            FieldMapping(
                canonical_name="compressor_location",
                salesforce_names=["Compressor_Location"],
                krowne_names=["compressorLocation"],
                krowne_cms_names=["Compressor_Location"],
                field_type="text",
                description="Compressor location"
            ),
            FieldMapping(
                canonical_name="refrigerant",
                salesforce_names=["Refrigerant"],
                krowne_names=["refrigerant"],
                krowne_cms_names=["Refrigerant"],
                field_type="text",
                description="Refrigerant type"
            ),
            FieldMapping(
                canonical_name="operating_range",
                salesforce_names=["Operating_Range", "Temperature_Range"],
                krowne_names=["operatingRange", "temperatureRange"],
                krowne_cms_names=["Operating_Range", "Temperature_Range"],
                field_type="text",
                description="Operating temperature range"
            ),
            FieldMapping(
                canonical_name="btu_hr",
                salesforce_names=["BTUhr_(K)", "BTU_HR"],
                krowne_names=["btuHr", "btu"],
                krowne_cms_names=["BTUhr_(K)"],
                field_type="number",
                description="BTU per hour rating"
            ),
            
            # Casters & Mobility
            FieldMapping(
                canonical_name="caster_quantity",
                salesforce_names=["Caster_Quantity"],
                krowne_names=["casterQuantity"],
                krowne_cms_names=["Caster_Quantity"],
                field_type="number",
                description="Number of casters"
            ),
            FieldMapping(
                canonical_name="wheel_diameter",
                salesforce_names=["Wheel_Diameter_(in.)"],
                krowne_names=["wheelDiameter"],
                krowne_cms_names=["Wheel_Diameter_(in.)"],
                field_type="number",
                description="Wheel diameter in inches"
            ),
            FieldMapping(
                canonical_name="load_capacity",
                salesforce_names=["Load_Capacity_(lbs._per_caster)"],
                krowne_names=["loadCapacity"],
                krowne_cms_names=["Load_Capacity_(lbs._per_caster)"],
                field_type="number",
                description="Load capacity per caster in pounds"
            ),
            FieldMapping(
                canonical_name="brakes",
                salesforce_names=["Brakes"],
                krowne_names=["brakes"],
                krowne_cms_names=["Brakes"],
                field_type="text",
                description="Brake type"
            ),
            
            # Electrical & Power
            FieldMapping(
                canonical_name="electrical",
                salesforce_names=["Electrical", "Voltage"],
                krowne_names=["electrical", "voltage"],
                krowne_cms_names=["Voltage"],
                field_type="text",
                description="Electrical specifications"
            ),
            FieldMapping(
                canonical_name="amps",
                salesforce_names=["Amps"],
                krowne_names=["amps"],
                krowne_cms_names=["Amps"],
                field_type="number",
                description="Amperage"
            ),
            FieldMapping(
                canonical_name="hertz",
                salesforce_names=["Hertz_(Hz.)"],
                krowne_names=["hertz", "hz"],
                krowne_cms_names=["Hertz_(Hz.)"],
                field_type="number",
                description="Frequency in Hertz"
            ),
            FieldMapping(
                canonical_name="phase",
                salesforce_names=["Phase"],
                krowne_names=["phase"],
                krowne_cms_names=["Phase"],
                field_type="text",
                description="Electrical phase"
            ),
            FieldMapping(
                canonical_name="power_source",
                salesforce_names=["Power_Source"],
                krowne_names=["powerSource"],
                krowne_cms_names=["Power_Source"],
                field_type="text",
                description="Power source type"
            ),
            
            # Certifications
            FieldMapping(
                canonical_name="nsf_certification",
                salesforce_names=["NSF_Certification", "NSF", "NSF_Cert"],
                krowne_names=["nsfCertification", "nsf"],
                krowne_cms_names=["NSF_Certification"],
                field_type="text",
                description="NSF certification status"
            ),
            FieldMapping(
                canonical_name="csa_certification",
                salesforce_names=["CSA_Certification", "CSA", "CSA_Cert"],
                krowne_names=["csaCertification", "csa"],
                krowne_cms_names=["CSA_Certification"],
                field_type="text",
                description="CSA certification status"
            ),
            FieldMapping(
                canonical_name="cec_certification",
                salesforce_names=["CEC_Listed_Certification", "CEC_Certification", "CEC"],
                krowne_names=["cecCertification", "cec"],
                krowne_cms_names=["CEC_Listed_Certification"],
                field_type="text",
                description="CEC certification status"
            ),
            FieldMapping(
                canonical_name="ul_certification",
                salesforce_names=["UL_Certification"],
                krowne_names=["ulCertification"],
                krowne_cms_names=["UL_Certification"],
                field_type="text",
                description="UL certification status"
            ),
            FieldMapping(
                canonical_name="etl_certification",
                salesforce_names=["ETL_Certification"],
                krowne_names=["etlCertification"],
                krowne_cms_names=["ETL_Certification"],
                field_type="text",
                description="ETL certification status"
            ),
            FieldMapping(
                canonical_name="asse_certification",
                salesforce_names=["ASSE_Certification"],
                krowne_names=["asseCertification"],
                krowne_cms_names=["ASSE_Certification"],
                field_type="text",
                description="ASSE certification status"
            ),
            FieldMapping(
                canonical_name="massachusetts_listed",
                salesforce_names=["Massachusetts_Listed_Certification"],
                krowne_names=["massachusettsListed"],
                krowne_cms_names=["Massachusetts_Listed_Certification"],
                field_type="text",
                description="Massachusetts Listed certification"
            ),
            
            # Packaging & Shipping
            FieldMapping(
                canonical_name="case_quantity",
                salesforce_names=["Case_Quantity", "CaseQuantity", "Pack_Size"],
                krowne_names=["caseQuantity", "packSize"],
                krowne_cms_names=["Case_Quantity"],
                field_type="number",
                description="Quantity per case/pack"
            ),
            FieldMapping(
                canonical_name="case_price",
                salesforce_names=["Case_Price"],
                krowne_names=["casePrice"],
                krowne_cms_names=["Case_Price"],
                field_type="price",
                description="Price per case"
            ),
            FieldMapping(
                canonical_name="pallet_quantity",
                salesforce_names=["Pallet_Quantity"],
                krowne_names=["palletQuantity"],
                krowne_cms_names=["Pallet_Quantity"],
                field_type="number",
                description="Quantity per pallet"
            ),
            FieldMapping(
                canonical_name="shipping_dimensions",
                salesforce_names=["Shipping_Dimensions"],
                krowne_names=["shippingDimensions"],
                krowne_cms_names=["Shipping_Dimensions"],
                field_type="text",
                description="Shipping dimensions"
            ),
            FieldMapping(
                canonical_name="case_dimensions",
                salesforce_names=["Case_Dimensions_(in.)"],
                krowne_names=["caseDimensions"],
                krowne_cms_names=["Case_Dimensions_(in.)"],
                field_type="text",
                description="Case dimensions"
            ),
            FieldMapping(
                canonical_name="freight_class",
                salesforce_names=["Freight_Class"],
                krowne_names=["freightClass"],
                krowne_cms_names=["Freight_Class"],
                field_type="text",
                description="Freight class"
            ),
            
            # Product Codes & Identifiers
            FieldMapping(
                canonical_name="upc",
                salesforce_names=["UPC", "UPC_Code", "Barcode"],
                krowne_names=["upc", "barcode"],
                krowne_cms_names=["UPC"],
                field_type="text",
                description="UPC/barcode"
            ),
            FieldMapping(
                canonical_name="hts_code",
                salesforce_names=["HTS_Code", "HTS", "TariffCode"],
                krowne_names=["htsCode", "tariffCode"],
                krowne_cms_names=["HTS_Code"],
                field_type="text",
                description="HTS/tariff code"
            ),
            FieldMapping(
                canonical_name="production_code",
                salesforce_names=["Production_Code"],
                krowne_names=["productionCode"],
                krowne_cms_names=["Production_Code"],
                field_type="text",
                description="Production code"
            ),
            FieldMapping(
                canonical_name="country_of_origin",
                salesforce_names=["Country_of_Origin"],
                krowne_names=["countryOfOrigin"],
                krowne_cms_names=["Country_of_Origin"],
                field_type="text",
                description="Country of origin"
            ),
            
            # Product Status & Availability
            FieldMapping(
                canonical_name="product_status",
                salesforce_names=["Product_Status"],
                krowne_names=["productStatus"],
                krowne_cms_names=["Product_Status"],
                field_type="text",
                description="Product status"
            ),
            FieldMapping(
                canonical_name="products_available_to_serve",
                salesforce_names=["Products_Available_to_Serve"],
                krowne_names=["availableToServe"],
                krowne_cms_names=["Products_Available_to_Serve"],
                field_type="number",
                description="Products available to serve"
            ),
            
            # Additional Fields from Krowne CMS
            FieldMapping(
                canonical_name="thread",
                salesforce_names=["Thread"],
                krowne_names=["thread"],
                krowne_cms_names=["Thread"],
                field_type="text",
                description="Thread specification"
            ),
            FieldMapping(
                canonical_name="pumps",
                salesforce_names=["Pumps"],
                krowne_names=["pumps"],
                krowne_cms_names=["Pumps"],
                field_type="text",
                description="Pump specifications"
            ),
            FieldMapping(
                canonical_name="gas_system_compatibility",
                salesforce_names=["Gas_System_Compatibility"],
                krowne_names=["gasSystemCompatibility"],
                krowne_cms_names=["Gas_System_Compatibility"],
                field_type="text",
                description="Gas system compatibility"
            ),
            FieldMapping(
                canonical_name="wrap_style",
                salesforce_names=["Wrap_Style"],
                krowne_names=["wrapStyle"],
                krowne_cms_names=["Wrap_Style"],
                field_type="text",
                description="Wrap style"
            ),
            FieldMapping(
                canonical_name="gallon_capacity",
                salesforce_names=["Gallon_Capacity"],
                krowne_names=["gallonCapacity"],
                krowne_cms_names=["Gallon_Capacity"],
                field_type="number",
                description="Gallon capacity"
            ),
            FieldMapping(
                canonical_name="mug_capacity",
                salesforce_names=["Mug_Capacity"],
                krowne_names=["mugCapacity"],
                krowne_cms_names=["Mug_Capacity"],
                field_type="number",
                description="Mug capacity"
            ),
            FieldMapping(
                canonical_name="bottle_capacity",
                salesforce_names=["Bottle_Capacity"],
                krowne_names=["bottleCapacity"],
                krowne_cms_names=["Bottle_Capacity"],
                field_type="number",
                description="Bottle capacity"
            ),
            FieldMapping(
                canonical_name="keg_capacity",
                salesforce_names=["Keg_Capacity"],
                krowne_names=["kegCapacity"],
                krowne_cms_names=["Keg_Capacity"],
                field_type="number",
                description="Keg capacity"
            ),
            FieldMapping(
                canonical_name="hose_length_in",
                salesforce_names=["Hose_Length_(in.)"],
                krowne_names=["hoseLengthIn"],
                krowne_cms_names=["Hose_Length_(in.)"],
                field_type="number",
                description="Hose length in inches"
            ),
            FieldMapping(
                canonical_name="hose_length_ft",
                salesforce_names=["Hose_Length_(ft.)"],
                krowne_names=["hoseLengthFt"],
                krowne_cms_names=["Hose_Length_(ft.)"],
                field_type="number",
                description="Hose length in feet"
            ),
            
            # Web/Digital Fields
            FieldMapping(
                canonical_name="main_image_url",
                salesforce_names=["Main_Image_Url", "ImageUrl", "MainImage"],
                krowne_names=["mainImageUrl"],
                krowne_cms_names=["Images"],
                field_type="url",
                description="Primary product image URL"
            ),
            FieldMapping(
                canonical_name="spec_sheet_url",
                salesforce_names=["Spec_Sheet_URL", "SpecSheet"],
                krowne_names=["specSheetUrl"],
                krowne_cms_names=["Spec_Sheet"],
                field_type="url",
                description="URL to product specification sheet"
            ),
            FieldMapping(
                canonical_name="website_link",
                salesforce_names=["Website_Link"],
                krowne_names=["websiteLink"],
                krowne_cms_names=["Website_Link"],
                field_type="url",
                description="Website link"
            ),
            
            # Lists and Complex Fields
            FieldMapping(
                canonical_name="breadcrumb",
                salesforce_names=[],
                krowne_names=["breadcrumb"],
                krowne_cms_names=[],
                field_type="list",
                description="Breadcrumb navigation path for product"
            ),
            FieldMapping(
                canonical_name="categories",
                salesforce_names=["Product_Category", "Categories"],
                krowne_names=["categories"],
                krowne_cms_names=[],
                field_type="list",
                description="Product category hierarchy"
            ),
            FieldMapping(
                canonical_name="related_products",
                salesforce_names=["Related_Products", "Related_SKUs"],
                krowne_names=["relatedProducts"],
                krowne_cms_names=["Related_Products"],
                field_type="list",
                description="Related or recommended products"
            ),
            FieldMapping(
                canonical_name="includes",
                salesforce_names=["Includes"],
                krowne_names=["includes"],
                krowne_cms_names=["Includes"],
                field_type="text",
                description="What is included with the product"
            ),
            FieldMapping(
                canonical_name="properties",
                salesforce_names=["Properties", "Attributes"],
                krowne_names=["properties"],
                krowne_cms_names=[],
                field_type="list",
                description="List of product properties as name-value pairs"
            ),
            # Material and Construction
            FieldMapping(
                canonical_name="material",
                salesforce_names=["Material", "Construction_Material", "Body_Material"],
                krowne_names=["material", "bodyMaterial", "construction"],
                krowne_cms_names=["Material", "Body_Material", "Construction"],
                field_type="text",
                description="Primary construction material"
            ),
            
            FieldMapping(
                canonical_name="stainless_steel_gauge",
                salesforce_names=["Stainless_Steel_Gauge", "Steel_Gauge"],
                krowne_names=["steelGauge", "gauge", "stainlessGauge"],
                krowne_cms_names=["Stainless_Steel_Gauge", "Steel_Gauge"],
                field_type="text",
                description="Stainless steel gauge thickness"
            ),
            
            # Faucet-specific missing fields
            FieldMapping(
                canonical_name="aerator",
                salesforce_names=["Aerator", "Aerator_Type"],
                krowne_names=["aerator", "aeratorType"],
                krowne_cms_names=["Aerator", "Aerator_Type"],
                field_type="text",
                description="Aerator type or specification"
            ),
            
            FieldMapping(
                canonical_name="cartridge_type",
                salesforce_names=["Cartridge", "Cartridge_Type"],
                krowne_names=["cartridge", "cartridgeType"],
                krowne_cms_names=["Cartridge", "Cartridge_Type"],
                field_type="text",
                description="Faucet cartridge type"
            ),
            
            # Installation and mounting details
            FieldMapping(
                canonical_name="installation_type",
                salesforce_names=["Installation", "Installation_Type", "Mount"],
                krowne_names=["installation", "installationType", "mount"],
                krowne_cms_names=["Installation", "Installation_Type"],
                field_type="text",
                description="Installation method or type"
            ),
            
            FieldMapping(
                canonical_name="deck_thickness",
                salesforce_names=["Deck_Thickness", "Maximum_Deck_Thickness"],
                krowne_names=["deckThickness", "maxDeckThickness"],
                krowne_cms_names=["Deck_Thickness", "Maximum_Deck_Thickness"],
                field_type="text",
                description="Recommended deck thickness for installation"
            ),
            
            # Bar and beverage equipment
            FieldMapping(
                canonical_name="cooling_capacity",
                salesforce_names=["Cooling_Capacity", "Cooling_BTU"],
                krowne_names=["coolingCapacity", "coolingBTU"],
                krowne_cms_names=["Cooling_Capacity", "Cooling_BTU"],
                field_type="number",
                description="Cooling capacity rating"
            ),
            
            FieldMapping(
                canonical_name="insulation_thickness",
                salesforce_names=["Insulation", "Insulation_Thickness"],
                krowne_names=["insulation", "insulationThickness"],
                krowne_cms_names=["Insulation", "Insulation_Thickness"],
                field_type="text",
                description="Insulation thickness specification"
            ),
            
            # Hardware and accessories
            FieldMapping(
                canonical_name="hardware_included",
                salesforce_names=["Hardware", "Hardware_Included", "Mounting_Hardware"],
                krowne_names=["hardware", "hardwareIncluded", "mountingHardware"],
                krowne_cms_names=["Hardware", "Hardware_Included", "Mounting_Hardware"],
                field_type="text",
                description="Hardware included with product"
            ),
            
            FieldMapping(
                canonical_name="accessories",
                salesforce_names=["Accessories", "Optional_Accessories"],
                krowne_names=["accessories", "optionalAccessories"],
                krowne_cms_names=["Accessories", "Optional_Accessories"],
                field_type="text",
                description="Available accessories"
            ),
            
            # Performance specifications
            FieldMapping(
                canonical_name="temperature_rating",
                salesforce_names=["Temperature_Rating", "Max_Temperature"],
                krowne_names=["temperatureRating", "maxTemperature", "tempRating"],
                krowne_cms_names=["Temperature_Rating", "Max_Temperature"],
                field_type="text",
                description="Maximum temperature rating"
            ),
            
            FieldMapping(
                canonical_name="pressure_rating",
                salesforce_names=["Pressure_Rating", "Max_Pressure", "Working_Pressure"],
                krowne_names=["pressureRating", "maxPressure", "workingPressure"],
                krowne_cms_names=["Pressure_Rating", "Max_Pressure", "Working_Pressure"],
                field_type="text",
                description="Maximum pressure rating"
            ),
            
            # Dimensions - more specific
            FieldMapping(
                canonical_name="spout_height",
                salesforce_names=["Spout_Height", "Spout_Height_(in.)"],
                krowne_names=["spoutHeight", "spoutHeightIn"],
                krowne_cms_names=["Spout_Height", "Spout_Height_(in.)"],
                field_type="number",
                description="Spout height in inches"
            ),
            
            FieldMapping(
                canonical_name="spout_reach",
                salesforce_names=["Spout_Reach", "Spout_Reach_(in.)"],
                krowne_names=["spoutReach", "spoutReachIn"],
                krowne_cms_names=["Spout_Reach", "Spout_Reach_(in.)"],
                field_type="number",
                description="Spout reach in inches"
            ),
            
            # Model and part variations
            FieldMapping(
                canonical_name="model_number",
                salesforce_names=["Model", "Model_Number", "Model_No"],
                krowne_names=["model", "modelNumber", "modelNo"],
                krowne_cms_names=["Model", "Model_Number"],
                field_type="text",
                description="Manufacturer model number"
            ),
            
            FieldMapping(
                canonical_name="part_number",
                salesforce_names=["Part_Number", "Part_No", "Mfg_Part_Number"],
                krowne_names=["partNumber", "partNo", "mfgPartNumber"],
                krowne_cms_names=["Part_Number", "Mfg_Part_Number"],
                field_type="text",
                description="Manufacturer part number"
            ),
            
            # Additional certifications commonly missed
            FieldMapping(
                canonical_name="lead_free",
                salesforce_names=["Lead_Free", "Lead_Free_Compliant"],
                krowne_names=["leadFree", "leadFreeCompliant"],
                krowne_cms_names=["Lead_Free", "Lead_Free_Compliant"],
                field_type="boolean",
                description="Lead-free compliance status"
            ),
            
            FieldMapping(
                canonical_name="ada_compliant",
                salesforce_names=["ADA", "ADA_Compliant", "ADA_Compliance"],
                krowne_names=["ada", "adaCompliant", "adaCompliance"],
                krowne_cms_names=["ADA", "ADA_Compliant"],
                field_type="boolean",
                description="ADA compliance status"
            ),
            
            # Color and finish options
            FieldMapping(
                canonical_name="color_options",
                salesforce_names=["Colors", "Color_Options", "Available_Colors"],
                krowne_names=["colors", "colorOptions", "availableColors"],
                krowne_cms_names=["Colors", "Color_Options"],
                field_type="list",
                description="Available color options"
            ),
            
            FieldMapping(
                canonical_name="finish_options",
                salesforce_names=["Finishes", "Finish_Options", "Available_Finishes"],
                krowne_names=["finishes", "finishOptions", "availableFinishes"],
                krowne_cms_names=["Finishes", "Finish_Options"],
                field_type="list",
                description="Available finish options"
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
        
        # Check properties array (if exists) - this handles Krowne CMS property mappings
        properties = krowne_data.get('properties', [])
        if isinstance(properties, list):
            for prop in properties:
                prop_admin_name = prop.get('propertyAdminName', '')
                prop_name = prop.get('propertyName', '')
                prop_value = prop.get('value', '')
                
                # Check against krowne_names first
                for krowne_name in mapping.krowne_names:
                    if (prop_admin_name == krowne_name or prop_name == krowne_name or
                        prop_admin_name == krowne_name.replace(' ', '_') or
                        prop_name == krowne_name.replace('_', ' ')):
                        return prop_value
                
                # Check against Krowne CMS names
                for cms_name in mapping.krowne_cms_names:
                    if (prop_admin_name == cms_name or prop_name == cms_name or
                        prop_admin_name == cms_name.replace(' ', '_') or
                        prop_name == cms_name.replace('_', ' ') or
                        prop_admin_name == cms_name.replace('(', '').replace(')', '') or
                        prop_name == cms_name.replace('(', '').replace(')', '')):
                        return prop_value
        
        return None
    
    def extract_krowne_cms_value(self, krowne_data: Dict[str, Any], field_name: str) -> Optional[Any]:
        """Extract a value specifically using Krowne CMS property mappings"""
        if not krowne_data:
            return None
            
        mapping = self.field_mappings.get(field_name)
        if not mapping:
            return None
            
        # Focus on properties array for CMS mappings
        properties = krowne_data.get('properties', [])
        if isinstance(properties, list):
            for prop in properties:
                prop_admin_name = prop.get('propertyAdminName', '')
                prop_name = prop.get('propertyName', '')
                prop_value = prop.get('value', '')
                
                # Check against Krowne CMS names with various normalizations
                for cms_name in mapping.krowne_cms_names:
                    if self._property_name_matches(prop_admin_name, cms_name) or self._property_name_matches(prop_name, cms_name):
                        return prop_value
        
        return None
    
    def _property_name_matches(self, prop_name: str, target_name: str) -> bool:
        """Enhanced property name matching with more normalization patterns"""
        if not prop_name or not target_name:
            return False
            
        # Direct match
        if prop_name == target_name:
            return True
            
        # Case insensitive match
        if prop_name.lower() == target_name.lower():
            return True
        
        # Normalize both names more aggressively
        def normalize_name(name):
            """Comprehensive name normalization"""
            # Convert to lowercase
            normalized = name.lower()
            
            # Remove common suffixes/prefixes that don't affect meaning
            normalized = re.sub(r'\s*(in\.|ft\.|lbs\.|gpm|hp)\s*$', '', normalized)
            normalized = re.sub(r'^\s*product_?', '', normalized)
            
            # Remove all punctuation, parentheses, and special characters
            normalized = re.sub(r'[()._\-\s]+', '', normalized)
            
            # Handle common abbreviations
            abbreviation_map = {
                'temp': 'temperature',
                'qty': 'quantity', 
                'desc': 'description',
                'spec': 'specification',
                'mfg': 'manufacturer',
                'wt': 'weight',
                'ht': 'height',
                'len': 'length',
                'dia': 'diameter'
            }
            
            for abbrev, full in abbreviation_map.items():
                if abbrev in normalized:
                    normalized = normalized.replace(abbrev, full)
                    
            return normalized
        
        normalized_prop = normalize_name(prop_name)
        normalized_target = normalize_name(target_name)
        
        if normalized_prop == normalized_target:
            return True
        
        # Check if one contains the other (for partial matches)
        if len(normalized_prop) > 3 and len(normalized_target) > 3:
            if normalized_prop in normalized_target or normalized_target in normalized_prop:
                return True
        
        # Check common field name patterns
        patterns_to_check = [
            # Remove units and try again
            (re.sub(r'(inches?|lbs?|pounds?|gallons?|gpm|btu)', '', normalized_prop),
            re.sub(r'(inches?|lbs?|pounds?|gallons?|gpm|btu)', '', normalized_target)),
            
            # Try with/without 'product' prefix
            (normalized_prop.replace('product', ''), normalized_target.replace('product', '')),
            
            # Try singular/plural variations
            (normalized_prop.rstrip('s'), normalized_target.rstrip('s')),
        ]
        
        for pattern1, pattern2 in patterns_to_check:
            if pattern1 and pattern2 and pattern1 == pattern2:
                return True
                
        return False
    
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

    def get_mapping_info(self, canonical_name: str) -> Optional[FieldMapping]:
        """Get complete mapping information for a field"""
        return self.field_mappings.get(canonical_name)
    
    def log_field_extraction_debug(self, data: Dict[str, Any], source_name: str):
        """Debug helper to log all available fields in a data structure"""
        logger.info(f"=== {source_name} Data Structure Debug ===")
        logger.info(f"Top-level keys: {list(data.keys()) if data else 'None'}")
        
        if data and 'properties' in data:
            properties = data.get('properties', [])
            if isinstance(properties, list):
                logger.info(f"Properties array length: {len(properties)}")
                for i, prop in enumerate(properties[:10]):  # Log first 10 properties
                    prop_name = prop.get('propertyName', 'N/A')
                    prop_admin_name = prop.get('propertyAdminName', 'N/A')
                    prop_value = prop.get('value', 'N/A')
                    logger.info(f"  Property {i}: name='{prop_name}', admin_name='{prop_admin_name}', value='{prop_value}'")
                if len(properties) > 10:
                    logger.info(f"  ... and {len(properties) - 10} more properties")


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

def get_enhanced_product_comparison(salesforce_data: Dict[str, Any], krowne_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Enhanced comparison function that returns detailed analysis
    """
    mapper = ProductMapper()
    comparison_results = mapper.compare_products(salesforce_data, krowne_data)
    
    # Categorize results
    matches = [r for r in comparison_results if r.is_match and (r.salesforce_value is not None or r.krowne_value is not None)]
    mismatches = [r for r in comparison_results if r.is_mismatch]
    partial_data = [r for r in comparison_results if r.has_partial_data]
    no_data = [r for r in comparison_results if r.salesforce_value is None and r.krowne_value is None]
    
    return {
        'summary': {
            'total_fields': len(comparison_results),
            'matches': len(matches),
            'mismatches': len(mismatches),
            'partial_data': len(partial_data),
            'no_data': len(no_data),
            'completion_percentage': round((len(matches) + len(mismatches)) / len(comparison_results) * 100, 1) if comparison_results else 0
        },
        'matches': matches,
        'mismatches': mismatches,
        'partial_data': partial_data,
        'no_data': no_data,
        'comparison_results': comparison_results
    }