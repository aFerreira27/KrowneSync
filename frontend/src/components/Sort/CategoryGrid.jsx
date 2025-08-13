import React from 'react';
import './CategoryGrid.css';

function CategoryGrid({ 
  categories, 
  salesforceAuth, 
  onCategoryClick, 
  formatCategoryName, 
  getCategoryIcon,
  categoryStats = {} 
}) {
  const getStatusInfo = (category) => {
    const stats = categoryStats[category];
    if (!stats || !salesforceAuth.authenticated) return null;
    
    const { recent = 0, old = 0, never = 0, total = 0, syncing = 0 } = stats;
    
    if (total === 0) {
      return { 
        syncText: 'No products',
        syncIcon: '❓',
        healthBar: null
      };
    }

    if (syncing > 0) {
      return { 
        syncText: `Syncing ${syncing} products...`,
        syncIcon: '🔄',
        healthBar: {
          recent: (recent / total) * 100,
          old: (old / total) * 100,
          never: (never / total) * 100,
          syncing: true
        }
      };
    }
    
    const recentPercentage = (recent / total) * 100;
    const neverPercentage = (never / total) * 100;
    
    // Determine sync icon based on health
    let syncIcon = '✅';
    if (neverPercentage > 50) syncIcon = '❌';
    else if (recentPercentage < 60) syncIcon = '⚠️';
    
    return { 
      syncText: `${recent}/${total} synced`,
      syncIcon,
      healthBar: {
        recent: recentPercentage,
        old: (old / total) * 100,
        never: neverPercentage,
        syncing: false
      }
    };
  };

  return (
    <div className="categories-grid">
      {categories.length === 0 ? (
        <div className="no-results">
          <span className="no-results-icon">📦</span>
          <h3>No categories found</h3>
          <p>Try adjusting your search terms</p>
        </div>
      ) : (
        categories.map((category, index) => {
          const statusInfo = getStatusInfo(category);
          
          return (
            <div
              key={category}
              className={`category-card ${!salesforceAuth.authenticated ? 'disabled' : ''}`}
              onClick={() => salesforceAuth.authenticated && onCategoryClick(category)}
              tabIndex={salesforceAuth.authenticated ? 0 : -1}
              onKeyDown={(e) => {
                if (salesforceAuth.authenticated && (e.key === 'Enter' || e.key === ' ')) {
                  e.preventDefault();
                  onCategoryClick(category);
                }
              }}
            >
              <div className="category-icon">
                {getCategoryIcon(category)}
              </div>
              
              <div className="category-content">
                <h3 className="category-name">{formatCategoryName(category)}</h3>
                
                {statusInfo && (
                  <div className="sync-status">
                    <div className="sync-text">
                      {statusInfo.syncText}
                    </div>
                    {statusInfo.healthBar && (
                      <div className="sync-healthbar">
                        <div className="healthbar-track">
                          <div 
                            className="healthbar-fill recent" 
                            style={{ width: `${statusInfo.healthBar.recent}%` }}
                          ></div>
                          <div 
                            className="healthbar-fill old" 
                            style={{ width: `${statusInfo.healthBar.old}%` }}
                          ></div>
                          <div 
                            className="healthbar-fill never" 
                            style={{ width: `${statusInfo.healthBar.never}%` }}
                          ></div>
                          {statusInfo.healthBar.syncing && (
                            <div className="healthbar-pulse"></div>
                          )}
                        </div>
                        <span className="healthbar-label">Sync Health</span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="sync-icon-container">
                {statusInfo && statusInfo.syncIcon && (
                  <div className={`sync-icon ${statusInfo.healthBar?.syncing ? 'syncing' : ''}`}>
                    {statusInfo.syncIcon}
                  </div>
                )}
              </div>

              <div className="category-arrow">→</div>
            </div>
          );
        })
      )}
    </div>
  );
}

export default CategoryGrid;