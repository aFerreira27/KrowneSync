import React, { useState, useEffect, useRef } from 'react';
import ProductCard from '../ProductCard/ProductCard';
import api from '../../services/api';

const SKUSearch = ({ onSearch, searchedSKU, salesforceAuth }) => {
  const [sku, setSku] = useState(searchedSKU || '');
  const [productData, setProductData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  // Use refs to track search state without causing re-renders
  const lastSearchedSkuRef = useRef('');
  const isSearchingRef = useRef(false);

  const handleSearch = async (searchSku) => {
    // Use the passed SKU parameter or fall back to current state
    const skuToSearch = searchSku || sku;
    
    if (!skuToSearch.trim()) {
      setError('Please enter a SKU to search');
      return;
    }

    if (!salesforceAuth.authenticated) {
      setError('Please connect to Pimly (Salesforce) to search products');
      return;
    }

    // Prevent duplicate searches
    if (isSearchingRef.current || lastSearchedSkuRef.current === skuToSearch) {
      console.log('Skipping duplicate search for:', skuToSearch);
      return;
    }

    isSearchingRef.current = true;
    setLoading(true);
    setError(null);
    setProductData(null);
    lastSearchedSkuRef.current = skuToSearch;

    try {
      console.log('Searching for SKU:', skuToSearch);
      
      // First, try to search Pimly for the product
      const searchResults = await api.searchPimlyProducts(skuToSearch, 1);
      console.log('Pimly search results:', searchResults);

      let pimlyProduct = null;
      let mappedData = null;
      let krowneData = null;
      let comparison = null;

      // Handle Pimly product data
      if (searchResults.products && searchResults.products.length > 0) {
        pimlyProduct = searchResults.products[0];
        console.log('Found Pimly product:', pimlyProduct);

        // Try to get mapped data using the new mapping system
        try {
          const mappingResponse = await api.mapProductData(skuToSearch);
          mappedData = mappingResponse.mapped_data;
          console.log('✅ Mapped data retrieved:', mappedData);
        } catch (mappingError) {
          console.warn('Could not get mapped data:', mappingError.message);
        }

        // Try to get detailed comparison using the new system
        try {
          const detailedComparison = await api.getDetailedProductComparison(skuToSearch);
          comparison = detailedComparison;
          console.log('✅ Detailed comparison retrieved:', detailedComparison);
        } catch (comparisonError) {
          console.warn('Could not get detailed comparison:', comparisonError.message);
        }
      }

      // Try to scrape Krowne data if available
      try {
        const krowneResponse = await api.scrapeKrowneProduct(skuToSearch);
        if (krowneResponse && Object.keys(krowneResponse).length > 0) {
          krowneData = krowneResponse;
          console.log('✅ Krowne data retrieved:', krowneData);
        }
      } catch (krowneError) {
        console.warn('Could not scrape Krowne data:', krowneError.message);
      }

      // If we have no data from either source, try the old comparison system as fallback
      if (!pimlyProduct && !krowneData) {
        try {
          console.log('🔄 Trying fallback comparison system...');
          const fallbackComparison = await api.compareSingleProduct(skuToSearch);
          
          if (fallbackComparison?.results?.length > 0) {
            const result = fallbackComparison.results[0];
            pimlyProduct = result.salesforce;
            krowneData = result.krowne;
            comparison = result.comparison;
            console.log('✅ Fallback comparison successful:', result);
          }
        } catch (fallbackError) {
          console.warn('Fallback comparison also failed:', fallbackError.message);
        }
      }

      // Determine product status
      let status = 'not_found';
      if (pimlyProduct && krowneData) {
        if (comparison?.mismatch_count > 0) {
          status = 'mismatches_found';
        } else if (comparison?.match_count > 0) {
          status = 'data_matches';
        } else {
          status = 'found_both';
        }
      } else if (pimlyProduct && !krowneData) {
        status = 'missing_from_krowne';
      } else if (!pimlyProduct && krowneData) {
        status = 'missing_from_salesforce';
      }

      // Extract mismatches for sync functionality
      const mismatches = comparison?.field_comparisons?.filter(field => field.is_mismatch) || 
                        comparison?.mismatches || 
                        [];

      // Structure the product data for ProductCard
      const structuredProductData = {
        sku: skuToSearch,
        salesforce: pimlyProduct,
        krowne: krowneData,
        comparison: comparison?.comparison_summary || comparison || {
          mismatches: mismatches,
          matches: comparison?.field_comparisons?.filter(field => field.is_match) || [],
          partial_data: comparison?.field_comparisons?.filter(field => field.has_partial_data) || [],
          total_fields_compared: comparison?.field_comparisons?.length || 0,
          mismatch_count: mismatches.length,
          match_count: comparison?.field_comparisons?.filter(field => field.is_match)?.length || 0,
          partial_data_count: comparison?.field_comparisons?.filter(field => field.has_partial_data)?.length || 0
        },
        status: status,
        mismatches: mismatches,
        mapped_data: mappedData,
        // Additional display properties
        name: mappedData?.name || pimlyProduct?.Name || krowneData?.name || skuToSearch,
        price: mappedData?.specifications?.List_Price || pimlyProduct?.ListPrice || krowneData?.price,
        description: mappedData?.specifications?.Product_Description || pimlyProduct?.Description || krowneData?.description
      };

      console.log('✅ Final structured product data:', structuredProductData);
      setProductData(structuredProductData);
      
      // Call parent's onSearch callback if provided
      if (onSearch) {
        onSearch(skuToSearch);
      }

    } catch (err) {
      console.error('❌ Search error:', err);
      setError(err.message || 'Failed to fetch product data');
    } finally {
      setLoading(false);
      isSearchingRef.current = false;
    }
  };

  // Only update from parent prop on initial mount or when explicitly changed by parent
  useEffect(() => {
    // Only update if searchedSKU is provided and different from current
    if (searchedSKU && searchedSKU !== lastSearchedSkuRef.current) {
      console.log('Parent updated searchedSKU to:', searchedSKU);
      setSku(searchedSKU);
      // Only auto-search if this is a new SKU from parent
      handleSearch(searchedSKU);
    }
  }, [searchedSKU]); // Remove handleSearch from dependencies to prevent loops

  const handleSync = async () => {
    if (!productData || !productData.mismatches || productData.mismatches.length === 0) {
      setError('No mismatches to sync');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      console.log('🔄 Syncing product:', productData.sku, productData.mismatches);
      
      // Check if we have a sync endpoint available
      try {
        await api.syncProduct(productData.sku, productData.mismatches);
        console.log('✅ Product synced successfully');
        
        // Refresh the product data after sync
        await handleSearch(productData.sku);
        
      } catch (syncError) {
        if (syncError.message.includes('404') || syncError.message.includes('not found')) {
          setError('Sync functionality is not yet implemented on the backend');
        } else {
          throw syncError;
        }
      }
      
    } catch (err) {
      console.error('❌ Sync error:', err);
      setError(err.message || 'Failed to sync product');
    } finally {
      setLoading(false);
    }
  };

  const clearSearch = () => {
    setSku('');
    setProductData(null);
    setError(null);
    lastSearchedSkuRef.current = '';
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !loading) {
      e.preventDefault();
      handleSearch();
    }
  };

  const handleInputChange = (e) => {
    // Just update the input, don't trigger search
    setSku(e.target.value);
  };

  const handleSearchClick = () => {
    handleSearch();
  };

  // Helper function to get status display info
  const getStatusInfo = (status) => {
    switch (status) {
      case 'found_both':
      case 'data_matches':
        return { color: 'success', icon: '✅', text: 'Found in both systems' };
      case 'mismatches_found':
        return { color: 'warning', icon: '⚠️', text: 'Data differences found' };
      case 'missing_from_krowne':
        return { color: 'info', icon: 'ℹ️', text: 'Found in Pimly only' };
      case 'missing_from_salesforce':
        return { color: 'info', icon: 'ℹ️', text: 'Found in Krowne only' };
      case 'not_found':
      default:
        return { color: 'error', icon: '❌', text: 'Not found in either system' };
    }
  };

  return (
    <div className="sku-search-container">
      <div className="search-box">
        <div className="search-input-group">
          <input
            type="text"
            placeholder="Enter SKU to search..."
            value={sku}
            onChange={handleInputChange}
            onKeyPress={handleKeyPress}
            className="sku-input"
            disabled={loading}
          />
          {sku && (
            <button 
              onClick={clearSearch}
              className="clear-btn"
              type="button"
              disabled={loading}
              title="Clear search"
            >
              ✕
            </button>
          )}
        </div>
        <button 
          onClick={handleSearchClick}
          disabled={loading || !salesforceAuth.authenticated || !sku.trim()}
          className="search-btn"
        >
          {loading ? 'Searching...' : 'Search'}
        </button>
      </div>

      {!salesforceAuth.authenticated && (
        <div className="auth-warning">
          <p>⚠️ Connect to Pimly (Salesforce) to search and compare products</p>
        </div>
      )}

      {error && (
        <div className="error-message">
          <span className="error-icon">❌</span>
          {error}
        </div>
      )}

      {productData && (
        <>
          {/* Status Summary */}
          <div className="search-result-summary">
            <div className={`status-indicator status-${getStatusInfo(productData.status).color}`}>
              <span className="status-icon">{getStatusInfo(productData.status).icon}</span>
              <span className="status-text">{getStatusInfo(productData.status).text}</span>
            </div>
            
            {productData.mapped_data && (
              <div className="mapping-indicator">
                <span className="mapping-icon">🗺️</span>
                <span className="mapping-text">Mapped data available</span>
              </div>
            )}
          </div>

          {/* Product Card */}
          <ProductCard productData={productData} />
          
          {/* Sync Section */}
          {productData.mismatches && productData.mismatches.length > 0 && (
            <div className="sync-section">
              <div className="sync-info">
                <h3>Data Synchronization</h3>
                <p className="sync-description">
                  Found {productData.mismatches.length} difference{productData.mismatches.length > 1 ? 's' : ''} between Pimly and Krowne data.
                </p>
              </div>
              <button 
                onClick={handleSync} 
                className="sync-btn" 
                disabled={loading}
                title="Sync mismatched data from Krowne to Pimly"
              >
                {loading ? 'Syncing...' : `Sync ${productData.mismatches.length} Difference${productData.mismatches.length > 1 ? 's' : ''}`}
              </button>
            </div>
          )}

          {/* Success Message for Synchronized Products */}
          {productData.salesforce && productData.status === 'data_matches' && (
            <div className="success-message">
              <span className="success-icon">✅</span>
              Product data is synchronized between Pimly and Krowne
            </div>
          )}

          {/* Info Message for Single Source Products */}
          {(productData.status === 'missing_from_krowne' || productData.status === 'missing_from_salesforce') && (
            <div className="info-message">
              <span className="info-icon">ℹ️</span>
              {productData.status === 'missing_from_krowne' 
                ? 'Product found in Pimly but not on Krowne website'
                : 'Product found on Krowne website but not in Pimly'
              }
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default SKUSearch;