import logging
import json
from typing import List, Dict, Any, Optional
import requests

from .salesforce_client import SalesforceClient
from .extract_skus import extract_known_ids_from_csv

logger = logging.getLogger(__name__)

class PimlyClient:
    """Client for interacting with Pimly REST API v2 through Salesforce"""
    
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

    def search_products(self, search_term: str, limit: int = 20) -> List[Dict[str, Any]]:
        """
        Search for products in Pimly using the export/query functionality
        This creates an export job with a search filter and retrieves the results
        """
        try:
            # First, try to get products by exact SKU match if search term looks like a SKU
            if search_term and not ' ' in search_term:  # Single word, might be SKU
                try:
                    products = self.get_products_by_ids([search_term])
                    if products:
                        logger.info(f"Found product by exact SKU match: {search_term}")
                        return products
                except Exception as e:
                    logger.debug(f"No exact SKU match for {search_term}, trying search: {e}")
            
            # If no exact match, create an export job with search filters
            export_url = f"{self.sf_client.instance_url}/services/apexrest/pimly/v2/exports"
            
            # Create export job with search filter
            export_payload = {
                "filetype": "json",
                "jobType": "all_products",
                "pimlyRecordType": "ready_to_read_records",
                "salesforceQueryFilters": f"Name LIKE '%{search_term}%' OR pimly__SKU__c LIKE '%{search_term}%' LIMIT {limit}"
            }
            
            logger.info(f"Creating Pimly export job for search: {search_term}")
            
            response = requests.post(
                export_url, 
                headers=self._get_headers(), 
                data=json.dumps(export_payload)
            )
            
            if response.status_code == 401 and self.sf_client.refresh_access_token():
                logger.info("Session expired, refreshed token, retrying")
                response = requests.post(
                    export_url, 
                    headers=self._get_headers(), 
                    data=json.dumps(export_payload)
                )
            
            response.raise_for_status()
            export_result = response.json()
            
            # Get the export job ID
            export_log_id = export_result.get('exportLogId')
            if not export_log_id:
                logger.warning("No export job ID returned")
                return []
            
            # Poll the export job status
            export_status_url = f"{self.sf_client.instance_url}/services/apexrest/pimly/v2/exports/{export_log_id}"
            
            # Simple polling mechanism (in production, you'd want async handling)
            import time
            max_attempts = 10
            for attempt in range(max_attempts):
                time.sleep(1)  # Wait 1 second between checks
                
                status_response = requests.get(
                    export_status_url,
                    headers=self._get_headers()
                )
                
                if status_response.status_code == 200:
                    status_data = status_response.json()
                    job_status = status_data.get('pimly__Job_Status__c')
                    
                    if job_status == 'Complete':
                        # Download the export file
                        output_url = status_data.get('pimly__Output_URL__c')
                        if output_url:
                            file_response = requests.get(output_url)
                            if file_response.status_code == 200:
                                products = file_response.json()
                                return products[:limit] if isinstance(products, list) else []
                        break
                    elif job_status == 'Failed':
                        logger.error(f"Export job failed: {status_data}")
                        break
            
            # Fallback: return empty list if we couldn't get results
            return []
            
        except Exception as e:
            logger.error(f"Error searching products: {str(e)}")
            # As a fallback, try to search by getting all products and filtering
            # This is not ideal but provides some functionality
            return self._fallback_search(search_term, limit)
    
    def _fallback_search(self, search_term: str, limit: int) -> List[Dict[str, Any]]:
        """Fallback search method using direct product retrieval"""
        try:
            # Try to get products using a SOQL query through the generic Salesforce API
            query = f"""
                SELECT Id, Name, pimly__SKU__c, pimly__Description__c 
                FROM pimly__Product__c 
                WHERE Name LIKE '%{search_term}%' 
                   OR pimly__SKU__c LIKE '%{search_term}%'
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
                        'Description': record.get('pimly__Description__c')
                    })
            
            return products
        except Exception as e:
            logger.error(f"Fallback search failed: {str(e)}")
            return []

    def get_products_by_ids(self, ids: List[str], properties: Optional[List[str]] = None,
                             context_identifier: Optional[str] = None,
                             channel_id: Optional[str] = None,
                             locale_id: Optional[str] = None) -> List[Dict[str, Any]]:
        """Retrieve product details from Pimly using REST API v2"""
        if not ids:
            return []
        
        base_url = f"{self.sf_client.instance_url}/services/apexrest/pimly/v2/products"
        params = {
            "ids": ",".join(ids[:50])  # Limit to 50 IDs per request
        }

        if properties:
            params["properties"] = ",".join(properties)
        if context_identifier:
            params["context.identifier"] = context_identifier
        if channel_id:
            params["context.channelId"] = channel_id
        if locale_id:
            params["context.localeId"] = locale_id

        logger.info(f"Sending REST API v2 request to Pimly for {len(ids)} products")
        
        try:
            response = requests.get(base_url, headers=self._get_headers(), params=params)

            if response.status_code == 401 and self.sf_client.refresh_access_token():
                logger.info("Session expired, refreshed token, retrying")
                response = requests.get(base_url, headers=self._get_headers(), params=params)

            response.raise_for_status()
            return response.json()
        except Exception as e:
            logger.error(f"Error getting products by IDs: {str(e)}")
            return []

    def get_product_by_sku(self, sku: str) -> Dict[str, Any]:
        """Get a single product by SKU"""
        products = self.search_products(sku, limit=1)
        if products:
            return products[0]
        
        # Try direct ID lookup as fallback
        products = self.get_products_by_ids([sku])
        return products[0] if products else {}

    def get_all_product_skus(self, limit: int = 1000) -> List[str]:
        """Get all product SKUs from Pimly"""
        try:
            # Use SOQL query to get all SKUs
            query = f"SELECT pimly__SKU__c FROM pimly__Product__c WHERE pimly__SKU__c != null LIMIT {limit}"
            result = self.sf_client.query(query)
            
            skus = []
            if result and 'records' in result:
                for record in result['records']:
                    sku = record.get('pimly__SKU__c')
                    if sku:
                        skus.append(sku)
            
            logger.info(f"Retrieved {len(skus)} SKUs from Pimly")
            return skus
        except Exception as e:
            logger.error(f"Error getting all SKUs: {str(e)}")
            return []

    def sync_products(self) -> Dict[str, Any]:
        """Sync products (placeholder for actual sync logic)"""
        # This would contain the actual sync logic to Krowne CMS
        return {"message": "Sync functionality to be implemented"}

    def get_sync_status(self) -> Dict[str, Any]:
        """Get sync status (placeholder)"""
        return {"status": "Not implemented"}

    def process_csv_upload(self, file) -> Dict[str, Any]:
        """Process uploaded CSV file"""
        # This would process the CSV and update products
        return {"message": "CSV upload processing to be implemented"}

    def delete_product(self, sku: str) -> Dict[str, Any]:
        """Delete a product (placeholder)"""
        return {"message": f"Delete functionality for {sku} to be implemented"}