import React, { useState, useEffect } from 'react';
import './App.css';
import ConnectionStatus from './components/ConnectionStatus';
import KrowneLoginModal from './components/KrowneLoginModal';
import SKUSearch from './components/SKUSearch/SKUSearch';
import SyncTable from './components/SyncTable/SyncTable';
import api from './services/api';
import krowneAuthService from './services/krowneAuthService';

function App() {
  const [salesforceAuth, setSalesforceAuth] = useState({
    authenticated: false,
    userInfo: null,
    loading: false,
    error: null
  });
  
  const [krowneAuth, setKrowneAuth] = useState({
    authenticated: false,
    userInfo: null,
    loading: false,
    error: null
  });
  
  const [showKrowneLogin, setShowKrowneLogin] = useState(false);
  const [viewMode, setViewMode] = useState('search'); // 'search' or 'sync'
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [searchedSKU, setSearchedSKU] = useState('');

  // Check authentication status on mount
  useEffect(() => {
    checkAuthStatus();
    
    // Handle OAuth callback parameters
    const urlParams = new URLSearchParams(window.location.search);
    const authStatus = urlParams.get('auth');
    const errorParam = urlParams.get('error');
    
    if (authStatus === 'success') {
      // OAuth successful
      checkAuthStatus();
      // Clean URL
      window.history.replaceState({}, document.title, window.location.pathname);
    } else if (errorParam) {
      const errorMsg = urlParams.get('message') || urlParams.get('error_description') || errorParam;
      setError(`Authentication failed: ${errorMsg}`);
      // Clean URL
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  const checkAuthStatus = async () => {
    try {
      // Check Salesforce
      setSalesforceAuth(prev => ({ ...prev, loading: true }));
      try {
        const sfStatus = await api.getSalesforceStatus();
        if (sfStatus.authenticated) {
          const userInfo = await api.getSalesforceUser();
          setSalesforceAuth({ 
            authenticated: true, 
            userInfo, 
            loading: false, 
            error: null 
          });
        } else {
          setSalesforceAuth({ 
            authenticated: false, 
            userInfo: null, 
            loading: false, 
            error: null 
          });
        }
      } catch (sfError) {
        setSalesforceAuth({ 
          authenticated: false, 
          userInfo: null, 
          loading: false, 
          error: sfError.message 
        });
      }

      // Check Krowne
      setKrowneAuth(prev => ({ ...prev, loading: true }));
      try {
        const krowneStatus = await krowneAuthService.checkAuthStatus();
        if (krowneStatus.authenticated) {
          setKrowneAuth({ 
            authenticated: true, 
            userInfo: krowneStatus.userInfo, 
            loading: false, 
            error: null 
          });
        } else {
          setKrowneAuth({ 
            authenticated: false, 
            userInfo: null, 
            loading: false, 
            error: null 
          });
        }
      } catch (krowneError) {
        setKrowneAuth({ 
          authenticated: false, 
          userInfo: null, 
          loading: false, 
          error: krowneError.message 
        });
      }
    } catch (err) {
      console.error('Auth check failed:', err);
      setError('Failed to check authentication status');
    }
  };

  const handleSalesforceConnect = async () => {
    setSalesforceAuth(prev => ({ ...prev, loading: true, error: null }));
    setError(null);
    
    try {
      const response = await api.initiateSalesforceAuth();
      if (response.auth_url) {
        // Redirect to Salesforce OAuth
        window.location.href = response.auth_url;
      }
    } catch (err) {
      setSalesforceAuth(prev => ({ 
        ...prev, 
        loading: false, 
        error: err.message 
      }));
      setError(`Salesforce connection failed: ${err.message}`);
    }
  };

  const handleSalesforceDisconnect = async () => {
    try {
      await api.salesforceLogout();
      setSalesforceAuth({ 
        authenticated: false, 
        userInfo: null, 
        loading: false, 
        error: null 
      });
    } catch (err) {
      setError(`Salesforce disconnect failed: ${err.message}`);
    }
  };

  const handleKrowneConnect = () => {
    setShowKrowneLogin(true);
  };

  const handleKrowneLogin = async (credentials) => {
    setKrowneAuth(prev => ({ ...prev, loading: true, error: null }));
    
    try {
      const result = await krowneAuthService.login(credentials);
      
      if (result.success) {
        setKrowneAuth({
          authenticated: true,
          userInfo: result.userInfo,
          loading: false,
          error: null
        });
        setShowKrowneLogin(false);
        return { success: true };
      } else {
        setKrowneAuth(prev => ({
          ...prev,
          loading: false,
          error: result.error
        }));
        return { success: false, error: result.error };
      }
    } catch (err) {
      const errorMessage = err.message || 'Login failed';
      setKrowneAuth(prev => ({
        ...prev,
        loading: false,
        error: errorMessage
      }));
      return { success: false, error: errorMessage };
    }
  };

  const handleKrowneDisconnect = async () => {
    try {
      await krowneAuthService.logout();
      setKrowneAuth({ 
        authenticated: false, 
        userInfo: null, 
        loading: false, 
        error: null 
      });
    } catch (err) {
      setError(`Krowne disconnect failed: ${err.message}`);
      // Still clear the auth state
      setKrowneAuth({ 
        authenticated: false, 
        userInfo: null, 
        loading: false, 
        error: null 
      });
    }
  };

  const closeKrowneLogin = () => {
    setShowKrowneLogin(false);
  };

  const handleSKUSearch = (sku) => {
    setSearchedSKU(sku);
    setViewMode('search');
  };

  // Check if both services are connected
  const bothServicesConnected = salesforceAuth.authenticated && krowneAuth.authenticated;

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-content">
          <h1>KrowneSync</h1>
          <p>Product Data Synchronization Tool</p>
        </div>
      </header>

      <ConnectionStatus
        salesforceAuth={salesforceAuth}
        krowneAuth={krowneAuth}
        onSalesforceConnect={handleSalesforceConnect}
        onSalesforceDisconnect={handleSalesforceDisconnect}
        onKrowneConnect={handleKrowneConnect}
        onKrowneDisconnect={handleKrowneDisconnect}
      />

      <main className="main-content">
        {bothServicesConnected ? (
          <>
            <div className="view-toggle-wrapper">
              <div className="view-toggle">
                <label className={viewMode === 'search' ? 'active' : ''}>Search SKU</label>
                <div className="toggle-switch">
                  <input
                    type="checkbox"
                    id="viewModeToggle"
                    checked={viewMode === 'sync'}
                    onChange={() => {
                      const newMode = viewMode === 'search' ? 'sync' : 'search';
                      setViewMode(newMode);
                    }}
                  />
                  <label htmlFor="viewModeToggle"></label>
                </div>
                <label className={viewMode === 'sync' ? 'active' : ''}>Check Sync</label>
              </div>
            </div>

            {error && (
              <div className="error-banner">
                <span>{error}</span>
                <button onClick={() => setError(null)}>×</button>
              </div>
            )}

            {viewMode === 'search' ? (
              <SKUSearch
                onSearch={handleSKUSearch}
                searchedSKU={searchedSKU}
                salesforceAuth={salesforceAuth}
                krowneAuth={krowneAuth}
              />
            ) : (
              <SyncTable
                salesforceAuth={salesforceAuth}
                krowneAuth={krowneAuth}
                onSelectSKU={handleSKUSearch}
              />
            )}
          </>
        ) : (
          <div className="connection-required">
            <div className="connection-status-card">
              <h2>Please connect to both services to continue</h2>
              <p>Both connections are required to synchronize product data.</p>
              
              <div className="connection-checklist">
                <div className={`connection-check ${salesforceAuth.authenticated ? 'connected' : 'disconnected'}`}>
                  <span className="check-icon">
                    {salesforceAuth.authenticated ? '✅' : '❌'}
                  </span>
                  <div className="check-details">
                    <strong>Salesforce/Pimly Connection</strong>
                    <p>
                      {salesforceAuth.authenticated 
                        ? `Connected as ${salesforceAuth.userInfo?.display_name || salesforceAuth.userInfo?.name || 'User'}`
                        : salesforceAuth.loading 
                          ? 'Connecting...'
                          : 'Not connected'
                      }
                    </p>
                    {salesforceAuth.error && (
                      <p className="error-text">Error: {salesforceAuth.error}</p>
                    )}
                  </div>
                </div>
                
                <div className={`connection-check ${krowneAuth.authenticated ? 'connected' : 'disconnected'}`}>
                  <span className="check-icon">
                    {krowneAuth.authenticated ? '✅' : '❌'}
                  </span>
                  <div className="check-details">
                    <strong>Krowne CMS Admin Access</strong>
                    <p>
                      {krowneAuth.authenticated 
                        ? `Connected as ${krowneAuth.userInfo?.username || krowneAuth.userInfo?.email || 'Admin'}`
                        : krowneAuth.loading 
                          ? 'Signing in...'
                          : 'Not connected'
                      }
                    </p>
                    {krowneAuth.error && (
                      <p className="error-text">Error: {krowneAuth.error}</p>
                    )}
                  </div>
                </div>
              </div>

              <div className="connection-actions">
                {!salesforceAuth.authenticated && (
                  <button 
                    className="connect-btn primary"
                    onClick={handleSalesforceConnect}
                    disabled={salesforceAuth.loading}
                  >
                    {salesforceAuth.loading ? 'Connecting...' : 'Connect Salesforce'}
                  </button>
                )}
                
                {!krowneAuth.authenticated && (
                  <button 
                    className="connect-btn primary"
                    onClick={handleKrowneConnect}
                    disabled={krowneAuth.loading}
                  >
                    {krowneAuth.loading ? 'Signing in...' : 'Sign in to Krowne CMS'}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Krowne Login Modal */}
      <KrowneLoginModal
        isOpen={showKrowneLogin}
        onClose={closeKrowneLogin}
        onLogin={handleKrowneLogin}
        loading={krowneAuth.loading}
        error={krowneAuth.error}
      />
    </div>
  );
}

export default App;