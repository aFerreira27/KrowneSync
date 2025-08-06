import os
import asyncio
import secrets
import logging
import math

from flask import Blueprint, request, jsonify, current_app, session, url_for, redirect
from werkzeug.utils import secure_filename
from datetime import datetime

from app.services.salesforce_client import SalesforceClient
from app.services.pimly_client import PimlyClient
from app.services.krowne_cms_service import KrowneCMSService
from app.services.krowne_scraper import KrowneScraper
from app.services.extract_skus import extract_known_ids_from_csv
from app.services.product_mapper import ProductMapper, get_enhanced_product_comparison


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

BATCH_SIZE = int(os.environ.get("PIMLY_BATCH_SIZE", 50))  # tune as needed

@main.route("/api/pimly/products", methods=["GET", "OPTIONS"])
def get_pimly_products():
    """Get products from Pimly using batched requests for known SKUs."""
    if request.method == "OPTIONS":
        return '', 200

    try:
        sf_client = get_authenticated_sf_client()
        pimly_client = PimlyClient(sf_client)

        # Pagination / query params
        limit = request.args.get('limit', 100, type=int)
        offset = request.args.get('offset', 0, type=int)

        # Get known SKUs (pagination is applied to this list)
        # NOTE: if your extract_known_ids_from_csv requires a csv_path, pass it here
        known_skus = extract_known_ids_from_csv() or []
        total = len(known_skus)

        # Slice by offset/limit
        paginated_skus = known_skus[offset: offset + limit]

        products = []
        if paginated_skus:
            # Break into batches
            for i in range(0, len(paginated_skus), BATCH_SIZE):
                batch = paginated_skus[i:i + BATCH_SIZE]
                try:
                    batch_products = pimly_client.get_products_by_ids(batch) or []
                    # You may want to normalize or extend results here
                    products.extend(batch_products)
                except Exception as e:
                    # Log and continue: partial failure shouldn't block other batches
                    logger.exception("Error fetching Pimly batch for SKUs %s: %s", batch, str(e))

        return jsonify({
            'products': products,
            'total': total,
            'limit': limit,
            'offset': offset,
            'batches': math.ceil(len(paginated_skus) / BATCH_SIZE) if paginated_skus else 0
        })
    except Exception as e:
        logger.exception("Error getting Pimly products")
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
        raw_data = asyncio.run(scraper.get_product_by_sku(sku))

        if not raw_data:
            logger.warning(f"Krowne product not found for SKU: {sku}")
            return jsonify({'success': False, 'error': 'Product not found'}), 404

        logger.info(f"Krowne product scraped successfully for SKU: {sku}")

        # 🔧 Augment the raw data with formatted properties
        formatted_properties = raw_data.get("properties", [])

        # Append derived fields to properties
        if raw_data.get("description"):
            formatted_properties.append({
                "propertyName": "Description",
                "value": raw_data["description"]
            })

        if raw_data.get("features"):
            formatted_properties.append({
                "propertyName": "Features",
                "value": "; ".join(raw_data["features"])
            })

        # Ensure 'properties' contains these enhancements
        raw_data["properties"] = formatted_properties

        return jsonify({'success': True, 'product': raw_data})

    except Exception as e:
        logger.error(f"Krowne scraping error for SKU {sku}: {str(e)}", exc_info=True)
        return jsonify({'success': False, 'error': str(e)}), 500

### CORRECTED COMPARE ROUTE USING PRODUCTMAPPER ###

@main.route("/api/compare", methods=["POST", "OPTIONS"])
def compare_products():
    """Compare product data between Pimly/Salesforce and Krowne website using enhanced ProductMapper"""
    if request.method == "OPTIONS":
        return '', 200
    
    try:
        data = request.get_json()
        logger.info(f"Compare request data: {data}")
        
        # Handle different request formats from frontend
        sku = data.get('sku')
        skus = data.get('skus', [])
        search_term = data.get('search')
        debug_mode = data.get('debug', False)
        
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
                if debug_mode and salesforce_data:
                    mapper.log_field_extraction_debug(salesforce_data, "Salesforce")
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
                    if debug_mode:
                        mapper.log_field_extraction_debug(krowne_data, "Krowne")
                else:
                    logger.warning(f"❌ No Krowne data returned for {target_sku}")
            except Exception as e:
                logger.error(f"❌ Krowne scraping failed for {target_sku}: {str(e)}")
            
            # Use enhanced ProductMapper for comprehensive comparison
            enhanced_comparison = get_enhanced_product_comparison(
                salesforce_data or {},
                krowne_data or {}
            )
            
            logger.info(f"📊 Enhanced comparison completed for {target_sku}")
            logger.info(f"   Summary: {enhanced_comparison['summary']}")
            
            # Convert comparison results to the format expected by frontend
            mismatches = []
            matches = []
            partial_data = []
            
            for result in enhanced_comparison['comparison_results']:
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
                elif result.is_match and (result.salesforce_value is not None or result.krowne_value is not None):
                    matches.append(comparison_item)
            
            # Create result item with comprehensive data
            result_item = {
                'sku': target_sku,
                'product_id': target_sku,
                'salesforce': salesforce_data,
                'krowne': krowne_data,
                'comparison': {
                    'summary': enhanced_comparison['summary'],
                    'mismatches': mismatches,
                    'matches': matches,
                    'partial_data': partial_data,
                    'total_fields_compared': len(enhanced_comparison['comparison_results']),
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
                'mapped_fields': mapper.get_all_canonical_fields(),
                'version': 'enhanced_v2'  # Version indicator
            }
        }
        
        logger.info(f"📤 Returning {len(results)} enhanced comparison results")
        return jsonify(response_data)
        
    except Exception as e:
        logger.error(f"💥 Error in compare_products: {str(e)}", exc_info=True)
        return jsonify({
            "error": str(e),
            "success": False,
            "timestamp": datetime.utcnow().isoformat()
        }), 500


# Add this new utility route for field mapping diagnostics:

@main.route('/api/mapper/diagnose/<sku>', methods=['GET'])
def diagnose_field_mapping(sku):
    """Diagnose field mapping for a specific SKU to help with troubleshooting"""
    try:
        mapper = ProductMapper()
        
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
        
        # Extract available properties from both sources
        diagnosis = {
            'sku': sku,
            'timestamp': datetime.utcnow().isoformat(),
            'salesforce': {
                'available': salesforce_data is not None,
                'direct_fields': list(salesforce_data.keys()) if salesforce_data else [],
                'properties': []
            },
            'krowne': {
                'available': krowne_data is not None,
                'direct_fields': list(krowne_data.keys()) if krowne_data else [],
                'properties': []
            },
            'mapping_analysis': []
        }
        
        # Extract Salesforce properties
        if salesforce_data and 'properties' in salesforce_data:
            sf_props = salesforce_data.get('properties', [])
            for prop in sf_props:
                diagnosis['salesforce']['properties'].append({
                    'propertyName': prop.get('propertyName', ''),
                    'propertyAdminName': prop.get('propertyAdminName', ''),
                    'value': prop.get('value', '')
                })
        
        # Extract Krowne properties
        if krowne_data and 'properties' in krowne_data:
            krowne_props = krowne_data.get('properties', [])
            for prop in krowne_props:
                diagnosis['krowne']['properties'].append({
                    'propertyName': prop.get('propertyName', ''),
                    'propertyAdminName': prop.get('propertyAdminName', ''),
                    'value': prop.get('value', '')
                })
        
        # Analyze each mapping
        for field_name, mapping in mapper.field_mappings.items():
            sf_value = mapper.extract_salesforce_value(salesforce_data or {}, field_name)
            krowne_value = mapper.extract_krowne_value(krowne_data or {}, field_name)
            
            analysis = {
                'canonical_name': field_name,
                'description': mapping.description,
                'field_type': mapping.field_type,
                'salesforce_names': mapping.salesforce_names,
                'krowne_names': mapping.krowne_names,
                'krowne_cms_names': mapping.krowne_cms_names,
                'salesforce_value': sf_value,
                'krowne_value': krowne_value,
                'has_salesforce_data': sf_value is not None,
                'has_krowne_data': krowne_value is not None,
                'values_match': sf_value == krowne_value if sf_value is not None and krowne_value is not None else None
            }
            
            diagnosis['mapping_analysis'].append(analysis)
        
        return jsonify(diagnosis)
        
    except Exception as e:
        logger.error(f"Error in field mapping diagnosis: {str(e)}")
        return jsonify({'error': str(e)}), 500


# Add this route to test specific field extractions:

@main.route('/api/mapper/test-extraction', methods=['POST'])
def test_field_extraction():
    """Test field extraction with sample data"""
    try:
        data = request.get_json()
        test_data = data.get('test_data', {})
        field_name = data.get('field_name')
        source_type = data.get('source_type', 'krowne')  # 'salesforce' or 'krowne'
        
        mapper = ProductMapper()
        
        if source_type == 'salesforce':
            extracted_value = mapper.extract_salesforce_value(test_data, field_name)
        else:
            extracted_value = mapper.extract_krowne_value(test_data, field_name)
        
        mapping_info = mapper.get_mapping_info(field_name)
        
        result = {
            'field_name': field_name,
            'source_type': source_type,
            'extracted_value': extracted_value,
            'mapping_info': {
                'description': mapping_info.description if mapping_info else None,
                'field_type': mapping_info.field_type if mapping_info else None,
                'salesforce_names': mapping_info.salesforce_names if mapping_info else [],
                'krowne_names': mapping_info.krowne_names if mapping_info else [],
                'krowne_cms_names': mapping_info.krowne_cms_names if mapping_info else []
            },
            'test_data_structure': {
                'top_level_keys': list(test_data.keys()) if isinstance(test_data, dict) else None,
                'has_properties': 'properties' in test_data if isinstance(test_data, dict) else False,
                'properties_count': len(test_data.get('properties', [])) if isinstance(test_data, dict) and 'properties' in test_data else 0
            }
        }
        
        return jsonify(result)
        
    except Exception as e:
        logger.error(f"Error in test field extraction: {str(e)}")
        return jsonify({'error': str(e)}), 500


# Enhanced version of the existing scraper route with better property handling:

@main.route('/api/krowne/scrape-product-enhanced/<sku>', methods=['GET'])
def scrape_krowne_product_enhanced(sku):
    """Enhanced version of Krowne scraper with better property mapping"""
    try:
        scraper = KrowneScraper()
        raw_data = asyncio.run(scraper.get_product_by_sku(sku))

        if not raw_data:
            logger.warning(f"Krowne product not found for SKU: {sku}")
            return jsonify({'success': False, 'error': 'Product not found'}), 404

        logger.info(f"Krowne product scraped successfully for SKU: {sku}")

        # Initialize ProductMapper for enhanced property handling
        mapper = ProductMapper()
        
        # Get existing properties or initialize empty list
        formatted_properties = raw_data.get("properties", [])

        # Enhanced property augmentation using the mapper's field knowledge
        property_enhancements = []

        # Add description as property if it exists
        if raw_data.get("description"):
            property_enhancements.append({
                "propertyName": "Description",
                "propertyAdminName": "Product_Description",
                "value": raw_data["description"]
            })

        # Add features as property if they exist
        if raw_data.get("features"):
            features_text = "; ".join(raw_data["features"]) if isinstance(raw_data["features"], list) else str(raw_data["features"])
            property_enhancements.append({
                "propertyName": "Features",
                "propertyAdminName": "Features",
                "value": features_text
            })

        # Add price as property if it exists
        if raw_data.get("price") or raw_data.get("listPrice"):
            price_value = raw_data.get("price") or raw_data.get("listPrice")
            property_enhancements.append({
                "propertyName": "List Price",
                "propertyAdminName": "List_Price",
                "value": price_value
            })

        # Add dimensions as separate properties if they exist in specifications
        specs = raw_data.get("specifications", {})
        dimension_mappings = {
            "length": ("Length", "Product_Length_(in.)"),
            "height": ("Height", "Product_Height_(in.)"),
            "depth": ("Depth", "Product_Depth_(in.)"),
            "width": ("Width", "Product_Width_(in.)"),
            "weight": ("Weight", "Product_Weight_(lbs.)")
        }

        for spec_key, (prop_name, admin_name) in dimension_mappings.items():
            if spec_key in specs and specs[spec_key]:
                property_enhancements.append({
                    "propertyName": prop_name,
                    "propertyAdminName": admin_name,
                    "value": specs[spec_key]
                })

        # Add all enhancements to the properties array
        formatted_properties.extend(property_enhancements)

        # Ensure 'properties' contains all enhancements
        raw_data["properties"] = formatted_properties

        # Add mapping diagnostics for debugging
        diagnostics = {
            "total_properties": len(formatted_properties),
            "enhanced_properties_added": len(property_enhancements),
            "mapper_field_count": len(mapper.get_all_canonical_fields()),
            "extraction_test_results": {}
        }

        # Test extraction of key fields for diagnostics
        test_fields = ["product_name", "list_price", "weight", "length", "height", "features", "series"]
        for field in test_fields:
            extracted_value = mapper.extract_krowne_value(raw_data, field)
            diagnostics["extraction_test_results"][field] = {
                "extracted_value": extracted_value,
                "has_value": extracted_value is not None
            }

        return jsonify({
            'success': True, 
            'product': raw_data,
            'diagnostics': diagnostics
        })

    except Exception as e:
        logger.error(f"Enhanced Krowne scraping error for SKU {sku}: {str(e)}", exc_info=True)
        return jsonify({'success': False, 'error': str(e)}), 500


# Add route to get mapping statistics:

@main.route('/api/mapper/statistics', methods=['GET'])
def get_mapper_statistics():
    """Get statistics about the field mappings"""
    try:
        mapper = ProductMapper()
        
        # Count mappings by category
        field_types = {}
        salesforce_coverage = 0
        krowne_coverage = 0
        krowne_cms_coverage = 0
        
        for field_name, mapping in mapper.field_mappings.items():
            # Count by field type
            if mapping.field_type not in field_types:
                field_types[mapping.field_type] = 0
            field_types[mapping.field_type] += 1
            
            # Count coverage
            if mapping.salesforce_names:
                salesforce_coverage += 1
            if mapping.krowne_names:
                krowne_coverage += 1
            if mapping.krowne_cms_names:
                krowne_cms_coverage += 1
        
        statistics = {
            'total_mapped_fields': len(mapper.field_mappings),
            'field_types': field_types,
            'coverage': {
                'salesforce': salesforce_coverage,
                'krowne_website': krowne_coverage,
                'krowne_cms': krowne_cms_coverage
            },
            'coverage_percentages': {
                'salesforce': round(salesforce_coverage / len(mapper.field_mappings) * 100, 1),
                'krowne_website': round(krowne_coverage / len(mapper.field_mappings) * 100, 1),
                'krowne_cms': round(krowne_cms_coverage / len(mapper.field_mappings) * 100, 1)
            },
            'timestamp': datetime.utcnow().isoformat()
        }
        
        return jsonify(statistics)
        
    except Exception as e:
        logger.error(f"Error getting mapper statistics: {str(e)}")
        return jsonify({'error': str(e)}), 500


# Add route to validate property name matching:

@main.route('/api/mapper/validate-property-names', methods=['POST'])
def validate_property_names():
    """Validate how property names match against our mappings"""
    try:
        data = request.get_json()
        property_names = data.get('property_names', [])
        
        mapper = ProductMapper()
        validation_results = []
        
        for prop_name in property_names:
            matches = []
            
            # Check which canonical fields this property name might match
            for field_name, mapping in mapper.field_mappings.items():
                # Check against all name variations
                all_names = (mapping.salesforce_names + 
                           mapping.krowne_names + 
                           mapping.krowne_cms_names)
                
                for mapped_name in all_names:
                    if mapper._property_name_matches(prop_name, mapped_name):
                        matches.append({
                            'canonical_field': field_name,
                            'matched_name': mapped_name,
                            'field_type': mapping.field_type,
                            'description': mapping.description
                        })
                        break  # Only count first match per canonical field
            
            validation_results.append({
                'property_name': prop_name,
                'matches': matches,
                'match_count': len(matches),
                'has_matches': len(matches) > 0
            })
        
        summary = {
            'total_properties': len(property_names),
            'properties_with_matches': len([r for r in validation_results if r['has_matches']]),
            'properties_without_matches': len([r for r in validation_results if not r['has_matches']]),
            'total_matches': sum(r['match_count'] for r in validation_results)
        }
        
        return jsonify({
            'validation_results': validation_results,
            'summary': summary,
            'timestamp': datetime.utcnow().isoformat()
        })
        
    except Exception as e:
        logger.error(f"Error validating property names: {str(e)}")
        return jsonify({'error': str(e)}), 500

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