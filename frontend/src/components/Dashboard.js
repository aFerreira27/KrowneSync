import React from 'react';

const Dashboard = ({ uploadedFile, salesforceConfig, onStartComparison, loading }) => {
  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <h2>Dashboard</h2>
        <p>Monitor your data sources and start synchronization</p>
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

        {/* Salesforce Data Source Card */}
        <div className="data-source-card">
          <div className="card-header">
            <h3>Salesforce Data Source</h3>
            <div className={`status-indicator ${salesforceConfig ? 'active' : 'inactive'}`}>
              {salesforceConfig ? 'Connected' : 'Not Connected'}
            </div>
          </div>
          
          <div className="card-content">
            {salesforceConfig ? (
              <div className="source-info">
                <div className="info-item">
                  <strong>Username:</strong> {salesforceConfig.username}
                </div>
                <div className="info-item">
                  <strong>Products:</strong> {salesforceConfig.products_count}
                </div>
                
                {salesforceConfig.preview && salesforceConfig.preview.length > 0 && (
                  <div className="preview-section">
                    <h4>Sample Products:</h4>
                    <div className="product-preview">
                      {salesforceConfig.preview.slice(0, 3).map((product, index) => (
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
                <p>No Salesforce connection configured</p>
                <p className="help-text">Configure Salesforce credentials to connect</p>
              </div>
            )}
          </div>
          
          <div className="card-actions">
            <button 
              className="btn btn-primary"
              onClick={() => onStartComparison('salesforce')}
              disabled={!salesforceConfig || loading}
            >
              {loading ? 'Processing...' : 'Start Salesforce Sync'}
            </button>
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

      {/* Quick Actions */}
      <div className="quick-actions">
        <h3>Quick Actions</h3>
        <div className="action-buttons">
          <button 
            className="btn btn-outline"
            onClick={() => window.location.reload()}
          >
            Refresh Data
          </button>
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
    </div>
  );
};

export default Dashboard;