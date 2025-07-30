from flask import Blueprint, request, jsonify, current_app
from werkzeug.utils import secure_filename
import os
import asyncio
from app.services.csv_processor import CSVProcessor
from app.services.salesforce_client import SalesforceClient
from app.services.web_scraper import KrowneScraper
from app.services.data_comparator import DataComparator

main = Blueprint('main', __name__)

ALLOWED_EXTENSIONS = {'csv'}

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

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

@main.route('/api/salesforce-sync', methods=['POST'])
def salesforce_sync():
    try:
        data = request.json
        sf_config = {
            'client_id': data.get('client_id'),
            'client_secret': data.get('client_secret'),
            'username': data.get('username'),
            'password': data.get('password'),
            'security_token': data.get('security_token')
        }
        
        client = SalesforceClient(sf_config)
        products = client.get_products()
        
        return jsonify({
            'message': 'Salesforce data retrieved successfully',
            'products_count': len(products),
            'products': products[:5]  # Return first 5 for preview
        })
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@main.route('/api/compare', methods=['POST'])
def compare_products():
    try:
        data = request.json
        source_type = data.get('source_type')  # 'csv' or 'salesforce'
        
        # Get source data
        if source_type == 'csv':
            filename = data.get('filename')
            filepath = os.path.join(current_app.config['UPLOAD_FOLDER'], filename)
            processor = CSVProcessor()
            source_products = processor.process_file(filepath)
        elif source_type == 'salesforce':
            sf_config = data.get('salesforce_config')
            client = SalesforceClient(sf_config)
            source_products = client.get_products()
        else:
            return jsonify({'error': 'Invalid source type'}), 400
        
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