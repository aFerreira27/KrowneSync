import requests
import logging
import urllib.parse
import secrets
import base64
import os
import hashlib
from typing import List, Dict, Any, Optional, Tuple


logger = logging.getLogger(__name__)

class SalesforceClient:
    def __init__(self, config: Dict[str, str]):
        self.client_id = config['client_id']
        self.client_secret = config['client_secret']
        self.redirect_uri = config.get('redirect_uri', 'http://localhost:3000/api/auth/callback/salesforce')
        self.sandbox = config.get('sandbox', False)  # True for sandbox, False for production
        self.instance_url = None
        self.access_token = None
        self.refresh_token = None
        self.api_version = 'v58.0'
        
        # Get My Domain URL if provided, otherwise use default login URL
        self.login_url = config.get('my_domain_url')
        if not self.login_url:
            self.login_url = 'https://test.salesforce.com' if self.sandbox else 'https://login.salesforce.com'
        
        # Store for PKCE verification
        self._code_verifier = None
    
    def _generate_pkce_pair(self) -> Tuple[str, str]:
        """
        Generate PKCE code verifier and challenge
        
        Returns:
            Tuple of (code_verifier, code_challenge)
        """
        # Generate code verifier - random string of 43-128 characters
        code_verifier = base64.urlsafe_b64encode(secrets.token_bytes(32)).decode('utf-8').rstrip('=')
        
        # Generate code challenge - SHA256 hash of verifier
        challenge_bytes = hashlib.sha256(code_verifier.encode('utf-8')).digest()
        code_challenge = base64.urlsafe_b64encode(challenge_bytes).decode('utf-8').rstrip('=')
        
        return code_verifier, code_challenge
    
    def get_authorization_url(self, state: Optional[str] = None) -> Dict[str, str]:
        """
        Generate the authorization URL for OAuth 2.0 web server flow with PKCE
        
        Args:
            state: Optional state parameter for CSRF protection
            
        Returns:
            Dictionary containing authorization URL and PKCE verifier
        """
        if not state:
            state = secrets.token_urlsafe(32)
        
        # Generate PKCE pair
        code_verifier, code_challenge = self._generate_pkce_pair()
        self._code_verifier = code_verifier  # Store for later use
        
        params = {
            'response_type': 'code',
            'client_id': self.client_id,
            'redirect_uri': self.redirect_uri,
            'scope': 'api refresh_token offline_access',
            'state': state,
            'code_challenge': code_challenge,
            'code_challenge_method': 'S256'  # SHA256 method
        }
        
        auth_url = f"{self.login_url}/services/oauth2/authorize?" + urllib.parse.urlencode(params)
        logger.info(f"Generated authorization URL for Salesforce OAuth with PKCE")
        
        # Return both URL and verifier so it can be stored in session
        return {
            'auth_url': auth_url,
            'code_verifier': code_verifier,
            'state': state
        }
    
    def exchange_code_for_tokens(self, authorization_code: str, code_verifier: Optional[str] = None) -> Dict[str, Any]:
        """
        Exchange authorization code for access and refresh tokens with PKCE
        
        Args:
            authorization_code: The code received from Salesforce callback
            code_verifier: The PKCE code verifier (if not stored in instance)
            
        Returns:
            Dictionary containing token info
        """
        try:
            # Use provided verifier or stored one
            verifier = code_verifier or self._code_verifier
            if not verifier:
                raise ValueError("Code verifier not provided and not stored in instance")
            
            token_url = f"{self.login_url}/services/oauth2/token"
            
            token_data = {
                'grant_type': 'authorization_code',
                'client_id': self.client_id,
                'client_secret': self.client_secret,
                'redirect_uri': self.redirect_uri,
                'code': authorization_code,
                'code_verifier': verifier  # Include PKCE verifier
            }
            
            headers = {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Accept': 'application/json'
            }
            
            response = requests.post(token_url, data=token_data, headers=headers)
            response.raise_for_status()
            
            token_info = response.json()
            
            # Store tokens
            self.access_token = token_info['access_token']
            self.refresh_token = token_info.get('refresh_token')
            self.instance_url = token_info['instance_url']
            
            # Clear the stored verifier after use
            self._code_verifier = None
            
            logger.info("Successfully exchanged authorization code for tokens")
            return token_info
            
        except requests.exceptions.RequestException as e:
            logger.error(f"Token exchange failed: {str(e)}")
            if hasattr(e.response, 'text'):
                logger.error(f"Response: {e.response.text}")
            raise Exception(f"Token exchange failed: {str(e)}")
    
    def get_client_credentials_token(self) -> Dict[str, Any]:
        """
        Get an access token using the OAuth 2.0 client credentials flow.
        This is for server-to-server integration without user interaction.
        Note: This flow does not support refresh tokens.
        
        Returns:
            Dictionary containing token info
        """
        try:
            token_url = f"{self.login_url}/services/oauth2/token"
            
            # Create the Basic auth header with client credentials
            auth_str = f"{self.client_id}:{self.client_secret}"
            auth_bytes = auth_str.encode('ascii')
            auth_b64 = base64.b64encode(auth_bytes).decode('ascii')
            
            headers = {
                'Authorization': f'Basic {auth_b64}',
                'Content-Type': 'application/x-www-form-urlencoded',
                'Accept': 'application/json'
            }
            
            # Only grant_type is needed in body when using Basic auth
            token_data = {
                'grant_type': 'client_credentials'
            }
            
            response = requests.post(token_url, data=token_data, headers=headers)
            response.raise_for_status()
            
            token_info = response.json()
            
            # Store tokens (no refresh token in this flow)
            self.access_token = token_info['access_token']
            self.instance_url = token_info['instance_url']
            self.refresh_token = None  # Client credentials flow doesn't support refresh tokens
            
            logger.info("Successfully obtained access token using client credentials flow")
            return token_info
            
        except requests.exceptions.RequestException as e:
            logger.error(f"Client credentials token request failed: {str(e)}")
            if hasattr(e.response, 'text'):
                logger.error(f"Response: {e.response.text}")
            raise Exception(f"Client credentials token request failed: {str(e)}")

    def refresh_access_token(self) -> bool:
        """
        Refresh the access token using the refresh token.
        Note: This is only available for the authorization code flow, not the client credentials flow.
        
        Returns:
            True if successful, False otherwise
        """
        if not self.refresh_token:
            logger.error("No refresh token available")
            return False
        
        try:
            token_url = f"{self.login_url}/services/oauth2/token"
            
            refresh_data = {
                'grant_type': 'refresh_token',
                'client_id': self.client_id,
                'client_secret': self.client_secret,
                'refresh_token': self.refresh_token
            }
            
            headers = {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Accept': 'application/json'
            }
            
            response = requests.post(token_url, data=refresh_data, headers=headers)
            response.raise_for_status()
            
            token_info = response.json()
            self.access_token = token_info['access_token']
            self.instance_url = token_info['instance_url']
            
            logger.info("Successfully refreshed access token")
            return True
            
        except requests.exceptions.RequestException as e:
            logger.error(f"Token refresh failed: {str(e)}")
            return False
    
    def set_tokens(self, access_token: str, refresh_token: str, instance_url: str):
        """
        Manually set tokens (useful when loading from storage)
        
        Args:
            access_token: The access token
            refresh_token: The refresh token
            instance_url: The Salesforce instance URL
        """
        self.access_token = access_token
        self.refresh_token = refresh_token
        self.instance_url = instance_url
    
    def is_authenticated(self) -> bool:
        """Check if client has valid authentication"""
        return bool(self.access_token and self.instance_url)
    
    def _make_authenticated_request(self, method: str, url: str, **kwargs) -> requests.Response:
        """
        Make an authenticated request to Salesforce API with automatic token refresh
        
        Args:
            method: HTTP method (GET, POST, PATCH, etc.)
            url: Full URL or path relative to instance_url
            **kwargs: Additional arguments for requests
            
        Returns:
            Response object
        """
        if not self.is_authenticated():
            raise Exception("Not authenticated. Please complete OAuth flow first.")
        
        # Ensure URL is complete
        if not url.startswith('http'):
            url = f"{self.instance_url}{url}"
        
        # Add authorization header
        headers = kwargs.get('headers', {})
        headers['Authorization'] = f'Bearer {self.access_token}'
        kwargs['headers'] = headers
        
        # Make request
        response = requests.request(method, url, **kwargs)
        
        # Handle token expiration
        if response.status_code == 401:
            logger.info("Access token expired, attempting refresh")
            if self.refresh_access_token():
                # Retry with new token
                headers['Authorization'] = f'Bearer {self.access_token}'
                response = requests.request(method, url, **kwargs)
            else:
                raise Exception("Authentication failed and token refresh unsuccessful")
        
        return response
    
    def get_products(self) -> List[Dict[str, Any]]:
        """Retrieve products from Salesforce"""
        try:
            # SOQL query to get product data
            query = """
            SELECT Id, Name, ProductCode, Description, 
                   UnitPrice, IsActive, Family, CreatedDate, LastModifiedDate
            FROM Product2 
            WHERE IsActive = true
            ORDER BY Name
            """
            
            query_url = f"/services/data/{self.api_version}/query/"
            params = {'q': query}
            
            response = self._make_authenticated_request('GET', query_url, params=params)
            response.raise_for_status()
            
            data = response.json()
            records = data.get('records', [])
            
            # Handle pagination if needed
            all_records = records[:]
            while not data.get('done', True) and data.get('nextRecordsUrl'):
                next_url = data['nextRecordsUrl']
                response = self._make_authenticated_request('GET', next_url)
                response.raise_for_status()
                data = response.json()
                all_records.extend(data.get('records', []))
            
            # Transform Salesforce data to standardized format
            products = []
            for record in all_records:
                product = {
                    'product_id': record.get('ProductCode') or record.get('Id'),
                    'name': record.get('Name', ''),
                    'price': record.get('UnitPrice', 0),
                    'description': record.get('Description', ''),
                    'salesforce_id': record.get('Id'),
                    'family': record.get('Family', ''),
                    'is_active': record.get('IsActive', False),
                    'created_date': record.get('CreatedDate'),
                    'last_modified_date': record.get('LastModifiedDate')
                }
                products.append(product)
            
            logger.info(f"Retrieved {len(products)} products from Salesforce")
            return products
            
        except requests.exceptions.RequestException as e:
            logger.error(f"Error retrieving products from Salesforce: {str(e)}")
            raise Exception(f"Error retrieving products from Salesforce: {str(e)}")
    
    def get_price_book_entries(self, pricebook_name: Optional[str] = None) -> List[Dict[str, Any]]:
        """
        Get price book entries for more detailed pricing info
        
        Args:
            pricebook_name: Optional pricebook name to filter by
            
        Returns:
            List of pricebook entries
        """
        try:
            base_query = """
            SELECT Id, Product2Id, Product2.Name, Product2.ProductCode,
                   UnitPrice, Pricebook2Id, Pricebook2.Name, IsActive,
                   Product2.Description, Product2.Family
            FROM PricebookEntry 
            WHERE IsActive = true AND Product2.IsActive = true
            """
            
            if pricebook_name:
                query = f"{base_query} AND Pricebook2.Name = '{pricebook_name}'"
            else:
                query = f"{base_query}"
            
            query += " ORDER BY Product2.Name"
            
            query_url = f"/services/data/{self.api_version}/query/"
            params = {'q': query}
            
            response = self._make_authenticated_request('GET', query_url, params=params)
            response.raise_for_status()
            
            data = response.json()
            records = data.get('records', [])
            
            # Handle pagination
            all_records = records[:]
            while not data.get('done', True) and data.get('nextRecordsUrl'):
                next_url = data['nextRecordsUrl']
                response = self._make_authenticated_request('GET', next_url)
                response.raise_for_status()
                data = response.json()
                all_records.extend(data.get('records', []))
            
            logger.info(f"Retrieved {len(all_records)} price book entries from Salesforce")
            return all_records
            
        except requests.exceptions.RequestException as e:
            logger.error(f"Error retrieving price book entries: {str(e)}")
            raise Exception(f"Error retrieving price book entries: {str(e)}")
    
    def update_product(self, product_id: str, updates: Dict[str, Any]) -> bool:
        """
        Update a product in Salesforce
        
        Args:
            product_id: Salesforce ID of the product
            updates: Dictionary of fields to update
            
        Returns:
            True if successful
        """
        try:
            update_url = f"/services/data/{self.api_version}/sobjects/Product2/{product_id}"
            
            response = self._make_authenticated_request('PATCH', update_url, json=updates)
            response.raise_for_status()
            
            logger.info(f"Successfully updated product {product_id}")
            return True
            
        except requests.exceptions.RequestException as e:
            logger.error(f"Error updating product {product_id}: {str(e)}")
            if hasattr(e.response, 'text'):
                logger.error(f"Response: {e.response.text}")
            raise Exception(f"Error updating product {product_id}: {str(e)}")
    
    def create_product(self, product_data: Dict[str, Any]) -> str:
        """
        Create a new product in Salesforce
        
        Args:
            product_data: Dictionary containing product fields
            
        Returns:
            ID of the created product
        """
        try:
            create_url = f"/services/data/{self.api_version}/sobjects/Product2/"
            
            response = self._make_authenticated_request('POST', create_url, json=product_data)
            response.raise_for_status()
            
            result = response.json()
            product_id = result.get('id')
            
            logger.info(f"Successfully created product {product_id}")
            return product_id
            
        except requests.exceptions.RequestException as e:
            logger.error(f"Error creating product: {str(e)}")
            if hasattr(e.response, 'text'):
                logger.error(f"Response: {e.response.text}")
            raise Exception(f"Error creating product: {str(e)}")
    
    def get_user_info(self) -> Dict[str, Any]:
        """Get information about the authenticated user"""
        try:
            user_url = f"/services/oauth2/userinfo"
            
            response = self._make_authenticated_request('GET', user_url)
            response.raise_for_status()
            
            return response.json()
            
        except requests.exceptions.RequestException as e:
            logger.error(f"Error getting user info: {str(e)}")
            raise Exception(f"Error getting user info: {str(e)}")
    
    def revoke_token(self) -> bool:
        """Revoke the current tokens"""
        try:
            revoke_url = f"{self.login_url}/services/oauth2/revoke"
            
            revoke_data = {
                'token': self.access_token or self.refresh_token
            }
            
            response = requests.post(revoke_url, data=revoke_data)
            response.raise_for_status()
            
            # Clear stored tokens
            self.access_token = None
            self.refresh_token = None
            self.instance_url = None
            
            logger.info("Successfully revoked tokens")
            return True
            
        except requests.exceptions.RequestException as e:
            logger.error(f"Error revoking token: {str(e)}")
            return False