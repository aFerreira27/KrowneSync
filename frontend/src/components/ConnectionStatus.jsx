import React from 'react';

const ConnectionStatus = ({ 
  salesforceAuth, 
  krowneAuth,
  onSalesforceConnect, 
  onSalesforceDisconnect,
  onKrowneConnect,
  onKrowneDisconnect 
}) => {
  return (
    <div className="connection-status-bar">
      {/* Salesforce/Pimly Connection */}
      <div className="connection-item">
        <div className="connection-label">
          <span className="service-icon">☁️</span>
          <span>Pimly (Salesforce)</span>
        </div>
        {salesforceAuth.authenticated ? (
          <div className="connection-info connected">
            <span className="status-dot active"></span>
            <span className="user-info">
              {salesforceAuth.userInfo?.display_name || 
               salesforceAuth.userInfo?.name || 
               salesforceAuth.userInfo?.email}
            </span>
            <button className="disconnect-btn" onClick={onSalesforceDisconnect}>
              Disconnect
            </button>
          </div>
        ) : (
          <div className="connection-info disconnected">
            <span className="status-dot inactive"></span>
            <span className="status-text">Not connected</span>
            <button className="connect-btn" onClick={onSalesforceConnect}>
              Connect
            </button>
          </div>
        )}
      </div>

      {/* Krowne CMS Admin Connection */}
      <div className="connection-item">
        <div className="connection-label">
          <span className="service-icon">🔐</span>
          <span>Krowne CMS Admin</span>
        </div>
        {krowneAuth.authenticated ? (
          <div className="connection-info connected">
            <span className="status-dot active"></span>
            <span className="user-info">
              {krowneAuth.userInfo?.username || 
               krowneAuth.userInfo?.email || 
               'Admin User'}
            </span>
            <button className="disconnect-btn" onClick={onKrowneDisconnect}>
              Disconnect
            </button>
          </div>
        ) : krowneAuth.loading ? (
          <div className="connection-info connecting">
            <span className="status-dot loading"></span>
            <span className="status-text">Connecting...</span>
          </div>
        ) : (
          <div className="connection-info disconnected">
            <span className="status-dot inactive"></span>
            <span className="status-text">Not connected</span>
            <button className="connect-btn" onClick={onKrowneConnect}>
              Sign In
            </button>
          </div>
        )}
      </div>

      {/* Krowne Website Scraper Status */}
      <div className="connection-item">
        <div className="connection-label">
          <span className="service-icon">🌐</span>
          <span>Krowne Website</span>
        </div>
        <div className="connection-info connected">
          <span className="status-dot active"></span>
          <span className="user-info">Ready (Server-side scraping)</span>
        </div>
      </div>
    </div>
  );
};

export default ConnectionStatus;