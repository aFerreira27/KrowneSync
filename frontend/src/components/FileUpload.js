import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';

const FileUpload = ({ onFileUpload, loading }) => {
  const [dragActive, setDragActive] = useState(false);

  const onDrop = useCallback((acceptedFiles) => {
    if (acceptedFiles.length > 0) {
      onFileUpload(acceptedFiles[0]);
    }
  }, [onFileUpload]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'text/csv': ['.csv']
    },
    multiple: false,
    disabled: loading
  });

  return (
    <div className="file-upload">
      <h2>CSV File Upload</h2>
      <p>Upload your product data CSV file to compare with Krowne.com</p>

      <div 
        {...getRootProps()} 
        className={`dropzone ${isDragActive ? 'active' : ''} ${loading ? 'disabled' : ''}`}
      >
        <input {...getInputProps()} />
        <div className="dropzone-content">
          <div className="upload-icon">📁</div>
          {isDragActive ? (
            <p>Drop the CSV file here...</p>
          ) : (
            <div>
              <p><strong>Click to select</strong> or drag and drop your CSV file</p>
              <p className="file-requirements">
                Supported format: CSV files only<br/>
                Required columns: product_id, name, price, description
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="csv-requirements">
        <h3>CSV Format Requirements</h3>
        <div className="requirements-list">
          <div className="requirement-item">
            <strong>Required Columns:</strong>
            <ul>
              <li>product_id - Unique identifier for each product</li>
              <li>name - Product name</li>
              <li>price - Product price (numeric)</li>
              <li>description - Product description</li>
            </ul>
          </div>
          <div className="requirement-item">
            <strong>Optional Columns:</strong>
            <ul>
              <li>category - Product category</li>
              <li>sku - Stock keeping unit</li>
              <li>brand - Product brand</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};
