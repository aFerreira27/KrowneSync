import requests
import logging
from typing import List, Dict, Any

logger = logging.getLogger(__name__)

class SalesforceClient:
    def __init__(self, config: Dict[str, str]):
        self.client_id = config['client_id']
        self.client_secret = config['client_secret']
        self.username = config['username']
        self.password = config['password']
        self.security_token = config['security_token']
        self.instance_url = None
        self.access_token = None
        self.api_version = 'v58.0'
    
    def authenticate(self):
        """Authenticate with Salesforce and get access token"""
        try:
            auth_url = 'https://login.salesforce.com/services/oauth2/token'
            
            auth_data = {
                'grant_type': 'password',
                'client_id': self.client_id,
                'client_secret': self.client_secret,
                'username': self.username,
                'password': self.password + self.security_token
            }
            
            print("Auth data:", auth_data)
            response = requests.post(auth_url, data=auth_data)
            print("Here", response.text)
            response.raise_for_status()
            print("Here", response.text)

            
            
            auth_info = response.json()
            self.access_token = auth_info['access_token']
            self.instance_url = auth_info['instance_url']
            
            logger.info("Successfully authenticated with Salesforce")
            return True
            
        except requests.exceptions.RequestException as e:
            logger.error(f"Salesforce authentication failed: {str(e)}")
            raise Exception(f"Salesforce authentication failed: {str(e)}")
    
    def get_products(self) -> List[Dict[str, Any]]:
        """Retrieve products from Salesforce"""
        if not self.access_token:
            self.authenticate()
        
        try:
            # SOQL query to get product data
            # Adjust field names based on your Salesforce schema
            query = """
            SELECT Id, Name, ProductCode, Description, 
                   UnitPrice, IsActive, Family
            FROM Product2 
            WHERE IsActive = true
            ORDER BY Name
            """
            
            headers = {
                'Authorization': f'Bearer {self.access_token}',
                'Content-Type': 'application/json'
            }
            
            query_url = f"{self.instance_url}/services/data/{self.api_version}/query/"
            params = {'q': query}
            
            response = requests.get(query_url, headers=headers, params=params)
            response.raise_for_status()
            
            data = response.json()
            records = data.get('records', [])
            
            # Transform Salesforce data to standardized format
            products = []
            for record in records:
                product = {
                    'product_id': record.get('ProductCode') or record.get('Id'),
                    'name': record.get('Name', ''),
                    'price': record.get('UnitPrice', 0),
                    'description': record.get('Description', ''),
                    'salesforce_id': record.get('Id'),
                    'family': record.get('Family', ''),
                    'is_active': record.get('IsActive', False)
                }
                products.append(product)
            
            logger.info(f"Retrieved {len(products)} products from Salesforce")
            return products
            
        except requests.exceptions.RequestException as e:
            logger.error(f"Error retrieving products from Salesforce: {str(e)}")
            raise Exception(f"Error retrieving products from Salesforce: {str(e)}")
    
    def get_price_book_entries(self) -> List[Dict[str, Any]]:
        """Get price book entries for more detailed pricing info"""
        if not self.access_token:
            self.authenticate()
        
        try:
            query = """
            SELECT Id, Product2Id, Product2.Name, Product2.ProductCode,
                   UnitPrice, Pricebook2Id, Pricebook2.Name, IsActive
            FROM PricebookEntry 
            WHERE IsActive = true
            ORDER BY Product2.Name
            """
            
            headers = {
                'Authorization': f'Bearer {self.access_token}',
                'Content-Type': 'application/json'
            }
            
            query_url = f"{self.instance_url}/services/data/{self.api_version}/query/"
            params = {'q': query}
            
            response = requests.get(query_url, headers=headers, params=params)
            response.raise_for_status()
            
            data = response.json()
            return data.get('records', [])
            
        except requests.exceptions.RequestException as e:
            logger.error(f"Error retrieving price book entries: {str(e)}")
            raise Exception(f"Error retrieving price book entries: {str(e)}")
    
    def update_product(self, product_id: str, updates: Dict[str, Any]) -> bool:
        """Update a product in Salesforce"""
        if not self.access_token:
            self.authenticate()
        
        try:
            headers = {
                'Authorization': f'Bearer {self.access_token}',
                'Content-Type': 'application/json'
            }
            
            update_url = f"{self.instance_url}/services/data/{self.api_version}/sobjects/Product2/{product_id}"
            
            response = requests.patch(update_url, headers=headers, json=updates)
            response.raise_for_status()
            
            logger.info(f"Successfully updated product {product_id}")
            return True
            
        except requests.exceptions.RequestException as e:
            logger.error(f"Error updating product {product_id}: {str(e)}")
            raise Exception(f"Error updating product {product_id}: {str(e)}")