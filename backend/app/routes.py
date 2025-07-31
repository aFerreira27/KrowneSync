from flask import Blueprint, request, jsonify, current_app, session, url_for, redirect
from werkzeug.utils import secure_filename
import os
import asyncio
import secrets
from app.services.csv_processor import CSVProcessor
from app.services.salesforce_client import SalesforceClient
from app.services.web_scraper import KrowneScraper
from app.services.data_comparator import DataComparator

main = Blueprint('main', __name__)

ALLOWED_EXTENSIONS = {'csv'}

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

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

@main.route('/api/health', methods=['GET'])
def health_check():
    return jsonify({'status': 'healthy', 'service': 'KrowneSync'})

@main.route('/api/upload-csv', methods=['POST'])
def upload_csv():
    try:
        if 'file' not in request.files:
            return jsonify({'error': 'No file provided'}), 400
        
        file = request.files['file']
        if file.filename == '':
            return jsonify({'error': 'No file selected'}), 400
        
        if not allowed_file(file.filename):
            return jsonify({'error': 'File type not allowed. Please upload a CSV file'}), 400
        
        filename = secure_filename(file.filename)
        filepath = os.path.join(current_app.config['UPLOAD_FOLDER'], filename)
        file.save(filepath)
        
        # Process CSV
        processor = CSVProcessor()
        products = processor.process_file(filepath)
        
        return jsonify({
            'message': 'File uploaded successfully',
            'filename': filename,
            'products_count': len(products),
            'products': products[:5]  # Return first 5 for preview
        })
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# OAuth Authentication Routes
@main.route('/api/auth/salesforce/login', methods=['POST'])
def initiate_salesforce_auth():
    """Initiate Salesforce OAuth flow"""
    try:
        # Get configuration from request
        config = request.get_json()
        
        # Validate required fields
        required_fields = ['client_id', 'client_secret']
        for field in required_fields:
            if field not in config:
                return jsonify({'error': f'Missing required field: {field}'}), 400
        
        # Add default redirect URI if not provided
        if 'redirect_uri' not in config:
            config['redirect_uri'] = url_for('main.salesforce_callback', _external=True)
        
        # Create Salesforce client
        sf_client = SalesforceClient(config)
        
        # Generate state for CSRF protection
        state = secrets.token_urlsafe(32)
        session['oauth_state'] = state
        session['sf_config'] = {
            'client_id': config['client_id'],
            'client_secret': config['client_secret'],
            'redirect_uri': config['redirect_uri'],
            'sandbox': config.get('sandbox', False)
        }
        
        # Get authorization URL
        auth_url = sf_client.get_authorization_url(state=state)
        
        return jsonify({
            'authorization_url': auth_url,
            'state': state
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@main.route('/api/auth/callback/salesforce')
def salesforce_callback():
    """Handle Salesforce OAuth callback"""
    try:
        # Get parameters from callback
        code = request.args.get('code')
        state = request.args.get('state')
        error = request.args.get('error')
        
        # Handle OAuth errors
        if error:
            error_description = request.args.get('error_description', 'Unknown error')
            return redirect(f"/?error={error}&error_description={error_description}")
        
        # Validate state parameter
        if not state or state != session.get('oauth_state'):
            return redirect("/?error=invalid_state")
        
        # Get stored configuration
        sf_config = session.get('sf_config')
        if not sf_config:
            return redirect("/?error=session_expired")
        
        # Create Salesforce client and exchange code for tokens
        sf_client = SalesforceClient(sf_config)
        token_info = sf_client.exchange_code_for_tokens(code)
        
        # Store tokens in session (in production, use secure storage)
        session['sf_tokens'] = {
            'access_token': token_info['access_token'],
            'refresh_token': token_info.get('refresh_token'),
            'instance_url': token_info['instance_url'],
            'client_config': sf_config
        }
        
        # Clean up temporary session data
        session.pop('oauth_state', None)
        session.pop('sf_config', None)
        
        # Redirect to frontend with success message
        return redirect("/?auth=success")
        
    except Exception as e:
        return redirect(f"/?error=auth_failed&message={str(e)}")

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

@main.route('/api/salesforce-sync', methods=['POST'])
def salesforce_sync():
    """Updated Salesforce sync endpoint using OAuth tokens"""
    try:
        # Check if user is authenticated
        sf_client = get_authenticated_sf_client()
        
        # Get products from Salesforce
        products = sf_client.get_products()
        
        # You can also get price book entries if needed
        request_data = request.get_json() or {}
        if request_data.get('include_pricing'):
            price_entries = sf_client.get_price_book_entries()
            return jsonify({
                'message': 'Salesforce data retrieved successfully',
                'products_count': len(products),
                'products': products[:5],  # Return first 5 for preview
                'price_entries': price_entries,
                'total_products': len(products)
            })
        
        return jsonify({
            'message': 'Salesforce data retrieved successfully',
            'products_count': len(products),
            'products': products[:5],  # Return first 5 for preview
            'total_products': len(products)
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@main.route('/api/compare', methods=['POST'])
def compare_products():
    """Updated compare endpoint to handle OAuth authentication"""
    try:
        data = request.json
        source_type = data.get('source_type')  # 'csv' or 'salesforce'
        
        # Get source data
        if source_type == 'csv':
            filename = data.get('filename')
            if not filename:
                return jsonify({'error': 'Filename required for CSV source'}), 400
            
            filepath = os.path.join(current_app.config['UPLOAD_FOLDER'], filename)
            processor = CSVProcessor()
            source_products = processor.process_file(filepath)
            
        elif source_type == 'salesforce':
            # Use OAuth authenticated client
            sf_client = get_authenticated_sf_client()
            source_products = sf_client.get_products()
            
        else:
            return jsonify({'error': 'Invalid source type. Must be "csv" or "salesforce"'}), 400
        
        # Scrape Krowne.com
        scraper = KrowneScraper()
        krowne_products = scraper.scrape_products()
        
        # Compare data
        comparator = DataComparator()
        comparison_results = comparator.compare(source_products, krowne_products)
        
        return jsonify({
            'message': 'Comparison completed',
            'results': comparison_results,
            'summary': {
                'total_source_products': len(source_products),
                'total_krowne_products': len(krowne_products),
                'matches': len([r for r in comparison_results if r['status'] == 'match']),
                'mismatches': len([r for r in comparison_results if r['status'] == 'mismatch']),
                'missing_from_krowne': len([r for r in comparison_results if r['status'] == 'missing_from_krowne'])
            }
        })
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500

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

# Additional utility endpoints
@main.route('/api/salesforce/products', methods=['GET'])
def get_salesforce_products():
    """Get products from Salesforce with optional filtering"""
    try:
        sf_client = get_authenticated_sf_client()
        
        # Get query parameters
        limit = request.args.get('limit', type=int)
        family = request.args.get('family')
        active_only = request.args.get('active_only', 'true').lower() == 'true'
        
        products = sf_client.get_products()
        
        # Apply filters
        if family:
            products = [p for p in products if p.get('family', '').lower() == family.lower()]
        
        if not active_only:
            # If not filtering by active, we'd need to modify the SOQL query
            pass
        
        if limit:
            products = products[:limit]
        
        return jsonify({
            'products': products,
            'count': len(products)
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@main.route('/api/salesforce/user', methods=['GET'])
def get_salesforce_user():
    """Get current Salesforce user information"""
    try:
        sf_client = get_authenticated_sf_client()
        user_info = sf_client.get_user_info()
        
        return jsonify({
            'user_info': user_info
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500