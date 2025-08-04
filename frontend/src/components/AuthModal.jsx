import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import api from '../services/api';

const AuthModal = ({ salesforceAuth = {}, onClose, onLogout, onConfigSave, loading }) => {
  const location = useLocation();

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

  useEffect(() => {
    checkServerConfiguration();

    const urlParams = new URLSearchParams(location.search);
    if (urlParams.get('auth') === 'success') {
      setError(null);
      window.history.replaceState({}, document.title, window.location.pathname);
    } else if (urlParams.get('error')) {
      const errorMsg = urlParams.get('error_description') || urlParams.get('message') || urlParams.get('error');
      setError(`Authentication failed: ${errorMsg}`);
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, [location.search]);

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
    } finally {
      setCheckingConfig(false);
    }
  };

  const handleOAuthLogin = async () => {
    if (!envConfig.configured) {
      setError('Server configuration is incomplete. Please check your .env file.');
      return;
    }

    try {
      setIsAuthenticating(true);
      setError(null);

      const response = await api.initiateSalesforceAuth();
      if (response.auth_url) {
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
      if (onLogout) onLogout();
    } catch (err) {
      setError('Logout failed: ' + err.message);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>×</button>
        <h2>Connect to Pimly (Salesforce)</h2>

        {checkingConfig ? (
          <p>Checking server configuration...</p>
        ) : salesforceAuth.authenticated ? (
          <div className="auth-success">
            <p>✅ Connected to Salesforce</p>
            <p><strong>User:</strong> {salesforceAuth.userInfo?.name || 'Unknown'}</p>
            <p><strong>Email:</strong> {salesforceAuth.userInfo?.email || 'Unknown'}</p>
            <p><strong>Org:</strong> {salesforceAuth.userInfo?.organization_id || 'Unknown'}</p>
            <button onClick={handleLogout} disabled={loading} className="auth-btn secondary">
              {loading ? 'Disconnecting...' : 'Disconnect'}
            </button>
          </div>
        ) : (
          <div className="oauth-content">
            {error && <div className="modal-error">{error}</div>}

            <p>You'll be redirected to Salesforce to authorize KrowneSync to access your Pimly data.</p>

            <div className="oauth-benefits">
              <h4>Secure OAuth Authentication</h4>
              <ul>
                <li>✓ No passwords stored</li>
                <li>✓ Secure token-based access</li>
                <li>✓ Access to Pimly product data</li>
                <li>✓ Easy to revoke</li>
              </ul>
            </div>

            <button 
              className="auth-btn primary"
              onClick={handleOAuthLogin}
              disabled={isAuthenticating || loading}
            >
              {isAuthenticating ? 'Redirecting...' : 'Connect with Salesforce'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default AuthModal;
