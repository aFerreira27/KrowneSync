from flask_sqlalchemy import SQLAlchemy
from datetime import datetime, timezone
from sqlalchemy.dialects.postgresql import UUID, JSONB
import uuid

db = SQLAlchemy()

class SyncStatus(db.Model):
    """Simple sync status tracking for manual syncs - like the JSON format"""
    __tablename__ = 'sync_status'
    
    id = db.Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    sku = db.Column(db.String(100), unique=True, nullable=False, index=True)
    
    # Basic product info
    name = db.Column(db.String(500))
    category = db.Column(db.String(100))
    
    # Sync tracking (like JSON format)
    first_sync = db.Column(db.DateTime(timezone=True))
    last_sync = db.Column(db.DateTime(timezone=True))
    sync_count = db.Column(db.Integer, default=0)
    success_count = db.Column(db.Integer, default=0)
    failed_count = db.Column(db.Integer, default=0)
    status = db.Column(db.String(20), default='never')  # never, success, failed, pending
    
    # Store sync history as JSON (like the original)
    sync_history = db.Column(JSONB, default=list)
    
    # Timestamps
    created_at = db.Column(db.DateTime(timezone=True), default=datetime.utcnow)
    updated_at = db.Column(db.DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)
    
    def to_dict(self):
        """Convert to dict format like the original JSON"""
        return {
            'sku': self.sku,
            'name': self.name,
            'category': self.category,
            'first_sync': self.first_sync.isoformat() if self.first_sync else None,
            'last_sync': self.last_sync.isoformat() if self.last_sync else None,
            'sync_count': self.sync_count,
            'success_count': self.success_count,
            'failed_count': self.failed_count,
            'status': self.status,
            'sync_history': self.sync_history or []
        }