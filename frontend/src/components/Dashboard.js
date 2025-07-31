import React, { useState } from 'react';

const Dashboard = ({ uploadedFile, salesforceAuth, onStartComparison, onSalesforceSync, loading }) => {
  const [syncResults, setSyncResults] = useState(null);
  const [syncLoading, setSyncLoading] = useState(false);

  const handleSalesforceSync = async (includePricing = false) => {
    setSyncLoading(true);
    try {
      const result = await onSalesforceSync(includePricing);
      setSyncResults(result);
    } catch (error) {
      console.error('Sync failed:', error);
    } finally {
      setSyncLoading(false);
    }
  };

  // Updated to work with OAuth authentication object
  const salesforceConfig = salesforceAuth?.authenticated ? {
    username: salesforceAuth.userInfo?.email || salesforceAuth.userInfo?.name,
    products_count: salesforceAuth.products_count,
    preview: salesforceAuth.preview
  } : null;

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <h2>Dashboard</h2>
        <p>Monitor your data sources and start synchronization</p>
        {salesforceAuth?.authenticated && (
          <div className="auth-status">
            ✅ Connected to Salesforce as {salesforceAuth.userInfo?.name || salesforceAuth.userInfo?.email}
          </div>
        )}
      </div>

      <div className="dashboard-grid">
        {/* CSV Data Source Card */}
        <div className="data-source-card">
          <div className="card-header">
            <h3>CSV Data Source</h3>
            <div className={`status-indicator ${uploadedFile ? 'active' : 'inactive'}`}>
              {uploadedFile ? 'Ready' : 'Not Configured'}
            </div>
          </div>
          
          <div className="card-content">
            {uploadedFile ? (
              <div className="source-info">
                <div className="info-item">
                  <strong>File:</strong> {uploadedFile.filename}
                </div>
                <div className="info-item">
                  <strong>Products:</strong> {uploadedFile.products_count}
                </div>
                
                {uploadedFile.preview && uploadedFile.preview.length > 0 && (
                  <div className="preview-section">
                    <h4>Sample Products:</h4>
                    <div className="product-preview">
                      {uploadedFile.preview.slice(0, 3).map((product, index) => (
                        <div key={index} className="preview-item">
                          <strong>{product.name}</strong> - ${product.price}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="no-data">
                <p>No CSV file uploaded</p>
                <p className="help-text">Upload a CSV file to get started</p>
              </div>
            )}
          </div>
          
          <div className="card-actions">
            <button 
              className="btn btn-primary"
              onClick={() => onStartComparison('csv')}
              disabled={!uploadedFile || loading}
            >
              {loading ? 'Processing...' : 'Start CSV Sync'}
            </button>
          </div>
        </div>

        {/* Salesforce Data Source Card - Updated for OAuth */}
        <div className="data-source-card">
          <div className="card-header">
            <h3>Salesforce Data Source</h3>
            <div className={`status-indicator ${salesforceAuth?.authenticated ? 'active' : 'inactive'}`}>
              {salesforceAuth?.authenticated ? 'Connected' : 'Not Connected'}
            </div>
          </div>
          
          <div className="card-content">
            {salesforceAuth?.authenticated ? (
              <div className="source-info">
                <div className="info-item">
                  <strong>User:</strong> {salesforceAuth.userInfo?.name || 'Unknown'}
                </div>
                <div className="info-item">
                  <strong>Email:</strong> {salesforceAuth.userInfo?.email || 'Unknown'}
                </div>
                <div className="info-item">
                  <strong>Instance:</strong> {salesforceAuth.instanceUrl ? new URL(salesforceAuth.instanceUrl).hostname : 'Unknown'}
                </div>
                
                {salesforceAuth.products_count && (
                  <div className="info-item">
                    <strong>Products:</strong> {salesforceAuth.products_count}
                  </div>
                )}
                
                {salesforceAuth.preview && salesforceAuth.preview.length > 0 && (
                  <div className="preview-section">
                    <h4>Sample Products:</h4>
                    <div className="product-preview">
                      {salesforceAuth.preview.slice(0, 3).map((product, index) => (
                        <div key={index} className="preview-item">
                          <strong>{product.name}</strong> - ${product.price || 'N/A'}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {syncResults && (
                  <div className="sync-results">
                    <div className="info-item">
                      <strong>Last Sync:</strong> {syncResults.products_count || syncResults.total_products} products retrieved
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="no-data">
                <p>No Salesforce connection configured</p>
                <p className="help-text">Go to the Salesforce tab to connect using OAuth</p>
              </div>
            )}
          </div>
          
          <div className="card-actions">
            {salesforceAuth?.authenticated ? (
              <div className="button-group">
                <button 
                  className="btn btn-secondary"
                  onClick={() => handleSalesforceSync(false)}
                  disabled={syncLoading}
                >
                  {syncLoading ? 'Syncing...' : 'Sync Products'}
                </button>
                <button 
                  className="btn btn-primary"
                  onClick={() => onStartComparison('salesforce')}
                  disabled={loading}
                >
                  {loading ? 'Processing...' : 'Start Salesforce Sync'}
                </button>
              </div>
            ) : (
              <div className="no-connection">
                <p className="help-text">Connect to Salesforce first</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Krowne.com Status Card */}
      <div className="krowne-status-card">
        <div className="card-header">
          <h3>Target: Krowne.com</h3>
          <div className="status-indicator active">
            Ready
          </div>
        </div>
        
        <div className="card-content">
          <div className="krowne-info">
            <p>KrowneSync will compare your product data with products listed on Krowne.com</p>
            <div className="feature-list">
              <div className="feature-item">✓ Product name matching</div>
              <div className="feature-item">✓ Price comparison</div>
              <div className="feature-item">✓ Description validation</div>
              <div className="feature-item">✓ Availability checking</div>
            </div>
          </div>
        </div>
      </div>

      {/* Enhanced Quick Actions */}
      <div className="quick-actions">
        <h3>Quick Actions</h3>
        <div className="action-buttons">
          <button 
            className="btn btn-outline"
            onClick={() => window.location.reload()}
          >
            Refresh Data
          </button>
          
          {salesforceAuth?.authenticated && (
            <button 
              className="btn btn-outline"
              onClick={() => handleSalesforceSync(false)}
              disabled={syncLoading}
            >
              {syncLoading ? 'Syncing...' : 'Quick Sync Salesforce'}
            </button>
          )}
          
          <button 
            className="btn btn-outline"
            onClick={() => {
              const element = document.querySelector('.dashboard');
              element.scrollIntoView({ behavior: 'smooth' });
            }}
          >
            Scroll to Top
          </button>
        </div>
      </div>

      {/* System Status Summary */}
      <div className="system-status-summary">
        <h3>System Status</h3>
        <div className="status-items">
          <div className={`status-item ${uploadedFile ? 'ready' : 'pending'}`}>
            <span className="status-icon">{uploadedFile ? '✅' : '⚪'}</span>
            <span className="status-text">CSV Data: {uploadedFile ? 'Ready' : 'Pending'}</span>
          </div>
          <div className={`status-item ${salesforceAuth?.authenticated ? 'ready' : 'pending'}`}>
            <span className="status-icon">{salesforceAuth?.authenticated ? '✅' : '⚪'}</span>
            <span className="status-text">Salesforce: {salesforceAuth?.authenticated ? 'Connected' : 'Disconnected'}</span>
          </div>
          <div className="status-item ready">
            <span className="status-icon">✅</span>
            <span className="status-text">Krowne.com: Ready</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;