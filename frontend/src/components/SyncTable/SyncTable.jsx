// src/components/SyncTable/SyncTable.jsx
import React, { useEffect, useState } from "react";
import api from "../../services/api";
import "./SyncTable.css";

const SyncTable = () => {
  const [skus, setSkus] = useState([]);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncingSku, setSyncingSku] = useState(null);
  const [error, setError] = useState("");
  const [batchProgress, setBatchProgress] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState('connected');

  // Configuration - you can adjust these values
  const COMPARISON_BATCH_SIZE = 10; // Start smaller to test performance
  const BATCH_DELAY = 2000; // 2 seconds between batches
  const MAX_RETRIES = 2; // Reduced retries to fail faster

  // Helper function to detect connection errors
  const isConnectionError = (error) => {
    const errorMessage = error.message?.toLowerCase() || '';
    return errorMessage.includes('failed to fetch') || 
           errorMessage.includes('connection refused') || 
           errorMessage.includes('connection reset') ||
           errorMessage.includes('network error') ||
           errorMessage.includes('timeout');
  };

  // Helper function to check server health
  const checkServerConnection = async () => {
    try {
      await api.healthCheck();
      setConnectionStatus('connected');
      return true;
    } catch (error) {
      setConnectionStatus('disconnected');
      return false;
    }
  };

  useEffect(() => {
    let mounted = true;

    const loadAndCompare = async () => {
      try {
        setLoading(true);
        setBatchProgress(null);
        setError("");
        
        // 1) Get SKUs
        const skuResponse = await api.getProductSKUs();
        const fetchedSkus = Array.isArray(skuResponse) ? skuResponse : skuResponse.skus || [];
        if (!mounted) return;
        setSkus(fetchedSkus);

        if (fetchedSkus.length === 0) {
          setResults([]);
          setLoading(false);
          return;
        }

        // 2) Validate and clean SKUs
        const validation = api.validateBatch?.(fetchedSkus) || { cleanedSkus: fetchedSkus };
        const cleanSkus = validation.cleanedSkus || fetchedSkus;
        
        if (validation.duplicates > 0) {
          console.warn(`⚠️ Removed ${validation.duplicates} duplicate SKUs`);
        }

        // 3) Process SKUs in batches with enhanced error handling
        const totalBatches = Math.ceil(cleanSkus.length / COMPARISON_BATCH_SIZE);
        let allResults = [];
        let failedBatches = [];

        console.log(`📦 Processing ${cleanSkus.length} SKUs in ${totalBatches} batches of ${COMPARISON_BATCH_SIZE}`);

        for (let i = 0; i < totalBatches; i++) {
          if (!mounted) return;

          const start = i * COMPARISON_BATCH_SIZE;
          const end = Math.min(start + COMPARISON_BATCH_SIZE, cleanSkus.length);
          const batch = cleanSkus.slice(start, end);
          
          setBatchProgress({ 
            current: i + 1, 
            total: totalBatches, 
            processed: allResults.length,
            currentSku: start + 1,
            totalSkus: cleanSkus.length
          });

          let batchSuccess = false;
          let retries = 0;

          // Retry mechanism for failed batches
          while (!batchSuccess && retries <= MAX_RETRIES) {
            try {
              console.log(`🔄 Processing batch ${i + 1}/${totalBatches} (attempt ${retries + 1}/${MAX_RETRIES + 1})`);
              
              const compareResp = await api.compareBatch(batch);
              const formatted = api.formatComparisonResults(compareResp);
              
              if (!mounted) return;
              
              allResults = [...allResults, ...(formatted || [])];
              
              // Update UI immediately with new results
              setResults([...allResults]);
              
              console.log(`✅ Batch ${i + 1} completed: ${formatted.length} results (Total: ${allResults.length})`);
              batchSuccess = true;
              setConnectionStatus('connected');
              
            } catch (batchError) {
              retries++;
              console.error(`❌ Batch ${i + 1} failed (attempt ${retries}):`, batchError);
              
              // Check if it's a connection error
              if (isConnectionError(batchError)) {
                setConnectionStatus('disconnected');
                
                if (retries <= MAX_RETRIES) {
                  setConnectionStatus('reconnecting');
                  console.log(`🔌 Server appears disconnected. Checking connection...`);
                  
                  const reconnectDelay = 5000;
                  console.log(`⏳ Waiting ${reconnectDelay}ms before checking server...`);
                  await new Promise(resolve => setTimeout(resolve, reconnectDelay));
                  
                  const isConnected = await checkServerConnection();
                  if (!isConnected) {
                    console.log(`💔 Server still unavailable. Stopping batch processing.`);
                    setError(`Server connection lost. Please restart the backend server and refresh the page. Processed ${allResults.length} products before disconnection.`);
                    return;
                  } else {
                    console.log(`✅ Server connection restored!`);
                    setConnectionStatus('connected');
                  }
                }
              } else {
                // Non-connection error, use normal retry logic
                if (retries <= MAX_RETRIES) {
                  const retryDelay = Math.min(BATCH_DELAY * retries, 10000);
                  console.log(`⏳ Retrying batch ${i + 1} in ${retryDelay}ms...`);
                  await new Promise(resolve => setTimeout(resolve, retryDelay));
                }
              }
              
              if (retries > MAX_RETRIES) {
                failedBatches.push({
                  batchNumber: i + 1,
                  skus: batch,
                  error: batchError.message,
                  isConnectionError: isConnectionError(batchError)
                });
                console.error(`💥 Batch ${i + 1} failed after ${MAX_RETRIES} retries`);
              }
            }
          }

          // Delay between successful batches
          if (batchSuccess && i < totalBatches - 1 && BATCH_DELAY > 0) {
            console.log(`⏸️ Waiting ${BATCH_DELAY}ms before next batch...`);
            await new Promise(resolve => setTimeout(resolve, BATCH_DELAY));
          }
        }

        if (!mounted) return;
        
        setResults(allResults);
        
        // Show final status
        if (failedBatches.length > 0) {
          const errorMsg = `Completed with ${failedBatches.length} batch failures. ${allResults.length} products processed successfully.`;
          setError(errorMsg);
          console.warn(errorMsg, failedBatches);
        } else {
          console.log(`🎉 All batches completed successfully! ${allResults.length} products processed.`);
        }
        
        setBatchProgress(null);
        
      } catch (err) {
        console.error("Failed to load/compare SKUs", err);
        setError(err.message || "Failed to load/compare SKUs");
      } finally {
        if (mounted) {
          setLoading(false);
          setBatchProgress(null);
        }
      }
    };

    loadAndCompare();

    return () => {
      mounted = false;
    };
  }, []);

  const handleSync = async (sku, mismatches = []) => {
    try {
      setSyncingSku(sku);
      await api.syncProduct(sku, mismatches);
      // re-run comparison for this sku (best-effort)
      const singleResp = await api.compareSingleProduct(sku);
      const formatted = api.formatComparisonResults(singleResp);
      setResults(prev => {
        const without = prev.filter(r => r.sku !== sku);
        return [...without, ...(formatted || [])];
      });
    } catch (err) {
      console.error("Sync failed for", sku, err);
      alert(`Sync failed for ${sku}: ${err.message || err}`);
    } finally {
      setSyncingSku(null);
    }
  };

  const getStatusInfo = (status) => {
    return api.getStatusDisplayInfo ? api.getStatusDisplayInfo(status) : { label: status || "Unknown" };
  };

  if (loading) {
    return (
      <div className="sync-table__state">
        {batchProgress ? (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              <span>Processing batch {batchProgress.current} of {batchProgress.total}</span>
              {connectionStatus === 'disconnected' && (
                <span style={{ color: 'red', fontSize: '12px' }}>🔴 Server Disconnected</span>
              )}
              {connectionStatus === 'reconnecting' && (
                <span style={{ color: 'orange', fontSize: '12px' }}>🟡 Reconnecting...</span>
              )}
              {connectionStatus === 'connected' && batchProgress.current > 1 && (
                <span style={{ color: 'green', fontSize: '12px' }}>🟢 Connected</span>
              )}
            </div>
            <div>{batchProgress.processed || 0} products processed so far</div>
            {batchProgress.currentSku && batchProgress.totalSkus && (
              <div style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
                Processing SKUs {batchProgress.currentSku} - {Math.min(batchProgress.currentSku + COMPARISON_BATCH_SIZE - 1, batchProgress.totalSkus)} of {batchProgress.totalSkus}
              </div>
            )}
            <div style={{ marginTop: '12px' }}>
              <div style={{ 
                width: '100%', 
                height: '8px', 
                backgroundColor: '#e0e0e0', 
                borderRadius: '4px',
                overflow: 'hidden'
              }}>
                <div style={{
                  width: `${(batchProgress.current / batchProgress.total) * 100}%`,
                  height: '100%',
                  backgroundColor: connectionStatus === 'connected' ? '#4caf50' : 
                                 connectionStatus === 'reconnecting' ? '#ff9800' : '#f44336',
                  transition: 'width 0.3s ease, background-color 0.3s ease'
                }} />
              </div>
              <div style={{ fontSize: '12px', marginTop: '4px', textAlign: 'center' }}>
                {Math.round((batchProgress.current / batchProgress.total) * 100)}% complete
              </div>
            </div>
          </div>
        ) : (
          <div>
            Loading SKUs and starting comparison...
            <div style={{ fontSize: '12px', color: '#666', marginTop: '8px' }}>
              Batch size: {COMPARISON_BATCH_SIZE} SKUs, Delay: {BATCH_DELAY}ms between batches
            </div>
          </div>
        )}
      </div>
    );
  }
  
  if (error) return <div className="sync-table__state sync-table__state--error">{error}</div>;

  return (
    <div className="sync-table__wrap">
      <div className="sync-table__header">
        <h2 className="sync-table__title">Product SKUs</h2>
        <div className="sync-table__count">{results.length} items</div>
      </div>

      <div className="sync-table__container" role="region" aria-label="Product SKUs and sync status">
        <table className="sync-table">
          <thead>
            <tr>
              <th>#</th>
              <th>SKU</th>
              <th>Pimly Data</th>
              <th>Krowne Data</th>
              <th>Sync Status</th>
              <th>Actions</th>
            </tr>
          </thead>

          <tbody>
            {results.length === 0 ? (
              <tr>
                <td colSpan="6" className="sync-table__empty">No comparison results</td>
              </tr>
            ) : (
              results
                .sort((a, b) => (a.sku || "").localeCompare(b.sku || ""))
                .map((row, idx) => {
                  const pim = row.productData?.salesforce || row.salesforce || {};
                  const krow = row.productData?.krowne || row.krowne || {};
                  const status = row.status || api.determineProductStatus?.(row) || "unknown";
                  const statusInfo = getStatusInfo(status);
                  const mismatches = row.productData?.comparison?.mismatches || [];

                  return (
                    <tr key={row.sku || idx} className="sync-table__row">
                      <td className="sync-table__cell sync-table__cell--index">{idx + 1}</td>
                      <td className="sync-table__cell sync-table__cell--sku">{row.sku}</td>

                      <td className="sync-table__cell sync-table__cell--pimly">
                        <div className="source-field">
                          <div className="source-field__title">{pim.name || pim.sku || "--"}</div>
                          <div className="source-field__meta">{pim.price ? api.formatFieldValue(pim.price, 'price') : ""}</div>
                        </div>
                      </td>

                      <td className="sync-table__cell sync-table__cell--krowne">
                        <div className="source-field">
                          <div className="source-field__title">{krow.name || krow.krowne_name || krow.sku || "--"}</div>
                          <div className="source-field__meta">{krow.price ? api.formatFieldValue(krow.price, 'price') : ""}</div>
                        </div>
                      </td>

                      <td className="sync-table__cell sync-table__cell--status">
                        <span className={`status-badge status-badge--${statusInfo.color || 'default'}`}>
                          <span className="status-badge__icon">{statusInfo.icon || ""}</span>
                          <span className="status-badge__label">{statusInfo.label}</span>
                        </span>

                        {mismatches && mismatches.length > 0 && (
                          <div className="mismatch-count">{mismatches.length} mismatch(es)</div>
                        )}
                      </td>

                      <td className="sync-table__cell sync-table__cell--actions">
                        <button
                          className="btn btn--primary"
                          disabled={!!syncingSku}
                          onClick={() => handleSync(row.sku, mismatches)}
                        >
                          {syncingSku === row.sku ? "Syncing…" : "Sync"}
                        </button>
                      </td>
                    </tr>
                  );
                })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default SyncTable;