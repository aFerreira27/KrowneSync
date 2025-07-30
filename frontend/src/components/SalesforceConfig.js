import React, { useState } from 'react';

const SalesforceConfig = ({ onConfigSave, loading }) => {
  const [config, setConfig] = useState({
    client_id: '',
    client_secret: '',
    username: '',
    password: '',
    security_token: ''
  });
  const [showPassword, setShowPassword] = useState(false);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setConfig(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onConfigSave(config);
  };

  const isFormValid = () => {
    return Object.values(config).every(value => value.trim() !== '');
  };

  return (
    <div className="salesforce-config">
      <h2>Salesforce Configuration</h2>
      <p>Connect to your Salesforce org to sync product data</p>

      <form onSubmit={handleSubmit} className="config-form">
        <div className="form-group">
          <label htmlFor="client_id">Client ID *</label>
          <input
            type="text"
            id="client_id"
            name="client_id"
            value={config.client_id}
            onChange={handleInputChange}
            placeholder="Your Salesforce Connected App Client ID"
            required
          />
        </div>

        <div className="form-group">
          <label htmlFor="client_secret">Client Secret *</label>
          <input
            type={showPassword ? "text" : "password"}
            id="client_secret"
            name="client_secret"
            value={config.client_secret}
            onChange={handleInputChange}
            placeholder="Your Salesforce Connected App Client Secret"
            required
          />
        </div>

        <div className="form-group">
          <label htmlFor="username">Username *</label>
          <input
            type="email"
            id="username"
            name="username"
            value={config.username}
            onChange={handleInputChange}
            placeholder="your.email@company.com"
            required
          />
        </div>

        <div className="form-group">
          <label htmlFor="password">Password *</label>
          <input
            type={showPassword ? "text" : "password"}
            id="password"
            name="password"
            value={config.password}
            onChange={handleInputChange}
            placeholder="Your Salesforce password"
            required
          />
        </div>

        <div className="form-group">
          <label htmlFor="security_token">Security Token *</label>
          <input
            type={showPassword ? "text" : "password"}
            id="security_token"
            name="security_token"
            value={config.security_token}
            onChange={handleInputChange}
            placeholder="Your Salesforce security token"
            required
          />
        </div>

        <div className="form-group">
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={showPassword}
              onChange={(e) => setShowPassword(e.target.checked)}
            />
            Show passwords
          </label>
        </div>

        <div className="form-actions">
          <button 
            type="submit" 
            className="btn btn-primary"
            disabled={!isFormValid() || loading}
          >
            {loading ? 'Testing Connection...' : 'Test & Save Configuration'}
          </button>
        </div>
      </form>

      <div className="setup-instructions">
        <h3>Setup Instructions</h3>
        <div className="instructions-list">
          <div className="instruction-step">
            <strong>1. Create a Connected App in Salesforce:</strong>
            <p>Go to Setup → App Manager → New Connected App</p>
          </div>
          <div className="instruction-step">
            <strong>2. Enable OAuth Settings:</strong>
            <p>Check "Enable OAuth Settings" and add required scopes</p>
          </div>
          <div className="instruction-step">
            <strong>3. Get your Security Token:</strong>
            <p>Go to Settings → Reset My Security Token</p>
          </div>
        </div>
      </div>
    </div>
  );
};