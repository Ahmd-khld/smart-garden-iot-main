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

  const [isMenuOpen, setIsMenuOpen] = React.useState(false);

  React.useEffect(() => {
    setAuth({
      token: localStorage.getItem('token'),
      role: localStorage.getItem('role'),
    });
    setIsMenuOpen(false); // Close menu on navigation
  }, [location]);

  const { token, role } = auth || { token: null, role: null };
  const isAuthenticated = token && token !== 'null' && token !== 'undefined';

  const isActive = (path, isMobile = false) => {
    const isCurrent = location?.pathname === path;
    const base = isMobile
      ? 'block py-4 px-6 transition-all uppercase text-[14px] tracking-widest font-black border-l-4'
      : 'pb-1 transition-all uppercase text-[13px] tracking-widest font-black whitespace-nowrap shrink-0';

    if (isCurrent) {
      return isMobile
        ? `${base} border-smart-glow bg-smart-glow/10 text-smart-glow`
        : `${base} border-b-2 border-smart-glow text-smart-glow`;
    }
    return isMobile
      ? `${base} border-transparent text-white/70 hover:text-white hover:bg-white/5`
      : `${base} text-white hover:text-smart-glow`;
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('role');
    localStorage.removeItem('adminEmail');
    localStorage.removeItem('userId');
    setAuth({ token: null, role: null });
    setIsMenuOpen(false);
    navigate('/');
  };

  if (!auth) return null;

  return (
    <nav className="bg-smart-dark text-white shadow-xl sticky top-0 z-50 transition-colors duration-300 border-b border-smart-light/20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 md:h-24 flex justify-between items-center">
        {/* Logo */}
        <Link
          to="/"
          className="hover:opacity-90 transition transform shrink-0 z-20 -my-4 md:-my-10"
        >
          <img
            src={logo}
            alt="Smart Garden Logo"
            className="h-24 md:h-44 w-auto object-contain drop-shadow-2xl"
          />
        </Link>

        {/* Desktop Nav Links */}
        <div className="hidden md:flex items-center gap-6 lg:gap-8 text-[15px] font-bold justify-end py-2 ml-4">
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

        {/* Mobile Actions (Theme + Hamburger) */}
        <div className="flex md:hidden items-center space-x-4">
          <ThemeToggle isDarkMode={darkMode} toggleTheme={toggleDarkMode} />
          <button
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            className="p-2 rounded-lg bg-white/5 border border-white/10 text-white hover:bg-white/10 transition-colors focus:outline-none"
            aria-label="Toggle Menu"
          >
            {isMenuOpen ? (
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16m-7 6h7" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Mobile Menu Dropdown */}
      <div
        className={`md:hidden overflow-hidden transition-all duration-300 ease-in-out bg-smart-dark/95 backdrop-blur-md border-t border-white/10 ${
          isMenuOpen ? 'max-h-[500px] opacity-100' : 'max-h-0 opacity-0'
        }`}
      >
        <div className="py-2 flex flex-col">
          {!isAuthenticated && (
            <Link to="/" className={isActive('/', true)}>
              Home
            </Link>
          )}
          {!(role === 'admin' || role === 'sub-admin') && (
            <>
              {!isAuthenticated && (
                <Link to="/about" className={isActive('/about', true)}>
                  About Us
                </Link>
              )}
              <Link to="/map" className={isActive('/map', true)}>
                Park Map
              </Link>
            </>
          )}
          {isAuthenticated && (
            <>
              <Link to="/book" className={isActive('/book', true)}>
                Book Tickets
              </Link>
              {!(role === 'admin' || role === 'sub-admin') && (
                <Link to="/rewards" className={isActive('/rewards', true)}>
                  Play & Win
                </Link>
              )}
              <Link to="/profile" className={isActive('/profile', true)}>
                My Profile
              </Link>
            </>
          )}

          {isAuthenticated && (role === 'admin' || role === 'sub-admin') && (
            <Link
              to="/admin/dashboard"
              className="mx-4 my-4 flex items-center justify-center space-x-2 bg-smart-glow text-smart-dark py-4 rounded-2xl font-black uppercase tracking-widest text-xs"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              <span>Admin Panel</span>
            </Link>
          )}

          {isAuthenticated && (
            <button
              onClick={handleLogout}
              className="w-full text-left py-4 px-6 text-red-400 font-black uppercase tracking-widest text-[14px] hover:bg-red-500/10 border-l-4 border-transparent"
            >
              Logout Account
            </button>
          )}
        </div>
      </div>
    </nav>

  );
};

export default Navbar;
