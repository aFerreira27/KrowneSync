import React, { useState, useEffect } from 'react';
import './App.css';
import ConnectionStatus from './components/ConnectionStatus';
import AuthModal from './components/AuthModal';
import SKUSearch from './components/SKUSearch';
import SyncTable from './components/SyncTable';
import api from './services/api';
import * as krowneApi from './services/krowneApi';

function App() {
  const [salesforceAuth, setSalesforceAuth] = useState({
    authenticated: false,
    userInfo: null
  });
  const [krowneAuth, setKrowneAuth] = useState({
    authenticated: false,
    userInfo: null
  });
  const [showAuthModal, setShowAuthModal] = useState(null); // 'salesforce' or 'krowne'
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
      const sfStatus = await api.getSalesforceStatus();
      if (sfStatus.authenticated) {
        const userInfo = await api.getSalesforceUser();
        setSalesforceAuth({ authenticated: true, userInfo });
      }

      // Check Krowne
      const krowneStatus = await krowneApi.checkAuthStatus();
      if (krowneStatus.authenticated) {
        setKrowneAuth({ authenticated: true, userInfo: krowneStatus.userInfo });
      }
    } catch (err) {
      console.error('Auth check failed:', err);
    }
  };

  const handleSalesforceAuth = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.initiateSalesforceAuth();
      if (response.auth_url) {
        // For OAuth flow, we'll handle the callback differently
        // In a real implementation, this would open in an iframe or popup
        window.location.href = response.auth_url;
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleKrowneAuth = async (credentials) => {
    setLoading(true);
    setError(null);
    try {
      await krowneApi.loginToKrowne(credentials);
      const userInfo = await krowneApi.getKrowneUserInfo();
      setKrowneAuth({ authenticated: true, userInfo });
      setShowAuthModal(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async (service) => {
    try {
      if (service === 'salesforce') {
        await api.salesforceLogout();
        setSalesforceAuth({ authenticated: false, userInfo: null });
      } else if (service === 'krowne') {
        await krowneApi.logoutFromKrowne();
        setKrowneAuth({ authenticated: false, userInfo: null });
      }
    } catch (err) {
      setError(err.message);
    }
  };

  const handleSKUSearch = (sku) => {
    setSearchedSKU(sku);
    setViewMode('search');
  };

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
        onConnect={(service) => setShowAuthModal(service)}
        onDisconnect={handleLogout}
      />

      <main className="main-content">
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
                disabled={!salesforceAuth.authenticated || !krowneAuth.authenticated}
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
      </main>

      {showAuthModal && (
        <AuthModal
          service={showAuthModal}
          onClose={() => setShowAuthModal(null)}
          onAuth={showAuthModal === 'salesforce' ? handleSalesforceAuth : handleKrowneAuth}
          loading={loading}
          error={error}
        />
      )}
    </div>
  );
}

export default App;