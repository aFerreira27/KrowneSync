import requests
import logging
import urllib.parse
import secrets
import base64
import hashlib
from typing import List, Dict, Any, Optional, Tuple

logger = logging.getLogger(__name__)

class SalesforceClient:
    def __init__(self, config: Dict[str, str]):
        self.client_id = config['client_id']
        self.client_secret = config['client_secret']
        self.redirect_uri = config.get('redirect_uri', 'http://localhost:5000/api/auth/callback/salesforce')
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
        
        # Initialize session for making requests
        self.session = requests.Session()
        
        # Setup logging
        self.logger = logging.getLogger(__name__)
    
    def _generate_pkce_pair(self) -> Tuple[str, str]:
        """Generate PKCE code verifier and challenge"""
        # Generate code verifier - random string of 43-128 characters
        code_verifier = base64.urlsafe_b64encode(secrets.token_bytes(32)).decode('utf-8').rstrip('=')
        
        # Generate code challenge - SHA256 hash of verifier
        challenge_bytes = hashlib.sha256(code_verifier.encode('utf-8')).digest()
        code_challenge = base64.urlsafe_b64encode(challenge_bytes).decode('utf-8').rstrip('=')
        
        return code_verifier, code_challenge
    
    def get_authorization_url(self, state: Optional[str] = None) -> Dict[str, str]:
        """Generate the authorization URL for OAuth 2.0 web server flow with PKCE"""
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
        self.logger.info(f"Generated authorization URL for Salesforce OAuth with PKCE")
        
        return {
            'auth_url': auth_url,
            'code_verifier': code_verifier,
            'state': state
        }
    
    def exchange_code_for_tokens(self, authorization_code: str, code_verifier: Optional[str] = None) -> Dict[str, Any]:
        """Exchange authorization code for access and refresh tokens with PKCE"""
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
            
            if response.status_code != 200:
                self.logger.error(f"Token exchange failed: {response.status_code} - {response.text}")
                response.raise_for_status()
            
            token_info = response.json()
            
            # Store tokens
            self.access_token = token_info['access_token']
            self.refresh_token = token_info.get('refresh_token')
            self.instance_url = token_info['instance_url']
            
            # Update session headers
            self.session.headers.update({
                'Authorization': f'Bearer {self.access_token}',
                'Content-Type': 'application/json'
            })
            
            # Clear the stored verifier after use
            self._code_verifier = None
            
            self.logger.info("Successfully exchanged authorization code for tokens")
            return token_info
            
        except requests.exceptions.RequestException as e:
            self.logger.error(f"Token exchange failed: {str(e)}")
            if hasattr(e, 'response') and e.response:
                self.logger.error(f"Response: {e.response.text}")
            raise Exception(f"Token exchange failed: {str(e)}")
    
    def refresh_access_token(self) -> bool:
        """Refresh the access token using the refresh token"""
        if not self.refresh_token:
            self.logger.error("No refresh token available")
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
            
            if response.status_code != 200:
                self.logger.error(f"Token refresh failed: {response.status_code} - {response.text}")
                return False
            
            token_info = response.json()
            self.access_token = token_info['access_token']
            self.instance_url = token_info.get('instance_url', self.instance_url)
            
            # Update session headers
            self.session.headers.update({
                'Authorization': f'Bearer {self.access_token}'
            })
            
            self.logger.info("Successfully refreshed access token")
            return True
            
        except requests.exceptions.RequestException as e:
            self.logger.error(f"Token refresh failed: {str(e)}")
            return False
    
    def set_tokens(self, access_token: str, refresh_token: Optional[str], instance_url: str):
        """Manually set tokens (useful when loading from storage)"""
        self.access_token = access_token
        self.refresh_token = refresh_token
        self.instance_url = instance_url
        
        # Update session headers
        self.session.headers.update({
            'Authorization': f'Bearer {self.access_token}',
            'Content-Type': 'application/json'
        })
    
    def is_authenticated(self) -> bool:
        """Check if client has valid authentication"""
        return bool(self.access_token and self.instance_url)
    
    def get_products(self, limit=None, active_only=True):
        """Get products from Salesforce - Fixed query"""
        try:
            if not self.is_authenticated():
                raise Exception("Not authenticated. Please complete OAuth flow first.")
            
            # Fixed SOQL query - removed UnitPrice from Product2
            soql = """
                SELECT Id, Name, ProductCode, Description, 
                       IsActive, Family, CreatedDate, LastModifiedDate
                FROM Product2 
            """
            
            if active_only:
                soql += " WHERE IsActive = true"
            
            soql += " ORDER BY Name"
            
            if limit:
                soql += f" LIMIT {limit}"
            
            self.logger.info(f"Executing SOQL query: {soql}")
            
            response = self.session.get(
                f"{self.instance_url}/services/data/{self.api_version}/query/",
                params={'q': soql}
            )
            
            # Handle token expiration
            if response.status_code == 401:
                self.logger.info("Access token expired, attempting refresh")
                if self.refresh_access_token():
                    response = self.session.get(
                        f"{self.instance_url}/services/data/{self.api_version}/query/",
                        params={'q': soql}
                    )
                else:
                    raise Exception("Token expired and refresh failed")
            
            if response.status_code != 200:
                self.logger.error(f"SOQL query failed: {response.status_code} - {response.text}")
                response.raise_for_status()
            
            data = response.json()
            products = data.get('records', [])
            
            self.logger.info(f"Retrieved {len(products)} products from Salesforce")
            return products
            
        except Exception as e:
            self.logger.error(f"Failed to get products: {str(e)}")
            raise Exception(f"Error retrieving products from Salesforce: {str(e)}")
    
    def get_products_with_prices(self, limit=None, active_only=True):
        """Get products with prices from PricebookEntry"""
        try:
            if not self.is_authenticated():
                raise Exception("Not authenticated. Please complete OAuth flow first.")
            
            # Query to get products with prices from standard price book
            soql = """
                SELECT Product2.Id, Product2.Name, Product2.ProductCode, 
                       Product2.Description, Product2.IsActive, Product2.Family,
                       Product2.CreatedDate, Product2.LastModifiedDate,
                       UnitPrice, Pricebook2.Name as PricebookName
                FROM PricebookEntry 
                WHERE Pricebook2.IsStandard = true
            """
            
            if active_only:
                soql += " AND Product2.IsActive = true AND IsActive = true"
            
            soql += " ORDER BY Product2.Name"
            
            if limit:
                soql += f" LIMIT {limit}"
            
            self.logger.info(f"Executing SOQL query with prices: {soql}")
            
            response = self.session.get(
                f"{self.instance_url}/services/data/{self.api_version}/query/",
                params={'q': soql}
            )
            
            # Handle token expiration
            if response.status_code == 401:
                self.logger.info("Access token expired, attempting refresh")
                if self.refresh_access_token():
                    response = self.session.get(
                        f"{self.instance_url}/services/data/{self.api_version}/query/",
                        params={'q': soql}
                    )
                else:
                    raise Exception("Token expired and refresh failed")
            
            if response.status_code != 200:
                self.logger.error(f"SOQL query failed: {response.status_code} - {response.text}")
                response.raise_for_status()
            
            data = response.json()
            pricebook_entries = data.get('records', [])
            
            # Transform the nested structure to a flatter one
            products = []
            for entry in pricebook_entries:
                if entry.get('Product2'):  # Make sure Product2 data exists
                    product = {
                        'Id': entry['Product2']['Id'],
                        'Name': entry['Product2']['Name'],
                        'ProductCode': entry['Product2']['ProductCode'],
                        'Description': entry['Product2'].get('Description'),
                        'IsActive': entry['Product2']['IsActive'],
                        'Family': entry['Product2'].get('Family'),
                        'CreatedDate': entry['Product2']['CreatedDate'],
                        'LastModifiedDate': entry['Product2']['LastModifiedDate'],
                        'UnitPrice': entry.get('UnitPrice'),
                        'PricebookName': entry.get('PricebookName')
                    }
                    products.append(product)
            
            self.logger.info(f"Retrieved {len(products)} products with prices from Salesforce")
            return products
            
        except Exception as e:
            self.logger.error(f"Failed to get products with prices: {str(e)}")
            raise Exception(f"Error retrieving products with prices from Salesforce: {str(e)}")
    
    def get_price_book_entries(self, pricebook_name='Standard Price Book'):
        """Get price book entries"""
        try:
            if not self.is_authenticated():
                raise Exception("Not authenticated. Please complete OAuth flow first.")
            
            soql = f"""
                SELECT Id, Name, UnitPrice, Product2Id, Product2.Name, 
                       Product2.ProductCode, Pricebook2.Name
                FROM PricebookEntry 
                WHERE Pricebook2.Name = '{pricebook_name}' 
                AND IsActive = true
                ORDER BY Product2.Name
            """
            
            self.logger.info(f"Getting price book entries for: {pricebook_name}")
            
            response = self.session.get(
                f"{self.instance_url}/services/data/{self.api_version}/query/",
                params={'q': soql}
            )
            
            # Handle token expiration
            if response.status_code == 401:
                self.logger.info("Access token expired, attempting refresh")
                if self.refresh_access_token():
                    response = self.session.get(
                        f"{self.instance_url}/services/data/{self.api_version}/query/",
                        params={'q': soql}
                    )
                else:
                    raise Exception("Token expired and refresh failed")
            
            if response.status_code != 200:
                self.logger.error(f"SOQL query failed: {response.status_code} - {response.text}")
                response.raise_for_status()
            
            data = response.json()
            entries = data.get('records', [])
            
            self.logger.info(f"Retrieved {len(entries)} price book entries")
            return entries
            
        except Exception as e:
            self.logger.error(f"Failed to get price book entries: {str(e)}")
            raise Exception(f"Error retrieving price book entries: {str(e)}")
    
    def get_user_info(self) -> Dict[str, Any]:
        """Get information about the authenticated user"""
        try:
            if not self.is_authenticated():
                raise Exception("Not authenticated. Please complete OAuth flow first.")
            
            response = self.session.get(f"{self.instance_url}/services/oauth2/userinfo")
            
            # Handle token expiration
            if response.status_code == 401:
                self.logger.info("Access token expired, attempting refresh")
                if self.refresh_access_token():
                    response = self.session.get(f"{self.instance_url}/services/oauth2/userinfo")
                else:
                    raise Exception("Token expired and refresh failed")
            
            if response.status_code != 200:
                response.raise_for_status()
            
            user_info = response.json()
            self.logger.info(f"Retrieved user info for: {user_info.get('name', 'Unknown')}")
            
            return user_info
            
        except Exception as e:
            self.logger.error(f"Error getting user info: {str(e)}")
            raise Exception(f"Error getting user info: {str(e)}")
    
    def revoke_token(self) -> bool:
        """Revoke the current tokens"""
        try:
            revoke_url = f"{self.login_url}/services/oauth2/revoke"
            
            revoke_data = {
                'token': self.access_token or self.refresh_token
            }
            
            response = requests.post(revoke_url, data=revoke_data)
            
            # Clear stored tokens regardless of response
            self.access_token = None
            self.refresh_token = None
            self.instance_url = None
            
            # Clear session headers
            self.session.headers.pop('Authorization', None)
            
            self.logger.info("Successfully revoked tokens")
            return True
            
        except Exception as e:
            self.logger.error(f"Error revoking token: {str(e)}")
            return False

    def get_pimly_products(self, limit=None, active_only=True):
        """Get products from Pimly via Salesforce"""
        try:
            if not self.is_authenticated():
                raise Exception("Not authenticated. Please complete OAuth flow first.")
            
            # Query Pimly custom objects - adjust field names based on your Pimly setup
            soql = """
                SELECT Id, Name, Pimly__SKU__c, Pimly__Description__c,
                       Pimly__Family__c, Pimly__Price__c, Pimly__Active__c,
                       Pimly__Long_Description__c, Pimly__Short_Description__c,
                       CreatedDate, LastModifiedDate
                FROM Pimly__Product__c
            """
            
            if active_only:
                soql += " WHERE Pimly__Active__c = true"
            
            soql += " ORDER BY Name"
            
            if limit:
                soql += f" LIMIT {limit}"
            
            self.logger.info(f"Executing Pimly SOQL query: {soql}")
            
            response = self.session.get(
                f"{self.instance_url}/services/data/{self.api_version}/query/",
                params={'q': soql}
            )
            
            # Handle token expiration
            if response.status_code == 401:
                self.logger.info("Access token expired, attempting refresh")
                if self.refresh_access_token():
                    response = self.session.get(
                        f"{self.instance_url}/services/data/{self.api_version}/query/",
                        params={'q': soql}
                    )
                else:
                    raise Exception("Token expired and refresh failed")
            
            if response.status_code != 200:
                self.logger.error(f"Pimly SOQL query failed: {response.status_code} - {response.text}")
                response.raise_for_status()
            
            data = response.json()
            products = data.get('records', [])
            
            # Transform Pimly data to standard format
            standardized_products = []
            for product in products:
                standardized_product = {
                    'Id': product.get('Id'),
                    'Name': product.get('Name'),
                    'SKU': product.get('Pimly__SKU__c'),
                    'Description': product.get('Pimly__Description__c') or product.get('Pimly__Long_Description__c'),
                    'Short_Description': product.get('Pimly__Short_Description__c'),
                    'Family': product.get('Pimly__Family__c'),
                    'Price': product.get('Pimly__Price__c'),
                    'Active': product.get('Pimly__Active__c'),
                    'CreatedDate': product.get('CreatedDate'),
                    'LastModifiedDate': product.get('LastModifiedDate'),
                    'Source': 'Pimly'
                }
                standardized_products.append(standardized_product)
            
            self.logger.info(f"Retrieved {len(standardized_products)} Pimly products from Salesforce")
            return standardized_products
            
        except Exception as e:
            self.logger.error(f"Failed to get Pimly products: {str(e)}")
            raise Exception(f"Error retrieving Pimly products from Salesforce: {str(e)}")

    def get_pimly_object_describe(self, object_name='Pimly__Product__c'):
        """Get field information for Pimly objects to understand the schema"""
        try:
            if not self.is_authenticated():
                raise Exception("Not authenticated. Please complete OAuth flow first.")
            
            response = self.session.get(
                f"{self.instance_url}/services/data/{self.api_version}/sobjects/{object_name}/describe/"
            )
            
            if response.status_code == 401:
                if self.refresh_access_token():
                    response = self.session.get(
                        f"{self.instance_url}/services/data/{self.api_version}/sobjects/{object_name}/describe/"
                    )
                else:
                    raise Exception("Token expired and refresh failed")
            
            if response.status_code != 200:
                response.raise_for_status()
            
            describe_data = response.json()
            
            # Extract field information
            fields = []
            for field in describe_data.get('fields', []):
                fields.append({
                    'name': field.get('name'),
                    'label': field.get('label'),
                    'type': field.get('type'),
                    'length': field.get('length'),
                    'required': not field.get('nillable', True)
                })
            
            return {
                'object_name': object_name,
                'label': describe_data.get('label'),
                'fields': fields,
                'total_fields': len(fields)
            }
            
        except Exception as e:
            self.logger.error(f"Failed to describe {object_name}: {str(e)}")
            raise Exception(f"Error describing {object_name}: {str(e)}")

    def discover_pimly_objects(self):
        """Discover all Pimly-related custom objects in Salesforce"""
        try:
            if not self.is_authenticated():
                raise Exception("Not authenticated. Please complete OAuth flow first.")
            
            # Get all custom objects
            response = self.session.get(
                f"{self.instance_url}/services/data/{self.api_version}/sobjects/"
            )
            
            if response.status_code == 401:
                if self.refresh_access_token():
                    response = self.session.get(
                        f"{self.instance_url}/services/data/{self.api_version}/sobjects/"
                    )
                else:
                    raise Exception("Token expired and refresh failed")
            
            if response.status_code != 200:
                response.raise_for_status()
            
            data = response.json()
            
            # Filter for Pimly objects
            pimly_objects = []
            for sobject in data.get('sobjects', []):
                name = sobject.get('name', '')
                if 'pimly' in name.lower() or 'pim' in name.lower():
                    pimly_objects.append({
                        'name': name,
                        'label': sobject.get('label'),
                        'custom': sobject.get('custom', False),
                        'queryable': sobject.get('queryable', False),
                        'createable': sobject.get('createable', False),
                        'updateable': sobject.get('updateable', False),
                        'deletable': sobject.get('deletable', False)
                    })
            
            self.logger.info(f"Discovered {len(pimly_objects)} Pimly-related objects")
            return pimly_objects
            
        except Exception as e:
            self.logger.error(f"Failed to discover Pimly objects: {str(e)}")
            raise Exception(f"Error discovering Pimly objects: {str(e)}")

    def get_pimly_categories(self):
        """Get Pimly product categories/families"""
        try:
            if not self.is_authenticated():
                raise Exception("Not authenticated. Please complete OAuth flow first.")
            
            # Try different possible category object names
            category_objects = [
                'Pimly__Category__c',
                'Pimly__Product_Category__c',
                'Pimly__Family__c',
                'Pimly__Product_Family__c'
            ]
            
            for obj_name in category_objects:
                try:
                    soql = f"""
                        SELECT Id, Name, Pimly__Description__c, Pimly__Active__c
                        FROM {obj_name}
                        WHERE Pimly__Active__c = true
                        ORDER BY Name
                    """
                    
                    response = self.session.get(
                        f"{self.instance_url}/services/data/{self.api_version}/query/",
                        params={'q': soql}
                    )
                    
                    if response.status_code == 200:
                        data = response.json()
                        categories = data.get('records', [])
                        
                        self.logger.info(f"Retrieved {len(categories)} categories from {obj_name}")
                        return categories
                        
                except:
                    continue
            
            # Fallback: get unique families from products
            try:
                soql = """
                    SELECT Pimly__Family__c, COUNT(Id) family_count
                    FROM Pimly__Product__c
                    WHERE Pimly__Family__c != null
                    GROUP BY Pimly__Family__c
                    ORDER BY Pimly__Family__c
                """
                
                response = self.session.get(
                    f"{self.instance_url}/services/data/{self.api_version}/query/",
                    params={'q': soql}
                )
                
                if response.status_code == 200:
                    data = response.json()
                    families = []
                    for record in data.get('records', []):
                        families.append({
                            'Name': record.get('Pimly__Family__c'),
                            'ProductCount': record.get('family_count')
                        })
                    
                    return families
                    
            except:
                pass
            
            return []
            
        except Exception as e:
            self.logger.error(f"Failed to get Pimly categories: {str(e)}")
            raise Exception(f"Error retrieving Pimly categories: {str(e)}")

    def search_pimly_products(self, search_term, limit=20):
        """Search Pimly products by name, SKU, or description"""
        try:
            if not self.is_authenticated():
                raise Exception("Not authenticated. Please complete OAuth flow first.")
            
            # Use SOSL (Salesforce Object Search Language) for better search
            sosl = f"""
                FIND {{'{search_term}'}} IN ALL FIELDS
                RETURNING Pimly__Product__c(
                    Id, Name, Pimly__SKU__c, Pimly__Description__c,
                    Pimly__Family__c, Pimly__Price__c, Pimly__Active__c
                    WHERE Pimly__Active__c = true
                    LIMIT {limit}
                )
            """
            
            response = self.session.get(
                f"{self.instance_url}/services/data/{self.api_version}/search/",
                params={'q': sosl}
            )
            
            if response.status_code == 401:
                if self.refresh_access_token():
                    response = self.session.get(
                        f"{self.instance_url}/services/data/{self.api_version}/search/",
                        params={'q': sosl}
                    )
                else:
                    raise Exception("Token expired and refresh failed")
            
            if response.status_code != 200:
                # Fallback to SOQL with LIKE operator
                soql = f"""
                    SELECT Id, Name, Pimly__SKU__c, Pimly__Description__c,
                           Pimly__Family__c, Pimly__Price__c, Pimly__Active__c
                    FROM Pimly__Product__c
                    WHERE (Name LIKE '%{search_term}%' 
                       OR Pimly__SKU__c LIKE '%{search_term}%'
                       OR Pimly__Description__c LIKE '%{search_term}%')
                       AND Pimly__Active__c = true
                    ORDER BY Name
                    LIMIT {limit}
                """
                
                response = self.session.get(
                    f"{self.instance_url}/services/data/{self.api_version}/query/",
                    params={'q': soql}
                )
            
            if response.status_code != 200:
                response.raise_for_status()
            
            data = response.json()
            
            # Handle SOSL vs SOQL response format
            if 'searchRecords' in data:
                # SOSL response
                products = data['searchRecords']
            else:
                # SOQL response
                products = data.get('records', [])
            
            self.logger.info(f"Found {len(products)} Pimly products matching '{search_term}'")
            return products
            
        except Exception as e:
            self.logger.error(f"Failed to search Pimly products: {str(e)}")
            raise Exception(f"Error searching Pimly products: {str(e)}")

    def describe_pimly_object(self, object_name):
        """Alias for get_pimly_object_describe for consistency with routes"""
        return self.get_pimly_object_describe(object_name)