import React, { useState, useEffect } from "react";
import "./ProductCard.css";

const ProductCard = ({ productData, onSync }) => {
  const [devMode, setDevMode] = useState(false);
  const [activeTab, setActiveTab] = useState("comparison");
  const [pimlyData, setPimlyData] = useState(null);
  const [krowneData, setKrowneData] = useState(null);
  const [mappedData, setMappedData] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (productData) {
      // Extract data from the product data structure
      // Handle different response formats from various endpoints

      // For comparison endpoint responses
      if (productData.raw_data) {
        setPimlyData(
          productData.raw_data.pimly || productData.salesforce || null
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

  const renderComparisonRow = (field, pimlyValue, krowneValue) => {
    const valuesMatch =
      JSON.stringify(pimlyValue) === JSON.stringify(krowneValue);
    const hasValues = pimlyValue !== null || krowneValue !== null;

    if (!hasValues) return null;

    return (
      <tr
        key={field}
        className={`comparison-row ${valuesMatch ? "match" : "mismatch"}`}
      >
        <td className="field-name">{field}</td>
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
      { key: "name", label: "Name", pimly: "Name", krowne: "name" },
      { key: "series", label: "Series", pimly: "Series__c", krowne: "series" },
      {
        key: "price",
        label: "List Price",
        pimly: "ListPrice__c",
        krowne: "price",
      },
      {
        key: "features",
        label: "Features",
        pimly: "Features__c",
        krowne: "features",
      },
      {
        key: "specifications",
        label: "Specifications",
        pimly: "Specifications__c",
        krowne: "specifications",
      },
      {
        key: "certifications",
        label: "Certifications",
        pimly: "Certifications__c",
        krowne: "certifications",
      },
      {
        key: "files",
        label: "Files & Links",
        pimly: "Files__c",
        krowne: "files",
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

  const sku = productData.sku || productData.SKU || productData.Id || "12-801L";
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
    hasMappedData: !!mappedData,
    hasComparison: !!(productData.comparison || mappedData),
    mismatchCount: productData.comparison?.mismatch_count || 0,
  };

  console.log("ProductCard Debug:", debugInfo);

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

        {/* Dev Mode Toggle */}
        <div className="dev-mode-toggle-container">
          <label className="toggle-switch">
            <input type="checkbox" checked={devMode} onChange={toggleDevMode} />
            <span className="toggle-slider"></span>
          </label>
          <span className="toggle-label">Dev Mode</span>
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
                      <span>Pimly</span>
                    </th>
                    <th className="source-header krowne-header">
                      <img
                        src="/krowne-logo.svg"
                        alt="Krowne"
                        className="source-logo"
                      />
                      <span>KROWNE</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {getFieldsToCompare().map((field) =>
                    renderComparisonRow(
                      field.label,
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
              <button
                className={`dev-tab ${activeTab === "mapped" ? "active" : ""}`}
                onClick={() => setActiveTab("mapped")}
              >
                Mapped Data
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
              {activeTab === "mapped" && (
                <pre className="json-content">
                  {mappedData
                    ? JSON.stringify(mappedData, null, 2)
                    : "No mapped data available"}
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

        {/* Sync Button (if needed) */}
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
