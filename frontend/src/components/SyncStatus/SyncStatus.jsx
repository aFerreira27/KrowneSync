import React, { useState, useEffect } from 'react';
import './SyncStatus.css';
import api from '../../services/api';

function SyncStatus({ salesforceAuth, onSelectSKU }) {
  const [syncData, setSyncData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [sortBy, setSortBy] = useState('lastSync'); // 'name', 'category', 'lastSync'
  const [sortOrder, setSortOrder] = useState('desc'); // 'asc', 'desc'
  const [filter, setFilter] = useState('all'); // 'all', 'recent', 'old', 'never'
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    if (salesforceAuth.authenticated) {
      loadSyncHistory();
    }
  }, [salesforceAuth.authenticated]);

  const loadSyncHistory = async () => {
    setLoading(true);
    setError(null);
    
    try {
      // Get sync history from backend
      const syncHistory = await api.getSyncHistory();
      setSyncData(syncHistory);
    } catch (err) {
      console.error('Failed to load sync history:', err);
      setError(err.message || 'Failed to load sync history');
    } finally {
      setLoading(false);
    }
  };



  const handleSort = (column) => {
    if (sortBy === column) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(column);
      setSortOrder('desc');
    }
  };

  const handleSync = async (sku) => {
    // Navigate to search view to manually sync this SKU
    if (onSelectSKU) {
      onSelectSKU(sku);
    }
  };

  const formatRelativeTime = (date) => {
    if (!date) return 'Never';
    
    const now = new Date();
    const diffMs = now - new Date(date);
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    
    return new Date(date).toLocaleDateString();
  };

  const getStatusInfo = (status) => {
    const statusMap = {
      success: { label: 'Success', color: 'success', icon: '✅' },
      failed: { label: 'Failed', color: 'error', icon: '❌' },
      never: { label: 'Never Synced', color: 'warning', icon: '⏳' },
      pending: { label: 'Pending', color: 'info', icon: '🔄' }
    };
    
    return statusMap[status] || { label: status, color: 'default', icon: '❓' };
  };

  // Filter and sort data
  const filteredData = syncData.filter(item => {
    const searchText = `${item.sku} ${item.name || ''} ${item.category || ''}`.toLowerCase();
    const matchesSearch = searchText.includes(searchTerm.toLowerCase());
    
    let matchesFilter = true;
    if (filter === 'recent') {
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      matchesFilter = item.last_sync && new Date(item.last_sync) > weekAgo;
    } else if (filter === 'old') {
      const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      matchesFilter = item.last_sync && new Date(item.last_sync) < monthAgo;
    } else if (filter === 'never') {
      matchesFilter = !item.last_sync || item.status === 'never';
    }
    
    return matchesSearch && matchesFilter;
  });

  const sortedData = [...filteredData].sort((a, b) => {
    let aVal, bVal;
    
    switch (sortBy) {
      case 'name':
        aVal = (a.name || a.sku || '').toLowerCase();
        bVal = (b.name || b.sku || '').toLowerCase();
        break;
      case 'category':
        aVal = (a.category || 'Unknown').toLowerCase();
        bVal = (b.category || 'Unknown').toLowerCase();
        break;
      case 'lastSync':
        aVal = a.last_sync ? new Date(a.last_sync) : new Date(0);
        bVal = b.last_sync ? new Date(b.last_sync) : new Date(0);
        break;
      default:
        return 0;
    }
    
    if (sortOrder === 'asc') {
      return aVal > bVal ? 1 : -1;
    } else {
      return aVal < bVal ? 1 : -1;
    }
  });

  if (loading && syncData.length === 0) {
    return (
      <div className="sync-status-loading">
        <div className="loading-spinner"></div>
        <p>Loading sync history...</p>
      </div>
    );
  }

  return (
    <div className="sync-status-container">
      <div className="sync-status-header">
        <h2 className="sync-status-title">Sync History</h2>
        <p className="sync-status-subtitle">Track SKU synchronization status and history</p>
      </div>

      {!salesforceAuth.authenticated && (
        <div className="auth-warning">
          <span className="warning-icon">⚠️</span>
          <p>Connect to Pimly (Salesforce) to view sync history</p>
        </div>
      )}

      {error && (
        <div className="error-message">
          <span className="error-icon">❌</span>
          <span>{error}</span>
          <button onClick={() => setError(null)} className="error-close">×</button>
        </div>
      )}

      <div className="sync-controls">
        <div className="search-filter-group">
          <div className="search-box">
            <input
              type="text"
              placeholder="Search SKUs..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="sku-search"
            />
            <span className="search-icon">🔍</span>
          </div>

          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="status-filter"
          >
            <option value="all">All Products</option>
            <option value="recent">Recently Synced (7 days)</option>
            <option value="old">Needs Sync (30+ days)</option>
            <option value="never">Never Synced</option>
          </select>
        </div>

        <div className="action-group">
          <button 
            onClick={loadSyncHistory} 
            className="refresh-btn"
            disabled={loading}
          >
            🔄 Refresh
          </button>
        </div>
      </div>

      <div className="sync-stats">
        <div className="stat-card recent">
          <span className="stat-number">
            {syncData.filter(item => {
              const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
              return item.last_sync && new Date(item.last_sync) > weekAgo;
            }).length}
          </span>
          <span className="stat-label">Recently Synced</span>
        </div>
        <div className="stat-card old">
          <span className="stat-number">
            {syncData.filter(item => {
              const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
              return item.last_sync && new Date(item.last_sync) < monthAgo;
            }).length}
          </span>
          <span className="stat-label">Needs Sync</span>
        </div>
        <div className="stat-card never">
          <span className="stat-number">
            {syncData.filter(item => !item.last_sync || item.status === 'never').length}
          </span>
          <span className="stat-label">Never Synced</span>
        </div>
        <div className="stat-card total">
          <span className="stat-number">{syncData.length}</span>
          <span className="stat-label">Total Products</span>
        </div>
      </div>

      <div className="sync-table-container">
        <table className="sync-table">
          <thead>
            <tr>
              <th 
                className={`sortable ${sortBy === 'name' ? 'active' : ''}`}
                onClick={() => handleSort('name')}
              >
                Product Name {sortBy === 'name' && (sortOrder === 'asc' ? '↑' : '↓')}
              </th>
              <th 
                className={`sortable ${sortBy === 'category' ? 'active' : ''}`}
                onClick={() => handleSort('category')}
              >
                Category {sortBy === 'category' && (sortOrder === 'asc' ? '↑' : '↓')}
              </th>
              <th 
                className={`sortable ${sortBy === 'lastSync' ? 'active' : ''}`}
                onClick={() => handleSort('lastSync')}
              >
                Last Sync {sortBy === 'lastSync' && (sortOrder === 'asc' ? '↑' : '↓')}
              </th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {sortedData.length === 0 ? (
              <tr>
                <td colSpan="4" className="no-data">
                  {searchTerm || filter !== 'all' ? 'No products match your filters' : 'No sync data available'}
                </td>
              </tr>
            ) : (
              sortedData.map((item, index) => {
                const isRecentlySync = item.last_sync && 
                  new Date(item.last_sync) > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
                const isOldSync = item.last_sync && 
                  new Date(item.last_sync) < new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
                const isNeverSync = !item.last_sync || item.status === 'never';
                
                let rowClass = 'sync-row';
                if (isNeverSync) rowClass += ' status-never';
                else if (isOldSync) rowClass += ' status-old';
                else if (isRecentlySync) rowClass += ' status-recent';
                
                return (
                  <tr key={item.sku} className={rowClass}>
                    <td className="name-cell">
                      <div className="product-info">
                        <button 
                          className="product-name-link"
                          onClick={() => onSelectSKU && onSelectSKU(item.sku)}
                        >
                          {item.name || item.sku}
                        </button>
                        <span className="product-sku">{item.sku}</span>
                      </div>
                    </td>
                    <td className="category-cell">
                      <span className="category-badge">
                        {item.category || 'Uncategorized'}
                      </span>
                    </td>
                    <td className="time-cell">
                      <span className="relative-time">{formatRelativeTime(item.last_sync)}</span>
                      {item.last_sync && (
                        <span className="absolute-time">
                          {new Date(item.last_sync).toLocaleString()}
                        </span>
                      )}
                    </td>
                    <td className="actions-cell">
                      <button 
                        className="view-btn-small"
                        onClick={() => handleSync(item.sku)}
                      >
                        👁️ View
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="sync-footer">
        <span className="results-count">
          Showing {sortedData.length} of {syncData.length} products
        </span>
      </div>
    </div>
  );
}

export default SyncStatus;