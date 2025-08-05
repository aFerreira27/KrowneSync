import React, { useState, useEffect } from 'react';
import './ProductCard.css';

const ProductCard = ({ productData }) => {
  const [activeTab, setActiveTab] = useState('overview');
  const [expandedSections, setExpandedSections] = useState({});
  const [mismatches, setMismatches] = useState([]);

  // Move all hooks to the top, before any conditional logic
  // Calculate mismatches when data changes
  useEffect(() => {
    if (productData?.salesforce && productData?.krowne) {
      const { salesforce, krowne } = productData;
      const foundMismatches = [];
      
      // Compare names
      if (salesforce.name && krowne.name && salesforce.name.toLowerCase() !== krowne.name.toLowerCase()) {
        foundMismatches.push({
          field: 'Name',
          salesforce: salesforce.name,
          krowne: krowne.name
        });
      }
      
      // Compare prices
      const sfPrice = getPropertyValue(salesforce.properties, 'List_Price');
      if (sfPrice && krowne.price) {
        const sfPriceNum = parseFloat(String(sfPrice).replace(/[^\d.]/g, ''));
        const krownePriceNum = parseFloat(String(krowne.price).replace(/[^\d.]/g, ''));
        if (!isNaN(sfPriceNum) && !isNaN(krownePriceNum) && Math.abs(sfPriceNum - krownePriceNum) > 0.01) {
          foundMismatches.push({
            field: 'Price',
            salesforce: formatPrice(sfPrice),
            krowne: formatPrice(krowne.price)
          });
        }
      }
      
      // Compare descriptions
      const sfDescription = getPropertyValue(salesforce.properties, 'Product_Description');
      if (sfDescription && krowne.description && sfDescription !== krowne.description) {
        foundMismatches.push({
          field: 'Description',
          salesforce: sfDescription,
          krowne: krowne.description
        });
      }

      // Compare series
      const sfSeries = getPropertyValue(salesforce.properties, 'Series');
      if (sfSeries && krowne.series && sfSeries.toLowerCase() !== krowne.series.toLowerCase()) {
        foundMismatches.push({
          field: 'Series',
          salesforce: sfSeries,
          krowne: krowne.series
        });
      }

      // Compare warranty
      const sfWarranty = getPropertyValue(salesforce.properties, 'Warranty');
      if (sfWarranty && krowne.warranty && sfWarranty.toLowerCase() !== krowne.warranty.toLowerCase()) {
        foundMismatches.push({
          field: 'Warranty',
          salesforce: sfWarranty,
          krowne: krowne.warranty
        });
      }
      
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

  // Toggle section expansion
  const toggleSection = (section) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  // Format price display
  const formatPrice = (price) => {
    if (!price && price !== 0) return 'N/A';
    if (typeof price === 'number') return `$${price.toFixed(2)}`;
    if (typeof price === 'string') {
      const cleanPrice = price.replace(/\s+/g, '').replace('$', '');
      const numericPrice = parseFloat(cleanPrice);
      if (!isNaN(numericPrice)) return `$${numericPrice.toFixed(2)}`;
      return price;
    }
    return String(price);
  };

  // Extract key properties from the properties array
  const getPropertyValue = (properties, propertyName) => {
    if (!properties || !Array.isArray(properties)) return null;
    const prop = properties.find(p => 
      p.propertyAdminName === propertyName || 
      p.propertyName === propertyName
    );
    return prop ? prop.value : null;
  };

  // Get main image URL with fallback to Krowne
  const getMainImageUrl = () => {
    // Try Salesforce first
    if (salesforce?.mainAsset?.pimly__URL__c) {
      return salesforce.mainAsset.pimly__URL__c;
    }
    if (salesforce?.digitalAssets) {
      const imageAssets = salesforce.digitalAssets.find(da => da.propertyAdminName === 'Images');
      if (imageAssets?.assets?.[0]?.url) {
        return imageAssets.assets[0].url;
      }
    }
    // Fallback to Krowne image
    if (krowne?.mainImageUrl) {
      return krowne.mainImageUrl;
    }
    return null;
  };

  // Group properties by category
  const groupProperties = (properties) => {
    if (!properties || !Array.isArray(properties)) return {};
    
    const groups = {
      'Dimensions': ['Product_Length_(in.)', 'Product_Height_(in.)', 'Product_Depth_(in.)', 'Product_Weight_(lbs.)', 'Shipping_Weight_(lbs.)'],
      'Specifications': ['Flow_Rate_(GPM)', 'Temperature_Range', 'Inlet', 'Mounting_Style', 'Handle_Type', 'Valve_Type', 'Spout_Size_(in.)', 'Spout_Style'],
      'Pricing': ['List_Price', 'MAP_Price', 'Case_Price'],
      'Certifications': ['NSF_Certification', 'CSA_Certification', 'ASSE_Certification', 'ETL_Certification', 'UL_Certification', 'IAMPO_Certification', 'CEC_Listed_Certification', 'Massachusetts_Listed_Certification'],
      'Case Information': ['Case_Quantity', 'Case_Weight_(lbs.)', 'Case_Dimensions_(in.)'],
      'Identifiers': ['SKU', 'UPC', 'HTS_Code'],
      'Description': ['Product_Description', 'ERP_Description', 'Features'],
      'Other': []
    };

    const grouped = {};
    
    properties.forEach(prop => {
      let assigned = false;
      for (const [groupName, propNames] of Object.entries(groups)) {
        if (propNames.includes(prop.propertyAdminName)) {
          if (!grouped[groupName]) grouped[groupName] = [];
          grouped[groupName].push(prop);
          assigned = true;
          break;
        }
      }
      if (!assigned && prop.propertyAdminName !== 'Division' && prop.propertyAdminName !== 'Series') {
        if (!grouped['Other']) grouped['Other'] = [];
        grouped['Other'].push(prop);
      }
    });

    // Remove empty groups
    Object.keys(grouped).forEach(key => {
      if (!grouped[key] || grouped[key].length === 0) {
        delete grouped[key];
      }
    });

    return grouped;
  };

  // Get comparison fields for detailed comparison
  const getComparisonFields = () => {
    const fields = [
      { key: 'name', label: 'Product Name', sf: salesforce?.name, krowne: krowne?.name },
      { key: 'price', label: 'Price', sf: getPropertyValue(salesforce?.properties, 'List_Price'), krowne: krowne?.price },
      { key: 'description', label: 'Description', sf: getPropertyValue(salesforce?.properties, 'Product_Description'), krowne: krowne?.description },
      { key: 'series', label: 'Series', sf: getPropertyValue(salesforce?.properties, 'Series'), krowne: krowne?.series },
      { key: 'warranty', label: 'Warranty', sf: getPropertyValue(salesforce?.properties, 'Warranty'), krowne: krowne?.warranty }
    ];

    return fields.filter(field => field.sf || field.krowne);
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
          {(salesforce?.properties || krowne?.price) && (
            <>
              <p className="price-display">
                {formatPrice(getPropertyValue(salesforce?.properties, 'List_Price') || krowne?.price)}
              </p>
              <p className="price-label">
                {getPropertyValue(salesforce?.properties, 'List_Price') ? 'List Price' : 'Website Price'}
              </p>
            </>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="tabs">
        <button 
          className={`tab ${activeTab === 'overview' ? 'active' : ''}`}
          onClick={() => setActiveTab('overview')}
        >
          Overview
        </button>
        {salesforce?.properties && (
          <button 
            className={`tab ${activeTab === 'specifications' ? 'active' : ''}`}
            onClick={() => setActiveTab('specifications')}
          >
            Specifications
          </button>
        )}
        {salesforce?.digitalAssets && (
          <button 
            className={`tab ${activeTab === 'assets' ? 'active' : ''}`}
            onClick={() => setActiveTab('assets')}
          >
            Digital Assets
          </button>
        )}
        {(salesforce?.relatedProducts || krowne?.relatedProducts) && (
          <button 
            className={`tab ${activeTab === 'related' ? 'active' : ''}`}
            onClick={() => setActiveTab('related')}
          >
            Related Products
          </button>
        )}
        {(salesforce && krowne) && (
          <button 
            className={`tab ${activeTab === 'comparison' ? 'active' : ''}`}
            onClick={() => setActiveTab('comparison')}
          >
            Comparison
            {mismatches.length > 0 && <span className="badge-count">{mismatches.length}</span>}
          </button>
        )}
      </div>

      {/* Tab Content */}
      <div className="tab-content">
        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <div className="overview-grid">
            <div className="product-image-section">
              <div className="main-image">
                {getMainImageUrl() ? (
                  <img src={getMainImageUrl()} alt={(salesforce?.name || krowne?.name) || sku} />
                ) : (
                  <span className="no-image">No image available</span>
                )}
              </div>
            </div>

            <div className="key-info">
              {/* Basic Information */}
              <div className="info-section">
                <h3 className="section-title">📋 Basic Information</h3>
                <div className="property-grid">
                  <div className="property-item">
                    <span className="property-label">Product Code</span>
                    <span className="property-value large">{salesforce?.ProductCode || sku}</span>
                  </div>
                  {salesforce?.adminName && (
                    <div className="property-item">
                      <span className="property-label">Admin Name</span>
                      <span className="property-value">{salesforce.adminName}</span>
                    </div>
                  )}
                  {salesforce?.pimlyId && (
                    <div className="property-item">
                      <span className="property-label">Pimly ID</span>
                      <span className="property-value">{salesforce.pimlyId}</span>
                    </div>
                  )}
                  {salesforce?.salesforceId && (
                    <div className="property-item">
                      <span className="property-label">Salesforce ID</span>
                      <span className="property-value">{salesforce.salesforceId}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Categories */}
              {(salesforce?.categories || krowne?.categories) && (
                <div className="info-section">
                  <h3 className="section-title">🏷️ Categories</h3>
                  <div className="categories">
                    {(salesforce?.categories || krowne?.categories)?.map((cat, idx) => (
                      <span key={idx} className="category-badge">
                        {cat.Name || cat.pimly__Admin_Name__c || cat.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Key Specifications */}
              {(salesforce?.properties || krowne) && (
                <div className="info-section">
                  <h3 className="section-title">⚙️ Key Specifications</h3>
                  <div className="property-grid">
                    {['Product_Description', 'Series', 'Mounting_Style', 'Handle_Type', 'Warranty']
                      .map(prop => {
                        const sfValue = getPropertyValue(salesforce?.properties, prop);
                        const krowneValue = prop === 'Product_Description' ? krowne?.description :
                                          prop === 'Series' ? krowne?.series :
                                          prop === 'Warranty' ? krowne?.warranty : null;
                        const value = sfValue || krowneValue;
                        if (!value) return null;
                        return (
                          <div key={prop} className="property-item">
                            <span className="property-label">
                              {prop.replace(/_/g, ' ').replace(/\(.*\)/, '')}
                            </span>
                            <span className="property-value">{value}</span>
                          </div>
                        );
                      })
                      .filter(Boolean)}
                  </div>
                </div>
              )}

              {/* Krowne Features */}
              {krowne?.features && krowne.features.length > 0 && (
                <div className="info-section">
                  <h3 className="section-title">✨ Features</h3>
                  <ul className="features-list">
                    {krowne.features.map((feature, idx) => (
                      <li key={idx}>{feature}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Specifications Tab */}
        {activeTab === 'specifications' && salesforce?.properties && (
          <div>
            {Object.entries(groupProperties(salesforce.properties)).map(([groupName, props]) => (
              <div key={groupName} className="expandable-section">
                <div 
                  className="expandable-header"
                  onClick={() => toggleSection(groupName)}
                >
                  <h3 className="section-title" style={{ margin: 0 }}>
                    {groupName}
                  </h3>
                  <span className={`expand-icon ${expandedSections[groupName] ? 'expanded' : ''}`}>
                    ▼
                  </span>
                </div>
                {(expandedSections[groupName] !== false) && (
                  <div className="expandable-content">
                    <div className="property-grid">
                      {props.map((prop, idx) => (
                        <div key={idx} className="property-item">
                          <span className="property-label">
                            {prop.propertyName || prop.propertyAdminName.replace(/_/g, ' ')}
                          </span>
                          <span className="property-value">
                            {Array.isArray(prop.value) 
                              ? prop.value.join(', ') 
                              : String(prop.value || 'N/A')}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Digital Assets Tab */}
        {activeTab === 'assets' && salesforce?.digitalAssets && (
          <div className="digital-assets">
            {salesforce.digitalAssets.map((assetGroup, idx) => (
              <div key={idx} className="asset-group">
                <div className="asset-type">
                  {assetGroup.propertyName || assetGroup.propertyAdminName}
                </div>
                <div className="asset-list">
                  {assetGroup.assets.map((asset, assetIdx) => (
                    <div key={assetIdx} className="asset-item">
                      <span className="asset-icon">
                        {asset.type === 'Image' ? '🖼️' : 
                         asset.type === 'Video' ? '🎥' : 
                         asset.type === 'Document' ? '📄' : '📎'}
                      </span>
                      <a href={asset.url} target="_blank" rel="noopener noreferrer">
                        {asset.name}
                      </a>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Related Products Tab */}
        {activeTab === 'related' && (salesforce?.relatedProducts || krowne?.relatedProducts) && (
          <div>
            {/* Salesforce Related Products */}
            {salesforce?.relatedProducts?.map((group, idx) => (
              <div key={`sf-${idx}`} className="expandable-section">
                <div 
                  className="expandable-header"
                  onClick={() => toggleSection(`sf-related-${idx}`)}
                >
                  <h3 className="section-title" style={{ margin: 0 }}>
                    {group.propertyName || group.propertyAdminName.replace(/_/g, ' ')} (Salesforce)
                    <span className="badge-count">{group.products?.length || 0}</span>
                  </h3>
                  <span className={`expand-icon ${expandedSections[`sf-related-${idx}`] ? 'expanded' : ''}`}>
                    ▼
                  </span>
                </div>
                {(expandedSections[`sf-related-${idx}`] !== false) && (
                  <div className="expandable-content">
                    <div className="related-products">
                      {group.products?.map((product, pIdx) => (
                        <div key={pIdx} className="related-product">
                          {product.mainImageUrl && (
                            <img src={product.mainImageUrl} alt={product.name || product.adminName} />
                          )}
                          <div className="related-product-sku">{product.adminName || product.sku}</div>
                          <div className="related-product-name">{product.name || 'N/A'}</div>
                          {product.url && (
                            <a 
                              href={product.url} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="product-link"
                            >
                              View Product →
                            </a>
                          )}
                        </div>
                      )) || <div className="no-data">No products found</div>}
                    </div>
                  </div>
                )}
              </div>
            ))}

            {/* Krowne Related Products */}
            {krowne?.relatedProducts && krowne.relatedProducts.length > 0 && (
              <div className="expandable-section">
                <div 
                  className="expandable-header"
                  onClick={() => toggleSection('krowne-related')}
                >
                  <h3 className="section-title" style={{ margin: 0 }}>
                    Related Products (Krowne Website)
                    <span className="badge-count">{krowne.relatedProducts.length}</span>
                  </h3>
                  <span className={`expand-icon ${expandedSections['krowne-related'] ? 'expanded' : ''}`}>
                    ▼
                  </span>
                </div>
                {(expandedSections['krowne-related'] !== false) && (
                  <div className="expandable-content">
                    <div className="related-products">
                      {krowne.relatedProducts.map((product, pIdx) => (
                        <div key={pIdx} className="related-product">
                          {product.imageUrl && (
                            <img src={product.imageUrl} alt={product.name || product.sku} />
                          )}
                          <div className="related-product-sku">{product.sku}</div>
                          <div className="related-product-name">{product.name || 'N/A'}</div>
                          {product.url && (
                            <a 
                              href={product.url} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="product-link"
                            >
                              View on Krowne →
                            </a>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Comparison Tab */}
        {activeTab === 'comparison' && salesforce && krowne && (
          <div>
            {/* Summary Stats */}
            <div className="comparison-summary">
              <h3>Comparison Summary</h3>
              <div className="summary-stats">
                <div>
                  <strong>Total Fields Compared:</strong> {getComparisonFields().length}
                </div>
                <div className={mismatches.length > 0 ? 'text-danger' : 'text-success'}>
                  <strong>Mismatches Found:</strong> {mismatches.length}
                </div>
                <div className="text-success">
                  <strong>Matches:</strong> {getComparisonFields().length - mismatches.length}
                </div>
              </div>
            </div>

            {/* Detailed Comparison Table */}
            <table className="comparison-table">
              <thead>
                <tr>
                  <th className="field-column">Field</th>
                  <th className="value-column">Pimly (Salesforce)</th>
                  <th className="value-column">Krowne Website</th>
                  <th className="value-column">Status</th>
                </tr>
              </thead>
              <tbody>
                {getComparisonFields().map((field, idx) => {
                  const mismatch = mismatches.find(m => m.field.toLowerCase() === field.label.toLowerCase());
                  const isMatch = field.sf && field.krowne && !mismatch;
                  const hasData = field.sf || field.krowne;
                  
                  return (
                    <tr key={idx} className={mismatch ? 'mismatch-row' : ''}>
                      <td className="field-column">{field.label}</td>
                      <td className="value-column">
                        {field.sf ? (
                          field.key === 'price' ? formatPrice(field.sf) : String(field.sf)
                        ) : (
                          <span className="missing-data">No data</span>
                        )}
                      </td>
                      <td className="value-column">
                        {field.krowne ? (
                          field.key === 'price' ? formatPrice(field.krowne) : String(field.krowne)
                        ) : (
                          <span className="missing-data">No data</span>
                        )}
                      </td>
                      <td className="value-column">
                        {mismatch ? (
                          <span className="mismatch-indicator">⚠️ Mismatch</span>
                        ) : isMatch ? (
                          <span className="match-indicator">✅ Match</span>
                        ) : hasData ? (
                          <span className="partial-indicator">ℹ️ Partial</span>
                        ) : (
                          <span className="missing-data">No data</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* Additional Krowne Data */}
            {(krowne.specifications || krowne.certifications || krowne.features) && (
              <div className="additional-data">
                <h3>Additional Krowne Website Data</h3>
                
                <div className="comparison-grid">
                  {/* Krowne Specifications */}
                  {krowne.specifications && Object.keys(krowne.specifications).length > 0 && (
                    <div className="source-column">
                      <div className="source-header">
                        <span className="source-icon">⚙️</span>
                        <span className="source-title">Specifications</span>
                      </div>
                      <div className="property-grid">
                        {Object.entries(krowne.specifications).map(([key, value]) => (
                          <div key={key} className="property-item">
                            <span className="property-label">{key}</span>
                            <span className="property-value">{value}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Krowne Certifications */}
                  {krowne.certifications && Object.keys(krowne.certifications).length > 0 && (
                    <div className="source-column">
                      <div className="source-header">
                        <span className="source-icon">🏆</span>
                        <span className="source-title">Certifications</span>
                      </div>
                      <div className="property-grid">
                        {Object.entries(krowne.certifications).map(([key, value]) => (
                          <div key={key} className="property-item">
                            <span className="property-label">{key}</span>
                            <span className="property-value">{value}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default ProductCard;