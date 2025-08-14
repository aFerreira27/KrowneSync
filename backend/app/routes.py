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
from app.services.sync_service import SyncService
from app.services.format_pimly import format_pimly_data
from app.services.database_service import DatabaseService


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
    """Get sync history (returns array of sync records like original)"""
    if request.method == "OPTIONS":
        return '', 200
    
    try:
        # Get all sync statuses
        sync_statuses = SyncService.get_all_sync_statuses()
        
        # Convert to array format for frontend compatibility
        history_data = []
        for status in sync_statuses:
            sync_record = status.to_dict()
            # Add any additional fields the frontend expects
            history_data.append(sync_record)
        
        return jsonify({
            'success': True,
            'data': history_data,
            'total': len(history_data)
        }), 200
        
    except Exception as e:
        logger.exception("Error getting sync history")
        return jsonify({
            'success': False,
            'error': str(e),
            'data': []
        }), 500

@main.route('/api/sync/record', methods=['POST', 'OPTIONS'])
def record_sync():
    """Record a sync operation (matches your frontend recordSync method)"""
    if request.method == "OPTIONS":
        return '', 200
    
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': 'No JSON data provided'}), 400
        
        sku = data.get('sku')
        status = data.get('status')  # success, failed, pending
        details = data.get('details', {})
        
        if not sku or not status:
            return jsonify({'error': 'SKU and status are required'}), 400
        
        # Extract name and category from details if provided
        name = details.get('name')
        category = details.get('category')
        
        success = SyncService.record_manual_sync(sku, status, name, category, details)
        
        if success:
            return jsonify({
                'success': True,
                'message': f'Sync recorded for SKU {sku}',
                'sku': sku,
                'status': status
            }), 200
        else:
            return jsonify({
                'success': False,
                'error': 'Failed to record sync'
            }), 500
            
    except Exception as e:
        logger.exception("Error recording sync")
        return jsonify({'success': False, 'error': str(e)}), 500

@main.route('/api/sync/stats', methods=['GET', 'OPTIONS'])
def get_sync_stats():
    """Get sync statistics (matches your frontend getSyncStats method)"""
    if request.method == "OPTIONS":
        return '', 200
    
    try:
        stats = SyncService.get_sync_stats()
        
        return jsonify({
            'success': True,
            'stats': stats
        }), 200
        
    except Exception as e:
        logger.exception("Error getting sync stats")
        return jsonify({
            'success': False, 
            'error': str(e),
            'stats': {}
        }), 500

# Optional: Add endpoint to get specific SKU sync status (bonus)
@main.route('/api/sync/status/<sku>', methods=['GET', 'OPTIONS'])
def get_sync_status_for_sku(sku):
    """Get sync status for specific SKU"""
    if request.method == "OPTIONS":
        return '', 200
    
    try:
        sync_status = SyncService.get_sync_status(sku)
        
        if sync_status:
            return jsonify({
                'success': True,
                'data': sync_status.to_dict()
            }), 200
        else:
            return jsonify({
                'success': False,
                'error': f'No sync status found for SKU {sku}',
                'data': None
            }), 404
        
    except Exception as e:
        logger.exception(f"Error getting sync status for SKU {sku}")
        return jsonify({
            'success': False, 
            'error': str(e),
            'data': None
        }), 500
    
@main.route('/api/migrate/run', methods=['POST', 'GET'])
def run_migration():
    """
    HTTP endpoint to run database migration - SyncStatus only
    """
    try:
        from app.services.sync_service import SyncService
        from app.models import db
        import os
        import json
        
        migration_log = []
        
        # Step 1: Initialize database (just SyncStatus table)
        migration_log.append("🔄 Initializing database...")
        try:
            db.create_all()
            migration_log.append("✅ Database tables created successfully")
        except Exception as e:
            migration_log.append(f"❌ Database initialization failed: {e}")
            return jsonify({
                'success': False,
                'error': str(e),
                'log': migration_log
            }), 500
        
        # Step 2: Migrate existing sync history JSON to SyncStatus table
        migration_log.append("🔄 Migrating sync history to SyncStatus table...")
        migrated_count = 0
        
        try:
            history_file = os.path.join("data", "sync_history.json")
            if os.path.exists(history_file):
                with open(history_file, 'r') as f:
                    history_data = json.load(f)
                
                sync_records = history_data.get('sync_records', {})
                
                for sku, record_data in sync_records.items():
                    try:
                        # Extract data from JSON format
                        name = record_data.get('name')
                        category = record_data.get('category', 'Unknown')
                        first_sync = record_data.get('first_sync')
                        last_sync = record_data.get('last_sync')
                        sync_count = record_data.get('sync_count', 0)
                        success_count = record_data.get('success_count', 0)
                        failed_count = record_data.get('failed_count', 0)
                        status = record_data.get('status', 'never')
                        sync_history = record_data.get('sync_history', [])
                        
                        # Create SyncStatus record
                        from app.models import SyncStatus
                        from datetime import datetime
                        
                        sync_status = SyncStatus(
                            sku=sku,
                            name=name,
                            category=category,
                            first_sync=datetime.fromisoformat(first_sync.replace('Z', '+00:00')) if first_sync else None,
                            last_sync=datetime.fromisoformat(last_sync.replace('Z', '+00:00')) if last_sync else None,
                            sync_count=sync_count,
                            success_count=success_count,
                            failed_count=failed_count,
                            status=status,
                            sync_history=sync_history
                        )
                        
                        db.session.add(sync_status)
                        migrated_count += 1
                        
                    except Exception as e:
                        migration_log.append(f"⚠️ Failed to migrate sync record for {sku}: {e}")
                
                db.session.commit()
                migration_log.append(f"✅ Migrated {migrated_count} sync records to SyncStatus table")
            else:
                migration_log.append("ℹ️ No existing sync history file found")
        except Exception as e:
            migration_log.append(f"❌ Sync history migration failed: {e}")
            db.session.rollback()
        
        # Step 3: Initialize any missing SKUs from CSV (if exists)
        migration_log.append("🔄 Checking for SKUs in CSV to initialize...")
        try:
            csv_path = os.path.join(current_app.config.get('UPLOAD_FOLDER', 'uploads'), 'Initial_Import.csv')
            
            if os.path.exists(csv_path):
                # Simple CSV parsing for SKU initialization
                import csv
                initialized_count = 0
                
                with open(csv_path, 'r', encoding='utf-8') as file:
                    reader = csv.reader(file)
                    for row_num, row in enumerate(reader):
                        if row and row[0].strip():
                            sku = row[0].strip()
                            
                            # Check if SKU already exists in SyncStatus
                            existing = SyncService.get_sync_status(sku)
                            if not existing:
                                # Initialize with basic info
                                name = row[1].strip() if len(row) > 1 and row[1].strip() else None
                                category = row[2].strip() if len(row) > 2 and row[2].strip() else 'Unknown'
                                
                                from app.models import SyncStatus
                                sync_status = SyncStatus(
                                    sku=sku,
                                    name=name,
                                    category=category,
                                    sync_count=0,
                                    success_count=0,
                                    failed_count=0,
                                    status='never',
                                    sync_history=[]
                                )
                                
                                db.session.add(sync_status)
                                initialized_count += 1
                
                db.session.commit()
                migration_log.append(f"✅ Initialized {initialized_count} new SKUs from CSV")
            else:
                migration_log.append("ℹ️ No CSV file found for SKU initialization")
        except Exception as e:
            migration_log.append(f"❌ CSV initialization failed: {e}")
            db.session.rollback()
        
        # Step 4: Get final statistics
        try:
            from app.services.database_service import DatabaseService
            stats = DatabaseService.get_sync_stats()
            migration_log.append(f"📊 Final stats: {stats}")
        except Exception as e:
            migration_log.append(f"⚠️ Could not retrieve final stats: {e}")
            stats = {}
        
        migration_log.append("🎉 Migration completed successfully!")
        
        return jsonify({
            'success': True,
            'message': 'Migration completed successfully',
            'log': migration_log,
            'stats': stats
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
        
        has_sync_records = stats.get('total_records', 0) > 0
        
        status = {
            'database_initialized': True,
            'has_sync_records': has_sync_records,
            'migration_needed': not has_sync_records,
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

@main.route('/api/upload-csv', methods=['POST'])
def upload_csv():
    """Upload CSV file and initialize SKUs in SyncStatus table"""
    try:
        if 'file' not in request.files:
            return jsonify({'error': 'No file provided'}), 400
        
        file = request.files['file']
        if file.filename == '':
            return jsonify({'error': 'No file selected'}), 400
        
        if not file.filename.lower().endswith('.csv'):
            return jsonify({'error': 'File must be a CSV'}), 400
        
        # Save file
        filename = secure_filename(file.filename)
        upload_path = os.path.join(current_app.config['UPLOAD_FOLDER'], filename)
        file.save(upload_path)
        
        # Parse CSV and initialize SKUs in SyncStatus table
        import csv
        from app.models import SyncStatus, db
        from app.services.sync_service import SyncService
        
        initialized_count = 0
        updated_count = 0
        
        with open(upload_path, 'r', encoding='utf-8') as csvfile:
            reader = csv.reader(csvfile)
            
            for row_num, row in enumerate(reader):
                if row and row[0].strip():
                    sku = row[0].strip()
                    name = row[1].strip() if len(row) > 1 and row[1].strip() else None
                    category = row[2].strip() if len(row) > 2 and row[2].strip() else 'Unknown'
                    
                    # Check if SKU already exists
                    existing = SyncService.get_sync_status(sku)
                    
                    if existing:
                        # Update existing record
                        if name:
                            existing.name = name
                        existing.category = category
                        existing.updated_at = datetime.utcnow()
                        updated_count += 1
                    else:
                        # Create new record
                        sync_status = SyncStatus(
                            sku=sku,
                            name=name,
                            category=category,
                            sync_count=0,
                            success_count=0,
                            failed_count=0,
                            status='never',
                            sync_history=[]
                        )
                        db.session.add(sync_status)
                        initialized_count += 1
        
        db.session.commit()
        
        return jsonify({
            'success': True,
            'message': f'Successfully processed CSV: {initialized_count} new SKUs initialized, {updated_count} existing SKUs updated',
            'filename': filename,
            'initialized_count': initialized_count,
            'updated_count': updated_count
        }), 200
            
    except Exception as e:
        logger.exception("Error uploading CSV")
        db.session.rollback()
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500