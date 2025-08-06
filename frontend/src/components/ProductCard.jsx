// Enhanced ProductCard.jsx - UPDATED to use ProductMapper data from backend

import React, { useState, useEffect } from 'react';
import './ProductCard.css';

const ProductCard = ({ productData }) => {
  const [activeTab, setActiveTab] = useState('comparison');
  const [mapperFields, setMapperFields] = useState([]);

  const { sku, salesforce, krowne, comparison, mismatches } = productData || {};

  // Fetch mapper field information for better display
  useEffect(() => {
    const fetchMapperFields = async () => {
      try {
        const response = await fetch('/api/mapper/fields');
        const data = await response.json();
        if (data.fields) {
          setMapperFields(data.fields);
        }
      } catch (error) {
        console.error('Error fetching mapper fields:', error);
      }
    };
    
    fetchMapperFields();
  }, []);

  // Format price display
  const formatPrice = (price) => {
    if (!price && price !== 0) return null;
    if (typeof price === 'number') return `$${price.toFixed(2)}`;
    if (typeof price === 'string') {
      if (price.includes('$')) return price;
      const cleanPrice = price.replace(/\s+/g, '').replace('$', '');
      const numericPrice = parseFloat(cleanPrice);
      if (!isNaN(numericPrice)) return `$${numericPrice.toFixed(2)}`;
      return price;
    }
    return String(price);
  };

  // Format field value based on field type
  const formatFieldValue = (value, fieldType) => {
    if (!value && value !== 0) return null;
    
    if (fieldType === 'price') {
      return formatPrice(value);
    }
    
    if (fieldType === 'boolean') {
      return value ? 'Yes' : 'No';
    }
    
    if (fieldType === 'list' && Array.isArray(value)) {
      return value.join(', ');
    }
    
    return String(value);
  };

  // Get field metadata from mapper
  const getFieldMetadata = (canonicalName) => {
    return mapperFields.find(f => f.canonical_name === canonicalName) || {};
  };

  // Get all comparison data from ProductMapper results
  const getAllComparisonData = () => {
    if (!comparison) return [];
    
    // Combine all comparison data
    const allData = [
      ...(comparison.matches || []),
      ...(comparison.mismatches || []),
      ...(comparison.partial_data || [])
    ];
    
    return allData.map(item => ({
      ...item,
      metadata: getFieldMetadata(item.canonical_name)
    }));
  };

  // Get summary statistics
  const getSummaryStats = () => {
    if (!comparison) {
      return {
        total: 0,
        matches: 0,
        mismatches: 0,
        partial: 0
      };
    }
    
    return {
      total: comparison.total_fields_compared || 0,
      matches: comparison.match_count || 0,
      mismatches: comparison.mismatch_count || 0,
      partial: comparison.partial_data_count || 0
    };
  };

  // Early return if no data
  if (!productData) {
    return (
      <div className="product-card">
        <div className="no-data">No product data available</div>
      </div>
    );
  }

  const summaryStats = getSummaryStats();
  const allComparisonData = getAllComparisonData();

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
          {(salesforce?.list_price || krowne?.price || krowne?.listPrice) && (
            <>
              <p className="price-display">
                {formatPrice(salesforce?.list_price || krowne?.price || krowne?.listPrice)}
              </p>
              <p className="price-label">
                {salesforce?.list_price ? 'Salesforce Price' : 'Krowne Price'}
              </p>
            </>
          )}
          {krowne?.mainImageUrl && (
            <img 
              src={krowne.mainImageUrl} 
              alt={krowne.name || sku}
              className="product-image"
              onError={(e) => { e.target.style.display = 'none'; }}
            />
          )}
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="tab-navigation">
        <button 
          className={`tab-btn ${activeTab === 'comparison' ? 'active' : ''}`}
          onClick={() => setActiveTab('comparison')}
        >
          Comparison View
        </button>
        <button 
          className={`tab-btn ${activeTab === 'salesforce' ? 'active' : ''}`}
          onClick={() => setActiveTab('salesforce')}
        >
          Pimly (Salesforce)
        </button>
        <button 
          className={`tab-btn ${activeTab === 'krowne' ? 'active' : ''}`}
          onClick={() => setActiveTab('krowne')}
        >
          Krowne Website
        </button>
        <button 
          className={`tab-btn ${activeTab === 'raw' ? 'active' : ''}`}
          onClick={() => setActiveTab('raw')}
        >
          🔧 Raw Data Debug
        </button>
      </div>

      {/* Tab Content */}
      <div className="tab-content">
        {/* Comparison Tab */}
        {activeTab === 'comparison' && (
          <div className="comparison-view">
            {/* Summary Statistics */}
            <div className="comparison-summary">
              <h2>Data Comparison Summary (ProductMapper)</h2>
              <div className="summary-stats">
                <div className={summaryStats.mismatches > 0 ? 'text-danger' : 'text-success'}>
                  <strong>Mismatches:</strong> {summaryStats.mismatches}
                </div>
                <div className="text-success">
                  <strong>Matches:</strong> {summaryStats.matches}
                </div>
                <div className="text-info">
                  <strong>Partial Data:</strong> {summaryStats.partial}
                </div>
                <div className="text-info">
                  <strong>Total Fields:</strong> {summaryStats.total}
                </div>
              </div>
              {comparison?.mapped_fields && (
                <div className="mapper-info">
                  <small>Using ProductMapper with {comparison.mapped_fields.length} total mapped fields</small>
                </div>
              )}
            </div>

            {/* Detailed Comparison Table */}
            <div className="table-container">
              <table className="comparison-table">
                <thead>
                  <tr>
                    <th className="field-column">Field</th>
                    <th className="value-column">Pimly (Salesforce)</th>
                    <th className="value-column">Krowne Website</th>
                    <th className="status-column">Status</th>
                    <th className="notes-column">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {allComparisonData.map((field, idx) => {
                    const isMismatch = comparison?.mismatches?.some(m => m.canonical_name === field.canonical_name);
                    const isMatch = comparison?.matches?.some(m => m.canonical_name === field.canonical_name);
                    const isPartial = comparison?.partial_data?.some(p => p.canonical_name === field.canonical_name);
                    const hasData = field.salesforce || field.krowne;
                    const formattedSfValue = formatFieldValue(field.salesforce, field.metadata?.field_type);
                    const formattedKrowneValue = formatFieldValue(field.krowne, field.metadata?.field_type);
                    
                    return (
                      <tr key={idx} className={isMismatch ? 'mismatch-row' : ''}>
                        <td className="field-column">
                          <strong>{field.field || field.display_name}</strong>
                          <div className="field-key">{field.canonical_name}</div>
                          {field.metadata?.description && (
                            <div className="field-description">{field.metadata.description}</div>
                          )}
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
                          {isMismatch ? (
                            <span className="mismatch-indicator">⚠️ Mismatch</span>
                          ) : isMatch ? (
                            <span className="match-indicator">✅ Match</span>
                          ) : isPartial ? (
                            <span className="partial-indicator">📄 Partial</span>
                          ) : hasData ? (
                            <span className="partial-indicator">📄 Data Available</span>
                          ) : (
                            <span className="no-data-indicator">❌ No Data</span>
                          )}
                        </td>
                        <td className="notes-column">
                          <small>{field.notes || field.metadata?.field_type || ''}</small>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Krowne Features Section */}
            {krowne?.features && krowne.features.length > 0 && (
              <div className="krowne-features">
                <h4>Product Features</h4>
                <ul className="features-list">
                  {krowne.features.map((feature, idx) => (
                    <li key={idx}>{feature}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Related Products */}
            {krowne?.relatedProducts && krowne.relatedProducts.length > 0 && (
              <div className="related-products">
                <h4>Related Products</h4>
                <div className="related-grid">
                  {krowne.relatedProducts.slice(0, 6).map((related, idx) => (
                    <div key={idx} className="related-item">
                      <img src={related.imageUrl} alt={related.name} className="related-image" />
                      <div className="related-info">
                        <strong>{related.name}</strong>
                        <p>{related.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Downloads */}
            {krowne?.downloads && krowne.downloads.length > 0 && (
              <div className="downloads-section">
                <h4>Downloads</h4>
                {krowne.downloads.map((download, idx) => (
                  <a key={idx} href={download.url} target="_blank" rel="noopener noreferrer" className="download-link">
                    📄 {download.name}
                  </a>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Salesforce Tab */}
        {activeTab === 'salesforce' && (
          <div className="data-source">
            <div className="source-header">
              <span className="source-icon">⚡</span>
              <span className="source-title">Pimly (Salesforce) Data</span>
            </div>
            {salesforce ? (
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
                  <div className="field-item">
                    <label>Product Code:</label>
                    <value>{salesforce.ProductCode || 'N/A'}</value>
                  </div>
                  <div className="field-item">
                    <label>Status:</label>
                    <value className={salesforce.IsActive ? 'status-active' : 'status-inactive'}>
                      {salesforce.IsActive ? 'Active' : 'Inactive'}
                    </value>
                  </div>
                  <div className="field-item">
                    <label>Family:</label>
                    <value>{salesforce.Family || 'N/A'}</value>
                  </div>
                  {salesforce.properties && salesforce.properties.map((prop, idx) => (
                    <div key={idx} className="field-item">
                      <label>{prop.propertyName || prop.propertyAdminName}:</label>
                      <value>{formatFieldValue(prop.value) || 'N/A'}</value>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="no-data">
                <p>No Salesforce data available</p>
                <small>Product may not exist in Pimly or Salesforce authentication required</small>
              </div>
            )}
          </div>
        )}

        {/* Krowne Tab */}
        {activeTab === 'krowne' && (
          <div className="data-source">
            <div className="source-header">
              <span className="source-icon">🌐</span>
              <span className="source-title">Krowne Website Data</span>
            </div>
            {krowne ? (
              <div className="source-content">
                <div className="field-grid">
                  <div className="field-item">
                    <label>Product Name:</label>
                    <value>{krowne.name || 'N/A'}</value>
                  </div>
                  <div className="field-item">
                    <label>Product Code:</label>
                    <value>{krowne.productCode || sku || 'N/A'}</value>
                  </div>
                  <div className="field-item">
                    <label>Price:</label>
                    <value>{formatPrice(krowne.price || krowne.listPrice) || 'N/A'}</value>
                  </div>
                  <div className="field-item">
                    <label>Series:</label>
                    <value>{krowne.series || 'N/A'}</value>
                  </div>
                  <div className="field-item">
                    <label>Warranty:</label>
                    <value>{krowne.warranty || '1 year'}</value>
                  </div>
                  <div className="field-item">
                    <label>Description:</label>
                    <value>{krowne.description || 'N/A'}</value>
                  </div>
                  
                  {/* All Krowne Properties */}
                  {krowne.properties && krowne.properties.map((prop, idx) => (
                    <div key={idx} className="field-item">
                      <label>{prop.propertyName || prop.propertyAdminName}:</label>
                      <value>{formatFieldValue(prop.value, prop.propertyAdminName) || 'N/A'}</value>
                    </div>
                  ))}
                </div>

                {/* Product Image */}
                {krowne.mainImageUrl && (
                  <div className="field-item full-width">
                    <label>Product Image:</label>
                    <img 
                      src={krowne.mainImageUrl} 
                      alt={krowne.name || sku}
                      className="product-image"
                      onError={(e) => { e.target.style.display = 'none'; }}
                    />
                  </div>
                )}

                {/* Features */}
                {krowne.features && krowne.features.length > 0 && (
                  <div className="krowne-features">
                    <h4>Product Features</h4>
                    <ul className="features-list">
                      {krowne.features.map((feature, idx) => (
                        <li key={idx}>{feature}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Downloads */}
                {krowne.downloads && krowne.downloads.length > 0 && (
                  <div className="downloads-section">
                    <h4>Downloads</h4>
                    {krowne.downloads.map((download, idx) => (
                      <a key={idx} href={download.url} target="_blank" rel="noopener noreferrer" className="download-link">
                        📄 {download.name}
                      </a>
                    ))}
                  </div>
                )}

                {/* Categories/Breadcrumb */}
                {krowne.categories && krowne.categories.length > 0 && (
                  <div className="categories-section">
                    <h4>Product Categories</h4>
                    <div className="breadcrumb">
                      {krowne.categories.map((cat, idx) => (
                        <span key={idx}>
                          {cat.name || cat}
                          {idx < krowne.categories.length - 1 && ' > '}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="no-data">
                <p>No Krowne website data available</p>
                <small>Product may not exist on Krowne.com or scraping failed</small>
              </div>
            )}
          </div>
        )}

        {/* Raw Data Debug Tab */}
        {activeTab === 'raw' && (
          <div className="raw-debug-view">
            <div className="debug-section">
              <h2>🔧 Raw Data Debug View</h2>
              <p>This shows the actual raw data structure including ProductMapper comparison results.</p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
              {/* Raw Salesforce Data */}
              <div className="debug-panel">
                <h3>📊 Raw Salesforce/Pimly Data</h3>
                <div className="raw-data-container">
                  <pre style={{ 
                    background: '#1e293b', 
                    color: '#e2e8f0',
                    padding: '15px', 
                    borderRadius: '8px', 
                    overflow: 'auto',
                    maxHeight: '500px',
                    fontSize: '12px',
                    border: '1px solid #334155',
                    fontFamily: 'Monaco, Menlo, monospace'
                  }}>
                    {salesforce ? JSON.stringify(salesforce, null, 2) : 'No Salesforce data'}
                  </pre>
                </div>
              </div>

              {/* Formatted Krowne Data (what component receives) */}
              <div className="debug-panel">
                <h3>🌐 Krowne Data</h3>
                <div className="raw-data-container">
                  <pre style={{ 
                    background: '#1e293b', 
                    color: '#e2e8f0',
                    padding: '15px', 
                    borderRadius: '8px', 
                    overflow: 'auto',
                    maxHeight: '500px',
                    fontSize: '12px',
                    border: '1px solid #334155',
                    fontFamily: 'Monaco, Menlo, monospace'
                  }}>
                    {krowne ? JSON.stringify(krowne, null, 2) : 'No Krowne data'}
                  </pre>
                </div>
              </div>
            </div>

            {/* ProductMapper Comparison Results */}
            <div style={{ marginBottom: '20px' }}>
              <div className="debug-panel">
                <h3>🔍 ProductMapper Comparison Results</h3>
                <div className="raw-data-container">
                  <pre style={{ 
                    background: '#0f172a', 
                    color: '#94a3b8',
                    padding: '15px', 
                    borderRadius: '8px', 
                    overflow: 'auto',
                    maxHeight: '500px',
                    fontSize: '12px',
                    border: '1px solid #1e293b',
                    fontFamily: 'Monaco, Menlo, monospace'
                  }}>
                    {comparison ? JSON.stringify(comparison, null, 2) : 'No comparison data'}
                  </pre>
                </div>
              </div>
            </div>

            {/* Mapper Fields Info */}
            <div style={{ marginBottom: '20px' }}>
              <div className="debug-panel">
                <h3>🗺️ Available Mapper Fields</h3>
                <div className="raw-data-container">
                  <pre style={{ 
                    background: '#0f172a', 
                    color: '#94a3b8',
                    padding: '15px', 
                    borderRadius: '8px', 
                    overflow: 'auto',
                    maxHeight: '300px',
                    fontSize: '12px',
                    border: '1px solid #1e293b',
                    fontFamily: 'Monaco, Menlo, monospace'
                  }}>
                    {mapperFields.length > 0 ? JSON.stringify(mapperFields.slice(0, 10), null, 2) + '\n...' : 'Loading mapper fields...'}
                  </pre>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Mismatches Details */}
      {activeTab === 'comparison' && summaryStats.mismatches > 0 && (
        <div className="mismatch-details">
          <h3>⚠️ Data Mismatches Detected</h3>
          <p>The following fields have different values between Pimly and Krowne:</p>
          {(comparison?.mismatches || mismatches || []).map((mismatch, idx) => (
            <div key={idx} className="mismatch-item">
              <div className="mismatch-field">
                <strong>{mismatch.field}</strong>
                {mismatch.description && (
                  <div className="field-description">{mismatch.description}</div>
                )}
              </div>
              <div className="mismatch-comparison">
                <div className="mismatch-value">
                  <span className="source-label">Pimly:</span>
                  <span className="value">{mismatch.salesforce || 'N/A'}</span>
                </div>
                <div className="comparison-operator">≠</div>
                <div className="mismatch-value">
                  <span className="source-label">Krowne:</span>
                  <span className="value">{mismatch.krowne || 'N/A'}</span>
                </div>
              </div>
              {mismatch.notes && (
                <div className="mismatch-notes">
                  <small>Notes: {mismatch.notes}</small>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ProductCard;