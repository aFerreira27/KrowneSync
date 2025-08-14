from datetime import datetime
import logging
from typing import List, Dict, Any, Optional
from sqlalchemy import func, and_, or_
from sqlalchemy.exc import IntegrityError
from app.models import db, Product, SyncRecord, Category

logger = logging.getLogger(__name__)

class DatabaseService:
    """Database service for managing products and sync records"""
    
    @staticmethod
    def init_database():
        """Initialize database tables"""
        try:
            db.create_all()
            logger.info("Database tables created successfully")
            
            # Create default categories
            default_categories = [
                'Unsorted', 'Electronics', 'Clothing', 'Books', 
                'Home & Garden', 'Sports', 'Toys', 'Food & Beverage'
            ]
            
            for cat_name in default_categories:
                if not Category.query.filter_by(name=cat_name).first():
                    category = Category(name=cat_name)
                    db.session.add(category)
            
            db.session.commit()
            logger.info("Default categories created")
            
        except Exception as e:
            logger.error(f"Error initializing database: {e}")
            db.session.rollback()
            raise

    @staticmethod
    def add_product(sku: str, name: str = None, category: str = 'Unsorted', 
                   source: str = 'csv', **kwargs) -> Product:
        """Add a new product or update existing one"""
        try:
            # Check if product exists
            product = Product.query.filter_by(sku=sku).first()
            
            if product:
                # Update existing product
                if name:
                    product.name = name
                product.category = category
                product.source = source
                product.updated_at = datetime.utcnow()
                
                # Update additional data
                for key, value in kwargs.items():
                    if hasattr(product, key):
                        setattr(product, key, value)
                
                logger.info(f"Updated existing product: {sku}")
            else:
                # Create new product
                product = Product(
                    sku=sku,
                    name=name,
                    category=category,
                    source=source,
                    **kwargs
                )
                db.session.add(product)
                logger.info(f"Added new product: {sku}")
            
            db.session.commit()
            return product
            
        except IntegrityError as e:
            db.session.rollback()
            logger.error(f"Integrity error adding product {sku}: {e}")
            # Try to get existing product
            return Product.query.filter_by(sku=sku).first()
        except Exception as e:
            db.session.rollback()
            logger.error(f"Error adding product {sku}: {e}")
            raise

    @staticmethod
    def bulk_add_products(products_data: List[Dict]) -> int:
        """Bulk add/update products from CSV or other sources"""
        added_count = 0
        
        try:
            for product_data in products_data:
                sku = product_data.get('sku')
                if not sku:
                    continue
                
                product = DatabaseService.add_product(**product_data)
                if product:
                    added_count += 1
            
            logger.info(f"Bulk added/updated {added_count} products")
            return added_count
            
        except Exception as e:
            logger.error(f"Error in bulk add products: {e}")
            db.session.rollback()
            raise

    @staticmethod
    def get_product(sku: str) -> Optional[Product]:
        """Get product by SKU"""
        return Product.query.filter_by(sku=sku).first()

    @staticmethod
    def get_products(category: str = None, source: str = None, 
                    limit: int = None, offset: int = 0) -> List[Product]:
        """Get products with optional filtering"""
        query = Product.query
        
        if category:
            query = query.filter_by(category=category)
        if source:
            query = query.filter_by(source=source)
        
        query = query.order_by(Product.created_at.desc())
        
        if offset:
            query = query.offset(offset)
        if limit:
            query = query.limit(limit)
        
        return query.all()

    @staticmethod
    def search_products(search_term: str, limit: int = 50) -> List[Product]:
        """Search products by SKU or name"""
        search_pattern = f"%{search_term}%"
        
        return Product.query.filter(
            or_(
                Product.sku.ilike(search_pattern),
                Product.name.ilike(search_pattern)
            )
        ).limit(limit).all()

    @staticmethod
    def add_sync_record(product_id: str, sync_type: str, status: str = 'pending',
                       **kwargs) -> SyncRecord:
        """Add a sync record"""
        try:
            sync_record = SyncRecord(
                product_id=product_id,
                sync_type=sync_type,
                status=status,
                **kwargs
            )
            
            db.session.add(sync_record)
            db.session.commit()
            
            logger.info(f"Added sync record for product {product_id}: {sync_type}")
            return sync_record
            
        except Exception as e:
            db.session.rollback()
            logger.error(f"Error adding sync record: {e}")
            raise

    @staticmethod
    def update_sync_record(record_id: str, status: str, **kwargs) -> SyncRecord:
        """Update sync record status and data"""
        try:
            sync_record = SyncRecord.query.get(record_id)
            if not sync_record:
                raise ValueError(f"Sync record {record_id} not found")
            
            sync_record.status = status
            sync_record.sync_completed_at = datetime.utcnow()
            
            for key, value in kwargs.items():
                if hasattr(sync_record, key):
                    setattr(sync_record, key, value)
            
            db.session.commit()
            return sync_record
            
        except Exception as e:
            db.session.rollback()
            logger.error(f"Error updating sync record {record_id}: {e}")
            raise

    @staticmethod
    def get_sync_history(product_id: str = None, sync_type: str = None,
                        limit: int = 100) -> List[SyncRecord]:
        """Get sync history with optional filtering"""
        query = SyncRecord.query
        
        if product_id:
            query = query.filter_by(product_id=product_id)
        if sync_type:
            query = query.filter_by(sync_type=sync_type)
        
        return query.order_by(SyncRecord.sync_started_at.desc()).limit(limit).all()

    @staticmethod
    def get_sync_stats() -> Dict[str, Any]:
        """Get sync statistics"""
        total_products = Product.query.count()
        total_syncs = SyncRecord.query.count()
        
        # Status counts
        status_counts = db.session.query(
            SyncRecord.status,
            func.count(SyncRecord.id)
        ).group_by(SyncRecord.status).all()
        
        # Category counts
        category_counts = db.session.query(
            Product.category,
            func.count(Product.id)
        ).group_by(Product.category).all()
        
        # Recent sync activity (last 24 hours)
        from datetime import datetime, timedelta
        yesterday = datetime.utcnow() - timedelta(days=1)
        recent_syncs = SyncRecord.query.filter(
            SyncRecord.sync_started_at >= yesterday
        ).count()
        
        return {
            'total_products': total_products,
            'total_syncs': total_syncs,
            'recent_syncs_24h': recent_syncs,
            'status_breakdown': dict(status_counts),
            'category_breakdown': dict(category_counts)
        }