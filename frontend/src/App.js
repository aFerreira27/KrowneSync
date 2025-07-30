import React, { useState } from 'react';
import './App.css';
import Dashboard from './components/Dashboard';
import FileUpload from './components/FileUpload';
import SalesforceConfig from './components/SalesforceConfig';
import ComparisonResults from './components/ComparisonResults';
import { api } from './services/api';

function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [uploadedFile, setUploadedFile] = useState(null);
  const [salesforceConfig, setSalesforceConfig] = useState(null);
  const [comparisonResults, setComparisonResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

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

  const handleSalesforceConfig = async (config) => {
    setLoading(true);
    setError(null);
    
    try {
      const result = await api.testSalesforceConnection(config);
      setSalesforceConfig({
        ...config,
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

  const handleStartComparison = async (sourceType) => {
    setLoading(true);
    setError(null);
    
    try {
      let comparisonData = { source_type: sourceType };
      
      if (sourceType === 'csv' && uploadedFile) {
        comparisonData.filename = uploadedFile.filename;
      } else if (sourceType === 'salesforce' && salesforceConfig) {
        comparisonData.salesforce_config = {
          client_id: salesforceConfig.client_id,
          client_secret: salesforceConfig.client_secret,
          username: salesforceConfig.username,
          password: salesforceConfig.password,
          security_token: salesforceConfig.security_token
        };
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
            Salesforce
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
              salesforceConfig={salesforceConfig}
              onStartComparison={handleStartComparison}
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
              onConfigSave={handleSalesforceConfig}
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