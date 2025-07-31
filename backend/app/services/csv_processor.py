import pandas as pd
import numpy as np
import logging

logger = logging.getLogger(__name__)

class CSVProcessor:
    def __init__(self):
        self.required_columns = ['SKU', 'Family', 'Product_Description', 'List_Price']  # Primary required columns
        
        # Define columns that should be treated as arrays (comma-separated values)
        self.array_columns = [
            'Parent_Products',
            'Parts_&_Accessories',
            'Related_Products',
            'Beverage_Lines',
            'Images',
            'Videos',
            'Perforated_Inserts',
            'Includes',
            'Top_Finish_Options',
            'DoorDrawer_Finish_Options',
            'Beverage_Compatibility_Options',
            'Features'
        ]
        
        self.all_columns = [
            'SKU', 'Family', 'Products_Available_to_Serve', 'Shipping_Dimensions', 'Case_Dimensions_(in.)',
            'Product_Length_(in.)', 'Product_Weight_(lbs.)', 'List_Price', 'MAP_Price', 'UPC', 'HTS_Code',
            'Flow_Rate_(GPM)', 'Pallet_Quantity', 'Case_Quantity', 'Case_Price', 'Case_Weight_(lbs.)',
            'Number_of_Taps', 'Glycol_Lines', 'Ice_Capacity_(lbs.)', 'BTUhr_(K)', 'Interior_Diameter_(in.)',
            'Shipping_Weight_(lbs.)', 'Working_Height_(in.)', 'Trunk_Line_Length_(in.)', 'Height_of_Ceiling_(in.)',
            'Diameter_(in.)', 'Caster_Quantity', 'Mug_Capacity', 'Wheel_Diameter_(in.)', 'Spray_Head_Flow_Rate_(GPM)',
            'Hose_Length_(in.)', 'Hose_Length_(ft.)', 'Gallon_Capacity', 'Beverage_Line_Diameter_(in.)',
            'Chase_Diameter_(in.)', 'Glycol_Line_Diameter_(in.)', 'Hertz_(Hz.)', 'Massachusetts_Listed_Certification',
            'CEC_Listed_Certification', 'ADA_Compliance', 'Freight_Class', 'Country_of_Origin', 'Production_Code',
            'Product_Status', 'Compressor_Location', 'Top_Finish_Options', 'Cold_Plate', 'Handle_Type', 'Spout_Style',
            'Brakes', 'Inlet', 'Bottle_Capacity', 'Refrigerant', 'Spout_Size_(in.)', 'Thread', 'Pumps',
            'Gas_System_Compatibility', 'Wrap_Style', 'Restock_Fee', 'Din_Cables', 'Spray_Head_Pattern', 'Type',
            'Heat_Recovery', 'Stream_Type', 'Cabinet_Side_Finish', 'Front_Finish', 'Division', 'Visibility',
            'NSF_Certification', 'CSA_Certification', 'UL_Certification', 'ETL_Certification', 'ASSE_Certification',
            'IAMPO_Certification', 'Series', 'Warranty', 'DoorDrawer_Finish_Options', 'Mounting_Style', 'Tower_Style',
            'Underbar_Structure_Options', 'Bowl_Location', 'Centers', 'DoorDrawer_Style', 'Drain_Size', 'Outlet',
            'Beverage_Compatibility_Options', 'Tower_Location', 'Tower_Finish', 'HP', 'Tower_Mounting',
            'Ice_Bin_Location', 'Power_Source', 'Voltage', 'Drain_Location', 'PSI_Range', 'Valve_Type', 'Plug_Type',
            'Collaboration', 'Product_Height_(in.)', 'Features', 'Product_Description', 'ERP_Description',
            'Materials', 'Finish', 'Product_Depth_(in.)', 'Operating_Range', 'Raises_Equipment', 'Temperature_Range',
            'AQ_Description', 'Design_Upgrades', 'FAQs', 'IssuesSolutions', 'Upsell_Items', 'Parent_Products',
            'Parts_&_Accessories', 'Beverage_Lines', 'Images', 'Videos', 'Spec_Sheet', 'Manuals', 'Sell_Sheet',
            'Brochure', 'Backsplash_Height_(in.)', 'Bowl_Size_(in.)', 'Perforated_Inserts', 'Related_Products',
            'Includes', 'Amps', 'Compressor_Size_(in.)', 'Phase', 'PartsByKrowne', 'Load_Capacity_(lbs._per_caster)',
            'Plate_Size_(in.)', 'Caster_Overall_Height_(in.)', 'Keg_Capacity', 'Product_Weight', 'Drain_Outlet',
            'Product_Width_(in.)', 'California_Prop_Warning', 'Website_Link', 'Product_Height_Without_Legs_(in)',
            'INTERNAL_ONLY_PRODUCT', 'COO'
        ]
    
    def process_file(self, filepath):
        """Process CSV file and return standardized product data"""
        try:
            # Read CSV with different encodings fallback
            df = self._read_csv_safe(filepath)
            
            # Validate required columns and handle extra columns
            df = self._validate_columns(df)
            
            # Clean and standardize data
            df = self._clean_data(df)
            
            # Convert numeric NaN to None and clean up the DataFrame
            df = df.replace({pd.NA: None})  # Replace pandas NA
            df = df.where(pd.notna(df), None)  # Replace NaN with None
            
            # Convert to dictionary records and clean any remaining NaN values
            products = []
            for record in df.to_dict('records'):
                cleaned_record = {}
                for key, value in record.items():
                    # Handle any remaining NaN or numpy.nan values
                    if pd.isna(value) or str(value).lower() == 'nan':
                        cleaned_record[key] = None
                    else:
                        cleaned_record[key] = value
                products.append(cleaned_record)
            
            logger.info(f"Processed {len(products)} products from CSV")
            return products
            
        except Exception as e:
            logger.error(f"Error processing CSV file: {str(e)}")
            raise
    
    def _read_csv_safe(self, filepath):
        """Attempt to read CSV with different encodings. Handles both headerless files and files with headers."""
        encodings = ['utf-8', 'latin-1', 'cp1252', 'iso-8859-1']
        
        for encoding in encodings:
            try:
                # First try reading with headers
                df = pd.read_csv(filepath, encoding=encoding)
                
                # Check if the first row contains recognizable column names
                first_row_cols = set(df.columns.str.strip())
                known_cols = set(self.all_columns)
                
                # If less than 2 known columns are found, assume it's headerless
                if len(first_row_cols.intersection(known_cols)) < 2:
                    df = pd.read_csv(filepath, encoding=encoding, header=None, names=self.all_columns)
                    logger.info(f"Successfully read headerless CSV with {encoding} encoding")
                else:
                    logger.info(f"Successfully read CSV with headers using {encoding} encoding")
                
                return df
                
            except UnicodeDecodeError:
                continue
            except pd.errors.ParserError as e:
                logger.error(f"Error parsing CSV: {str(e)}")
                raise ValueError(f"Error parsing CSV file: {str(e)}")
        
        raise ValueError("Unable to read CSV file with any supported encoding")
    
    def _validate_columns(self, df):
        """Validate that required columns are present and handle extra columns"""
        # Standardize column names by stripping whitespace
        df.columns = df.columns.str.strip()
        
        # Get the current columns
        df_columns = set(df.columns)
        known_columns = set(self.all_columns)
        
        # Check for missing required columns
        missing_required = [col for col in self.required_columns if col not in df_columns]
        if missing_required:
            raise ValueError(f"Missing required columns: {', '.join(missing_required)}")
        
        # Identify extra columns
        extra_columns = df_columns - known_columns
        if extra_columns:
            logger.warning(f"Dropping extra columns: {', '.join(extra_columns)}")
            df.drop(columns=list(extra_columns), inplace=True)
        
        # Reorder columns to match all_columns order (only for columns that exist)
        ordered_cols = [col for col in self.all_columns if col in df.columns]
        df = df.reindex(columns=ordered_cols)
        
        return df
    
    def _clean_data(self, df):
        """Clean and standardize the data"""
        # Drop empty rows
        df = df.dropna(how='all')
        
        # Remove rows with missing SKU
        df = df.dropna(subset=['SKU'])
        
        # Convert SKU to string and clean it
        df['SKU'] = df['SKU'].astype(str).str.strip()
        df['SKU'] = df['SKU'].replace('nan', '')
        
        # Clean numeric fields
        numeric_columns = [
            'List_Price', 'MAP_Price', 'Product_Weight_(lbs.)', 'Case_Weight_(lbs.)',
            'Product_Length_(in.)', 'Product_Width_(in.)', 'Product_Height_(in.)',
            'Product_Height_Without_Legs_(in)', 'Flow_Rate_(GPM)', 'Pallet_Quantity',
            'Case_Quantity', 'Case_Price', 'Number_of_Taps', 'Ice_Capacity_(lbs.)',
            'BTUhr_(K)', 'Interior_Diameter_(in.)', 'Shipping_Weight_(lbs.)',
            'Working_Height_(in.)', 'Trunk_Line_Length_(in.)', 'Height_of_Ceiling_(in.)',
            'Diameter_(in.)', 'Caster_Quantity', 'Wheel_Diameter_(in.)',
            'Spray_Head_Flow_Rate_(GPM)', 'Hose_Length_(in.)', 'Hose_Length_(ft.)',
            'Gallon_Capacity', 'Hertz_(Hz.)', 'Spout_Size_(in.)', 'HP'
        ]
        
        # Define special handling for numeric values
        def clean_numeric(val):
            if pd.isna(val) or str(val).strip().lower() in ['', 'nan', 'none', 'null']:
                return None
            try:
                # Remove currency symbols and other non-numeric characters
                cleaned = str(val).replace('$', '').replace(',', '').replace(' ', '')
                return float(cleaned) if cleaned else None
            except (ValueError, TypeError):
                return None
        
        for col in numeric_columns:
            if col in df.columns:
                # Apply the clean_numeric function
                df[col] = df[col].apply(clean_numeric)
        
        # Handle text fields
        text_columns = [col for col in df.columns if col not in numeric_columns]
        for col in text_columns:
            if col in self.array_columns:
                # Handle array columns
                df[col] = df[col].apply(self._process_array_field)
            else:
                # Handle regular text columns
                df[col] = df[col].astype(str).str.strip()
                # Replace 'nan', 'NaN', 'none', 'None' with empty string
                df[col] = df[col].replace(['nan', 'NaN', 'none', 'None', 'NULL'], '')
                # If the field is empty or just whitespace, set to empty string
                df[col] = df[col].replace(r'^\s*$', '', regex=True)
        
        # Remove duplicate SKUs, keeping the first occurrence
        df = df.drop_duplicates(subset=['SKU'], keep='first')
        
        return df
        df['product_id'] = df['product_id'].astype(str).str.strip()
        
        # Clean text columns
        text_columns = ['name', 'description']
        for col in text_columns:
            if col in df.columns:
                df[col] = df[col].astype(str).str.strip()
                df[col] = df[col].replace('nan', '')
        
        # Clean price column
        if 'price' in df.columns:
            df['price'] = self._clean_price_column(df['price'])
        
        # Remove duplicates
        df = df.drop_duplicates(subset=['product_id'])
        
        return df
    
    def _process_array_field(self, value):
        """Process a field that should be an array of values"""
        if pd.isna(value) or str(value).strip().lower() in ['', 'nan', 'none', 'null']:
            return []
            
        # Convert to string and clean
        value_str = str(value).strip()
        
        # If the value is already looking like a JSON array, try to parse it
        if value_str.startswith('[') and value_str.endswith(']'):
            try:
                import json
                return json.loads(value_str)
            except json.JSONDecodeError:
                pass
        
        # Split by common delimiters and clean each item
        items = []
        # First try splitting by comma
        split_items = value_str.split(',')
        
        # If no comma found, try splitting by semicolon or pipe
        if len(split_items) == 1:
            if ';' in value_str:
                split_items = value_str.split(';')
            elif '|' in value_str:
                split_items = value_str.split('|')
        
        # Clean each item
        for item in split_items:
            cleaned_item = item.strip()
            if cleaned_item and cleaned_item.lower() not in ['nan', 'none', 'null']:
                items.append(cleaned_item)
                
        return items

    def _clean_price_column(self, price_series):
        """Clean and standardize price data"""
        # Remove currency symbols and clean price
        cleaned_prices = []
        
        for price in price_series:
            try:
                # Convert to string and remove common currency symbols
                price_str = str(price).strip()
                price_str = price_str.replace('$', '').replace('€', '').replace('£', '')
                price_str = price_str.replace(',', '').replace(' ', '')
                
                # Convert to float
                if price_str and price_str != 'nan':
                    cleaned_price = float(price_str)
                else:
                    cleaned_price = 0.0
                    
                cleaned_prices.append(cleaned_price)
                
            except (ValueError, TypeError):
                cleaned_prices.append(0.0)
        
        return cleaned_prices