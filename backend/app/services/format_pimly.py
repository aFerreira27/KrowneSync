import json
from typing import Dict, List, Any, Union


def format_pimly_data(raw_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Format raw product JSON data into organized categories.
    Removes all 'N/A' values globally (recursive) and formats certifications.
    """

    def get_property_value(admin_name: str) -> Any:
        for prop in raw_data.get('properties', []):
            if prop.get('propertyAdminName') == admin_name:
                return prop.get('value')
        return None

    def get_property_values(admin_names: List[str]) -> Dict[str, Any]:
        result = {}
        for admin_name in admin_names:
            value = get_property_value(admin_name)
            if value is not None:
                readable_name = admin_name.replace('_', ' ').replace('(', ' (').strip()
                result[readable_name] = value
        return result

    def clean_na_recursive(obj: Any) -> Any:
        """
        Recursively remove any 'N/A' values from dicts/lists.
        - Strings that are 'N/A' (case-insensitive) are removed.
        - Empty dicts/lists after cleaning are removed.
        """
        if isinstance(obj, dict):
            cleaned = {
                k: clean_na_recursive(v)
                for k, v in obj.items()
                if not (isinstance(v, str) and v.strip().lower() == 'n/a')
            }
            return {k: v for k, v in cleaned.items() if v not in (None, {}, [], '')}
        elif isinstance(obj, list):
            cleaned = [
                clean_na_recursive(v)
                for v in obj
                if not (isinstance(v, str) and v.strip().lower() == 'n/a')
            ]
            return [v for v in cleaned if v not in (None, {}, [], '')]
        else:
            return obj

    # Basic info
    name = get_property_value('Product_Description')
    admin_name = raw_data.get('adminName', '')
    series = get_property_value('Series') or ''
    list_price = get_property_value('List_Price')
    features_value = get_property_value('Features') or ''

    # Specifications
    spec_fields = [
        'Product_Length_(in.)', 'Product_Width_(in.)', 'Product_Height_(in.)',
        'Product_Depth_(in.)', 'Product_Weight_(lbs.)', 'Product_Height_Without_Legs_(in)',
        'Shipping_Weight_(lbs.)', 'Working_Height_(in.)', 'Flow_Rate_(GPM)',
        'Spray_Head_Flow_Rate_(GPM)', 'Temperature_Range', 'Operating_Range', 'PSI_Range',
        'BTUhr_(K)', 'Ice_Capacity_(lbs.)', 'Gallon_Capacity', 'Mug_Capacity',
        'Bottle_Capacity', 'Keg_Capacity', 'Load_Capacity_(lbs._per_caster)',
        'Mounting_Style', 'Handle_Type', 'Spout_Style', 'Spout_Size_(in.)', 'Valve_Type',
        'Inlet', 'Outlet_Type', 'Drain_Size', 'Drain_Location', 'Drain_Outlet', 'Thread',
        'Plug_Type', 'Power_Source', 'Voltage', 'Amps', 'Phase', 'Hertz_(Hz.)', 'HP',
        'Compressor_Size_(in.)', 'Compressor_Location', 'Refrigerant',
        'Number_of_Taps', 'Glycol_Lines', 'Beverage_Lines', 'Caster_Quantity',
        'Interior_Diameter_(in.)', 'Diameter_(in.)', 'Bowl_Size_(in.)', 'Plate_Size_(in.)',
        'Wheel_Diameter_(in.)', 'Trunk_Line_Length_(in.)', 'Height_of_Ceiling_(in.)',
        'Hose_Length_(in.)', 'Hose_Length_(ft.)', 'Backsplash_Height_(in.)',
        'Caster_Overall_Height_(in.)', 'Beverage_Line_Diameter_(in.)',
        'Chase_Diameter_(in.)', 'Glycol_Line_Diameter_(in.)', 'Tower_Style',
        'Tower_Location', 'Tower_Finish', 'Tower_Mounting', 'Wrap_Style',
        'Cabinet_Side_Finish', 'Front_Finish', 'DoorDrawer_Finish_Options',
        'Top_Finish_Options', 'DoorDrawer_Style', 'Underbar_Structure_Options',
        'Materials', 'Finish', 'Design_Upgrades', 'Bowl_Location', 'Centers',
        'Ice_Bin_Location', 'Gas_System_Compatibility', 'Beverage_Compatibility_Options',
        'Brakes', 'Cold_Plate', 'Heat_Recovery', 'Perforated_Inserts', 'Pumps',
        'Stream_Type', 'Type', 'Spray_Head_Pattern', 'Visibility', 'Raises_Equipment',
        'Din_Cables'
    ]
    specifications = get_property_values(spec_fields)

    # Certifications
    cert_fields = [
        'ASSE_Certification', 'CSA_Certification', 'ETL_Certification',
        'NSF_Certification', 'UL_Certification', 'ADA_Compliance',
        'CEC_Listed_Certification', 'Massachusetts_Listed_Certification',
        'IAMPO_Certification'
    ]
    certifications_raw = get_property_values(cert_fields)
    cleaned_certifications = {}
    for k, v in certifications_raw.items():
        if isinstance(v, str) and v.strip().lower() == 'n/a':
            continue
        if v is True:
            cleaned_certifications[k] = 'Yes'
        elif v is False:
            cleaned_certifications[k] = 'No'
        else:
            cleaned_certifications[k] = v

    # Links & assets
    links = {}
    asset_links = {}
    for asset_group in raw_data.get('digitalAssets', []):
        property_name = asset_group.get('propertyName', '')
        assets = asset_group.get('assets', [])
        if assets:
            if len(assets) == 1:
                asset_links[property_name] = assets[0].get('url', '')
            else:
                asset_links[property_name] = [a.get('url', '') for a in assets]
    if asset_links:
        links['Assets'] = asset_links
    main_asset = raw_data.get('mainAsset', {})
    if main_asset.get('pimly__URL__c'):
        links['Main Image'] = main_asset['pimly__URL__c']

    # Related products
    relatedProducts = {}
    for related_group in raw_data.get('relatedProducts', []):
        group_name = related_group.get('propertyName', '')
        products = related_group.get('products', [])
        if products:
            relatedProducts[group_name] = [
                {
                    'name': p.get('name', ''),
                    'admin_name': p.get('adminName', ''),
                    'image_url': p.get('mainImageUrl', ''),
                    'pimly_id': p.get('pimlyId', '')
                }
                for p in products
            ]

    # Miscellaneous
    misc_fields = [
        'SKU', 'UPC', 'HTS_Code', 'Production_Code', 'Product_Status',
        'MAP_Price', 'Case_Price', 'Restock_Fee', 'Case_Weight_(lbs.)',
        'Case_Dimensions_(in.)', 'Shipping_Dimensions', 'Freight_Class',
        'Pallet_Quantity', 'Case_Quantity', 'Division', 'Family',
        'Country_of_Origin', 'INTERNAL_ONLY_PRODUCT', 'COO', 'Collaboration',
        'AQ_Description', 'FAQs', 'IssuesSolutions', 'Website_Link'
    ]
    misc = get_property_values(misc_fields)

    if (family_info := raw_data.get('family', {})).get('Name'):
        misc['Family'] = family_info['Name']
    if (parent_info := raw_data.get('parent', {})).get('Name'):
        misc['Parent Product'] = parent_info['Name']
    if categories := raw_data.get('categories', []):
        cat_names = [c.get('Name', '') for c in categories if c.get('Name')]
        if cat_names:
            misc['Categories'] = cat_names

    # Final structure
    formatted_data = {
        'Name': name,
        'SKU': admin_name,
        'Series': series,
        'List Price': list_price,
        'Features': features_value,
        'Specifications': specifications,
        'Certifications': cleaned_certifications,
        'Warranty': get_property_value('Warranty'),
        'Links': links,
        'Related Products': relatedProducts.get('Related Products', []),
        'Parts & Accessories': relatedProducts.get('Parts & Accessories', []),
        'Miscellaneous': misc
    }

    # Recursively remove N/A and empty sections
    return clean_na_recursive(formatted_data)