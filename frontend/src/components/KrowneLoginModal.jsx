import React, { useState } from 'react';
import api from '../services/api.js'; // Use your existing API service

const KrowneLoginModal = ({ isOpen, onClose, onSuccess, loading, error }) => {
  const [credentials, setCredentials] = useState({
    username: '',
    password: ''
  });
  
  const [isLoading, setIsLoading] = useState(false);
  const [loginError, setLoginError] = useState(null);

  const handleSubmit = async (e) => {
  e.preventDefault();
  if (isLoading) return; // Prevent multiple submissions
  
  setIsLoading(true);
  setLoginError(null);

  try {
    // Use the existing API service method
    const result = await api.krowneLogin(credentials.username, credentials.password);
    
    // Check if login was actually successful
    if (result.success) {
      console.log('✅ Krowne login successful:', result);
      
      // Call success callback
      if (onSuccess) {
        await onSuccess(result);
      }
      
      // Close modal and reset form
      onClose();
      setCredentials({ username: '', password: '' });
    } else {
      // Handle failed login
      console.error('❌ Krowne login failed:', result.error);
      setLoginError(result.error || 'Login failed. Please check your credentials.');
    }
    
  } catch (error) {
    // Handle network/API errors
    console.error('❌ Krowne login error:', error);
    setLoginError(error.message || 'Login failed. Please check your credentials.');
  } finally {
    setIsLoading(false);
  }
};

  const handleChange = (e) => {
    setCredentials({
      ...credentials,
      [e.target.name]: e.target.value
    });
  };

  const handleClose = () => {
    setCredentials({ username: '', password: '' });
    setLoginError(null);
    onClose();
  };

  if (!isOpen) return null;

  const displayError = loginError || error;
  const displayLoading = isLoading || loading;

  return (
    <div id="krowne-login-modal" className="modal-overlay">
      <div className="modal-content">
        <div className="modal-header">
          <h2>Sign in to Krowne CMS</h2>
          <button className="modal-close" onClick={handleClose}>×</button>
        </div>
        
        <form onSubmit={handleSubmit} className="login-form">
          {displayError && (
            <div className="error-message">
              {displayError}
            </div>
          )}
          
          <div className="form-group">
            <label htmlFor="username">Username or Email</label>
            <input
              type="text"
              id="username"
              name="username"
              value={credentials.username}
              onChange={handleChange}
              required
              disabled={displayLoading}
              autoComplete="username"
              placeholder="Enter your username or email"
            />
          </div>
          
          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              type="password"
              id="password"
              name="password"
              value={credentials.password}
              onChange={handleChange}
              required
              disabled={displayLoading}
              autoComplete="current-password"
              placeholder="Enter your password"
            />
          </div>
          
          <div className="form-actions">
            <button 
              type="button" 
              className="btn-secondary" 
              onClick={handleClose}
              disabled={displayLoading}
            >
              Cancel
            </button>
            <button 
              type="submit" 
              className="btn-primary" 
              disabled={displayLoading || !credentials.username || !credentials.password}
            >
              {displayLoading ? 'Signing in...' : 'Sign In'}
            </button>
          </div>
        </form>
        
        <div className="login-help">
          <p>
            <small>
              Sign in with your Krowne CMS administrator credentials to access 
              product management features and enhanced data comparison.
            </small>
          </p>
        </div>
      </div>
    </div>
  );
};

export default KrowneLoginModal;