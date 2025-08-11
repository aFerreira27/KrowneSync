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

// ===== KROWNE CMS AUTHENTICATION METHODS =====

  /**
   * Get current Krowne CMS authentication status
   * @returns {Object} Authentication status and user info
   */
  async getKrowneStatus() {
    try {
      console.log('🔍 Checking Krowne CMS authentication status...');
      const response = await this.request('/auth/krowne/status');
      
      const isAuthenticated = response.authenticated || false;
      console.log(`${isAuthenticated ? '✅' : '❌'} Krowne CMS auth status:`, {
        authenticated: isAuthenticated,
        user: response.userInfo?.username || 'N/A',
        sessionExpiry: response.userInfo?.session_expiry || 'N/A'
      });
      
      return {
        authenticated: isAuthenticated,
        userInfo: response.userInfo || null,
        sessionExpiry: response.userInfo?.session_expiry || null,
        permissions: response.permissions || [],
        lastActivity: response.last_activity || null
      };
    } catch (error) {
      console.error('❌ Error checking Krowne auth status:', error);
      return {
        authenticated: false,
        userInfo: null,
        error: error.message
      };
    }
  }

  /**
   * Authenticate with Krowne CMS
   * @param {string} username - Username or email
   * @param {string} password - Password
   * @returns {Object} Login result with success status
   */
  async krowneLogin(username, password) {
    try {
      if (!username || !password) {
        throw new Error('Username and password are required');
      }

      console.log('🔐 Attempting Krowne CMS login for:', username);
      
      const response = await this.request('/auth/krowne/login', {
        method: 'POST',
        body: JSON.stringify({ 
          username: username.trim(), 
          password: password 
        }),
        timeout: 30000 // 30 second timeout for login
      });

      if (response.success) {
        console.log('✅ Krowne CMS login successful:', {
          user: response.user?.username || username,
          permissions: response.user?.permissions?.length || 0,
          sessionExpiry: response.user?.session_expiry || 'N/A'
        });

        // Emit login success event
        if (typeof window !== 'undefined' && window.dispatchEvent) {
          window.dispatchEvent(new CustomEvent('krowne-login-success', {
            detail: { user: response.user, timestamp: Date.now() }
          }));
        }

        return {
          success: true,
          user: response.user,
          message: response.message || 'Login successful',
          sessionExpiry: response.user?.session_expiry,
          permissions: response.user?.permissions || []
        };
      } else {
        throw new Error(response.error || response.message || 'Login failed');
      }
    } catch (error) {
      console.error('❌ Krowne CMS login failed:', error.message);
      
      // Enhanced error messages for common issues
      let errorMessage = error.message;
      if (error.message.includes('401') || error.message.includes('Unauthorized')) {
        errorMessage = 'Invalid username or password';
      } else if (error.message.includes('403') || error.message.includes('Forbidden')) {
        errorMessage = 'Account does not have CMS access permissions';
      } else if (error.message.includes('timeout')) {
        errorMessage = 'Login request timed out - please try again';
      } else if (error.message.includes('Failed to fetch') || error.message.includes('connection failed')) {
        errorMessage = 'Cannot connect to CMS server - please check your connection';
      }

      return {
        success: false,
        error: errorMessage,
        originalError: error.message
      };
    }
  }

  /**
   * Logout from Krowne CMS
   * @returns {Object} Logout result
   */
  async krowneLogout() {
    try {
      console.log('🔐 Logging out from Krowne CMS...');
      
      const response = await this.request('/auth/krowne/logout', {
        method: 'POST',
        timeout: 10000 // 10 second timeout for logout
      });

      console.log('✅ Krowne CMS logout successful');

      // Emit logout event
      if (typeof window !== 'undefined' && window.dispatchEvent) {
        window.dispatchEvent(new CustomEvent('krowne-logout-success', {
          detail: { timestamp: Date.now() }
        }));
      }

      return {
        success: true,
        message: response.message || 'Logged out successfully'
      };
    } catch (error) {
      console.error('❌ Error logging out from Krowne:', error);
      
      // Even if logout fails on server, clear client-side state
      if (typeof window !== 'undefined' && window.dispatchEvent) {
        window.dispatchEvent(new CustomEvent('krowne-logout-success', {
          detail: { timestamp: Date.now(), forced: true }
        }));
      }

      return {
        success: false,
        error: error.message,
        message: 'Logout may have failed on server, but local session cleared'
      };
    }
  }

  /**
   * Get detailed user profile information
   * @returns {Object} User profile data
   */
  async getKrowneProfile() {
    try {
      console.log('👤 Fetching Krowne CMS user profile...');
      
      const response = await this.request('/auth/krowne/profile');
      
      console.log('✅ Krowne profile retrieved:', {
        username: response.username || 'N/A',
        email: response.email || 'N/A',
        role: response.role || 'N/A',
        permissions: response.permissions?.length || 0
      });

      return {
        success: true,
        profile: response,
        username: response.username,
        email: response.email,
        role: response.role,
        permissions: response.permissions || [],
        lastLogin: response.last_login,
        createdAt: response.created_at
      };
    } catch (error) {
      console.error('❌ Error fetching Krowne profile:', error);
      
      if (error.message.includes('401') || error.message.includes('Unauthorized')) {
        // Session expired, emit auth required event
        if (typeof window !== 'undefined' && window.dispatchEvent) {
          window.dispatchEvent(new CustomEvent('cms-auth-required', {
            detail: { operation: 'getKrowneProfile', reason: 'session_expired' }
          }));
        }
      }

      return {
        success: false,
        error: error.message,
        requiresAuth: error.message.includes('401') || error.message.includes('Unauthorized')
      };
    }
  }

  /**
   * Test connection to Krowne CMS server
   * @returns {Object} Connection test results
   */
  async testKrowneConnection() {
    try {
      console.log('🔗 Testing Krowne CMS connection...');
      
      const startTime = Date.now();
      const response = await this.request('/krowne/test-connection', {
        timeout: 15000 // 15 second timeout for connection test
      });
      const responseTime = Date.now() - startTime;

      console.log('✅ Krowne CMS connection test successful:', {
        responseTime: `${responseTime}ms`,
        serverStatus: response.status || 'OK',
        version: response.version || 'Unknown'
      });

      return {
        success: true,
        connected: true,
        responseTime,
        serverStatus: response.status || 'OK',
        serverVersion: response.version,
        timestamp: new Date().toISOString(),
        details: response
      };
    } catch (error) {
      console.error('❌ Krowne CMS connection test failed:', error);
      
      let errorType = 'unknown';
      if (error.message.includes('timeout')) {
        errorType = 'timeout';
      } else if (error.message.includes('Failed to fetch') || error.message.includes('connection failed')) {
        errorType = 'network';
      } else if (error.message.includes('404')) {
        errorType = 'endpoint_not_found';
      } else if (error.message.includes('500')) {
        errorType = 'server_error';
      }

      return {
        success: false,
        connected: false,
        error: error.message,
        errorType,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Check if current user has specific permissions
   * @param {string|Array} permissions - Permission(s) to check
   * @returns {Object} Permission check results
   */
  async checkKrownePermissions(permissions) {
    try {
      const profile = await this.getKrowneProfile();
      
      if (!profile.success) {
        return {
          hasPermissions: false,
          error: 'Could not retrieve user permissions',
          requiresAuth: profile.requiresAuth
        };
      }

      const userPermissions = profile.permissions || [];
      const requiredPermissions = Array.isArray(permissions) ? permissions : [permissions];
      
      const hasAll = requiredPermissions.every(perm => 
        userPermissions.includes(perm) || userPermissions.includes('admin')
      );

      return {
        hasPermissions: hasAll,
        userPermissions,
        requiredPermissions,
        missingPermissions: requiredPermissions.filter(perm => 
          !userPermissions.includes(perm) && !userPermissions.includes('admin')
        )
      };
    } catch (error) {
      console.error('❌ Error checking Krowne permissions:', error);
      return {
        hasPermissions: false,
        error: error.message
      };
    }
  }

  /**
   * Refresh authentication session
   * @returns {Object} Session refresh result
   */
  async refreshKrowneSession() {
    try {
      console.log('🔄 Refreshing Krowne CMS session...');
      
      const response = await this.request('/auth/krowne/refresh', {
        method: 'POST',
        timeout: 10000
      });

      console.log('✅ Krowne session refreshed successfully');
      
      return {
        success: true,
        sessionExpiry: response.session_expiry,
        message: 'Session refreshed successfully'
      };
    } catch (error) {
      console.error('❌ Failed to refresh Krowne session:', error);
      
      // If refresh fails, user needs to login again
      if (typeof window !== 'undefined' && window.dispatchEvent) {
        window.dispatchEvent(new CustomEvent('cms-auth-required', {
          detail: { operation: 'refreshKrowneSession', reason: 'refresh_failed' }
        }));
      }

      return {
        success: false,
        error: error.message,
        requiresReauth: true
      };
    }
  }

  // ===== END KROWNE CMS AUTHENTICATION METHODS =====

  // Krowne Product Scraping
async scrapeKrowneProduct(sku) {
    if (!sku) {
        throw new Error('SKU is required to scrape Krowne product.');
    }

    return this.request(`/api/krowne/scrape-product/${encodeURIComponent(sku)}`);
}

  // ===== CMS ADMIN METHODS =====

  /**
   * Search for a product in the CMS admin panel by SKU
   */
  async searchCMSAdminProduct(sku) {
    try {
      console.log(`🔍 Searching CMS admin for SKU: ${sku}`);
      
      const response = await fetch(`${API_BASE_URL}/krowne/admin/search/${encodeURIComponent(sku)}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
      });

      const data = await response.json();

      if (response.ok) {
        console.log(`✅ CMS admin search completed for ${sku}:`, {
          found: data.found,
          recordNumber: data.search_result?.record_number,
          productName: data.search_result?.name
        });
        return data;
      } else {
        // Handle authentication errors specially
        if (data.requires_auth) {
          console.warn(`🔐 CMS admin authentication required for SKU search: ${sku}`);
          throw new Error('CMS_AUTH_REQUIRED');
        }
        throw new Error(data.error || `Search failed with status: ${response.status}`);
      }
    } catch (error) {
      console.error(`❌ Error searching CMS admin for SKU ${sku}:`, error);
      throw error;
    }
  }

  /**
   * Get detailed product information from CMS admin using record number
   */
  async getCMSAdminProductDetails(recordNumber) {
    try {
      console.log(`📄 Fetching CMS admin product details for record: ${recordNumber}`);
      
      const response = await fetch(`${API_BASE_URL}/krowne/admin/product/${encodeURIComponent(recordNumber)}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
      });

      const data = await response.json();

      if (response.ok) {
        console.log(`✅ CMS admin product details retrieved for record ${recordNumber}:`, {
          hasDetails: !!data.product_details,
          fieldsCount: data.product_details?.admin_fields ? Object.keys(data.product_details.admin_fields).length : 0,
          formFieldsCount: data.product_details?.form_data ? Object.keys(data.product_details.form_data).length : 0
        });
        return data;
      } else {
        if (data.requires_auth) {
          throw new Error('CMS_AUTH_REQUIRED');
        }
        throw new Error(data.error || `Failed to get product details: ${response.status}`);
      }
    } catch (error) {
      console.error(`❌ Error getting CMS admin product details for record ${recordNumber}:`, error);
      throw error;
    }
  }

  /**
   * Get complete product data from CMS admin by SKU (search + details in one call)
   */
  async getCMSAdminProductBySKU(sku) {
    try {
      console.log(`🎯 Getting complete CMS admin data for SKU: ${sku}`);
      
      const response = await fetch(`${API_BASE_URL}/krowne/admin/sku/${encodeURIComponent(sku)}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
      });

      const data = await response.json();

      if (response.ok) {
        console.log(`✅ Complete CMS admin data retrieved for ${sku}:`, {
          recordNumber: data.product_data?.metadata?.record_number,
          fieldsCount: data.product_data?.metadata?.fields_count,
          formFieldsCount: data.product_data?.metadata?.form_fields_count,
          sectionsCount: data.product_data?.metadata?.sections_count
        });
        return data;
      } else {
        if (data.requires_auth) {
          throw new Error('CMS_AUTH_REQUIRED');
        }
        throw new Error(data.error || `Failed to get CMS admin product: ${response.status}`);
      }
    } catch (error) {
      console.error(`❌ Error getting CMS admin product by SKU ${sku}:`, error);
      throw error;
    }
  }

  /**
   * Get multiple products from CMS admin by SKU list
   */
  async getCMSAdminProductsBatch(skus) {
    try {
      if (!Array.isArray(skus) || skus.length === 0) {
        throw new Error('SKUs array is required and cannot be empty');
      }

      if (skus.length > 50) {
        throw new Error('Maximum 50 SKUs allowed per batch request');
      }

      console.log(`📦 Getting batch CMS admin data for ${skus.length} SKUs`);
      
      const response = await fetch(`${API_BASE_URL}/krowne/admin/batch`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ skus }),
      });

      const data = await response.json();

      if (response.ok) {
        console.log(`✅ Batch CMS admin data retrieved:`, {
          totalRequested: data.total_requested,
          totalFound: data.total_found,
          successRate: `${Math.round((data.total_found / data.total_requested) * 100)}%`,
          errors: data.errors?.length || 0
        });
        return data;
      } else {
        if (data.requires_auth) {
          throw new Error('CMS_AUTH_REQUIRED');
        }
        throw new Error(data.error || `Batch request failed: ${response.status}`);
      }
    } catch (error) {
      console.error('❌ Error in batch CMS admin request:', error);
      throw error;
    }
  }

  /**
   * Get enhanced product comparison including CMS admin, Pimly, and public website data
   */
  async getEnhancedProductComparison(sku) {
    try {
      console.log(`🔄 Getting enhanced product comparison for SKU: ${sku}`);
      
      const response = await this.request(`/products/compare-enhanced/${encodeURIComponent(sku)}`);

      const sources = response.sources || {};
      const successful = response.comparison?.successful_sources || [];
      
      console.log(`✅ Enhanced comparison completed for ${sku}:`, {
        successfulSources: successful,
        totalSources: response.comparison?.total_sources || 0,
        successRate: `${Math.round((response.comparison?.success_rate || 0) * 100)}%`,
        hasPimlyData: sources.pimly?.success || false,
        hasPublicData: sources.public_website?.success || false,
        hasCMSAdminData: sources.cms_admin?.success || false,
        errors: response.errors?.length || 0
      });
      
      return response;
    } catch (error) {
      console.error(`❌ Error in enhanced product comparison for SKU ${sku}:`, error);
      throw error;
    }
  }

  /**
   * Check if user is authenticated with CMS admin
   */
  async checkCMSAdminAuth() {
    try {
      const response = await this.request('/auth/krowne/status');
      return {
        authenticated: response.authenticated || false,
        userInfo: response.userInfo || null
      };
    } catch (error) {
      console.error('❌ Error checking CMS admin auth status:', error);
      return { authenticated: false, userInfo: null };
    }
  }

  /**
   * Handle CMS admin authentication errors
   */
  async handleCMSAuthError(originalOperation, ...args) {
    try {
      // Check current auth status
      const authStatus = await this.checkCMSAdminAuth();
      
      if (!authStatus.authenticated) {
        // Show login modal or redirect to login
        console.warn('🔐 CMS admin authentication required');
        
        // You can emit an event here to show a login modal
        if (window.dispatchEvent) {
          window.dispatchEvent(new CustomEvent('cms-auth-required', {
            detail: { operation: originalOperation.name, args }
          }));
        }
        
        throw new Error('CMS admin authentication required');
      }
      
      // If authenticated, retry the original operation
      return await originalOperation.apply(this, args);
      
    } catch (error) {
      console.error('❌ Error handling CMS auth:', error);
      throw error;
    }
  }

  /**
   * Wrapper method that automatically handles auth errors
   */
  async withCMSAuth(operation, ...args) {
    try {
      return await operation.apply(this, args);
    } catch (error) {
      if (error.message === 'CMS_AUTH_REQUIRED') {
        return await this.handleCMSAuthError(operation, ...args);
      }
      throw error;
    }
  }

  /**
   * Format CMS admin data for display in the UI
   */
  formatCMSAdminData(rawCMSData) {
    if (!rawCMSData) return null;

    const formatted = {
      basicInfo: rawCMSData.basic_info || {},
      adminMetadata: rawCMSData.admin_metadata || {},
      formFields: rawCMSData.form_fields || {},
      displaySections: rawCMSData.display_sections || {},
      specifications: rawCMSData.extracted_specs || {},
      images: rawCMSData.images || [],
      files: rawCMSData.files || [],
      urls: rawCMSData.urls || []
    };

    // Calculate summary stats
    formatted.stats = {
      totalFields: Object.keys(formatted.formFields).length,
      totalSections: Object.keys(formatted.displaySections).length,
      totalSpecs: Object.keys(formatted.specifications).length,
      totalImages: formatted.images.length,
      totalFiles: formatted.files.length,
      totalUrls: formatted.urls.length
    };

    return formatted;
  }

  /**
   * Compare different data sources for a product
   */
  compareDataSources(enhancedComparisonData) {
    if (!enhancedComparisonData || !enhancedComparisonData.sources) {
      return null;
    }

    const sources = enhancedComparisonData.sources;
    const comparison = {
      summary: {
        totalSources: Object.keys(sources).length,
        successfulSources: Object.keys(sources).filter(key => sources[key].success).length,
        failedSources: Object.keys(sources).filter(key => !sources[key].success),
        dataQuality: {}
      },
      fieldComparison: {},
      recommendations: []
    };

    // Analyze data quality for each source
    Object.entries(sources).forEach(([sourceName, sourceData]) => {
      if (sourceData.success && sourceData.data) {
        const data = sourceData.data;
        let fieldCount = 0;
        let nonEmptyFieldCount = 0;

        // Count fields recursively
        const countFields = (obj, path = '') => {
          if (typeof obj === 'object' && obj !== null) {
            Object.entries(obj).forEach(([key, value]) => {
              fieldCount++;
              if (value !== null && value !== undefined && value !== '') {
                nonEmptyFieldCount++;
              }
              if (typeof value === 'object') {
                countFields(value, path ? `${path}.${key}` : key);
              }
            });
          }
        };

        countFields(data);

        comparison.summary.dataQuality[sourceName] = {
          totalFields: fieldCount,
          nonEmptyFields: nonEmptyFieldCount,
          completeness: fieldCount > 0 ? (nonEmptyFieldCount / fieldCount) : 0,
          dataSize: JSON.stringify(data).length
        };
      }
    });

    // Generate recommendations
    const successful = comparison.summary.successfulSources;
    const total = comparison.summary.totalSources;

    if (successful === total) {
      comparison.recommendations.push('✅ All data sources are available - comparison is complete');
    } else if (successful > 0) {
      comparison.recommendations.push(`⚠️ ${total - successful} of ${total} data sources failed`);
    } else {
      comparison.recommendations.push('❌ No data sources are available');
    }

    // Quality recommendations
    Object.entries(comparison.summary.dataQuality).forEach(([source, quality]) => {
      if (quality.completeness < 0.5) {
        comparison.recommendations.push(`📊 ${source} has low data completeness (${Math.round(quality.completeness * 100)}%)`);
      } else if (quality.completeness > 0.9) {
        comparison.recommendations.push(`✨ ${source} has excellent data completeness (${Math.round(quality.completeness * 100)}%)`);
      }
    });

    return comparison;
  }

  // ===== END CMS ADMIN METHODS =====

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