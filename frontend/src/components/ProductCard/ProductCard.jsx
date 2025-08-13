import React, { useState, useEffect } from "react";
import "./ProductCard.css";
import { FIELD_MAPPINGS, findCanonicalField } from "./fieldMappings";

const ProductCard = ({ productData, onSync }) => {
  const [devMode, setDevMode] = useState(false);
  const [activeTab, setActiveTab] = useState("comparison");
  const [pimlyData, setPimlyData] = useState(null);
  const [krowneData, setKrowneData] = useState(null);
  const [mappedData, setMappedData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [expandedFields, setExpandedFields] = useState({});

  useEffect(() => {
    if (productData) {
      // Extract data from the product data structure
      // Handle different response formats from various endpoints

      // For comparison endpoint responses
      if (productData.raw_data) {
        setPimlyData(
          productData.salesforce || null
        );
        setKrowneData(
          productData.raw_data.krowne || productData.krowne || null
        );
      } else {
        setPimlyData(productData.salesforce || productData.pimly || null);
        setKrowneData(productData.krowne || null);
      }

      setMappedData(productData.mapped_data || productData.comparison || null);
    }
  }, [productData]);

  const toggleDevMode = () => {
    setDevMode(!devMode);
  };

  const handleConfirmSync = async () => {
    const sku = productData.sku || productData.SKU || productData.Id;
    setSyncing(true);
    
    try {
      const response = await fetch('/api/sync/record', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sku: sku,
          status: 'success',
          details: {
            timestamp: new Date().toISOString(),
            hasPimlyData: !!pimlyData,
            hasKrowneData: !!krowneData,
            syncedFields: getFieldsToCompare().length
          }
        })
      });
      
      if (!response.ok) {
        throw new Error('Failed to confirm sync');
      }
      
      const result = await response.json();
      console.log('Sync confirmed:', result);
      
    } catch (error) {
      console.error('Sync confirmation failed:', error);
      // Optionally handle error state here
    } finally {
      setSyncing(false);
    }
  };

  const normalizeForComparison = (value) => {
    if (value === null || value === undefined) return null;
    
    // Handle boolean-like strings first
    if (typeof value === 'string') {
      const upperValue = value.toUpperCase().trim();
      if (upperValue === 'TRUE' || upperValue === 'YES') return 'boolean_true';
      if (upperValue === 'FALSE' || upperValue === 'NO') return 'boolean_false';
      
      // Handle fractions and mixed numbers (e.g., "8 1/2", "8-1/2", "1/2")
      const fractionMatch = value.match(/(\d+)[\s\-]?(\d+)\/(\d+)/); // Mixed numbers like "8 1/2" or "8-1/2"
      const simpleFractionMatch = value.match(/^(\d+)\/(\d+)$/); // Simple fractions like "1/2"
      
      if (fractionMatch) {
        const whole = parseInt(fractionMatch[1]);
        const numerator = parseInt(fractionMatch[2]);
        const denominator = parseInt(fractionMatch[3]);
        return whole + (numerator / denominator);
      } else if (simpleFractionMatch) {
        const numerator = parseInt(simpleFractionMatch[1]);
        const denominator = parseInt(simpleFractionMatch[2]);
        return numerator / denominator;
      }
      
      // If it's a string that looks like a price, normalize it
      const priceMatch = value.match(/[\d.,]+/);
      if (priceMatch) {
        const numericValue = parseFloat(priceMatch[0].replace(/,/g, ''));
        if (!isNaN(numericValue)) {
          return numericValue;
        }
      }
      // For non-price strings, normalize case and whitespace
      return value.toLowerCase().trim();
    }
    
    // Handle actual boolean values
    if (typeof value === 'boolean') return value ? 'boolean_true' : 'boolean_false';
    
    // For numbers, return as-is
    if (typeof value === 'number') return value;
    
    // For arrays, sort them before stringifying for comparison
    if (Array.isArray(value)) {
      const sortedArray = [...value].sort((a, b) => {
        // Handle different data types in arrays
        const aStr = String(a).toLowerCase().trim();
        const bStr = String(b).toLowerCase().trim();
        return aStr.localeCompare(bStr);
      });
      return JSON.stringify(sortedArray);
    }
    
    // For objects, stringify for comparison
    return JSON.stringify(value);
  };

  // Helper function to check if values match
  const valuesMatch = (value1, value2) => {
    const normalized1 = normalizeForComparison(value1);
    const normalized2 = normalizeForComparison(value2);
    return normalized1 === normalized2;
  };

  // Helper function to normalize structured data using field mappings
  const normalizeStructuredData = (data, fieldCategory) => {
    if (!data || !FIELD_MAPPINGS[fieldCategory]) return {};
    
    // If data is a string, try to parse it as JSON
    let parsedData = data;
    if (typeof data === 'string') {
      try {
        parsedData = JSON.parse(data);
      } catch {
        return { value: data };
      }
    }
    
    // If data is not an object, return as simple value
    if (typeof parsedData !== 'object' || Array.isArray(parsedData)) {
      return Array.isArray(parsedData) ? parseStructuredData(parsedData) : { value: parsedData };
    }
    
    // Normalize field names using mappings and handle multiple values for same canonical field
    const normalizedData = {};
    
    for (const [actualKey, value] of Object.entries(parsedData)) {
      const canonicalKey = findCanonicalField(fieldCategory, actualKey);
      
      if (canonicalKey) {
        // If canonical key already exists, combine values
        if (normalizedData[canonicalKey]) {
          // If both are objects, merge them
          if (typeof normalizedData[canonicalKey] === 'object' && typeof value === 'object') {
            normalizedData[canonicalKey] = { ...normalizedData[canonicalKey], ...value };
          } else if (Array.isArray(normalizedData[canonicalKey])) {
            // If existing is array, add new value
            normalizedData[canonicalKey].push(value);
          } else {
            // Convert to array with both values
            normalizedData[canonicalKey] = [normalizedData[canonicalKey], value];
          }
        } else {
          // Add array sorting for consistent comparison
          if (Array.isArray(value)) {
            normalizedData[canonicalKey] = [...value].sort((a, b) => {
              const aStr = String(a).toLowerCase().trim();
              const bStr = String(b).toLowerCase().trim(); 
              return aStr.localeCompare(bStr);
            });
          } else {
            normalizedData[canonicalKey] = value;
          }
        }
      } else {
        // Use original key if no mapping found
        const finalKey = actualKey.toLowerCase().replace(/[^a-zA-Z0-9]/g, '_');
        if (Array.isArray(value)) {
          normalizedData[finalKey] = [...value].sort((a, b) => {
            const aStr = String(a).toLowerCase().trim();
            const bStr = String(b).toLowerCase().trim(); 
            return aStr.localeCompare(bStr);
          });
        } else {
          normalizedData[finalKey] = value;
        }
      }
    }
    
    return normalizedData;
  };

  // Helper function to parse structured data into subfields
  const parseStructuredData = (data, fieldKey = null) => {
    if (!data) return {};
    
    // Special handling for Related Products
    if (fieldKey === 'relatedProducts') {
      if (typeof data === 'string') {
        try {
          // Split by newlines and parse each JSON object
          const lines = data.split('\n').filter(line => line.trim());
          const products = [];
          
          for (const line of lines) {
            try {
              const product = JSON.parse(line);
              // Extract admin_name for Pimly objects, sku for Krowne objects
              if (product.admin_name) {
                products.push(product.admin_name);
              } else if (product.sku) {
                products.push(product.sku);
              }
            } catch (e) {
              // Skip invalid JSON lines
            }
          }
          
          return products.length > 0 ? { products: products.sort() } : {};
        } catch (e) {
          return { value: data };
        }
      }
    }
    
    // If data is a string, try to parse it as JSON
    if (typeof data === 'string') {
      try {
        const parsed = JSON.parse(data);
        return typeof parsed === 'object' ? parsed : { value: data };
      } catch {
        // If not valid JSON, treat as plain text
        return { value: data };
      }
    }
    
    // If data is already an object, return as is
    if (typeof data === 'object' && !Array.isArray(data)) {
      return data;
    }
    
    // If data is an array, convert to indexed object
    if (Array.isArray(data)) {
      const result = {};
      data.forEach((item, index) => {
        if (typeof item === 'object') {
          Object.keys(item).forEach(key => {
            const fieldKey = `${key}_${index + 1}`;
            result[fieldKey] = item[key];
          });
        } else {
          result[`item_${index + 1}`] = item;
        }
      });
      return result;
    }
    
    return { value: data };
  };

  // Updated renderSubfields function
  const renderSubfields = (pimlyData, krowneData, fieldKey) => {
    // For Related Products, use special parsing
    if (fieldKey === 'relatedProducts') {
      const pimlySubfields = parseStructuredData(pimlyData, fieldKey);
      const krowneSubfields = parseStructuredData(krowneData, fieldKey);
      
      // Merge all unique keys from both sources
      const allKeys = new Set([
        ...Object.keys(pimlySubfields),
        ...Object.keys(krowneSubfields)
      ]);
      
      const sortedKeys = Array.from(allKeys).sort();
      
      if (sortedKeys.length === 0) {
        return {
          pimly: <span className="null-value">—</span>,
          krowne: <span className="null-value">—</span>
        };
      }

      const renderSide = (subfields) => (
        <div className="subfield-container">
          {sortedKeys.map((key) => {
            const pimlyValue = pimlySubfields[key];
            const krowneValue = krowneSubfields[key];
            const subfieldMatches = valuesMatch(pimlyValue, krowneValue);
            
            return (
              <div key={key} className={`subfield-item ${subfieldMatches ? 'subfield-match' : 'subfield-mismatch'}`}>
                <span className="subfield-label">{key.replace(/_/g, ' ')}:</span>
                <span className="subfield-value">
                  {subfields[key] !== undefined 
                    ? renderValue(subfields[key]) 
                    : <span className="null-value">—</span>
                  }
                </span>
              </div>
            );
          })}
        </div>
      );

      return {
        pimly: renderSide(pimlySubfields),
        krowne: renderSide(krowneSubfields)
      };
    }
    
    // Determine field category based on the field key for other fields
    let fieldCategory = 'specifications'; // default
    if (fieldKey === 'certifications') fieldCategory = 'certifications';
    if (fieldKey === 'links') fieldCategory = 'links';
    
    // Normalize data using field mappings for other fields
    const pimlySubfields = normalizeStructuredData(pimlyData, fieldCategory);
    const krowneSubfields = normalizeStructuredData(krowneData, fieldCategory);
    
    // Merge all unique keys from both sources
    const allKeys = new Set([
      ...Object.keys(pimlySubfields),
      ...Object.keys(krowneSubfields)
    ]);
    
    const sortedKeys = Array.from(allKeys).sort();
    
    if (sortedKeys.length === 0) {
      return {
        pimly: <span className="null-value">—</span>,
        krowne: <span className="null-value">—</span>
      };
    }

    // If both sides have only a single 'value' field, render as simple values
    if (sortedKeys.length === 1 && sortedKeys[0] === 'value') {
      return {
        pimly: renderValue(pimlySubfields.value),
        krowne: renderValue(krowneSubfields.value)
      };
    }

    const renderSide = (subfields) => (
      <div className="subfield-container">
        {sortedKeys.map((key) => {
          const pimlyValue = pimlySubfields[key];
          const krowneValue = krowneSubfields[key];
          const subfieldMatches = valuesMatch(pimlyValue, krowneValue);
          
          return (
            <div key={key} className={`subfield-item ${subfieldMatches ? 'subfield-match' : 'subfield-mismatch'}`}>
              <span className="subfield-label">{key.replace(/_/g, ' ')}:</span>
              <span className="subfield-value">
                {subfields[key] !== undefined 
                  ? renderValue(subfields[key]) 
                  : <span className="null-value">—</span>
                }
              </span>
            </div>
          );
        })}
      </div>
    );

    return {
      pimly: renderSide(pimlySubfields),
      krowne: renderSide(krowneSubfields)
    };
  };

  const renderComparisonRow = (field, pimlyValue, krowneValue) => {
    const fieldValuesMatch = valuesMatch(pimlyValue, krowneValue);
    const hasValues = pimlyValue !== null || krowneValue !== null;

    if (!hasValues) return null;

    const hasSubfields = field.hasSubfields;

    if (hasSubfields) {
      const subfieldResults = renderSubfields(pimlyValue, krowneValue, field.key);
      
      return (
        <tr
          key={field.key}
          className={`comparison-row ${fieldValuesMatch ? "match" : "mismatch"} subfield-row`}
        >
          <td className="field-name">
            {field.label}
            <span className="subfield-indicator">📋</span>
          </td>
          <td className="pimly-value">
            {subfieldResults.pimly}
          </td>
          <td className="krowne-value">
            {subfieldResults.krowne}
          </td>
        </tr>
      );
    }

    return (
      <tr
        key={field.key}
        className={`comparison-row ${fieldValuesMatch ? "match" : "mismatch"}`}
      >
        <td className="field-name">{field.label}</td>
        <td className="pimly-value">{renderValue(pimlyValue)}</td>
        <td className="krowne-value">{renderValue(krowneValue)}</td>
      </tr>
    );
  };

  const renderValue = (value) => {
    if (value === null || value === undefined) {
      return <span className="null-value">—</span>;
    }

    if (typeof value === "object") {
      if (Array.isArray(value)) {
        if (value.length === 0)
          return <span className="empty-value">Empty</span>;
        return (
          <ul className="value-list">
            {value.map((item, idx) => (
              <li key={idx}>
                {typeof item === "object" ? JSON.stringify(item) : item}
              </li>
            ))}
          </ul>
        );
      }
      return (
        <span className="object-value">{JSON.stringify(value, null, 2)}</span>
      );
    }

    if (typeof value === "boolean") {
      return (
        <span className={`boolean-value ${value ? "true" : "false"}`}>
          {value ? "Yes" : "No"}
        </span>
      );
    }

    // Handle URLs
    if (
      typeof value === "string" &&
      (value.startsWith("http://") || value.startsWith("https://"))
    ) {
      return (
        <a
          href={value}
          target="_blank"
          rel="noopener noreferrer"
          className="link-value"
        >
          View
        </a>
      );
    }

    return <span className="text-value">{value}</span>;
  };

  const getFieldsToCompare = () => {
    const fields = [
      { key: "name", label: "Name", pimly: "Name", krowne: "name", hasSubfields: false },
      { key: "series", label: "Series", pimly: "Series", krowne: "series", hasSubfields: false },
      {
        key: "price",
        label: "List Price",
        pimly: "List Price",
        krowne: "price",
        hasSubfields: false
      },
      {
        key: "features",
        label: "Features",
        pimly: "Features",
        krowne: "features",
        hasSubfields: false
      },
      {
        key: "specifications",
        label: "Specifications",
        pimly: "Specifications__c",
        krowne: "specifications",
        hasSubfields: true
      },
      {
        key: "certifications",
        label: "Certifications",
        pimly: "Certifications__c",
        krowne: "certifications",
        hasSubfields: true
      },
      {
        key: "warranty",
        label: "Warranty",
        pimly: "Warranty",
        krowne: "warranty",
        hasSubfields: false
      },
      {
        key: "links",
        label: "Files & Links",
        pimly: "Files__c",
        krowne: "files",
        hasSubfields: true
      },
      {
        key: "relatedProducts",
        label: "Related Products",
        pimly: "Related Products",
        krowne: "related_products",
        hasSubfields: false
      },
      {
        key: "miscellaneous",
        label: "Miscellaneous",
        pimly: "Miscellaneous",
        krowne: "miscellaneous",
        hasSubfields: false
      },
    ];
    return fields;
  };

  const extractPimlyValue = (field) => {
    if (!pimlyData) return null;

    // Try multiple possible field names in Pimly data
    const possibleFields = [
      field.pimly,
      field.key,
      `pimly__${field.pimly}`,
      `pimly__${field.key}__c`,
      field.pimly.replace("__c", ""),
      field.key.charAt(0).toUpperCase() + field.key.slice(1),
    ];

    for (const fieldName of possibleFields) {
      if (pimlyData[fieldName] !== undefined) {
        return pimlyData[fieldName];
      }
    }

    return null;
  };

  const extractKrowneValue = (field) => {
    if (!krowneData) return null;

    // Check if krowneData has a nested 'krowne' object (from scraper)
    const dataSource = krowneData.krowne || krowneData;

    // Try to find the field in the Krowne data
    return dataSource[field.krowne] || dataSource[field.key] || null;
  };

  if (!productData) {
    return null;
  }

  const sku = productData.sku || productData.SKU || productData.Id;
  const productName =
    pimlyData?.Name ||
    pimlyData?.name ||
    krowneData?.krowne?.name ||
    krowneData?.name ||
    "Product data loading...";

  // Debug information for development
  const debugInfo = {
    status: productData.comparison?.status || productData.status || "unknown",
    hasPimly: !!pimlyData,
    hasKrowne: !!krowneData,
  };

  console.log("ProductCard Debug:", debugInfo);

  // Check if we have data to show sync button
  const hasDataToSync = pimlyData || krowneData;

  return (
    <div className="product-card-container">
      {/* Product Card */}
      <div className="product-card">
        {/* Header with SKU and Name */}
        <div className="product-header-bar">
          <div className="sku-section">
            <h2 className="sku-title">SKU</h2>
            <p className="sku-value">{sku}</p>
          </div>
          <div className="name-section">
            <h2 className="name-title">Name</h2>
            <p className="name-value">{productName}</p>
          </div>
        </div>

        {/* Dev Mode Toggle with Top Confirm Sync Button */}
        <div className="dev-mode-toggle-container">
          <div className="toggle-group">
            <label className="toggle-switch">
              <input type="checkbox" checked={devMode} onChange={toggleDevMode} />
              <span className="toggle-slider"></span>
            </label>
            <span className="toggle-label">Dev Mode</span>
          </div>
          {hasDataToSync && !devMode && (
            <button
              className="confirm-sync-button compact"
              onClick={handleConfirmSync}
              disabled={syncing}
            >
              {syncing ? "Confirming..." : "✓ Confirm Sync"}
            </button>
          )}
        </div>

        {/* Content Area */}
        {!devMode ? (
          /* Comparison Table View */
          pimlyData || krowneData ? (
            <div className="comparison-table-container">
              <table className="comparison-table">
                <thead>
                  <tr>
                    <th className="field-header"></th>
                    <th className="source-header pimly-header">
                      <img
                        src="/pimly-logo.png"
                        alt="Pimly"
                        className="source-logo"
                      />
                      <span>Pimly (Salesforce) </span>
                    </th>
                    <th className="source-header krowne-header">
                      <img
                        src="/krowne-logo.svg"
                        alt="Krowne"
                        className="source-logo"
                      />
                      <span>Krowne.com</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {getFieldsToCompare().map((field) =>
                    renderComparisonRow(
                      field,
                      extractPimlyValue(field),
                      extractKrowneValue(field)
                    )
                  )}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="no-data-message">
              <div className="icon">❌</div>
              <h3>Not found in either system</h3>
              <p>SKU {sku} was not found in Pimly or Krowne databases.</p>
              <p style={{ marginTop: "10px", fontSize: "14px", color: "#999" }}>
                Please verify the SKU and try again, or check if you're
                authenticated with both systems.
              </p>
            </div>
          )
        ) : (
          /* Dev Mode - Raw JSON View */
          <div className="dev-mode-content">
            <div className="dev-tabs">
              <button
                className={`dev-tab ${activeTab === "pimly" ? "active" : ""}`}
                onClick={() => setActiveTab("pimly")}
              >
                Pimly Raw JSON
              </button>
              <button
                className={`dev-tab ${activeTab === "krowne" ? "active" : ""}`}
                onClick={() => setActiveTab("krowne")}
              >
                Krowne Raw JSON
              </button>

            </div>

            <div className="json-viewer">
              {activeTab === "pimly" && (
                <pre className="json-content">
                  {pimlyData
                    ? JSON.stringify(pimlyData, null, 2)
                    : "No Pimly data available"}
                </pre>
              )}
              {activeTab === "krowne" && (
                <pre className="json-content">
                  {krowneData
                    ? JSON.stringify(krowneData, null, 2)
                    : "No Krowne data available"}
                </pre>
              )}

            </div>

            {/* Debug Info in Dev Mode */}
            <div
              className="debug-info"
              style={{
                padding: "10px",
                background: "#f0f0f0",
                marginTop: "10px",
              }}
            >
              {productData && (
                <details className="debug-info">
                  <summary>Debug Information</summary>
                  <pre style={{ fontSize: "12px" }}>
                    {JSON.stringify(debugInfo, null, 2)}
                  </pre>
                </details>
              )}
            </div>
          </div>
        )}

        {/* Bottom Confirm Sync Button */}
        {hasDataToSync && !devMode && (
          <div className="sync-section bottom-sync">
            <button
              className="confirm-sync-button"
              onClick={handleConfirmSync}
              disabled={syncing}
            >
              {syncing ? "Confirming Sync..." : "✓ Confirm Sync"}
            </button>
          </div>
        )}

        {/* Original Sync Button (if needed) */}
        {onSync && !devMode && (
          <div className="sync-section">
            <button
              className="sync-button"
              onClick={() => onSync(sku)}
              disabled={loading}
            >
              {loading ? "Syncing..." : "Sync to CMS"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default ProductCard;