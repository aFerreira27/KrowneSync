import React, { useState } from 'react';
import './Sort.css';

const CATEGORIES = [
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
    return category.replace(/_/g, ' ').replace(/&/g, '&');
  };

  // Filter categories based on search
  const filteredCategories = CATEGORIES.filter(category =>
    formatCategoryName(category).toLowerCase().includes(searchFilter.toLowerCase())
  );

  // Sort categories based on selected order
  const sortedCategories = [...filteredCategories].sort((a, b) => {
    if (sortOrder === 'alphabetical') {
      return formatCategoryName(a).localeCompare(formatCategoryName(b));
    }
    // For 'popular', you could implement logic based on usage data
    // For now, keeping original order as "popular"
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

        {(selectedCategory || searchFilter) && (
          <button onClick={clearSelection} className="clear-btn">
            Clear Filters
          </button>
        )}
      </div>

      <div className="category-stats">
        <span className="stats-text">
          Showing {sortedCategories.length} of {CATEGORIES.length} categories
        </span>
        {selectedCategory && (
          <span className="selected-indicator">
            Selected: {formatCategoryName(selectedCategory)}
          </span>
        )}
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
                <p className="category-description">
                  {getCategoryDescription(category)}
                </p>
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

// Helper function to get category icon
function getCategoryIcon(category) {
  const iconMap = {
    'Faucets': '🚰',
    'Sinks': '🪣',
    'Refrigeration': '❄️',
    'Gas_System': '🔥',
    'Storage_Cabinets': '🗄️',
    'Workstations': '🔧',
    'Bar_Sinks': '🍺',
    'Ice_Bin': '🧊',
    'Glass_Washer': '🫧',
    'Pet_Grooming': '🐕',
    'Soap_Dispensers': '🧼',
    'Bottle_Coolers': '🍾',
    'Drains': '⬇️',
    'Casters': '🎯',
    'Gas_Connectors': '🔗',
    'Power_Packs': '⚡',
    'Water_Filters': '💧',
    'Robotic_Bartenders': '🤖'
  };

  // Try to find a match in the icon map
  for (const [key, icon] of Object.entries(iconMap)) {
    if (category.includes(key)) {
      return icon;
    }
  }

  // Default icon
  return '📦';
}

// Helper function to get category description
function getCategoryDescription(category) {
  const descriptions = {
    'Faucets': 'Commercial and residential faucet solutions',
    'Sinks': 'Stainless steel sinks for various applications',
    'Refrigeration': 'Cooling systems and refrigerated units',
    'Gas_System': 'Gas connections and safety equipment',
    'Storage_Cabinets': 'Organized storage solutions',
    'Workstations': 'Efficient workspace configurations',
    'Bar_Sinks': 'Specialized sinks for bar areas',
    'Ice_Bin': 'Ice storage and handling equipment',
    'Glass_Washer': 'Glass cleaning and sanitizing equipment',
    'Pet_Grooming': 'Professional pet care equipment',
    'Soap_Dispensers': 'Hygiene and sanitation dispensers',
    'Bottle_Coolers': 'Beverage cooling and storage',
    'Drains': 'Drainage systems and components',
    'Gas_Connectors': 'Safe gas line connections',
    'Power_Packs': 'Electrical power and control systems',
    'Robotic_Bartenders': 'Automated beverage dispensing'
  };

  // Try to find a match in descriptions
  for (const [key, description] of Object.entries(descriptions)) {
    if (category.includes(key)) {
      return description;
    }
  }

  // Generate a generic description
  const formattedName = category.replace(/_/g, ' ').replace(/&/g, '&');
  return `${formattedName} products and accessories`;
}

export default Sort;