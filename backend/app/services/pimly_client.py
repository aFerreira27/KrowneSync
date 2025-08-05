import logging
from typing import List, Dict, Any, Optional
import requests

from .extract_skus import extract_known_ids_from_csv
from .salesforce_client import SalesforceClient

logger = logging.getLogger(__name__)

class PimlyClient:
    def __init__(self, salesforce_client: SalesforceClient):
        self.sf_client = salesforce_client
        if not self.sf_client.is_authenticated():
            raise Exception("Salesforce client must be authenticated to use Pimly")

    def _get_headers(self) -> Dict[str, str]:
        return {
            "Authorization": f"Bearer {self.sf_client.get_session_id()}",
            "Content-Type": "application/json",
            "Accept": "application/json"
        }

    def get_products_by_ids(self, ids: List[str], properties: Optional[List[str]] = None,
                             context_identifier: Optional[str] = None,
                             channel_id: Optional[str] = None,
                             locale_id: Optional[str] = None) -> List[Dict[str, Any]]:
        """Retrieve product details from Pimly using REST API v2"""
        base_url = f"{self.sf_client.instance_url}/services/apexrest/pimly/v2/products"
        params = {
            "ids": ",".join(ids)
        }

        if properties:
            params["properties"] = ",".join(properties)
        if context_identifier:
            params["context.identifier"] = context_identifier
        if channel_id:
            params["context.channelId"] = channel_id
        if locale_id:
            params["context.localeId"] = locale_id

        logger.info("Sending REST API v2 request to Pimly: %s", params)
        response = requests.get(base_url, headers=self._get_headers(), params=params)

        if response.status_code == 401 and self.sf_client.refresh_access_token():
            logger.info("Session expired, refreshed token, retrying")
            response = requests.get(base_url, headers=self._get_headers(), params=params)

        response.raise_for_status()
        return response.json()

    def get_all_product_skus(self, limit: int = 1000) -> List[str]:
        """Example using get_products_by_ids to fetch SKUs of known IDs"""
        # This is a placeholder. You need to pass actual product IDs you know exist.
        known_ids = extract_known_ids_from_csv("backend/uploads/Initial_Import.csv")
        products = self.get_products_by_ids(known_ids, properties=["SKU"])
        return [p.get("SKU") for p in products if "SKU" in p]

    def get_product_details(self, product_id: str) -> Dict[str, Any]:
        """Convenience method to get one product's full details"""
        products = self.get_products_by_ids([product_id])
        return products[0] if products else {}
