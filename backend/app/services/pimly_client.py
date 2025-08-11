import logging
import json
from typing import List, Dict, Any, Optional
import requests
from urllib.parse import urlencode

from .salesforce_client import SalesforceClient

logger = logging.getLogger(__name__)

class PimlyClient:
    """Enhanced client for interacting with Pimly REST API v2 through Salesforce"""
    
    def __init__(self, salesforce_client: SalesforceClient):
        self.sf_client = salesforce_client
        if not self.sf_client.is_authenticated():
            raise Exception("Salesforce client must be authenticated to use Pimly")

    def _get_headers(self) -> Dict[str, str]:
        """Get headers for Pimly API requests"""
        return {
            "Authorization": f"Bearer {self.sf_client.get_session_id()}",
            "Content-Type": "application/json",
            "Accept": "application/json"
        }

    def get_products_by_ids(self, 
                           ids: List[str], 
                           properties: Optional[List[str]] = None,
                           context_identifier: Optional[str] = None,
                           channel_id: Optional[str] = None,
                           locale_id: Optional[str] = None,
                           max_batch_size: int = 50) -> List[Dict[str, Any]]:
        """
        Retrieve product details from Pimly using REST API v2
        
        Args:
            ids: List of product identifiers (default is Pimly Admin Name)
            properties: Optional list of specific Pimly Properties to include
            context_identifier: Field to use as unique key (default: pimly__admin_name__c)
            channel_id: Pimly Channel context identifier (default: global)
            locale_id: Pimly Locale context identifier (default: global)
            max_batch_size: Maximum number of IDs per request (API limit)
            
        Returns:
            List of product dictionaries with requested data
        """
        if not ids:
            logger.warning("No product IDs provided")
            return []
        
        base_url = f"{self.sf_client.instance_url}/services/apexrest/pimly/v2/products"
        all_products = []
        
        # Process IDs in batches to respect API limits
        for i in range(0, len(ids), max_batch_size):
            batch_ids = ids[i:i + max_batch_size]
            
            try:
                batch_products = self._fetch_product_batch(
                    base_url=base_url,
                    ids=batch_ids,
                    properties=properties,
                    context_identifier=context_identifier,
                    channel_id=channel_id,
                    locale_id=locale_id
                )
                
                if batch_products:
                    all_products.extend(batch_products)
                    logger.info(f"Successfully retrieved {len(batch_products)} products from batch {i//max_batch_size + 1}")
                else:
                    logger.warning(f"No products returned for batch {i//max_batch_size + 1} with IDs: {batch_ids[:3]}...")
                    
            except Exception as e:
                logger.error(f"Error fetching batch {i//max_batch_size + 1} with IDs {batch_ids[:3]}...: {str(e)}")
                # Continue with other batches instead of failing completely
                continue
        
        logger.info(f"Total products retrieved: {len(all_products)} from {len(ids)} requested IDs")
        return all_products

    def _fetch_product_batch(self, 
                           base_url: str,
                           ids: List[str],
                           properties: Optional[List[str]] = None,
                           context_identifier: Optional[str] = None,
                           channel_id: Optional[str] = None,
                           locale_id: Optional[str] = None) -> List[Dict[str, Any]]:
        """Fetch a single batch of products from Pimly API"""
        
        # Build query parameters according to API spec
        params = {
            "ids": ",".join(ids)  # Comma-separated product identifiers
        }

        # Add optional parameters if provided
        if properties:
            params["properties"] = ",".join(properties)
        if context_identifier:
            params["context.identifier"] = context_identifier
        if channel_id:
            params["context.channelId"] = channel_id
        if locale_id:
            params["context.localeId"] = locale_id

        logger.debug(f"Fetching {len(ids)} products with params: {params}")
        
        try:
            response = requests.get(
                base_url, 
                headers=self._get_headers(), 
                params=params,
                timeout=30  # Add timeout for reliability
            )

            # Handle token refresh if needed
            if response.status_code == 401:
                logger.info("Access token expired, attempting refresh...")
                if self.sf_client.refresh_access_token():
                    logger.info("Token refreshed successfully, retrying request")
                    response = requests.get(
                        base_url, 
                        headers=self._get_headers(), 
                        params=params,
                        timeout=30
                    )
                else:
                    raise Exception("Failed to refresh access token")

            # Check for successful response
            if response.status_code == 200:
                result = response.json()
                
                # Handle different response formats
                if isinstance(result, list):
                    return result
                elif isinstance(result, dict):
                    # Some APIs wrap results in a data field
                    return result.get('data', result.get('products', [result]))
                else:
                    logger.warning(f"Unexpected response format: {type(result)}")
                    return []
                    
            else:
                error_msg = f"API request failed with status {response.status_code}"
                try:
                    error_detail = response.json()
                    error_msg += f": {error_detail}"
                except:
                    error_msg += f": {response.text[:200]}"
                
                logger.error(error_msg)
                raise Exception(error_msg)
                
        except requests.exceptions.Timeout:
            logger.error(f"Request timeout for batch with {len(ids)} products")
            raise Exception("Request timeout - try reducing batch size")
        except requests.exceptions.RequestException as e:
            logger.error(f"Network error during product fetch: {str(e)}")
            raise Exception(f"Network error: {str(e)}")
        except Exception as e:
            logger.error(f"Unexpected error fetching products: {str(e)}")
            raise

    def get_products_with_specific_properties(self, 
                                            ids: List[str], 
                                            property_names: List[str],
                                            channel_id: str = "global",
                                            locale_id: str = "global") -> List[Dict[str, Any]]:
        """
        Convenience method to get products with specific properties for a channel/locale
        
        Args:
            ids: Product identifiers
            property_names: Specific Pimly property names to retrieve
            channel_id: Channel context (default: global)
            locale_id: Locale context (default: global)
        """
        return self.get_products_by_ids(
            ids=ids,
            properties=property_names,
            channel_id=channel_id,
            locale_id=locale_id
        )

    def get_product_by_sku(self, sku: str, **kwargs) -> Dict[str, Any]:
        """Get a single product by SKU"""
        products = self.get_products_by_ids([sku], **kwargs)
        return products[0] if products else {}

    def search_products(self, search_term: str, limit: int = 20) -> List[Dict[str, Any]]:
        """
        Search for products in Pimly using SOQL fallback
        Note: This is a fallback method. For better search, consider using Pimly's search API if available
        """
        try:
            # Escape single quotes for SOQL
            escaped_term = search_term.replace("'", "\\'")
            
            query = f"""
                SELECT Id, Name, pimly__SKU__c, pimly__Description__c, pimly__Admin_Name__c
                FROM pimly__Product__c 
                WHERE Name LIKE '%{escaped_term}%' 
                   OR pimly__SKU__c LIKE '%{escaped_term}%'
                   OR pimly__Admin_Name__c LIKE '%{escaped_term}%'
                ORDER BY Name
                LIMIT {limit}
            """
            
            result = self.sf_client.query(query)
            products = []
            
            if result and 'records' in result:
                for record in result['records']:
                    products.append({
                        'Id': record.get('Id'),
                        'Name': record.get('Name'),
                        'SKU': record.get('pimly__SKU__c'),
                        'AdminName': record.get('pimly__Admin_Name__c'),
                        'Description': record.get('pimly__Description__c')
                    })
            
            logger.info(f"Search for '{search_term}' returned {len(products)} results")
            return products
            
        except Exception as e:
            logger.error(f"Product search failed for term '{search_term}': {str(e)}")
            return []

    def validate_connection(self) -> bool:
        """Test the connection to Pimly API"""
        try:
            # Try to fetch a small batch of products (if any exist)
            test_url = f"{self.sf_client.instance_url}/services/apexrest/pimly/v2/products"
            response = requests.get(
                test_url,
                headers=self._get_headers(),
                params={"ids": "test"},  # This should return empty but validate connection
                timeout=10
            )
            
            if response.status_code in [200, 400]:  # 400 is OK for invalid ID
                logger.info("Pimly API connection validated successfully")
                return True
            else:
                logger.warning(f"Pimly API validation returned status: {response.status_code}")
                return False
                
        except Exception as e:
            logger.error(f"Pimly API connection validation failed: {str(e)}")
            return False