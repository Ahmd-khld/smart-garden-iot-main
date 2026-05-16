import axios from 'axios';

// Create a global Axios instance
const api = axios.create({
  // Ensure this matches your backend URL and port
  baseURL: 'http://localhost:5000/api', 
  
  // MANDATORY: Automatically sends your HTTP-Only session cookie with every request
  withCredentials: true 
});

export default api;