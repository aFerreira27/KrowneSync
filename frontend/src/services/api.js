// Updated API service with proper OAuth support

const api = {
  // Existing methods
  uploadCSV: async (file) => {
    const formData = new FormData();
    formData.append('file', file);
    
    const response = await fetch('/api/upload-csv', {
      method: 'POST',
      body: formData,
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Upload failed');
    }
    
    return response.json();
  },

  getSalesforceConfig: async () => {
    const response = await fetch('/api/salesforce/config');
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Config check failed');
    }
    
    return response.json();
  },

  compareProducts: async (data) => {
    const response = await fetch('/api/compare', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Comparison failed');
    }
    
    return response.json();
  },

  exportResults: async (results) => {
    const response = await fetch('/api/export-results', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ results }),
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Export failed');
    }
    
    return response.json();
  },

  // OAuth-specific methods
  getSalesforceStatus: async () => {
    const response = await fetch('/api/salesforce/status');
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Status check failed');
    }
    
    return response.json();
  },

  // FIXED: Updated to use the correct endpoint
  initiateSalesforceAuth: async (config = {}) => {
    const response = await fetch('/api/auth/salesforce/initiate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(config),
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Authentication initiation failed');
    }
    
    return response.json();
  },

  salesforceLogout: async () => {
    const response = await fetch('/api/salesforce/logout', {
      method: 'POST',
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Logout failed');
    }
    
    return response.json();
  },

  getSalesforceProducts: async (options = {}) => {
    const params = new URLSearchParams();
    if (options.limit) params.append('limit', options.limit);
    if (options.family) params.append('family', options.family);
    if (options.active_only !== undefined) params.append('active_only', options.active_only);
    
    const response = await fetch(`/api/salesforce/products?${params}`);
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to get products');
    }
    
    return response.json();
  },

  getSalesforceUser: async () => {
    const response = await fetch('/api/salesforce/user');
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to get user info');
    }
    
    return response.json();
  },

  // Utility method for health check
  healthCheck: async () => {
    const response = await fetch('/api/health');
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Health check failed');
    }
    
    return response.json();
  },

  // Legacy method for backward compatibility (deprecated)
  testSalesforceConnection: async (config) => {
    // This method is deprecated with OAuth, but kept for compatibility
    console.warn('testSalesforceConnection is deprecated. Use OAuth flow instead.');
    throw new Error('Please use OAuth authentication instead of username/password');
  }
};

export default api;