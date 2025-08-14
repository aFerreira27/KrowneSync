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
from app.services.sync_history import SyncHistoryService
from app.services.format_pimly import format_pimly_data

BASEURL = "https://krowne.com/"

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

### Salesforce OAuth Routes ###

@main.route('/api/auth/salesforce/initiate', methods=['POST'])
def initiate_salesforce_auth():
    try:
        logger.info("=== INITIATING SALESFORCE OAUTH ===")
        
        client_id = current_app.config.get('SALESFORCE_CLIENT_ID')
        client_secret = current_app.config.get('SALESFORCE_CLIENT_SECRET')
        redirect_uri = current_app.config.get('SALESFORCE_REDIRECT_URI')
        sandbox = current_app.config.get('SALESFORCE_SANDBOX', False)
        
        logger.info(f"Config - Client ID: {client_id[:8]}..., Redirect URI: {redirect_uri}, Sandbox: {sandbox}")

        if not client_id or not client_secret or not redirect_uri:
            missing = [key for key, val in {
                'SALESFORCE_CLIENT_ID': client_id,
                'SALESFORCE_CLIENT_SECRET': client_secret,
                'SALESFORCE_REDIRECT_URI': redirect_uri
            }.items() if not val]
            logger.error(f'Missing configuration: {", ".join(missing)}')
            return jsonify({'error': f'Missing configuration: {", ".join(missing)}'}), 500

        config = {
            'client_id': client_id,
            'client_secret': client_secret,
            'redirect_uri': redirect_uri,
            'sandbox': sandbox
        }
        sf_client = SalesforceClient(config)
        auth_data = sf_client.get_authorization_url()

        # 🔧 FIXED: Store session data with explicit session modification
        session.clear()  # Clear any existing session data
        session['oauth_state'] = auth_data['state']
        session['code_verifier'] = auth_data['code_verifier']
        session['sf_config'] = config
        session['oauth_timestamp'] = datetime.now().timestamp()  # Add timestamp for debugging
        session.permanent = True  # Make session permanent for OAuth flow
        session.modified = True   # Explicitly mark session as modified
        
        logger.info(f"Session stored - State: {auth_data['state'][:8]}..., Code Verifier: {auth_data['code_verifier'][:8]}...")
        logger.info(f"Session ID: {session.get('_id', 'No ID')}")

        return jsonify({
            'auth_url': auth_data['auth_url'],
            'redirect_uri': redirect_uri,
            'state': auth_data['state'],
            'sandbox': sandbox,
            'session_debug': {
                'session_id': session.get('_id', 'No ID'),
                'state_stored': bool(session.get('oauth_state')),
                'config_stored': bool(session.get('sf_config'))
            }
        })
    except Exception as e:
        logger.error(f"OAuth initiation error: {str(e)}", exc_info=True)
        return jsonify({'error': str(e)}), 500

@main.route('/api/auth/callback/salesforce')
def salesforce_callback():
    try:
        logger.info("=== SALESFORCE OAUTH CALLBACK STARTED ===")
        
        # 🔧 FIXED: Get frontend URL from config
        frontend_url = current_app.config.get('FRONTEND_URL', 'https://krownebase.art')
        
        code = request.args.get('code')
        state = request.args.get('state')
        error = request.args.get('error')

        logger.info(f"Callback params - Code: {bool(code)}, State: {state[:8] if state else 'None'}..., Error: {error}")
        logger.info(f"Session ID: {session.get('_id', 'No ID')}")
        
        # Check for OAuth errors first
        if error:
            error_description = request.args.get('error_description', 'Unknown error')
            logger.error(f"OAuth error from Salesforce: {error} - {error_description}")
            return redirect(f"{frontend_url}/?error={error}&error_description={error_description}")

        if not code:
            logger.error("No authorization code received from Salesforce")
            return redirect(f"{frontend_url}/?error=no_code&message=No authorization code received")

        # 🔧 FIXED: Better session data retrieval with debugging
        session_state = session.get('oauth_state')
        code_verifier = session.get('code_verifier')
        sf_config = session.get('sf_config')
        oauth_timestamp = session.get('oauth_timestamp')

        logger.info(f"Session data - State: {session_state[:8] if session_state else 'None'}..., "
                   f"Code Verifier: {bool(code_verifier)}, Config: {bool(sf_config)}, "
                   f"Timestamp: {oauth_timestamp}")

        # Check state parameter (CSRF protection)
        if not state or not session_state:
            logger.error(f"Missing state parameter - Request: {state}, Session: {session_state}")
            return redirect(f"{frontend_url}/?error=missing_state&message=Missing state parameter")
            
        if state != session_state:
            logger.error(f"State mismatch - Request: {state}, Session: {session_state}")
            # 🔧 FIXED: Provide more debugging info in the error
            error_msg = f"State parameter mismatch. This usually happens when the session expires or cookies are not working properly."
            return redirect(f"{frontend_url}/?error=invalid_state&message={error_msg}&debug_state={state[:8]}")

        if not sf_config or not code_verifier:
            logger.error("Missing session data for OAuth - this indicates session storage issues")
            return redirect(f"{frontend_url}/?error=session_expired&message=OAuth session expired - session storage may not be working properly")

        # Exchange code for tokens
        logger.info("Exchanging authorization code for access tokens...")
        sf_client = SalesforceClient(sf_config)
        token_info = sf_client.exchange_code_for_tokens(code, code_verifier)

        if not token_info.get('access_token') or not token_info.get('instance_url'):
            logger.error("Missing tokens in response from Salesforce")
            raise Exception("Missing tokens in response")

        # Store tokens in session
        session['sf_tokens'] = {
            'access_token': token_info['access_token'],
            'refresh_token': token_info.get('refresh_token'),
            'instance_url': token_info['instance_url'],
            'client_config': sf_config
        }
        session.modified = True

        # Test tokens by getting user info
        sf_client.set_tokens(token_info['access_token'], token_info.get('refresh_token'), token_info['instance_url'])
        user_info = sf_client.get_user_info()
        logger.info(f"OAuth successful for user: {user_info.get('display_name', 'Unknown')}")

        # 🔧 FIXED: Clean temporary session data more carefully
        temp_keys = ['oauth_state', 'code_verifier', 'sf_config', 'oauth_timestamp']
        for key in temp_keys:
            if key in session:
                del session[key]
        session.modified = True

        logger.info("=== SALESFORCE OAUTH CALLBACK COMPLETED SUCCESSFULLY ===")
        return redirect(f"{frontend_url}/?auth=success")

    except Exception as e:
        logger.error(f"OAuth callback error: {str(e)}", exc_info=True)
        
        # Clean up session on error
        temp_keys = ['oauth_state', 'code_verifier', 'sf_config', 'oauth_timestamp']
        for key in temp_keys:
            session.pop(key, None)
        session.modified = True
        
        frontend_url = current_app.config.get('FRONTEND_URL', 'https://krownebase.art')
        return redirect(f"{frontend_url}/?error=auth_failed&message={str(e)}")

@main.route('/api/auth/debug')
def debug_auth_state():
    """Debug endpoint to check session state - remove in production"""
    if current_app.config.get('FLASK_ENV') == 'production':
        return jsonify({'error': 'Debug endpoint disabled in production'}), 403
        
    return jsonify({
        'session_keys': list(session.keys()),
        'oauth_state_exists': 'oauth_state' in session,
        'sf_tokens_exists': 'sf_tokens' in session,
        'session_id': session.get('_id', 'No ID'),
        'session_permanent': session.permanent,
        'session_modified': session.modified
    })

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
        except Exception as e:
            logger.warning(f"Token validation failed: {str(e)}")
            # Try to refresh tokens
            if sf_client.refresh_access_token():
                # Update session with new tokens
                session['sf_tokens']['access_token'] = sf_client.access_token
                session.modified = True
                
                user_info = sf_client.get_user_info()
                return jsonify({'authenticated': True, 'user_info': user_info, 'instance_url': sf_tokens['instance_url']})
            else:
                # Refresh failed, clear session
                session.pop('sf_tokens', None)
                session.modified = True
                return jsonify({'authenticated': False, 'error': 'Token refresh failed'})

    except Exception as e:
        logger.error(f"Status check error: {str(e)}")
        return jsonify({'authenticated': False, 'error': str(e)})

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
    
@main.route("/api/pimly/products/<sku>", methods=["GET", "OPTIONS"])
def get_pimly_product_by_sku(sku):
    """
    Get a specific product by SKU from Pimly
    """
    if request.method == "OPTIONS":
        return '', 200

    try:
        sf_client = get_authenticated_sf_client()
        pimly_client = PimlyClient(sf_client)

        # Validate SKU
        if not sku or not isinstance(sku, str):
            return jsonify({"error": "Invalid SKU provided"}), 400

        logger.info(f"Fetching product from Pimly for SKU: {sku}")

        # Fetch product by SKU
        product = pimly_client.get_product_by_sku(sku)
        
        if not product:
            return jsonify({"error": f"Product with SKU {sku} not found"}), 404
        
        return jsonify(product)
    
    except Exception as e:
        logger.error(f"Error fetching product by SKU {sku}: {str(e)}")
        return jsonify({"error": str(e)}), 500
    
BATCH_SIZE = int(os.environ.get("PIMLY_BATCH_SIZE", 50))
MAX_PRODUCTS_PER_REQUEST = int(os.environ.get("MAX_PRODUCTS_PER_REQUEST", 4000))

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

# Add a helper function to get raw data without Flask Response wrapper
def get_krowne_product_data(sku):
    """Get Krowne product data as raw dict (not Flask Response)"""
    try:
        krowne_scraper = KrowneScraper()
        product_data = krowne_scraper.scrapeSite(BASEURL, sku)
        return product_data
    except Exception as e:
        logger.error(f"Error getting Krowne product data for {sku}: {str(e)}")
        return None

### Format Data Endpoints ###
@main.route("/api/products/format", methods=["POST", "OPTIONS"])
def format_product_data_endpoint():
    if request.method == "OPTIONS":
        return jsonify({}), 200
    
    try:
        # Get JSON data from request
        data = request.get_json()
        
        if not data:
            return jsonify({"error": "No JSON data provided"}), 400
        
        # Format the product data
        formatted_data = format_pimly_data(data)
        
        return jsonify({
            "success": True,
            "data": formatted_data
        }), 200
        
    except Exception as e:
        return jsonify({
            "success": False,
            "error": str(e)
        }), 500

### Comparison Endpoints ###
@main.route("/api/products/compare/<sku>", methods=["GET", "OPTIONS"]) 
def compare_product_data(sku):
    """Enhanced product comparison with raw data included"""
    if request.method == "OPTIONS":
        return '', 200
    
    try:
        sf_client = get_authenticated_sf_client()
        pimly_client = PimlyClient(sf_client)
                
        # Get data from both sources
        pimly_data = pimly_client.get_product_by_sku(sku)
        # Use the helper function instead of calling the route directly
        krowne_data = get_krowne_product_data(sku)
        
        logger.info(f"Comparing data for SKU: {sku}")
        
        # Handle case where krowne_data is None
        if krowne_data is None:
            krowne_data = {"error": f"Product {sku} not found on Krowne website"}
        
        # Format for response (keeping backward compatibility)
        response = {
            'sku': sku,
            'salesforce': format_pimly_data(pimly_data),  # Keep existing structure
            'krowne': krowne_data,
            'raw_data': {  # Add raw data section
                'pimly': pimly_data,
                'krowne': krowne_data
            }
        }
        
        logger.info(f"Comparison data for SKU {sku}: {response}")
        return jsonify(response), 200
        
    except Exception as e:
        logger.exception(f"Error comparing product data for SKU {sku}")
        return jsonify({"error": str(e)}), 500


### Sync History Routes ###
@main.route('/api/sync/history', methods=['GET', 'OPTIONS'])
def get_sync_history():
    """Get sync history for all SKUs or a specific SKU - Database version"""
    if request.method == "OPTIONS":
        return '', 200
    
    try:
        # Initialize database-powered sync history service
        sync_service = SyncHistoryService()
        
        # Get optional parameters
        sku = request.args.get('sku')
        sync_type = request.args.get('sync_type')
        
        # Get sync history from database
        history_records = sync_service.get_sync_history(sku, sync_type)
        
        # Get statistics
        stats = sync_service.get_sync_stats()
        
        # If this is the first time and no data exists, initialize from CSV
        if not history_records and not sku:
            try:
                csv_path = os.path.join(current_app.config['UPLOAD_FOLDER'], 'Initial_Import.csv')
                if os.path.exists(csv_path):
                    products_data = sync_service.load_products_from_csv(csv_path)
                    if products_data:
                        sync_service.bulk_init_skus(products_data)
                        # Refresh stats after initialization
                        stats = sync_service.get_sync_stats()
                        history_records = sync_service.get_sync_history()
            except Exception as e:
                logger.warning(f"Could not initialize from CSV: {e}")
        
        return jsonify({
            'success': True,
            'history': history_records,
            'stats': stats,
            'total_records': len(history_records)
        }), 200
        
    except Exception as e:
        logger.exception("Error getting sync history from database")
        return jsonify({
            'success': False,
            'error': str(e),
            'history': [],
            'stats': {}
        }), 500

@main.route('/api/sync/record', methods=['POST', 'OPTIONS'])
def record_sync():
    """Record a new sync operation - Database version"""
    if request.method == "OPTIONS":
        return '', 200
    
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': 'No JSON data provided'}), 400
        
        sku = data.get('sku')
        sync_type = data.get('sync_type')
        status = data.get('status', 'pending')
        sync_data = data.get('data', {})
        error_message = data.get('error_message')
        
        if not sku or not sync_type:
            return jsonify({'error': 'SKU and sync_type are required'}), 400
        
        sync_service = SyncHistoryService()
        success = sync_service.record_sync(sku, sync_type, status, sync_data, error_message)
        
        if success:
            return jsonify({'success': True, 'message': 'Sync recorded successfully'}), 200
        else:
            return jsonify({'success': False, 'error': 'Failed to record sync'}), 500
            
    except Exception as e:
        logger.exception("Error recording sync")
        return jsonify({'success': False, 'error': str(e)}), 500


@main.route('/api/sync/stats', methods=['GET', 'OPTIONS'])
def get_sync_stats():
    """Get sync statistics"""
    if request.method == "OPTIONS":
        return '', 200
    
    try:
        sync_service = SyncHistoryService()
        stats = sync_service.get_sync_stats()
        
        return jsonify({
            'success': True,
            'stats': stats
        }), 200
        
    except Exception as e:
        logger.error(f"Error getting sync stats: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@main.route('/api/sync/cleanup', methods=['POST', 'OPTIONS'])
def cleanup_sync_history():
    """Clean up old sync history records"""
    if request.method == "OPTIONS":
        return '', 200
    
    try:
        data = request.get_json() or {}
        days_old = data.get('days_old', 90)  # Default to 90 days
        
        sync_service = SyncHistoryService()
        cleaned_count = sync_service.cleanup_old_records(days_old)
        
        return jsonify({
            'success': True,
            'message': f'Cleaned up {cleaned_count} old records',
            'cleaned_count': cleaned_count
        }), 200
        
    except Exception as e:
        logger.error(f"Error cleaning up sync history: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


# Helper function to record sync operations (use this in other routes)
def record_sync_operation(sku: str, status: str, details: Optional[Dict[str, Any]] = None):
    """Helper function to record sync operations from other parts of the app
    
    Args:
        sku: Product SKU
        status: Sync status ('success', 'failed', 'pending')
        details: Additional details about the sync
    """
    try:
        sync_service = SyncHistoryService()
        sync_service.record_sync(sku, status, details)
    except Exception as e:
        logger.error(f"Failed to record sync operation for {sku}: {e}")

@main.route('/api/products/search', methods=['GET', 'OPTIONS'])
def search_products():
    """Search products in database"""
    if request.method == "OPTIONS":
        return '', 200
    
    try:
        search_term = request.args.get('q', '').strip()
        if not search_term:
            return jsonify({'error': 'Search term is required'}), 400
        
        sync_service = SyncHistoryService()
        products = sync_service.search_products(search_term)
        
        return jsonify({
            'success': True,
            'products': products,
            'total': len(products)
        }), 200
        
    except Exception as e:
        logger.exception("Error searching products")
        return jsonify({'success': False, 'error': str(e)}), 500

@main.route('/api/products/categories', methods=['GET', 'OPTIONS'])
def get_categories():
    """Get all product categories"""
    if request.method == "OPTIONS":
        return '', 200
    
    try:
        sync_service = SyncHistoryService()
        categories = sync_service.get_categories()
        
        return jsonify({
            'success': True,
            'categories': categories
        }), 200
        
    except Exception as e:
        logger.exception("Error getting categories")
        return jsonify({'success': False, 'error': str(e)}), 500
    
    
@main.route('/api/migrate/run', methods=['POST', 'GET'])
def run_migration():
    """
    HTTP endpoint to run database migration
    Can be triggered via browser or curl command
    """
    try:
        from app.services.database_service import DatabaseService
        from app.services.sync_history import SyncHistoryService
        import os
        import json
        
        migration_log = []
        
        # Step 1: Initialize database
        migration_log.append("🔄 Initializing database...")
        try:
            DatabaseService.init_database()
            migration_log.append("✅ Database tables created successfully")
        except Exception as e:
            migration_log.append(f"❌ Database initialization failed: {e}")
            return jsonify({
                'success': False,
                'error': str(e),
                'log': migration_log
            }), 500
        
        # Step 2: Migrate CSV data
        migration_log.append("🔄 Migrating CSV data...")
        csv_path = os.path.join(current_app.config.get('UPLOAD_FOLDER', 'uploads'), 'Initial_Import.csv')
        
        if os.path.exists(csv_path):
            try:
                # Use existing CSV parsing logic
                sync_service = SyncHistoryService()
                products_data = sync_service.load_products_from_csv(csv_path)
                
                if products_data:
                    # Bulk add to database
                    count = DatabaseService.bulk_add_products(products_data)
                    migration_log.append(f"✅ Migrated {count} products from CSV to database")
                else:
                    migration_log.append("⚠️ No products found in CSV file")
            except Exception as e:
                migration_log.append(f"❌ CSV migration failed: {e}")
        else:
            migration_log.append(f"⚠️ CSV file not found: {csv_path}")
        
        # Step 3: Migrate existing sync history (if exists)
        migration_log.append("🔄 Migrating sync history...")
        try:
            history_file = os.path.join("data", "sync_history.json")
            if os.path.exists(history_file):
                with open(history_file, 'r') as f:
                    history_data = json.load(f)
                
                sync_records = history_data.get('sync_records', {})
                migrated_records = 0
                
                for sku, records in sync_records.items():
                    # Get or create product
                    product = DatabaseService.get_product(sku)
                    if not product:
                        product = DatabaseService.add_product(sku, source='migration')
                    
                    # Add sync records
                    if isinstance(records, list):
                        for record in records:
                            try:
                                DatabaseService.add_sync_record(
                                    product_id=str(product.id),
                                    sync_type=record.get('sync_type', 'unknown'),
                                    status=record.get('status', 'completed'),
                                    sync_data=record,
                                    sync_started_at=datetime.fromisoformat(record.get('timestamp', datetime.utcnow().isoformat()).replace('Z', '+00:00'))
                                )
                                migrated_records += 1
                            except Exception as e:
                                migration_log.append(f"⚠️ Failed to migrate sync record for {sku}: {e}")
                
                migration_log.append(f"✅ Migrated {migrated_records} sync history records")
            else:
                migration_log.append("ℹ️ No existing sync history file found")
        except Exception as e:
            migration_log.append(f"❌ Sync history migration failed: {e}")
        
        # Step 4: Get final statistics
        try:
            stats = DatabaseService.get_sync_stats()
            migration_log.append(f"📊 Final stats: {stats}")
        except Exception as e:
            migration_log.append(f"⚠️ Could not retrieve final stats: {e}")
        
        migration_log.append("🎉 Migration completed successfully!")
        
        return jsonify({
            'success': True,
            'message': 'Migration completed successfully',
            'log': migration_log,
            'stats': stats if 'stats' in locals() else {}
        }), 200
        
    except Exception as e:
        logger.exception("Migration failed")
        return jsonify({
            'success': False,
            'error': str(e),
            'log': migration_log if 'migration_log' in locals() else []
        }), 500

@main.route('/api/migrate/status', methods=['GET'])
def migration_status():
    """Check if migration has been run and database status"""
    try:
        from app.services.database_service import DatabaseService
        
        # Check if tables exist and have data
        stats = DatabaseService.get_sync_stats()
        
        has_products = stats.get('total_products', 0) > 0
        has_sync_records = stats.get('total_syncs', 0) > 0
        
        status = {
            'database_initialized': True,
            'has_products': has_products,
            'has_sync_records': has_sync_records,
            'migration_needed': not (has_products or has_sync_records),
            'stats': stats
        }
        
        return jsonify({
            'success': True,
            'status': status
        }), 200
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e),
            'status': {
                'database_initialized': False,
                'migration_needed': True
            }
        }), 500

@main.route('/api/migrate/reset', methods=['POST'])
def reset_database():
    """
    DANGER: Reset database - only for development
    Requires confirmation parameter
    """
    try:
        data = request.get_json()
        if not data or data.get('confirm') != 'YES_DELETE_ALL_DATA':
            return jsonify({
                'success': False,
                'error': 'Confirmation required. Send {"confirm": "YES_DELETE_ALL_DATA"}'
            }), 400
        
        from app.models import db
        
        # Drop all tables
        db.drop_all()
        migration_log = ["🗑️ All tables dropped"]
        
        # Recreate tables
        db.create_all()
        migration_log.append("🔄 Tables recreated")
        
        migration_log.append("✅ Database reset completed")
        
        return jsonify({
            'success': True,
            'message': 'Database reset completed',
            'log': migration_log
        }), 200
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500