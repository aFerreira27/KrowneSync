import React, { useState, useMemo } from 'react';
import './ProductList.css';

function ProductList({ 
  category, 
  products = [], 
  onClose, 
  onSelectProduct, 
  formatCategoryName,
  getCategoryIcon,
  onSyncProduct,
  onExportProducts 
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState('name'); // 'name', 'sku', 'lastSync', 'status'
  const [sortOrder, setSortOrder] = useState('asc');
  const [filterStatus, setFilterStatus] = useState('all'); // 'all', 'recent', 'old', 'never', 'pending'

  const getStatusInfo = (product) => {
    if (!product.last_sync_date || product.status === 'never') {
      return { 
        label: 'Never Synced', 
        color: 'never', 
        icon: '❌',
        priority: 4 
      };
    }
    
    if (product.status === 'pending') {
      return { 
        label: 'Syncing...', 
        color: 'pending', 
        icon: '🔄',
        priority: 1 
      };
    }
    
    if (product.status === 'failed') {
      return { 
        label: 'Sync Failed', 
        color: 'failed', 
        icon: '⚠️',
        priority: 3 
      };
    }
    
    const lastSync = new Date(product.last_sync_date);
    const now = new Date();
    const daysSinceSync = (now - lastSync) / (1000 * 60 * 60 * 24);
    
    if (daysSinceSync <= 7) {
      return { 
        label: 'Recently Synced', 
        color: 'recent', 
        icon: '✅',
        priority: 0 
      };
    } else if (daysSinceSync <= 30) {
      return { 
        label: 'Needs Update', 
        color: 'old', 
        icon: '⚠️',
        priority: 2 
      };
    } else {
      return { 
        label: 'Stale', 
        color: 'stale', 
        icon: '🔴',
        priority: 3 
      };
    }
  };

  const formatRelativeTime = (dateString) => {
    if (!dateString) return 'Never';
    
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    if (diffDays < 30) return `${diffDays} days ago`;
    
    return date.toLocaleDateString();
  };

  // Filter and sort products
  const filteredAndSortedProducts = useMemo(() => {
    let filtered = products.filter(product => {
      // Search filter
      const searchMatch = !searchTerm || 
        product.sku.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (product.product_name && product.product_name.toLowerCase().includes(searchTerm.toLowerCase()));
      
      if (!searchMatch) return false;
      
      // Status filter
      if (filterStatus === 'all') return true;
      
      const statusInfo = getStatusInfo(product);
      if (filterStatus === 'recent') return statusInfo.color === 'recent';
      if (filterStatus === 'old') return statusInfo.color === 'old' || statusInfo.color === 'stale';
      if (filterStatus === 'never') return statusInfo.color === 'never';
      if (filterStatus === 'pending') return statusInfo.color === 'pending';
      
      return true;
    });

    // Sort products
    filtered.sort((a, b) => {
      let aVal, bVal;
      
      switch (sortBy) {
        case 'name':
          aVal = (a.product_name || a.sku).toLowerCase();
          bVal = (b.product_name || b.sku).toLowerCase();
          break;
        case 'sku':
          aVal = a.sku.toLowerCase();
          bVal = b.sku.toLowerCase();
          break;
        case 'lastSync':
          aVal = a.last_sync_date ? new Date(a.last_sync_date).getTime() : 0;
          bVal = b.last_sync_date ? new Date(b.last_sync_date).getTime() : 0;
          break;
        case 'status':
          aVal = getStatusInfo(a).priority;
          bVal = getStatusInfo(b).priority;
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

    return filtered;
  }, [products, searchTerm, sortBy, sortOrder, filterStatus]);

  const handleSort = (column) => {
    if (sortBy === column) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(column);
      setSortOrder('asc');
    }
  };

  const getStatusCounts = () => {
    const counts = {
      total: products.length,
      recent: 0,
      old: 0,
      never: 0,
      pending: 0,
      failed: 0
    };

    products.forEach(product => {
      const statusInfo = getStatusInfo(product);
      if (statusInfo.color === 'recent') counts.recent++;
      else if (statusInfo.color === 'old' || statusInfo.color === 'stale') counts.old++;
      else if (statusInfo.color === 'never') counts.never++;
      else if (statusInfo.color === 'pending') counts.pending++;
      else if (statusInfo.color === 'failed') counts.failed++;
    });

    return counts;
  };

  const statusCounts = getStatusCounts();

  return (
    <div className="product-list-overlay" onClick={onClose}>
      <div className="product-list-container" onClick={e => e.stopPropagation()}>
        <div className="product-list-header">
          <div className="header-content">
            <div className="header-info">
              <div className="category-info">
                <span className="category-icon-large">{getCategoryIcon(category)}</span>
                <div className="category-details">
                  <h2>{formatCategoryName(category)}</h2>
                  <p>{products.length} products in category</p>
                </div>
              </div>
            </div>
            <button className="close-btn" onClick={onClose}>✕</button>
          </div>
          
          <div className="status-summary">
            <div className="status-counts">
              <div className="status-count total">
                <span className="count">{statusCounts.total}</span>
                <span className="label">Total</span>
              </div>
              <div className="status-count recent">
                <span className="count">{statusCounts.recent}</span>
                <span className="label">Recent</span>
              </div>
              <div className="status-count old">
                <span className="count">{statusCounts.old}</span>
                <span className="label">Need Update</span>
              </div>
              <div className="status-count never">
                <span className="count">{statusCounts.never}</span>
                <span className="label">Never Synced</span>
              </div>
              {statusCounts.pending > 0 && (
                <div className="status-count pending">
                  <span className="count">{statusCounts.pending}</span>
                  <span className="label">Syncing</span>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="product-list-controls">
          <div className="controls-row">
            <div className="search-section">
              <input
                type="text"
                placeholder="Search products by SKU or name..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="product-search"
              />
            </div>
            
            <div className="filter-section">
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="status-filter"
              >
                <option value="all">All Status</option>
                <option value="recent">Recently Synced</option>
                <option value="old">Need Update</option>
                <option value="never">Never Synced</option>
              </select>
            </div>

            <div className="action-section">
              <button 
                className="export-btn"
                onClick={() => onExportProducts && onExportProducts(category, filteredAndSortedProducts)}
              >
                📤 Export
              </button>
            </div>
          </div>
        </div>

        <div className="product-table-container">
          <table className="product-table">
            <thead>
              <tr>
                <th 
                  className={`sortable ${sortBy === 'sku' ? 'active' : ''}`}
                  onClick={() => handleSort('sku')}
                >
                  SKU {sortBy === 'sku' && (sortOrder === 'asc' ? '↑' : '↓')}
                </th>
                <th 
                  className={`sortable ${sortBy === 'name' ? 'active' : ''}`}
                  onClick={() => handleSort('name')}
                >
                  Product Name {sortBy === 'name' && (sortOrder === 'asc' ? '↑' : '↓')}
                </th>
                <th 
                  className={`sortable ${sortBy === 'status' ? 'active' : ''}`}
                  onClick={() => handleSort('status')}
                >
                  Sync Status {sortBy === 'status' && (sortOrder === 'asc' ? '↑' : '↓')}
                </th>
                <th 
                  className={`sortable ${sortBy === 'lastSync' ? 'active' : ''}`}
                  onClick={() => handleSort('lastSync')}
                >
                  Last Sync {sortBy === 'lastSync' && (sortOrder === 'asc' ? '↑' : '↓')}
                </th>
                <th>Sync Count</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredAndSortedProducts.length === 0 ? (
                <tr>
                  <td colSpan="6" className="no-results">
                    {searchTerm || filterStatus !== 'all' 
                      ? 'No products match your filters' 
                      : 'No products found in this category'
                    }
                  </td>
                </tr>
              ) : (
                filteredAndSortedProducts.map((product) => {
                  const statusInfo = getStatusInfo(product);
                  return (
                    <tr key={product.sku} className={`product-row status-${statusInfo.color}`}>
                      <td className="sku-cell">
                        <span className="sku-text">{product.sku}</span>
                      </td>
                      <td className="name-cell">
                        <span className="product-name">
                          {product.product_name || product.sku}
                        </span>
                      </td>
                      <td className="status-cell">
                        <div className={`status-badge ${statusInfo.color}`}>
                          <span className="status-icon">{statusInfo.icon}</span>
                          <span className="status-text">{statusInfo.label}</span>
                        </div>
                      </td>
                      <td className="time-cell">
                        <div className="time-info">
                          <span className="relative-time">
                            {formatRelativeTime(product.last_sync_date)}
                          </span>
                          {product.last_sync_date && (
                            <span className="absolute-time">
                              {new Date(product.last_sync_date).toLocaleString()}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="count-cell">
                        <div className="sync-counts">
                          <span className="total-count">{product.sync_count || 0}</span>
                          {product.success_count > 0 && (
                            <span className="success-count">✅ {product.success_count}</span>
                          )}
                          {product.failed_count > 0 && (
                            <span className="failed-count">❌ {product.failed_count}</span>
                          )}
                        </div>
                      </td>
                      <td className="actions-cell">
                        <div className="action-buttons">
                          <button 
                            className="view-btn"
                            onClick={() => onSelectProduct && onSelectProduct(product.sku)}
                            title="View product details"
                          >
                            👁️
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="product-list-footer">
          <div className="footer-info">
            <span>Showing {filteredAndSortedProducts.length} of {products.length} products</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ProductList;