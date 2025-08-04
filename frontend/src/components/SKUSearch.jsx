import React, { useState, useEffect, useCallback } from 'react';
import ProductCard from './ProductCard';
import api from '../services/api';

const SKUSearch = ({ onSearch, searchedSKU, salesforceAuth }) => {
  const [sku, setSku] = useState(searchedSKU || '');
  const [productData, setProductData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSearch = useCallback(async (searchSku = sku) => {
    if (!searchSku.trim()) return;

    if (!salesforceAuth.authenticated) {
      setError('Please connect to Pimly (Salesforce) to search products');
      return;
    }

    setLoading(true);
    setError(null);
    setProductData(null);

    try {
      const searchResults = await api.searchPimlyProducts(searchSku, 1);

      if (!searchResults.products || searchResults.products.length === 0) {
        setError('Product not found in Pimly');
        return;
      }

      const pimlyProduct = searchResults.products[0];

      const comparisonResult = await api.compareProducts({
        source_type: 'pimly',
        limit: 1,
        search: searchSku
      });

      const productComparison = comparisonResult.results?.find(
        r => r.product_id === pimlyProduct.ProductCode || r.product_id === searchSku
      );

      let krowneData = null;
      const mismatches = [];

      if (productComparison && productComparison.status !== 'missing_from_krowne') {
        krowneData = {
          name: productComparison.krowne_name || productComparison.name,
          price: productComparison.krowne_price,
          description: productComparison.krowne_description,
          url: productComparison.krowne_url,
          image: productComparison.krowne_image
        };

        if (productComparison.differences?.length) {
          productComparison.differences.forEach(diff => {
            if (diff.includes('Price')) {
              mismatches.push({
                field: 'price',
                pimly: pimlyProduct.ListPrice || pimlyProduct.UnitPrice,
                krowne: krowneData.price
              });
            } else if (diff.includes('Name')) {
              mismatches.push({
                field: 'name',
                pimly: pimlyProduct.Name,
                krowne: krowneData.name
              });
            } else if (diff.includes('Description')) {
              mismatches.push({
                field: 'description',
                pimly: pimlyProduct.Description,
                krowne: krowneData.description
              });
            }
          });
        }
      }

      setProductData({
        sku: searchSku,
        salesforce: pimlyProduct,
        krowne: krowneData,
        mismatches
      });

      onSearch(searchSku);
    } catch (err) {
      setError(err.message || 'Failed to fetch product data');
    } finally {
      setLoading(false);
    }
  }, [sku, salesforceAuth.authenticated, onSearch]);

  useEffect(() => {
    if (searchedSKU && searchedSKU !== sku) {
      setSku(searchedSKU);
      handleSearch(searchedSKU);
    }
  }, [searchedSKU, sku, handleSearch]);

  const handleSync = async () => {
    if (!productData || productData.mismatches.length === 0) return;

    setLoading(true);
    setError(null);

    try {
      await api.syncProduct(productData.sku, productData.mismatches);
      // Refresh the product data after sync
      await handleSearch();
    } catch (err) {
      setError(err.message || 'Failed to sync product');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="sku-search-container">
      <div className="search-box">
        <input
          type="text"
          placeholder="Enter SKU to search..."
          value={sku}
          onChange={(e) => setSku(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
          className="sku-input"
        />
        <button 
          onClick={() => handleSearch()}
          disabled={loading || !salesforceAuth.authenticated}
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
          {error}
        </div>
      )}

      {productData && (
        <>
          <ProductCard productData={productData} />
          
          {productData.mismatches.length > 0 && (
            <div className="sync-section">
              <button onClick={handleSync} className="sync-btn" disabled={loading}>
                {loading ? 'Syncing...' : `Sync ${productData.mismatches.length} Mismatch${productData.mismatches.length > 1 ? 'es' : ''}`}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default SKUSearch;
