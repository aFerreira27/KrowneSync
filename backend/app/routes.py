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
from app.services.krowne_scraper import KrowneScraper
from app.services.extract_skus import extract_known_ids_from_csv

BASEURL = "https://krowne.com/"

main = Blueprint('main', __name__)

# Configure logging
logger = logging.getLogger(__name__)

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

### Comparison Endpoints ###
@main.route("/api/products/compare/<sku>", methods=["GET"]) 
def compare_product_data(sku):
    """Enhanced product comparison with raw data included"""
    try:
        sf_client = get_authenticated_sf_client()
        pimly_client = PimlyClient(sf_client)
        krowne_scraper = KrowneScraper()
        
        # Get data from both sources
        pimly_data = pimly_client.get_product_by_sku(sku)
        krowne_data = None
        
        try:
            scrape_krowne_product(sku)
        except Exception as e:
            logger.warning(f"Could not fetch Krowne data for comparison of SKU {sku}: {e}")
        
        # Format for response (keeping backward compatibility)
        response = {
            'sku': sku,
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