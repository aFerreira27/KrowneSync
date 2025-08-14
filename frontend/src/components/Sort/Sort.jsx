import React, { useState, useEffect } from 'react';
import CategoryGrid from './CategoryGrid';
import CategoryPopup from './CategoryPopup';
import './Sort.css';

const CATEGORIES = [
  'Unsorted',
  'Unit_Parts_&_Accessories',
  'Faucets',
  'Plumbing_Parts_&_Accessories',
  'Remote_Spouts',
  'Beverage_Dispensing_Parts_&_Accessories',
  'Electronic_Sensor_Faucets',
  'Pre-Rinse_Units',
  'Dump_Sink_Stations',
  'Bar_Sinks',
  'Liquor_Display_Units',
  'Ice_Bin',
  'Drainboards',
  'Storage_Cabinets',
  'Utility_Faucet_&_Pot_Filler',
  'Spouts',
  'Foodservice_Parts_&_Accessories',
  'Krowne_Home_Faucets',
  'Air_Switches',
  'Soap_Dispensers',
  'Pet_Grooming',
  'Drains',
  'Hose_Reels',
  'Casters',
  'Alchemy',
  'Gas_Connectors',
  'Workstations',
  'Bottle_Coolers',
  'Dispensing_Faucets',
  'Gas_System',
  'Dry_Storage_Cabinets',
  'Beverage_Dispensing_Kits',
  'Refrigeration',
  'Sinks',
  'Towers',
  'Gas_Connector_Parts_&_Accessories',
  'Direct_Draw_Cooler',
  'Mug_FrosterFreezers',
  'Glass_Chiller',
  'Glass_Washer',
  'Regulator_Panels',
  'Power_Packs',
  'Drainers_&_Rinsers',
  'Soda_Gun_Holders',
  'Specialized_Underbar_Stations',
  'Speed_Units',
  'Perforated_Inserts',
  'Locking_Covers',
  'Trash_Chute',
  'Mixology_Kits',
  'HydroSift_Water_Filters',
  'Pass_Thru_Units',
  'Robotic_Bartenders',
  'Trunk_Lines',
  'Vinyl_Wrap',
  'Mop_Floor_Sinks',
  'MoveWell'
];

function Sort({ salesforceAuth, onSelectCategory }) {
  const [searchFilter, setSearchFilter] = useState('');
  const [sortOrder, setSortOrder] = useState('alphabetical');
  const [selectedCategoryPopup, setSelectedCategoryPopup] = useState(null);
  const [categoryStats, setCategoryStats] = useState({});
  const [statsLoading, setStatsLoading] = useState(false);
  const [syncHistory, setSyncHistory] = useState([]);

  // Load sync history and calculate category stats
  useEffect(() => {
    if (salesforceAuth.authenticated) {
      loadSyncData();
      // Set up periodic refresh every 30 seconds
      const interval = setInterval(loadSyncData, 30000);
      return () => clearInterval(interval);
    }
  }, [salesforceAuth.authenticated]);

  const loadSyncData = async () => {
    setStatsLoading(true);
    try {
      // Fetch sync history from backend
      const response = await fetch('/api/sync/history', {
        credentials: 'include'
      });
      
      if (response.ok) {
        const data = await response.json();
        const syncData = data.data || [];
        setSyncHistory(syncData);
        
        // Calculate stats per category
        const stats = calculateCategoryStats(syncData);
        setCategoryStats(stats);
      } else {
        console.error('Failed to fetch sync history:', response.status);
      }
    } catch (error) {
      console.error('Error loading sync data:', error);
    }
    setStatsLoading(false);
  };

  const calculateCategoryStats = (syncData) => {
    const stats = {};
    
    // Initialize all categories
    CATEGORIES.forEach(category => {
      stats[category] = {
        total: 0,
        recent: 0,
        old: 0,
        never: 0,
        syncing: 0,
        products: []
      };
    });

    // Process sync history data
    syncData.forEach(record => {
      // Determine category from product data or default to Unsorted
      const category = record.category || 'Unsorted';
      
      if (stats[category]) {
        stats[category].total++;
        
        // Add product info with consistent field names
        const productInfo = {
          sku: record.sku,
          product_name: record.name || record.sku,
          last_sync_date: record.last_sync, // Use last_sync from sync_history.json
          status: record.status,
          sync_count: record.sync_count || 0,
          success_count: record.success_count || 0,
          failed_count: record.failed_count || 0
        };
        
        stats[category].products.push(productInfo);
        
        // Determine sync status based on status and last_sync
        if (record.status === 'pending') {
          stats[category].syncing++;
        } else if (!record.last_sync || record.status === 'never') {
          stats[category].never++;
        } else {
          const lastSync = new Date(record.last_sync);
          const now = new Date();
          const daysSinceSync = (now - lastSync) / (1000 * 60 * 60 * 24);
          
          if (daysSinceSync <= 7) {
            stats[category].recent++;
          } else if (daysSinceSync <= 30) {
            stats[category].old++;
          } else {
            stats[category].never++;
          }
        }
      }
    });

    return stats;
  };

  // Format category name for display
  const formatCategoryName = (category) => {
    let formatted = category.replace(/_/g, ' ').replace(/&/g, '&');
    // Shorten "Parts & Accessories" to "P&A" for display only
    formatted = formatted.replace(/Parts & Accessories/g, 'P&A');
    return formatted;
  };

  // Get icon for category
  const getCategoryIcon = (category) => {
    const iconMap = {
      'Unsorted': '📦',
      'Sinks': '🚿',
      'Faucets': '🚰',
      'Refrigeration': '❄️',
      'Storage_Cabinets': '🗄️',
      'Workstations': '🏢',
      'Bar_Sinks': '🍻',
      'Liquor_Display_Units': '🥃',
      'Bottle_Coolers': '🍺',
      'Ice_Bin': '🧊',
      'Glass_Chiller': '🥶',
      'Glass_Washer': '🫧',
      'Dispensing_Faucets': '🚰',
      'Beverage_Dispensing_Kits': '🥤',
      'Beverage_Dispensing_Parts_&_Accessories': '🔧',
      'Direct_Draw_Cooler': '🍺',
      'Mug_FrosterFreezers': '🥶',
      'Towers': '🏗️',
      'Soda_Gun_Holders': '🔫',
      'Mixology_Kits': '🍸',
      'Trunk_Lines': '🔗',
      'Plumbing_Parts_&_Accessories': '🔧',
      'Remote_Spouts': '💧',
      'Spouts': '💧',
      'Pre-Rinse_Units': '🚿',
      'Utility_Faucet_&_Pot_Filler': '🚰',
      'Electronic_Sensor_Faucets': '📡',
      'Krowne_Home_Faucets': '🏠',
      'Drains': '🕳️',
      'Drainboards': '📋',
      'Drainers_&_Rinsers': '💧',
      'Mop_Floor_Sinks': '🧽',
      'HydroSift_Water_Filters': '💧',
      'Gas_Connectors': '⛽',
      'Gas_System': '⛽',
      'Gas_Connector_Parts_&_Accessories': '🔧',
      'Regulator_Panels': '🎛️',
      'Power_Packs': '🔋',
      'Air_Switches': '💨',
      'Unit_Parts_&_Accessories': '🔧',
      'Foodservice_Parts_&_Accessories': '🔧',
      'Casters': '🛞',
      'Locking_Covers': '🔒',
      'Perforated_Inserts': '🕳️',
      'Dump_Sink_Stations': '🗑️',
      'Specialized_Underbar_Stations': '🏪',
      'Speed_Units': '⚡',
      'Pass_Thru_Units': '↔️',
      'Dry_Storage_Cabinets': '📦',
      'Trash_Chute': '🗑️',
      'Robotic_Bartenders': '🤖',
      'Hose_Reels': '🌀',
      'Soap_Dispensers': '🧼',
      'Pet_Grooming': '🐕',
      'Vinyl_Wrap': '🎨',
      'Alchemy': '⚗️',
      'MoveWell': '🏃‍♂️'
    };
    return iconMap[category] || '📦';
  };

  // Filter categories based on search
  const filteredCategories = CATEGORIES.filter(category =>
    formatCategoryName(category).toLowerCase().includes(searchFilter.toLowerCase())
  );

  // Sort categories based on selected order
  const sortedCategories = [...filteredCategories].sort((a, b) => {
    if (sortOrder === 'alphabetical') {
      if (a === 'Unsorted') return -1;
      if (b === 'Unsorted') return 1;
      return formatCategoryName(a).localeCompare(formatCategoryName(b));
    }
    // Popular order could be based on total products or sync activity
    if (sortOrder === 'popular') {
      const aStats = categoryStats[a] || { total: 0 };
      const bStats = categoryStats[b] || { total: 0 };
      return bStats.total - aStats.total;
    }
    return CATEGORIES.indexOf(a) - CATEGORIES.indexOf(b);
  });

  const handleCategoryClick = (category) => {
    setSelectedCategoryPopup(category);
  };

  const handleViewProducts = (category) => {
    setSelectedCategoryPopup(null);
    if (onSelectCategory) {
      onSelectCategory(category);
    }
  };

  const handleExportCategory = async (category) => {
    const stats = categoryStats[category];
    if (!stats || !stats.products) return;

    // Create CSV content with proper headers
    const csvContent = [
      ['SKU', 'Product Name', 'Category', 'Last Sync', 'Status', 'Sync Count', 'Success Count', 'Failed Count'],
      ...stats.products.map(p => [
        p.sku || '',
        p.product_name || '',
        category,
        p.last_sync_date || 'Never',
        p.status || 'unknown',
        p.sync_count || 0,
        p.success_count || 0,
        p.failed_count || 0
      ])
    ].map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');

    // Download CSV
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${category}_products_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    setSelectedCategoryPopup(null);
  };

  const handleSyncCategory = async (category) => {
    const stats = categoryStats[category];
    if (!stats || !stats.products) return;

    // Get products that need syncing (old or never synced)
    const productsToSync = stats.products.filter(p => {
      if (!p.last_sync_date || p.status === 'never') return true;
      const daysSinceSync = (Date.now() - new Date(p.last_sync_date)) / (1000 * 60 * 60 * 24);
      return daysSinceSync > 7;
    });

    if (productsToSync.length === 0) {
      alert('All products in this category are up to date!');
      return;
    }

    // Confirm sync action
    const confirmed = window.confirm(
      `This will sync ${productsToSync.length} products in ${formatCategoryName(category)}. Continue?`
    );
    
    if (!confirmed) return;

    // Update stats to show syncing
    setCategoryStats(prev => ({
      ...prev,
      [category]: {
        ...prev[category],
        syncing: productsToSync.length
      }
    }));

    // Sync products
    let successCount = 0;
    let errorCount = 0;
    
    for (const product of productsToSync) {
      try {
        const response = await fetch('/api/sync/record', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            sku: product.sku,
            status: 'pending',
            details: { 
              category, 
              triggered_by: 'category_sync',
              name: product.product_name 
            }
          })
        });
        
        if (response.ok) {
          successCount++;
        } else {
          errorCount++;
          console.error(`Failed to sync ${product.sku}:`, response.status);
        }
      } catch (error) {
        errorCount++;
        console.error(`Error syncing ${product.sku}:`, error);
      }
    }

    // Show results
    if (errorCount === 0) {
      alert(`Successfully queued ${successCount} products for sync!`);
    } else {
      alert(`Sync initiated: ${successCount} successful, ${errorCount} failed. Check console for details.`);
    }

    // Reload data after sync
    setTimeout(() => {
      loadSyncData();
    }, 2000);

    setSelectedCategoryPopup(null);
  };

  const closePopup = () => {
    setSelectedCategoryPopup(null);
  };

  return (
    <div className="sort-container">
      <div className="sort-header">
        <h2 className="sort-title">Product Categories</h2>
        <p className="sort-subtitle">Browse products by category with real-time sync status</p>
      </div>

      {!salesforceAuth.authenticated && (
        <div className="auth-warning">
          <span className="warning-icon">⚠️</span>
          <p>Connect to Pimly (Salesforce) to browse categories and products</p>
        </div>
      )}

      <div className="sort-controls">
        <div className="main-controls">
          <div className="search-box">
            <input
              type="text"
              placeholder="Search categories..."
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              className="category-search"
            />
            <span className="search-icon">🔍</span>
          </div>

          <div className="sort-options">
            <label className="sort-label">Sort by:</label>
            <select
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value)}
              className="sort-select"
            >
              <option value="alphabetical">Alphabetical</option>
              <option value="popular">Most Products</option>
            </select>
          </div>
        </div>
      </div>

      <div className="category-stats">
        <span className="stats-text">
          Showing {sortedCategories.length} of {CATEGORIES.length} categories
        </span>
        {statsLoading && (
          <span className="loading-stats">
            🔄 Loading sync status...
          </span>
        )}
      </div>

      <CategoryGrid
        categories={sortedCategories}
        salesforceAuth={salesforceAuth}
        onCategoryClick={handleCategoryClick}
        formatCategoryName={formatCategoryName}
        getCategoryIcon={getCategoryIcon}
        categoryStats={categoryStats}
      />

      <CategoryPopup
        category={selectedCategoryPopup}
        isOpen={!!selectedCategoryPopup}
        onClose={closePopup}
        formatCategoryName={formatCategoryName}
        getCategoryIcon={getCategoryIcon}
        categoryStats={categoryStats[selectedCategoryPopup]}
        onViewProducts={handleViewProducts}
        onExportCategory={handleExportCategory}
        onSyncCategory={handleSyncCategory}
      />
    </div>
  );
}

export default Sort;