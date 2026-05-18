import axios from 'axios';

// Create a global Axios instance
const api = axios.create({
  // Use environment variable with a fallback for local development
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api',

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

export default api;
