import React, { useRef } from 'react';
import './CategoryCard.css';

const CategoryCard = ({ 
  category, 
  isSelected, 
  isDisabled, 
  formatCategoryName, 
  getCategoryIcon, 
  onClick, 
  onOptionsClick 
}) => {
  const cardRef = useRef(null);

  const handleClick = (e) => {
    // Prevent triggering onClick when clicking the options button
    if (e.target.closest('.category-options-btn')) {
      return;
    }
    if (!isDisabled && onClick) {
      onClick(category);
    }
  };

  const handleOptionsClick = (e) => {
    e.stopPropagation(); // Prevent card click
    if (!isDisabled && onOptionsClick) {
      const rect = cardRef.current.getBoundingClientRect();
      const position = {
        top: rect.top + rect.height / 2,
        left: rect.right - 50
      };
      onOptionsClick(category, position);
    }
  };

  const handleKeyDown = (e) => {
    if (!isDisabled && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      handleClick(e);
    }
  };

  return (
    <div
      ref={cardRef}
      className={`category-card ${isSelected ? 'selected' : ''} ${isDisabled ? 'disabled' : ''}`}
      onClick={handleClick}
      tabIndex={isDisabled ? -1 : 0}
      onKeyDown={handleKeyDown}
    >
      <div className="category-icon">
        {getCategoryIcon(category)}
      </div>
      <div className="category-info">
        <h3 className="category-name">{formatCategoryName(category)}</h3>
      </div>
      
      {!isDisabled && (
        <button
          className="category-options-btn"
          onClick={handleOptionsClick}
          aria-label={`Options for ${formatCategoryName(category)}`}
          title="Category options"
        >
          <span className="options-dots">⋯</span>
        </button>
      )}
      
      <div className="category-arrow">→</div>
    </div>
  );
};

export default CategoryCard;