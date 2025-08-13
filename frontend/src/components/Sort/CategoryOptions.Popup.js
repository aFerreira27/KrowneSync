import React from 'react';
import './CategoryOptionsPopup.css';

const CategoryOptionsPopup = ({ 
  isOpen, 
  onClose, 
  category, 
  formatCategoryName,
  position = { top: 0, left: 0 }
}) => {
  if (!isOpen || !category) return null;

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const handleOptionClick = (action) => {
    // Handle different actions here
    console.log(`${action} clicked for category: ${category}`);
    onClose();
  };

  return (
    <div className="popup-backdrop" onClick={handleBackdropClick}>
      <div 
        className="category-popup" 
        style={{
          top: position.top,
          left: position.left,
        }}
      >
        <div className="popup-header">
          <h3 className="popup-title">{formatCategoryName(category)}</h3>
          <button 
            className="popup-close" 
            onClick={onClose}
            aria-label="Close popup"
          >
            ✕
          </button>
        </div>
        
        <div className="popup-content">
          <div className="popup-actions">
            <button 
              className="popup-action-btn primary"
              onClick={() => handleOptionClick('view')}
            >
              <span className="btn-icon">👀</span>
              <div className="btn-content">
                <span className="btn-title">View Products</span>
                <span className="btn-subtitle">Browse all items in this category</span>
              </div>
            </button>
            
            <button 
              className="popup-action-btn secondary"
              onClick={() => handleOptionClick('export')}
            >
              <span className="btn-icon">📤</span>
              <div className="btn-content">
                <span className="btn-title">Export Category</span>
                <span className="btn-subtitle">Download category data</span>
              </div>
            </button>
            
            <button 
              className="popup-action-btn secondary"
              onClick={() => handleOptionClick('sync')}
            >
              <span className="btn-icon">🔄</span>
              <div className="btn-content">
                <span className="btn-title">Sync Category</span>
                <span className="btn-subtitle">Update from Pimly</span>
              </div>
            </button>
            
            <button 
              className="popup-action-btn secondary"
              onClick={() => handleOptionClick('analytics')}
            >
              <span className="btn-icon">📊</span>
              <div className="btn-content">
                <span className="btn-title">View Analytics</span>
                <span className="btn-subtitle">Category performance data</span>
              </div>
            </button>
            
            <button 
              className="popup-action-btn secondary"
              onClick={() => handleOptionClick('settings')}
            >
              <span className="btn-icon">⚙️</span>
              <div className="btn-content">
                <span className="btn-title">Category Settings</span>
                <span className="btn-subtitle">Configure category options</span>
              </div>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CategoryOptionsPopup;