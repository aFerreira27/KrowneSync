# backend/app/services/sync_service.py
# Simple service for SyncStatus only

import logging
from datetime import datetime
from typing import List, Dict, Any, Optional
from app.models import db, SyncStatus

logger = logging.getLogger(__name__)

class SyncService:
    """Simple sync service for manual sync tracking"""
    
    @staticmethod
    def record_manual_sync(sku: str, status: str, name: str = None, 
                          category: str = None, sync_data: Dict = None) -> bool:
        """Record a manual sync operation"""
        try:
            # Get or create sync status record
            sync_status = SyncStatus.query.filter_by(sku=sku).first()
            
            if not sync_status:
                sync_status = SyncStatus(
                    sku=sku,
                    name=name,
                    category=category or 'Unknown',
                    first_sync=datetime.utcnow()
                )
                db.session.add(sync_status)
            else:
                # Update name/category if provided
                if name:
                    sync_status.name = name
                if category:
                    sync_status.category = category
            
            # Update sync statistics
            sync_status.sync_count += 1
            sync_status.last_sync = datetime.utcnow()
            sync_status.status = status
            
            if status == 'success':
                sync_status.success_count += 1
            elif status == 'failed':
                sync_status.failed_count += 1
            
            # Add to sync history
            if not sync_status.sync_history:
                sync_status.sync_history = []
            
            history_entry = {
                'timestamp': datetime.utcnow().isoformat(),
                'status': status,
                'data': sync_data or {}
            }
            
            sync_status.sync_history.append(history_entry)
            sync_status.updated_at = datetime.utcnow()
            
            db.session.commit()
            
            logger.info(f"Recorded manual sync for SKU {sku}: {status}")
            return True
            
        except Exception as e:
            db.session.rollback()
            logger.error(f"Error recording manual sync for SKU {sku}: {e}")
            return False

    @staticmethod
    def get_sync_status(sku: str) -> Optional[SyncStatus]:
        """Get sync status for a SKU"""
        return SyncStatus.query.filter_by(sku=sku).first()

    @staticmethod
    def get_all_sync_statuses() -> List[SyncStatus]:
        """Get all sync statuses"""
        return SyncStatus.query.order_by(SyncStatus.updated_at.desc()).all()

    @staticmethod
    def get_sync_stats() -> Dict[str, Any]:
        """Get sync statistics"""
        total_records = SyncStatus.query.count()
        
        # Status counts
        never_synced = SyncStatus.query.filter_by(status='never').count()
        successful = SyncStatus.query.filter_by(status='success').count()
        failed = SyncStatus.query.filter_by(status='failed').count()
        pending = SyncStatus.query.filter_by(status='pending').count()
        
        return {
            'total_records': total_records,
            'never_synced': never_synced,
            'successful': successful,
            'failed': failed,
            'pending': pending
        }