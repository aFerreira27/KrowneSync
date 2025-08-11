import os
import secrets
import logging
import math
from typing import Optional, Dict, Any

from flask import Blueprint, request, jsonify, current_app, session, url_for, redirect
from werkzeug.utils import secure_filename
from datetime import datetime

from app.services.salesforce_client import SalesforceClient
from app.services.pimly_client import PimlyClient
from app.services.krowne_cms_service import KrowneCMSService
from app.services.krowne_scraper import KrowneScraper
from app.services.extract_skus import extract_known_ids_from_csv
from app.services.product_data_mapper import ProductDataMapper
from app.services.mapped_data_comparator import MappedDataComparator

BASEURL = "https://krowne.com"

main = Blueprint('main', __name__)

# Configure logging
logger = logging.getLogger(__name__)

krowne_cms_service = KrowneCMSService()
mapped_comparator = MappedDataComparator()
krowne_scraper = KrowneScraper()


def get_authenticated_sf_client():
    """Helper function to get authenticated Salesforce client"""
    sf_tokens = session.get('sf_tokens')
    if not sf_tokens:
        raise Exception('Not authenticated with Salesforce. Please login first.')
    
    config = sf_tokens['client_config']
    sf_client = SalesforceClient(config)
    sf_client.set_tokens(
        sf_tokens['access_token'],
        sf_tokens['refresh_token'],
        sf_tokens['instance_url']
    )
    
    return sf_client

krowne_cms_service = KrowneCMSService()
mapped_comparator = MappedDataComparator()




### Salesforce OAuth Routes ###

@main.route('/api/auth/salesforce/initiate', methods=['POST'])
def initiate_salesforce_auth():
    try:
        client_id = current_app.config.get('SALESFORCE_CLIENT_ID')
        client_secret = current_app.config.get('SALESFORCE_CLIENT_SECRET')
        redirect_uri = current_app.config.get('SALESFORCE_REDIRECT_URI')
        sandbox = current_app.config.get('SALESFORCE_SANDBOX', False)
        

        if not client_id or not client_secret or not redirect_uri:
            missing = [key for key, val in {
                'SALESFORCE_CLIENT_ID': client_id,
                'SALESFORCE_CLIENT_SECRET': client_secret,
                'SALESFORCE_REDIRECT_URI': redirect_uri
            }.items() if not val]
            return jsonify({'error': f'Missing configuration: {", ".join(missing)}'}), 500

        config = {
            'client_id': client_id,
            'client_secret': client_secret,
            'redirect_uri': redirect_uri,
            'sandbox': sandbox
        }
        sf_client = SalesforceClient(config)
        auth_data = sf_client.get_authorization_url()

        session['oauth_state'] = auth_data['state']
        session['code_verifier'] = auth_data['code_verifier']
        session['sf_config'] = config

        return jsonify({
            'auth_url': auth_data['auth_url'],
            'redirect_uri': redirect_uri,
            'state': auth_data['state'],
            'sandbox': sandbox
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@main.route('/api/auth/callback/salesforce')
def salesforce_callback():
    try:
        logger.info("=== SALESFORCE OAUTH CALLBACK STARTED ===")
        code = request.args.get('code')
        state = request.args.get('state')
        error = request.args.get('error')

        if error:
            error_description = request.args.get('error_description', 'Unknown error')
            logger.error(f"OAuth error: {error} - {error_description}")
            return redirect(f"http://localhost:3000/?error={error}&error_description={error_description}")

        if not code:
            logger.error("No authorization code received from Salesforce")
            return redirect("http://localhost:3000/?error=no_code&message=No authorization code received")

        session_state = session.get('oauth_state')
        code_verifier = session.get('code_verifier')
        sf_config = session.get('sf_config')

        if not state or state != session_state:
            logger.error(f"State mismatch: {state} != {session_state}")
            return redirect("http://localhost:3000/?error=invalid_state&message=State parameter mismatch")

        if not sf_config or not code_verifier:
            logger.error("Missing session data for OAuth")
            return redirect("http://localhost:3000/?error=session_expired&message=OAuth session expired")

        sf_client = SalesforceClient(sf_config)
        token_info = sf_client.exchange_code_for_tokens(code, code_verifier)

        if not token_info.get('access_token') or not token_info.get('instance_url'):
            raise Exception("Missing tokens in response")

        session['sf_tokens'] = {
            'access_token': token_info['access_token'],
            'refresh_token': token_info.get('refresh_token'),
            'instance_url': token_info['instance_url'],
            'client_config': sf_config
        }

        # Test tokens
        sf_client.set_tokens(token_info['access_token'], token_info.get('refresh_token'), token_info['instance_url'])
        user_info = sf_client.get_user_info()
        logger.info(f"User info: {user_info.get('display_name', 'Unknown')}")

        # Clean temporary session data
        for key in ['oauth_state', 'code_verifier', 'sf_config']:
            session.pop(key, None)
        session.modified = True

        logger.info("=== SALESFORCE OAUTH CALLBACK COMPLETED SUCCESSFULLY ===")
        return redirect("http://localhost:3000/?auth=success")

    except Exception as e:
        logger.error(f"OAuth callback error: {str(e)}", exc_info=True)
        for key in ['oauth_state', 'code_verifier', 'sf_config']:
            session.pop(key, None)
        session.modified = True
        return redirect(f"http://localhost:3000/?error=auth_failed&message={str(e)}")

@main.route('/api/salesforce/status')
def salesforce_auth_status():
    try:
        sf_tokens = session.get('sf_tokens')
        if not sf_tokens:
            return jsonify({'authenticated': False})

        config = sf_tokens['client_config']
        sf_client = SalesforceClient(config)
        sf_client.set_tokens(sf_tokens['access_token'], sf_tokens['refresh_token'], sf_tokens['instance_url'])

        try:
            user_info = sf_client.get_user_info()
            return jsonify({'authenticated': True, 'user_info': user_info, 'instance_url': sf_tokens['instance_url']})
        except Exception:
            if sf_client.refresh_access_token():
                session['sf_tokens']['access_token'] = sf_client.access_token
                user_info = sf_client.get_user_info()
                return jsonify({'authenticated': True, 'user_info': user_info, 'instance_url': sf_client.instance_url})
            else:
                session.pop('sf_tokens', None)
                return jsonify({'authenticated': False})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@main.route('/api/salesforce/user', methods=['GET'])
def get_salesforce_user():
    try:
        sf_client = get_authenticated_sf_client()
        user_info = sf_client.get_user_info()
        return jsonify(user_info)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@main.route('/api/salesforce/logout', methods=['POST'])
def salesforce_logout():
    try:
        sf_tokens = session.get('sf_tokens')
        if sf_tokens:
            config = sf_tokens['client_config']
            sf_client = SalesforceClient(config)
            sf_client.set_tokens(sf_tokens['access_token'], sf_tokens['refresh_token'], sf_tokens['instance_url'])
            sf_client.revoke_token()
        session.pop('sf_tokens', None)
        return jsonify({'success': True, 'message': 'Logged out successfully'})
    except Exception as e:
        session.pop('sf_tokens', None)
        return jsonify({'success': True, 'message': 'Logged out (with errors)'})

### Krowne CMS Authentication Routes ###

@main.route('/api/auth/krowne/login', methods=['POST'])
def krowne_login():
    try:
        data = request.get_json()
        username = data.get('username')
        password = data.get('password')
        if not username or not password:
            return jsonify({'success': False, 'error': 'Username and password are required'}), 400
        auth_result = krowne_cms_service.authenticate(username, password)
        if auth_result['success']:
            session['krowne_auth'] = {
                'authenticated': True,
                'userInfo': auth_result['userInfo'],
                'timestamp': datetime.now().isoformat(),
                'session_data': auth_result.get('session_data', {})
            }
            session.modified = True
            logger.info(f"Krowne login successful for user: {username}")
            return jsonify({'success': True, 'userInfo': auth_result['userInfo']})
        else:
            logger.warning(f"Krowne login failed for user: {username} - {auth_result['error']}")
            return jsonify({'success': False, 'error': auth_result['error']}), 401
    except Exception as e:
        logger.error(f"Krowne login error: {str(e)}", exc_info=True)
        return jsonify({'success': False, 'error': f'Login failed: {str(e)}'}), 500

@main.route('/api/auth/krowne/logout', methods=['POST'])
def krowne_logout():
    try:
        session.pop('krowne_auth', None)
        session.modified = True
        logger.info("Krowne logout successful")
        return jsonify({'success': True})
    except Exception as e:
        logger.error(f"Krowne logout error: {str(e)}")
        return jsonify({'success': True})

@main.route('/api/auth/krowne/status', methods=['GET'])
def krowne_auth_status():
    try:
        krowne_auth = session.get('krowne_auth')
        if krowne_auth and krowne_auth.get('authenticated'):
            session_data = krowne_auth.get('session_data', {})
            if krowne_cms_service.verify_session(session_data):
                return jsonify({'authenticated': True, 'userInfo': krowne_auth.get('userInfo')})
            else:
                session.pop('krowne_auth', None)
                session.modified = True
                return jsonify({'authenticated': False})
        else:
            return jsonify({'authenticated': False})
    except Exception as e:
        logger.error(f"Krowne auth status error: {str(e)}")
        return jsonify({'authenticated': False})

@main.route('/api/auth/krowne/profile', methods=['GET'])
def krowne_profile():
    try:
        krowne_auth = session.get('krowne_auth')
        if not krowne_auth or not krowne_auth.get('authenticated'):
            return jsonify({'error': 'Not authenticated'}), 401
        session_data = krowne_auth.get('session_data', {})
        fresh_user_data = krowne_cms_service.get_user_data(session_data)
        if fresh_user_data:
            krowne_auth['userInfo'] = fresh_user_data
            session['krowne_auth'] = krowne_auth
            session.modified = True
            return jsonify({'userInfo': fresh_user_data, 'authenticated': True})
        else:
            return jsonify({'userInfo': krowne_auth.get('userInfo'), 'authenticated': True})
    except Exception as e:
        logger.error(f"Krowne profile error: {str(e)}")
        return jsonify({'error': str(e)}), 500

@main.route('/api/krowne/test-connection', methods=['GET'])
def test_krowne_connection():
    try:
        import requests
        response = requests.get('https://krowne.com/cmsAdmin/admin.php', timeout=10)
        return jsonify({'success': True, 'status_code': response.status_code, 'url': response.url, 'accessible': response.status_code == 200})
    except Exception as e:
        logger.error(f"Krowne connection test failed: {str(e)}")
        return jsonify({'success': False, 'error': str(e), 'accessible': False}), 500
### Get Product SKUs ###
BASE_DIR = os.path.dirname(os.path.abspath(__file__))  # e.g. backend/app
UPLOAD_PATH = os.path.abspath(os.path.join(BASE_DIR, '..', 'uploads', 'Initial_Import.csv'))

@main.route("/api/products/skus", methods=["GET", "OPTIONS"])
def list_product_skus():
    if request.method == "OPTIONS":
        return '', 200
    try:
        if not os.path.exists(UPLOAD_PATH):
            logger.warning(f"Upload CSV not found: {UPLOAD_PATH}")
            return jsonify({"error": "SKU file not found"}), 404

        skus = extract_known_ids_from_csv(UPLOAD_PATH)
        return jsonify(skus)
    except Exception as e:
        logger.error("Error loading SKUs", exc_info=True)
        return jsonify({"error": str(e)}), 500


### Pimly Product Routes ###

@main.route("/api/pimly/search", methods=["POST", "OPTIONS"])
def search_pimly_products():
    """Search for products in Pimly"""
    if request.method == "OPTIONS":
        return '', 200
    
    try:
        sf_client = get_authenticated_sf_client()
        pimly_client = PimlyClient(sf_client)
        
        data = request.get_json()
        search_term = data.get('search', '')
        limit = data.get('limit', 20)
        
        logger.info(f"Searching Pimly for: {search_term}")
        
        # Search for products
        products = pimly_client.search_products(search_term, limit)
        
        return jsonify({
            'products': products,
            'count': len(products)
        })
    except Exception as e:
        logger.error(f"Error searching Pimly: {str(e)}")
        return jsonify({"error": str(e)}), 500

BATCH_SIZE = int(os.environ.get("PIMLY_BATCH_SIZE", 50))
MAX_PRODUCTS_PER_REQUEST = int(os.environ.get("MAX_PRODUCTS_PER_REQUEST", 4000))

@main.route("/api/pimly/products", methods=["GET", "OPTIONS"])
def get_pimly_products():
    """Get products from Pimly using enhanced batched requests for known SKUs."""
    if request.method == "OPTIONS":
        return '', 200

    try:
        sf_client = get_authenticated_sf_client()
        pimly_client = PimlyClient(sf_client)

        # Parse query parameters
        limit = min(request.args.get('limit', 100, type=int), MAX_PRODUCTS_PER_REQUEST)
        offset = request.args.get('offset', 0, type=int)
        
        # Optional: Allow filtering by specific properties
        properties = request.args.get('properties')
        if properties:
            properties = [prop.strip() for prop in properties.split(',')]
        
        # Optional: Channel and locale context
        channel_id = request.args.get('channel_id', 'global')
        locale_id = request.args.get('locale_id', 'global')
        
        # Optional: Custom identifier field
        context_identifier = request.args.get('context_identifier')

        # Get known SKUs from CSV
        known_skus = extract_known_ids_from_csv() or []
        total_available = len(known_skus)
        
        if not known_skus:
            logger.warning("No known SKUs found in CSV file")
            return jsonify({
                'products': [],
                'total': 0,
                'limit': limit,
                'offset': offset,
                'message': 'No known SKUs available'
            })

        # Apply pagination to SKU list
        paginated_skus = known_skus[offset:offset + limit]
        
        logger.info(f"Processing {len(paginated_skus)} SKUs (offset: {offset}, limit: {limit})")

        # Fetch products using enhanced batch processing
        products = []
        batch_count = 0
        failed_batches = 0
        
        if paginated_skus:
            try:
                # Use enhanced client with all parameters
                batch_products = pimly_client.get_products_by_ids(
                    ids=paginated_skus,
                    properties=properties,
                    context_identifier=context_identifier,
                    channel_id=channel_id,
                    locale_id=locale_id,
                    max_batch_size=BATCH_SIZE
                )
                
                products = batch_products or []
                batch_count = math.ceil(len(paginated_skus) / BATCH_SIZE)
                
                logger.info(f"Successfully retrieved {len(products)} products from {batch_count} batches")
                
            except Exception as e:
                logger.exception("Error in batch product retrieval")
                failed_batches = 1
                # Return partial results with error info rather than complete failure
                products = []

        # Prepare response with enhanced metadata
        response_data = {
            'products': products,
            'pagination': {
                'total': total_available,
                'limit': limit,
                'offset': offset,
                'returned': len(products),
                'has_more': (offset + limit) < total_available
            },
            'batch_info': {
                'batch_size': BATCH_SIZE,
                'total_batches': batch_count,
                'failed_batches': failed_batches,
                'requested_skus': len(paginated_skus)
            },
            'filters': {
                'properties': properties,
                'channel_id': channel_id,
                'locale_id': locale_id,
                'context_identifier': context_identifier
            },
            'success': failed_batches == 0
        }
        
        # Add warnings if applicable
        if failed_batches > 0:
            response_data['warnings'] = [f"{failed_batches} batch(es) failed to process"]
        
        if len(products) < len(paginated_skus):
            missing_count = len(paginated_skus) - len(products)
            response_data['warnings'] = response_data.get('warnings', [])
            response_data['warnings'].append(f"{missing_count} SKUs returned no data")

        return jsonify(response_data)

    except Exception as e:
        logger.exception("Fatal error in get_pimly_products")
        return jsonify({
            "error": str(e),
            "type": "server_error",
            "timestamp": datetime.utcnow().isoformat()
        }), 500


@main.route("/api/pimly/products/batch", methods=["POST", "OPTIONS"])
def get_pimly_products_batch():
    """Get specific products by providing a list of SKUs in the request body."""
    if request.method == "OPTIONS":
        return '', 200

    try:
        sf_client = get_authenticated_sf_client()
        pimly_client = PimlyClient(sf_client)
        
        data = request.get_json()
        if not data or 'skus' not in data:
            return jsonify({"error": "Request must include 'skus' array"}), 400
        
        skus = data.get('skus', [])
        if not isinstance(skus, list):
            return jsonify({"error": "'skus' must be an array"}), 400
        
        if len(skus) > MAX_PRODUCTS_PER_REQUEST:
            return jsonify({
                "error": f"Too many SKUs requested. Maximum: {MAX_PRODUCTS_PER_REQUEST}"
            }), 400

        # Optional parameters
        properties = data.get('properties')
        channel_id = data.get('channel_id', 'global')
        locale_id = data.get('locale_id', 'global')
        context_identifier = data.get('context_identifier')

        logger.info(f"Batch request for {len(skus)} specific SKUs")

        # Use enhanced client
        products = pimly_client.get_products_by_ids(
            ids=skus,
            properties=properties,
            context_identifier=context_identifier,
            channel_id=channel_id,
            locale_id=locale_id,
            max_batch_size=BATCH_SIZE
        )

        return jsonify({
            'products': products,
            'requested': len(skus),
            'returned': len(products),
            'success': True,
            'batch_info': {
                'batch_size': BATCH_SIZE,
                'total_batches': math.ceil(len(skus) / BATCH_SIZE)
            }
        })

    except Exception as e:
        logger.exception("Error in batch SKU request")
        return jsonify({"error": str(e)}), 500


@main.route("/api/pimly/products/validate", methods=["GET", "OPTIONS"])
def validate_pimly_connection():
    """Validate connection to Pimly API"""
    if request.method == "OPTIONS":
        return '', 200

    try:
        sf_client = get_authenticated_sf_client()
        pimly_client = PimlyClient(sf_client)
        
        is_valid = pimly_client.validate_connection()
        
        return jsonify({
            'valid': is_valid,
            'message': 'Connection successful' if is_valid else 'Connection failed',
            'salesforce_instance': sf_client.instance_url,
            'timestamp': datetime.utcnow().isoformat()
        })

    except Exception as e:
        logger.exception("Error validating Pimly connection")
        return jsonify({
            'valid': False,
            'error': str(e),
            'timestamp': datetime.utcnow().isoformat()
        }), 500


@main.route("/api/pimly/products/properties", methods=["POST", "OPTIONS"])
def get_products_with_properties():
    """Get products with specific Pimly properties for a given channel/locale context"""
    if request.method == "OPTIONS":
        return '', 200

    try:
        sf_client = get_authenticated_sf_client()
        pimly_client = PimlyClient(sf_client)
        
        data = request.get_json()
        if not data:
            return jsonify({"error": "Request body required"}), 400
        
        skus = data.get('skus', [])
        properties = data.get('properties', [])
        channel_id = data.get('channel_id', 'global')
        locale_id = data.get('locale_id', 'global')
        
        if not skus:
            return jsonify({"error": "SKUs list is required"}), 400
        if not properties:
            return jsonify({"error": "Properties list is required"}), 400

        logger.info(f"Getting {len(properties)} properties for {len(skus)} products in channel '{channel_id}'")

        products = pimly_client.get_products_with_specific_properties(
            ids=skus,
            property_names=properties,
            channel_id=channel_id,
            locale_id=locale_id
        )

        return jsonify({
            'products': products,
            'requested_skus': len(skus),
            'requested_properties': properties,
            'returned_products': len(products),
            'context': {
                'channel_id': channel_id,
                'locale_id': locale_id
            },
            'success': True
        })

    except Exception as e:
        logger.exception("Error getting products with properties")
        return jsonify({"error": str(e)}), 500
@main.route("/api/products/<sku>", methods=["GET", "OPTIONS"])
def get_product_by_sku(sku):
    if request.method == "OPTIONS":
        return '', 200
    try:
        sf_client = get_authenticated_sf_client()
        pimly_client = PimlyClient(sf_client)
        product = pimly_client.get_product_by_sku(sku)
        return jsonify(product)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

### Krowne Scraper Routes ###
@main.route("/api/krowne/scrape-product/<sku>", methods=["GET", "OPTIONS"])
def scrape_krowne_product(sku):
    """Scrape product data from Krowne public website"""
    if request.method == "OPTIONS":
        return '', 200
    
    try:
        krowne_scraper = KrowneScraper()
        product_data = krowne_scraper.scrapeSite(BASEURL, sku)
        
        if product_data:
            logger.info(f"✅ Successfully scraped Krowne data for SKU: {sku}")
            return jsonify(product_data)
        else:
            logger.warning(f"⚠️ No data found on Krowne website for SKU: {sku}")
            return jsonify({"error": f"Product {sku} not found on Krowne website"}), 404
            
    except Exception as e:
        logger.error(f"Error scraping Krowne product {sku}: {str(e)}")
        return jsonify({"error": str(e)}), 500
    
### Krowne CMS Product Routes ###
@main.route("/api/krowne/admin/search/<sku>", methods=["GET"])
def search_cms_admin_product(sku):
    """
    Search for a product in the CMS admin panel by SKU
    """
    try:
        # Check if user is authenticated with Krowne CMS
        krowne_auth = session.get('krowne_auth')
        if not krowne_auth or not krowne_auth.get('authenticated'):
            return jsonify({
                "error": "Not authenticated with Krowne CMS admin panel",
                "requires_auth": True
            }), 401
        
        # Initialize the admin scraper
        admin_scraper = KrowneCMSService()
        
        # Use existing session data
        session_data = krowne_auth.get('session_data', {})
        if not admin_scraper.use_existing_session(session_data):
            # Session expired, need to re-authenticate
            return jsonify({
                "error": "CMS session expired, please re-authenticate",
                "requires_auth": True
            }), 401
        
        # Search for the product
        search_result = admin_scraper.search_product_by_sku(sku)
        
        if search_result:
            logger.info(f"✅ CMS admin search successful for SKU: {sku}")
            return jsonify({
                "success": True,
                "sku": sku,
                "search_result": search_result,
                "found": True
            })
        else:
            logger.warning(f"⚠️ SKU not found in CMS admin: {sku}")
            return jsonify({
                "success": True,
                "sku": sku,
                "search_result": None,
                "found": False,
                "message": f"SKU {sku} not found in CMS admin panel"
            })
            
    except Exception as e:
        logger.exception(f"Error searching CMS admin for SKU {sku}")
        return jsonify({
            "error": str(e),
            "success": False,
            "sku": sku
        }), 500


@main.route("/api/krowne/admin/product/<record_number>", methods=["GET"])
def get_cms_admin_product_details(record_number):
    """
    Get detailed product information from CMS admin using record number
    """
    try:
        # Check authentication
        krowne_auth = session.get('krowne_auth')
        if not krowne_auth or not krowne_auth.get('authenticated'):
            return jsonify({
                "error": "Not authenticated with Krowne CMS admin panel",
                "requires_auth": True
            }), 401
        
        # Initialize the admin scraper
        admin_scraper = KrowneCMSService()
        
        # Use existing session data
        session_data = krowne_auth.get('session_data', {})
        if not admin_scraper.use_existing_session(session_data):
            return jsonify({
                "error": "CMS session expired, please re-authenticate",
                "requires_auth": True
            }), 401
        
        # Get product details
        product_details = admin_scraper.get_product_by_record_number(record_number)
        
        if product_details:
            logger.info(f"✅ CMS admin product details retrieved for record: {record_number}")
            return jsonify({
                "success": True,
                "record_number": record_number,
                "product_details": product_details
            })
        else:
            logger.warning(f"⚠️ No product details found for record: {record_number}")
            return jsonify({
                "success": False,
                "record_number": record_number,
                "error": f"No product found with record number {record_number}"
            }), 404
            
    except Exception as e:
        logger.exception(f"Error getting CMS admin product details for record {record_number}")
        return jsonify({
            "error": str(e),
            "success": False,
            "record_number": record_number
        }), 500


@main.route("/api/krowne/admin/sku/<sku>", methods=["GET"])
def get_cms_admin_product_by_sku(sku):
    """
    Complete workflow: search for SKU and get detailed product information from CMS admin
    """
    try:
        # Check authentication
        krowne_auth = session.get('krowne_auth')
        if not krowne_auth or not krowne_auth.get('authenticated'):
            return jsonify({
                "error": "Not authenticated with Krowne CMS admin panel",
                "requires_auth": True
            }), 401
        
        # Initialize the admin scraper
        admin_scraper = KrowneCMSService()
        
        # Use existing session data
        session_data = krowne_auth.get('session_data', {})
        if not admin_scraper.use_existing_session(session_data):
            return jsonify({
                "error": "CMS session expired, please re-authenticate",
                "requires_auth": True
            }), 401
        
        # Get complete product data
        product_data = admin_scraper.get_product_by_sku(sku)
        
        if product_data:
            logger.info(f"✅ Complete CMS admin data retrieved for SKU: {sku}")
            
            # Transform the data to match expected format for integration
            formatted_data = {
                "sku": sku,
                "source": "cms_admin",
                "raw_data": product_data,
                "formatted_data": format_cms_admin_data(product_data),
                "metadata": {
                    "record_number": product_data.get('record_number'),
                    "admin_url": product_data.get('detail_metadata', {}).get('admin_url'),
                    "fields_count": len(product_data.get('admin_fields', {})),
                    "form_fields_count": len(product_data.get('form_data', {})),
                    "sections_count": len(product_data.get('sections', {}))
                }
            }
            
            return jsonify({
                "success": True,
                "sku": sku,
                "product_data": formatted_data
            })
        else:
            logger.warning(f"⚠️ SKU not found in CMS admin: {sku}")
            return jsonify({
                "success": False,
                "sku": sku,
                "error": f"Product with SKU {sku} not found in CMS admin panel"
            }), 404
            
    except Exception as e:
        logger.exception(f"Error getting CMS admin product by SKU {sku}")
        return jsonify({
            "error": str(e),
            "success": False,
            "sku": sku
        }), 500


@main.route("/api/krowne/admin/batch", methods=["POST"])
def get_cms_admin_products_batch():
    """
    Get multiple products from CMS admin by SKU list
    """
    try:
        # Check authentication
        krowne_auth = session.get('krowne_auth')
        if not krowne_auth or not krowne_auth.get('authenticated'):
            return jsonify({
                "error": "Not authenticated with Krowne CMS admin panel",
                "requires_auth": True
            }), 401
        
        data = request.get_json()
        skus = data.get('skus', [])
        
        if not skus:
            return jsonify({"error": "SKUs list is required"}), 400
        
        if len(skus) > 50:  # Limit batch size
            return jsonify({"error": "Maximum 50 SKUs allowed per batch"}), 400
        
        # Initialize the admin scraper
        admin_scraper = KrowneCMSService()
        
        # Use existing session data
        session_data = krowne_auth.get('session_data', {})
        if not admin_scraper.use_existing_session(session_data):
            return jsonify({
                "error": "CMS session expired, please re-authenticate",
                "requires_auth": True
            }), 401
        
        results = []
        errors = []
        
        for sku in skus:
            try:
                product_data = admin_scraper.get_product_by_sku(sku)
                
                if product_data:
                    formatted_data = {
                        "sku": sku,
                        "source": "cms_admin",
                        "raw_data": product_data,
                        "formatted_data": format_cms_admin_data(product_data),
                        "success": True
                    }
                    results.append(formatted_data)
                else:
                    results.append({
                        "sku": sku,
                        "success": False,
                        "error": "Not found"
                    })
                    
            except Exception as e:
                error_msg = f"Error processing SKU {sku}: {str(e)}"
                logger.error(error_msg)
                errors.append(error_msg)
                results.append({
                    "sku": sku,
                    "success": False,
                    "error": str(e)
                })
        
        return jsonify({
            "success": True,
            "results": results,
            "total_requested": len(skus),
            "total_found": len([r for r in results if r.get('success')]),
            "errors": errors
        })
        
    except Exception as e:
        logger.exception("Error in batch CMS admin product retrieval")
        return jsonify({
            "error": str(e),
            "success": False
        }), 500


def format_cms_admin_data(raw_cms_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Format raw CMS admin data into a standardized structure
    """
    try:
        formatted = {
            "basic_info": {},
            "admin_metadata": {},
            "form_fields": {},
            "display_sections": {},
            "extracted_specs": {},
            "images": [],
            "files": [],
            "urls": []
        }
        
        # Extract basic info
        basic_fields = ['sku', 'name', 'record_number']
        for field in basic_fields:
            if field in raw_cms_data:
                formatted["basic_info"][field] = raw_cms_data[field]
        
        # Admin-specific metadata
        admin_fields = raw_cms_data.get('admin_fields', {})
        formatted["admin_metadata"] = admin_fields.copy()
        
        # Form data
        form_data = raw_cms_data.get('form_data', {})
        formatted["form_fields"] = form_data.copy()
        
        # Display sections
        sections = raw_cms_data.get('sections', {})
        formatted["display_sections"] = sections.copy()
        
        # Extract specifications from various sources
        specs = {}
        
        # From form fields
        for key, value in form_data.items():
            if any(spec_term in key.lower() for spec_term in ['spec', 'dimension', 'weight', 'material', 'finish']):
                specs[key] = value
        
        # From sections
        for section_name, section_data in sections.items():
            if 'spec' in section_name.lower() or 'dimension' in section_name.lower():
                specs.update(section_data)
        
        formatted["extracted_specs"] = specs
        
        # Extract URLs and images from all data
        all_values = []
        
        def collect_values(obj):
            if isinstance(obj, dict):
                for value in obj.values():
                    collect_values(value)
            elif isinstance(obj, list):
                for item in obj:
                    collect_values(item)
            elif isinstance(obj, str):
                all_values.append(value)
        
        collect_values(raw_cms_data)
        
        # Find URLs and images
        for value in all_values:
            if isinstance(value, str):
                if value.startswith('http'):
                    if any(ext in value.lower() for ext in ['.jpg', '.jpeg', '.png', '.gif', '.webp']):
                        formatted["images"].append(value)
                    elif any(ext in value.lower() for ext in ['.pdf', '.doc', '.docx', '.zip']):
                        formatted["files"].append(value)
                    else:
                        formatted["urls"].append(value)
        
        # Remove duplicates
        formatted["images"] = list(set(formatted["images"]))
        formatted["files"] = list(set(formatted["files"]))
        formatted["urls"] = list(set(formatted["urls"]))
        
        return formatted
        
    except Exception as e:
        logger.error(f"Error formatting CMS admin data: {str(e)}")
        return {"error": f"Formatting error: {str(e)}"}


### Enhanced comparison route that includes CMS admin data ###

@main.route("/api/products/compare-enhanced/<sku>", methods=["GET"])
def compare_product_data_enhanced(sku):
    """
    Enhanced product comparison that includes CMS admin data, Pimly data, and public website data
    """
    try:
        comparison_data = {
            "sku": sku,
            "sources": {},
            "comparison": {},
            "errors": []
        }
        
        # Get Pimly data
        try:
            sf_client = get_authenticated_sf_client()
            pimly_client = PimlyClient(sf_client)
            pimly_data = pimly_client.get_product_by_sku(sku)
            comparison_data["sources"]["pimly"] = {
                "data": pimly_data,
                "success": True,
                "source": "pimly_api"
            }
        except Exception as e:
            logger.error(f"Error fetching Pimly data: {str(e)}")
            comparison_data["sources"]["pimly"] = {
                "success": False,
                "error": str(e)
            }
            comparison_data["errors"].append(f"Pimly: {str(e)}")
        
        # Get public website data
        try:
            krowne_scraper = KrowneScraper()
            public_data = krowne_scraper.scrapeSite(BASEURL, sku)
            comparison_data["sources"]["public_website"] = {
                "data": public_data,
                "success": True,
                "source": "public_scraper"
            }
        except Exception as e:
            logger.error(f"Error fetching public website data: {str(e)}")
            comparison_data["sources"]["public_website"] = {
                "success": False,
                "error": str(e)
            }
            comparison_data["errors"].append(f"Public website: {str(e)}")
        
        # Get CMS admin data (if authenticated)
        krowne_auth = session.get('krowne_auth')
        if krowne_auth and krowne_auth.get('authenticated'):
            try:
                admin_scraper = KrowneCMSService()
                session_data = krowne_auth.get('session_data', {})
                
                if admin_scraper.use_existing_session(session_data):
                    cms_admin_data = admin_scraper.get_product_by_sku(sku)
                    comparison_data["sources"]["cms_admin"] = {
                        "data": cms_admin_data,
                        "formatted_data": format_cms_admin_data(cms_admin_data) if cms_admin_data else None,
                        "success": True,
                        "source": "cms_admin_scraper"
                    }
                else:
                    comparison_data["sources"]["cms_admin"] = {
                        "success": False,
                        "error": "Session expired"
                    }
                    comparison_data["errors"].append("CMS Admin: Session expired")
            except Exception as e:
                logger.error(f"Error fetching CMS admin data: {str(e)}")
                comparison_data["sources"]["cms_admin"] = {
                    "success": False,
                    "error": str(e)
                }
                comparison_data["errors"].append(f"CMS Admin: {str(e)}")
        else:
            comparison_data["sources"]["cms_admin"] = {
                "success": False,
                "error": "Not authenticated with CMS admin"
            }
        
        # Perform basic comparison
        successful_sources = [name for name, data in comparison_data["sources"].items() if data.get("success")]
        comparison_data["comparison"]["successful_sources"] = successful_sources
        comparison_data["comparison"]["total_sources"] = len(comparison_data["sources"])
        comparison_data["comparison"]["success_rate"] = len(successful_sources) / len(comparison_data["sources"])
        
        # Add timestamp
        comparison_data["timestamp"] = datetime.now().isoformat()
        
        return jsonify(comparison_data)
        
    except Exception as e:
        logger.exception(f"Error in enhanced product comparison for SKU {sku}")
        return jsonify({
            "error": str(e),
            "sku": sku,
            "success": False
        }), 500

### Admin Session Management ###

@main.route("/api/krowne/admin/test-session", methods=["GET"])
def test_cms_admin_session():
    """
    Test if the current CMS admin session is still valid
    """
    try:
        krowne_auth = session.get('krowne_auth')
        if not krowne_auth or not krowne_auth.get('authenticated'):
            return jsonify({
                "valid": False,
                "authenticated": False,
                "error": "No active CMS admin session"
            })
        
        # Test the session
        admin_scraper = KrowneCMSService()
        session_data = krowne_auth.get('session_data', {})
        
        if admin_scraper.use_existing_session(session_data):
            return jsonify({
                "valid": True,
                "authenticated": True,
                "user_info": krowne_auth.get('userInfo', {}),
                "session_age": krowne_auth.get('timestamp')
            })
        else:
            # Session is invalid, clear it
            session.pop('krowne_auth', None)
            session.modified = True
            
            return jsonify({
                "valid": False,
                "authenticated": False,
                "error": "CMS admin session expired"
            })
            
    except Exception as e:
        logger.error(f"Error testing CMS admin session: {str(e)}")
        return jsonify({
            "valid": False,
            "authenticated": False,
            "error": str(e)
        }), 500

### Mapper Router ###

@main.route("/api/products/map/<sku>", methods=["GET"])
def map_product_data(sku):
   try:
       # Get raw data from Pimly
       sf_client = get_authenticated_sf_client()
       pimly_client = PimlyClient(sf_client)
       raw_pimly_data = pimly_client.get_product_by_sku(sku)
       
       # Get raw data from Krowne (if available)
       # krowne_data = krowne_scraper.get_product_data(sku)
       
       # Map the data
       mapper = ProductDataMapper()
       mapped_data = mapper.process_json_data(raw_pimly_data, source_type="pimly")
       
       return jsonify({
           'sku': sku,
           'mapped_data': mapper.export_mapping(mapped_data, format="dict"),
           'success': True
       })
       
   except Exception as e:
       logger.exception(f"Error mapping product data for SKU {sku}")
       return jsonify({"error": str(e)}), 500

@main.route("/api/products/map/batch", methods=["POST"])
def map_batch_products():
   """Map multiple products at once"""
   try:
       data = request.get_json()
       skus = data.get('skus', [])
       
       if not skus:
           return jsonify({"error": "SKUs list is required"}), 400
       
       sf_client = get_authenticated_sf_client()
       pimly_client = PimlyClient(sf_client)
       mapper = ProductDataMapper()
       
       # Get batch data from Pimly
       raw_products = pimly_client.get_products_by_ids(skus)
       
       mapped_products = []
       for product in raw_products:
           try:
               mapped_data = mapper.process_json_data(product, source_type="pimly")
               mapped_products.append({
                   'sku': mapped_data.sku,
                   'mapped_data': mapper.export_mapping(mapped_data, format="dict")
               })
           except Exception as e:
               logger.error(f"Error mapping product {product.get('SKU', 'unknown')}: {e}")
               continue
       
       return jsonify({
           'products': mapped_products,
           'requested': len(skus),
           'mapped': len(mapped_products),
           'success': True
       })
       
   except Exception as e:
       logger.exception("Error in batch product mapping")
       return jsonify({"error": str(e)}), 500


### Comparison Endpoints ###

@main.route("/api/compare", methods=["POST", "OPTIONS"])
def compare_products_legacy():
    """Legacy comparison endpoint for backward compatibility"""
    if request.method == "OPTIONS":
        return '', 200
    
    try:
        data = request.get_json()
        
        # Handle single SKU
        if 'sku' in data:
            sku = data['sku']
            response = compare_product_data(sku)
            
            # Wrap single result in array format expected by legacy frontend
            if response.status_code == 200:
                result = response.get_json()
                return jsonify({
                    'results': [result],
                    'total': 1,
                    'success': True
                })
            else:
                return response
                
        # Handle multiple SKUs
        elif 'skus' in data:
            skus = data['skus']
            results = []
            
            for sku in skus:
                try:
                    result_response = compare_product_data(sku)
                    if result_response.status_code == 200:
                        results.append(result_response.get_json())
                    else:
                        results.append({
                            'sku': sku,
                            'error': 'Comparison failed',
                            'status': 'error'
                        })
                except Exception as e:
                    results.append({
                        'sku': sku,
                        'error': str(e),
                        'status': 'error'
                    })
            
            return jsonify({
                'results': results,
                'total': len(results),
                'success': True
            })
        else:
            return jsonify({"error": "Request must include 'sku' or 'skus'"}), 400
            
    except Exception as e:
        logger.error(f"Error in legacy compare endpoint: {str(e)}")
        return jsonify({"error": str(e)}), 500

@main.route("/api/products/compare/<sku>", methods=["GET"]) 
def compare_product_data(sku):
    """Enhanced product comparison with raw data included"""
    try:
        sf_client = get_authenticated_sf_client()
        pimly_client = PimlyClient(sf_client)
        krowne_scraper = KrowneScraper()
        comparator = MappedDataComparator()
        
        # Get data from both sources
        pimly_data = pimly_client.get_product_by_sku(sku)
        krowne_data = None
        
        try:
            krowne_data = krowne_scraper.scrapeSite(BASEURL, sku)
        except Exception as e:
            logger.warning(f"Could not fetch Krowne data for comparison of SKU {sku}: {e}")
        
        # Perform comparison
        comparison_result = comparator.compare_products(
            pimly_data=pimly_data,
            krowne_data=krowne_data, 
            sku=sku
        )
        
        # Format for response (keeping backward compatibility)
        response = {
            'sku': sku,
            'comparison': {
                'status': comparison_result.status,
                'match_count': comparison_result.summary.matches if hasattr(comparison_result, 'summary') else 0,
                'mismatch_count': comparison_result.summary.mismatches if hasattr(comparison_result, 'summary') else 0,
                'partial_data_count': comparison_result.summary.partial_data if hasattr(comparison_result, 'summary') else 0,
                'total_fields_compared': comparison_result.summary.total_fields_compared if hasattr(comparison_result, 'summary') else 0
            },
            'salesforce': pimly_data,  # Keep existing structure
            'krowne': krowne_data,
            'raw_data': {  # Add raw data section
                'pimly': pimly_data,
                'krowne': krowne_data
            }
        }
        
        return jsonify(response)
        
    except Exception as e:
        logger.exception(f"Error comparing product data for SKU {sku}")
        return jsonify({"error": str(e)}), 500


# Helper function to clean sensitive data from raw responses (optional)
def clean_raw_data_for_display(data, source_type="unknown"):
    """
    Clean raw data to remove sensitive information before sending to frontend
    """
    if not data or not isinstance(data, dict):
        return data
    
    # List of sensitive fields to remove or mask
    sensitive_fields = [
        'password', 'token', 'secret', 'key', 'auth',
        'login', 'credential', 'private', 'internal'
    ]
    
    cleaned_data = data.copy()
    
    def clean_recursive(obj, path=""):
        if isinstance(obj, dict):
            for key, value in list(obj.items()):
                current_path = f"{path}.{key}" if path else key
                
                # Check if field name suggests sensitive data
                if any(sensitive in key.lower() for sensitive in sensitive_fields):
                    obj[key] = "***REDACTED***"
                elif isinstance(value, (dict, list)):
                    clean_recursive(value, current_path)
                    
        elif isinstance(obj, list):
            for i, item in enumerate(obj):
                if isinstance(item, (dict, list)):
                    clean_recursive(item, f"{path}[{i}]")
    
    clean_recursive(cleaned_data)
    return cleaned_data



@main.route("/api/compare/detailed/<sku>", methods=["GET", "OPTIONS"])
def get_detailed_mapped_comparison(sku):
    """Get detailed field-by-field comparison for a single product"""
    if request.method == "OPTIONS":
        return '', 200

    try:
        sf_client = get_authenticated_sf_client()
        pimly_client = PimlyClient(sf_client)
        
        logger.info(f"Getting detailed mapped comparison for SKU: {sku}")
        
        # Get Pimly data
        pimly_data = None
        try:
            pimly_products = pimly_client.get_products_by_ids([sku])
            if pimly_products:
                pimly_data = pimly_products[0]
                logger.info(f"Retrieved Pimly data for {sku}")
        except Exception as e:
            logger.warning(f"Could not get Pimly data for {sku}: {e}")

        # Get Krowne data (if scraper is available)
        krowne_data = None
        try:
            # Note: You'll need to implement or integrate your Krowne scraper here
            # krowne_scraper = KrowneScraper()
            # krowne_data = krowne_scraper.scrape_product(sku)
            logger.info(f"Krowne scraping not yet implemented for {sku}")
        except Exception as e:
            logger.warning(f"Could not get Krowne data for {sku}: {e}")

        # Perform detailed comparison
        product_comparison = mapped_comparator.compare_products(
            pimly_data=pimly_data,
            krowne_data=krowne_data,
            sku=sku
        )

        # Format for detailed response
        detailed_result = {
            'sku': sku,
            'comparison_summary': {
                'matches': product_comparison.summary.matches,
                'mismatches': product_comparison.summary.mismatches,
                'partial_data': product_comparison.summary.partial_data,
                'total_fields': product_comparison.summary.total_fields_compared,
                'overall_match_percentage': product_comparison.summary.overall_match_percentage,
                'categories_compared': product_comparison.summary.categories_compared
            },
            'field_comparisons': [
                {
                    'field_name': fc.field_name,
                    'display_name': fc.display_name,
                    'category': fc.category,
                    'salesforce_value': fc.pimly_value,  # For frontend compatibility
                    'krowne_value': fc.krowne_value,
                    'is_match': fc.is_match,
                    'is_mismatch': fc.is_mismatch,
                    'has_partial_data': fc.has_partial_data,
                    'field_type': fc.field_type,
                    'confidence_score': fc.confidence_score,
                    'notes': fc.notes,
                    'description': fc.description
                }
                for fc in product_comparison.field_comparisons
            ],
            'mapped_data': {
                'pimly': mapped_comparator.mapper.export_mapping(product_comparison.pimly_mapping, format="dict") if product_comparison.pimly_mapping else None,
                'krowne': mapped_comparator.mapper.export_mapping(product_comparison.krowne_mapping, format="dict") if product_comparison.krowne_mapping else None
            },
            'status': product_comparison.status,
            'errors': product_comparison.errors,
            'timestamp': product_comparison.summary.comparison_timestamp
        }

        return jsonify(detailed_result)

    except Exception as e:
        logger.exception(f"Error getting detailed comparison for {sku}")
        return jsonify({
            "error": str(e),
            "sku": sku,
            "timestamp": datetime.utcnow().isoformat()
        }), 500


@main.route("/api/compare/batch", methods=["POST", "OPTIONS"])
def compare_batch_mapped():
    """Compare multiple products with full data retrieval"""
    if request.method == "OPTIONS":
        return '', 200

    try:
        sf_client = get_authenticated_sf_client()
        pimly_client = PimlyClient(sf_client)
        data = request.get_json()
        
        if not data or 'skus' not in data:
            return jsonify({"error": "Request must include 'skus' array"}), 400

        skus = data['skus']
        if not isinstance(skus, list):
            return jsonify({"error": "'skus' must be an array"}), 400

        if len(skus) > MAX_PRODUCTS_PER_REQUEST:
            return jsonify({
                "error": f"Too many SKUs. Maximum: {MAX_PRODUCTS_PER_REQUEST}"
            }), 400

        logger.info(f"Starting batch mapped comparison for {len(skus)} SKUs")

        # Get all Pimly data in batch
        pimly_products = {}
        try:
            pimly_data_list = pimly_client.get_products_by_ids(skus)
            for product in pimly_data_list:
                # Extract SKU from product data
                product_sku = (product.get('pimly__SKU__c') or 
                             product.get('ProductCode') or 
                             product.get('Name'))
                if product_sku:
                    pimly_products[product_sku] = product
            logger.info(f"Retrieved Pimly data for {len(pimly_products)} products")
        except Exception as e:
            logger.error(f"Error retrieving Pimly batch data: {e}")

        # Process each SKU
        results = []
        successful_comparisons = 0
        failed_comparisons = 0

        for sku in skus:
            try:
                pimly_data = pimly_products.get(sku)
                krowne_data = None  # TODO: Implement batch Krowne scraping

                # Perform comparison
                product_comparison = mapped_comparator.compare_products(
                    pimly_data=pimly_data,
                    krowne_data=krowne_data,
                    sku=sku
                )

                comparison_result = _format_comparison_result(product_comparison)
                results.append(comparison_result)
                successful_comparisons += 1

            except Exception as e:
                logger.error(f"Error comparing SKU {sku}: {e}")
                # Add error result
                results.append({
                    'sku': sku,
                    'error': str(e),
                    'status': 'error',
                    'salesforce': None,
                    'krowne': None,
                    'comparison': {
                        'mismatches': [],
                        'matches': [],
                        'partial_data': [],
                        'total_fields_compared': 0
                    }
                })
                failed_comparisons += 1

        logger.info(f"Batch comparison completed: {successful_comparisons} successful, {failed_comparisons} failed")

        return jsonify({
            'results': results,
            'total': len(results),
            'successful': successful_comparisons,
            'failed': failed_comparisons,
            'success': failed_comparisons == 0,
            'batch_info': {
                'requested_skus': len(skus),
                'processed_skus': len(results),
                'pimly_data_found': len(pimly_products)
            },
            'mapper_info': {
                "version": "2.0",
                "comparison_type": "mapped_data_batch",
                "timestamp": datetime.utcnow().isoformat()
            },
            'timestamp': datetime.utcnow().isoformat()
        })

    except Exception as e:
        logger.exception("Error in batch mapped comparison")
        return jsonify({
            "error": str(e),
            "type": "batch_comparison_error",
            "timestamp": datetime.utcnow().isoformat()
        }), 500


@main.route("/api/compare/categories", methods=["GET", "OPTIONS"])
def get_comparison_categories():
    """Get available comparison categories and field types"""
    if request.method == "OPTIONS":
        return '', 200

    try:
        categories = {
            "basic_info": {
                "description": "Core product information",
                "fields": ["name", "sku", "series"],
                "field_types": ["text"]
            },
            "features": {
                "description": "Product features and capabilities",
                "fields": ["features"],
                "field_types": ["list"]
            },
            "specifications": {
                "description": "Technical specifications and measurements",
                "fields": ["dimensions", "performance", "electrical", "mechanical"],
                "field_types": ["text", "number", "price"]
            },
            "certifications": {
                "description": "Industry certifications and compliance",
                "fields": ["NSF", "UL", "ETL", "CSA", "ASSE", "IAPMO"],
                "field_types": ["boolean"]
            },
            "media": {
                "description": "Images and visual content",
                "fields": ["images"],
                "field_types": ["list", "url"]
            },
            "files": {
                "description": "Documentation and downloads",
                "fields": ["spec_sheets", "manuals", "sell_sheets", "brochures", "videos"],
                "field_types": ["list", "url"]
            },
            "related_items": {
                "description": "Related products and accessories",
                "fields": ["related_products", "parts_accessories"],
                "field_types": ["list"]
            }
        }

        field_types = {
            "text": "Text/string values",
            "number": "Numeric values with tolerance comparison", 
            "price": "Price values with currency normalization",
            "boolean": "True/false values",
            "list": "Arrays/lists with set comparison",
            "url": "URL/link values"
        }

        return jsonify({
            'categories': categories,
            'field_types': field_types,
            'mapper_version': "2.0",
            'timestamp': datetime.utcnow().isoformat()
        })

    except Exception as e:
        logger.exception("Error getting comparison categories")
        return jsonify({"error": str(e)}), 500


@main.route("/api/compare/stats", methods=["GET", "OPTIONS"])
def get_comparison_stats():
    """Get statistics about comparison capabilities"""
    if request.method == "OPTIONS":
        return '', 200

    try:
        # Get known SKUs count
        known_skus = extract_known_ids_from_csv() or []
        
        stats = {
            "available_skus": len(known_skus),
            "supported_categories": 7,
            "supported_field_types": 6,
            "comparison_features": {
                "fuzzy_text_matching": True,
                "price_tolerance": True,
                "numeric_tolerance": True,
                "list_set_comparison": True,
                "confidence_scoring": True,
                "batch_processing": True
            },
            "max_batch_size": MAX_PRODUCTS_PER_REQUEST,
            "api_version": "2.0",
            "timestamp": datetime.utcnow().isoformat()
        }

        return jsonify(stats)

    except Exception as e:
        logger.exception("Error getting comparison stats")
        return jsonify({"error": str(e)}), 500


### Helper Functions - Fixed to be synchronous ###

def _compare_single_product_mapped(sku: str, pimly_client: PimlyClient) -> Optional[Dict[str, Any]]:
    """Compare a single product using the mapped data system"""
    try:
        logger.info(f"Starting mapped comparison for SKU: {sku}")
        
        # Get Pimly data
        pimly_data = None
        try:
            pimly_products = pimly_client.get_products_by_ids([sku])
            if pimly_products:
                pimly_data = pimly_products[0]
                logger.info(f"Retrieved Pimly data for {sku}")
        except Exception as e:
            logger.warning(f"Could not get Pimly data for {sku}: {e}")

        # Get Krowne data (placeholder for now)
        krowne_data = None
        # TODO: Implement Krowne scraping integration
        try:
            # When you're ready to add Krowne scraping:
            # krowne_scraper = KrowneScraper()
            # krowne_data = krowne_scraper.scrape_product(sku)
            logger.debug(f"Krowne scraping not yet implemented for {sku}")
        except Exception as e:
            logger.warning(f"Could not get Krowne data for {sku}: {e}")

        # Perform comparison
        product_comparison = mapped_comparator.compare_products(
            pimly_data=pimly_data,
            krowne_data=krowne_data,
            sku=sku
        )

        return _format_comparison_result(product_comparison)

    except Exception as e:
        logger.error(f"Error in mapped comparison for {sku}: {e}")
        return None


def _format_comparison_result(product_comparison) -> Dict[str, Any]:
    """Format ProductComparison object for API response"""
    return {
        'sku': product_comparison.sku,
        'salesforce': mapped_comparator.mapper.export_mapping(product_comparison.pimly_mapping, format="dict") if product_comparison.pimly_mapping else None,
        'krowne': mapped_comparator.mapper.export_mapping(product_comparison.krowne_mapping, format="dict") if product_comparison.krowne_mapping else None,
        'comparison': {
            'mismatches': [
                {
                    'field': fc.field_name,
                    'display_name': fc.display_name,
                    'category': fc.category,
                    'pimly': fc.pimly_value,
                    'krowne': fc.krowne_value,
                    'confidence': fc.confidence_score,
                    'notes': fc.notes
                }
                for fc in product_comparison.field_comparisons if fc.is_mismatch
            ],
            'matches': [
                {
                    'field': fc.field_name,
                    'display_name': fc.display_name,
                    'category': fc.category,
                    'value': fc.pimly_value or fc.krowne_value,
                    'confidence': fc.confidence_score
                }
                for fc in product_comparison.field_comparisons if fc.is_match
            ],
            'partial_data': [
                {
                    'field': fc.field_name,
                    'display_name': fc.display_name,
                    'category': fc.category,
                    'pimly': fc.pimly_value,
                    'krowne': fc.krowne_value,
                    'notes': fc.notes
                }
                for fc in product_comparison.field_comparisons if fc.has_partial_data
            ],
            'total_fields_compared': product_comparison.summary.total_fields_compared,
            'mismatch_count': product_comparison.summary.mismatches,
            'match_count': product_comparison.summary.matches,
            'partial_data_count': product_comparison.summary.partial_data,
            'overall_match_percentage': product_comparison.summary.overall_match_percentage,
            'categories_compared': product_comparison.summary.categories_compared
        },
        'status': product_comparison.status,
        'errors': product_comparison.errors,
        'timestamp': product_comparison.summary.comparison_timestamp,
        # Additional fields for backward compatibility
        'name': product_comparison.pimly_mapping.name if product_comparison.pimly_mapping else (product_comparison.krowne_mapping.name if product_comparison.krowne_mapping else None),
        'mapped_data': {
            'pimly': mapped_comparator.mapper.export_mapping(product_comparison.pimly_mapping, format="dict") if product_comparison.pimly_mapping else None,
            'krowne': mapped_comparator.mapper.export_mapping(product_comparison.krowne_mapping, format="dict") if product_comparison.krowne_mapping else None
        }
    }


@main.route("/api/products/detailed/<sku>", methods=["GET"])
def get_detailed_product_comparison(sku):
    """
    Get detailed product comparison including raw data from both sources
    """
    try:
        sf_client = get_authenticated_sf_client()
        pimly_client = PimlyClient(sf_client)
        krowne_scraper = KrowneScraper()
        comparator = MappedDataComparator()
        mapper = ProductDataMapper()
        
        # Get raw data from both sources
        raw_pimly_data = pimly_client.get_product_by_sku(sku)
        raw_krowne_data = None
        
        try:
            # Try to get Krowne data (may not always be available)
            raw_krowne_data = krowne_scraper.scrapeSite(BASEURL, sku)
        except Exception as e:
            logger.warning(f"Could not fetch Krowne data for SKU {sku}: {e}")
        
        # Process and map the data
        mapped_data = None
        if raw_pimly_data:
            mapped_data = mapper.process_json_data(raw_pimly_data, source_type="pimly")
        
        # Perform detailed comparison
        comparison_result = comparator.compare_products(
            pimly_data=raw_pimly_data,
            krowne_data=raw_krowne_data,
            sku=sku
        )
        
        # Format field comparisons for frontend
        field_comparisons = []
        if hasattr(comparison_result, 'field_comparisons'):
            for field_comp in comparison_result.field_comparisons:
                field_comparisons.append({
                    'field_name': field_comp.field_name,
                    'display_name': field_comp.display_name,
                    'category': field_comp.category,
                    'pimly_value': field_comp.pimly_value,
                    'krowne_value': field_comp.krowne_value,
                    'is_match': field_comp.is_match,
                    'is_mismatch': field_comp.is_mismatch,
                    'has_partial_data': field_comp.has_partial_data,
                    'field_type': field_comp.field_type,
                    'confidence_score': field_comp.confidence_score,
                    'notes': field_comp.notes,
                    'description': field_comp.description
                })
        
        # Format comparison summary
        comparison_summary = None
        if hasattr(comparison_result, 'summary'):
            summary = comparison_result.summary
            comparison_summary = {
                'sku': summary.sku,
                'total_fields': summary.total_fields_compared,
                'matches': summary.matches,
                'mismatches': summary.mismatches,
                'partial_data': summary.partial_data,
                'pimly_only_fields': summary.pimly_only_fields,
                'krowne_only_fields': summary.krowne_only_fields,
                'overall_match_percentage': summary.overall_match_percentage,
                'comparison_timestamp': summary.comparison_timestamp,
                'categories_compared': summary.categories_compared
            }
        
        # Prepare response with raw data included
        response_data = {
            'sku': sku,
            'field_comparisons': field_comparisons,
            'comparison_summary': comparison_summary,
            'mapped_data': mapper.export_mapping(mapped_data, format="dict") if mapped_data else None,
            'raw_pimly_data': raw_pimly_data,  # Include raw Pimly data
            'raw_krowne_data': raw_krowne_data,  # Include raw Krowne data
            'status': comparison_result.status if hasattr(comparison_result, 'status') else 'unknown',
            'errors': comparison_result.errors if hasattr(comparison_result, 'errors') else [],
            'data_sources': {
                'pimly_available': raw_pimly_data is not None,
                'krowne_available': raw_krowne_data is not None,
                'mapped_data_available': mapped_data is not None
            }
        }
        
        return jsonify(response_data)
        
    except Exception as e:
        logger.exception(f"Error getting detailed product comparison for SKU {sku}")
        return jsonify({
            "error": str(e),
            "sku": sku,
            "field_comparisons": [],
            "comparison_summary": None,
            "mapped_data": None,
            "raw_pimly_data": None,
            "raw_krowne_data": None,
            "status": "error",
            "errors": [str(e)]
        }), 500

### Misc and Utility Endpoints ###

@main.route('/api/test-proxy', methods=['GET'])
def test_proxy():
    logger.info(f"Test proxy endpoint called from: {request.remote_addr}")
    logger.info(f"Request headers: {dict(request.headers)}")
    return jsonify({'message': 'Proxy is working!', 'timestamp': datetime.now().isoformat(), 'remote_addr': request.remote_addr, 'user_agent': str(request.user_agent)})

@main.route('/api/health', methods=['GET'])
def health_check():
    return jsonify({'status': 'healthy', 'service': 'KrowneSync', 'salesforce_configured': bool(current_app.config.get('SALESFORCE_CLIENT_ID')), 'csv_processor': 'enhanced'})











# Error handler
@main.errorhandler(ValueError)
def handle_validation_error(e):
    logger.error(f"Validation error: {str(e)}")
    return jsonify({
        'error': 'Data validation failed',
        'details': str(e),
        'suggestions': [
            'Check CSV format and required columns',
            'Ensure data types are correct',
            'Try different validation level'
        ]
    }), 400
