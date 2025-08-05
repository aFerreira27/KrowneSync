import React from 'react';

const ProductCard = ({ productData }) => {
  // Early return if no product data
  if (!productData) {
    return (
      <div className="product-card">
        <div className="no-data">No product data available</div>
      </div>
    );
  }

  const { sku, salesforce, krowne, mismatches = [] } = productData;

  const isMismatch = (field) => {
    return mismatches.some(m => m.field === field);
  };

  // Format price display with better handling
  const formatPrice = (price) => {
    if (!price && price !== 0) return 'N/A';
    if (typeof price === 'number') return `$${price.toFixed(2)}`;
    if (typeof price === 'string') {
      // Remove any existing currency symbols and format
      const numericPrice = parseFloat(price.replace(/[$,]/g, ''));
      if (!isNaN(numericPrice)) return `$${numericPrice.toFixed(2)}`;
      return price;
    }
    return String(price);
  };

  // Get the best available price from Pimly data
  const getPimlyPrice = (salesforceData) => {
    if (!salesforceData) return null;
    return salesforceData.ListPrice || 
           salesforceData.UnitPrice || 
           salesforceData.Price ||
           salesforceData.pimly__List_Price__c ||
           salesforceData.StandardPrice;
  };

  // Get the best available description from Pimly data
  const getPimlyDescription = (salesforceData) => {
    if (!salesforceData) return null;
    return salesforceData.Description || 
           salesforceData.Product_Description__c ||
           salesforceData.pimly__Description__c ||
           salesforceData.LongDescription;
  };

  // Debug logging (remove in production)
  console.log('ProductCard received data:', productData);

  return (
    <div className="product-card">
      <div className="product-header">
        <h3>SKU: {sku}</h3>
        {mismatches.length > 0 && (
          <span className="mismatch-badge">
            {mismatches.length} Mismatch{mismatches.length > 1 ? 'es' : ''}
          </span>
        )}
      </div>

      <div className="product-comparison">
        {/* Pimly (Salesforce) Data Section */}
        <div className="data-source">
          <h4>
            <span className="source-icon">☁️</span>
            Pimly (Salesforce)
          </h4>
          {salesforce ? (
            <div className="product-details">
              <div className={`detail-row ${isMismatch('name') ? 'mismatch' : ''}`}>
                <span className="label">Name:</span>
                <span className="value">{salesforce.Name || 'N/A'}</span>
              </div>
              
              <div className={`detail-row ${isMismatch('price') ? 'mismatch' : ''}`}>
                <span className="label">Price:</span>
                <span className="value">{formatPrice(getPimlyPrice(salesforce))}</span>
              </div>
              
              <div className={`detail-row ${isMismatch('description') ? 'mismatch' : ''}`}>
                <span className="label">Description:</span>
                <span className="value description-text">
                  {getPimlyDescription(salesforce) || 'N/A'}
                </span>
              </div>

              {/* Additional Pimly fields */}
              {salesforce.ProductCode && (
                <div className="detail-row">
                  <span className="label">Product Code:</span>
                  <span className="value">{salesforce.ProductCode}</span>
                </div>
              )}
              
              {salesforce.Family && (
                <div className="detail-row">
                  <span className="label">Family:</span>
                  <span className="value">{salesforce.Family}</span>
                </div>
              )}
              
              {salesforce.IsActive !== undefined && (
                <div className="detail-row">
                  <span className="label">Status:</span>
                  <span className="value status-badge">
                    <span className={`status-indicator ${salesforce.IsActive ? 'active' : 'inactive'}`}>
                      {salesforce.IsActive ? 'Active' : 'Inactive'}
                    </span>
                  </span>
                </div>
              )}

              {/* Show Pimly ID if available */}
              {salesforce.Id && (
                <div className="detail-row">
                  <span className="label">Pimly ID:</span>
                  <span className="value pimly-id">{salesforce.Id}</span>
                </div>
              )}

              {/* Show any custom Pimly fields */}
              {Object.keys(salesforce).map(key => {
                if (key.includes('pimly__') && salesforce[key] && 
                    !key.includes('__c') && 
                    !['Id', 'Name', 'Description', 'ProductCode', 'Family', 'IsActive'].includes(key)) {
                  return (
                    <div key={key} className="detail-row">
                      <span className="label">{key.replace('pimly__', '').replace(/_/g, ' ')}:</span>
                      <span className="value">{String(salesforce[key])}</span>
                    </div>
                  );
                }
                return null;
              })}
            </div>
          ) : (
            <div className="no-data">
              <p>Product not found in Pimly</p>
              <small>SKU: {sku}</small>
            </div>
          )}
        </div>

        <div className="comparison-divider">
          {mismatches.length > 0 && <span className="vs-badge">VS</span>}
        </div>

        {/* Krowne Website Data Section */}
        <div className="data-source">
          <h4>
            <span className="source-icon">🌐</span>
            Krowne Website
          </h4>
          {krowne ? (
            <div className="product-details">
              <div className={`detail-row ${isMismatch('name') ? 'mismatch' : ''}`}>
                <span className="label">Name:</span>
                <span className="value">{krowne.name || 'N/A'}</span>
              </div>
              
              <div className={`detail-row ${isMismatch('price') ? 'mismatch' : ''}`}>
                <span className="label">Price:</span>
                <span className="value">{formatPrice(krowne.price)}</span>
              </div>
              
              <div className={`detail-row ${isMismatch('description') ? 'mismatch' : ''}`}>
                <span className="label">Description:</span>
                <span className="value description-text">{krowne.description || 'N/A'}</span>
              </div>
              
              {krowne.image && (
                <div className="product-image">
                  <img 
                    src={krowne.image} 
                    alt={krowne.name || 'Product image'} 
                    onError={(e) => {
                      e.target.style.display = 'none';
                    }}
                  />
                </div>
              )}
              
              {krowne.url && (
                <div className="detail-row">
                  <a href={krowne.url} target="_blank" rel="noopener noreferrer" className="view-link">
                    View on Krowne →
                  </a>
                </div>
              )}
            </div>
          ) : (
            <div className="no-data">
              <p>Product not found on Krowne website</p>
              <small>SKU: {sku}</small>
            </div>
          )}
        </div>
      </div>

      {/* Mismatch Summary */}
      {mismatches.length > 0 && (
        <div className="mismatch-summary">
          <h4>⚠️ Detected Mismatches:</h4>
          <ul className="mismatch-list">
            {mismatches.map((mismatch, index) => (
              <li key={index} className="mismatch-item">
                <strong className="mismatch-field">
                  {mismatch.field.charAt(0).toUpperCase() + mismatch.field.slice(1)}:
                </strong>
                <div className="mismatch-comparison">
                  <span className="pimly-value">
                    <strong>Pimly:</strong> {mismatch.pimly || 'N/A'}
                  </span>
                  <span className="comparison-operator">≠</span>
                  <span className="krowne-value">
                    <strong>Krowne:</strong> {mismatch.krowne || 'N/A'}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Debug information (remove in production) */}
      {process.env.NODE_ENV === 'development' && (
        <details className="debug-info">
          <summary>Debug Info (Dev Only)</summary>
          <pre>{JSON.stringify(productData, null, 2)}</pre>
        </details>
      )}
    </div>
  );
};

export default ProductCard;