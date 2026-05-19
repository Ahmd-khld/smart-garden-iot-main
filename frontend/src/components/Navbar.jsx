import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import ThemeToggle from './ThemeToggle';

import logo from '../assets/logo.png';

const Navbar = ({ darkMode, toggleDarkMode }) => {
  const location = useLocation();
  const navigate = useNavigate();

  // Use state to track auth to ensure re-renders on login/logout
  // We sync this state whenever the location changes as a simple way to track navigation-based auth changes
  const [auth, setAuth] = React.useState({
    token: localStorage.getItem('token'),
    role: localStorage.getItem('role'),
  });

  React.useEffect(() => {
    setAuth({
      token: localStorage.getItem('token'),
      role: localStorage.getItem('role'),
    });
  }, [location]);

  const { token, role } = auth || { token: null, role: null };
  const isAuthenticated = token && token !== 'null' && token !== 'undefined';

  const isActive = (path) => {
    const isCurrent = location?.pathname === path;
    const base =
      'pb-1 transition-all uppercase text-[13px] tracking-widest font-black whitespace-nowrap shrink-0';

    if (isCurrent) {
      return `${base} border-b-2 border-smart-glow text-smart-glow`;
    }
    return `${base} text-white hover:text-smart-glow`;
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('role');
    localStorage.removeItem('adminEmail');
    localStorage.removeItem('userId');
    setAuth({ token: null, role: null });
    navigate('/');
  };

  if (!auth) return null;

  return (
    <nav className="bg-smart-dark text-white shadow-xl sticky top-0 z-50 h-24 transition-colors duration-300 border-b border-smart-light/20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-full flex justify-between items-center">
        {/* Logo */}
        <Link
          to="/"
          className="hover:opacity-90 transition transform shrink-0 z-10"
        >
          <img
            src={logo}
            alt="Smart Garden Logo"
            className="h-12 md:h-24 w-auto object-contain drop-shadow-xl"
          />
        </Link>

        {/* Nav Links */}
        <div className="flex items-center gap-6 lg:gap-8 text-[15px] font-bold overflow-x-auto justify-end scrollbar-hide py-2 ml-4">
          {!isAuthenticated && (
            <Link to="/" className={isActive('/')}>
              Home
            </Link>
          )}
          {!(role === 'admin' || role === 'sub-admin') && (
            <>
              {!isAuthenticated && (
                <Link to="/about" className={isActive('/about')}>
                  About Us
                </Link>
              )}
              <Link to="/map" className={isActive('/map')}>
                Park Map
              </Link>
            </>
          )}
          {isAuthenticated && (
            <>
              <Link to="/book" className={isActive('/book')}>
                Book Tickets
              </Link>
              {!(role === 'admin' || role === 'sub-admin') && (
                <Link to="/rewards" className={isActive('/rewards')}>
                  Play & Win
                </Link>
              )}
            </>
          )}

          {/* Theme Toggle Button */}
          <div className="shrink-0">
            <ThemeToggle isDarkMode={darkMode} toggleTheme={toggleDarkMode} />
          </div>

          {isAuthenticated && (
            <Link
              to="/profile"
              className={`flex items-center space-x-1 shrink-0 ${isActive('/profile')}`}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                ></path>
              </svg>
              <span>Profile</span>
            </Link>
          )}

          {isAuthenticated && !location.pathname.includes('/admin') && (
            <button
              onClick={handleLogout}
              className="text-white/70 hover:text-white transition-colors font-bold uppercase text-xs tracking-widest whitespace-nowrap shrink-0"
            >
              Logout
            </button>
          )}

          {isAuthenticated && (role === 'admin' || role === 'sub-admin') && (
            <Link
              to="/admin/dashboard"
              className="flex items-center space-x-2 bg-white/10 border border-white/20 hover:bg-white/20 text-smart-glow px-5 py-2.5 rounded-xl font-black transition-all shadow-md transform hover:-translate-y-0.5 whitespace-nowrap shrink-0"
            >
              <svg
                className="w-4 h-4 text-smart-glow"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                ></path>
              </svg>
              <span className="tracking-widest uppercase text-[12px]">Admin Panel</span>
            </Link>
          )}
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
