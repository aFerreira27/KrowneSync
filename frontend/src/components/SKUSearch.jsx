import React, { useState, useEffect, useRef } from 'react';
import ProductCard from './ProductCard';
import api from '../services/api';

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
      
      // Search Pimly products
      const searchResults = await api.searchPimlyProducts(skuToSearch, 1);
      console.log('Pimly search results:', searchResults);

      let pimlyProduct = null;
      let krowneData = null;
      let mismatches = [];

      // Handle Pimly product data
      if (searchResults.products && searchResults.products.length > 0) {
        pimlyProduct = searchResults.products[0];
        console.log('Found Pimly product:', pimlyProduct);
      }

      // Try to get comparison data from Krowne regardless of Pimly results
      try {
        let comparisonResult;
        
        if (pimlyProduct) {
          // If we have a Pimly product, use it for comparison
          comparisonResult = await api.compareProducts([skuToSearch]);

        }

        console.log('Comparison results:', comparisonResult);

        if (comparisonResult.results?.length > 0) {
          const productComparison = comparisonResult.results[0];
          
          // Check if this is the right product match
          if (pimlyProduct) {
            const isMatch = productComparison.product_id === pimlyProduct.ProductCode || 
                           productComparison.product_id === skuToSearch ||
                           productComparison.sku === skuToSearch;
            
            if (isMatch && productComparison.status !== 'missing_from_krowne') {
              krowneData = {
                name: productComparison.krowne_name || productComparison.name,
                price: productComparison.krowne_price,
                description: productComparison.krowne_description,
                url: productComparison.krowne_url,
                image: productComparison.krowne_image
              };

              // Process differences/mismatches
              if (productComparison.differences?.length > 0) {
                productComparison.differences.forEach(diff => {
                  const diffLower = diff.toLowerCase();
                  
                  if (diffLower.includes('price')) {
                    const pimlyPrice = pimlyProduct.ListPrice || 
                                     pimlyProduct.UnitPrice || 
                                     pimlyProduct.Price ||
                                     pimlyProduct.pimly__List_Price__c ||
                                     pimlyProduct.StandardPrice;
                    
                    mismatches.push({
                      field: 'price',
                      pimly: pimlyPrice,
                      krowne: krowneData.price
                    });
                  } else if (diffLower.includes('name') || diffLower.includes('title')) {
                    mismatches.push({
                      field: 'name',
                      pimly: pimlyProduct.Name,
                      krowne: krowneData.name
                    });
                  } else if (diffLower.includes('description')) {
                    const pimlyDescription = pimlyProduct.Description || 
                                            pimlyProduct.Product_Description__c ||
                                            pimlyProduct.pimly__Description__c ||
                                            pimlyProduct.LongDescription;
                    
                    mismatches.push({
                      field: 'description',
                      pimly: pimlyDescription,
                      krowne: krowneData.description
                    });
                  }
                });
              }
            }
          } else {
            // No Pimly product, just get Krowne data
            krowneData = {
              name: productComparison.krowne_name || productComparison.name,
              price: productComparison.krowne_price,
              description: productComparison.krowne_description,
              url: productComparison.krowne_url,
              image: productComparison.krowne_image
            };
          }
        }
      } catch (comparisonError) {
        console.warn('Could not fetch comparison data:', comparisonError);
        // Continue without comparison data
      }

      // Check if we found any data at all
      if (!pimlyProduct && !krowneData) {
        setError('Product not found in either Pimly or Krowne');
        if (onSearch) {
          onSearch(skuToSearch);
        }
        return;
      }

      // Structure the product data for the ProductCard
      const structuredProductData = {
        sku: skuToSearch,
        salesforce: pimlyProduct ? {
          // Core fields
          Id: pimlyProduct.Id,
          Name: pimlyProduct.Name,
          ProductCode: pimlyProduct.ProductCode || skuToSearch,
          Description: pimlyProduct.Description,
          
          // Price fields
          ListPrice: pimlyProduct.ListPrice,
          UnitPrice: pimlyProduct.UnitPrice,
          Price: pimlyProduct.Price,
          StandardPrice: pimlyProduct.StandardPrice,
          
          // Status and categorization
          IsActive: pimlyProduct.IsActive,
          Family: pimlyProduct.Family,
          
          // Custom Pimly fields
          Product_Description__c: pimlyProduct.Product_Description__c,
          LongDescription: pimlyProduct.LongDescription,
          
          // Include all other Pimly-specific fields
          ...Object.keys(pimlyProduct).reduce((acc, key) => {
            if (key.startsWith('pimly__')) {
              acc[key] = pimlyProduct[key];
            }
            return acc;
          }, {}),
          
          // Include any other fields not already covered
          ...Object.keys(pimlyProduct).reduce((acc, key) => {
            const excludedFields = [
              'Id', 'Name', 'ProductCode', 'Description', 'ListPrice', 
              'UnitPrice', 'Price', 'StandardPrice', 'IsActive', 'Family',
              'Product_Description__c', 'LongDescription'
            ];
            
            if (!excludedFields.includes(key) && !key.startsWith('pimly__')) {
              acc[key] = pimlyProduct[key];
            }
            return acc;
          }, {})
        } : null,
        krowne: krowneData,
        mismatches: mismatches
      };

      console.log('Structured product data:', structuredProductData);
      setProductData(structuredProductData);
      
      // Call parent's onSearch callback if provided
      if (onSearch) {
        onSearch(skuToSearch);
      }

    } catch (err) {
      console.error('Search error:', err);
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
  }, [searchedSKU]); // Remove handleSearch from dependencies

  const handleSync = async () => {
    if (!productData || productData.mismatches.length === 0) {
      setError('No mismatches to sync');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      console.log('Syncing product:', productData.sku, productData.mismatches);
      await api.syncProduct(productData.sku, productData.mismatches);
      
      // Refresh the product data after sync
      await handleSearch(productData.sku);
      
      // Show success message
      setError(null);
      console.log('Product synced successfully');
      
    } catch (err) {
      console.error('Sync error:', err);
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
          <ProductCard productData={productData} />
          
          {productData.mismatches.length > 0 && (
            <div className="sync-section">
              <button 
                onClick={handleSync} 
                className="sync-btn" 
                disabled={loading}
              >
                {loading ? 'Syncing...' : `Sync ${productData.mismatches.length} Mismatch${productData.mismatches.length > 1 ? 'es' : ''}`}
              </button>
              <p className="sync-description">
                This will update the Pimly data to match the Krowne website information.
              </p>
            </div>
          )}

          {productData.salesforce && productData.mismatches.length === 0 && (
            <div className="success-message">
              <span className="success-icon">✅</span>
              Product data is synchronized between Pimly and Krowne
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default SKUSearch;