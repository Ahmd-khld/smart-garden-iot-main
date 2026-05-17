import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import MonkeyForm from '../components/MonkeyForm.jsx';
import api from '../api';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    if (e) e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const response = await api.post('/login', { email, password });
      const data = response.data;

      localStorage.setItem('token', data.token);
      localStorage.setItem('role', data.role || 'user');
      if (data.role === 'admin') {
        localStorage.setItem('adminEmail', email.toLowerCase().trim());
      }
      
      if (data.role === 'admin') {
          navigate('/admin/dashboard');
      } else {
          navigate('/book');
      }
    } catch (err) {
      setError(err.response?.data?.message || err.response?.data?.error || `Server connection failed: ${err.message}`);
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
}

export default Login;
