# backend/setup_sync_history.py
"""
Setup script to initialize sync history tracking
Run this once to set up the sync history system
"""

import os
import sys
import logging

# Add the backend directory to the path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.services.sync_history import SyncHistoryService

def setup_sync_history():
    """Initialize sync history system"""
    
    # Set up logging
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(levelname)s - %(message)s'
    )
    logger = logging.getLogger(__name__)
    
    try:
        logger.info("Setting up sync history system...")
        
        # Initialize the sync history service
        sync_service = SyncHistoryService()
        logger.info("Sync history service initialized")
        
        # Try to load known products from CSV
        csv_path = os.path.join("uploads", "Initial_Import.csv")
        
        if os.path.exists(csv_path):
            logger.info(f"Loading known products from {csv_path}")
            products_data = sync_service.load_products_from_csv(csv_path)
            
            if products_data:
                logger.info(f"Found {len(products_data)} products with categories")
                
                # Show some examples
                for i, product in enumerate(products_data[:5]):
                    logger.info(f"  Example {i+1}: SKU={product['sku']}, Name={product['name']}, Category={product['category']}")
                
                # Initialize sync records for all known products
                success = sync_service.bulk_init_skus(products_data)
                
                if success:
                    logger.info("Successfully initialized sync records for all known products")
                    
                    # Get and display statistics
                    stats = sync_service.get_sync_stats()
                    logger.info(f"Sync history stats: {stats}")
                    
                    # Show category breakdown
                    categories = {}
                    for product in products_data:
                        cat = product['category']
                        categories[cat] = categories.get(cat, 0) + 1
                    
                    logger.info("Category breakdown:")
                    for category, count in sorted(categories.items()):
                        logger.info(f"  {category}: {count} products")
                    
                else:
                    logger.error("Failed to initialize sync records")
                    return False
            else:
                logger.warning("No products found in CSV file")
        else:
            logger.warning(f"CSV file not found at {csv_path}")
            logger.info("Creating empty sync history system - products will be added as they are encountered")
        
        logger.info("Sync history setup completed successfully!")
        return True
        
    except Exception as e:
        logger.error(f"Failed to setup sync history: {e}")
        return False

if __name__ == "__main__":
    success = setup_sync_history()
    exit(0 if success else 1)