import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import MonkeyForm from '../components/MonkeyForm.jsx';
import api from '../api';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    // Check for restriction reason in URL params (from Axios interceptor/App listener)
    const params = new URLSearchParams(location.search);
    const reason = params.get('restrictionReason') || location.state?.restrictionReason;
    if (reason) {
      setError(reason);
      // Clean up the URL
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, [location]);

  const handleLogin = async (e) => {
    if (e) e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const response = await api.post('/login', { email, password });
      const data = response.data;

      localStorage.setItem('token', data.token);
      localStorage.setItem('role', data.role || 'user');
      localStorage.setItem('userId', data._id); // Store userId for the Instant Kick listener
      if (data.role === 'admin' || data.role === 'sub-admin') {
        const storedEmail = (data.email || email).toLowerCase().trim();
        localStorage.setItem('adminEmail', storedEmail);
      }

      if (data.role === 'admin' || data.role === 'sub-admin') {
        navigate('/admin/dashboard');
      } else {
        navigate('/book');
      }
    } catch (err) {
      setError(
        err.response?.data?.message ||
          err.response?.data?.error ||
          `Server connection failed: ${err.message}`
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex-grow flex items-center justify-center p-6 bg-smart-bg dark:bg-black transition-colors duration-500 min-h-[calc(100vh-6rem)]">
      <MonkeyForm
        email={email}
        setEmail={setEmail}
        password={password}
        setPassword={setPassword}
        onLogin={handleLogin}
        isLogin={true}
        isLoading={isLoading}
        error={error}
      />
    </div>
  );
};

export default Login;
