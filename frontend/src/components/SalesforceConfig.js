import React, { useState, useEffect } from 'react';
import api from '../services/api';

const SalesforceConfig = ({ salesforceAuth, onConfigSave, onLogout, loading }) => {
  const [error, setError] = useState(null);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [envConfig, setEnvConfig] = useState({
    configured: false,
    client_id_configured: false,
    client_secret_configured: false,
    redirect_uri: '',
    sandbox: false
  });
  const [checkingConfig, setCheckingConfig] = useState(true);

  // Check server configuration on component mount
  useEffect(() => {
    checkServerConfiguration();
    
    // Handle OAuth callback if present in URL
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('auth') === 'success') {
      setError(null);
      setIsAuthenticating(false);
      // Clean up URL
      window.history.replaceState({}, document.title, window.location.pathname);
    } else if (urlParams.get('error')) {
      const errorMsg = urlParams.get('error_description') || urlParams.get('message') || urlParams.get('error');
      setError(`Authentication failed: ${errorMsg}`);
      setIsAuthenticating(false);
      // Clean up URL
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  const checkServerConfiguration = async () => {
    try {
      setCheckingConfig(true);
      const response = await api.getSalesforceConfig();
      setEnvConfig({
        configured: response.configured,
        client_id_configured: response.client_id_configured,
        client_secret_configured: response.client_secret_configured,
        redirect_uri: response.redirect_uri,
        sandbox: response.sandbox
      });
    } catch (err) {
      console.error('Error checking server config:', err);
      setError('Failed to check server configuration');
      setEnvConfig({
        configured: false,
        client_id_configured: false,
        client_secret_configured: false,
        redirect_uri: '',
        sandbox: false
      });
    } finally {
      setCheckingConfig(false);
    }
  };

  const handleOAuthLogin = async (e) => {
    e.preventDefault();
    
    if (!envConfig.configured) {
      setError('Server configuration is incomplete. Please check your .env file.');
      return;
    }

    try {
      setIsAuthenticating(true);
      setError(null);

      const response = await api.initiateSalesforceAuth();

      if (response.auth_url) {
        // Redirect to Salesforce for authorization
        window.location.href = response.auth_url;
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
      await api.salesforceLogout();
      
      // Notify parent component
      if (onLogout) {
        onLogout();
      }
    } catch (err) {
      setError('Logout failed: ' + err.message);
    }
  };

  if (checkingConfig) {
    return (
      <div className="salesforce-config loading">
        <div className="loading-spinner"></div>
        <p>Checking server configuration...</p>
      </div>
    );
  }

  return (
    <div className="salesforce-config">
      {salesforceAuth.authenticated ? (
        // Authenticated State
        <div className="auth-success">
          <h2>✅ Salesforce Connected</h2>
          <div className="user-info">
            <h3>Connection Details</h3>
            <div className="info-grid">
              <div className="info-item">
                <strong>User:</strong> {salesforceAuth.userInfo?.display_name || salesforceAuth.userInfo?.name || 'Unknown'}
              </div>
              <div className="info-item">
                <strong>Email:</strong> {salesforceAuth.userInfo?.email || 'Unknown'}
              </div>
              <div className="info-item">
                <strong>Organization:</strong> {salesforceAuth.userInfo?.organization_id || 'Unknown'}
              </div>
              <div className="info-item">
                <strong>Instance:</strong> {salesforceAuth.instanceUrl || 'Unknown'}
              </div>
            </div>
          </div>
          
          <div className="form-actions">
            <button 
              type="button" 
              className="btn btn-secondary"
              onClick={handleLogout}
              disabled={loading}
            >
              {loading ? 'Disconnecting...' : 'Disconnect from Salesforce'}
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

          {/* Server Configuration Status */}
          <div className="config-status">
            <h3>🔧 Server Configuration Status</h3>
            <div className="status-grid">
              <div className={`status-item ${envConfig.client_id_configured ? 'configured' : 'missing'}`}>
                <span className="status-icon">{envConfig.client_id_configured ? '✅' : '❌'}</span>
                <span>Client ID (SALESFORCE_CLIENT_ID)</span>
              </div>
              <div className={`status-item ${envConfig.client_secret_configured ? 'configured' : 'missing'}`}>
                <span className="status-icon">{envConfig.client_secret_configured ? '✅' : '❌'}</span>
                <span>Client Secret (SALESFORCE_CLIENT_SECRET)</span>
              </div>
              <div className="status-item configured">
                <span className="status-icon">✅</span>
                <span>Redirect URI: {envConfig.redirect_uri}</span>
              </div>
              <div className="status-item configured">
                <span className="status-icon">🌍</span>
                <span>Environment: {envConfig.sandbox ? 'Sandbox' : 'Production'}</span>
              </div>
            </div>
          </div>

          {envConfig.configured ? (
            // Ready to authenticate
            <div className="ready-to-auth">
              <div className="form-actions">
                <button 
                  type="button" 
                  className="btn btn-primary btn-large"
                  onClick={handleOAuthLogin}
                  disabled={isAuthenticating || loading}
                >
                  {isAuthenticating ? 'Redirecting to Salesforce...' : 'Connect with Salesforce'}
                </button>
              </div>
            </div>
          ) : (
            // Configuration missing
            <div className="config-missing">
              <div className="warning-box">
                <h4>⚠️ Configuration Required</h4>
                <p>Some required environment variables are missing. Please check your server configuration.</p>
                
                <div className="missing-vars">
                  <h5>Missing Variables:</h5>
                  <ul>
                    {!envConfig.client_id_configured && <li><code>SALESFORCE_CLIENT_ID</code></li>}
                    {!envConfig.client_secret_configured && <li><code>SALESFORCE_CLIENT_SECRET</code></li>}
                  </ul>
                </div>

                <button 
                  type="button" 
                  className="btn btn-secondary"
                  onClick={checkServerConfiguration}
                  disabled={loading}
                >
                  {loading ? 'Checking...' : 'Recheck Configuration'}
                </button>
              </div>
            </div>
          )}

          <div className="oauth-benefits">
            <h3>🔒 OAuth Benefits</h3>
            <ul>
              <li>✅ No passwords stored in the application</li>
              <li>✅ Secure token-based authentication</li>
              <li>✅ Granular permission control</li>
              <li>✅ Easy to revoke access</li>
              <li>✅ Industry standard security</li>
            </ul>
          </div>

          <div className="setup-instructions">
            <h3>📋 Setup Instructions for Administrator</h3>
            <div className="instructions-list">
              <div className="instruction-step">
                <strong>1. Create a Connected App in Salesforce:</strong>
                <p>Setup → Platform Tools → Apps → App Manager → New Connected App</p>
              </div>
              <div className="instruction-step">
                <strong>2. Configure OAuth Settings:</strong>
                <ul>
                  <li>Enable OAuth Settings: ✓</li>
                  <li>Callback URL: <code>{envConfig.redirect_uri || `${window.location.origin}/api/auth/callback/salesforce`}</code></li>
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
                  <li>Require Secret for Web Server Flow: ✓</li>
                  <li>IP Relaxation: "Relax IP restrictions" (for development)</li>
                </ul>
              </div>
              <div className="instruction-step">
                <strong>4. Add to Server .env File:</strong>
                <div className="env-example">
                  <code>
                    SALESFORCE_CLIENT_ID=your_consumer_key_here<br/>
                    SALESFORCE_CLIENT_SECRET=your_consumer_secret_here<br/>
                    SALESFORCE_REDIRECT_URI={envConfig.redirect_uri || `${window.location.origin}/api/auth/callback/salesforce`}<br/>
                    SALESFORCE_SANDBOX={envConfig.sandbox ? 'true' : 'false'}
                  </code>
                </div>
              </div>
              <div className="instruction-step">
                <strong>5. Restart the Backend Server</strong>
                <p>After updating the .env file, restart the Flask backend for changes to take effect.</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SalesforceConfig;