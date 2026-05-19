import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import MonkeyForm from '../components/MonkeyForm.jsx';
import api from '../api';

const LandingPage = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [age, setAge] = useState('');
  const [hasDisability, setHasDisability] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotMessage, setForgotMessage] = useState({ type: '', text: '' });
  const [isForgotLoading, setIsForgotLoading] = useState(false);
  const navigate = useNavigate();

  const handleAuth = async (e) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    const path = isLogin ? '/login' : '/register';

    const payload = isLogin
      ? { email, password }
      : { name, email, phone, age: Number(age), hasDisability, password, role: 'user' };

    try {
      const response = await api.post(path, payload);
      const data = response.data;

      localStorage.setItem('token', data.token);
      localStorage.setItem('role', data.role || 'user');
      const storedEmail = (isLogin ? email : data.email || email).toLowerCase().trim();
      localStorage.setItem('adminEmail', storedEmail);

      if (data.role === 'admin' || data.role === 'sub-admin') {
        navigate('/admin/dashboard');
      } else {
        navigate('/book');
      }
    } catch (err) {
      const errorMessage =
        err.response?.data?.message ||
        err.response?.data?.error ||
        `Server connection failed: ${err.message}`;
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotPassword = async (e) => {
    e.preventDefault();
    setForgotMessage({ type: '', text: '' });
    setIsForgotLoading(true);

    try {
      const response = await api.post('/users/forgot-password', { email: forgotEmail });

      if (response.status === 200) {
        setForgotMessage({
          type: 'success',
          text: 'Reset link sent! Please check your email inbox.',
        });
        setForgotEmail('');
      } else {
        setForgotMessage({
          type: 'error',
          text: response.data?.message || 'Failed to send reset link.',
        });
      }
    } catch (err) {
      setForgotMessage({
        type: 'error',
        text: err.response?.data?.message || 'Server connection failed.',
      });
    } finally {
      setIsForgotLoading(false);
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-smart-bg dark:bg-black transition-colors duration-300">
      <main className="flex-grow flex flex-col md:flex-row max-w-6xl mx-auto px-6 py-12 gap-12 items-center">
        {/* Features Section */}
        <div className="flex-1 space-y-8" id="features">
          <div>
            <h2 className="text-4xl font-extrabold text-smart-dark dark:text-smart-glow mb-4 italic tracking-tight">
              Welcome to the Future of Parks
            </h2>
            <p className="text-lg text-smart-gray dark:text-gray-400 leading-relaxed font-medium">
              Experience a sustainable, tech-driven environment designed for everyone. Our park
              utilizes cutting-edge IoT technology to enhance your visit.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm border border-smart-light/20 dark:border-gray-700 hover:shadow-md transition-all group">
              <div className="w-12 h-12 bg-smart-light/10 rounded-full flex items-center justify-center mb-4 group-hover:bg-smart-light transition-colors">
                <svg
                  className="w-6 h-6 text-smart-light group-hover:text-white"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M19 14l-7 7m0 0l-7-7m7 7V3"
                  ></path>
                </svg>
              </div>
              <h3 className="text-xl font-bold text-smart-dark dark:text-white mb-2">
                Inclusive Ramps
              </h3>
              <p className="text-smart-gray dark:text-gray-400">
                Smart sensors detect wheelchair access and automatically light the path for safety.
              </p>
            </div>
            <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm border border-smart-light/20 dark:border-gray-700 hover:shadow-md transition-all group">
              <div className="w-12 h-12 bg-smart-dark/10 rounded-full flex items-center justify-center mb-4 group-hover:bg-smart-dark transition-colors">
                <svg
                  className="w-6 h-6 text-smart-dark group-hover:text-white"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                  ></path>
                </svg>
              </div>
              <h3 className="text-xl font-bold text-smart-dark dark:text-white mb-2">Smart Bins</h3>
              <p className="text-smart-gray dark:text-gray-400">
                Connected waste bins notify maintenance when full, keeping the park pristine.
              </p>
            </div>
            <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm border border-smart-light/20 dark:border-gray-700 hover:shadow-md transition-all sm:col-span-2 group">
              <div className="w-12 h-12 bg-smart-light/10 rounded-full flex items-center justify-center mb-4 group-hover:bg-smart-light transition-colors">
                <svg
                  className="w-6 h-6 text-smart-light group-hover:text-white"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z"
                  ></path>
                </svg>
              </div>
              <h3 className="text-xl font-bold text-smart-dark dark:text-white mb-2">
                Automated Irrigation
              </h3>
              <p className="text-smart-gray dark:text-gray-400">
                Soil moisture sensors ensure our greenery gets exactly the water it needs,
                conserving resources.
              </p>
            </div>
          </div>
        </div>

        {/* Login/Signup Section */}
        {!localStorage.getItem('token') && (
          <div className="flex-1 flex flex-col justify-center w-full max-w-md" id="login">
            <MonkeyForm
              email={email}
              setEmail={setEmail}
              name={name}
              setName={setName}
              age={age}
              setAge={setAge}
              phone={phone}
              setPhone={setPhone}
              hasDisability={hasDisability}
              setHasDisability={setHasDisability}
              password={password}
              setPassword={setPassword}
              onLogin={handleAuth}
              isLoading={isLoading}
              error={error}
              isLogin={isLogin}
              setIsLogin={setIsLogin}
              setShowForgotModal={setShowForgotModal}
            />
          </div>
        )}
      </main>

      <ForgotPasswordModal
        show={showForgotModal}
        onClose={() => {
          setShowForgotModal(false);
          setForgotMessage({ type: '', text: '' });
        }}
        email={forgotEmail}
        setEmail={setForgotEmail}
        onSubmit={handleForgotPassword}
        isLoading={isForgotLoading}
        message={forgotMessage}
      />
    </div>
  );
};

const ForgotPasswordModal = ({ show, onClose, email, setEmail, onSubmit, isLoading, message }) => {
  if (!show) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-white dark:bg-gray-800 w-full max-w-md rounded-[40px] shadow-2xl overflow-hidden border border-smart-light/20 transform transition-all scale-100">
        <div className="bg-smart-dark p-8 flex justify-between items-center border-b border-white/10">
          <h2 className="text-2xl font-black text-smart-glow italic uppercase tracking-tighter text-white">
            Reset Access
          </h2>
          <button onClick={onClose} className="text-white hover:text-smart-glow transition-colors">
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M6 18L18 6M6 6l12 12"
              ></path>
            </svg>
          </button>
        </div>

        <div className="p-10">
          {message.text && (
            <div
              className={`mb-6 p-4 rounded-2xl font-bold text-sm border ${message.type === 'success' ? 'bg-smart-light/10 border-smart-light text-smart-dark dark:text-smart-glow' : 'bg-red-50 border-red-500 text-red-700 dark:bg-red-900/30 dark:text-red-200'}`}
            >
              {message.text}
            </div>
          )}

          <p className="text-smart-gray dark:text-gray-400 mb-8 font-medium">
            Enter the email address associated with your account and we'll send you a link to reset
            your password.
          </p>

          <form onSubmit={onSubmit} className="space-y-6">
            <div>
              <label className="block text-xs font-black text-smart-dark dark:text-white mb-3 uppercase tracking-widest">
                Email Address
              </label>
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
              className={`w-full py-5 rounded-2xl font-black uppercase tracking-widest text-xs transition-all shadow-xl hover:-translate-y-1 ${isLoading ? 'bg-gray-400 text-white cursor-not-allowed' : 'bg-smart-light hover:bg-smart-dark text-white'}`}
            >
              {isLoading ? 'Processing...' : 'Send Reset Link'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default LandingPage;
