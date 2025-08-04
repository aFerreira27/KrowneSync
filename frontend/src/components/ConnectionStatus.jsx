import React from 'react';

const ConnectionStatus = ({ salesforceAuth, onConnect, onDisconnect }) => {
  return (
    <div className="connection-status-bar">
      <div className="connection-item">
        <div className="connection-label">
          <span className="service-icon">☁️</span>
          <span>Pimly (Salesforce)</span>
        </div>
        {salesforceAuth.authenticated ? (
          <div className="connection-info connected">
            <span className="status-dot active"></span>
            <span className="user-info">
              {salesforceAuth.userInfo?.display_name || salesforceAuth.userInfo?.name || salesforceAuth.userInfo?.email}
            </span>
            <button className="disconnect-btn" onClick={onDisconnect}>
              Disconnect
            </button>
          </div>
        ) : (
          <div className="connection-info disconnected">
            <span className="status-dot inactive"></span>
            <button className="connect-btn" onClick={onConnect}>
              Connect
            </button>
          </div>
        )}
      </div>

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