import React, { useState } from 'react';
import { Link } from 'react-router-dom';

const ForgotPassword = () => {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState({ type: '', text: '' });
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setMessage({ type: '', text: '' });

    try {
      const response = await fetch('http://localhost:5000/api/users/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });

      const data = await response.json();

      if (response.ok) {
        setMessage({ type: 'success', text: 'Password reset link sent! Please check your email.' });
      } else {
        setMessage({ type: 'error', text: data.message || 'Something went wrong. Please try again.' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Server connection failed. Please try again later.' });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-smart-bg dark:bg-black transition-colors duration-500">
      <div className="bg-white dark:bg-gray-800 p-10 rounded-[40px] shadow-2xl border border-smart-light/20 max-w-md w-full relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-2 bg-smart-light"></div>
        
        <h2 className="text-3xl font-black text-smart-dark dark:text-white text-center tracking-tighter uppercase mb-2 italic">Reset Access</h2>
        <p className="text-smart-gray dark:text-gray-400 text-center text-sm font-medium mb-8 uppercase tracking-widest">Forgot Password</p>

        {message.text && (
          <div className={`mb-6 p-4 rounded-2xl font-bold text-sm border ${message.type === 'success' ? 'bg-smart-light/10 border-smart-light text-smart-dark dark:text-smart-glow' : 'bg-red-50 border-red-500 text-red-700 dark:bg-red-900/30 dark:text-red-200'}`}>
            {message.text}
          </div>
        )}

        <p className="text-smart-gray dark:text-gray-400 mb-8 font-medium text-center">
          Enter your email and we'll send you a link to reset your password.
        </p>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-xs font-black text-smart-dark dark:text-white mb-3 uppercase tracking-widest">Email Address</label>
            <input 
              type="email" 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-6 py-4 rounded-2xl border-2 border-smart-light/10 bg-smart-bg dark:bg-gray-700 text-smart-dark dark:text-white focus:ring-4 focus:ring-smart-light/20 focus:border-smart-light outline-none transition font-medium"
              placeholder="you@example.com"
              required
            />
          </div>

          <button 
            type="submit" 
            disabled={isLoading}
            className={`w-full font-black py-4 uppercase tracking-widest text-sm rounded-2xl transition-all flex items-center justify-center space-x-2 ${isLoading ? 'bg-gray-400 text-white cursor-not-allowed' : 'bg-smart-light hover:bg-smart-dark text-white shadow-lg hover:-translate-y-1'}`}
          >
            {isLoading ? 'Processing...' : 'Send Reset Link'}
          </button>
        </form>

        <div className="mt-8 text-center">
          <Link to="/login" className="text-sm font-black text-smart-light hover:underline uppercase tracking-widest">
            Back to Login
          </Link>
        </div>
      </div>
    </div>
  );
};

export default ForgotPassword;
