// CSV-specific API service
// csvApi.js

const csvApi = {
  // Enhanced CSV upload with validation options and progress tracking
  uploadCSV: async (file, options = {}) => {
    const formData = new FormData();
    formData.append('file', file);
    
    // Add processing options
    if (options.validationLevel) {
      formData.append('validation_level', options.validationLevel);
    }
    if (options.includeStats !== undefined) {
      formData.append('include_stats', options.includeStats.toString());
    }
    
    const response = await fetch('/api/upload-csv', {
      method: 'POST',
      body: formData,
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Upload failed');
    }
    
    return response.json();
  },

  // Get upload progress for real-time updates
  getUploadProgress: async (filename) => {
    const response = await fetch(`/api/upload-progress/${filename}`);
    
    if (!response.ok) {
      if (response.status === 404) {
        return null; // No progress data found
      }
      const error = await response.json();
      throw new Error(error.error || 'Failed to get progress');
    }
    
    return response.json();
  },

  // Validate CSV structure before full processing
  validateCSVStructure: async (file) => {
    const formData = new FormData();
    formData.append('file', file);
    
    const response = await fetch('/api/validate-csv', {
      method: 'POST',
      body: formData,
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Validation failed');
    }
    
    return response.json();
  },

  // Get CSV processing configuration options
  getCSVConfigOptions: async () => {
    const response = await fetch('/api/csv-config');
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to get config options');
    }
    
    return response.json();
  },

  // Get detailed CSV statistics
  getCSVStatistics: async (filename) => {
    const response = await fetch(`/api/csv-stats/${filename}`);
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to get statistics');
    }
    
    return response.json();
  },

  // Export results to CSV
  exportResults: async (results) => {
    const response = await fetch('/api/export-results', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ results }),
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Export failed');
    }
    
    return response.json();
  },

  // Enhanced comparison with progress tracking
  compareProducts: async (data) => {
    const response = await fetch('/api/compare', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Comparison failed');
    }
    
    return response.json();
  },

  // Get comparison progress
  getCompareProgress: async (identifier) => {
    const response = await fetch(`/api/compare-progress/${identifier}`);
    
    if (!response.ok) {
      if (response.status === 404) {
        return null; // No progress data found
      }
      const error = await response.json();
      throw new Error(error.error || 'Failed to get progress');
    }
    
    return response.json();
  },

  // Utility Methods
  
  // Poll for progress updates
  pollProgress: async (type, identifier, callback, interval = 1000) => {
    const poll = async () => {
      try {
        let progressData;
        
        if (type === 'upload') {
          progressData = await csvApi.getUploadProgress(identifier);
        } else if (type === 'compare') {
          progressData = await csvApi.getCompareProgress(identifier);
        }
        
        if (progressData) {
          callback(progressData);
          
          // Continue polling if not completed
          if (!progressData.completed && progressData.current < 100) {
            setTimeout(poll, interval);
          }
        }
      } catch (error) {
        // Stop polling on error
        callback({ error: error.message });
      }
    };
    
    poll();
  },

  // Upload with progress tracking
  uploadCSVWithProgress: async (file, options = {}, progressCallback) => {
    try {
      // Start upload
      const result = await csvApi.uploadCSV(file, options);
      
      // Start progress polling if callback provided
      if (progressCallback && result.filename) {
        csvApi.pollProgress('upload', result.filename, progressCallback);
      }
      
      return result;
    } catch (error) {
      if (progressCallback) {
        progressCallback({ error: error.message });
      }
      throw error;
    }
  },

  // Compare with progress tracking
  compareWithProgress: async (data, progressCallback) => {
    try {
      // Determine identifier for progress tracking
      const identifier = data.source_type === 'csv' ? data.filename : 'sf';
      
      // Start progress polling if callback provided
      if (progressCallback) {
        csvApi.pollProgress('compare', identifier, progressCallback);
      }
      
      // Start comparison
      const result = await csvApi.compareProducts(data);
      
      return result;
    } catch (error) {
      if (progressCallback) {
        progressCallback({ error: error.message });
      }
      throw error;
    }
  },

  // Validate and upload CSV with comprehensive feedback
  validateAndUpload: async (file, options = {}) => {
    try {
      // First validate structure
      const validationResult = await csvApi.validateCSVStructure(file);
      
      if (!validationResult.valid) {
        return {
          success: false,
          stage: 'validation',
          error: validationResult.error,
          suggestions: validationResult.suggestions
        };
      }
      
      // If validation passes, proceed with upload
      const uploadResult = await csvApi.uploadCSV(file, options);
      
      return {
        success: true,
        stage: 'upload',
        validation: validationResult,
        upload: uploadResult
      };
      
    } catch (error) {
      return {
        success: false,
        stage: 'upload',
        error: error.message
      };
    }
  },

  // Get comprehensive file analysis
  getFileAnalysis: async (filename) => {
    try {
      const [stats, config] = await Promise.all([
        csvApi.getCSVStatistics(filename),
        csvApi.getCSVConfigOptions()
      ]);
      
      return {
        statistics: stats,
        configuration: config,
        filename: filename
      };
      
    } catch (error) {
      throw new Error(`Failed to get file analysis: ${error.message}`);
    }
  },

  // Batch operations for multiple files
  uploadMultipleCSVs: async (files, options = {}, progressCallback) => {
    const results = [];
    const total = files.length;
    
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      
      try {
        if (progressCallback) {
          progressCallback({
            current: i,
            total: total,
            currentFile: file.name,
            message: `Processing ${file.name}...`
          });
        }
        
        const result = await csvApi.uploadCSV(file, options);
        results.push({
          filename: file.name,
          success: true,
          result: result
        });
        
      } catch (error) {
        results.push({
          filename: file.name,
          success: false,
          error: error.message
        });
      }
    }
    
    if (progressCallback) {
      progressCallback({
        current: total,
        total: total,
        message: 'All files processed',
        completed: true
      });
    }
    
    return {
      total: total,
      successful: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      results: results
    };
  },

  // Enhanced error handling wrapper
  withErrorHandling: (apiMethod) => {
    return async (...args) => {
      try {
        return await apiMethod(...args);
      } catch (error) {
        // Enhanced error information
        const enhancedError = {
          message: error.message,
          timestamp: new Date().toISOString(),
          method: apiMethod.name,
          args: args.length,
          type: 'CSV_API_ERROR'
        };
        
        // Log to console for debugging
        console.error('CSV API Error:', enhancedError);
        
        // Re-throw with enhanced info
        const newError = new Error(error.message);
        newError.details = enhancedError;
        throw newError;
      }
    };
  }
};

// Export with error handling wrappers for critical methods
const csvApiWithErrorHandling = {
  ...csvApi,
  
  // Wrap critical methods with enhanced error handling
  uploadCSV: csvApi.withErrorHandling(csvApi.uploadCSV),
  compareProducts: csvApi.withErrorHandling(csvApi.compareProducts),
  validateCSVStructure: csvApi.withErrorHandling(csvApi.validateCSVStructure),
  uploadCSVWithProgress: csvApi.withErrorHandling(csvApi.uploadCSVWithProgress),
  compareWithProgress: csvApi.withErrorHandling(csvApi.compareWithProgress)
};

export default csvApiWithErrorHandling;