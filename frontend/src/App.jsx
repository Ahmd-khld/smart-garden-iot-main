import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Navbar from './components/Navbar';
import LandingPage from './pages/LandingPage';
import BookingPage from './pages/BookingPage';
import Payment from './pages/Payment';
import About from './pages/About';
import AdminDashboard from './pages/AdminDashboard';
import AdminHardwareAlerts from './pages/AdminHardwareAlerts';
import Profile from './pages/Profile';
import ParkMap from './pages/ParkMap';
import ResetPassword from './pages/ResetPassword';
import Login from './pages/Login';
import ForgotPassword from './pages/ForgotPassword';
import GamePage from './pages/GamePage';
import { Navigate } from 'react-router-dom';

// Safe local storage utility to prevent complete app crashes when 
// the browser restricts cookies/local storage (e.g. Incognito mode)
const getSafeStorage = (key) => {
  try {
    return localStorage.getItem(key);
  } catch (error) {
    console.warn(`Local storage restricted: could not read ${key}`);
    return null;
  }
};

// Admin Protection Component
const AdminRoute = ({ children }) => {
  const token = getSafeStorage('token');
  const role = getSafeStorage('role');
  if (!token || role !== 'admin') return <Navigate to="/" replace />;
  return children;
};

// User Protection Component
const PrivateRoute = ({ children }) => {
  const token = getSafeStorage('token');
  if (!token) return <Navigate to="/" replace />;
  return children;
};

function App() {
  const [darkMode, setDarkMode] = React.useState(getSafeStorage('theme') === 'dark');

  React.useEffect(() => {
    try {
      if (darkMode) {
        document.documentElement.classList.add('dark');
        localStorage.setItem('theme', 'dark');
      } else {
        document.documentElement.classList.remove('dark');
        localStorage.setItem('theme', 'light');
      }
    } catch (error) {
      console.warn('Local storage restricted: could not save theme');
    }
  }, [darkMode]);

  const toggleDarkMode = () => setDarkMode(!darkMode);

  return (
    <Router>
      <div className="min-h-screen bg-smart-bg dark:bg-gray-900 text-smart-gray dark:text-gray-100 font-sans flex flex-col transition-colors duration-500">
        <Navbar darkMode={darkMode} toggleDarkMode={toggleDarkMode} />
        <main className="flex-grow w-full flex flex-col">
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/book" element={<BookingPage />} />
            <Route path="/payment" element={<Payment />} />
            <Route path="/about" element={<About />} />
            <Route path="/map" element={<ParkMap />} />
            <Route path="/login" element={<Login />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password/:token" element={<ResetPassword />} />
            <Route 
              path="/admin/dashboard" 
              element={
                <AdminRoute>
                  <AdminDashboard />
                </AdminRoute>
              } 
            />
            <Route 
              path="/admin/alerts" 
              element={
                <AdminRoute>
                  <AdminHardwareAlerts />
                </AdminRoute>
              } 
            />
            <Route 
              path="/profile" 
              element={
                <PrivateRoute>
                  <Profile />
                </PrivateRoute>
              } 
            />
            <Route 
              path="/rewards" 
              element={
                <PrivateRoute>
                  <GamePage />
                </PrivateRoute>
              } 
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
}

export default App;
