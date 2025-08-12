import json
from typing import Dict, List, Any, Union

def format_pimly_data(raw_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Format raw product JSON data into organized categories.
    
    Args:
        raw_data: The raw product data dictionary
        
    Returns:
        Formatted dictionary with organized product information
    """
    
    # Helper function to extract property value by admin name
    def get_property_value(admin_name: str) -> Any:
        for prop in raw_data.get('properties', []):
            if prop.get('propertyAdminName') == admin_name:
                return prop.get('value')
        return None
    
    # Helper function to extract multiple property values
    def get_property_values(admin_names: List[str]) -> Dict[str, Any]:
        result = {}
        for admin_name in admin_names:
            value = get_property_value(admin_name)
            if value is not None:
                # Convert admin name to readable format
                readable_name = admin_name.replace('_', ' ').replace('(', ' (').strip()
                result[readable_name] = value
        return result
    
    # Helper function to clean up field names
    def clean_field_name(field_name: str) -> str:
        return field_name.replace('_', ' ').replace('(', ' (').replace('  ', ' ').strip()
    
    # Extract basic information
    name = get_property_value('Product_Description')
    admin_name = raw_data.get('adminName', '')
    
    # Extract series
    series = get_property_value('Series') or ''
    list_price = get_property_value('List_Price')
    # Extract features
    features_value = get_property_value('Features')
    features = features_value if features_value else ''
    
    # Product description and ERP description could also be considered features
    product_desc = get_property_value('Product_Description')
    erp_desc = get_property_value('ERP_Description')
    
    # Build comprehensive features section
    features_dict = {}
    if features:
        features_dict['Features'] = features
    if product_desc and product_desc != features:
        features_dict['Product Description'] = product_desc
    if erp_desc and erp_desc != product_desc and erp_desc != features:
        features_dict['ERP Description'] = erp_desc
    
    # Extract specifications (physical, performance, and technical specs)
    spec_fields = [
        # Physical Dimensions
        'Product_Length_(in.)',
        'Product_Width_(in.)',
        'Product_Height_(in.)',
        'Product_Depth_(in.)',
        'Product_Weight_(lbs.)',
        'Product_Height_Without_Legs_(in)',
        'Shipping_Weight_(lbs.)',
        'Working_Height_(in.)',
        
        # Performance Specs
        'Flow_Rate_(GPM)',
        'Spray_Head_Flow_Rate_(GPM)',
        'Temperature_Range',
        'Operating_Range',
        'PSI_Range',
        'BTUhr_(K)',
        'Ice_Capacity_(lbs.)',
        'Gallon_Capacity',
        'Mug_Capacity',
        'Bottle_Capacity',
        'Keg_Capacity',
        'Load_Capacity_(lbs._per_caster)',
        
        # Technical Specs
        'Mounting_Style',
        'Handle_Type',
        'Spout_Style',
        'Spout_Size_(in.)',
        'Valve_Type',
        'Inlet',
        'Outlet',
        'Drain_Size',
        'Drain_Location',
        'Drain_Outlet',
        'Thread',
        'Plug_Type',
        'Power_Source',
        'Voltage',
        'Amps',
        'Phase',
        'Hertz_(Hz.)',
        'HP',
        'Compressor_Size_(in.)',
        'Compressor_Location',
        'Refrigerant',
        
        # Capacity and Quantity
        'Number_of_Taps',
        'Glycol_Lines',
        'Beverage_Lines',
        'Caster_Quantity',

        
        # Dimensions and Sizes
        'Interior_Diameter_(in.)',
        'Diameter_(in.)',
        'Bowl_Size_(in.)',
        'Plate_Size_(in.)',
        'Wheel_Diameter_(in.)',
        'Trunk_Line_Length_(in.)',
        'Height_of_Ceiling_(in.)',
        'Hose_Length_(in.)',
        'Hose_Length_(ft.)',
        'Backsplash_Height_(in.)',
        'Caster_Overall_Height_(in.)',
        'Beverage_Line_Diameter_(in.)',
        'Chase_Diameter_(in.)',
        'Glycol_Line_Diameter_(in.)',
        
        # Style and Design
        'Tower_Style',
        'Tower_Location',
        'Tower_Finish',
        'Tower_Mounting',
        'Wrap_Style',
        'Cabinet_Side_Finish',
        'Front_Finish',
        'DoorDrawer_Finish_Options',
        'Top_Finish_Options',
        'DoorDrawer_Style',
        'Underbar_Structure_Options',
        'Materials',
        'Finish',
        'Design_Upgrades',
        
        # Location and Configuration
        'Bowl_Location',
        'Centers',
        'Ice_Bin_Location',
        
        # Compatibility and Features
        'Gas_System_Compatibility',
        'Beverage_Compatibility_Options',
        'Brakes',
        'Cold_Plate',
        'Heat_Recovery',
        'Perforated_Inserts',
        'Pumps',
        'Stream_Type',
        'Type',
        'Spray_Head_Pattern',
        'Visibility',
        'Raises_Equipment',
        'Din_Cables'
    ]
    
    specifications = get_property_values(spec_fields)
    
    # Extract certifications
    cert_fields = [
        'ASSE_Certification',
        'CSA_Certification',
        'ETL_Certification',
        'NSF_Certification',
        'UL_Certification',
        'ADA_Compliance',
        'CEC_Listed_Certification',
        'Massachusetts_Listed_Certification',
        'IAMPO_Certification'
    ]
    
    certifications = get_property_values(cert_fields)
    # Remove N/A certifications and convert boolean certifications
    cleaned_certifications = {}
    for k, v in certifications.items():
        if v != 'N/A' and v is not None:
            if v is True:
                cleaned_certifications[k] = 'Yes'
            elif v is False:
                cleaned_certifications[k] = 'No'
            else:
                cleaned_certifications[k] = v
    
    # Extract links and assets
    links = {}

    # Digital assets
    asset_links = {}
    for asset_group in raw_data.get('digitalAssets', []):
        property_name = asset_group.get('propertyName', '')
        assets = asset_group.get('assets', [])
        if assets:
            if len(assets) == 1:
                asset_links[property_name] = assets[0].get('url', '')
            else:
                asset_links[property_name] = [asset.get('url', '') for asset in assets]
    
    if asset_links:
        links['Assets'] = asset_links
    
    # Main image
    main_asset = raw_data.get('mainAsset', {})
    if main_asset.get('pimly__URL__c'):
        links['Main Image'] = main_asset['pimly__URL__c']
    
    

    # Related products links
    relatedProducts = {}
    for related_group in raw_data.get('relatedProducts', []):
        group_name = related_group.get('propertyName', '')
        products = related_group.get('products', [])
        if products:
            product_info = []
            for product in products:
                product_info.append({
                    'name': product.get('name', ''),
                    'admin_name': product.get('adminName', ''),
                    'image_url': product.get('mainImageUrl', ''),
                    'pimly_id': product.get('pimlyId', '')
                })
            relatedProducts[group_name] = product_info

    # Extract miscellaneous information (pricing, shipping, codes, etc.)
    misc_fields = [
        # Product Identification
        'SKU',
        'UPC',
        'HTS_Code',
        'Production_Code',
        'Product_Status',
        
        # Pricing
        'MAP_Price',
        'Case_Price',
        'Restock_Fee',
        
        # Shipping and Packaging
        'Case_Weight_(lbs.)',
        'Case_Dimensions_(in.)',
        'Shipping_Dimensions',
        'Freight_Class',
        'Pallet_Quantity',
        'Case_Quantity',
        
        # Product Information
        'Division',
        'Family',
        'Country_of_Origin',
        
        # Internal/Special
        'INTERNAL_ONLY_PRODUCT',
        'COO',
        'Collaboration',
        
        # Additional Descriptions
        'AQ_Description',
        'FAQs',
        'IssuesSolutions'
        'Website_Link'
    ]
    
    misc = get_property_values(misc_fields)
    
    # Add family information if available
    family_info = raw_data.get('family', {})
    if family_info.get('Name'):
        misc['Family'] = family_info['Name']
    
    # Add parent information if available
    parent_info = raw_data.get('parent', {})
    if parent_info.get('Name'):
        misc['Parent Product'] = parent_info['Name']
    
    # Add categories if available
    categories = raw_data.get('categories', [])
    if categories:
        category_names = [cat.get('Name', '') for cat in categories if cat.get('Name')]
        if category_names:
            misc['Categories'] = category_names
    
    # Build the final formatted data structure
    formatted_data = {
        'Name': name,
        'SKU': admin_name,
        'Series': series,
        'List Price': list_price,
        'Features': features_dict if features_dict else features,
        'Specifications': specifications,
        'Certifications': cleaned_certifications,
        'Warranty': get_property_value('Warranty'),
        'Links': links,
        'Related Products': relatedProducts.get('Related Products', []),
        'Miscellaneous': misc
    }
    
    # Remove empty sections
    formatted_data = {k: v for k, v in formatted_data.items() if v}
    
    return formatted_data


def process_json_file(input_file_path: str, output_file_path: str = None) -> Dict[str, Any]:
    """
    Process a JSON file and format the product data.
    
    Args:
        input_file_path: Path to the input JSON file
        output_file_path: Optional path to save the formatted output
        
    Returns:
        Formatted product data dictionary
    """
    try:
        with open(input_file_path, 'r', encoding='utf-8') as file:
            raw_data = json.load(file)
        
        formatted_data = format_pimly_data(raw_data)
        
        if output_file_path:
            with open(output_file_path, 'w', encoding='utf-8') as file:
                json.dump(formatted_data, file, indent=2, ensure_ascii=False)
            print(f"Formatted data saved to: {output_file_path}")
        
        return formatted_data
        
    except FileNotFoundError:
        print(f"Error: File '{input_file_path}' not found.")
        return {}
    except json.JSONDecodeError as e:
        print(f"Error: Invalid JSON in file '{input_file_path}': {e}")
        return {}
    except Exception as e:
        print(f"Error processing file: {e}")
        return {}


def format_from_string(json_string: str) -> Dict[str, Any]:
    """
    Format product data from a JSON string.
    
    Args:
        json_string: JSON string containing raw product data
        
    Returns:
        Formatted product data dictionary
    """
    try:
        raw_data = json.loads(json_string)
        return format_pimly_data(raw_data)
    except json.JSONDecodeError as e:
        print(f"Error: Invalid JSON string: {e}")
        return {}
    except Exception as e:
        print(f"Error processing JSON string: {e}")
        return {}