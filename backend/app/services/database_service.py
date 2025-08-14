import logging
from app.models import db

logger = logging.getLogger(__name__)

class DatabaseService:
    """Simple database service for migration routes only"""
    
    @staticmethod
    def init_database():
        """Initialize database tables (just SyncStatus)"""
        try:
            db.create_all()
            logger.info("Database tables created successfully")
        except Exception as e:
            logger.error(f"Error initializing database: {e}")
            db.session.rollback()
            raise

    @staticmethod
    def get_sync_stats():
        """Get basic sync statistics"""
        try:
            from app.models import SyncStatus
            from sqlalchemy import func
            
            total_records = SyncStatus.query.count()
            
            # Status counts
            status_counts = db.session.query(
                SyncStatus.status,
                func.count(SyncStatus.id)
            ).group_by(SyncStatus.status).all()
            
            return {
                'total_records': total_records,
                'status_breakdown': dict(status_counts)
            }
            
        except Exception as e:
            logger.error(f"Error getting sync stats: {e}")
            return {
                'total_records': 0,
                'status_breakdown': {}
            }
