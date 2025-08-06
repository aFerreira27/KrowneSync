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

  // Pimly Operations (via Salesforce)
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

  // Get product by SKU (from Pimly/Salesforce)
  async getProductBySKU(sku) {
    return this.request(`/products/${encodeURIComponent(sku)}`);
  }

  // Get available SKUs from CSV
  async getProductSKUs() {
    return this.request('/products/skus');
  }

  // Krowne CMS Authentication
  async getKrowneStatus() {
    return this.request('/auth/krowne/status');
  }

  async krowneLogin(username, password) {
    return this.request('/auth/krowne/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
  }

  async krowneLogout() {
    return this.request('/auth/krowne/logout', {
      method: 'POST',
    });
  }

  async getKrowneProfile() {
    return this.request('/auth/krowne/profile');
  }

  async testKrowneConnection() {
    return this.request('/krowne/test-connection');
  }

  // Krowne Product Scraping
  async scrapeKrowneProduct(sku) {
    if (!sku) {
      throw new Error('SKU is required to scrape Krowne product.');
    }

    return this.request(`/krowne/scrape-product/${encodeURIComponent(sku)}`);
  }

  // Product Comparison - Updated to use ProductMapper backend implementation
  async compareProducts(data) {
    // Handle different input formats to match backend expectations
    let requestData = {};
    
    if (typeof data === 'string') {
      // Single SKU as string
      requestData = { sku: data };
    } else if (Array.isArray(data)) {
      // Array of SKUs
      requestData = { skus: data };
    } else if (data && typeof data === 'object') {
      // Object with sku, skus, or search - pass through as-is
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
        mapper_info: response.mapper_info,
        resultsPreview: response.results?.map(r => ({
          sku: r.sku,
          hasSalesforce: !!r.salesforce,
          hasKrowne: !!r.krowne,
          hasComparison: !!r.comparison,
          comparisonKeys: r.comparison ? Object.keys(r.comparison) : []
        }))
      });

      // Validate and enhance response data
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

    // Ensure comparison object exists and has expected structure
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

    // Fill in missing counts
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

    // Log validation issues for debugging
    if (enhanced.salesforce && enhanced.krowne && comp.total_fields_compared === 0) {
      console.warn(`⚠️ ProductMapper returned no field comparisons for SKU ${result.sku}`, {
        salesforceFields: Object.keys(enhanced.salesforce),
        krowneFields: Object.keys(enhanced.krowne),
        comparison: comp
      });
    }

    return enhanced;
  }

  // Single product comparison for backward compatibility
  async compareSingleProduct(sku) {
    if (!sku) {
      throw new Error('SKU is required for comparison.');
    }

    return this.compareProducts({ sku });
  }

  // Batch comparison
  async compareBatch(skus = []) {
    if (!Array.isArray(skus) || skus.length === 0) {
      throw new Error('You must provide a non-empty array of SKUs to compare.');
    }

    return this.compareProducts({ skus });
  }

  // ProductMapper utility endpoints
  async getMapperFields() {
    try {
      return await this.request('/mapper/fields');
    } catch (error) {
      console.warn('Could not fetch mapper fields:', error);
      // Return empty array if endpoint doesn't exist yet
      return { fields: [] };
    }
  }

  async getDetailedComparison(sku) {
    return this.request(`/mapper/compare-detailed/${encodeURIComponent(sku)}`);
  }

  // Get all available canonical field names from ProductMapper
  async getCanonicalFields() {
    try {
      const response = await this.getMapperFields();
      return response.fields || [];
    } catch (error) {
      console.warn('Could not fetch canonical fields:', error);
      return [];
    }
  }

  // Debug methods for ProductMapper troubleshooting
  async debugCompareProduct(sku) {
    try {
      console.log(`🔧 Debug comparison for SKU: ${sku}`);
      
      // First, try the regular comparison
      const regularResponse = await this.compareProducts({ sku });
      console.log('📊 Regular comparison result:', {
        hasResults: !!regularResponse.results,
        resultCount: regularResponse.results?.length || 0,
        firstResult: regularResponse.results?.[0] ? {
          sku: regularResponse.results[0].sku,
          hasSalesforce: !!regularResponse.results[0].salesforce,
          hasKrowne: !!regularResponse.results[0].krowne,
          hasComparison: !!regularResponse.results[0].comparison,
          comparisonFields: regularResponse.results[0].comparison ? Object.keys(regularResponse.results[0].comparison) : []
        } : null
      });

      // Also try to get mapper fields to verify they're available
      const mapperFields = await this.getMapperFields();
      console.log('🗺️ Mapper fields available:', {
        fieldCount: mapperFields.fields?.length || 0,
        firstFewFields: mapperFields.fields?.slice(0, 5).map(f => f.canonical_name) || []
      });

      return {
        regularResponse,
        mapperFields,
        debugInfo: {
          timestamp: new Date().toISOString(),
          sku: sku,
          hasMapperFields: (mapperFields.fields?.length || 0) > 0,
          hasComparisonResults: (regularResponse.results?.length || 0) > 0
        }
      };
    } catch (error) {
      console.error('❌ Debug comparison failed:', error);
      return {
        error: error.message,
        timestamp: new Date().toISOString(),
        sku: sku
      };
    }
  }

  // Test ProductMapper field extraction
  async testMapperExtraction(sku) {
    try {
      // Get raw data from both sources
      const salesforceData = await this.getProductBySKU(sku).catch(() => null);
      const krowneData = await this.scrapeKrowneProduct(sku).catch(() => null);
      
      console.log('🧪 Testing mapper extraction:', {
        sku,
        hasSalesforce: !!salesforceData,
        hasKrowne: !!krowneData,
        salesforceFields: salesforceData ? Object.keys(salesforceData) : [],
        krowneFields: krowneData ? Object.keys(krowneData) : []
      });

      return {
        sku,
        salesforce: salesforceData,
        krowne: krowneData,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('❌ Test mapper extraction failed:', error);
      throw error;
    }
  }

  // Sync Operations
  async syncPimlyData(options = {}) {
    return this.request('/pimly-sync', {
      method: 'POST',
      body: JSON.stringify(options),
    });
  }

  async syncProduct(sku, mismatches) {
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

  // Utility Methods - Updated for ProductMapper format
  
  // Format comparison results for display - Updated to handle ProductMapper response structure
  formatComparisonResults(apiResponse) {
    if (!apiResponse || !apiResponse.results) {
      console.warn('No results in API response:', apiResponse);
      return [];
    }

    console.log('🔄 Formatting comparison results:', {
      total: apiResponse.results.length,
      hasMapperInfo: !!apiResponse.mapper_info,
      firstResultStructure: apiResponse.results[0] ? {
        hasSalesforce: !!apiResponse.results[0].salesforce,
        hasKrowne: !!apiResponse.results[0].krowne,
        hasComparison: !!apiResponse.results[0].comparison,
        comparisonStructure: apiResponse.results[0].comparison ? Object.keys(apiResponse.results[0].comparison) : []
      } : null
    });

    return apiResponse.results.map((result, index) => {
      // Extract ProductMapper comparison data
      const comparison = result.comparison || {};
      const mismatches = comparison.mismatches || result.mismatches || [];
      const matches = comparison.matches || [];
      const partialData = comparison.partial_data || [];

      // Debug individual result formatting
      if (index === 0) {
        console.log('🔍 Formatting first result:', {
          sku: result.sku,
          salesforceKeys: result.salesforce ? Object.keys(result.salesforce) : [],
          krowneKeys: result.krowne ? Object.keys(result.krowne) : [],
          comparisonCounts: {
            mismatches: mismatches.length,
            matches: matches.length,
            partialData: partialData.length,
            totalFields: comparison.total_fields_compared || 0
          }
        });
      }

      const formattedResult = {
        sku: result.sku,
        productData: {
          sku: result.sku,
          salesforce: result.salesforce,
          krowne: result.krowne,
          comparison: {
            ...comparison,
            // Ensure all expected fields are present
            mismatches,
            matches,
            partial_data: partialData,
            total_fields_compared: comparison.total_fields_compared || 0,
            mismatch_count: comparison.mismatch_count || mismatches.length,
            match_count: comparison.match_count || matches.length,
            partial_data_count: comparison.partial_data_count || partialData.length,
            mapped_fields: apiResponse.mapper_info?.mapped_fields || []
          },
          mismatches: mismatches // For backward compatibility
        },
        status: result.status || this.determineProductStatus(result),
        timestamp: result.timestamp,
        // Additional fields for display
        name: result.name || result.krowne_name || result.salesforce_name,
        price: result.krowne_price || result.salesforce_price,
        description: result.krowne_description || result.salesforce_description,
        image: result.krowne_image,
        url: result.krowne_url
      };

      // If we have data but no comparisons, log a warning
      if (result.salesforce && result.krowne && (comparison.total_fields_compared || 0) === 0) {
        console.warn(`⚠️ No field comparisons generated for SKU ${result.sku} despite having both data sources`);
      }

      return formattedResult;
    });
  }

  // Determine product status based on available data - Updated for ProductMapper results
  determineProductStatus(result) {
    const hasSalesforce = result.salesforce && Object.keys(result.salesforce).length > 0;
    const hasKrowne = result.krowne && Object.keys(result.krowne).length > 0;
    
    if (hasSalesforce && hasKrowne) {
      const mismatchCount = result.comparison?.mismatch_count || result.mismatches?.length || 0;
      if (mismatchCount > 0) {
        return 'mismatches_found';
      }
      
      // Check if we have meaningful matches
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

  // Get status display info
  getStatusDisplayInfo(status) {
    const statusMap = {
      'found_both': { label: 'Found in Both', color: 'success', icon: '✓' },
      'data_matches': { label: 'Data Matches', color: 'success', icon: '✓' },
      'mismatches_found': { label: 'Mismatches Found', color: 'warning', icon: '⚠️' },
      'missing_from_krowne': { label: 'Missing from Krowne', color: 'error', icon: '❌' },
      'missing_from_salesforce': { label: 'Missing from Salesforce', color: 'error', icon: '❌' },
      'not_found': { label: 'Not Found', color: 'error', icon: '❌' }
    };

    return statusMap[status] || { label: 'Unknown', color: 'default', icon: '❓' };
  }

  // Get ProductMapper statistics from results
  getMapperStatistics(apiResponse) {
    if (!apiResponse || !apiResponse.results) {
      return null;
    }

    const stats = {
      totalProducts: apiResponse.results.length,
      totalMismatches: 0,
      totalMatches: 0,
      totalPartialData: 0,
      totalFieldsCompared: 0,
      mapperInfo: apiResponse.mapper_info || null
    };

    apiResponse.results.forEach(result => {
      if (result.comparison) {
        stats.totalMismatches += result.comparison.mismatch_count || 0;
        stats.totalMatches += result.comparison.match_count || 0;
        stats.totalPartialData += result.comparison.partial_data_count || 0;
        stats.totalFieldsCompared += result.comparison.total_fields_compared || 0;
      }
    });

    return stats;
  }

  // Format field values for display based on ProductMapper field types
  formatFieldValue(value, fieldType) {
    if (!value && value !== 0) return null;
    
    switch (fieldType) {
      case 'price':
        if (typeof value === 'number') return `$${value.toFixed(2)}`;
        if (typeof value === 'string') {
          if (value.includes('$')) return value;
          const cleanPrice = value.replace(/[^\d.]/g, '');
          const numericPrice = parseFloat(cleanPrice);
          if (!isNaN(numericPrice)) return `$${numericPrice.toFixed(2)}`;
          return value;
        }
        return String(value);
        
      case 'number':
        const num = parseFloat(value);
        if (!isNaN(num)) return num.toString();
        return String(value);
        
      case 'boolean':
        if (typeof value === 'boolean') return value ? 'Yes' : 'No';
        if (typeof value === 'string') {
          const lower = value.toLowerCase();
          if (['true', 'yes', '1', 'y', 'on'].includes(lower)) return 'Yes';
          if (['false', 'no', '0', 'n', 'off'].includes(lower)) return 'No';
        }
        return String(value);
        
      case 'list':
        if (Array.isArray(value)) return value.join(', ');
        return String(value);
        
      case 'url':
        return value; // URLs can be displayed as-is or as links
        
      case 'text':
      default:
        return String(value);
    }
  }

  // Health Check
  async healthCheck() {
    return this.request('/health');
  }

  // Test proxy connection
  async testProxy() {
    return this.request('/test-proxy');
  }
}

const api = new APIService();
export default api;