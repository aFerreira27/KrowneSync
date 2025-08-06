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
from app.services.product_mapper import ProductMapper


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

### CORRECTED COMPARE ROUTE USING PRODUCTMAPPER ###

@main.route("/api/compare", methods=["POST", "OPTIONS"])
def compare_products():
    """Compare product data between Pimly/Salesforce and Krowne website using ProductMapper"""
    if request.method == "OPTIONS":
        return '', 200
    
    try:
        data = request.get_json()
        logger.info(f"Compare request data: {data}")
        
        # Handle different request formats from frontend
        sku = data.get('sku')
        skus = data.get('skus', [])
        search_term = data.get('search')
        
        # Determine target SKU(s)
        target_skus = []
        if sku:
            target_skus = [sku]
        elif search_term:
            target_skus = [search_term]
        elif skus and len(skus) > 0:
            target_skus = skus
        
        if not target_skus:
            return jsonify({"error": "SKU, search term, or skus required"}), 400
        
        logger.info(f"Processing comparison for SKUs: {target_skus}")
        
        # Initialize the ProductMapper
        mapper = ProductMapper()
        
        results = []
        
        # Process each SKU
        for target_sku in target_skus:
            logger.info(f"🔍 Processing SKU: {target_sku}")
            
            # Get Salesforce/Pimly data
            salesforce_data = None
            try:
                sf_client = get_authenticated_sf_client()
                pimly_client = PimlyClient(sf_client)
                salesforce_data = pimly_client.get_product_by_sku(target_sku)
                logger.info(f"✅ Salesforce data retrieved for {target_sku}")
                if salesforce_data:
                    logger.info(f"   Salesforce fields: {list(salesforce_data.keys())}")
            except Exception as e:
                logger.warning(f"❌ Could not fetch Salesforce data for {target_sku}: {str(e)}")
            
            # Get Krowne website data using the scraper
            krowne_data = None
            try:
                logger.info(f"🔍 Starting Krowne scraping for SKU: {target_sku}")
                krowne_scraper = KrowneScraper()
                
                # Get the product data - this should return the formatted data structure
                krowne_data = asyncio.run(krowne_scraper.get_product_by_sku(target_sku))
                
                if krowne_data:
                    logger.info(f"✅ Krowne data retrieved for {target_sku}")
                    logger.info(f"   Krowne fields: {list(krowne_data.keys())}")
                else:
                    logger.warning(f"❌ No Krowne data returned for {target_sku}")
            except Exception as e:
                logger.error(f"❌ Krowne scraping failed for {target_sku}: {str(e)}")
            
            # Use ProductMapper for comprehensive comparison
            comparison_results = []
            if salesforce_data or krowne_data:
                comparison_results = mapper.compare_products(
                    salesforce_data or {},
                    krowne_data or {}
                )
                logger.info(f"📊 ProductMapper found {len(comparison_results)} field comparisons for {target_sku}")
                
                # Log detailed comparison results
                for result in comparison_results:
                    if result.is_mismatch:
                        logger.info(f"   MISMATCH - {result.field_name}: SF='{result.salesforce_value}' vs Krowne='{result.krowne_value}'")
                    elif result.has_partial_data:
                        logger.info(f"   PARTIAL - {result.field_name}: SF='{result.salesforce_value}' vs Krowne='{result.krowne_value}'")
            
            # Convert comparison results to the format expected by frontend
            mismatches = []
            matches = []
            partial_data = []
            
            for result in comparison_results:
                comparison_item = {
                    'field': result.field_name.replace('_', ' ').title(),
                    'canonical_name': result.field_name,
                    'salesforce': result.salesforce_value,
                    'krowne': result.krowne_value,
                    'notes': result.notes,
                    'description': mapper.get_field_description(result.field_name)
                }
                
                if result.is_mismatch:
                    mismatches.append(comparison_item)
                elif result.has_partial_data:
                    partial_data.append(comparison_item)
                elif result.is_match:
                    matches.append(comparison_item)
            
            # Create result item with comprehensive data
            result_item = {
                'sku': target_sku,
                'product_id': target_sku,
                'salesforce': salesforce_data,
                'krowne': krowne_data,
                'comparison': {
                    'mismatches': mismatches,
                    'matches': matches,
                    'partial_data': partial_data,
                    'total_fields_compared': len(comparison_results),
                    'mismatch_count': len(mismatches),
                    'match_count': len(matches),
                    'partial_data_count': len(partial_data)
                },
                'mismatches': mismatches,  # For backward compatibility
                'timestamp': datetime.utcnow().isoformat(),
                'status': determine_product_status(salesforce_data, krowne_data)
            }
            
            # Add frontend-compatible fields
            if krowne_data:
                result_item.update({
                    'krowne_name': krowne_data.get('name'),
                    'krowne_price': krowne_data.get('price') or krowne_data.get('listPrice'),
                    'krowne_description': krowne_data.get('description'),
                    'krowne_url': f"https://www.krowne.com/{target_sku}",
                    'krowne_image': krowne_data.get('mainImageUrl'),
                    'name': krowne_data.get('name')
                })
            
            if salesforce_data:
                result_item.update({
                    'salesforce_name': salesforce_data.get('name'),
                    'salesforce_price': mapper.extract_salesforce_value(salesforce_data, 'list_price'),
                    'salesforce_description': (
                        mapper.extract_salesforce_value(salesforce_data, 'description') or
                        salesforce_data.get('description')
                    )
                })
            
            results.append(result_item)
        
        # Return results in consistent format
        response_data = {
            'results': results,
            'total': len(results),
            'timestamp': datetime.utcnow().isoformat(),
            'success': True,
            'mapper_info': {
                'total_mapped_fields': len(mapper.get_all_canonical_fields()),
                'mapped_fields': mapper.get_all_canonical_fields()
            }
        }
        
        logger.info(f"📤 Returning {len(results)} comparison results using ProductMapper")
        return jsonify(response_data)
        
    except Exception as e:
        logger.error(f"💥 Error in compare_products: {str(e)}", exc_info=True)
        return jsonify({
            "error": str(e),
            "success": False,
            "timestamp": datetime.utcnow().isoformat()
        }), 500

def determine_product_status(salesforce_data, krowne_data):
    """Determine the status of a product based on available data"""
    if salesforce_data and krowne_data:
        return 'found_both'
    elif salesforce_data and not krowne_data:
        return 'missing_from_krowne'
    elif not salesforce_data and krowne_data:
        return 'missing_from_salesforce'
    else:
        return 'not_found'

### Additional ProductMapper Utility Routes ###

@main.route('/api/mapper/fields', methods=['GET'])
def get_mapped_fields():
    """Get all available mapped fields from ProductMapper"""
    try:
        mapper = ProductMapper()
        fields_info = []
        
        for field_name in mapper.get_all_canonical_fields():
            mapping = mapper.field_mappings[field_name]
            fields_info.append({
                'canonical_name': field_name,
                'display_name': field_name.replace('_', ' ').title(),
                'description': mapping.description,
                'field_type': mapping.field_type,
                'salesforce_names': mapping.salesforce_names,
                'krowne_names': mapping.krowne_names
            })
        
        return jsonify({
            'fields': fields_info,
            'total_fields': len(fields_info)
        })
        
    except Exception as e:
        logger.error(f"Error getting mapped fields: {str(e)}")
        return jsonify({'error': str(e)}), 500

@main.route('/api/mapper/compare-detailed/<sku>', methods=['GET'])
def get_detailed_comparison(sku):
    """Get detailed field-by-field comparison for a single SKU"""
    try:
        # Get both data sources
        salesforce_data = None
        try:
            sf_client = get_authenticated_sf_client()
            pimly_client = PimlyClient(sf_client)
            salesforce_data = pimly_client.get_product_by_sku(sku)
        except Exception as e:
            logger.warning(f"Could not fetch Salesforce data: {str(e)}")
        
        krowne_data = None
        try:
            krowne_scraper = KrowneScraper()
            krowne_data = asyncio.run(krowne_scraper.get_product_by_sku(sku))
        except Exception as e:
            logger.warning(f"Could not fetch Krowne data: {str(e)}")
        
        # Use ProductMapper for detailed comparison
        mapper = ProductMapper()
        comparison_results = mapper.compare_products(
            salesforce_data or {},
            krowne_data or {}
        )
        
        # Organize results by category
        detailed_results = {
            'sku': sku,
            'salesforce_available': salesforce_data is not None,
            'krowne_available': krowne_data is not None,
            'comparison_summary': {
                'total_fields': len(comparison_results),
                'matches': len([r for r in comparison_results if r.is_match]),
                'mismatches': len([r for r in comparison_results if r.is_mismatch]),
                'partial_data': len([r for r in comparison_results if r.has_partial_data]),
                'no_data': len([r for r in comparison_results if not r.salesforce_value and not r.krowne_value])
            },
            'field_comparisons': []
        }
        
        for result in comparison_results:
            detailed_results['field_comparisons'].append({
                'field_name': result.field_name,
                'display_name': result.field_name.replace('_', ' ').title(),
                'description': mapper.get_field_description(result.field_name),
                'field_type': mapper.field_mappings[result.field_name].field_type,
                'salesforce_value': result.salesforce_value,
                'krowne_value': result.krowne_value,
                'normalized_sf': mapper.normalize_value(result.salesforce_value, mapper.field_mappings[result.field_name].field_type),
                'normalized_krowne': mapper.normalize_value(result.krowne_value, mapper.field_mappings[result.field_name].field_type),
                'is_match': result.is_match,
                'is_mismatch': result.is_mismatch,
                'has_partial_data': result.has_partial_data,
                'notes': result.notes
            })
        
        return jsonify(detailed_results)
        
    except Exception as e:
        logger.error(f"Error in detailed comparison: {str(e)}")
        return jsonify({'error': str(e)}), 500
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

# Add this fix to the top of your routes.py file, right after the existing imports:

# Fix the import for calculate_product_mismatches
from app.services.product_mapper import ProductMapper, calculate_product_mismatches

# Then update the compareRaw function to use the correct import:

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
        
        # Calculate mismatches using the correct function
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