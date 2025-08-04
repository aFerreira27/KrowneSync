import React from 'react';

const ProductCard = ({ productData }) => {
  const { sku, salesforce, krowne, mismatches } = productData;

  const isMismatch = (field) => {
    return mismatches.some(m => m.field === field);
  };

  // Format price display
  const formatPrice = (price) => {
    if (!price) return 'N/A';
    if (typeof price === 'number') return `${price.toFixed(2)}`;
    if (typeof price === 'string' && !price.includes("'")) return `${price}`;
    return price;
  };

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
                <span className="value">{formatPrice(salesforce.ListPrice || salesforce.UnitPrice || salesforce.Price)}</span>
              </div>
              <div className={`detail-row ${isMismatch('description') ? 'mismatch' : ''}`}>
                <span className="label">Description:</span>
                <span className="value">{salesforce.Description || salesforce.Product_Description__c || 'N/A'}</span>
              </div>
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
                  <span className="value">{salesforce.IsActive ? 'Active' : 'Inactive'}</span>
                </div>
              )}
            </div>
          ) : (
            <div className="no-data">Product not found in Pimly</div>
          )}
        </div>

        <div className="comparison-divider">
          {mismatches.length > 0 && <span className="vs-badge">VS</span>}
        </div>

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
                <span className="value">{krowne.description || 'N/A'}</span>
              </div>
              {krowne.image && (
                <div className="product-image">
                  <img src={krowne.image} alt={krowne.name} />
                </div>
              )}
              {krowne.url && (
                <a href={krowne.url} target="_blank" rel="noopener noreferrer" className="view-link">
                  View on Krowne →
                </a>
              )}
            </div>
          ) : (
            <div className="no-data">Product not found on Krowne website</div>
          )}
        </div>
      </div>

      {mismatches.length > 0 && (
        <div className="mismatch-summary">
          <h4>⚠️ Detected Mismatches:</h4>
          <ul>
            {mismatches.map((mismatch, index) => (
              <li key={index}>
                <strong>{mismatch.field.charAt(0).toUpperCase() + mismatch.field.slice(1)}:</strong> 
                <span className="pimly-value">Pimly: {mismatch.pimly || 'N/A'}</span> ≠ 
                <span className="krowne-value">Krowne: {mismatch.krowne || 'N/A'}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

export default ProductCard;