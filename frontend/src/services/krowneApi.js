// src/services/krowneApi.js
const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

async function request(endpoint, options = {}) {
  const url = `${API_BASE_URL}${endpoint}`;
  
  const defaultOptions = {
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
  };

  const response = await fetch(url, { ...defaultOptions, ...options });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(error.error || error.message || 'Request failed');
  }

  return response.json();
}

export async function checkAuthStatus() {
  return request('/krowne/status');
}

export async function loginToKrowne(credentials) {
  return request('/krowne/login', {
    method: 'POST',
    body: JSON.stringify(credentials),
  });
}

export async function logoutFromKrowne() {
  return request('/krowne/logout', {
    method: 'POST',
  });
}

export async function getKrowneUserInfo() {
  return request('/krowne/user');
}

export async function scrapeProductBySKU(sku) {
  return request(`/krowne/products/${sku}`);
}

export async function getKrowneProducts(options = {}) {
  const params = new URLSearchParams(options);
  return request(`/krowne/products?${params}`);
}