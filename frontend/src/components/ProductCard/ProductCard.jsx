import React, { useState, useEffect } from "react";
import "./ProductCard.css";
import api from "../../services/api";

const ProductCard = ({ productData }) => {
  const [detailedComparison, setDetailedComparison] = useState(null);
  const [mappedData, setMappedData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState("comparison"); // 'comparison' or 'mapped'

  // Extract data with proper structure handling
  const { sku, salesforce, krowne, comparison, status } = productData || {};

  // Handle the case where krowne might be nested or in different formats
  const krowneData = krowne?.product || krowne;

  // Fetch detailed comparison and mapped data if we have a SKU
  useEffect(() => {
    if (sku) {
      const fetchDetailedData = async () => {
        setLoading(true);
        setError(null);

        try {
          // Try to get detailed comparison using the new mapping system
          const detailedResponse = await api.getDetailedProductComparison(sku);
          setDetailedComparison(detailedResponse);
          setMappedData(detailedResponse.mapped_data);

          console.log("✅ Detailed product data loaded:", {
            sku,
            hasComparison: !!detailedResponse.field_comparisons,
            hasMappedData: !!detailedResponse.mapped_data,
            comparisonFields: detailedResponse.field_comparisons?.length || 0,
          });
        } catch (error) {
          console.error("Error fetching detailed data:", error);
          setError(error.message);

          // Fallback to using the comparison data from props if available
          if (comparison) {
            console.log("Using fallback comparison data from props");
            setDetailedComparison(formatComparisonForDisplay(comparison));
          }
        } finally {
          setLoading(false);
        }
      };

      fetchDetailedData();
    }
  }, [sku, comparison]);

  // Format comparison data for display if using fallback
  const formatComparisonForDisplay = (comparisonData) => {
    if (!comparisonData) return null;

    // Transform the comparison data to match expected format
    const fieldComparisons = [];

    // Add mismatches
    if (comparisonData.mismatches) {
      comparisonData.mismatches.forEach((mismatch) => {
        fieldComparisons.push({
          field_name: mismatch.canonical_name || mismatch.field,
          display_name:
            mismatch.field ||
            mismatch.canonical_name
              ?.replace(/_/g, " ")
              .replace(/\b\w/g, (l) => l.toUpperCase()),
          salesforce_value: mismatch.salesforce,
          krowne_value: mismatch.krowne,
          is_mismatch: true,
          is_match: false,
          has_partial_data: false,
          field_type: "text",
          description: mismatch.description || "",
        });
      });
    }

    // Add partial data
    if (comparisonData.partial_data) {
      comparisonData.partial_data.forEach((partial) => {
        fieldComparisons.push({
          field_name: partial.canonical_name || partial.field,
          display_name:
            partial.field ||
            partial.canonical_name
              ?.replace(/_/g, " ")
              .replace(/\b\w/g, (l) => l.toUpperCase()),
          salesforce_value: partial.salesforce,
          krowne_value: partial.krowne,
          is_mismatch: false,
          is_match: false,
          has_partial_data: true,
          field_type: "text",
          description: partial.description || "",
        });
      });
    }

    // Add matches
    if (comparisonData.matches) {
      comparisonData.matches.forEach((match) => {
        fieldComparisons.push({
          field_name: match.canonical_name || match.field,
          display_name:
            match.field ||
            match.canonical_name
              ?.replace(/_/g, " ")
              .replace(/\b\w/g, (l) => l.toUpperCase()),
          salesforce_value: match.salesforce,
          krowne_value: match.krowne,
          is_mismatch: false,
          is_match: true,
          has_partial_data: false,
          field_type: "text",
          description: match.description || "",
        });
      });
    }

    return {
      sku: sku,
      comparison_summary: comparisonData.summary || {
        matches: comparisonData.match_count || 0,
        mismatches: comparisonData.mismatch_count || 0,
        partial_data: comparisonData.partial_data_count || 0,
        total_fields:
          comparisonData.total_fields_compared || fieldComparisons.length,
      },
      field_comparisons: fieldComparisons,
    };
  };

  // Format price display
  const formatPrice = (price) => {
    if (!price && price !== 0) return "N/A";
    if (typeof price === "number") return `$${price.toFixed(2)}`;
    if (typeof price === "string") {
      const cleanPrice = price.replace(/[^0-9.]/g, "");
      const numericPrice = parseFloat(cleanPrice);
      if (!isNaN(numericPrice)) return `$${numericPrice.toFixed(2)}`;
      return price;
    }
    return String(price);
  };

  const formatFieldValue = (value, fieldType) => {
    if (value === null || value === undefined || value === "") {
      return <span className="empty-value">N/A</span>;
    }

    // Handle complex Pimly objects
    if (typeof value === "object" && !Array.isArray(value)) {
      return formatPimlyObject(value);
    }

    // Handle arrays of Pimly objects
    if (Array.isArray(value)) {
      return formatPimlyArray(value, fieldType);
    }

    switch (fieldType) {
      case "price":
        return formatPrice(value);

      case "boolean":
        return value ? "Yes" : "No";

      case "number":
        return typeof value === "number" ? value.toFixed(2) : value;

      case "list":
        if (Array.isArray(value)) {
          if (value.length === 0)
            return <span className="empty-value">N/A</span>;

          // Handle array of objects (like Pimly properties)
          if (typeof value[0] === "object" && value[0] !== null) {
            return formatPimlyArray(value, fieldType);
          }

          // For simple arrays, use bullet points if multiple items
          if (value.length > 1) {
            return (
              <ul className="feature-list">
                {value.map((item, idx) => (
                  <li key={idx}>{String(item)}</li>
                ))}
              </ul>
            );
          }
          return value.join(", ");
        }
        return String(value);

      case "url":
        if (typeof value === "string" && value.startsWith("http")) {
          return (
            <a
              href={value}
              target="_blank"
              rel="noopener noreferrer"
              className="url-link"
            >
              🔗 {value.length > 60 ? value.substring(0, 60) + "..." : value}
            </a>
          );
        }
        return String(value);

      case "text":
      default:
        // Handle multi-line text (like descriptions with pipe separators)
        if (typeof value === "string" && value.includes(" | ")) {
          const items = value.split(" | ");
          return (
            <ul className="feature-list">
              {items.map((item, idx) => (
                <li key={idx}>{item.trim()}</li>
              ))}
            </ul>
          );
        }

        // Handle long text
        if (typeof value === "string" && value.length > 200) {
          return (
            <div className="long-text" title={value}>
              {value.substring(0, 200)}...
            </div>
          );
        }

        return String(value);
    }
  };

  // New helper function to format Pimly objects
  const formatPimlyObject = (obj) => {
    if (!obj || typeof obj !== "object") {
      return String(obj);
    }

    // Extract the most meaningful information from Salesforce/Pimly objects
    const name = obj.Name || obj.pimly__Admin_Name__c || obj.value;
    const url = obj.pimly__URL__c;
    const type = obj.pimly__Type__c;
    const value = obj.pimly__Value__c || obj.pimly__Property_Value__c;

    // If it has a URL, make it clickable
    if (url) {
      return (
        <div className="pimly-object">
          {url.match(/\.(jpg|jpeg|png|gif|webp)$/i) ? (
            // It's an image
            <div className="pimly-image">
              <img
                src={url}
                alt={name || "Product image"}
                style={{
                  maxWidth: "100px",
                  maxHeight: "100px",
                  objectFit: "cover",
                }}
                onError={(e) => {
                  e.target.style.display = "none";
                }}
              />
              <span className="image-name">{name || "Image"}</span>
            </div>
          ) : (
            // It's a file/document
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="pimly-link"
            >
              📄 {name || "Document"}
              {type && <span className="file-type">({type})</span>}
            </a>
          )}
        </div>
      );
    }

    // If it has a meaningful name/value, display that
    if (name) {
      return (
        <div className="pimly-object">
          <span className="object-name">{name}</span>
          {value && <span className="object-value">: {value}</span>}
          {type && <span className="object-type"> ({type})</span>}
        </div>
      );
    }

    // If it has property name and value (like Pimly Properties)
    const propName = obj.pimly__Property_Name__c;
    const propValue = obj.pimly__Property_Value__c;
    if (propName && propValue) {
      return (
        <div className="pimly-property">
          <strong>{propName}:</strong> {propValue}
        </div>
      );
    }

    // Fallback: show key-value pairs of important fields
    const importantKeys = [
      "Name",
      "Id",
      "pimly__Admin_Name__c",
      "pimly__Value__c",
      "pimly__Type__c",
    ];
    const relevantData = {};

    importantKeys.forEach((key) => {
      if (obj[key]) {
        relevantData[key.replace("pimly__", "").replace("__c", "")] = obj[key];
      }
    });

    if (Object.keys(relevantData).length > 0) {
      return (
        <div className="pimly-object-details">
          {Object.entries(relevantData).map(([key, val]) => (
            <div key={key} className="object-field">
              <span className="field-key">{key}:</span>
              <span className="field-value">{String(val)}</span>
            </div>
          ))}
        </div>
      );
    }

    // Ultimate fallback
    return (
      <span className="complex-object">
        Complex Object ({Object.keys(obj).length} fields)
      </span>
    );
  };

  // New helper function to format arrays of Pimly objects
  const formatPimlyArray = (array, fieldType) => {
    if (!Array.isArray(array) || array.length === 0) {
      return <span className="empty-value">N/A</span>;
    }

    // Handle arrays of objects
    if (typeof array[0] === "object") {
      // For Properties arrays, show as a structured list
      if (array[0].pimly__Property_Name__c || array[0].Name) {
        return (
          <div className="pimly-array properties-list">
            <div className="array-header">{array.length} Properties:</div>
            <div className="properties-grid">
              {array.slice(0, 10).map(
                (
                  item,
                  idx // Limit to first 10 to avoid overwhelming display
                ) => (
                  <div key={idx} className="property-item">
                    {formatPimlyObject(item)}
                  </div>
                )
              )}
              {array.length > 10 && (
                <div className="more-items">
                  ... and {array.length - 10} more
                </div>
              )}
            </div>
          </div>
        );
      }

      // For Digital Assets, show as image/file grid
      if (array[0].pimly__URL__c) {
        return (
          <div className="pimly-array assets-list">
            <div className="array-header">{array.length} Assets:</div>
            <div className="assets-grid">
              {array.slice(0, 6).map(
                (
                  item,
                  idx // Limit to first 6 assets
                ) => (
                  <div key={idx} className="asset-item">
                    {formatPimlyObject(item)}
                  </div>
                )
              )}
              {array.length > 6 && (
                <div className="more-items">
                  ... and {array.length - 6} more
                </div>
              )}
            </div>
          </div>
        );
      }

      // For other object arrays, show a summary
      return (
        <div className="pimly-array object-list">
          <div className="array-header">{array.length} Items:</div>
          <div className="object-summary">
            {array.slice(0, 5).map((item, idx) => (
              <div key={idx} className="summary-item">
                {formatPimlyObject(item)}
              </div>
            ))}
            {array.length > 5 && (
              <div className="more-items">... and {array.length - 5} more</div>
            )}
          </div>
        </div>
      );
    }

    // Handle arrays of simple values
    return (
      <ul className="simple-list">
        {array.map((item, idx) => (
          <li key={idx}>{String(item)}</li>
        ))}
      </ul>
    );
  };

  // Get status indicator
  const getStatusIndicator = () => {
    if (!status) return { text: "Unknown", color: "gray", icon: "?" };

    switch (status) {
      case "found_both":
        return { text: "Synced", color: "green", icon: "✓" };
      case "data_matches":
        return { text: "Data Matches", color: "green", icon: "✓" };
      case "mismatches_found":
        return { text: "Has Differences", color: "yellow", icon: "⚠" };
      case "missing_from_krowne":
        return { text: "Not in Krowne", color: "yellow", icon: "⚠" };
      case "missing_from_salesforce":
        return { text: "Not in Salesforce", color: "red", icon: "✗" };
      case "not_found":
        return { text: "Not Found", color: "gray", icon: "?" };
      default:
        return { text: status, color: "gray", icon: "•" };
    }
  };

  // Get comparison summary from detailed comparison
  const getComparisonSummary = () => {
    if (detailedComparison?.comparison_summary) {
      return {
        matches: detailedComparison.comparison_summary.matches || 0,
        mismatches: detailedComparison.comparison_summary.mismatches || 0,
        partial: detailedComparison.comparison_summary.partial_data || 0,
        total: detailedComparison.comparison_summary.total_fields || 0,
      };
    }

    // Fallback to comparison prop data
    if (comparison) {
      return {
        matches: comparison.match_count || 0,
        mismatches: comparison.mismatch_count || 0,
        partial: comparison.partial_data_count || 0,
        total: comparison.total_fields_compared || 0,
      };
    }

    return { matches: 0, mismatches: 0, partial: 0, total: 0 };
  };

  // Render mapped data categories
  const renderMappedDataCategory = (title, data, type = "object") => {
    if (!data) return null;

    switch (type) {
      case "array":
        if (!Array.isArray(data) || data.length === 0) return null;
        return (
          <div className="mapped-category">
            <h3 className="category-title">{title}</h3>
            <div className="category-content">
              <ul className="mapped-list">
                {data.map((item, idx) => (
                  <li key={idx}>
                    {typeof item === "object" ? JSON.stringify(item) : item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        );

      case "object":
        if (!data || typeof data !== "object" || Object.keys(data).length === 0)
          return null;
        return (
          <div className="mapped-category">
            <h3 className="category-title">{title}</h3>
            <div className="category-content">
              <div className="mapped-grid">
                {Object.entries(data).map(([key, value]) => (
                  <div key={key} className="mapped-item">
                    <span className="mapped-key">{key.replace(/_/g, " ")}</span>
                    <span className="mapped-value">
                      {formatFieldValue(value, api.inferFieldType(key, value))}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );

      case "files":
        if (!data || typeof data !== "object") return null;
        const hasFiles = Object.values(data).some(
          (fileArray) => Array.isArray(fileArray) && fileArray.length > 0
        );
        if (!hasFiles) return null;

        return (
          <div className="mapped-category">
            <h3 className="category-title">{title}</h3>
            <div className="category-content">
              {Object.entries(data).map(([fileType, files]) => {
                if (!Array.isArray(files) || files.length === 0) return null;
                return (
                  <div key={fileType} className="file-type-group">
                    <h4 className="file-type-title">
                      {fileType.replace(/_/g, " ").toUpperCase()}
                    </h4>
                    <ul className="file-list">
                      {files.map((file, idx) => (
                        <li key={idx}>
                          {typeof file === "string" &&
                          file.startsWith("http") ? (
                            <a
                              href={file}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="file-link"
                            >
                              {file.split("/").pop() || file}
                            </a>
                          ) : (
                            file
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          </div>
        );

      case "related":
        if (!data || typeof data !== "object") return null;
        const hasRelated = Object.values(data).some(
          (relArray) => Array.isArray(relArray) && relArray.length > 0
        );
        if (!hasRelated) return null;

        return (
          <div className="mapped-category">
            <h3 className="category-title">{title}</h3>
            <div className="category-content">
              {Object.entries(data).map(([relType, items]) => {
                if (!Array.isArray(items) || items.length === 0) return null;
                return (
                  <div key={relType} className="related-type-group">
                    <h4 className="related-type-title">
                      {relType.replace(/_/g, " ").toUpperCase()}
                    </h4>
                    <ul className="related-list">
                      {items.map((item, idx) => (
                        <li key={idx}>{item}</li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          </div>
        );

      default:
        return (
          <div className="mapped-category">
            <h3 className="category-title">{title}</h3>
            <div className="category-content">
              <div className="mapped-value">
                {formatFieldValue(data, "text")}
              </div>
            </div>
          </div>
        );
    }
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
            <h1 className="product-title">
              {mappedData?.name ||
                salesforce?.name ||
                krowneData?.name ||
                "Product Data"}
            </h1>
            <div className="product-info">
              <span className="sku-label">SKU: {sku}</span>
              <span className={`status-badge status-${statusInfo.color}`}>
                {statusInfo.icon} {statusInfo.text}
              </span>
              {mappedData?.series && (
                <span className="series-badge">
                  Series: {mappedData.series}
                </span>
              )}
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

      {/* Tab Navigation */}
      <div className="tab-navigation">
        <button
          className={`tab-button ${activeTab === "comparison" ? "active" : ""}`}
          onClick={() => setActiveTab("comparison")}
        >
          Field Comparison
        </button>
        <button
          className={`tab-button ${activeTab === "mapped" ? "active" : ""}`}
          onClick={() => setActiveTab("mapped")}
        >
          Mapped Categories
        </button>
      </div>

      {/* Loading and Error States */}
      {loading && (
        <div className="loading-message">Loading detailed product data...</div>
      )}

      {error && (
        <div className="error-message">Error loading data: {error}</div>
      )}

      {/* Tab Content */}
      {!loading && !error && (
        <>
          {activeTab === "comparison" && (
            <>
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
                  <div className="source-title">Krowne Website</div>
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
                      .filter((field) => field.is_mismatch)
                      .map((field, idx) => (
                        <div
                          key={`mismatch-${idx}`}
                          className="comparison-row mismatch-row"
                        >
                          <div className="field-name">
                            <span className="field-title">
                              {field.display_name}
                            </span>
                            {field.description && (
                              <span className="field-description">
                                {field.description}
                              </span>
                            )}
                            {field.notes && (
                              <span className="field-tag">
                                {field.notes.replace(/[\[\]]/g, "")}
                              </span>
                            )}
                          </div>
                          <div className="field-value salesforce-value">
                            {formatFieldValue(
                              field.salesforce_value,
                              field.field_type
                            )}
                          </div>
                          <div className="field-value krowne-value">
                            {formatFieldValue(
                              field.krowne_value,
                              field.field_type
                            )}
                          </div>
                        </div>
                      ))}

                    {/* Show partial data (one side missing) */}
                    {detailedComparison.field_comparisons
                      .filter((field) => field.has_partial_data)
                      .map((field, idx) => (
                        <div
                          key={`partial-${idx}`}
                          className="comparison-row partial-row"
                        >
                          <div className="field-name">
                            <span className="field-title">
                              {field.display_name}
                            </span>
                            {field.description && (
                              <span className="field-description">
                                {field.description}
                              </span>
                            )}
                            {field.notes && (
                              <span className="field-tag">
                                {field.notes.replace(/[\[\]]/g, "")}
                              </span>
                            )}
                          </div>
                          <div
                            className={`field-value salesforce-value ${
                              !field.salesforce_value ? "empty" : ""
                            }`}
                          >
                            {formatFieldValue(
                              field.salesforce_value,
                              field.field_type
                            )}
                          </div>
                          <div
                            className={`field-value krowne-value ${
                              !field.krowne_value ? "empty" : ""
                            }`}
                          >
                            {formatFieldValue(
                              field.krowne_value,
                              field.field_type
                            )}
                          </div>
                        </div>
                      ))}

                    {/* Show matches (only non-empty ones) */}
                    {detailedComparison.field_comparisons
                      .filter(
                        (field) =>
                          field.is_match &&
                          (field.salesforce_value !== null ||
                            field.krowne_value !== null)
                      )
                      .map((field, idx) => (
                        <div
                          key={`match-${idx}`}
                          className="comparison-row match-row"
                        >
                          <div className="field-name">
                            <span className="field-title">
                              {field.display_name}
                            </span>
                            {field.description && (
                              <span className="field-description">
                                {field.description}
                              </span>
                            )}
                            {field.notes && (
                              <span className="field-tag">
                                {field.notes.replace(/[\[\]]/g, "")}
                              </span>
                            )}
                          </div>
                          <div className="field-value salesforce-value">
                            {formatFieldValue(
                              field.salesforce_value,
                              field.field_type
                            )}
                          </div>
                          <div className="field-value krowne-value">
                            {formatFieldValue(
                              field.krowne_value,
                              field.field_type
                            )}
                          </div>
                        </div>
                      ))}
                  </>
                ) : (
                  <div className="no-comparison-data">
                    No detailed comparison data available.
                    {comparison &&
                      " Using summary data from initial comparison."}
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
                <div className="legend-item">
                  <div className="legend-color pimly-only"></div>
                  <span className="legend-label">Pimly Only</span>
                </div>
              </div>
            </>
          )}

          {activeTab === "mapped" && mappedData && (
            <div className="mapped-data-content">
              {/* Basic Info */}
              <div className="mapped-basic-info">
                <h2>Product Information</h2>
                <div className="basic-info-grid">
                  <div className="info-item">
                    <span className="info-label">Name:</span>
                    <span className="info-value">
                      {mappedData.name || "N/A"}
                    </span>
                  </div>
                  <div className="info-item">
                    <span className="info-label">SKU:</span>
                    <span className="info-value">
                      {mappedData.sku || "N/A"}
                    </span>
                  </div>
                  <div className="info-item">
                    <span className="info-label">Series:</span>
                    <span className="info-value">
                      {mappedData.series || "N/A"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Features */}
              {renderMappedDataCategory(
                "Features",
                mappedData.features,
                "array"
              )}

              {/* Specifications */}
              {renderMappedDataCategory(
                "Specifications",
                mappedData.specifications,
                "object"
              )}

              {/* Certifications */}
              {renderMappedDataCategory(
                "Certifications",
                mappedData.certifications,
                "object"
              )}

              {/* Images */}
              {renderMappedDataCategory("Images", mappedData.images, "array")}

              {/* Files */}
              {renderMappedDataCategory(
                "Files & Downloads",
                mappedData.files,
                "files"
              )}

              {/* Related Items */}
              {renderMappedDataCategory(
                "Related Items",
                mappedData.related_items,
                "related"
              )}

              {/* Replacement Parts */}
              {renderMappedDataCategory(
                "Replacement Parts",
                mappedData.additions_replacement_parts,
                "array"
              )}

              {/* Pimly Only Data */}
              {renderMappedDataCategory(
                "Pimly Only Data",
                mappedData.pimly_only,
                "object"
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default ProductCard;
