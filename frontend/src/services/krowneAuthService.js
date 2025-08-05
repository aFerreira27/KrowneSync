// services/krowneAuthService.js
const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || 'http://localhost:5000/api';

class KrowneAuthService {
  constructor() {
    this.baseURL = API_BASE_URL;
  }

  async makeRequest(endpoint, options = {}) {
    const url = `${this.baseURL}${endpoint}`;
    const config = {
      credentials: 'include', // Include cookies for session management
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      ...options,
    };

    try {
      const response = await fetch(url, config);
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || `HTTP error! status: ${response.status}`);
      }
      
      return data;
    } catch (error) {
      console.error(`API request failed for ${endpoint}:`, error);
      throw error;
    }
  }

  async login(credentials) {
    try {
      const response = await this.makeRequest('/auth/krowne/login', {
        method: 'POST',
        body: JSON.stringify(credentials),
      });

      if (response.success) {
        // Store auth info in localStorage as backup
        localStorage.setItem('krowne_auth', JSON.stringify({
          authenticated: true,
          userInfo: response.userInfo,
          timestamp: Date.now()
        }));
      }

      return response;
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  async logout() {
    try {
      await this.makeRequest('/auth/krowne/logout', {
        method: 'POST',
      });
    } catch (error) {
      console.error('Logout request failed:', error);
      // Continue with cleanup even if server request fails
    } finally {
      // Always clear local storage
      localStorage.removeItem('krowne_auth');
    }
  }

  async checkAuthStatus() {
    try {
      const response = await this.makeRequest('/auth/krowne/status');
      return response;
    } catch (error) {
      // If server check fails, try localStorage as fallback
      const localAuth = localStorage.getItem('krowne_auth');
      if (localAuth) {
        try {
          const authData = JSON.parse(localAuth);
          // Check if auth is not too old (24 hours)
          const isExpired = Date.now() - authData.timestamp > 24 * 60 * 60 * 1000;
          
          if (!isExpired && authData.authenticated) {
            return {
              authenticated: true,
              userInfo: authData.userInfo
            };
          }
        } catch (parseError) {
          console.error('Error parsing local auth data:', parseError);
        }
      }
      
      return {
        authenticated: false,
        userInfo: null
      };
    }
  }

  async getProfile() {
    return this.makeRequest('/auth/krowne/profile');
  }
}

const krowneAuthService = new KrowneAuthService();
export default krowneAuthService;