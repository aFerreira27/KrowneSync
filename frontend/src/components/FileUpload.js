import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { AlertCircle, Upload, FileText, CheckCircle } from 'lucide-react';

const FileUpload = ({ onFileUpload, loading }) => {
  const [uploadedFile, setUploadedFile] = useState(null);
  const [error, setError] = useState(null);

  const validateFile = (file) => {
    setError(null);
    
    // Check file size (50MB limit)
    const maxSize = 50 * 1024 * 1024;
    if (file.size > maxSize) {
      setError(`File too large. Maximum size is ${maxSize / 1024 / 1024}MB`);
      return false;
    }
    
    return true;
  };

  const onDrop = useCallback((acceptedFiles, rejectedFiles) => {
    if (rejectedFiles.length > 0) {
      setError('Please upload a CSV file only');
      return;
    }

    if (acceptedFiles.length > 0) {
      const file = acceptedFiles[0];
      if (validateFile(file)) {
        setUploadedFile(file);
        onFileUpload(file);
      }
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
    <div className="max-w-4xl mx-auto p-6">
      <div className="bg-white rounded-lg shadow-lg p-8">
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-gray-800 mb-2">CSV File Upload</h2>
          <p className="text-gray-600">Upload your Krowne product data CSV file to compare with Krowne.com</p>
        </div>

        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start">
            <AlertCircle className="w-5 h-5 text-red-500 mr-2 flex-shrink-0 mt-0.5" />
            <span className="text-red-700">{error}</span>
          </div>
        )}

        <div 
          {...getRootProps()} 
          className={`
            border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-all
            ${isDragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400'}
            ${loading ? 'opacity-50 cursor-not-allowed' : ''}
            ${uploadedFile && !loading ? 'border-green-500 bg-green-50' : ''}
          `}
        >
          <input {...getInputProps()} />
          <div className="flex flex-col items-center">
            {uploadedFile && !loading ? (
              <>
                <CheckCircle className="w-12 h-12 text-green-500 mb-3" />
                <p className="text-lg font-medium text-gray-700">File uploaded successfully!</p>
                <p className="text-sm text-gray-500 mt-1">{uploadedFile.name}</p>
              </>
            ) : (
              <>
                <Upload className="w-12 h-12 text-gray-400 mb-3" />
                {isDragActive ? (
                  <p className="text-lg font-medium text-blue-600">Drop the CSV file here...</p>
                ) : (
                  <div>
                    <p className="text-lg font-medium text-gray-700 mb-2">
                      Click to select or drag and drop your CSV file
                    </p>
                    <p className="text-sm text-gray-500">
                      Supported format: CSV files only (max 50MB)
                    </p>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        <div className="mt-8 bg-gray-50 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center">
            <FileText className="w-5 h-5 mr-2" />
            CSV Format Requirements
          </h3>
          
          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <h4 className="font-medium text-gray-700 mb-2">Required Columns:</h4>
              <ul className="space-y-2 text-sm">
                <li className="flex items-start">
                  <span className="text-blue-500 mr-2">•</span>
                  <div>
                    <strong>SKU</strong> - Unique product identifier/Stock Keeping Unit
                  </div>
                </li>
                <li className="flex items-start">
                  <span className="text-blue-500 mr-2">•</span>
                  <div>
                    <strong>Family</strong> - Product family/category
                  </div>
                </li>
                <li className="flex items-start">
                  <span className="text-blue-500 mr-2">•</span>
                  <div>
                    <strong>Product_Description</strong> - Full product description
                  </div>
                </li>
                <li className="flex items-start">
                  <span className="text-blue-500 mr-2">•</span>
                  <div>
                    <strong>List_Price</strong> - Product price (numeric, no currency symbols)
                  </div>
                </li>
              </ul>
            </div>
            
            <div>
              <h4 className="font-medium text-gray-700 mb-2">Important Notes:</h4>
              <ul className="space-y-2 text-sm text-gray-600">
                <li className="flex items-start">
                  <span className="text-green-500 mr-2">✓</span>
                  Column names must match exactly (case-sensitive)
                </li>
                <li className="flex items-start">
                  <span className="text-green-500 mr-2">✓</span>
                  First row should contain column headers
                </li>
                <li className="flex items-start">
                  <span className="text-green-500 mr-2">✓</span>
                  UTF-8 encoding recommended
                </li>
                <li className="flex items-start">
                  <span className="text-green-500 mr-2">✓</span>
                  Remove any empty rows
                </li>
              </ul>
            </div>
          </div>

          <div className="mt-4 p-3 bg-blue-50 rounded-md">
            <p className="text-sm text-blue-800">
              <strong>Example CSV format:</strong>
            </p>
            <pre className="mt-2 text-xs bg-white p-2 rounded border border-blue-200 overflow-x-auto">
{`SKU,Family,Product_Description,List_Price
KR-123,Metal Series,18" Underbar Ice Bin with 7-Circuit Cold Plate,1299.99
KR-456,Royal Series,24" Glass Filler Station with Rinser,899.50
KR-789,Standard Series,36" Three Compartment Sink,1599.00`}
            </pre>
          </div>
        </div>

        {loading && (
          <div className="mt-4 text-center">
            <div className="inline-flex items-center text-blue-600">
              <svg className="animate-spin h-5 w-5 mr-2" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              Processing your CSV file...
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default FileUpload;