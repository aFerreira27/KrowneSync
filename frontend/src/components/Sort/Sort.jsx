import React, { useState } from 'react';
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
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [searchFilter, setSearchFilter] = useState('');
  const [sortOrder, setSortOrder] = useState('alphabetical'); // 'alphabetical' or 'popular'

  // Format category name for display
  const formatCategoryName = (category) => {
    let formatted = category.replace(/_/g, ' ').replace(/&/g, '&');
    
    // Shorten "Parts & Accessories" to "P&A" for display only
    formatted = formatted.replace(/Parts & Accessories/g, 'P&A');
    
    return formatted;
  };

  // Filter categories based on search
  const filteredCategories = CATEGORIES.filter(category =>
    formatCategoryName(category).toLowerCase().includes(searchFilter.toLowerCase())
  );

  // Sort categories based on selected order
  const sortedCategories = [...filteredCategories].sort((a, b) => {
    if (sortOrder === 'alphabetical') {
      // Keep 'Unsorted' at the top even in alphabetical order
      if (a === 'Unsorted') return -1;
      if (b === 'Unsorted') return 1;
      return formatCategoryName(a).localeCompare(formatCategoryName(b));
    }
    // For 'popular', keep original order (Unsorted will be first)
    return CATEGORIES.indexOf(a) - CATEGORIES.indexOf(b);
  });

  const handleCategoryClick = (category) => {
    setSelectedCategory(category);
    if (onSelectCategory) {
      onSelectCategory(category);
    }
  };

  const clearSelection = () => {
    setSelectedCategory(null);
    setSearchFilter('');
  };

  return (
    <div className="sort-container">
      <div className="sort-header">
        <h2 className="sort-title">Product Categories</h2>
        <p className="sort-subtitle">Browse products by category</p>
      </div>

      {!salesforceAuth.authenticated && (
        <div className="auth-warning">
          <span className="warning-icon">⚠️</span>
          <p>Connect to Pimly (Salesforce) to browse categories and products</p>
        </div>
      )}

      <div className="sort-controls">
        {/* Main controls row */}
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
              <option value="popular">Popular</option>
            </select>
          </div>
        </div>
      </div>

      <div className="category-stats">
        <span className="stats-text">
          Showing {sortedCategories.length} of {CATEGORIES.length} categories
        </span>
        <div className="stats-right">
          {selectedCategory && (
            <span onClick={clearSelection} className="selected-indicator">
              Selected: {formatCategoryName(selectedCategory)} ✕
            </span>
          )}
        </div>
      </div>

      <div className="categories-grid">
        {sortedCategories.length === 0 ? (
          <div className="no-results">
            <span className="no-results-icon">📦</span>
            <h3>No categories found</h3>
            <p>Try adjusting your search terms</p>
          </div>
        ) : (
          sortedCategories.map((category, index) => (
            <div
              key={category}
              className={`category-card ${selectedCategory === category ? 'selected' : ''} ${
                !salesforceAuth.authenticated ? 'disabled' : ''
              }`}
              onClick={() => salesforceAuth.authenticated && handleCategoryClick(category)}
              tabIndex={salesforceAuth.authenticated ? 0 : -1}
              onKeyDown={(e) => {
                if (salesforceAuth.authenticated && (e.key === 'Enter' || e.key === ' ')) {
                  e.preventDefault();
                  handleCategoryClick(category);
                }
              }}
            >
              <div className="category-icon">
                {getCategoryIcon(category)}
              </div>
              <div className="category-info">
                <h3 className="category-name">{formatCategoryName(category)}</h3>
              </div>
              <div className="category-arrow">→</div>
            </div>
          ))
        )}
      </div>

      {selectedCategory && (
        <div className="selected-category-actions">
          <h3>Actions for {formatCategoryName(selectedCategory)}</h3>
          <div className="action-buttons">
            <button className="action-btn primary">
              View Products
            </button>
            <button className="action-btn secondary">
              Export Category
            </button>
            <button className="action-btn secondary">
              Sync Category
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Comprehensive icon mapping for all foodservice equipment categories
function getCategoryIcon(category) {
  // Direct category matches (exact or contains match)
  const iconMap = {
    // Default/General
    'Unsorted': '📂',
    
    // Water & Plumbing Systems
    'Faucets': '🚰',
    'Electronic_Sensor_Faucets': '🚰',
    'Utility_Faucet_&_Pot_Filler': '🚰',
    'Krowne_Home_Faucets': '🚰',
    'Dispensing_Faucets': '🚰',
    'Remote_Spouts': '🚰',
    'Spouts': '💧',
    
    // Sinks & Basins
    'Sinks': '🛁',
    'Bar_Sinks': '🍸',
    'Dump_Sink_Stations': '🗑️',
    'Mop_Floor_Sinks': '🧽',
    
    // Drainage & Flow
    'Drains': '⭕',
    'Drainboards': '💧',
    'Pre-Rinse_Units': '🚿',
    'Drainers_&_Rinsers': '💦',
    
    // Sanitation
    'Soap_Dispensers': '🧼',
    'Plumbing_Parts_&_Accessories': '🔧',
    
    // Beverage Equipment
    'Beverage_Dispensing_Parts_&_Accessories': '🍺',
    'Beverage_Dispensing_Kits': '🧰',
    'Soda_Gun_Holders': '🔫',
    'Liquor_Display_Units': '🍾',
    'Specialized_Underbar_Stations': '🏗️',
    'Mixology_Kits': '🍸',
    'Robotic_Bartenders': '🤖',
    
    // Glass & Serving
    'Glass_Washer': '🧽',
    'Glass_Chiller': '🍸',
    'Mug_FrosterFreezers': '🍺',
    
    // Draft Systems
    'Towers': '🗼',
    'Trunk_Lines': '〰️',
    'Regulator_Panels': '🎛️',
    
    // Storage & Workspace
    'Storage_Cabinets': '🗄️',
    'Dry_Storage_Cabinets': '🗃️',
    'Ice_Bin': '🧊',
    'Workstations': '🖥️',
    'Pass_Thru_Units': '↔️',
    'Speed_Units': '⚡',
    
    // Mobility & Support
    'Casters': '🛞',
    'Hose_Reels': '🌊',
    'MoveWell': '🏗️',
    
    // Specialized Equipment
    'Perforated_Inserts': '🕳️',
    'Locking_Covers': '🔒',
    'Trash_Chute': '🗑️',
    
    // Cooling & Refrigeration
    'Refrigeration': '❄️',
    'Bottle_Coolers': '🍺',
    'Direct_Draw_Cooler': '🍻',
    
    // Water Treatment
    'HydroSift_Water_Filters': '💧',
    
    // Parts & Mechanical
    'Unit_Parts_&_Accessories': '⚙️',
    'Foodservice_Parts_&_Accessories': '🍽️',
    
    // Gas Systems (Safety Critical)
    'Gas_Connectors': '⛽',
    'Gas_System': '⛽',
    'Gas_Connector_Parts_&_Accessories': '⛽',
    
    // Control Systems
    'Air_Switches': '🔘',
    'Power_Packs': '🔋',
    
    // Specialized Categories
    'Alchemy': '⚗️',
    'Pet_Grooming': '🐕',
    'Vinyl_Wrap': '📦'
  };

  // Return the exact match if found
  if (iconMap[category]) {
    return iconMap[category];
  }

  // Fallback: Check if category contains any key words
  const fallbackMap = {
    'Water': '💧',
    'Filter': '💧',
    'Gas': '⛽',
    'Power': '⚡',
    'Storage': '🗄️',
    'Cooler': '❄️',
    'Chiller': '❄️',
    'Washer': '🧽',
    'Dispenser': '🚰',
    'Parts': '⚙️',
    'Accessories': '⚙️'
  };

  for (const [key, icon] of Object.entries(fallbackMap)) {
    if (category.includes(key)) {
      return icon;
    }
  }

  // Default icon for unmatched categories
  return '📦';
}

export default Sort;