// src/components/OAuthCallback.js
import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

const OAuthCallback = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [status, setStatus] = useState('Processing authentication...');
  const [error, setError] = useState(null);

  useEffect(() => {
    const handleCallback = async () => {
      try {
        // Get the current URL with all parameters
        const fullUrl = window.location.href;
        const urlParams = new URLSearchParams(location.search);
        
        console.log('OAuth callback received:', {
          url: fullUrl,
          params: Object.fromEntries(urlParams)
        });

        // Check for immediate errors from Salesforce
        const oauthError = urlParams.get('error');
        if (oauthError) {
          const errorDescription = urlParams.get('error_description') || 'Unknown OAuth error';
          throw new Error(`OAuth Error: ${oauthError} - ${errorDescription}`);
        }

        // Check for authorization code
        const code = urlParams.get('code');
        if (!code) {
          throw new Error('No authorization code received from Salesforce');
        }

        setStatus('Exchanging authorization code for tokens...');

        // Forward the callback to Flask backend with credentials for session handling
        const backendCallbackUrl = `/api/auth/callback/salesforce${location.search}`;
        
        const response = await fetch(backendCallbackUrl, {
          method: 'GET',
          credentials: 'include', // Important: Include cookies for Flask session
          headers: {
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          }
        });

        console.log('Backend callback response:', {
          status: response.status,
          redirected: response.redirected,
          url: response.url
        });

        if (response.redirected) {
          // Flask redirected us - parse the redirect URL
          const redirectUrl = new URL(response.url);
          const redirectParams = redirectUrl.searchParams;
          
          if (redirectParams.get('auth') === 'success') {
            setStatus('Authentication successful! Redirecting...');
            
            // Clean up the current URL
            window.history.replaceState({}, document.title, window.location.pathname);
            
            // Redirect to main app after a brief delay
            setTimeout(() => {
              navigate('/', { 
                state: { 
                  authSuccess: true, 
                  message: 'Successfully authenticated with Salesforce!' 
                }
              });
            }, 2000);
            
          } else if (redirectParams.get('error')) {
            const error = redirectParams.get('error');
            const message = redirectParams.get('message') || redirectParams.get('error_description');
            throw new Error(`Backend Error: ${error} - ${message}`);
          } else {
            throw new Error('Unknown redirect from backend');
          }
        } else if (response.ok) {
          // Non-redirect success response
          setStatus('Processing complete! Redirecting...');
          setTimeout(() => {
            navigate('/', { 
              state: { 
                authSuccess: true, 
                message: 'Authentication processed successfully!' 
              }
            });
          }, 2000);
        } else {
          // Error response
          const errorText = await response.text();
          throw new Error(`Backend error (${response.status}): ${errorText}`);
        }
        
      } catch (err) {
        console.error('OAuth callback error:', err);
        setError(err.message);
        setStatus('Authentication failed');
        
        // Redirect to home with error after delay
        setTimeout(() => {
          navigate('/', { 
            state: { 
              authError: true, 
              message: err.message 
            }
          });
        }, 5000);
      }
    };

    handleCallback();
  }, [location.search, navigate]);

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={styles.header}>
          <h2>Salesforce Authentication</h2>
        </div>
        
        <div style={styles.content}>
          {error ? (
            <>
              <div style={styles.errorIcon}>❌</div>
              <div style={styles.errorText}>{error}</div>
              <div style={styles.subText}>
                Redirecting to main page in 5 seconds...
              </div>
            </>
          ) : (
            <>
              <div style={styles.spinner}></div>
              <div style={styles.statusText}>{status}</div>
              <div style={styles.subText}>
                Please wait while we complete the authentication process...
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

const styles = {
  container: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: '100vh',
    backgroundColor: '#f5f5f5',
    fontFamily: 'Arial, sans-serif',
    padding: '20px'
  },
  card: {
    backgroundColor: 'white',
    borderRadius: '8px',
    boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
    padding: '40px',
    maxWidth: '500px',
    textAlign: 'center'
  },
  header: {
    marginBottom: '30px'
  },
  content: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '20px'
  },
  spinner: {
    width: '40px',
    height: '40px',
    border: '4px solid #f3f3f3',
    borderTop: '4px solid #007bff',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite'
  },
  statusText: {
    fontSize: '18px',
    fontWeight: '500',
    color: '#333'
  },
  subText: {
    fontSize: '14px',
    color: '#666',
    lineHeight: '1.5'
  },
  errorIcon: {
    fontSize: '48px',
    marginBottom: '10px'
  },
  errorText: {
    fontSize: '16px',
    color: '#dc3545',
    fontWeight: '500',
    marginBottom: '10px'
  }
};

// Add CSS animation
const styleSheet = document.createElement('style');
styleSheet.textContent = `
  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
`;
document.head.appendChild(styleSheet);

export default OAuthCallback;