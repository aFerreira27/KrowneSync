// Enhanced ProductCard.jsx - Fixed field mapping and comparison

import React, { useState, useEffect } from 'react';
import './ProductCard.css';

const ProductCard = ({ productData }) => {
  const [activeTab, setActiveTab] = useState('comparison');
  const [expandedSections, setExpandedSections] = useState({});
  const [mismatches, setMismatches] = useState([]);

  // Calculate mismatches when product data changes
  useEffect(() => {
    if (productData?.salesforce && productData?.krowne) {
      const foundMismatches = [];
      const { salesforce, krowne } = productData;
      
      // Compare all available fields dynamically
      const allFields = getAllComparisonFields();
      
      allFields.forEach(field => {
        if (field.sf && field.krowne && field.sf !== field.krowne) {
          // Special handling for price comparison
          if (field.key === 'price') {
            const sfPriceNum = parseFloat(String(field.sf).replace(/[^\d.]/g, ''));
            const krownePriceNum = parseFloat(String(field.krowne).replace(/[^\d.]/g, ''));
            if (!isNaN(sfPriceNum) && !isNaN(krownePriceNum) && Math.abs(sfPriceNum - krownePriceNum) > 0.01) {
              foundMismatches.push({
                field: field.label,
                salesforce: formatPrice(field.sf),
                krowne: formatPrice(field.krowne)
              });
            }
          } else {
            // General comparison for other fields
            const sfValue = String(field.sf).toLowerCase().trim();
            const krowneValue = String(field.krowne).toLowerCase().trim();
            if (sfValue !== krowneValue) {
              foundMismatches.push({
                field: field.label,
                salesforce: field.sf,
                krowne: field.krowne
              });
            }
          }
        }
      });
      
      setMismatches(foundMismatches);
    } else {
      setMismatches([]);
    }
  }, [productData?.salesforce, productData?.krowne]);

  // Early return AFTER all hooks
  if (!productData) {
    return (
      <div className="product-card">
        <div className="no-data">No product data available</div>
      </div>
    );
  }

  const { sku, salesforce, krowne } = productData;

  // Format price display
  const formatPrice = (price) => {
    if (!price && price !== 0) return 'N/A';
    if (typeof price === 'number') return `$${price.toFixed(2)}`;
    if (typeof price === 'string') {
      // If it already has $ symbol, return as is
      if (price.includes('$')) return price;
      const cleanPrice = price.replace(/\s+/g, '').replace('$', '');
      const numericPrice = parseFloat(cleanPrice);
      if (!isNaN(numericPrice)) return `$${numericPrice.toFixed(2)}`;
      return price;
    }
    return String(price);
  };

  // Extract property value from properties array
  const getPropertyValue = (properties, propertyName) => {
    if (!properties || !Array.isArray(properties)) return null;
    const prop = properties.find(p => 
      p.propertyAdminName === propertyName || 
      p.propertyName === propertyName
    );
    return prop?.value || null;
  };

  // Helper function to get Krowne value by key
  const getKrowneValueByKey = (key) => {
    if (!krowne) return null;
    
    // Direct field mapping
    const directMap = {
      'name': krowne.name,
      'price': krowne.price,
      'description': krowne.description,
      'Product_Description': krowne.description,
      'series': krowne.series,
      'Series': krowne.series,
      'warranty': krowne.warranty,
      'Warranty': krowne.warranty,
      'List_Price': krowne.listPrice || krowne.price,
      'Product_Code': krowne.productCode,
      'SKU': krowne.productCode || sku,
      'sku': krowne.productCode || sku
    };
    
    if (directMap[key] !== undefined) {
      return directMap[key];
    }
    
    // Check properties array for specifications
    if (krowne.properties && Array.isArray(krowne.properties)) {
      const prop = krowne.properties.find(p => 
        p.propertyAdminName === key || 
        p.propertyName === key ||
        p.propertyAdminName === key.replace(/ /g, '_') ||
        p.propertyName === key.replace(/_/g, ' ')
      );
      if (prop) return prop.value;
    }
    
    return null;
  };

  // Format field values for display
  const formatFieldValue = (value, fieldKey) => {
    if (!value && value !== 0) return null;
    
    if (fieldKey === 'price' || fieldKey.includes('Price')) {
      return formatPrice(value);
    }
    
    if (Array.isArray(value)) {
      return value.join(', ');
    }
    
    if (typeof value === 'object') {
      return JSON.stringify(value, null, 2);
    }
    
    return String(value);
  };

  // Get ALL comparison fields dynamically - ENHANCED
  const getAllComparisonFields = () => {
    const fields = [];
    const addedFields = new Set(); // Prevent duplicates

    // Core fields (avoid duplicate SKU)
    const coreFields = [
      { key: 'name', label: 'Product Name', sf: salesforce?.name, krowne: krowne?.name },
      { key: 'price', label: 'Price', sf: getPropertyValue(salesforce?.properties, 'List_Price'), krowne: krowne?.price },
      { key: 'description', label: 'Description', sf: getPropertyValue(salesforce?.properties, 'Product_Description'), krowne: krowne?.description },
      { key: 'series', label: 'Series', sf: getPropertyValue(salesforce?.properties, 'Series'), krowne: krowne?.series },
      { key: 'warranty', label: 'Warranty', sf: getPropertyValue(salesforce?.properties, 'Warranty'), krowne: krowne?.warranty }
    ];

    coreFields.forEach(field => {
      if (field.sf || field.krowne) {
        fields.push(field);
        addedFields.add(field.key);
      }
    });

    // Add all Salesforce properties
    if (salesforce?.properties && Array.isArray(salesforce.properties)) {
      salesforce.properties.forEach(prop => {
        const fieldKey = prop.propertyAdminName || prop.propertyName;
        if (fieldKey && !addedFields.has(fieldKey) && fieldKey !== 'SKU' && fieldKey !== 'sku') { // Avoid duplicate SKU
          const krowneValue = getKrowneValueByKey(fieldKey);
          fields.push({
            key: fieldKey,
            label: prop.propertyName || fieldKey.replace(/_/g, ' '),
            sf: prop.value,
            krowne: krowneValue
          });
          addedFields.add(fieldKey);
        }
      });
    }

    // Add Krowne-specific fields that aren't in Salesforce
    if (krowne) {
      const krowneFields = [
        { key: 'mainImageUrl', label: 'Main Image URL', value: krowne.mainImageUrl },
        { key: 'categories', label: 'Categories', value: krowne.categories?.map(c => c.name).join(', ') },
        { key: 'relatedProducts', label: 'Related Products', value: krowne.relatedProducts?.length > 0 ? `${krowne.relatedProducts.length} products` : null },
        { key: 'downloads', label: 'Downloads', value: krowne.downloads?.length > 0 ? `${krowne.downloads.length} files` : null },
        { key: 'specSheetUrl', label: 'Spec Sheet URL', value: krowne.specSheetUrl },
        { key: 'warrantyInfo', label: 'Warranty Info URL', value: krowne.warrantyInfo },
        { key: 'productCode', label: 'Product Code', value: krowne.productCode }
      ];

      krowneFields.forEach(field => {
        if (field.value && !addedFields.has(field.key)) {
          fields.push({
            key: field.key,
            label: field.label,
            sf: null,
            krowne: field.value
          });
          addedFields.add(field.key);
        }
      });

      // Add Krowne properties that aren't already covered
      if (krowne.properties && Array.isArray(krowne.properties)) {
        krowne.properties.forEach(prop => {
          const fieldKey = prop.propertyAdminName || prop.propertyName;
          if (fieldKey && !addedFields.has(fieldKey)) {
            const sfValue = getPropertyValue(salesforce?.properties, fieldKey);
            fields.push({
              key: fieldKey,
              label: prop.propertyName || fieldKey.replace(/_/g, ' '),
              sf: sfValue,
              krowne: prop.value
            });
            addedFields.add(fieldKey);
          }
        });
      }
    }

    // Add any direct Salesforce fields not in properties (but avoid duplicate SKU)
    if (salesforce) {
      const directFields = [
        { key: 'productId', label: 'Product ID', value: salesforce.Id },
        { key: 'isActive', label: 'Active Status', value: salesforce.IsActive },
        { key: 'family', label: 'Product Family', value: salesforce.Family }
      ];

      directFields.forEach(field => {
        if (field.value && !addedFields.has(field.key)) {
          fields.push({
            key: field.key,
            label: field.label,
            sf: field.value,
            krowne: null
          });
          addedFields.add(field.key);
        }
      });
    }

    return fields;
  };

  return (
    <div className="product-card">
      {/* Header Section */}
      <div className="product-header">
        <div className="header-left">
          <h1 className="product-title">Product Details</h1>
          <p className="product-sku">SKU: {sku}</p>
          {(salesforce?.name || krowne?.name) && (
            <p className="product-name">{salesforce?.name || krowne?.name}</p>
          )}
        </div>
        <div className="header-right">
          {(getPropertyValue(salesforce?.properties, 'List_Price') || krowne?.price) && (
            <>
              <p className="price-display">
                {formatPrice(getPropertyValue(salesforce?.properties, 'List_Price') || krowne?.price)}
              </p>
              <p className="price-label">List Price</p>
            </>
          )}
          {mismatches.length > 0 && (
            <div className="mismatch-badge">
              {mismatches.length} Mismatch{mismatches.length !== 1 ? 'es' : ''}
            </div>
          )}
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="tab-navigation">
        <button 
          className={`tab-btn ${activeTab === 'comparison' ? 'active' : ''}`}
          onClick={() => setActiveTab('comparison')}
        >
          Comparison ({getAllComparisonFields().length} fields)
        </button>
        {salesforce && (
          <button 
            className={`tab-btn ${activeTab === 'salesforce' ? 'active' : ''}`}
            onClick={() => setActiveTab('salesforce')}
          >
            Pimly/Salesforce
          </button>
        )}
        {krowne && (
          <button 
            className={`tab-btn ${activeTab === 'krowne' ? 'active' : ''}`}
            onClick={() => setActiveTab('krowne')}
          >
            Krowne Website
          </button>
        )}
      </div>

      {/* Tab Content */}
      <div className="tab-content">
        {/* Comparison Tab - Show ALL Fields */}
        {activeTab === 'comparison' && (
          <div>
            {/* Summary Stats */}
            <div className="comparison-summary">
              <h3>Complete Field Comparison</h3>
              <div className="summary-stats">
                <div>
                  <strong>Total Fields:</strong> {getAllComparisonFields().length}
                </div>
                <div className={mismatches.length > 0 ? 'text-danger' : 'text-success'}>
                  <strong>Mismatches:</strong> {mismatches.length}
                </div>
                <div className="text-success">
                  <strong>Matches:</strong> {getAllComparisonFields().length - mismatches.length}
                </div>
                <div className="text-info">
                  <strong>Pimly Fields:</strong> {getAllComparisonFields().filter(f => f.sf).length}
                </div>
                <div className="text-info">
                  <strong>Krowne Fields:</strong> {getAllComparisonFields().filter(f => f.krowne).length}
                </div>
              </div>
            </div>

            {/* Detailed Comparison Table - ALL FIELDS */}
            <div className="table-container">
              <table className="comparison-table">
                <thead>
                  <tr>
                    <th className="field-column">Field</th>
                    <th className="value-column">Pimly (Salesforce)</th>
                    <th className="value-column">Krowne Website</th>
                    <th className="status-column">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {getAllComparisonFields().map((field, idx) => {
                    const mismatch = mismatches.find(m => m.field.toLowerCase() === field.label.toLowerCase());
                    const isMatch = field.sf && field.krowne && !mismatch;
                    const hasData = field.sf || field.krowne;
                    const formattedSfValue = formatFieldValue(field.sf, field.key);
                    const formattedKrowneValue = formatFieldValue(field.krowne, field.key);
                    
                    return (
                      <tr key={idx} className={mismatch ? 'mismatch-row' : ''}>
                        <td className="field-column">
                          <strong>{field.label}</strong>
                          <div className="field-key">{field.key}</div>
                        </td>
                        <td className="value-column">
                          {formattedSfValue ? (
                            <div className="field-value">{formattedSfValue}</div>
                          ) : (
                            <span className="missing-data">No data</span>
                          )}
                        </td>
                        <td className="value-column">
                          {formattedKrowneValue ? (
                            <div className="field-value">{formattedKrowneValue}</div>
                          ) : (
                            <span className="missing-data">No data</span>
                          )}
                        </td>
                        <td className="status-column">
                          {mismatch ? (
                            <span className="mismatch-indicator">⚠️ Mismatch</span>
                          ) : isMatch ? (
                            <span className="match-indicator">✅ Match</span>
                          ) : hasData ? (
                            <span className="partial-indicator">📝 Partial</span>
                          ) : (
                            <span className="no-data-indicator">❌ No Data</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mismatch Details */}
            {mismatches.length > 0 && (
              <div className="mismatch-details">
                <h4>🔍 Mismatch Details</h4>
                <div className="mismatch-list">
                  {mismatches.map((mismatch, idx) => (
                    <div key={idx} className="mismatch-item">
                      <div className="mismatch-field">
                        <strong>{mismatch.field}</strong>
                      </div>
                      <div className="mismatch-comparison">
                        <div className="pimly-value">
                          <strong>Pimly:</strong> {mismatch.salesforce}
                        </div>
                        <div className="comparison-operator">≠</div>
                        <div className="krowne-value">
                          <strong>Krowne:</strong> {mismatch.krowne}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Salesforce Tab */}
        {activeTab === 'salesforce' && salesforce && (
          <div className="data-source">
            <div className="source-header">
              <span className="source-icon">🏢</span>
              <span className="source-title">Pimly/Salesforce Data</span>
            </div>
            <div className="source-content">
              <div className="field-grid">
                <div className="field-item">
                  <label>Product Name:</label>
                  <value>{salesforce.name || 'N/A'}</value>
                </div>
                <div className="field-item">
                  <label>Product ID:</label>
                  <value>{salesforce.Id || 'N/A'}</value>
                </div>
                {salesforce.properties && salesforce.properties.map((prop, idx) => (
                  <div key={idx} className="field-item">
                    <label>{prop.propertyName || prop.propertyAdminName}:</label>
                    <value>{prop.value || 'N/A'}</value>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Krowne Tab */}
        {activeTab === 'krowne' && krowne && (
          <div className="data-source">
            <div className="source-header">
              <span className="source-icon">🌐</span>
              <span className="source-title">Krowne Website Data</span>
            </div>
            <div className="source-content">
              <div className="field-grid">
                <div className="field-item">
                  <label>Product Name:</label>
                  <value>{krowne.name || 'N/A'}</value>
                </div>
                <div className="field-item">
                  <label>Price:</label>
                  <value>{formatPrice(krowne.price)}</value>
                </div>
                <div className="field-item">
                  <label>Series:</label>
                  <value>{krowne.series || 'N/A'}</value>
                </div>
                <div className="field-item">
                  <label>Warranty:</label>
                  <value>{krowne.warranty || 'N/A'}</value>
                </div>
                {krowne.description && (
                  <div className="field-item full-width">
                    <label>Description:</label>
                    <value>{krowne.description}</value>
                  </div>
                )}
                {krowne.properties && krowne.properties.map((prop, idx) => (
                  <div key={idx} className="field-item">
                    <label>{prop.propertyName}:</label>
                    <value>{prop.value || 'N/A'}</value>
                  </div>
                ))}
                {krowne.mainImageUrl && (
                  <div className="field-item">
                    <label>Image:</label>
                    <img src={krowne.mainImageUrl} alt={krowne.name} className="product-image" />
                  </div>
                )}
                {krowne.relatedProducts && krowne.relatedProducts.length > 0 && (
                  <div className="field-item full-width">
                    <label>Related Products ({krowne.relatedProducts.length}):</label>
                    <div className="related-products-grid">
                      {krowne.relatedProducts.slice(0, 6).map((product, idx) => (
                        <div key={idx} className="related-product-card">
                          <img src={product.imageUrl} alt={product.name} />
                          <div>{product.name}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ProductCard;