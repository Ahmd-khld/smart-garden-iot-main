import axios from 'axios';

// Create a global Axios instance
const api = axios.create({
  // Use environment variable with fallbacks for both Vite and Next.js
  baseURL: (typeof process !== 'undefined' ? process.env.NEXT_PUBLIC_API_BASE_URL : null) || 
           (typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env.VITE_API_BASE_URL : null) || 
           '/api',

  // MANDATORY: Automatically sends your HTTP-Only session cookie with every request
  withCredentials: true,
});

// Automatically attach the Authorization header if a token exists in localStorage
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token && token !== 'null' && token !== 'undefined') {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Global response interceptor to handle account restriction or unauthorized access
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (
      error.response &&
      error.response.status === 403 &&
      (error.response.data?.message?.includes('restricted') || error.response.data?.isRestricted)
    ) {
      // Clear all local auth state
      localStorage.removeItem('token');
      localStorage.removeItem('role');
      localStorage.removeItem('adminEmail');

      // Force redirect with state
      const message = error.response.data?.message || 'Your account has been restricted.';
      window.location.href = `/login?restrictionReason=${encodeURIComponent(message)}`;
    }
    return Promise.reject(error);
  }
);

export default api;
