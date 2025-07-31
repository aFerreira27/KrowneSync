// Salesforce-specific API service
// salesforceApi.js

const salesforceApi = {
  // Configuration and Status
  
  getSalesforceConfig: async () => {
    const response = await fetch('/api/salesforce/config');
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Config check failed');
    }
    
    return response.json();
  },

  getSalesforceStatus: async () => {
    const response = await fetch('/api/salesforce/status');
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Status check failed');
    }
    
    return response.json();
  },

  // Authentication Flow (OAuth with PKCE)
  
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

  // Logout and revoke tokens
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

  // Data Operations
  
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

  // Sync operations
  salesforceSync: async (options = {}) => {
    const response = await fetch('/api/salesforce-sync', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(options),
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Salesforce sync failed');
    }
    
    return response.json();
  },

  // Utility Methods

  // Check if user is authenticated
  isAuthenticated: async () => {
    try {
      const status = await salesforceApi.getSalesforceStatus();
      return status.authenticated || false;
    } catch (error) {
      return false;
    }
  },

  // Get authentication status with user info
  getAuthStatus: async () => {
    try {
      const status = await salesforceApi.getSalesforceStatus();
      return {
        isAuthenticated: status.authenticated || false,
        userInfo: status.user_info || null,
        instanceUrl: status.instance_url || null,
        error: null
      };
    } catch (error) {
      return {
        isAuthenticated: false,
        userInfo: null,
        instanceUrl: null,
        error: error.message
      };
    }
  },

  // Handle OAuth flow initiation
  startOAuthFlow: async (redirectToAuth = true) => {
    try {
      const authData = await salesforceApi.initiateSalesforceAuth();
      
      if (redirectToAuth && authData.auth_url) {
        // Redirect to Salesforce OAuth page
        window.location.href = authData.auth_url;
        return authData;
      }
      
      return authData;
    } catch (error) {
      throw new Error(`OAuth initiation failed: ${error.message}`);
    }
  },

  // Handle authentication state changes
  onAuthStateChange: (callback) => {
    // Poll for authentication status changes
    let lastAuthState = null;
    
    const checkAuthState = async () => {
      try {
        const authStatus = await salesforceApi.getAuthStatus();
        
        // Only call callback if state has changed
        if (JSON.stringify(authStatus) !== JSON.stringify(lastAuthState)) {
          lastAuthState = authStatus;
          callback(authStatus);
        }
      } catch (error) {
        console.error('Auth state check failed:', error);
      }
    };
    
    // Initial check
    checkAuthState();
    
    // Set up polling
    const interval = setInterval(checkAuthState, 5000); // Check every 5 seconds
    
    // Return cleanup function
    return () => clearInterval(interval);
  },

  // Batch operations for products
  getBatchProducts: async (batchSize = 100) => {
    let allProducts = [];
    let offset = 0;
    let hasMore = true;
    
    while (hasMore) {
      try {
        const response = await salesforceApi.getSalesforceProducts({
          limit: batchSize,
          offset: offset
        });
        
        const products = response.products || [];
        allProducts = allProducts.concat(products);
        
        // Check if there are more products
        hasMore = products.length === batchSize;
        offset += batchSize;
        
        // Prevent infinite loops
        if (allProducts.length > 10000) {
          console.warn('Retrieved maximum products (10,000). Stopping batch operation.');
          break;
        }
        
      } catch (error) {
        console.error(`Batch operation failed at offset ${offset}:`, error);
        break;
      }
    }
    
    return {
      products: allProducts,
      total: allProducts.length,
      batches: Math.ceil(offset / batchSize)
    };
  },

  // Check connection health
  healthCheck: async () => {
    try {
      const [config, status] = await Promise.all([
        salesforceApi.getSalesforceConfig(),
        salesforceApi.getSalesforceStatus()
      ]);
      
      return {
        configured: config.configured,
        authenticated: status.authenticated,
        healthy: config.configured && status.authenticated,
        config: config,
        status: status
      };
    } catch (error) {
      return {
        configured: false,
        authenticated: false,
        healthy: false,
        error: error.message
      };
    }
  },

  // Enhanced error handling wrapper
  withErrorHandling: (apiMethod) => {
    return async (...args) => {
      try {
        return await apiMethod(...args);
      } catch (error) {
        // Enhanced error information
        const enhancedError = {
          message: error.message,
          timestamp: new Date().toISOString(),
          method: apiMethod.name,
          args: args.length,
          type: 'SALESFORCE_API_ERROR'
        };
        
        // Check for authentication errors
        if (error.message.includes('Not authenticated') || 
            error.message.includes('401') ||
            error.message.includes('Unauthorized')) {
          enhancedError.type = 'AUTHENTICATION_ERROR';
          enhancedError.action = 'REDIRECT_TO_LOGIN';
        }
        
        // Check for configuration errors
        if (error.message.includes('not configured') ||
            error.message.includes('CLIENT_ID') ||
            error.message.includes('CLIENT_SECRET')) {
          enhancedError.type = 'CONFIGURATION_ERROR';
          enhancedError.action = 'CHECK_ENVIRONMENT_VARIABLES';
        }
        
        // Log to console for debugging
        console.error('Salesforce API Error:', enhancedError);
        
        // Re-throw with enhanced info
        const newError = new Error(error.message);
        newError.details = enhancedError;
        throw newError;
      }
    };
  },

  // Handle URL parameters (for OAuth callback handling)
  handleOAuthCallback: () => {
    const urlParams = new URLSearchParams(window.location.search);
    const error = urlParams.get('error');
    const errorDescription = urlParams.get('error_description');
    const authSuccess = urlParams.get('auth');
    
    if (error) {
      return {
        success: false,
        error: error,
        errorDescription: errorDescription || 'Unknown OAuth error'
      };
    }
    
    if (authSuccess === 'success') {
      // Clean up URL parameters
      const cleanUrl = window.location.origin + window.location.pathname;
      window.history.replaceState({}, document.title, cleanUrl);
      
      return {
        success: true,
        message: 'Authentication successful'
      };
    }
    
    return null; // No OAuth callback detected
  }
};

// Export with error handling wrappers for critical methods
const salesforceApiWithErrorHandling = {
  ...salesforceApi,
  
  // Wrap critical methods with enhanced error handling
  initiateSalesforceAuth: salesforceApi.withErrorHandling(salesforceApi.initiateSalesforceAuth),
  getSalesforceProducts: salesforceApi.withErrorHandling(salesforceApi.getSalesforceProducts),
  getSalesforceStatus: salesforceApi.withErrorHandling(salesforceApi.getSalesforceStatus),
  salesforceSync: salesforceApi.withErrorHandling(salesforceApi.salesforceSync),
  startOAuthFlow: salesforceApi.withErrorHandling(salesforceApi.startOAuthFlow)
};

export default salesforceApiWithErrorHandling;