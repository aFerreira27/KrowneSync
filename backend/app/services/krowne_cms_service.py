
# app/services/krowne_cms_service.py
import requests
import logging
import re
from datetime import datetime, timedelta
from typing import Dict, Any, Optional, Tuple
from urllib.parse import urljoin, urlparse

logger = logging.getLogger(__name__)

class KrowneCMSService:
    """Service for interacting with Krowne CMS Admin panel"""
    
    def __init__(self, base_url: str = "https://krowne.com"):
        self.base_url = base_url.rstrip('/') + '/'
        self.admin_url = f"{base_url}/cmsAdmin/admin.php"
        self.session_timeout = timedelta(hours=24)
        
        # Default headers to mimic a real browser - FIXED INDENTATION
        self.default_headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
            'Accept-Encoding': 'gzip, deflate, br',
            'DNT': '1',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1',
        }
        
        self.logger = logging.getLogger(__name__)
    
    def authenticate(self, username: str, password: str) -> Dict[str, Any]:
        """
        Authenticate with Krowne CMS Admin panel
        
        Args:
            username: The username to authenticate with
            password: The password to authenticate with
            
        Returns:
            Dict containing 'success', 'userInfo', 'error', and optionally 'session_data'
        """
        try:
            self.logger.info(f"Attempting Krowne CMS authentication for user: {username}")
            
            # Create a session to maintain cookies
            session = requests.Session()
            session.headers.update(self.default_headers)
            
            # Step 1: Get the login page
            login_page_response = self._get_login_page(session)
            if not login_page_response['success']:
                return login_page_response
            
            # Step 2: Extract form data and tokens
            form_data = self._extract_form_data(login_page_response['response'], username, password)
            
            # Step 3: Submit login credentials
            login_result = self._submit_login(session, form_data)
            if not login_result['success']:
                return login_result
            
            # Step 4: Verify authentication success
            auth_verification = self._verify_authentication(login_result['response'], username)
            if not auth_verification['success']:
                return auth_verification
            
            # Step 5: Extract user information
            user_info = self._extract_user_info(login_result['response'], username)
            
            self.logger.info(f"Krowne CMS authentication successful for user: {username}")
            
            return {
                'success': True,
                'userInfo': user_info,
                'session_data': {
                    'cookies': dict(session.cookies),
                    'final_url': login_result['response'].url,
                    'authenticated_at': datetime.now().isoformat()
                }
            }
            
        except Exception as e:
            self.logger.error(f"Krowne CMS authentication error: {str(e)}", exc_info=True)
            return {
                'success': False,
                'error': f'Authentication system error: {str(e)}'
            }
    
    def _get_login_page(self, session: requests.Session) -> Dict[str, Any]:
        """Get the login page and return response"""
        try:
            self.logger.debug(f"Fetching login page: {self.admin_url}")
            
            response = session.get(self.admin_url, timeout=10)
            response.raise_for_status()
            
            self.logger.debug(f"Login page retrieved successfully (status: {response.status_code})")
            
            return {
                'success': True,
                'response': response
            }
            
        except requests.exceptions.RequestException as e:
            self.logger.error(f"Failed to retrieve login page: {str(e)}")
            return {
                'success': False,
                'error': f'Could not connect to Krowne CMS: {str(e)}'
            }
    
    def _extract_form_data(self, response: requests.Response, username: str, password: str) -> Dict[str, str]:
        """Extract form data including CSRF tokens from the login page"""
        form_data = {
            'username': username,
            'password': password,
            'action': 'loginSubmit',
            'redirectUrl': '',
            'login': '1'
        }
        
        try:
            from bs4 import BeautifulSoup
            soup = BeautifulSoup(response.text, 'html.parser')
            
            # Extract CSRF token - this is critical for Krowne CMS
            csrf_input = soup.find('input', {'name': '_CSRFToken'})
            if csrf_input and csrf_input.get('value'):
                form_data['_CSRFToken'] = csrf_input.get('value')
                self.logger.debug(f"Found CSRF token: {csrf_input.get('value')[:10]}...")
            else:
                self.logger.warning("No CSRF token found - this may cause authentication to fail")
            
            # Look for the login form specifically
            login_form = soup.find('form', {'method': 'post'})
            
            if login_form:
                # Extract all hidden input fields
                hidden_inputs = login_form.find_all('input', type='hidden')
                for hidden_input in hidden_inputs:
                    name = hidden_input.get('name')
                    value = hidden_input.get('value', '')
                    if name and name not in form_data:  # Don't override what we already set
                        form_data[name] = value
                        self.logger.debug(f"Found hidden field: {name}")
                
                # Get the actual form action if different
                form_action = login_form.get('action')
                if form_action:
                    self.logger.debug(f"Form action: {form_action}")
                
                # Check submit button details
                submit_button = login_form.find('button', {'name': 'login'}) or login_form.find('input', {'name': 'login'})
                if submit_button:
                    submit_value = submit_button.get('value', '1')
                    form_data['login'] = submit_value
                    self.logger.debug(f"Submit button value: {submit_value}")
            
        except ImportError:
            self.logger.warning("BeautifulSoup not installed, using basic form data")
        except Exception as e:
            self.logger.warning(f"Could not parse login form: {str(e)}")
        
        self.logger.debug(f"Form data prepared with {len(form_data)} fields: {list(form_data.keys())}")
        return form_data
    
    def _submit_login(self, session: requests.Session, form_data: Dict[str, str]) -> Dict[str, Any]:
        """Submit login credentials"""
        try:
            headers = self.default_headers.copy()
            headers.update({
                'Content-Type': 'application/x-www-form-urlencoded',
                'Referer': self.admin_url
            })
            
            self.logger.debug(f"Submitting login to: {self.admin_url}")
            
            response = session.post(
                self.admin_url,
                data=form_data,
                headers=headers,
                timeout=10,
                allow_redirects=True
            )
            
            self.logger.debug(f"Login submission response: {response.status_code}, URL: {response.url}")
            
            return {
                'success': True,
                'response': response
            }
            
        except requests.exceptions.RequestException as e:
            self.logger.error(f"Login submission failed: {str(e)}")
            return {
                'success': False,
                'error': f'Login request failed: {str(e)}'
            }
    
    def _verify_authentication(self, response: requests.Response, username: str) -> Dict[str, Any]:
        """Verify if authentication was successful"""
        try:
            self.logger.debug(f"Verifying authentication - Status: {response.status_code}, URL: {response.url}")
            
            # Method 1: Check URL redirection
            # Successful login usually redirects away from admin.php or to admin.php with different params
            if response.url != self.admin_url:
                self.logger.info(f"Authentication successful - redirected from {self.admin_url} to {response.url}")
                return {'success': True}
            
            # Method 2: Check response content for Krowne CMS specific indicators
            response_text = response.text.lower()
            
            # Krowne CMS specific success indicators
            success_indicators = [
                'main-navigation-menu',  # The admin navigation menu
                'sidebar-title',         # The sidebar with admin functions
                'logout',               # Logout link/button
                'welcome',              # Welcome message
                'dashboard',            # Dashboard content
                'main-container',       # Main admin container (if different from login)
                'cms admin',            # CMS admin title
                'krowne cms'            # Krowne CMS branding in admin area
            ]
            
            # Krowne CMS specific error indicators
            error_indicators = [
                'login',                    # Login form still present
                'username',                 # Username field still present
                'password',                 # Password field still present
                'forgot your password',     # Forgot password link
                'javascript is disabled',   # Login page warning
                'invalid',                  # Invalid credentials message
                'error',                    # Generic error message
                'incorrect'                 # Incorrect login
            ]
            
            # Count indicators
            success_count = sum(1 for indicator in success_indicators if indicator in response_text)
            error_count = sum(1 for indicator in error_indicators if indicator in response_text)
            
            self.logger.debug(f"Success indicators found: {success_count}, Error indicators found: {error_count}")
            
            # If we find admin-specific content and no login form, likely successful
            if success_count >= 2 and error_count <= 2:
                self.logger.info("Authentication successful - found admin interface indicators")
                return {'success': True}
            
            # If we still see the login form elements, login likely failed
            if 'forgot your password' in response_text and 'username' in response_text:
                self.logger.warning("Authentication failed - login form still present")
                return {
                    'success': False,
                    'error': 'Authentication failed - please check your credentials'
                }
            
            # Method 3: Check for specific Krowne CMS admin elements
            try:
                from bs4 import BeautifulSoup
                soup = BeautifulSoup(response.text, 'html.parser')
                
                # Look for admin-specific elements
                admin_elements = [
                    soup.find('div', {'class': 'main-navigation-menu'}),
                    soup.find('div', {'class': 'sidebar-title'}),
                    soup.find('ul', {'id': 'main-nav'}),
                    soup.find('div', {'class': 'main-container'})
                ]
                
                admin_elements_found = sum(1 for element in admin_elements if element)
                
                # Look for login form elements
                login_elements = [
                    soup.find('input', {'name': 'username'}),
                    soup.find('input', {'name': 'password'}),
                    soup.find('input', {'name': '_CSRFToken'})
                ]
                
                login_elements_found = sum(1 for element in login_elements if element)
                
                self.logger.debug(f"Admin elements found: {admin_elements_found}, Login elements found: {login_elements_found}")
                
                if admin_elements_found >= 2 and login_elements_found == 0:
                    self.logger.info("Authentication successful - found admin elements, no login form")
                    return {'success': True}
                
                if login_elements_found >= 2:
                    self.logger.warning("Authentication failed - login form still present")
                    return {
                        'success': False,
                        'error': 'Invalid username or password'
                    }
                
            except ImportError:
                self.logger.warning("BeautifulSoup not available for detailed verification")
            except Exception as e:
                self.logger.warning(f"Error in detailed verification: {str(e)}")
            
            # Method 4: Default based on HTTP status
            if response.status_code == 200:
                # If we can't determine definitively, check content length
                # Login page is typically shorter than admin dashboard
                if len(response.text) > 10000:  # Admin pages are usually longer
                    self.logger.info("Authentication likely successful - large response content")
                    return {'success': True}
                else:
                    self.logger.warning("Authentication likely failed - small response content")
                    return {
                        'success': False,
                        'error': 'Authentication failed - received login page response'
                    }
            
            # Default to failure
            return {
                'success': False,
                'error': f'Authentication failed (HTTP {response.status_code})'
            }
            
        except Exception as e:
            self.logger.error(f"Error verifying authentication: {str(e)}")
            return {
                'success': False,
                'error': f'Could not verify authentication: {str(e)}'
            }
    
    def _extract_user_info(self, response: requests.Response, username: str) -> Dict[str, Any]:
        """Extract user information from authenticated response"""
        user_info = {
            'username': username,
            'email': f'{username}@krowne.com',
            'role': 'admin',
            'authenticated': True,
            'login_time': datetime.now().isoformat(),
            'display_name': username.title()
        }
        
        try:
            from bs4 import BeautifulSoup
            soup = BeautifulSoup(response.text, 'html.parser')
            
            # Try to extract user information from common locations
            selectors_to_try = [
                # Email selectors
                ('.user-email', 'email'),
                ('.email', 'email'),
                ('[data-user-email]', 'email'),
                
                # Name selectors
                ('.user-name', 'display_name'),
                ('.username', 'display_name'),
                ('.display-name', 'display_name'),
                ('[data-user-name]', 'display_name'),
                
                # Role selectors
                ('.user-role', 'role'),
                ('.role', 'role'),
                ('[data-user-role]', 'role'),
            ]
            
            for selector, field in selectors_to_try:
                try:
                    element = soup.select_one(selector)
                    if element and element.get_text(strip=True):
                        user_info[field] = element.get_text(strip=True)
                        self.logger.debug(f"Extracted {field}: {user_info[field]}")
                except Exception as e:
                    self.logger.debug(f"Could not extract {field} using {selector}: {str(e)}")
            
            # Try to extract from data attributes
            for element in soup.find_all(attrs=lambda x: x and any(attr.startswith('data-user-') for attr in x.keys())):
                for attr, value in element.attrs.items():
                    if attr.startswith('data-user-') and value:
                        field_name = attr.replace('data-user-', '')
                        user_info[field_name] = value
                        self.logger.debug(f"Extracted from data attribute {attr}: {value}")
            
        except ImportError:
            self.logger.warning("BeautifulSoup not available for user info extraction")
        except Exception as e:
            self.logger.warning(f"Could not extract detailed user info: {str(e)}")
        
        return user_info
    
    def verify_session(self, session_data: Dict[str, Any]) -> bool:
        """Verify if a stored session is still valid"""
        try:
            if not session_data:
                return False
            
            # Check session age
            auth_time_str = session_data.get('authenticated_at')
            if auth_time_str:
                auth_time = datetime.fromisoformat(auth_time_str)
                if datetime.now() - auth_time > self.session_timeout:
                    self.logger.info("Session expired due to timeout")
                    return False
            
            # Make a test request to verify the session is still active
            cookies = session_data.get('cookies', {})
            if not cookies:
                return False
                
            session = requests.Session()
            session.headers.update(self.default_headers)
            
            # Set cookies from stored session
            for name, value in cookies.items():
                session.cookies.set(name, value)
            
            # Make a quick request to check if still authenticated
            response = session.get(self.admin_url, timeout=5)
            
            if response.status_code == 200:
                response_text = response.text.lower()
                # Check for admin indicators
                if any(indicator in response_text for indicator in ['logout', 'menu=product', 'cms admin']):
                    return True
            
            return False
            
        except Exception as e:
            self.logger.error(f"Error verifying session: {str(e)}")
            return False
    
    def get_user_data(self, session_data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Fetch current user data using stored session"""
        try:
            cookies = session_data.get('cookies', {})
            if not cookies:
                return None
            
            session = requests.Session()
            session.headers.update(self.default_headers)
            
            # Set cookies from stored session
            for name, value in cookies.items():
                session.cookies.set(name, value)
            
            # Make a request to get user data
            response = session.get(self.admin_url, timeout=10)
            
            if response.status_code == 200:
                # Extract user info from the response
                username = session_data.get('userInfo', {}).get('username', 'unknown')
                return self._extract_user_info(response, username)
            
            return None
            
        except Exception as e:
            self.logger.error(f"Error fetching user data: {str(e)}")
            return None
    
    def getRecNumFromSKU(self, sku: str, session_data: Optional[Dict] = None) -> Optional[str]:
        """
        Search for a product by SKU and extract the Record Number from the results.
        Returns the Record Number if found, None otherwise.
        
        Args:
            sku: The SKU to search for
            session_data: Optional authenticated session data
        """
        try:
            if not sku:
                self.logger.warning("SKU is required for record number search")
                return None
            
            # Create session with authentication if provided
            session = requests.Session()
            session.headers.update(self.default_headers)
            
            # If session_data provided, restore cookies
            if session_data and 'cookies' in session_data:
                for name, value in session_data['cookies'].items():
                    session.cookies.set(name, value)
            
            self.logger.info(f"Attempting to locate RecNum from SKU: {sku}")

            # First, get the search form to extract CSRF token
            search_page_url = urljoin(self.admin_url, '?menu=product')
            self.logger.debug(f"Accessing product search page: {search_page_url}")
            
            response = session.get(search_page_url, timeout=10)
            
            if response.status_code != 200:
                self.logger.error(f"Failed to load search page: HTTP {response.status_code}")
                return None
            
            # Parse the page to get CSRF token
            from bs4 import BeautifulSoup
            soup = BeautifulSoup(response.text, 'html.parser')
            
            csrf_token = None
            csrf_input = soup.find('input', {'name': '_CSRFToken'})
            if csrf_input:
                csrf_token = csrf_input.get('value')
            
            if not csrf_token:
                self.logger.error("Could not find CSRF token on search page")
                return None
            
            self.logger.debug(f"Found CSRF token for search: {csrf_token[:10]}...")
            
            # Prepare search form data
            form_data = {
                '_CSRFToken': csrf_token,
                'menu': 'product',
                '_defaultAction': 'list',
                'page': '1',
                'search': '1',
                'sku_query': sku,  # Using sku_query as per the form field name
                'perPage': '25'
            }
            
            # Submit the search form
            search_url = urljoin(self.admin_url, '?')
            self.logger.debug(f"Submitting search for SKU: {sku}")
            
            response = session.post(search_url, data=form_data, timeout=10)
            
            if response.status_code != 200:
                self.logger.error(f"Search request failed: HTTP {response.status_code}")
                return None
            
            # Parse the search results
            soup = BeautifulSoup(response.text, 'html.parser')
            self.logger.info(f"Page html {soup}")
            # Find the results table
            table = soup.find('table', {'class': 'data'})
            if not table:
                self.logger.warning(f"No results table found for SKU: {sku}")
                return None
            
            # Look for the product row in the table body
            tbody = table.find('tbody')
            if not tbody:
                self.logger.warning(f"No table body found for SKU: {sku}")
                return None
            
            # Find the row containing the SKU
            for row in tbody.find_all('tr'):
                cells = row.find_all('td')
                if len(cells) >= 6:  # Ensure we have enough columns
                    # Based on the HTML structure you provided:
                    # Column 0: checkbox
                    # Column 1: drag handle
                    # Column 2: HIDE checkbox
                    # Column 3: Created date
                    # Column 4: Record Number
                    # Column 5: SKU
                    
                    # Check if this row has our SKU
                    sku_cell = cells[5] if len(cells) > 5 else None
                    if sku_cell:
                        sku_text = sku_cell.get_text(strip=True)
                        if sku_text == sku:
                            # The Record Number is in column 4
                            record_num_cell = cells[4] if len(cells) > 4 else None
                            if record_num_cell:
                                record_num = record_num_cell.get_text(strip=True)
                                self.logger.info(f"Found Record Number {record_num} for SKU {sku}")
                                return record_num
            
            # Alternative approach: If there's only one result, get the record number from hidden input
            record_inputs = soup.find_all('input', {'name': '_recordNum', 'class': '_recordNum'})
            if record_inputs and len(record_inputs) == 1:
                record_num = record_inputs[0].get('value')
                if record_num:
                    self.logger.info(f"Found Record Number {record_num} for SKU {sku} (via hidden input)")
                    return record_num
            
            # Another alternative: Look for modify link which contains the record number
            modify_links = soup.find_all('a', href=True, text='modify')
            for link in modify_links:
                href = link.get('href')
                if href and 'num=' in href:
                    # Extract record number from URL like ?menu=product&action=edit&num=7187
                    match = re.search(r'num=(\d+)', href)
                    if match:
                        record_num = match.group(1)
                        # Verify this is for our SKU by checking the row
                        row = link.find_parent('tr')
                        if row:
                            cells = row.find_all('td')
                            if len(cells) > 5:
                                sku_cell = cells[5]
                                if sku_cell and sku_cell.get_text(strip=True) == sku:
                                    self.logger.info(f"Found Record Number {record_num} for SKU {sku} (via modify link)")
                                    return record_num
            
            self.logger.warning(f"No matching product found for SKU: {sku}")
            return None
            
        except Exception as e:
            self.logger.error(f"Error searching for SKU {sku}: {str(e)}", exc_info=True)
            return None
        
    def search_product_by_sku(self, sku: str, session_data: Optional[Dict] = None) -> Optional[Dict[str, Any]]:
        """
        Search for a product by SKU in Krowne CMS
        
        Args:
            sku: The SKU to search for
            session_data: Optional authenticated session data
        """
        try:
            if not sku:
                self.logger.warning("SKU is required for product search")
                return None
            
            self.logger.info(f"Searching for product with SKU: {sku}")
            
            # First get the record number for this SKU
            recNum = self.getRecNumFromSKU(sku, session_data)
            
            if not recNum:
                self.logger.warning(f"Could not find record number for SKU: {sku}")
                return None
            
            self.logger.debug(f"Found record number {recNum} for SKU {sku}, fetching product details")
            
            # Use get_product_by_record_number to fetch the details
            product_info = self.get_product_by_record_number(recNum, session_data)
            
            if product_info:
                # Add SKU to the product info if not already present
                if 'sku' not in product_info or not product_info['sku']:
                    product_info['sku'] = sku
                
                self.logger.info(f"Successfully retrieved product info for SKU {sku}")
                return product_info
            else:
                self.logger.error(f"Failed to retrieve product details for record number {recNum}")
                return None
                
        except Exception as e:
            self.logger.error(f"Error searching for product by SKU {sku}: {str(e)}", exc_info=True)
            return None
        
    def get_product_by_record_number(self, record_number: str, session_data: Optional[Dict] = None) -> Optional[Dict[str, Any]]:
        """
        Get product details by record number
        
        Args:
            record_number: The record number to fetch
            session_data: Optional authenticated session data
        """
        try:
            if not record_number:
                self.logger.warning("Record number is required for product lookup")
                return None
            
            self.logger.info(f"Fetching product with record number: {record_number}")
            
            # Create session with authentication if provided
            session = requests.Session()
            session.headers.update(self.default_headers)
            
            # If session_data provided, restore cookies
            if session_data and 'cookies' in session_data:
                for name, value in session_data['cookies'].items():
                    session.cookies.set(name, value)

            # Make a request to view the specific product record
            view_url = urljoin(self.admin_url, f'?menu=product&action=view&num={record_number}')
            self.logger.debug(f"Fetching product details from: {view_url}")
            
            response = session.get(view_url, timeout=10)
            
            if response.status_code != 200:
                self.logger.error(f"Failed to view product record {record_number}: HTTP {response.status_code}")
                return None
            
            # Check if we got a view page or a search results page
            if 'action=view' not in response.url and 'Search' in response.text and 'returned' in response.text:
                self.logger.error(f"Got search results page instead of product view for record {record_number}")
                return None
            
            # Parse the response to extract product details
            from bs4 import BeautifulSoup
            soup = BeautifulSoup(response.text, 'html.parser')
            
            # Verify this is a product view page by checking for specific elements
            page_title = soup.find('h3')
            if not page_title or 'Products' not in page_title.get_text():
                self.logger.error(f"Page does not appear to be a product view page for record {record_number}")
                return None
            
            product_info = {
                'record_number': record_number,
                'source': 'krowne_cms'
            }
            
            # Extract product details using the form-group structure
            form_groups = soup.find_all('div', class_='form-group')
            
            for group in form_groups:
                label_element = group.find('div', class_='control-label')
                value_element = group.find('div', {'style': 'padding-top: 7px'})
                
                # Alternative: look for col-sm-10 class
                if not value_element:
                    value_element = group.find('div', class_='col-sm-10')
                
                if label_element and value_element:
                    label = label_element.get_text(strip=True)
                    
                    # Skip certain labels that aren't actual product fields
                    skip_labels = ['Created', 'Created By', 'Last Updated', 'Last Updated By']
                    if label in skip_labels:
                        continue
                    
                    # Get the value text
                    value_text = ''
                    
                    # Check for iframe (for uploads like images, downloads)
                    iframe = value_element.find('iframe')
                    if iframe:
                        # This is an upload field, skip for now or handle specially
                        continue
                    
                    # Check for checkbox input
                    checkbox = value_element.find('input', {'type': 'checkbox'})
                    if checkbox:
                        value_text = 'Yes' if checkbox.get('checked') else 'No'
                    else:
                        # Extract text between span tags, ignoring help text
                        spans = value_element.find_all('span')
                        if len(spans) >= 2:
                            # Get all text from the value element
                            full_text = value_element.get_text(separator='|', strip=True)
                            parts = full_text.split('|')
                            
                            # The actual value is usually the middle part
                            if len(parts) >= 3:
                                value_text = parts[1].strip()
                            elif len(parts) == 2:
                                value_text = parts[0].strip()
                            else:
                                value_text = full_text.strip()
                        else:
                            value_text = value_element.get_text(strip=True)
                    
                    # Clean and store the field
                    field_name = self._clean_field_name(label)
                    if value_text and value_text not in ['', '<!-- -->']:
                        product_info[field_name] = value_text
            
            # Extract categories from the categories table
            categories = []
            category_table = soup.find('table', {'data-table': 'product_category'})
            if category_table:
                tbody = category_table.find('tbody')
                if tbody:
                    for row in tbody.find_all('tr'):
                        cells = row.find_all('td')
                        # Category is in the second column (index 1)
                        if len(cells) > 1:
                            category_cell = cells[1]
                            if category_cell:
                                # Remove the link icon if present
                                for link in category_cell.find_all('a'):
                                    link.decompose()
                                category_text = category_cell.get_text(strip=True)
                                if category_text and category_text not in categories:
                                    categories.append(category_text)
            
            if categories:
                product_info['categories'] = categories
            
            self.logger.info(f"Successfully extracted {len(product_info)} fields for record {record_number}")
            return product_info
            
        except Exception as e:
            self.logger.error(f"Error fetching product by record number {record_number}: {str(e)}", exc_info=True)
            return None

    def _clean_field_name(self, label: str) -> str:
        """
        Clean and standardize field names
        """
        # Remove special characters and convert to snake_case
        clean_name = label.lower()
        clean_name = clean_name.replace(' ', '_')
        clean_name = clean_name.replace('-', '_')
        clean_name = clean_name.replace('/', '_')
        clean_name = clean_name.replace('(', '')
        clean_name = clean_name.replace(')', '')
        clean_name = clean_name.replace('.', '')
        clean_name = clean_name.replace('&', 'and')
        clean_name = clean_name.replace('#', 'number')
        
        # Remove multiple underscores
        while '__' in clean_name:
            clean_name = clean_name.replace('__', '_')
        
        # Remove leading/trailing underscores
        clean_name = clean_name.strip('_')
        
        return clean_name
# Helper function for testing
def test_krowne_auth():
    """Test the Krowne CMS authentication"""
    import os
    
    username = os.getenv('KROWNE_USERNAME', 'your_username')
    password = os.getenv('KROWNE_PASSWORD', 'your_password')
    
    if username == 'your_username' or password == 'your_password':
        print("❌ Please set KROWNE_USERNAME and KROWNE_PASSWORD environment variables")
        return
    
    cms_service = KrowneCMSService()
    
    try:
        result = cms_service.authenticate(username, password)
        
        if result.get('success'):
            print("✅ Authentication successful")
            print(f"User: {result.get('userInfo', {}).get('username')}")
            print(f"Role: {result.get('userInfo', {}).get('role')}")
            
            # Test session verification
            session_data = result.get('session_data')
            if cms_service.verify_session(session_data):
                print("✅ Session verification successful")
            else:
                print("⚠️ Session verification failed")
                
        else:
            print(f"❌ Authentication failed: {result.get('error')}")
            
    except Exception as e:
        print(f"❌ Test failed with exception: {str(e)}")


if __name__ == "__main__":
    # Enable debug logging for testing
    logging.basicConfig(level=logging.DEBUG)
    test_krowne_auth()