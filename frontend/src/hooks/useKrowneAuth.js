// hooks/useKrowneAuth.js
import { useState, useEffect, useCallback } from 'react';
import krowneAuthService from '../services/krowneAuthService';

export const useKrowneAuth = () => {
  const [krowneAuth, setKrowneAuth] = useState({
    authenticated: false,
    loading: false,
    userInfo: null,
    error: null
  });

  // Check authentication status on mount
  useEffect(() => {
    checkAuthStatus();
  }, []);

  const checkAuthStatus = async () => {
    try {
      setKrowneAuth(prev => ({ ...prev, loading: true, error: null }));
      
      const status = await krowneAuthService.checkAuthStatus();
      
      if (status.authenticated) {
        setKrowneAuth({
          authenticated: true,
          loading: false,
          userInfo: status.userInfo,
          error: null
        });
      } else {
        setKrowneAuth({
          authenticated: false,
          loading: false,
          userInfo: null,
          error: null
        });
      }
    } catch (error) {
      console.error('Error checking Krowne auth status:', error);
      setKrowneAuth({
        authenticated: false,
        loading: false,
        userInfo: null,
        error: error.message
      });
    }
  };

  const login = useCallback(async (credentials) => {
    try {
      setKrowneAuth(prev => ({ ...prev, loading: true, error: null }));
      
      const result = await krowneAuthService.login(credentials);
      
      if (result.success) {
        setKrowneAuth({
          authenticated: true,
          loading: false,
          userInfo: result.userInfo,
          error: null
        });
        return { success: true };
      } else {
        setKrowneAuth(prev => ({
          ...prev,
          loading: false,
          error: result.error
        }));
        return { success: false, error: result.error };
      }
    } catch (error) {
      console.error('Krowne login error:', error);
      const errorMessage = error.message || 'Login failed';
      setKrowneAuth(prev => ({
        ...prev,
        loading: false,
        error: errorMessage
      }));
      return { success: false, error: errorMessage };
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      setKrowneAuth(prev => ({ ...prev, loading: true }));
      
      await krowneAuthService.logout();
      
      setKrowneAuth({
        authenticated: false,
        loading: false,
        userInfo: null,
        error: null
      });
    } catch (error) {
      console.error('Krowne logout error:', error);
      // Still clear the auth state even if logout fails
      setKrowneAuth({
        authenticated: false,
        loading: false,
        userInfo: null,
        error: null
      });
    }
  }, []);

  const showLoginModal = useCallback(() => {
    // This could trigger a modal or redirect to login page
    const modal = document.getElementById('krowne-login-modal');
    if (modal) {
      modal.style.display = 'block';
    }
  }, []);

  return {
    krowneAuth,
    login,
    logout,
    checkAuthStatus,
    showLoginModal
  };
};