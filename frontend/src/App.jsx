import React, { useState, useEffect } from 'react';
import './App.css';
import ConnectionStatus from './components/ConnectionStatus/ConnectionStatus';
import SKUSearch from './components/SKUSearch/SKUSearch';
import Sort from './components/Sort/Sort';
import SyncStatus from './components/SyncStatus/SyncStatus';
import api from './services/api';

function App() {
  const [salesforceAuth, setSalesforceAuth] = useState({
    authenticated: false,
    userInfo: null,
    loading: false,
    error: null
  });

  
  const [viewMode, setViewMode] = useState('search'); // 'search', 'sort', or 'sync'
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

  const handleSKUSearch = (sku) => {
    setSearchedSKU(sku);
    setViewMode('search');
  };

  // Check if both services are connected
  const bothServicesConnected = salesforceAuth.authenticated;

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
        onSalesforceConnect={handleSalesforceConnect}
        onSalesforceDisconnect={handleSalesforceDisconnect}
      />

      <main className="main-content">
        {bothServicesConnected ? (
          <>
            <div className="view-toggle-wrapper">
              <div className="view-button-bar">
                <button 
                  className={`view-button ${viewMode === 'search' ? 'active' : ''}`}
                  onClick={() => setViewMode('search')}
                >
                  Search
                </button>
                <button 
                  className={`view-button ${viewMode === 'sort' ? 'active' : ''}`}
                  onClick={() => setViewMode('sort')}
                >
                  Sort
                </button>
                <button 
                  className={`view-button ${viewMode === 'sync' ? 'active' : ''}`}
                  onClick={() => setViewMode('sync')}
                >
                  Sync
                </button>
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
              />
            ) : viewMode === 'sort' ? (
              <Sort
                salesforceAuth={salesforceAuth}
                onSelectCategory={(category) => {
                  console.log('Selected category:', category);
                  // You can add category-specific logic here
                }}
              />
            ) : (
              <SyncStatus
                salesforceAuth={salesforceAuth}
                onSelectSKU={handleSKUSearch}
              />
            )}
          </>
        ) : (
          <div className="connection-required">
            <div className="connection-status-card">
              <h2>Please connect to Pimly to continue</h2>
              <p>Connection to Salesforce is required to synchronize product data.</p>
              
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
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;