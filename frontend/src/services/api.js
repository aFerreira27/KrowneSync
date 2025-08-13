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

    // Add timeout to requests
    const timeoutMs = options.timeout || 60000; // 60 second default timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, { 
        ...defaultOptions, 
        ...options, 
        signal: controller.signal 
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Request failed' }));
        throw new Error(error.error || error.message || 'Request failed');
      }

      return response.json();
    } catch (error) {
      clearTimeout(timeoutId);
      
      if (error.name === 'AbortError') {
        throw new Error(`Request timeout after ${timeoutMs}ms`);
      }
      
      // Enhance error message for common connection issues
      if (error.message === 'Failed to fetch') {
        throw new Error('Server connection failed - please check if the backend server is running');
      }
      
      throw error;
    }
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

    // Get available SKUs from CSV
  async getProductSKUs() {
    return this.request('/products/skus');
  }


  // Get product by SKU (from Pimly/Salesforce)
  async getProductBySKU(sku) {
    return this.request(`/pimly/products/${encodeURIComponent(sku)}`);
  }

  // Krowne Product Scraping
  async scrapeKrowneProduct(sku) {
    if (!sku) {
        throw new Error('SKU is required to scrape Krowne product.');
    }

    return this.request(`/krowne/scrape-product/${encodeURIComponent(sku)}`);
}

  // Product Comparison
  async compareProducts(data) {
    let requestData = {};
    
    if (typeof data === 'string') {
      requestData = { sku: data };
    } else if (Array.isArray(data)) {
      requestData = { skus: data };
    } else if (data && typeof data === 'object') {
      requestData = data;
    } else {
      throw new Error('Invalid data format for comparison');
    }

    console.log('🔍 Sending comparison request:', requestData);

    try {
      const response = await this.request('/compare', {
        method: 'POST',
        body: JSON.stringify(requestData),
      });

      console.log('✅ Comparison response received:', {
        total: response.total,
        success: response.success,
        resultsPreview: response.results?.slice(0, 3)
      });

      if (response.results) {
        response.results = response.results.map(result => this.validateAndEnhanceResult(result));
      }

      return response;
    } catch (error) {
      console.error('❌ Comparison request failed:', error);
      throw error;
    }
  }

  // Validate and enhance individual comparison result
  validateAndEnhanceResult(result) {
    const enhanced = { ...result };

    if (!enhanced.comparison) {
      enhanced.comparison = {
        mismatches: [],
        matches: [],
        partial_data: [],
        total_fields_compared: 0,
        mismatch_count: 0,
        match_count: 0,
        partial_data_count: 0
      };
    }

    const comp = enhanced.comparison;
    if (comp.mismatch_count === undefined && comp.mismatches) {
      comp.mismatch_count = comp.mismatches.length;
    }
    if (comp.match_count === undefined && comp.matches) {
      comp.match_count = comp.matches.length;
    }
    if (comp.partial_data_count === undefined && comp.partial_data) {
      comp.partial_data_count = comp.partial_data.length;
    }

    return enhanced;
  }

  async compareSingleProduct(sku) {
    if (!sku) {
        throw new Error('SKU is required for comparison.');
    }

    console.log(`🔍 Comparing single product: ${sku}`);
    
    try {
        // Use the correct endpoint
        const response = await this.request(`/products/compare/${encodeURIComponent(sku)}`);
        return response;
    } catch (error) {
        console.error(`❌ Single product comparison failed for ${sku}:`, error.message);
        throw error;
    }
  }

  

  // Utility Methods
  formatComparisonResults(apiResponse) {
    if (!apiResponse || !apiResponse.results) {
      console.warn('No results in API response:', apiResponse);
      return [];
    }

    return apiResponse.results.map((result, index) => {
      const comparison = result.comparison || {};
      const mismatches = comparison.mismatches || result.mismatches || [];
      const matches = comparison.matches || [];
      const partialData = comparison.partial_data || [];

      const formattedResult = {
        sku: result.sku,
        productData: {
          sku: result.sku,
          salesforce: result.salesforce,
          krowne: result.krowne,
          comparison: {
            ...comparison,
            mismatches,
            matches,
            partial_data: partialData,
            total_fields_compared: comparison.total_fields_compared || 0,
            mismatch_count: comparison.mismatch_count || mismatches.length,
            match_count: comparison.match_count || matches.length,
            partial_data_count: comparison.partial_data_count || partialData.length
          },
          mismatches: mismatches
        },
        status: result.status || this.determineProductStatus(result),
        timestamp: result.timestamp,
        name: result.name || result.krowne_name || result.salesforce_name,
        price: result.krowne_price || result.salesforce_price,
        description: result.krowne_description || result.salesforce_description,
        image: result.krowne_image,
        url: result.krowne_url
      };

      return formattedResult;
    });
  }

  // Determine product status based on available data
  determineProductStatus(result) {
    const hasSalesforce = result.salesforce && Object.keys(result.salesforce).length > 0;
    const hasKrowne = result.krowne && Object.keys(result.krowne).length > 0;
    
    if (hasSalesforce && hasKrowne) {
      const mismatchCount = result.comparison?.mismatch_count || result.mismatches?.length || 0;
      if (mismatchCount > 0) {
        return 'mismatches_found';
      }
      
      const matchCount = result.comparison?.match_count || 0;
      const partialCount = result.comparison?.partial_data_count || 0;
      
      if (matchCount > 0 || partialCount > 0) {
        return 'data_matches';
      }
      
      return 'found_both';
    } else if (hasSalesforce && !hasKrowne) {
      return 'missing_from_krowne';
    } else if (!hasSalesforce && hasKrowne) {
      return 'missing_from_salesforce';
    } else {
      return 'not_found';
    }
  }
}

// Get sync history for all SKUs
export const getSyncHistory = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/sync/history`, {
      method: 'GET',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Failed to get sync history:', error);
    throw error;
  }
};

const api = new APIService();
export default api;