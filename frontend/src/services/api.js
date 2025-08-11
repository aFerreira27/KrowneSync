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

  // NEW: Product Data Mapping Routes
  async mapProductData(sku) {
    /**
     * Map a single product using the new ProductDataMapper
     * Returns categorized product data (name, sku, series, features, specifications, etc.)
     */
    return this.request(`/products/map/${encodeURIComponent(sku)}`);
  }

  async mapBatchProducts(skus) {
    /**
     * Map multiple products at once using ProductDataMapper
     * @param {Array} skus - Array of SKU strings to map
     * @returns {Object} Response with mapped products
     */
    if (!Array.isArray(skus) || skus.length === 0) {
      throw new Error('SKUs must be a non-empty array');
    }

    return this.request('/products/map/batch', {
      method: 'POST',
      body: JSON.stringify({ skus }),
    });
  }

  // Enhanced product comparison with mapping integration
  async getDetailedProductComparison(sku) {
    /**
     * Get detailed comparison data for a product using both mapping and comparison logic
     * This combines the mapped data structure with comparison analysis
     */
    try {
      // First get the mapped data
      const mappedResponse = await this.mapProductData(sku);
      const mappedData = mappedResponse.mapped_data;

      // Try to get comparison data if available (from your existing comparison system)
      let comparisonData = null;
      try {
        const comparisonResponse = await this.compareSingleProduct(sku);
        comparisonData = comparisonResponse.results?.[0]?.comparison;
      } catch (error) {
        console.warn(`No comparison data available for ${sku}:`, error.message);
      }

      // Transform mapped data into comparison format for ProductCard
      const fieldComparisons = this.transformMappedDataToComparisons(mappedData, comparisonData);

      return {
        sku: sku,
        comparison_summary: {
          matches: fieldComparisons.filter(f => f.is_match).length,
          mismatches: fieldComparisons.filter(f => f.is_mismatch).length,
          partial_data: fieldComparisons.filter(f => f.has_partial_data).length,
          total_fields: fieldComparisons.length
        },
        field_comparisons: fieldComparisons,
        mapped_data: mappedData
      };
    } catch (error) {
      console.error(`Error getting detailed comparison for ${sku}:`, error);
      throw error;
    }
  }

  // Transform mapped data into comparison format for backward compatibility
  transformMappedDataToComparisons(mappedData, existingComparison = null) {
    const fieldComparisons = [];

    // Helper function to create field comparison object
    const createFieldComparison = (fieldName, displayName, pimlyValue, krowneValue, fieldType = 'text') => {
      const isEmpty = (val) => val === null || val === undefined || val === '';
      const pimlyEmpty = isEmpty(pimlyValue);
      const krowneEmpty = isEmpty(krowneValue);

      let status = { is_match: false, is_mismatch: false, has_partial_data: false };

      if (pimlyEmpty && krowneEmpty) {
        // Both empty - skip this field
        return null;
      } else if (pimlyEmpty || krowneEmpty) {
        // One side has data, other doesn't
        status.has_partial_data = true;
      } else if (this.normalizeValue(pimlyValue) === this.normalizeValue(krowneValue)) {
        // Both have data and match
        status.is_match = true;
      } else {
        // Both have data but don't match
        status.is_mismatch = true;
      }

      return {
        field_name: fieldName,
        display_name: displayName,
        salesforce_value: pimlyValue,
        krowne_value: krowneValue,
        field_type: fieldType,
        ...status,
        description: `${displayName} comparison between Pimly and Krowne data`
      };
    };

    // Process basic fields
    const basicFieldMappings = [
      { field: 'name', display: 'Product Name', type: 'text' },
      { field: 'sku', display: 'SKU', type: 'text' },
      { field: 'series', display: 'Series', type: 'text' }
    ];

    basicFieldMappings.forEach(({ field, display, type }) => {
      const pimlyValue = mappedData[field];
      // For now, we don't have Krowne mapped data, so we'll use null
      // In the future, you could enhance this to include Krowne mapping
      const krowneValue = null;
      
      const comparison = createFieldComparison(field, display, pimlyValue, krowneValue, type);
      if (comparison) fieldComparisons.push(comparison);
    });

    // Process features
    if (mappedData.features && mappedData.features.length > 0) {
      const featuresString = mappedData.features.join(' | ');
      const comparison = createFieldComparison(
        'features', 
        'Features', 
        featuresString, 
        null, // No Krowne data for now
        'list'
      );
      if (comparison) fieldComparisons.push(comparison);
    }

    // Process specifications
    if (mappedData.specifications) {
      Object.entries(mappedData.specifications).forEach(([specKey, specValue]) => {
        const displayName = specKey.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        const fieldType = this.inferFieldType(specKey, specValue);
        
        const comparison = createFieldComparison(
          `spec_${specKey}`,
          displayName,
          specValue,
          null, // No Krowne data for now
          fieldType
        );
        if (comparison) fieldComparisons.push(comparison);
      });
    }

    // Process certifications
    if (mappedData.certifications) {
      Object.entries(mappedData.certifications).forEach(([certKey, certValue]) => {
        const displayName = `${certKey} Certification`;
        
        const comparison = createFieldComparison(
          `cert_${certKey}`,
          displayName,
          certValue,
          null, // No Krowne data for now
          'boolean'
        );
        if (comparison) fieldComparisons.push(comparison);
      });
    }

    // Process PIMLY_ONLY fields as Pimly-only data
    if (mappedData.pimly_only) {
      Object.entries(mappedData.pimly_only).forEach(([key, value]) => {
        const displayName = key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        
        const comparison = createFieldComparison(
          `pimly_only_${key}`,
          `${displayName} (Pimly Only)`,
          value,
          null,
          'text'
        );
        if (comparison) {
          comparison.notes = '[Pimly Only Field]';
          fieldComparisons.push(comparison);
        }
      });
    }

    return fieldComparisons;
  }

  // Helper method to normalize values for comparison
  normalizeValue(value) {
    if (value === null || value === undefined) return '';
    if (typeof value === 'string') return value.trim().toLowerCase();
    if (typeof value === 'boolean') return value.toString();
    if (Array.isArray(value)) return value.join('|').toLowerCase();
    return String(value).trim().toLowerCase();
  }

  // Helper method to infer field type from key and value
  inferFieldType(key, value) {
    const keyLower = key.toLowerCase();
    
    // Price fields
    if (keyLower.includes('price') || keyLower.includes('cost')) {
      return 'price';
    }
    
    // Number fields
    if (keyLower.includes('weight') || keyLower.includes('height') || 
        keyLower.includes('width') || keyLower.includes('length') ||
        keyLower.includes('diameter') || keyLower.includes('capacity') ||
        keyLower.includes('flow') || keyLower.includes('btu')) {
      return 'number';
    }
    
    // Boolean fields
    if (typeof value === 'boolean' || 
        (typeof value === 'string' && ['true', 'false', 'yes', 'no'].includes(value.toLowerCase()))) {
      return 'boolean';
    }
    
    // List fields
    if (Array.isArray(value) || (typeof value === 'string' && value.includes('|'))) {
      return 'list';
    }
    
    // URL fields
    if (typeof value === 'string' && value.startsWith('http')) {
      return 'url';
    }
    
    return 'text';
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

  // Product Comparison - Keep existing methods for backward compatibility
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

  // Single product comparison for backward compatibility
  async compareSingleProduct(sku) {
    if (!sku) {
      throw new Error('SKU is required for comparison.');
    }

    console.log(`🔍 Comparing single product: ${sku}`);
    
    try {
      const response = await this.compareProducts({ sku });
      return response;
    } catch (error) {
      console.error(`❌ Single product comparison failed for ${sku}:`, error.message);
      throw error;
    }
  }

  // Enhanced batch comparison method
  async compareBatch(skus = []) {
    if (!Array.isArray(skus) || skus.length === 0) {
      throw new Error('You must provide a non-empty array of SKUs to compare.');
    }

    console.log(`🔍 Comparing batch of ${skus.length} SKUs`);

    try {
      const response = await this.compareProducts({ skus });
      return response;
    } catch (error) {
      console.error(`❌ Batch comparison failed:`, error.message);
      throw new Error(`Batch comparison failed for ${skus.length} SKUs: ${error.message}`);
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

  // Validation and utility methods
  validateBatch(skus) {
    if (!Array.isArray(skus)) {
      throw new Error('SKUs must be provided as an array');
    }
    
    if (skus.length === 0) {
      throw new Error('Cannot process empty SKU batch');
    }
    
    const invalidSkus = skus.filter(sku => !sku || typeof sku !== 'string' || sku.trim() === '');
    if (invalidSkus.length > 0) {
      throw new Error(`Batch contains ${invalidSkus.length} invalid SKUs`);
    }
    
    const uniqueSkus = [...new Set(skus)];
    if (uniqueSkus.length !== skus.length) {
      console.warn(`⚠️ Batch contains ${skus.length - uniqueSkus.length} duplicate SKUs`);
    }
    
    return {
      isValid: true,
      originalCount: skus.length,
      uniqueCount: uniqueSkus.length,
      duplicates: skus.length - uniqueSkus.length,
      cleanedSkus: uniqueSkus
    };
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