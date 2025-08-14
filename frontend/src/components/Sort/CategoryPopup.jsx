import React, { useState, useEffect } from 'react';
import './CategoryPopup.css';

function CategoryPopup({ 
  category, 
  isOpen, 
  onClose, 
  formatCategoryName, 
  getCategoryIcon,
  categoryStats,
  onViewProducts,
  onExportCategory,
  onSyncCategory 
}) {
  const [loading, setLoading] = useState(false);

  if (!isOpen || !category) return null;

  const stats = categoryStats || {
    total: 0,
    recent: 0,
    old: 0,
    never: 0,
    syncing: 0,
    products: []
  };

  const calculatePercentage = (value, total) => {
    return total > 0 ? Math.round((value / total) * 100) : 0;
  };

  const getStatusColor = (status) => {
    const colors = {
      recent: '#10b981', // green
      old: '#f59e0b',    // amber
      never: '#ef4444',  // red
      syncing: '#3b82f6' // blue
    };
    return colors[status] || '#6b7280';
  };

  const getHealthScore = () => {
    if (stats.total === 0) return 0;
    const healthyProducts = stats.recent;
    return Math.round((healthyProducts / stats.total) * 100);
  };

  const getHealthStatus = () => {
    const score = getHealthScore();
    if (score >= 80) return { label: 'Excellent', color: '#10b981', icon: '🎉' };
    if (score >= 60) return { label: 'Good', color: '#059669', icon: '✅' };
    if (score >= 40) return { label: 'Fair', color: '#f59e0b', icon: '⚠️' };
    return { label: 'Needs Attention', color: '#ef4444', icon: '❌' };
  };

  const healthStatus = getHealthStatus();

  return (
    <div className="popup-overlay" onClick={onClose}>
      <div className="category-popup" onClick={(e) => e.stopPropagation()}>
        <div className="popup-header">
          <div className="popup-header-content">
            <div className="popup-icon">
              {getCategoryIcon(category)}
            </div>
            <div className="popup-title">
              <h2>{formatCategoryName(category)}</h2>
              <p>Category Sync Overview</p>
            </div>
          </div>
          <button className="popup-close" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="popup-content">
          {loading ? (
            <div className="loading-state">
              <div className="loading-spinner"></div>
              <p>Loading sync statistics...</p>
            </div>
          ) : (
            <>
              <div className="sync-overview">
                <h3>Sync Status Overview</h3>
                <div className="stats-grid">
                  <div className="stat-card total">
                    <div className="stat-icon">📦</div>
                    <div className="stat-info">
                      <span className="stat-number">{stats.total}</span>
                      <span className="stat-label">Total Products</span>
                    </div>
                  </div>
                  
                  <div className="stat-card recent">
                    <div className="stat-icon">✅</div>
                    <div className="stat-info">
                      <span className="stat-number">{stats.recent}</span>
                      <span className="stat-label">Recently Synced</span>
                      <span className="stat-percentage">
                        {calculatePercentage(stats.recent, stats.total)}%
                      </span>
                    </div>
                  </div>
                  
                  <div className="stat-card old">
                    <div className="stat-icon">⚠️</div>
                    <div className="stat-info">
                      <span className="stat-number">{stats.old}</span>
                      <span className="stat-label">Needs Sync</span>
                      <span className="stat-percentage">
                        {calculatePercentage(stats.old, stats.total)}%
                      </span>
                    </div>
                  </div>
                  
                  <div className="stat-card never">
                    <div className="stat-icon">❌</div>
                    <div className="stat-info">
                      <span className="stat-number">{stats.never}</span>
                      <span className="stat-label">Never Synced</span>
                      <span className="stat-percentage">
                        {calculatePercentage(stats.never, stats.total)}%
                      </span>
                    </div>
                  </div>

                  {stats.syncing > 0 && (
                    <div className="stat-card syncing">
                      <div className="stat-icon">🔄</div>
                      <div className="stat-info">
                        <span className="stat-number">{stats.syncing}</span>
                        <span className="stat-label">Currently Syncing</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="health-summary">
                <div className="health-header">
                  <h4>Category Health: {getHealthScore()}%</h4>
                  <div className="health-badge" style={{ color: healthStatus.color }}>
                    <span className="health-icon">{healthStatus.icon}</span>
                    <span className="health-label">{healthStatus.label}</span>
                  </div>
                </div>
                <div className="sync-progress-bar">
                  <div className="progress-track">
                    <div 
                      className="progress-fill recent" 
                      style={{ 
                        width: `${calculatePercentage(stats.recent, stats.total)}%`,
                        backgroundColor: getStatusColor('recent')
                      }}
                    ></div>
                    <div 
                      className="progress-fill old" 
                      style={{ 
                        width: `${calculatePercentage(stats.old, stats.total)}%`,
                        backgroundColor: getStatusColor('old')
                      }}
                    ></div>
                    <div 
                      className="progress-fill never" 
                      style={{ 
                        width: `${calculatePercentage(stats.never, stats.total)}%`,
                        backgroundColor: getStatusColor('never')
                      }}
                    ></div>
                  </div>
                </div>
              </div>

              <div className="category-insights">
                <h4>Quick Insights</h4>
                <div className="insights-list">
                  {stats.total === 0 && (
                    <div className="insight warning">
                      <span className="insight-icon">📦</span>
                      <span>No products found in this category</span>
                    </div>
                  )}
                  {stats.never > 0 && (
                    <div className="insight warning">
                      <span className="insight-icon">⚠️</span>
                      <span>{stats.never} products have never been synced</span>
                    </div>
                  )}
                  {stats.old > 5 && (
                    <div className="insight alert">
                      <span className="insight-icon">🔔</span>
                      <span>{stats.old} products need sync updates</span>
                    </div>
                  )}
                  {stats.recent > stats.total * 0.8 && stats.total > 0 && (
                    <div className="insight success">
                      <span className="insight-icon">🎉</span>
                      <span>Category is mostly up to date!</span>
                    </div>
                  )}
                  {stats.syncing > 0 && (
                    <div className="insight info">
                      <span className="insight-icon">🔄</span>
                      <span>Sync operation in progress...</span>
                    </div>
                  )}
                  {stats.total > 0 && stats.recent === 0 && stats.syncing === 0 && (
                    <div className="insight alert">
                      <span className="insight-icon">🚨</span>
                      <span>All products need immediate attention</span>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        <div className="popup-actions">
          <button 
            className="action-btn primary" 
            onClick={() => onViewProducts(category)}
            disabled={loading || stats.total === 0}
          >
            👁️ View Products ({stats.total})
          </button>
          <button 
            className="action-btn secondary" 
            onClick={() => onExportCategory(category)}
            disabled={loading || stats.total === 0}
          >
            📤 Export Category
          </button>
          <button 
            className="action-btn secondary sync-btn" 
            onClick={() => onSyncCategory(category)}
            disabled={loading || stats.syncing > 0 || stats.total === 0 || (stats.never === 0 && stats.old === 0)}
          >
            {stats.syncing > 0 ? (
              <>🔄 Syncing {stats.syncing} products...</>
            ) : stats.never === 0 && stats.old === 0 ? (
              <>✅ All Up to Date</>
            ) : (
              <>🔄 Start Sync Workflow ({stats.never + stats.old} products)</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

export default CategoryPopup;