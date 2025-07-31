from flask import Blueprint, request, jsonify, current_app, session, url_for, redirect
from werkzeug.utils import secure_filename
import os
import asyncio
import secrets
import logging
from app.services.csv_processor import CSVProcessor  # Your enhanced processor
from app.services.salesforce_client import SalesforceClient
from app.services.web_scraper import KrowneScraper
from app.services.data_comparator import DataComparator

main = Blueprint('main', __name__)

# Configure logging
logger = logging.getLogger(__name__)

ALLOWED_EXTENSIONS = {'csv'}

# Configuration templates for different CSV processing use cases
CSV_PROCESSOR_CONFIGS = {
    'default': {
        'required_columns': ['SKU', 'Family', 'Product_Description', 'List_Price'],
        'validate_data': True,
        'allow_negative_prices': False,
        'max_reasonable_price': 100000
    },
    'strict': {
        'required_columns': ['SKU', 'Family', 'Product_Description', 'List_Price'],
        'validate_data': True,
        'allow_negative_prices': False,
        'max_reasonable_price': 50000,
        'array_columns': [
            'Images', 'Features', 'Related_Products',
            'Parts_&_Accessories', 'Beverage_Lines'
        ]
    },
    'performance': {
        'required_columns': ['SKU', 'Product_Description', 'List_Price'],
        'chunk_size': 5000,
        'validate_data': False,  # Skip for large files
        'allow_negative_prices': True
    }
}

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def get_processor_config(config_type='default'):
    """Get CSV processor configuration"""
    return CSV_PROCESSOR_CONFIGS.get(config_type, CSV_PROCESSOR_CONFIGS['default'])

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
    return jsonify({
        'status': 'healthy', 
        'service': 'KrowneSync',
        'salesforce_configured': bool(current_app.config.get('SALESFORCE_CLIENT_ID')),
        'csv_processor': 'enhanced'
    })

@main.route('/api/upload-csv', methods=['POST'])
def upload_csv():
    """Enhanced CSV upload with progress tracking and validation options"""
    try:
        # Add detailed logging
        logger.info("CSV upload request received")
        
        if 'file' not in request.files:
            logger.error("No file in request")
            return jsonify({'error': 'No file provided'}), 400
        
        file = request.files['file']
        if file.filename == '':
            logger.error("Empty filename")
            return jsonify({'error': 'No file selected'}), 400
        
        if not allowed_file(file.filename):
            logger.error(f"Invalid file type: {file.filename}")
            return jsonify({'error': 'File type not allowed. Please upload a CSV file'}), 400
        
        # Get processing options from request
        validation_level = request.form.get('validation_level', 'default')
        include_stats = request.form.get('include_stats', 'true').lower() == 'true'
        
        # Ensure upload folder exists
        os.makedirs(current_app.config['UPLOAD_FOLDER'], exist_ok=True)
        
        filename = secure_filename(file.filename)
        filepath = os.path.join(current_app.config['UPLOAD_FOLDER'], filename)
        
        # Save file with error handling
        try:
            file.save(filepath)
            logger.info(f"File saved: {filepath}")
        except Exception as e:
            logger.error(f"Failed to save file: {str(e)}")
            return jsonify({'error': f'Failed to save file: {str(e)}'}), 500
        
        # Get appropriate configuration
        config = get_processor_config(validation_level)
        
        # Process CSV with progress tracking
        processor = CSVProcessor(config)
        
        # Store progress in session for real-time updates
        progress_data = {'current': 0, 'message': 'Starting...', 'completed': False}
        session[f'upload_progress_{filename}'] = progress_data
        
        def progress_callback(message, percentage):
            progress_data['current'] = percentage
            progress_data['message'] = message
            session[f'upload_progress_{filename}'] = progress_data
            session.modified = True
        
        # Process the file with error handling
        try:
            products = processor.process_file(filepath, progress_callback)
            logger.info(f"Successfully processed {len(products)} products")
        except FileNotFoundError as e:
            logger.error(f"File not found: {str(e)}")
            # Clean up the file
            if os.path.exists(filepath):
                os.remove(filepath)
            return jsonify({'error': 'Uploaded file not found'}), 404
        except ValueError as e:
            logger.error(f"Validation error: {str(e)}")
            # Clean up the file
            if os.path.exists(filepath):
                os.remove(filepath)
            return jsonify({
                'error': f'Data validation error: {str(e)}',
                'type': 'validation_error',
                'suggestions': [
                    'Check that your CSV has the required columns: SKU, Family, Product_Description, List_Price',
                    'Ensure numeric fields contain valid numbers',
                    'Try using a less strict validation level'
                ]
            }), 400
        except Exception as e:
            logger.error(f"Processing error: {str(e)}", exc_info=True)
            # Clean up the file
            if os.path.exists(filepath):
                os.remove(filepath)
            return jsonify({
                'error': f'Processing failed: {str(e)}',
                'type': 'processing_error'
            }), 500
        
        # Mark as completed
        progress_data['completed'] = True
        progress_data['current'] = 100
        progress_data['message'] = 'Processing complete'
        session[f'upload_progress_{filename}'] = progress_data
        session.modified = True
        
        # Prepare response
        response_data = {
            'message': 'File uploaded and processed successfully',
            'filename': filename,
            'products_count': len(products),
            'products': products[:5] if products else [],  # Return first 5 for preview
            'validation_level': validation_level
        }
        
        # Add statistics if requested
        if include_stats and products:
            try:
                stats = processor.get_processing_stats(products)
                response_data['statistics'] = stats
            except Exception as e:
                logger.warning(f"Failed to generate statistics: {str(e)}")
                response_data['statistics'] = {'error': 'Failed to generate statistics'}
        
        # Clean up the uploaded file after processing (optional)
        # os.remove(filepath)
        
        return jsonify(response_data)
        
    except Exception as e:
        logger.error(f"Unexpected error in upload endpoint: {str(e)}", exc_info=True)
        return jsonify({
            'error': f'Unexpected error: {str(e)}',
            'type': 'server_error'
        }), 500

@main.route('/api/upload-progress/<filename>', methods=['GET'])
def get_upload_progress(filename):
    """Get real-time upload/processing progress"""
    try:
        progress_data = session.get(f'upload_progress_{filename}')
        
        if not progress_data:
            return jsonify({'error': 'No progress data found'}), 404
        
        return jsonify(progress_data)
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@main.route('/api/csv-config', methods=['GET'])
def get_csv_config_options():
    """Get available CSV processing configuration options"""
    try:
        # Create a temporary processor to get column info
        temp_processor = CSVProcessor(get_processor_config('default'))
        
        return jsonify({
            'validation_levels': {
                'default': {
                    'name': 'Standard Validation',
                    'description': 'Basic validation with standard business rules',
                    'config': CSV_PROCESSOR_CONFIGS['default']
                },
                'strict': {
                    'name': 'Strict Validation',
                    'description': 'Enhanced validation with stricter business rules',
                    'config': CSV_PROCESSOR_CONFIGS['strict']
                },
                'performance': {
                    'name': 'High Performance',
                    'description': 'Optimized for large files with minimal validation',
                    'config': CSV_PROCESSOR_CONFIGS['performance']
                }
            },
            'supported_columns': temp_processor.all_columns,
            'required_columns': temp_processor.required_columns
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@main.route('/api/validate-csv', methods=['POST'])
def validate_csv_structure():
    """Validate CSV structure without full processing"""
    try:
        if 'file' not in request.files:
            return jsonify({'error': 'No file provided'}), 400
        
        file = request.files['file']
        if not allowed_file(file.filename):
            return jsonify({'error': 'File type not allowed'}), 400
        
        filename = secure_filename(file.filename)
        filepath = os.path.join(current_app.config['UPLOAD_FOLDER'], filename)
        file.save(filepath)
        
        # Quick validation without full processing
        processor = CSVProcessor(get_processor_config('default'))
        
        try:
            # Just read and validate columns
            df = processor._read_csv_safe(filepath)
            df = processor._validate_columns(df)
            
            # Basic info
            validation_result = {
                'valid': True,
                'filename': filename,
                'total_rows': len(df),
                'columns_found': list(df.columns),
                'missing_required': [],
                'extra_columns': list(set(df.columns) - set(processor.all_columns)),
                'sample_data': df.head(3).to_dict('records') if not df.empty else []
            }
            
            # Clean up temp file
            os.remove(filepath)
            
            return jsonify(validation_result)
            
        except ValueError as e:
            # Clean up temp file
            if os.path.exists(filepath):
                os.remove(filepath)
            
            return jsonify({
                'valid': False,
                'filename': filename,
                'error': str(e),
                'suggestions': [
                    'Ensure CSV has proper headers',
                    'Check required columns are present',
                    'Verify file encoding (UTF-8 recommended)'
                ]
            })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@main.route('/api/csv-stats/<filename>', methods=['GET'])
def get_csv_statistics(filename):
    """Get detailed statistics for a processed CSV file"""
    try:
        filepath = os.path.join(current_app.config['UPLOAD_FOLDER'], filename)
        
        if not os.path.exists(filepath):
            return jsonify({'error': 'File not found'}), 404
        
        # Quick processing to get stats
        processor = CSVProcessor(get_processor_config('default'))
        products = processor.process_file(filepath)
        stats = processor.get_processing_stats(products)
        
        return jsonify({
            'filename': filename,
            'statistics': stats,
            'file_info': {
                'size_bytes': os.path.getsize(filepath),
                'last_modified': os.path.getmtime(filepath)
            }
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# OAuth Authentication Routes with PKCE (unchanged from your original)
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
    """Handle Salesforce OAuth callback with PKCE"""
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
            return redirect("/?error=invalid_state&message=State parameter mismatch")
        
        # Get stored configuration and PKCE verifier
        sf_config = session.get('sf_config')
        code_verifier = session.get('code_verifier')
        
        if not sf_config:
            return redirect("/?error=session_expired&message=OAuth session expired")
        
        if not code_verifier:
            return redirect("/?error=pkce_error&message=Code verifier not found in session")
        
        # Create Salesforce client and exchange code for tokens with PKCE
        sf_client = SalesforceClient(sf_config)
        token_info = sf_client.exchange_code_for_tokens(code, code_verifier)
        
        # Store tokens in session (in production, use secure storage)
        session['sf_tokens'] = {
            'access_token': token_info['access_token'],
            'refresh_token': token_info.get('refresh_token'),
            'instance_url': token_info['instance_url'],
            'client_config': sf_config
        }
        
        # Clean up temporary session data
        session.pop('oauth_state', None)
        session.pop('code_verifier', None)
        session.pop('sf_config', None)
        
        # Redirect to frontend with success message
        return redirect("/?auth=success")
        
    except Exception as e:
        # Clean up session on error
        session.pop('oauth_state', None)
        session.pop('code_verifier', None)
        session.pop('sf_config', None)
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
    """Enhanced compare endpoint with better CSV processing and progress tracking"""
    try:
        data = request.json
        source_type = data.get('source_type')  # 'csv' or 'salesforce'
        validation_level = data.get('validation_level', 'default')
        
        # Get source data with enhanced processing
        if source_type == 'csv':
            filename = data.get('filename')
            if not filename:
                return jsonify({'error': 'Filename required for CSV source'}), 400
            
            filepath = os.path.join(current_app.config['UPLOAD_FOLDER'], filename)
            
            # Use enhanced processor with appropriate config
            config = get_processor_config(validation_level)
            processor = CSVProcessor(config)
            
            # Track comparison progress
            progress_data = {'current': 0, 'message': 'Processing CSV...', 'completed': False}
            session[f'compare_progress_{filename}'] = progress_data
            
            def csv_progress_callback(message, percentage):
                progress_data['current'] = percentage * 0.3  # CSV processing is 30% of total
                progress_data['message'] = f"CSV Processing: {message}"
                session[f'compare_progress_{filename}'] = progress_data
                session.modified = True
            
            source_products = processor.process_file(filepath, csv_progress_callback)
            
        elif source_type == 'salesforce':
            # Use OAuth authenticated client
            sf_client = get_authenticated_sf_client()
            
            progress_data = {'current': 30, 'message': 'Fetching Salesforce data...', 'completed': False}
            session[f'compare_progress_sf'] = progress_data
            session.modified = True
            
            source_products = sf_client.get_products()
            
        else:
            return jsonify({'error': 'Invalid source type. Must be "csv" or "salesforce"'}), 400
        
        # Update progress
        progress_key = f'compare_progress_{filename}' if source_type == 'csv' else 'compare_progress_sf'
        progress_data = session.get(progress_key, {})
        progress_data.update({'current': 60, 'message': 'Scraping Krowne.com...'})
        session[progress_key] = progress_data
        session.modified = True
        
        # Scrape Krowne.com
        scraper = KrowneScraper()
        krowne_products = scraper.scrape_products()
        
        # Update progress
        progress_data.update({'current': 80, 'message': 'Comparing data...'})
        session[progress_key] = progress_data
        session.modified = True
        
        # Compare data
        comparator = DataComparator()
        comparison_results = comparator.compare(source_products, krowne_products)
        
        # Complete progress
        progress_data.update({'current': 100, 'message': 'Comparison complete', 'completed': True})
        session[progress_key] = progress_data
        session.modified = True
        
        # Enhanced summary with statistics
        summary = {
            'total_source_products': len(source_products),
            'total_krowne_products': len(krowne_products),
            'matches': len([r for r in comparison_results if r['status'] == 'match']),
            'mismatches': len([r for r in comparison_results if r['status'] == 'mismatch']),
            'missing_from_krowne': len([r for r in comparison_results if r['status'] == 'missing_from_krowne']),
            'validation_level': validation_level,
            'source_type': source_type
        }
        
        # Add match percentage
        if summary['total_source_products'] > 0:
            summary['match_percentage'] = (summary['matches'] / summary['total_source_products']) * 100
        
        return jsonify({
            'message': 'Comparison completed successfully',
            'results': comparison_results,
            'summary': summary,
            'processing_info': {
                'source_validated': True,
                'validation_level': validation_level,
                'processing_time': 'Available in logs'
            }
        })
        
    except Exception as e:
        logger.error(f"Comparison error: {str(e)}")
        return jsonify({'error': str(e)}), 500

@main.route('/api/compare-progress/<identifier>', methods=['GET'])
def get_compare_progress(identifier):
    """Get real-time comparison progress"""
    try:
        # Try different progress keys
        progress_keys = [
            f'compare_progress_{identifier}',
            'compare_progress_sf'
        ]
        
        progress_data = None
        for key in progress_keys:
            progress_data = session.get(key)
            if progress_data:
                break
        
        if not progress_data:
            return jsonify({'error': 'No progress data found'}), 404
        
        return jsonify(progress_data)
        
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
        
        return jsonify(user_info)
        
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

@main.errorhandler(FileNotFoundError)
def handle_file_not_found(e):
    """Handle file not found errors"""
    logger.error(f"File not found: {str(e)}")
    return jsonify({
        'error': 'File not found',
        'details': str(e)
    }), 404