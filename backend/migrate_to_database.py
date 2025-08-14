import os
import sys
import json
import csv
import logging
from datetime import datetime

# Add the backend directory to the path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app import create_app
from app.models import db
from app.services.database_service import DatabaseService
from backend.app.services.sync_service import SyncHistoryService

def migrate_csv_data():
    """Migrate existing CSV data to database"""
    logger = logging.getLogger(__name__)
    
    try:
        # Initialize database
        DatabaseService.init_database()
        
        # Migrate CSV data
        csv_path = os.path.join("uploads", "Initial_Import.csv")
        if os.path.exists(csv_path):
            logger.info(f"Migrating CSV data from {csv_path}")
            
            # Use existing CSV parsing logic
            sync_service = SyncHistoryService()
            products_data = sync_service.load_products_from_csv(csv_path)
            
            if products_data:
                # Bulk add to database
                count = DatabaseService.bulk_add_products(products_data)
                logger.info(f"Migrated {count} products from CSV to database")
            else:
                logger.warning("No products found in CSV file")
        else:
            logger.warning(f"CSV file not found: {csv_path}")
        
        # Migrate existing sync history
        migrate_sync_history()
        
        logger.info("Migration completed successfully!")
        
    except Exception as e:
        logger.error(f"Migration failed: {e}")
        raise

def migrate_sync_history():
    """Migrate existing JSON sync history to database"""
    logger = logging.getLogger(__name__)
    
    try:
        history_file = os.path.join("data", "sync_history.json")
        if os.path.exists(history_file):
            logger.info(f"Migrating sync history from {history_file}")
            
            with open(history_file, 'r') as f:
                history_data = json.load(f)
            
            sync_records = history_data.get('sync_records', {})
            
            for sku, records in sync_records.items():
                # Get or create product
                product = DatabaseService.get_product(sku)
                if not product:
                    product = DatabaseService.add_product(sku, source='migration')
                
                # Add sync records
                for record in records:
                    DatabaseService.add_sync_record(
                        product_id=str(product.id),
                        sync_type=record.get('sync_type', 'unknown'),
                        status=record.get('status', 'completed'),
                        sync_data=record,
                        sync_started_at=datetime.fromisoformat(record.get('timestamp', datetime.utcnow().isoformat()))
                    )
            
            logger.info("Sync history migration completed")
        else:
            logger.info("No existing sync history file found")
            
    except Exception as e:
        logger.error(f"Error migrating sync history: {e}")

if __name__ == "__main__":
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(levelname)s - %(message)s'
    )
    
    app = create_app()
    with app.app_context():
        migrate_csv_data()