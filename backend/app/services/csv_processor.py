import pandas as pd
import numpy as np
import logging
import os
from typing import List, Dict, Any, Optional, Callable
import json

logger = logging.getLogger(__name__)

class CSVProcessor:
    def __init__(self, config: Optional[Dict[str, Any]] = None):
        """
        Initialize CSV Processor with optional configuration
        
        Args:
            config: Configuration dictionary with processor settings
        """
        self.config = config or {}
        
        # Configure required columns from config or use defaults
        self.required_columns = self.config.get('required_columns', [
            'SKU', 'Family', 'Product_Description', 'List_Price'
        ])
        
        # Define columns that should be treated as arrays (comma-separated values)
        self.array_columns = self.config.get('array_columns', [
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
        ])
        
        # All possible columns in order
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
        
        # Configure chunking for large files
        self.chunk_size = self.config.get('chunk_size', None)
        
        # Configure validation settings
        self.validate_data = self.config.get('validate_data', True)
        self.allow_negative_prices = self.config.get('allow_negative_prices', False)
    
    def process_file(self, filepath: str, progress_callback: Optional[Callable[[str, int], None]] = None) -> List[Dict[str, Any]]:
        """
        Process CSV file and return standardized product data
        
        Args:
            filepath: Path to the CSV file
            progress_callback: Optional callback function for progress updates (message, percentage)
            
        Returns:
            List of product dictionaries
            
        Raises:
            FileNotFoundError: If the CSV file doesn't exist
            ValueError: If the CSV file is invalid or empty
            Exception: For other processing errors
        """
        try:
            # Check file existence
            if not os.path.exists(filepath):
                raise FileNotFoundError(f"CSV file not found: {filepath}")
            
            if progress_callback:
                progress_callback("Starting file processing", 0)
            
            # Read CSV with different encodings fallback
            df = self._read_csv_safe(filepath)
            
            if df.empty:
                logger.warning("CSV file is empty")
                return []
            
            if progress_callback:
                progress_callback("Data loaded successfully", 20)
            
            # Validate required columns and handle extra columns
            df = self._validate_columns(df)
            
            if progress_callback:
                progress_callback("Columns validated", 40)
            
            # Clean and standardize data
            df = self._clean_data(df)
            
            if progress_callback:
                progress_callback("Data cleaned", 60)
            
            # Validate data if enabled
            if self.validate_data:
                df = self._validate_business_rules(df)
            
            if progress_callback:
                progress_callback("Data validated", 80)
            
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
            
            if progress_callback:
                progress_callback("Processing complete", 100)
            
            logger.info(f"Successfully processed {len(products)} products from CSV")
            return products
            
        except FileNotFoundError as e:
            logger.error(f"File error: {str(e)}")
            raise
        except pd.errors.EmptyDataError:
            logger.error("CSV file is empty or has no valid data")
            raise ValueError("CSV file contains no data")
        except pd.errors.ParserError as e:
            logger.error(f"Error parsing CSV: {str(e)}")
            raise ValueError(f"Error parsing CSV file: {str(e)}")
        except Exception as e:
            logger.error(f"Unexpected error processing CSV file: {str(e)}")
            raise
    
    def _read_csv_safe(self, filepath: str) -> pd.DataFrame:
        """
        Attempt to read CSV with different encodings and handle chunking for large files
        
        Args:
            filepath: Path to the CSV file
            
        Returns:
            DataFrame with the CSV data
            
        Raises:
            ValueError: If unable to read the file with any encoding
        """
        encodings = ['utf-8', 'latin-1', 'cp1252', 'iso-8859-1']
        
        for encoding in encodings:
            try:
                if self.chunk_size:
                    # Handle large files in chunks
                    chunks = []
                    try:
                        # First try reading with headers
                        chunk_iter = pd.read_csv(filepath, encoding=encoding, chunksize=self.chunk_size)
                        first_chunk = next(chunk_iter)
                        
                        # Check if the first row contains recognizable column names
                        first_row_cols = set(first_chunk.columns.str.strip())
                        known_cols = set(self.all_columns)
                        
                        if len(first_row_cols.intersection(known_cols)) < 2:
                            # Headerless file - re-read with column names
                            chunk_iter = pd.read_csv(
                                filepath, encoding=encoding, chunksize=self.chunk_size,
                                header=None, names=self.all_columns
                            )
                            logger.info(f"Reading headerless CSV in chunks with {encoding} encoding")
                        else:
                            # Add the first chunk back
                            chunks.append(first_chunk)
                            logger.info(f"Reading CSV with headers in chunks using {encoding} encoding")
                        
                        # Read remaining chunks
                        for chunk in chunk_iter:
                            chunks.append(chunk)
                        
                        return pd.concat(chunks, ignore_index=True)
                        
                    except StopIteration:
                        # Handle case where file has only headers or is very small
                        return first_chunk if 'first_chunk' in locals() else pd.DataFrame()
                else:
                    # Regular file reading
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
                logger.error(f"Error parsing CSV with {encoding}: {str(e)}")
                continue
        
        raise ValueError("Unable to read CSV file with any supported encoding")
    
    def _validate_columns(self, df: pd.DataFrame) -> pd.DataFrame:
        """
        Validate that required columns are present and handle extra columns
        
        Args:
            df: Input DataFrame
            
        Returns:
            DataFrame with validated columns
            
        Raises:
            ValueError: If required columns are missing
        """
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
    
    def _validate_business_rules(self, df: pd.DataFrame) -> pd.DataFrame:
        """
        Validate business rules for the data
        
        Args:
            df: Input DataFrame
            
        Returns:
            DataFrame after validation (may have rows removed)
        """
        issues = []
        initial_count = len(df)
        
        # Check for negative prices if not allowed
        if not self.allow_negative_prices and 'List_Price' in df.columns:
            negative_prices = df[df['List_Price'] < 0]
            if not negative_prices.empty:
                issues.append(f"Found {len(negative_prices)} products with negative prices")
                df = df[df['List_Price'] >= 0]  # Remove negative prices
        
        # Check for extremely high prices (potential data entry errors)
        if 'List_Price' in df.columns:
            high_price_threshold = self.config.get('max_reasonable_price', 100000)
            high_prices = df[df['List_Price'] > high_price_threshold]
            if not high_prices.empty:
                issues.append(f"Found {len(high_prices)} products with unusually high prices (>${high_price_threshold})")
        
        # Check for duplicate SKUs after cleaning
        duplicates = df[df.duplicated(subset=['SKU'], keep=False)]
        if not duplicates.empty:
            issues.append(f"Found {len(duplicates)} duplicate SKUs - keeping first occurrence")
            df = df.drop_duplicates(subset=['SKU'], keep='first')
        
        # Check for missing product descriptions
        if 'Product_Description' in df.columns:
            # Fix: Use proper pandas boolean indexing
            missing_desc = df[
                df['Product_Description'].isna() | 
                (df['Product_Description'] == '') | 
                (df['Product_Description'] == None)
            ]
            if not missing_desc.empty:
                issues.append(f"Found {len(missing_desc)} products without descriptions")
        
        # Log validation results
        if issues:
            logger.warning("Data validation issues: " + "; ".join(issues))
        
        final_count = len(df)
        if final_count != initial_count:
            logger.info(f"Validation removed {initial_count - final_count} rows. {final_count} products remaining.")
        
        return df
    
    def _clean_data(self, df: pd.DataFrame) -> pd.DataFrame:
        """
        Clean and standardize the data
        
        Args:
            df: Input DataFrame
            
        Returns:
            Cleaned DataFrame
        """
        # Drop empty rows
        df = df.dropna(how='all')
        
        # Remove rows with missing SKU
        df = df.dropna(subset=['SKU'])
        
        # Convert SKU to string and clean it
        df['SKU'] = df['SKU'].astype(str).str.strip()
        df['SKU'] = df['SKU'].replace('nan', '')
        
        # Define numeric columns
        numeric_columns = [
            'List_Price', 'MAP_Price', 'Product_Weight_(lbs.)', 'Case_Weight_(lbs.)',
            'Product_Length_(in.)', 'Product_Width_(in.)', 'Product_Height_(in.)',
            'Product_Height_Without_Legs_(in)', 'Flow_Rate_(GPM)', 'Pallet_Quantity',
            'Case_Quantity', 'Case_Price', 'Number_of_Taps', 'Ice_Capacity_(lbs.)',
            'BTUhr_(K)', 'Interior_Diameter_(in.)', 'Shipping_Weight_(lbs.)',
            'Working_Height_(in.)', 'Trunk_Line_Length_(in.)', 'Height_of_Ceiling_(in.)',
            'Diameter_(in.)', 'Caster_Quantity', 'Wheel_Diameter_(in.)',
            'Spray_Head_Flow_Rate_(GPM)', 'Hose_Length_(in.)', 'Hose_Length_(ft.)',
            'Gallon_Capacity', 'Hertz_(Hz.)', 'Spout_Size_(in.)', 'HP', 'Amps',
            'Load_Capacity_(lbs._per_caster)', 'Plate_Size_(in.)', 'Caster_Overall_Height_(in.)',
            'Compressor_Size_(in.)', 'Backsplash_Height_(in.)', 'Bowl_Size_(in.)',
            'Product_Depth_(in.)'
        ]
        
        # Clean numeric fields
        for col in numeric_columns:
            if col in df.columns:
                df[col] = df[col].apply(self._clean_numeric_value)
        
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
        
        return df
    
    def _clean_numeric_value(self, val: Any) -> Optional[float]:
        """
        Clean a single numeric value
        
        Args:
            val: Value to clean
            
        Returns:
            Cleaned numeric value or None
        """
        if pd.isna(val) or str(val).strip().lower() in ['', 'nan', 'none', 'null']:
            return None
        try:
            # Remove currency symbols and other non-numeric characters
            cleaned = str(val).replace('$', '').replace('€', '').replace('£', '')
            cleaned = cleaned.replace(',', '').replace(' ', '').replace('%', '')
            # Handle ranges (take the first number)
            if '-' in cleaned and not cleaned.startswith('-'):
                cleaned = cleaned.split('-')[0]
            return float(cleaned) if cleaned else None
        except (ValueError, TypeError):
            return None
    
    def _process_array_field(self, value: Any) -> List[str]:
        """
        Process a field that should be an array of values
        
        Args:
            value: Value to process into array
            
        Returns:
            List of cleaned string values
        """
        if pd.isna(value) or str(value).strip().lower() in ['', 'nan', 'none', 'null']:
            return []
            
        # Convert to string and clean
        value_str = str(value).strip()
        
        # If the value is already looking like a JSON array, try to parse it
        if value_str.startswith('[') and value_str.endswith(']'):
            try:
                parsed = json.loads(value_str)
                if isinstance(parsed, list):
                    return [str(item).strip() for item in parsed if str(item).strip()]
            except json.JSONDecodeError:
                pass
        
        # Split by common delimiters and clean each item
        items = []
        # Try different delimiters in order of preference
        delimiters = [',', ';', '|', '\n', '\t']
        
        split_items = [value_str]  # Default to single item
        for delimiter in delimiters:
            if delimiter in value_str:
                split_items = value_str.split(delimiter)
                break
        
        # Clean each item
        for item in split_items:
            cleaned_item = item.strip()
            if cleaned_item and cleaned_item.lower() not in ['nan', 'none', 'null', '']:
                items.append(cleaned_item)
                
        return items
    
    def get_processing_stats(self, products: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Get statistics about the processed products
        
        Args:
            products: List of processed product dictionaries
            
        Returns:
            Dictionary with processing statistics
        """
        if not products:
            return {"total_products": 0, "error": "No products to analyze"}
        
        stats = {
            "total_products": len(products),
            "products_with_prices": sum(1 for p in products if p.get('List_Price') is not None),
            "unique_families": len(set(p.get('Family', '') for p in products if p.get('Family'))),
            "average_price": None,
            "price_range": None,
            "products_with_images": sum(1 for p in products if p.get('Images') and len(p.get('Images', [])) > 0),
            "most_common_family": None
        }
        
        # Calculate price statistics
        prices = [p.get('List_Price') for p in products if p.get('List_Price') is not None]
        if prices:
            stats["average_price"] = sum(prices) / len(prices)
            stats["price_range"] = {"min": min(prices), "max": max(prices)}
        
        # Find most common family
        families = [p.get('Family', '') for p in products if p.get('Family')]
        if families:
            family_counts = {}
            for family in families:
                family_counts[family] = family_counts.get(family, 0) + 1
            stats["most_common_family"] = max(family_counts.items(), key=lambda x: x[1])
        
        return stats