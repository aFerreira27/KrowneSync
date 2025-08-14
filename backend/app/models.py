from flask_sqlalchemy import SQLAlchemy
from datetime import datetime, timezone
from sqlalchemy.dialects.postgresql import UUID, JSONB
import uuid

db = SQLAlchemy()

class Product(db.Model):
    """Product model for storing known SKUs and product information"""
    __tablename__ = 'products'
    
    id = db.Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    sku = db.Column(db.String(100), unique=True, nullable=False, index=True)
    name = db.Column(db.String(500))
    category = db.Column(db.String(100), default='Unsorted')
    source = db.Column(db.String(50), default='csv')  # csv, pimly, salesforce
    
    # JSON fields for flexible data storage
    pimly_data = db.Column(JSONB)
    krowne_data = db.Column(JSONB)
    salesforce_data = db.Column(JSONB)
    metadata = db.Column(JSONB)
    
    # Timestamps
    created_at = db.Column(db.DateTime(timezone=True), default=datetime.utcnow)
    updated_at = db.Column(db.DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    sync_records = db.relationship('SyncRecord', backref='product', lazy='dynamic', cascade='all, delete-orphan')
    
    def __repr__(self):
        return f'<Product {self.sku}: {self.name}>'
    
    def to_dict(self):
        return {
            'id': str(self.id),
            'sku': self.sku,
            'name': self.name,
            'category': self.category,
            'source': self.source,
            'pimly_data': self.pimly_data,
            'krowne_data': self.krowne_data,
            'salesforce_data': self.salesforce_data,
            'metadata': self.metadata,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }

class SyncRecord(db.Model):
    """Sync history tracking for products"""
    __tablename__ = 'sync_records'
    
    id = db.Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    product_id = db.Column(UUID(as_uuid=True), db.ForeignKey('products.id'), nullable=False, index=True)
    
    # Sync details
    sync_type = db.Column(db.String(50), nullable=False)  # pimly, krowne, salesforce
    status = db.Column(db.String(20), default='pending')  # pending, success, failed, skipped
    direction = db.Column(db.String(20))  # inbound, outbound
    
    # Data tracking
    changes_detected = db.Column(JSONB)
    sync_data = db.Column(JSONB)
    error_message = db.Column(db.Text)
    
    # Timestamps
    sync_started_at = db.Column(db.DateTime(timezone=True), default=datetime.utcnow)
    sync_completed_at = db.Column(db.DateTime(timezone=True))
    
    # User/session tracking
    user_agent = db.Column(db.String(200))
    session_id = db.Column(db.String(100))
    
    def __repr__(self):
        return f'<SyncRecord {self.product.sku if self.product else "Unknown"}: {self.sync_type} - {self.status}>'
    
    def to_dict(self):
        return {
            'id': str(self.id),
            'product_id': str(self.product_id),
            'sku': self.product.sku if self.product else None,
            'sync_type': self.sync_type,
            'status': self.status,
            'direction': self.direction,
            'changes_detected': self.changes_detected,
            'sync_data': self.sync_data,
            'error_message': self.error_message,
            'sync_started_at': self.sync_started_at.isoformat() if self.sync_started_at else None,
            'sync_completed_at': self.sync_completed_at.isoformat() if self.sync_completed_at else None,
            'user_agent': self.user_agent,
            'session_id': self.session_id
        }

class Category(db.Model):
    """Product categories for organization"""
    __tablename__ = 'categories'
    
    id = db.Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = db.Column(db.String(100), unique=True, nullable=False)
    description = db.Column(db.Text)
    parent_id = db.Column(UUID(as_uuid=True), db.ForeignKey('categories.id'))
    
    # Hierarchy support
    children = db.relationship('Category', backref=db.backref('parent', remote_side=[id]))
    
    # Timestamps
    created_at = db.Column(db.DateTime(timezone=True), default=datetime.utcnow)
    updated_at = db.Column(db.DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)
    
    def __repr__(self):
        return f'<Category {self.name}>'