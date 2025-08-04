import React, { useState, useEffect, useCallback } from 'react';
import api from '../services/api';

const SyncTable = ({ salesforceAuth, onSelectSKU }) => {
  const [syncData, setSyncData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [sortBy, setSortBy] = useState('mismatches'); // 'mismatches' or 'sku'
  const [progress, setProgress] = useState(null);

  const fetchSyncData = useCallback(async () => {
    setLoading(true);
    setError(null);
    setProgress({ current: 0, message: 'Starting comparison...' });

    try {
      const response = await api.compareProducts({ 
        source_type: 'pimly',
        limit: 1000 
      });

      const tableData = response.results.map(item => ({
        sku: item.product_id,
        name: item.name,
        mismatches: item.differences ? item.differences.length : 0,
        totalFields: 5,
        inSync: item.status === 'match',
        status: item.status,
        differences: item.differences || []
      }));

      const sorted = tableData.sort((a, b) => {
        if (sortBy === 'mismatches') {
          return b.mismatches - a.mismatches;
        }
        return a.sku.localeCompare(b.sku);
      });

      setSyncData(sorted);
      setProgress(null);
    } catch (err) {
      setError(err.message || 'Failed to fetch sync data');
      setProgress(null);
    } finally {
      setLoading(false);
    }
  }, [sortBy]);

  useEffect(() => {
    if (salesforceAuth.authenticated) {
      fetchSyncData();
    }
  }, [salesforceAuth.authenticated, fetchSyncData]);


  // Poll for progress updates
  useEffect(() => {
    let intervalId;
    if (loading && !progress?.completed) {
      intervalId = setInterval(async () => {
        try {
          const progressData = await api.getCompareProgress('pimly');
          setProgress(progressData);
          if (progressData.completed) {
            clearInterval(intervalId);
          }
        } catch (err) {
          // Ignore progress errors
        }
      }, 1000);
    }
    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [loading, progress?.completed]);

  const handleSort = (newSortBy) => {
    setSortBy(newSortBy);
    const sorted = [...syncData].sort((a, b) => {
      if (newSortBy === 'mismatches') {
        return b.mismatches - a.mismatches;
      }
      return a.sku.localeCompare(b.sku);
    });
    setSyncData(sorted);
  };

  const totalProducts = syncData.length;
  const outOfSyncProducts = syncData.filter(item => !item.inSync).length;

  if (loading) {
    return (
      <div className="sync-table-container loading">
        <div className="loading-spinner"></div>
        <p>{progress?.message || 'Checking sync status...'}</p>
        {progress?.current > 0 && (
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${progress.current}%` }}></div>
          </div>
        )}
      </div>
    );
  }

  if (error) {
    return (
      <div className="sync-table-container error">
        <div className="error-message">
          {error}
          <button onClick={fetchSyncData} className="retry-btn">Retry</button>
        </div>
      </div>
    );
  }

  if (!salesforceAuth.authenticated) {
    return (
      <div className="sync-table-container">
        <div className="auth-warning">
          <p>⚠️ Connect to Pimly (Salesforce) to check sync status</p>
        </div>
      </div>
    );
  }

  return (
    <div className="sync-table-container">
      <div className="sync-summary">
        <div className="summary-stat">
          <span className="stat-label">Total Products:</span>
          <span className="stat-value">{totalProducts}</span>
        </div>
        <div className="summary-stat">
          <span className="stat-label">Out of Sync:</span>
          <span className="stat-value error">{outOfSyncProducts}</span>
        </div>
        <div className="summary-stat">
          <span className="stat-label">In Sync:</span>
          <span className="stat-value success">{totalProducts - outOfSyncProducts}</span>
        </div>
        <button onClick={fetchSyncData} className="refresh-btn">
          🔄 Refresh
        </button>
      </div>

      <div className="table-controls">
        <div className="sort-options">
          <span>Sort by:</span>
          <button 
            className={`sort-btn ${sortBy === 'mismatches' ? 'active' : ''}`}
            onClick={() => handleSort('mismatches')}
          >
            Mismatches
          </button>
          <button 
            className={`sort-btn ${sortBy === 'sku' ? 'active' : ''}`}
            onClick={() => handleSort('sku')}
          >
            SKU
          </button>
        </div>
      </div>

      {syncData.length === 0 ? (
        <div className="no-data">
          <p>No products found. Click refresh to check sync status.</p>
        </div>
      ) : (
        <div className="sync-table">
          <table>
            <thead>
              <tr>
                <th>Status</th>
                <th>SKU</th>
                <th>Product Name</th>
                <th>Sync Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {syncData.map((item) => (
                <tr key={item.sku} className={item.inSync ? 'in-sync' : 'out-of-sync'}>
                  <td>
                    <span className={`status-indicator ${item.inSync ? 'green' : 'red'}`}>
                      {item.inSync ? '✓' : '✗'}
                    </span>
                  </td>
                  <td className="sku-cell">{item.sku}</td>
                  <td>{item.name}</td>
                  <td>
                    {item.inSync ? (
                      <span className="sync-status in-sync">In Sync</span>
                    ) : item.status === 'missing_from_krowne' ? (
                      <span className="sync-status out-of-sync">
                        Missing from Krowne
                      </span>
                    ) : (
                      <span className="sync-status out-of-sync">
                        {item.mismatches}/{item.totalFields} out of sync
                      </span>
                    )}
                  </td>
                  <td>
                    {!item.inSync && (
                      <button 
                        className="view-details-btn"
                        onClick={() => onSelectSKU(item.sku)}
                      >
                        View Details →
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default SyncTable;