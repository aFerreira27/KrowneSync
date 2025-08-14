import React, { useState, useEffect, useCallback } from 'react';
import './ProductSyncWorkflow.css';
import ProductCard from '../ProductCard/ProductCard';
import api from '../../services/api';

function ProductSyncWorkflow({ 
  category, 
  products = [], 
  onClose, 
  onSelectProduct,
  formatCategoryName,
  getCategoryIcon,
  onSyncComplete 
}) {
  const [currentProductIndex, setCurrentProductIndex] = useState(0);
  const [comparisonData, setComparisonData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [sortedProducts, setSortedProducts] = useState([]);
  const [syncedCount, setSyncedCount] = useState(0);
  const [skippedCount, setSkippedCount] = useState(0);
  const [completedProducts, setCompletedProducts] = useState(new Set());
  const [error, setError] = useState(null);

  // Sort products by last sync date (least recent first)
  useEffect(() => {
    const sorted = [...products].sort((a, b) => {
      const aDate = a.last_sync_date ? new Date(a.last_sync_date).getTime() : 0;
      const bDate = b.last_sync_date ? new Date(b.last_sync_date).getTime() : 0;
      return aDate - bDate; // Oldest first
    });
    setSortedProducts(sorted);
    setCurrentProductIndex(0);
  }, [products]);

  // Load comparison data for current product
  const loadComparisonData = useCallback(async (productIndex) => {
    if (productIndex >= sortedProducts.length) return;
    
    const product = sortedProducts[productIndex];
    setLoading(true);
    setComparisonData(null);
    setError(null);

    try {
      const data = await api.compareSingleProduct(product.sku);
      setComparisonData(data);
    } catch (error) {
      console.error(`Failed to load comparison for ${product.sku}:`, error);
      setError(`Failed to load comparison for ${product.sku}: ${error.message}`);
      setComparisonData(null);
    } finally {
      setLoading(false);
    }
  }, [sortedProducts]);

  // Load initial product data
  useEffect(() => {
    if (sortedProducts.length > 0) {
      loadComparisonData(0);
    }
  }, [sortedProducts, loadComparisonData]);

  // Preload next product data in background
  useEffect(() => {
    const nextIndex = currentProductIndex + 1;
    if (nextIndex < sortedProducts.length && !loading) {
      // Preload next product data in the background
      const preloadNext = async () => {
        try {
          const nextProduct = sortedProducts[nextIndex];
          await api.compareSingleProduct(nextProduct.sku);
        } catch (error) {
          console.log(`Preload failed for ${sortedProducts[nextIndex]?.sku}:`, error);
        }
      };
      
      const timer = setTimeout(preloadNext, 1000);
      return () => clearTimeout(timer);
    }
  }, [currentProductIndex, sortedProducts, loading]);

  const handleConfirmSync = async () => {
    const currentProduct = sortedProducts[currentProductIndex];
    
    try {
      // Record the sync operation with uppercase SKU
      await api.recordSync(currentProduct.sku.toUpperCase(), 'success', {
        category,
        triggered_by: 'manual_workflow_sync',
        comparison_data: comparisonData,
        timestamp: new Date().toISOString()
      });
      
      setSyncedCount(prev => prev + 1);
      setCompletedProducts(prev => new Set([...prev, currentProduct.sku]));
      
      // Move to next product
      moveToNextProduct();
    } catch (error) {
      console.error(`Failed to sync ${currentProduct.sku}:`, error);
      alert(`Failed to sync ${currentProduct.sku}. Please try again.`);
    }
  };

  const handleSkip = () => {
    const currentProduct = sortedProducts[currentProductIndex];
    setSkippedCount(prev => prev + 1);
    setCompletedProducts(prev => new Set([...prev, currentProduct.sku]));
    moveToNextProduct();
  };

  const handleViewDetails = () => {
    const currentProduct = sortedProducts[currentProductIndex];
    if (onSelectProduct) {
      onSelectProduct(currentProduct.sku);
    }
  };

  const moveToNextProduct = () => {
    const nextIndex = currentProductIndex + 1;
    if (nextIndex >= sortedProducts.length) {
      // Workflow complete
      if (onSyncComplete) {
        onSyncComplete({
          category,
          totalProducts: sortedProducts.length,
          syncedCount,
          skippedCount: skippedCount + 1 // +1 for current action
        });
      }
      onClose();
      return;
    }

    setCurrentProductIndex(nextIndex);
    loadComparisonData(nextIndex);
  };

  const handleClose = () => {
    const confirmed = window.confirm(
      `Are you sure you want to close the sync workflow?\n\nProgress:\n- ${syncedCount} products synced\n- ${skippedCount} products skipped\n- ${sortedProducts.length - currentProductIndex} products remaining`
    );
    
    if (confirmed) {
      onClose();
    }
  };

  const getLastSyncInfo = (product) => {
    if (!product.last_sync_date) {
      return { text: 'Never synced', color: 'never' };
    }
    
    const lastSync = new Date(product.last_sync_date);
    const now = new Date();
    const daysSinceSync = (now - lastSync) / (1000 * 60 * 60 * 24);
    
    if (daysSinceSync <= 7) {
      return { text: `${Math.floor(daysSinceSync)} days ago`, color: 'recent' };
    } else if (daysSinceSync <= 30) {
      return { text: `${Math.floor(daysSinceSync)} days ago`, color: 'old' };
    } else {
      return { text: `${Math.floor(daysSinceSync)} days ago`, color: 'stale' };
    }
  };

  if (sortedProducts.length === 0) {
    return (
      <div className="workflow-overlay">
        <div className="workflow-container">
          <div className="no-products">
            <h2>No products to sync</h2>
            <p>All products in this category are up to date.</p>
            <button className="close-btn" onClick={onClose}>Close</button>
          </div>
        </div>
      </div>
    );
  }

  const currentProduct = sortedProducts[currentProductIndex];
  const syncInfo = getLastSyncInfo(currentProduct);

  return (
    <div className="workflow-overlay">
      <div className="workflow-container">
        <div className="workflow-header">
          <div className="category-info">
            <span className="category-icon">{getCategoryIcon(category)}</span>
            <div className="category-details">
              <h1>Sync Workflow: {formatCategoryName(category)}</h1>
              <p>Review and sync products one by one</p>
            </div>
          </div>
          
          <div className="workflow-stats">
            <div className="stat-item">
              <span className="stat-number">{syncedCount}</span>
              <span className="stat-label">Synced</span>
            </div>
            <div className="stat-item">
              <span className="stat-number">{skippedCount}</span>
              <span className="stat-label">Skipped</span>
            </div>
            <div className="stat-item">
              <span className="stat-number">{sortedProducts.length - currentProductIndex - 1}</span>
              <span className="stat-label">Remaining</span>
            </div>
          </div>

          <button className="workflow-close" onClick={handleClose}>✕</button>
        </div>

        <div className="workflow-content">
          <div className="product-workflow-card">
            {/* Product Progress Info */}
            <div className="product-progress">
              <div className="progress-header">
                <h3>Product {currentProductIndex + 1} of {sortedProducts.length}: {currentProduct.sku}</h3>
                <div className={`sync-badge ${syncInfo.color}`}>
                  <span className="sync-text">Last sync: {syncInfo.text}</span>
                </div>
              </div>
              
              <div className="progress-bar-container">
                <div className="progress-bar">
                  <div 
                    className="progress-fill" 
                    style={{ width: `${((currentProductIndex + 1) / sortedProducts.length) * 100}%` }}
                  ></div>
                </div>
                <span className="progress-text">
                  {Math.round(((currentProductIndex + 1) / sortedProducts.length) * 100)}% Complete
                </span>
              </div>
            </div>

            {/* Product Card or Loading/Error State */}
            {loading ? (
              <div className="loading-state">
                <div className="loading-spinner"></div>
                <h3>Loading comparison for {currentProduct.sku}...</h3>
                <p>Fetching data from Pimly and Krowne</p>
              </div>
            ) : error ? (
              <div className="error-state">
                <div className="error-content">
                  <h3>❌ {error}</h3>
                  <p>Could not fetch comparison data for this product.</p>
                </div>
              </div>
            ) : comparisonData ? (
              <ProductCard 
                productData={comparisonData}
                onSync={handleConfirmSync}
                onNavigateToSort={() => {
                  // Close workflow and let parent handle navigation to sort
                  onClose();
                }}
              />
            ) : (
              <div className="no-data-state">
                <h3>No comparison data available</h3>
                <p>Unable to load product information for {currentProduct.sku}</p>
              </div>
            )}

            {/* Workflow Action Buttons */}
            <div className="workflow-actions">
              <button 
                className="action-btn skip"
                onClick={handleSkip}
                disabled={loading}
              >
                ⏭️ Skip This Product
              </button>
              
              <button 
                className="action-btn primary"
                onClick={handleConfirmSync}
                disabled={loading || error || !comparisonData}
              >
                ✅ Confirm Sync
              </button>
            </div>
          </div>
        </div>

        <div className="workflow-footer">
          <div className="footer-info">
            <span>Processing {formatCategoryName(category)} products</span>
            <span>•</span>
            <span>Products sorted by last sync date (oldest first)</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ProductSyncWorkflow;