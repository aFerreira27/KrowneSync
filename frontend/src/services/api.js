// src/services/api.js
const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

class APIService {
  async request(endpoint, options = {}) {
    const url = `${API_BASE_URL}${endpoint}`;
    
    const defaultOptions = {
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include', // Important for Flask session cookies
    };

    const response = await fetch(url, { ...defaultOptions, ...options });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Request failed' }));
      throw new Error(error.error || error.message || 'Request failed');
    }

    return response.json();
  }

  // Salesforce OAuth Authentication
  async getSalesforceStatus() {
    return this.request('/salesforce/status');
  }

  async getSalesforceUser() {
    return this.request('/salesforce/user');
  }

  async initiateSalesforceAuth(config = {}) {
    return this.request('/auth/salesforce/initiate', {
      method: 'POST',
      body: JSON.stringify(config),
    });
  }

  async salesforceLogout() {
    return this.request('/salesforce/logout', {
      method: 'POST',
    });
  }

  async getSalesforceConfig() {
    return this.request('/salesforce/config');
  }

  // Pimly Operations (via Salesforce)
  async getPimlyStatus() {
    return this.request('/pimly/status');
  }

  async getPimlyProducts(options = {}) {
    const params = new URLSearchParams(options);
    return this.request(`/pimly/products?${params}`);
  }

  async searchPimlyProducts(searchTerm, limit = 20) {
    return this.request('/pimly/search', {
      method: 'POST',
      body: JSON.stringify({ search: searchTerm, limit }),
    });
  }

  async getPimlyCategories() {
    return this.request('/pimly/categories');
  }

  // Get product by SKU (from Pimly)
  async getProductBySKU(sku) {
    // Search for the product in Pimly
    const searchResults = await this.searchPimlyProducts(sku, 1);
    if (searchResults.products && searchResults.products.length > 0) {
      return searchResults.products[0];
    }
    throw new Error('Product not found');
  }

  // Product Comparison
  async compareProducts(options = {}) {
    // Default to Pimly as source
    const requestData = {
      source_type: 'pimly',
      limit: 1000,
      ...options
    };
    return this.request('/compare', {
      method: 'POST',
      body: JSON.stringify(requestData),
    });
  }

  async getCompareProgress(identifier) {
    return this.request(`/compare-progress/${identifier || 'pimly'}`);
  }

  // Sync Operations
  async syncPimlyData(options = {}) {
    return this.request('/pimly-sync', {
      method: 'POST',
      body: JSON.stringify(options),
    });
  }

  async syncProduct(sku, mismatches) {
    // This endpoint might need to be implemented in your backend
    return this.request('/pimly/sync-product', {
      method: 'POST',
      body: JSON.stringify({ sku, mismatches }),
    });
  }

  // Export Results
  async exportResults(results) {
    return this.request('/export-results', {
      method: 'POST',
      body: JSON.stringify({ results }),
    });
  }

  // Legacy Salesforce Products (if needed)
  async getSalesforceProducts(options = {}) {
    const params = new URLSearchParams(options);
    return this.request(`/salesforce/products?${params}`);
  }

  // Health Check
  async healthCheck() {
    return this.request('/health');
  }
}

const api = new APIService();
export default api;