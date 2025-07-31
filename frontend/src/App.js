import React, { useState, useEffect } from 'react';
import './App.css';
import Dashboard from './components/Dashboard';
import FileUpload from './components/FileUpload';
import SalesforceConfig from './components/SalesforceConfig';
import ComparisonResults from './components/ComparisonResults';
import { api } from './services/api';

function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [uploadedFile, setUploadedFile] = useState(null);
  const [salesforceAuth, setSalesforceAuth] = useState({
    authenticated: false,
    userInfo: null,
    instanceUrl: null
  });
  const [comparisonResults, setComparisonResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Check for URL parameters on app load (OAuth callback handling)
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const authStatus = urlParams.get('auth');
    const errorParam = urlParams.get('error');
    
    if (authStatus === 'success') {
      setError(null);
      // Auth status will be checked by SalesforceConfig component
    } else if (errorParam) {
      const errorMsg = urlParams.get('error_description') || urlParams.get('message') || errorParam;
      setError(`Authentication failed: ${errorMsg}`);
    }
  }, []);

  const handleFileUpload = async (file) => {
    setLoading(true);
    setError(null);
    
    try {
      const result = await api.uploadCSV(file);
      setUploadedFile({
        filename: result.filename,
        products_count: result.products_count,
        preview: result.products
      });
      setActiveTab('dashboard');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSalesforceAuth = (authData) => {
    setSalesforceAuth(authData);
    if (authData.authenticated) {
      setActiveTab('dashboard');
    }
  };

  const handleStartComparison = async (sourceType) => {
    setLoading(true);
    setError(null);
    
    try {
      let comparisonData = { source_type: sourceType };
      
      if (sourceType === 'csv' && uploadedFile) {
        comparisonData.filename = uploadedFile.filename;
      } else if (sourceType === 'salesforce' && salesforceAuth.authenticated) {
        // No need to pass credentials with OAuth - they're in the session
      } else {
        throw new Error(`No ${sourceType} data configured`);
      }
      
      const result = await api.compareProducts(comparisonData);
      setComparisonResults(result);
      setActiveTab('results');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSalesforceSync = async (includePricing = false) => {
    setLoading(true);
    setError(null);
    
    try {
      const result = await api.salesforceSync({ include_pricing: includePricing });
      
      // Update salesforce auth with preview data
      setSalesforceAuth(prev => ({
        ...prev,
        products_count: result.products_count || result.total_products,
        preview: result.products
      }));
      
      return result;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const handleExportResults = async () => {
    if (!comparisonResults) return;
    
    try {
      const exportData = await api.exportResults(comparisonResults.results);
      
      // Create and download CSV file
      const blob = new Blob([exportData.csv_data], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = exportData.filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="App">
      <header className="app-header">
        <div className="container">
          <h1>KrowneSync</h1>
          <p>Product Data Synchronization Tool</p>
          {salesforceAuth.authenticated && (
            <div className="auth-indicator">
              ✅ Connected to Salesforce as {salesforceAuth.userInfo?.name}
            </div>
          )}
        </div>
      </header>

      <nav className="nav-tabs">
        <div className="container">
          <button 
            className={`tab-button ${activeTab === 'dashboard' ? 'active' : ''}`}
            onClick={() => setActiveTab('dashboard')}
          >
            Dashboard
          </button>
          <button 
            className={`tab-button ${activeTab === 'upload' ? 'active' : ''}`}
            onClick={() => setActiveTab('upload')}
          >
            CSV Upload
          </button>
          <button 
            className={`tab-button ${activeTab === 'salesforce' ? 'active' : ''}`}
            onClick={() => setActiveTab('salesforce')}
          >
            Salesforce {salesforceAuth.authenticated ? '✅' : ''}
          </button>
          <button 
            className={`tab-button ${activeTab === 'results' ? 'active' : ''}`}
            onClick={() => setActiveTab('results')}
            disabled={!comparisonResults}
          >
            Results
          </button>
        </div>
      </nav>

      <main className="main-content">
        <div className="container">
          {error && (
            <div className="error-message">
              <strong>Error:</strong> {error}
              <button onClick={() => setError(null)} className="close-button">×</button>
            </div>
          )}

          {loading && (
            <div className="loading-overlay">
              <div className="loading-spinner"></div>
              <p>Processing...</p>
            </div>
          )}

          {activeTab === 'dashboard' && (
            <Dashboard
              uploadedFile={uploadedFile}
              salesforceAuth={salesforceAuth}
              onStartComparison={handleStartComparison}
              onSalesforceSync={handleSalesforceSync}
              loading={loading}
            />
          )}

          {activeTab === 'upload' && (
            <FileUpload
              onFileUpload={handleFileUpload}
              loading={loading}
            />
          )}

          {activeTab === 'salesforce' && (
            <SalesforceConfig
              onConfigSave={handleSalesforceAuth}
              loading={loading}
            />
          )}

          {activeTab === 'results' && comparisonResults && (
            <ComparisonResults
              results={comparisonResults}
              onExport={handleExportResults}
            />
          )}
        </div>
      </main>

      <footer className="app-footer">
        <div className="container">
          <p>&copy; 2025 KrowneSync - Product Data Synchronization Tool</p>
        </div>
      </footer>
    </div>
  );
}

export default App;