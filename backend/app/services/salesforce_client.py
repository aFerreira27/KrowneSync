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
        
    def get_session_id(self) -> Optional[str]:
        """Return the current session ID (access token)"""
        try:
            if not self.is_authenticated():
                raise Exception("Not authenticated. Please complete OAuth flow first.")
            return self.access_token
    
        except Exception as e:
            self.logger.error(f"Error getting user info: {str(e)}")
            raise Exception(f"Error getting user info: {str(e)}")