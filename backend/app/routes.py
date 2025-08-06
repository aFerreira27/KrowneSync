import os
import asyncio
import secrets
import logging

from flask import Blueprint, request, jsonify, current_app, session, url_for, redirect
from werkzeug.utils import secure_filename
from datetime import datetime

from app.services.salesforce_client import SalesforceClient
from app.services.pimly_client import PimlyClient
from app.services.krowne_cms_service import KrowneCMSService
from app.services.krowne_scraper import KrowneScraper
from app.services.extract_skus import extract_known_ids_from_csv    

main = Blueprint('main', __name__)

# Configure logging
logger = logging.getLogger(__name__)

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

@main.route("/api/products/skus", methods=["GET", "OPTIONS"])
def list_product_skus():
    if request.method == "OPTIONS":
        return '', 200
    try:
        # Load SKUs directly from CSV file
        skus = extract_known_ids_from_csv()
        return jsonify(skus)
    except Exception as e:
        logger.error(f"Error loading SKUs: {str(e)}")
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

@main.route("/api/pimly/products", methods=["GET", "OPTIONS"])
def get_pimly_products():
    """Get all products from Pimly"""
    if request.method == "OPTIONS":
        return '', 200
    
    try:
        sf_client = get_authenticated_sf_client()
        pimly_client = PimlyClient(sf_client)
        
        # Get query parameters
        limit = request.args.get('limit', 100, type=int)
        offset = request.args.get('offset', 0, type=int)
        
        # For now, get products using known SKUs from CSV
        known_skus = extract_known_ids_from_csv()
        
        # Get a subset based on pagination
        paginated_skus = known_skus[offset:offset + limit]
        
        if paginated_skus:
            products = pimly_client.get_products_by_ids(paginated_skus)
        else:
            products = []
        
        return jsonify({
            'products': products,
            'total': len(known_skus),
            'limit': limit,
            'offset': offset
        })
    except Exception as e:
        logger.error(f"Error getting Pimly products: {str(e)}")
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

### Krowne Scraper Routes ###
@main.route('/api/krowne/scrape-product/<sku>', methods=['GET'])
def scrape_krowne_product(sku):
    try:
        scraper = KrowneScraper()
        product_data = scraper.scrapeSite(sku)
        logger.info(f"Krowne product scraped successfully for SKU: {sku}")
        if product_data:
            return jsonify({'success': True, 'product': product_data})
        else:
            logger.warning(f"Krowne product not found for SKU: {sku}")
            return jsonify({'success': False, 'error': 'Product not found'}), 404
    except Exception as e:
        logger.error(f"Krowne scraping error for SKU {sku}: {str(e)}")
        return jsonify({'success': False, 'error': str(e)}), 500

### Compare and Sync Endpoints ###
@main.route('/api/compare', methods=['POST'])
def compare_products():
    try:
        data = request.get_json()
        skus = data.get('skus')

        if not isinstance(skus, list) or not skus:
            return jsonify({'error': 'SKUs must be provided as a non-empty list'}), 400

        sf_client = get_authenticated_sf_client()
        pimly_client = PimlyClient(sf_client)
        scraper = KrowneScraper()

        results = []

        for sku in skus:
            pimly_product = {}
            krowne_product = {}
            comparison = {}

            try:
                pimly_product = pimly_client.get_product_by_sku(sku) or {}
            except Exception as e:
                logger.warning(f"Failed to fetch Pimly product for SKU {sku}: {e}")

            try:
                krowne_product = scraper.scrapeSite(sku) or {}
            except Exception as e:
                logger.warning(f"Failed to scrape Krowne product for SKU {sku}: {e}")

            # Compare common fields (customize this list as needed)
            fields_to_compare = ['name', 'description', 'price', 'image_url', 'category']
            for field in fields_to_compare:
                pimly_val = pimly_product.get(field)
                krowne_val = krowne_product.get(field)

                comparison[field] = {
                    'pimly': pimly_val,
                    'krowne': krowne_val,
                    'match': pimly_val == krowne_val
                }

            results.append({
                'sku': sku,
                'comparison': comparison,
                'pimly': pimly_product,
                'krowne': krowne_product
            })

        return jsonify({'results': results, 'count': len(results)})

    except Exception as e:
        logger.error(f"Error during product comparison: {str(e)}", exc_info=True)
        return jsonify({'error': 'Internal server error'}), 500

@main.route('/api/compare/<sku>', methods=['POST'])
def compare_single_product(sku):
    try:
        sf_client = get_authenticated_sf_client()
        pimly_client = PimlyClient(sf_client)
        scraper = KrowneScraper()

        # Fetch product data
        try:
            pimly_product = pimly_client.get_product_by_sku(sku) or {}
        except Exception as e:
            logger.warning(f"Failed to fetch Pimly product for SKU {sku}: {e}")
            pimly_product = {}

        try:
            krowne_product = scraper.scrapeSite(sku) or {}
        except Exception as e:
            logger.warning(f"Failed to scrape Krowne product for SKU {sku}: {e}")
            krowne_product = {}

        # Define fields to compare (adjust these based on actual structure)
        fields_to_compare = ['name', 'description', 'price', 'image_url', 'category']

        comparison = {}
        for field in fields_to_compare:
            pimly_val = pimly_product.get(field)
            krowne_val = krowne_product.get(field)

            comparison[field] = {
                'pimly': pimly_val,
                'krowne': krowne_val,
                'match': pimly_val == krowne_val
            }

        return jsonify({
            'sku': sku,
            'comparison': comparison,
            'pimly': pimly_product,
            'krowne': krowne_product
        })

    except Exception as e:
        logger.error(f"Error comparing product for SKU {sku}: {str(e)}", exc_info=True)
        return jsonify({'error': 'Internal server error'}), 500

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
