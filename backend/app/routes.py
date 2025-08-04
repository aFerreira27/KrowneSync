import os
import asyncio
import secrets
import logging

from flask import Blueprint, request, jsonify, current_app, session, url_for, redirect
from werkzeug.utils import secure_filename
from datetime import datetime

from app.services.salesforce_client import SalesforceClient
from app.services.krowne_scraper import KrowneScraper

main = Blueprint('main', __name__)

# Configure logging
logger = logging.getLogger(__name__)

# SalesforceAuth routes
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

@main.route('/api/auth/salesforce/initiate', methods=['POST'])
def initiate_salesforce_auth():
    """Initiate Salesforce OAuth flow with PKCE using app configuration"""
    try:
        # Get configuration from Flask app config (loaded from environment variables)
        client_id = current_app.config.get('SALESFORCE_CLIENT_ID')
        client_secret = current_app.config.get('SALESFORCE_CLIENT_SECRET')
        redirect_uri = current_app.config.get('SALESFORCE_REDIRECT_URI')
        sandbox = current_app.config.get('SALESFORCE_SANDBOX', False)
        
        # Validate required configuration
        if not client_id:
            return jsonify({'error': 'SALESFORCE_CLIENT_ID not configured in environment'}), 500
        if not client_secret:
            return jsonify({'error': 'SALESFORCE_CLIENT_SECRET not configured in environment'}), 500
        if not redirect_uri:
            return jsonify({'error': 'SALESFORCE_REDIRECT_URI not configured in environment'}), 500
        
        config = {
            'client_id': client_id,
            'client_secret': client_secret,
            'redirect_uri': redirect_uri,
            'sandbox': sandbox
        }
        
        # Create Salesforce client
        sf_client = SalesforceClient(config)
        
        # Get authorization URL with PKCE
        auth_data = sf_client.get_authorization_url()
        
        # Store PKCE code verifier and state in session for callback
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

@main.route('/api/salesforce/config', methods=['GET'])
def get_salesforce_config():
    """Get Salesforce configuration (non-sensitive data only)"""
    try:
        return jsonify({
            'configured': bool(current_app.config.get('SALESFORCE_CLIENT_ID') and current_app.config.get('SALESFORCE_CLIENT_SECRET')),
            'client_id_configured': bool(current_app.config.get('SALESFORCE_CLIENT_ID')),
            'client_secret_configured': bool(current_app.config.get('SALESFORCE_CLIENT_SECRET')),
            'redirect_uri': current_app.config.get('SALESFORCE_REDIRECT_URI'),
            'sandbox': current_app.config.get('SALESFORCE_SANDBOX', False)
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@main.route('/api/auth/callback/salesforce')
def salesforce_callback():
    """Handle Salesforce OAuth callback with PKCE - Fixed redirects"""
    try:
        logger.info("=== SALESFORCE OAUTH CALLBACK STARTED ===")
        logger.info(f"Request URL: {request.url}")
        logger.info(f"Request args: {dict(request.args)}")
        
        # Get parameters from callback
        code = request.args.get('code')
        state = request.args.get('state')
        error = request.args.get('error')
        
        logger.info(f"Callback parameters:")
        logger.info(f"  - Code present: {'✅' if code else '❌'}")
        logger.info(f"  - State present: {'✅' if state else '❌'}")
        logger.info(f"  - Error: {error or 'None'}")
        
        # Handle OAuth errors from Salesforce
        if error:
            error_description = request.args.get('error_description', 'Unknown error')
            logger.error(f"OAuth error from Salesforce: {error} - {error_description}")
            # REDIRECT TO REACT APP PORT 3000
            return redirect(f"http://localhost:3000/?error={error}&error_description={error_description}")
        
        # Validate we have a code
        if not code:
            logger.error("❌ No authorization code received from Salesforce")
            # REDIRECT TO REACT APP PORT 3000
            return redirect("http://localhost:3000/?error=no_code&message=No authorization code received")
        
        # Check session data
        session_state = session.get('oauth_state')
        code_verifier = session.get('code_verifier')
        sf_config = session.get('sf_config')
        
        logger.info(f"Session data check:")
        logger.info(f"  - oauth_state in session: {'✅' if session_state else '❌'}")
        logger.info(f"  - code_verifier in session: {'✅' if code_verifier else '❌'}")
        logger.info(f"  - sf_config in session: {'✅' if sf_config else '❌'}")
        
        # Validate state parameter
        if not state or state != session_state:
            logger.error(f"❌ State mismatch - Received: {state}, Expected: {session_state}")
            # REDIRECT TO REACT APP PORT 3000
            return redirect("http://localhost:3000/?error=invalid_state&message=State parameter mismatch")
        
        if not sf_config:
            logger.error("❌ Salesforce config not found in session")
            # REDIRECT TO REACT APP PORT 3000
            return redirect("http://localhost:3000/?error=session_expired&message=OAuth session expired")
        
        if not code_verifier:
            logger.error("❌ PKCE code verifier not found in session")
            # REDIRECT TO REACT APP PORT 3000
            return redirect("http://localhost:3000/?error=pkce_error&message=Code verifier not found in session")
        
        # Create Salesforce client and exchange code for tokens
        logger.info("🔄 Creating Salesforce client for token exchange...")
        try:
            sf_client = SalesforceClient(sf_config)
            logger.info("✅ Salesforce client created successfully")
        except Exception as client_error:
            logger.error(f"❌ Failed to create Salesforce client: {str(client_error)}")
            # REDIRECT TO REACT APP PORT 3000
            return redirect(f"http://localhost:3000/?error=client_creation_failed&message={str(client_error)}")
        
        try:
            logger.info("🔄 Attempting token exchange...")
            token_info = sf_client.exchange_code_for_tokens(code, code_verifier)
            logger.info("✅ Token exchange successful!")
            
            # Validate token response
            if not token_info.get('access_token'):
                logger.error("❌ No access token in response")
                raise Exception("No access token received from Salesforce")
            
            if not token_info.get('instance_url'):
                logger.error("❌ No instance URL in response")
                raise Exception("No instance URL received from Salesforce")
                
        except Exception as token_error:
            logger.error(f"❌ Token exchange failed: {str(token_error)}", exc_info=True)
            # REDIRECT TO REACT APP PORT 3000
            return redirect(f"http://localhost:3000/?error=token_exchange_failed&message={str(token_error)}")
        
        # Store tokens in session
        logger.info("🔄 Storing tokens in session...")
        session['sf_tokens'] = {
            'access_token': token_info['access_token'],
            'refresh_token': token_info.get('refresh_token'),
            'instance_url': token_info['instance_url'],
            'client_config': sf_config
        }
        
        # Test the tokens by getting user info
        try:
            logger.info("🔄 Testing tokens by fetching user info...")
            sf_client.set_tokens(
                token_info['access_token'],
                token_info.get('refresh_token'),
                token_info['instance_url']
            )
            user_info = sf_client.get_user_info()
            logger.info(f"✅ User info retrieved: {user_info.get('display_name', 'Unknown user')}")
            
        except Exception as user_error:
            logger.warning(f"⚠️ Token test failed but tokens stored: {str(user_error)}")
            # Continue anyway - tokens might still work for other operations
        
        # Clean up temporary session data
        logger.info("🔄 Cleaning up temporary session data...")
        session.pop('oauth_state', None)
        session.pop('code_verifier', None)
        session.pop('sf_config', None)
        
        # Force session save
        session.modified = True
        logger.info("✅ Session updated successfully")
        
        logger.info("=== SALESFORCE OAUTH CALLBACK COMPLETED SUCCESSFULLY ===")
        
        # REDIRECT TO REACT APP PORT 3000 WITH SUCCESS
        return redirect("http://localhost:3000/?auth=success")
        
    except Exception as e:
        logger.error(f"💥 UNEXPECTED ERROR in OAuth callback: {str(e)}", exc_info=True)
        
        # Clean up session on error
        session.pop('oauth_state', None)
        session.pop('code_verifier', None)
        session.pop('sf_config', None)
        session.modified = True
        
        # REDIRECT TO REACT APP PORT 3000 WITH ERROR
        return redirect(f"http://localhost:3000/?error=auth_failed&message={str(e)}")

@main.route('/api/salesforce/status')
def salesforce_auth_status():
    """Check Salesforce authentication status"""
    try:
        sf_tokens = session.get('sf_tokens')
        
        if not sf_tokens:
            return jsonify({'authenticated': False})
        
        # Create client with stored tokens
        config = sf_tokens['client_config']
        sf_client = SalesforceClient(config)
        sf_client.set_tokens(
            sf_tokens['access_token'],
            sf_tokens['refresh_token'],
            sf_tokens['instance_url']
        )
        
        # Test authentication by getting user info
        try:
            user_info = sf_client.get_user_info()
            return jsonify({
                'authenticated': True,
                'user_info': user_info,
                'instance_url': sf_tokens['instance_url']
            })
        except Exception:
            # Token might be expired, try refresh
            if sf_client.refresh_access_token():
                # Update stored tokens
                session['sf_tokens']['access_token'] = sf_client.access_token
                user_info = sf_client.get_user_info()
                return jsonify({
                    'authenticated': True,
                    'user_info': user_info,
                    'instance_url': sf_client.instance_url
                })
            else:
                # Refresh failed, clear session
                session.pop('sf_tokens', None)
                return jsonify({'authenticated': False})
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@main.route('/api/salesforce/user', methods=['GET'])
def get_salesforce_user():
    """Get current Salesforce user information"""
    try:
        sf_client = get_authenticated_sf_client()
        user_info = sf_client.get_user_info()
        
        return jsonify(user_info)
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@main.route('/api/salesforce/logout', methods=['POST'])
def salesforce_logout():
    """Logout from Salesforce (revoke tokens)"""
    try:
        sf_tokens = session.get('sf_tokens')
        
        if sf_tokens:
            # Create client and revoke tokens
            config = sf_tokens['client_config']
            sf_client = SalesforceClient(config)
            sf_client.set_tokens(
                sf_tokens['access_token'],
                sf_tokens['refresh_token'],
                sf_tokens['instance_url']
            )
            
            # Revoke tokens
            sf_client.revoke_token()
        
        # Clear session
        session.pop('sf_tokens', None)
        
        return jsonify({'success': True, 'message': 'Logged out successfully'})
        
    except Exception as e:
        # Clear session even if revoke fails
        session.pop('sf_tokens', None)
        return jsonify({'success': True, 'message': 'Logged out (with errors)'})

# Export Results route
@main.route('/api/export-results', methods=['POST'])
def export_results():
    try:
        data = request.json
        results = data.get('results', [])
        
        # Create CSV export
        import csv
        import io
        
        output = io.StringIO()
        fieldnames = ['product_id', 'name', 'status', 'differences', 'krowne_url']
        writer = csv.DictWriter(output, fieldnames=fieldnames)
        
        writer.writeheader()
        for result in results:
            writer.writerow({
                'product_id': result.get('product_id', ''),
                'name': result.get('name', ''),
                'status': result.get('status', ''),
                'differences': ', '.join(result.get('differences', [])),
                'krowne_url': result.get('krowne_url', '')
            })
        
        return jsonify({
            'csv_data': output.getvalue(),
            'filename': 'krowne_sync_results.csv'
        })
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# Error handlers for better error reporting
@main.errorhandler(ValueError)
def handle_validation_error(e):
    """Handle CSV validation errors"""
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


# Testing and debugging endpoint
@main.route('/api/test-proxy', methods=['GET'])
def test_proxy():
    """Test endpoint to verify proxy is working"""
    logger.info(f"Test proxy endpoint called from: {request.remote_addr}")
    logger.info(f"Request headers: {dict(request.headers)}")
    return jsonify({
        'message': 'Proxy is working!',
        'timestamp': datetime.now().isoformat(),
        'remote_addr': request.remote_addr,
        'user_agent': str(request.user_agent)
    })

@main.route('/api/health', methods=['GET'])
def health_check():
    return jsonify({
        'status': 'healthy', 
        'service': 'KrowneSync',
        'salesforce_configured': bool(current_app.config.get('SALESFORCE_CLIENT_ID')),
        'csv_processor': 'enhanced'
    })