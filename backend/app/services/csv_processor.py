import pandas as pd
import logging

logger = logging.getLogger(__name__)

class CSVProcessor:
    def __init__(self):
        self.required_columns = ['product_id', 'name', 'price', 'description']
    
    def process_file(self, filepath):
        """Process CSV file and return standardized product data"""
        try:
            # Read CSV with different encodings fallback
            df = self._read_csv_safe(filepath)
            
            # Validate required columns
            self._validate_columns(df)
            
            # Clean and standardize data
            df = self._clean_data(df)
            
            # Convert to list of dictionaries
            products = df.to_dict('records')
            
            logger.info(f"Processed {len(products)} products from CSV")
            return products
            
        except Exception as e:
            logger.error(f"Error processing CSV file: {str(e)}")
            raise
    
    def _read_csv_safe(self, filepath):
        """Attempt to read CSV with different encodings"""
        encodings = ['utf-8', 'latin-1', 'cp1252', 'iso-8859-1']
        
        for encoding in encodings:
            try:
                df = pd.read_csv(filepath, encoding=encoding)
                logger.info(f"Successfully read CSV with {encoding} encoding")
                return df
            except UnicodeDecodeError:
                continue
        
        raise ValueError("Unable to read CSV file with any supported encoding")
    
    def _validate_columns(self, df):
        """Validate that required columns are present"""
        missing_columns = []
        
        # Check for required columns (case-insensitive)
        df_columns_lower = [col.lower().strip() for col in df.columns]
        
        for required_col in self.required_columns:
            if required_col.lower() not in df_columns_lower:
                missing_columns.append(required_col)
        
        if missing_columns:
            raise ValueError(f"Missing required columns: {', '.join(missing_columns)}")
        
        # Standardize column names
        column_mapping = {}
        for col in df.columns:
            col_lower = col.lower().strip()
            for required_col in self.required_columns:
                if required_col.lower() == col_lower:
                    column_mapping[col] = required_col
                    break
        
        df.rename(columns=column_mapping, inplace=True)
    
    def _clean_data(self, df):
        """Clean and standardize the data"""
        # Remove rows with missing product_id
        df = df.dropna(subset=['product_id'])
        
        # Convert product_id to string
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