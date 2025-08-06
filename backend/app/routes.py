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


# def load_skus_from_csv():
#     """Load known SKUs from the Initial_Import.csv file"""
#     import csv
#     import os
    
#     csv_path = os.path.join(os.path.dirname(__file__), '..', 'uploads', 'Initial_Import.csv')
#     skus = []
    
#     try:
#         if os.path.exists(csv_path):
#             with open(csv_path, 'r', encoding='utf-8') as file:
#                 reader = csv.reader(file)
#                 next(reader, None)  # Skip header row
#                 for row in reader:
#                     if row and len(row) > 0:
#                         sku = row[0].strip()
#                         if sku:
#                             skus.append(sku)
#         logger.info(f"Loaded {len(skus)} SKUs from CSV")
#     except Exception as e:
#         logger.error(f"Error loading SKUs from CSV: {str(e)}")
    
#     return skus


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
        # Use the new async method that properly formats data
        product_data = asyncio.run(scraper.get_product_by_sku(sku))
        
        logger.info(f"Krowne product scraped successfully for SKU: {sku}")
        if product_data:
            return jsonify({'success': True, 'product': product_data})
        else:
            logger.warning(f"Krowne product not found for SKU: {sku}")
            return jsonify({'success': False, 'error': 'Product not found'}), 404
    except Exception as e:
        logger.error(f"Krowne scraping error for SKU {sku}: {str(e)}")
        return jsonify({'success': False, 'error': str(e)}), 500


### Product Comparison Routes ###
@main.route("/api/compare", methods=["POST", "OPTIONS"])
def compare_products():
    """Compare product data between Pimly/Salesforce and Krowne website"""
    if request.method == "OPTIONS":
        return '', 200
    
    try:
        data = request.get_json()
        logger.info(f"Compare request data: {data}")
        
        # Handle different request formats from frontend
        sku = data.get('sku')
        skus = data.get('skus', [])
        search_term = data.get('search')
        
        # Determine target SKU
        target_sku = None
        if sku:
            target_sku = sku
        elif search_term:
            target_sku = search_term
        elif skus and len(skus) > 0:
            target_sku = skus[0]
        
        if not target_sku:
            return jsonify({"error": "SKU, search term, or skus required"}), 400
        
        logger.info(f"Processing comparison for SKU: {target_sku}")
        
        # Get Salesforce/Pimly data
        salesforce_data = None
        try:
            sf_client = get_authenticated_sf_client()
            pimly_client = PimlyClient(sf_client)
            salesforce_data = pimly_client.get_product_by_sku(target_sku)
            logger.info(f"✅ Salesforce data retrieved for {target_sku}")
        except Exception as e:
            logger.warning(f"❌ Could not fetch Salesforce data for {target_sku}: {str(e)}")
        
        # Get Krowne website data
        krowne_data = None
        try:
            logger.info(f"🔍 Starting Krowne scraping for SKU: {target_sku}")
            krowne_scraper = KrowneScraper()
            krowne_data = asyncio.run(krowne_scraper.get_product_by_sku(target_sku))
            
            if krowne_data:
                logger.info(f"✅ Krowne data retrieved for {target_sku}: {list(krowne_data.keys())}")
            else:
                logger.warning(f"❌ No Krowne data returned for {target_sku}")
        except Exception as e:
            logger.error(f"❌ Krowne scraping failed for {target_sku}: {str(e)}")
        
        # Calculate mismatches
        mismatches = []
        if salesforce_data and krowne_data:
            mismatches = calculate_product_mismatches(salesforce_data, krowne_data)
            logger.info(f"📊 Calculated {len(mismatches)} mismatches for {target_sku}")
        
        # Create result in the format the frontend expects
        result_item = {
            'sku': target_sku,
            'product_id': target_sku,
            'salesforce': salesforce_data,
            'krowne': krowne_data,
            'mismatches': mismatches,
            'timestamp': datetime.utcnow().isoformat(),
            'status': 'found' if (salesforce_data or krowne_data) else 'not_found'
        }
        
        # Add the fields the frontend specifically looks for
        if krowne_data:
            result_item.update({
                'krowne_name': krowne_data.get('name'),
                'krowne_price': krowne_data.get('price'),
                'krowne_description': krowne_data.get('description'),
                'krowne_url': f"https://www.krowne.com/{target_sku}",
                'krowne_image': krowne_data.get('mainImageUrl'),
                'name': krowne_data.get('name')  # Some frontend code looks for just 'name'
            })
        
        # Check if this is a batch request (skus array) or single request
        if isinstance(skus, list) and len(skus) > 1:
            # Handle multiple SKUs (batch processing)
            logger.info(f"Batch processing {len(skus)} SKUs")
            results = [result_item]  # Start with first SKU
            
            # Process remaining SKUs
            for remaining_sku in skus[1:]:
                # Process each remaining SKU... (similar logic)
                pass
            
            return jsonify({
                'results': results,
                'total': len(results),
                'timestamp': datetime.utcnow().isoformat()
            })
        else:
            # Single SKU request - return in results array format
            logger.info(f"📤 Returning single result for {target_sku}")
            return jsonify({
                'results': [result_item],
                'total': 1,
                'timestamp': datetime.utcnow().isoformat()
            })
        
    except Exception as e:
        logger.error(f"💥 Error in compare_products: {str(e)}", exc_info=True)
        return jsonify({"error": str(e)}), 500
    
def calculate_product_mismatches(salesforce_data, krowne_data):
    """Calculate mismatches between Salesforce and Krowne data - ENHANCED"""
    mismatches = []
    
    try:
        # Helper function to get property value from Salesforce data
        def get_sf_property(properties, prop_name):
            if not properties or not isinstance(properties, list):
                return None
            for prop in properties:
                if prop.get('propertyAdminName') == prop_name or prop.get('propertyName') == prop_name:
                    return prop.get('value')
            return None
        
        # Enhanced price cleaning function
        def clean_price(price):
            if not price:
                return None
            if isinstance(price, (int, float)):
                return float(price)
            if isinstance(price, str):
                # Remove currency symbols and whitespace
                clean = price.replace('$', '').replace(',', '').strip()
                try:
                    return float(clean)
                except ValueError:
                    return None
            return None
        
        # Enhanced text comparison function
        def normalize_text(text):
            if not text:
                return ""
            return str(text).lower().strip()
        
        # Compare names
        sf_name = salesforce_data.get('name')
        krowne_name = krowne_data.get('name')
        if sf_name and krowne_name:
            # Remove SKU prefix from Salesforce name for comparison
            sf_name_clean = sf_name
            if ' - ' in sf_name:
                sf_name_clean = sf_name.split(' - ', 1)[1]  # Remove "16-281 - " prefix
            
            if normalize_text(sf_name_clean) != normalize_text(krowne_name):
                mismatches.append({
                    'field': 'Name',
                    'salesforce': sf_name,
                    'krowne': krowne_name
                })
        
        # Enhanced price comparison
        sf_price = get_sf_property(salesforce_data.get('properties', []), 'List_Price')
        krowne_price = krowne_data.get('price')
        
        if sf_price is not None and krowne_price is not None:
            sf_price_clean = clean_price(sf_price)
            krowne_price_clean = clean_price(krowne_price)
            
            if (sf_price_clean is not None and krowne_price_clean is not None and 
                abs(sf_price_clean - krowne_price_clean) > 0.01):
                mismatches.append({
                    'field': 'List Price',
                    'salesforce': sf_price,
                    'krowne': krowne_price
                })
        
        # Compare series
        sf_series = get_sf_property(salesforce_data.get('properties', []), 'Series') or salesforce_data.get('series')
        krowne_series = krowne_data.get('series')
        if (sf_series and krowne_series and 
            normalize_text(sf_series) != normalize_text(krowne_series)):
            mismatches.append({
                'field': 'Series',
                'salesforce': sf_series,
                'krowne': krowne_series
            })
        
        # Compare warranty
        sf_warranty = get_sf_property(salesforce_data.get('properties', []), 'Warranty') or salesforce_data.get('warranty')
        krowne_warranty = krowne_data.get('warranty')
        if (sf_warranty and krowne_warranty and 
            normalize_text(sf_warranty) != normalize_text(krowne_warranty)):
            mismatches.append({
                'field': 'Warranty',
                'salesforce': sf_warranty,
                'krowne': krowne_warranty
            })
        
        # Enhanced description comparison
        sf_description = (get_sf_property(salesforce_data.get('properties', []), 'Description') or 
                         get_sf_property(salesforce_data.get('properties', []), 'Product_Description') or
                         salesforce_data.get('description'))
        krowne_description = krowne_data.get('description')
        
        if sf_description and krowne_description:
            sf_desc_clean = normalize_text(sf_description)
            krowne_desc_clean = normalize_text(krowne_description)
            
            # Only flag as mismatch if they're significantly different
            # (allows for minor variations in formatting)
            if sf_desc_clean != krowne_desc_clean and len(sf_desc_clean) > 10:
                mismatches.append({
                    'field': 'Description',
                    'salesforce': sf_description,
                    'krowne': krowne_description
                })
        
        # Compare specifications that exist in both systems
        if salesforce_data.get('properties') and krowne_data.get('properties'):
            sf_props = salesforce_data['properties']
            krowne_props = krowne_data['properties']
            
            # Create lookup for Krowne properties
            krowne_lookup = {}
            for prop in krowne_props:
                admin_name = prop.get('propertyAdminName', '')
                prop_name = prop.get('propertyName', '')
                krowne_lookup[admin_name] = prop.get('value')
                krowne_lookup[prop_name] = prop.get('value')
                # Also add variations
                krowne_lookup[admin_name.replace('_', ' ')] = prop.get('value')
                krowne_lookup[prop_name.replace(' ', '_')] = prop.get('value')
            
            # Compare Salesforce properties against Krowne
            for sf_prop in sf_props:
                sf_admin_name = sf_prop.get('propertyAdminName', '')
                sf_prop_name = sf_prop.get('propertyName', '')
                sf_value = sf_prop.get('value')
                
                # Skip certain fields to avoid duplicates
                skip_fields = ['SKU', 'sku', 'Name', 'Price', 'List_Price', 'Description', 'Product_Description']
                if sf_admin_name in skip_fields or sf_prop_name in skip_fields:
                    continue
                
                # Look for matching Krowne property
                krowne_value = (krowne_lookup.get(sf_admin_name) or 
                               krowne_lookup.get(sf_prop_name) or
                               krowne_lookup.get(sf_admin_name.replace('_', ' ')) or
                               krowne_lookup.get(sf_prop_name.replace(' ', '_')))
                
                if sf_value and krowne_value and normalize_text(sf_value) != normalize_text(krowne_value):
                    mismatches.append({
                        'field': sf_prop_name or sf_admin_name,
                        'salesforce': sf_value,
                        'krowne': krowne_value
                    })
        
        return mismatches
        
    except Exception as e:
        logger.error(f"Error calculating mismatches: {str(e)}")
        return []

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



# Add these debug routes to your routes.py file (with correct imports)

@main.route("/api/test-scraper/<sku>", methods=["GET"])
def test_scraper(sku):
    """Simple test to see what the scraper returns"""
    try:
        logger.info(f"Testing scraper for SKU: {sku}")
        
        scraper = KrowneScraper()
        result = asyncio.run(scraper.get_product_by_sku(sku))
        
        return jsonify({
            "sku": sku,
            "scraper_result": result,
            "result_type": str(type(result)),
            "has_data": result is not None,
            "result_keys": list(result.keys()) if result and isinstance(result, dict) else None
        })
        
    except Exception as e:
        logger.error(f"Scraper test error: {e}")
        return jsonify({"error": str(e)}), 500

@main.route("/api/compare-debug", methods=["POST"])
def compare_debug():
    """Debug version of compare that shows raw response"""
    try:
        data = request.get_json()
        logger.info(f"Debug compare request: {data}")
        
        # Your existing comparison logic here but with detailed logging
        sku = data.get('sku') or data.get('search', 'kr-2000')  # Default to kr-2000
        
        # Test Salesforce
        salesforce_data = None
        try:
            sf_client = get_authenticated_sf_client()
            pimly_client = PimlyClient(sf_client)
            salesforce_data = pimly_client.get_product_by_sku(sku)
            logger.info(f"Salesforce data type: {type(salesforce_data)}")
        except Exception as e:
            logger.error(f"Salesforce error: {e}")
        
        # Test Krowne
        krowne_data = None
        try:
            scraper = KrowneScraper()
            krowne_data = asyncio.run(scraper.get_product_by_sku(sku))
            logger.info(f"Krowne data type: {type(krowne_data)}")
            logger.info(f"Krowne data keys: {list(krowne_data.keys()) if krowne_data else None}")
        except Exception as e:
            logger.error(f"Krowne error: {e}")
        
        # Return raw debug info
        debug_response = {
            "request_data": data,
            "sku": sku,
            "salesforce_data": salesforce_data,
            "krowne_data": krowne_data,
            "salesforce_type": str(type(salesforce_data)),
            "krowne_type": str(type(krowne_data)),
            "has_salesforce": salesforce_data is not None,
            "has_krowne": krowne_data is not None
        }
        
        logger.info(f"Debug response keys: {list(debug_response.keys())}")
        
        return jsonify(debug_response)
        
    except Exception as e:
        logger.error(f"Debug compare error: {e}")
        return jsonify({"error": str(e)}), 500

# Also add this to see the current /api/compare response format
@main.route("/api/compare-raw/<sku>", methods=["GET"])
def compare_raw(sku):
    """See what the current compare endpoint returns for a single SKU"""
    try:
        logger.info(f"Raw compare test for SKU: {sku}")
        
        # Simulate what the frontend sends
        fake_request_data = {"sku": sku}
        
        # Get Salesforce/Pimly data
        salesforce_data = None
        try:
            sf_client = get_authenticated_sf_client()
            pimly_client = PimlyClient(sf_client)
            salesforce_data = pimly_client.get_product_by_sku(sku)
        except Exception as e:
            logger.warning(f"Could not fetch Salesforce data for {sku}: {str(e)}")
        
        # Get Krowne website data
        krowne_data = None
        try:
            krowne_scraper = KrowneScraper()
            krowne_data = asyncio.run(krowne_scraper.get_product_by_sku(sku))
        except Exception as e:
            logger.warning(f"Could not fetch Krowne data for {sku}: {str(e)}")
        
        # Calculate mismatches
        mismatches = []
        if salesforce_data and krowne_data:
            mismatches = calculate_product_mismatches(salesforce_data, krowne_data)
        
        # This is exactly what your current /api/compare should return
        result = {
            'sku': sku,
            'salesforce': salesforce_data,
            'krowne': krowne_data,
            'mismatches': mismatches,
            'timestamp': datetime.utcnow().isoformat()
        }
        
        return jsonify({
            "current_response_format": result,
            "krowne_data_preview": {
                "type": str(type(krowne_data)),
                "keys": list(krowne_data.keys()) if krowne_data else None,
                "has_name": krowne_data.get('name') if krowne_data else None,
                "has_price": krowne_data.get('price') if krowne_data else None
            }
        })
        
    except Exception as e:
        logger.error(f"Raw compare error: {e}")
        return jsonify({"error": str(e)}), 500
        logger.error(f"Debug compare error: {e}")
        return jsonify({"error": str(e)}), 500