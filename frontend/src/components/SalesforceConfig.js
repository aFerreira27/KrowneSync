import React, { useState, useEffect } from 'react';

const SalesforceConfig = ({ onConfigSave, loading }) => {
  const [config, setConfig] = useState({
    client_id: '',
    client_secret: '',
    sandbox: false
  });

  const [authStatus, setAuthStatus] = useState({
    authenticated: false,
    loading: true,
    userInfo: null,
    instanceUrl: null
  });

  const [error, setError] = useState(null);
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  // Check authentication status on component mount
  useEffect(() => {
    checkAuthStatus();
    
    // Handle OAuth callback if present in URL
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('auth') === 'success') {
      setError(null);
      checkAuthStatus();
      // Clean up URL
      window.history.replaceState({}, document.title, window.location.pathname);
    } else if (urlParams.get('error')) {
      const errorMsg = urlParams.get('error_description') || urlParams.get('message') || urlParams.get('error');
      setError(`Authentication failed: ${errorMsg}`);
      // Clean up URL
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  const checkAuthStatus = async () => {
    try {
      const response = await fetch('/api/salesforce/status');
      const data = await response.json();
      
      setAuthStatus({
        authenticated: data.authenticated,
        loading: false,
        userInfo: data.user_info || null,
        instanceUrl: data.instance_url
      });

      // If authenticated, notify parent component
      if (data.authenticated && onConfigSave) {
        onConfigSave({
          authenticated: true,
          userInfo: data.user_info,
          instanceUrl: data.instance_url
        });
      }
    } catch (err) {
      console.error('Error checking auth status:', err);
      setAuthStatus({
        authenticated: false,
        loading: false,
        userInfo: null,
        instanceUrl: null
      });
    }
  };

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setConfig(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleOAuthLogin = async (e) => {
    e.preventDefault();
    
    if (!config.client_id || !config.client_secret) {
      setError('Client ID and Client Secret are required');
      return;
    }

    try {
      setIsAuthenticating(true);
      setError(null);

      const response = await fetch('/api/auth/salesforce/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(config),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Authentication failed');
      }

      if (data.authorization_url) {
        // Redirect to Salesforce for authorization
        window.location.href = data.authorization_url;
      } else {
        throw new Error('No authorization URL received');
      }
    } catch (err) {
      setError(err.message);
      setIsAuthenticating(false);
    }
  };

  const handleLogout = async () => {
    try {
      setError(null);
      
      const response = await fetch('/api/salesforce/logout', {
        method: 'POST',
      });

      if (response.ok) {
        setAuthStatus({
          authenticated: false,
          loading: false,
          userInfo: null,
          instanceUrl: null
        });
        
        // Notify parent component
        if (onConfigSave) {
          onConfigSave({ authenticated: false });
        }
      }
    } catch (err) {
      setError('Logout failed: ' + err.message);
    }
  };

  const isFormValid = () => {
    return config.client_id.trim() !== '' && config.client_secret.trim() !== '';
  };

  if (authStatus.loading) {
    return (
      <div className="salesforce-config loading">
        <div className="loading-spinner"></div>
        <p>Checking authentication status...</p>
      </div>
    );
  }

  return (
    <div className="salesforce-config">
      {authStatus.authenticated ? (
        // Authenticated State
        <div className="auth-success">
          <h2>✅ Salesforce Connected</h2>
          <div className="user-info">
            <h3>Connection Details</h3>
            <div className="info-grid">
              <div className="info-item">
                <strong>User:</strong> {authStatus.userInfo?.name || 'Unknown'}
              </div>
              <div className="info-item">
                <strong>Email:</strong> {authStatus.userInfo?.email || 'Unknown'}
              </div>
              <div className="info-item">
                <strong>Organization:</strong> {authStatus.userInfo?.organization_id || 'Unknown'}
              </div>
              <div className="info-item">
                <strong>Instance:</strong> {authStatus.instanceUrl || 'Unknown'}
              </div>
            </div>
          </div>
          
          <div className="form-actions">
            <button 
              type="button" 
              className="btn btn-secondary"
              onClick={handleLogout}
            >
              Disconnect from Salesforce
            </button>
          </div>
        </div>
      ) : (
        // Not Authenticated State
        <div className="auth-form">
          <h2>Salesforce OAuth Configuration</h2>
          <p>Connect to your Salesforce org using OAuth 2.0 (secure, no passwords required)</p>

          {error && (
            <div className="error-message">
              <strong>Error:</strong> {error}
              <button onClick={() => setError(null)} className="close-button">×</button>
            </div>
          )}

          <form onSubmit={handleOAuthLogin} className="config-form">
            <div className="form-group">
              <label htmlFor="client_id">Connected App Client ID *</label>
              <input
                type="text"
                id="client_id"
                name="client_id"
                value={config.client_id}
                onChange={handleInputChange}
                placeholder="3MVG9..."
                required
                disabled={isAuthenticating}
              />
              <small className="form-help">
                Found in your Connected App settings under "Consumer Key"
              </small>
            </div>

            <div className="form-group">
              <label htmlFor="client_secret">Connected App Client Secret *</label>
              <input
                type="password"
                id="client_secret"
                name="client_secret"
                value={config.client_secret}
                onChange={handleInputChange}
                placeholder="Client Secret from Connected App"
                required
                disabled={isAuthenticating}
              />
              <small className="form-help">
                Found in your Connected App settings under "Consumer Secret"
              </small>
            </div>

            <div className="form-group">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  name="sandbox"
                  checked={config.sandbox}
                  onChange={handleInputChange}
                  disabled={isAuthenticating}
                />
                Connect to Salesforce Sandbox
              </label>
              <small className="form-help">
                Check this if connecting to a sandbox org (test.salesforce.com)
              </small>
            </div>

            <div className="form-actions">
              <button 
                type="submit" 
                className="btn btn-primary"
                disabled={!isFormValid() || isAuthenticating || loading}
              >
                {isAuthenticating ? 'Redirecting to Salesforce...' : 'Connect with Salesforce'}
              </button>
            </div>
          </form>

          <div className="oauth-benefits">
            <h3>🔒 Why OAuth is Better</h3>
            <ul>
              <li>✅ No passwords stored in the application</li>
              <li>✅ Secure token-based authentication</li>
              <li>✅ Granular permission control</li>
              <li>✅ Easy to revoke access</li>
              <li>✅ Industry standard security</li>
            </ul>
          </div>

          <div className="setup-instructions">
            <h3>📋 Setup Instructions</h3>
            <div className="instructions-list">
              <div className="instruction-step">
                <strong>1. Create a Connected App in Salesforce:</strong>
                <p>Setup → Platform Tools → Apps → App Manager → New Connected App</p>
              </div>
              <div className="instruction-step">
                <strong>2. Configure OAuth Settings:</strong>
                <ul>
                  <li>Enable OAuth Settings: ✓</li>
                  <li>Callback URL: <code>{window.location.origin}/api/auth/callback/salesforce</code></li>
                  <li>Selected OAuth Scopes: 
                    <ul>
                      <li>Manage user data via APIs (api)</li>
                      <li>Perform requests on your behalf at any time (refresh_token, offline_access)</li>
                    </ul>
                  </li>
                </ul>
              </div>
              <div className="instruction-step">
                <strong>3. Configure Security Settings:</strong>
                <ul>
                  <li>Require Proof Key for Code Exchange (PKCE): ✓</li>
                  <li>Require Secret for Web Server Flow: ✓</li>
                  <li>IP Relaxation: "Relax IP restrictions" (for development)</li>
                </ul>
              </div>
              <div className="instruction-step">
                <strong>4. Get Your Credentials:</strong>
                <p>After saving, click "Manage Consumer Details" to get your Client ID and Secret</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// CSS styles (add to your CSS file)
const styles = `
.salesforce-config {
  max-width: 800px;
  margin: 0 auto;
  padding: 20px;
}

.salesforce-config.loading {
  text-align: center;
  padding: 40px;
}

.loading-spinner {
  border: 4px solid #f3f3f3;
  border-top: 4px solid #3498db;
  border-radius: 50%;
  width: 40px;
  height: 40px;
  animation: spin 2s linear infinite;
  margin: 0 auto 20px;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.auth-success {
  background: #d4edda;
  border: 1px solid #c3e6cb;
  border-radius: 8px;
  padding: 20px;
  margin-bottom: 20px;
}

.user-info {
  margin: 20px 0;
}

.info-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 15px;
  margin-top: 15px;
}

.info-item {
  background: white;
  padding: 10px;
  border-radius: 4px;
  border: 1px solid #dee2e6;
}

.error-message {
  background: #f8d7da;
  border: 1px solid #f5c6cb;
  color: #721c24;
  padding: 12px;
  border-radius: 4px;
  margin-bottom: 20px;
  position: relative;
}

.close-button {
  position: absolute;
  right: 10px;
  top: 10px;
  background: none;
  border: none;
  font-size: 18px;
  cursor: pointer;
  color: #721c24;
}

.oauth-benefits {
  background: #e7f3ff;
  border: 1px solid #b8daff;
  border-radius: 8px;
  padding: 20px;
  margin: 20px 0;
}

.oauth-benefits ul {
  margin: 10px 0;
  padding-left: 20px;
}

.setup-instructions {
  background: #f8f9fa;
  border: 1px solid #dee2e6;
  border-radius: 8px;
  padding: 20px;
  margin-top: 20px;
}

.instructions-list {
  margin-top: 15px;
}

.instruction-step {
  margin-bottom: 20px;
  padding-bottom: 15px;
  border-bottom: 1px solid #dee2e6;
}

.instruction-step:last-child {
  border-bottom: none;
}

.instruction-step code {
  background: #f1f3f4;
  padding: 2px 6px;
  border-radius: 3px;
  font-family: monospace;
  font-size: 0.9em;
}

.form-group {
  margin-bottom: 20px;
}

.form-group label {
  display: block;
  margin-bottom: 5px;
  font-weight: 500;
}

.form-group input {
  width: 100%;
  padding: 10px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 16px;
}

.form-group input:disabled {
  background-color: #f8f9fa;
  color: #6c757d;
}

.form-help {
  display: block;
  margin-top: 5px;
  font-size: 0.875em;
  color: #6c757d;
}

.checkbox-label {
  display: flex;
  align-items: center;
  cursor: pointer;
}

.checkbox-label input {
  width: auto;
  margin-right: 8px;
}

.btn {
  padding: 12px 24px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 16px;
  font-weight: 500;
  text-decoration: none;
  display: inline-block;
  transition: background-color 0.2s;
}

.btn-primary {
  background-color: #007bff;
  color: white;
}

.btn-primary:hover:not(:disabled) {
  background-color: #0056b3;
}

.btn-secondary {
  background-color: #6c757d;
  color: white;
}

.btn-secondary:hover {
  background-color: #545b62;
}

.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
`;

export default SalesforceConfig;