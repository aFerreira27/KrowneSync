// Main API index - combines CSV and Salesforce APIs
// api/index.js

import csvApi from './csvApi.js';
import salesforceApi from './salesforceApi.js';

// Utility API methods that work across both services
const utilityApi = {
  // General health check
  healthCheck: async () => {
    const response = await fetch('/api/health');
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Health check failed');
    }
    
    return response.json();
  },

  // Combined system status
  getSystemStatus: async () => {
    try {
      const [health, salesforceHealth] = await Promise.all([
        utilityApi.healthCheck(),
        salesforceApi.healthCheck()
      ]);
      
      return {
        overall: 'healthy',
        services: {
          api: health,
          salesforce: salesforceHealth,
          csv: { available: true, healthy: true }
        },
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        overall: 'unhealthy',
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  },

  // Error reporting and logging
  reportError: async (error, context = {}) => {
    try {
      const errorReport = {
        message: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString(),
        context: context,
        userAgent: navigator.userAgent,
        url: window.location.href
      };
      
      // Log locally
      console.error('API Error Report:', errorReport);
      
      // You could send to an error tracking service here
      // await fetch('/api/errors', { method: 'POST', body: JSON.stringify(errorReport) });
      
      return errorReport;
    } catch (reportingError) {
      console.error('Failed to report error:', reportingError);
    }
  }
};

// Main API object that combines all services
const api = {
  // CSV operations
  csv: csvApi,
  
  // Salesforce operations
  salesforce: salesforceApi,
  
  // Utility operations
  utils: utilityApi,
  
  // Legacy methods for backward compatibility
  // (These delegate to the appropriate service)
  
  uploadCSV: csvApi.uploadCSV,
  compareProducts: csvApi.compareProducts,
  exportResults: csvApi.exportResults,
  
  getSalesforceStatus: salesforceApi.getSalesforceStatus,
  initiateSalesforceAuth: salesforceApi.initiateSalesforceAuth,
  salesforceLogout: salesforceApi.salesforceLogout,
  getSalesforceProducts: salesforceApi.getSalesforceProducts,
  getSalesforceUser: salesforceApi.getSalesforceUser,
  getSalesforceConfig: salesforceApi.getSalesforceConfig,
  
  healthCheck: utilityApi.healthCheck,

  // Enhanced methods that combine both services
  
  // Test connection to both systems
  testConnections: async () => {
    try {
      const [health, csvConfig, sfStatus] = await Promise.all([
        utilityApi.healthCheck(),
        csvApi.getCSVConfigOptions().catch(() => ({ available: false })),
        salesforceApi.getAuthStatus().catch(() => ({ isAuthenticated: false }))
      ]);
      
      return {
        api: health.status === 'healthy',
        csv: csvConfig.available !== false,
        salesforce: sfStatus.isAuthenticated,
        overall: health.status === 'healthy' && 
                  csvConfig.available !== false && 
                  sfStatus.isAuthenticated
      };
    } catch (error) {
      return {
        api: false,
        csv: false,
        salesforce: false,
        overall: false,
        error: error.message
      };
    }
  },

  // Initialize the application
  initialize: async () => {
    try {
      // Check system status
      const systemStatus = await api.utils.getSystemStatus();
      
      // Handle OAuth callback if present
      const oauthCallback = salesforceApi.handleOAuthCallback();
      
      // Load CSV configuration
      const csvConfig = await csvApi.getCSVConfigOptions().catch(() => null);
      
      return {
        systemStatus,
        oauthCallback,
        csvConfig,
        initialized: true,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        initialized: false,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }
};

export default api;

// Also export individual services for direct access
export { csvApi, salesforceApi, utilityApi };