// Simplified ProductCard.jsx - Side-by-side comparison with highlighted differences

import React, { useState, useEffect } from 'react';
import './ProductCard.css';

const ProductCard = ({ productData }) => {
  const [detailedComparison, setDetailedComparison] = useState(null);

  // Extract data with proper structure handling
  const { sku, salesforce, krowne, comparison, status } = productData || {};
  
  // Handle the case where krowne might be nested or in different formats
  const krowneData = krowne?.product || krowne;

  // Fetch detailed comparison if we have a SKU
  useEffect(() => {
    if (sku) {
      const fetchDetailedComparison = async () => {
        try {
          const response = await fetch(`/api/mapper/compare-detailed/${sku}`);
          const data = await response.json();
          setDetailedComparison(data);
        } catch (error) {
          console.error('Error fetching detailed comparison:', error);
        }
      };
      
      fetchDetailedComparison();
    }
  }, [sku]);

  // Format price display
  const formatPrice = (price) => {
    if (!price && price !== 0) return 'N/A';
    if (typeof price === 'number') return `$${price.toFixed(2)}`;
    if (typeof price === 'string') {
      const cleanPrice = price.replace(/[^0-9.]/g, '');
      const numericPrice = parseFloat(cleanPrice);
      if (!isNaN(numericPrice)) return `$${numericPrice.toFixed(2)}`;
      return price;
    }
    return String(price);
  };

  // Format field value based on field type from mapper
  const formatFieldValue = (value, fieldType) => {
    if (value === null || value === undefined || value === '') return <span className="empty-value">N/A</span>;
    
    switch (fieldType) {
      case 'price':
        return formatPrice(value);
      
      case 'boolean':
        return value ? 'Yes' : 'No';
      
      case 'number':
        return typeof value === 'number' ? value.toFixed(2) : value;
      
      case 'list':
        if (Array.isArray(value)) {
          if (value.length === 0) return <span className="empty-value">N/A</span>;
          
          // Handle array of objects
          if (typeof value[0] === 'object' && value[0] !== null) {
            // For categories/breadcrumb with name and url
            if (value[0].name && value[0].url) {
              return (
                <div className="list-items">
                  {value.map((item, idx) => (
                    <a key={idx} href={item.url} target="_blank" rel="noopener noreferrer" className="breadcrumb-link">
                      {item.name}
                    </a>
                  )).reduce((prev, curr, idx) => idx === 0 ? [curr] : [...prev, ' → ', curr], [])}
                </div>
              );
            }
            // For downloads
            if (value[0].url) {
              return (
                <div className="list-items">
                  {value.map((item, idx) => (
                    <a key={idx} href={item.url} target="_blank" rel="noopener noreferrer" className="download-link">
                      📄 {item.name || 'Download'}
                    </a>
                  ))}
                </div>
              );
            }
            // For properties with propertyName and value
            if (value[0].propertyName) {
              return (
                <div className="property-list">
                  {value.map((prop, idx) => (
                    <div key={idx} className="property-item">
                      <strong>{prop.propertyName}:</strong> {prop.value}
                    </div>
                  ))}
                </div>
              );
            }
            // For related products (assuming they have SKUs or IDs)
            if (typeof value[0] === 'string' || value[0].sku || value[0].id) {
              const items = value.map(item => typeof item === 'string' ? item : (item.sku || item.id || item.name));
              if (items.length > 5) {
                return (
                  <div className="related-products">
                    {items.slice(0, 5).join(', ')} <em>...and {items.length - 5} more</em>
                  </div>
                );
              }
              return items.join(', ');
            }
            // Fallback for other objects
            return value.map(item => JSON.stringify(item)).join(', ');
          }
          // Simple array of strings
          if (value.length > 10 && fieldType === 'list') {
            // For long lists like related products
            return (
              <div className="long-list">
                {value.slice(0, 10).join(', ')} <em>...and {value.length - 10} more</em>
              </div>
            );
          }
          // For features, use bullet points if multiple items
          if (value.length > 1 && (fieldType === 'list' || value[0].includes(' '))) {
            return (
              <ul className="feature-list">
                {value.map((item, idx) => (
                  <li key={idx}>{item}</li>
                ))}
              </ul>
            );
          }
          return value.join(', ');
        }
        return value;
      
      case 'url':
        if (typeof value === 'string' && value.startsWith('http')) {
          return (
            <a href={value} target="_blank" rel="noopener noreferrer" className="url-link">
              🔗 {value.length > 60 ? value.substring(0, 60) + '...' : value}
            </a>
          );
        }
        return value;
      
      case 'text':
      default:
        // Handle multi-line text (like descriptions with pipe separators)
        if (typeof value === 'string' && value.includes(' | ')) {
          const items = value.split(' | ');
          return (
            <ul className="feature-list">
              {items.map((item, idx) => (
                <li key={idx}>{item.trim()}</li>
              ))}
            </ul>
          );
        }
        // Handle long text
        if (typeof value === 'string' && value.length > 200) {
          return (
            <div className="long-text" title={value}>
              {value.substring(0, 200)}...
            </div>
          );
        }
        // Handle objects
        if (typeof value === 'object' && !Array.isArray(value)) {
          return JSON.stringify(value);
        }
        return String(value);
    }
  };

  // Get status indicator
  const getStatusIndicator = () => {
    if (!status) return { text: 'Unknown', color: 'gray', icon: '?' };
    
    switch (status) {
      case 'found_both':
        return { text: 'Synced', color: 'green', icon: '✓' };
      case 'missing_from_krowne':
        return { text: 'Not in Krowne', color: 'yellow', icon: '⚠' };
      case 'missing_from_salesforce':
        return { text: 'Not in Salesforce', color: 'red', icon: '✗' };
      case 'not_found':
        return { text: 'Not Found', color: 'gray', icon: '?' };
      default:
        return { text: status, color: 'gray', icon: '•' };
    }
  };

  // Get comparison summary from detailed comparison
  const getComparisonSummary = () => {
    if (!detailedComparison?.comparison_summary) {
      return { matches: 0, mismatches: 0, partial: 0, total: 0 };
    }
    return {
      matches: detailedComparison.comparison_summary.matches || 0,
      mismatches: detailedComparison.comparison_summary.mismatches || 0,
      partial: detailedComparison.comparison_summary.partial_data || 0,
      total: detailedComparison.comparison_summary.total_fields || 0
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

  const statusInfo = getStatusIndicator();
  const summary = getComparisonSummary();

  return (
    <div className="product-card">
      {/* Header Section */}
      <div className="product-header">
        <div className="header-content">
          <div className="header-left">
            <h1 className="product-title">Product Comparison</h1>
            <div className="product-info">
              <span className="sku-label">SKU: {sku}</span>
              <span className={`status-badge status-${statusInfo.color}`}>
                {statusInfo.icon} {statusInfo.text}
              </span>
            </div>
          </div>
          <div className="summary-stats">
            <div className="stat-item">
              <div className="stat-value matches">{summary.matches}</div>
              <div className="stat-label">Matches</div>
            </div>
            <div className="stat-item">
              <div className="stat-value mismatches">{summary.mismatches}</div>
              <div className="stat-label">Differences</div>
            </div>
            <div className="stat-item">
              <div className="stat-value partial">{summary.partial}</div>
              <div className="stat-label">Partial</div>
            </div>
            <div className="stat-item">
              <div className="stat-value total">{summary.total}</div>
              <div className="stat-label">Total Fields</div>
            </div>
          </div>
        </div>
      </div>

      {/* Column Headers */}
      <div className="comparison-headers">
        <div className="header-field">Field</div>
        <div className="header-source">
          <div className="source-title">Salesforce/Pimly</div>
          {salesforce?.name && (
            <div className="source-subtitle">{salesforce.name}</div>
          )}
        </div>
        <div className="header-source">
          <div className="source-title">Krowne CMS</div>
          {krowneData?.name && (
            <div className="source-subtitle">{krowneData.name}</div>
          )}
        </div>
      </div>

      {/* Field Comparisons */}
      <div className="comparison-content">
        {detailedComparison?.field_comparisons ? (
          <>
            {/* Show mismatches first (highlighted) */}
            {detailedComparison.field_comparisons
              .filter(field => field.is_mismatch)
              .map((field, idx) => (
                <div key={`mismatch-${idx}`} className="comparison-row mismatch-row">
                  <div className="field-name">
                    <span className="field-title">{field.display_name}</span>
                    {field.description && (
                      <span className="field-description">{field.description}</span>
                    )}
                  </div>
                  <div className="field-value salesforce-value">
                    {formatFieldValue(field.salesforce_value, field.field_type)}
                  </div>
                  <div className="field-value krowne-value">
                    {formatFieldValue(field.krowne_value, field.field_type)}
                  </div>
                </div>
              ))}

            {/* Show partial data (one side missing) */}
            {detailedComparison.field_comparisons
              .filter(field => field.has_partial_data)
              .map((field, idx) => (
                <div key={`partial-${idx}`} className="comparison-row partial-row">
                  <div className="field-name">
                    <span className="field-title">{field.display_name}</span>
                    {field.description && (
                      <span className="field-description">{field.description}</span>
                    )}
                  </div>
                  <div className={`field-value salesforce-value ${!field.salesforce_value ? 'empty' : ''}`}>
                    {formatFieldValue(field.salesforce_value, field.field_type)}
                  </div>
                  <div className={`field-value krowne-value ${!field.krowne_value ? 'empty' : ''}`}>
                    {formatFieldValue(field.krowne_value, field.field_type)}
                  </div>
                </div>
              ))}

            {/* Show matches (only non-empty ones) */}
            {detailedComparison.field_comparisons
              .filter(field => field.is_match && (field.salesforce_value !== null || field.krowne_value !== null))
              .map((field, idx) => (
                <div key={`match-${idx}`} className="comparison-row match-row">
                  <div className="field-name">
                    <span className="field-title">{field.display_name}</span>
                    {field.description && (
                      <span className="field-description">{field.description}</span>
                    )}
                  </div>
                  <div className="field-value salesforce-value">
                    {formatFieldValue(field.salesforce_value, field.field_type)}
                  </div>
                  <div className="field-value krowne-value">
                    {formatFieldValue(field.krowne_value, field.field_type)}
                  </div>
                </div>
              ))}
          </>
        ) : (
          <div className="loading-message">
            Loading detailed comparison data...
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="comparison-legend">
        <div className="legend-item">
          <div className="legend-color mismatch"></div>
          <span className="legend-label">Differences</span>
        </div>
        <div className="legend-item">
          <div className="legend-color partial"></div>
          <span className="legend-label">Partial Data</span>
        </div>
        <div className="legend-item">
          <div className="legend-color match"></div>
          <span className="legend-label">Matches</span>
        </div>
      </div>
    </div>
  );
};

export default ProductCard;