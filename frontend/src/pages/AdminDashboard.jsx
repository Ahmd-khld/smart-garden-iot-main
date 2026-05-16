import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { socket } from '../socket';
import AdminHeader from '../components/AdminHeader';
import WidgetErrorBoundary from '../components/WidgetErrorBoundary';

// Helper function to decode JWT and check for expiration
const isTokenExpired = (token) => {
  if (!token || token === 'undefined' || token === 'null') return true;
  try {
    // Safely decode base64url payload to prevent atob() DOMExceptions
    const parts = token.split('.');
    if (parts.length !== 3) return true;
    const base64Url = parts[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    
    // Robust UTF-8 decoding to prevent DOMException errors on complex payloads
    const jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
    }).join(''));
    
    const payload = JSON.parse(jsonPayload);
    // Check if token is expired (exp is in seconds)
    return payload.exp ? Date.now() >= payload.exp * 1000 : false;
  } catch (error) {
    console.error("Failed to parse token:", error);
    return true; // Treat malformed tokens as expired
  }
};

const AdminDashboard = () => {
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [isLoadingStats, setIsLoadingStats] = useState(true);
  const isSuperAdmin = localStorage.getItem('adminEmail') === 'admin@smartpark.com';

  const [regularUsers, setRegularUsers] = useState([]);
  const [subAdmins, setSubAdmins] = useState([]);
  const [totalUserPages, setTotalUserPages] = useState(1);
  const [totalUsersCount, setTotalUsersCount] = useState(0);
  const [manualTicketId, setManualTicketId] = useState('');
  const [scanMessage, setScanMessage] = useState(null);
  const [insights, setInsights] = useState(null);
  const [loadingInsights, setLoadingInsights] = useState(true);
  const scannerRef = useRef(null);
  const [isCrowdInsightsExpanded, setIsCrowdInsightsExpanded] = useState(true);
  const [isUserManagementExpanded, setIsUserManagementExpanded] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [insightStartDate, setInsightStartDate] = useState(new Date());
  const [isHardwareAlertsExpanded, setIsHardwareAlertsExpanded] = useState(true);
  const [alertFilterType, setAlertFilterType] = useState('all');
  const [auditLogs, setAuditLogs] = useState([]);
  const [isAuditLogsExpanded, setIsAuditLogsExpanded] = useState(true);
  const [auditLogPage, setAuditLogPage] = useState(1);
  const [auditLogHasMore, setAuditLogHasMore] = useState(false);
  const [isLoadingAuditLogs, setIsLoadingAuditLogs] = useState(false);
  const [bannedIPs, setBannedIPs] = useState([]);
  const [totalBannedIPs, setTotalBannedIPs] = useState(0);
  const [isBannedIPsExpanded, setIsBannedIPsExpanded] = useState(false);
  const [bannedIPsSearchQuery, setBannedIPsSearchQuery] = useState('');
  const [bannedIPsPage, setBannedIPsPage] = useState(1);
  const [bannedIPsHasMore, setBannedIPsHasMore] = useState(false);
  const [isLoadingBannedIPs, setIsLoadingBannedIPs] = useState(false);
  const [whitelistedIPs, setWhitelistedIPs] = useState([]);
  const [totalWhitelistedIPs, setTotalWhitelistedIPs] = useState(0);
  const [isWhitelistExpanded, setIsWhitelistExpanded] = useState(true);
  const [newWhitelistIP, setNewWhitelistIP] = useState('');
  const [newWhitelistDesc, setNewWhitelistDesc] = useState('');
  const [newWhitelistMac, setNewWhitelistMac] = useState('');
  const [whitelistedIPsSearchQuery, setWhitelistedIPsSearchQuery] = useState('');
  const [whitelistPage, setWhitelistPage] = useState(1);
  const [whitelistHasMore, setWhitelistHasMore] = useState(false);
  const [isLoadingWhitelist, setIsLoadingWhitelist] = useState(false);
  const [alerts, setAlerts] = useState([]);
  const [alertPage, setAlertPage] = useState(1);
  const [totalAlertPages, setTotalAlertPages] = useState(1);
  const [totalAlertsCount, setTotalAlertsCount] = useState(0);
  const [isLoadingAlerts, setIsLoadingAlerts] = useState(false);
  const [userPage, setUserPage] = useState(1);
  const [monthlySales, setMonthlySales] = useState([]);
  const [isMonthlySalesExpanded, setIsMonthlySalesExpanded] = useState(false);
  const [salesStartDate, setSalesStartDate] = useState('');
  const [salesEndDate, setSalesEndDate] = useState('');
  const isSalesFilteredRef = useRef(false);
  const [promoStats, setPromoStats] = useState([]);
  const [isPromoStatsExpanded, setIsPromoStatsExpanded] = useState(false);
  const [backups, setBackups] = useState([]);
  const [isBackupsExpanded, setIsBackupsExpanded] = useState(true);
  const [restoringBackupFilename, setRestoringBackupFilename] = useState(null);
  const USERS_PER_PAGE = 10;
  const [activeTab, setActiveTab] = useState('overview');
  
  const [newAdminName, setNewAdminName] = useState('');
  const [newAdminEmail, setNewAdminEmail] = useState('');
  const [newAdminPassword, setNewAdminPassword] = useState('');
  const [newAdminIp, setNewAdminIp] = useState('');
  const [newAdminMac, setNewAdminMac] = useState('');
  const [isSubAdminProvisioningExpanded, setIsSubAdminProvisioningExpanded] = useState(true);
  const [isSubAdminsExpanded, setIsSubAdminsExpanded] = useState(true);
  
  const [unreadAuditCount, setUnreadAuditCount] = useState(0);
  const isAuditLogsExpandedRef = useRef(isAuditLogsExpanded);
  const [unreadAlertsCount, setUnreadAlertsCount] = useState(0);
  const isHardwareAlertsExpandedRef = useRef(isHardwareAlertsExpanded);
  const [unreadBannedCount, setUnreadBannedCount] = useState(0);
  const isBannedIPsExpandedRef = useRef(isBannedIPsExpanded);
  const alertPageRef = useRef(alertPage);

  useEffect(() => {
    alertPageRef.current = alertPage;
  }, [alertPage]);

  useEffect(() => {
    isAuditLogsExpandedRef.current = activeTab === 'security' && isAuditLogsExpanded;
    if (activeTab === 'security' && isAuditLogsExpanded) setUnreadAuditCount(0);
  }, [activeTab, isAuditLogsExpanded]);

  useEffect(() => {
    isHardwareAlertsExpandedRef.current = activeTab === 'hardware' && isHardwareAlertsExpanded;
    if (activeTab === 'hardware' && isHardwareAlertsExpanded) setUnreadAlertsCount(0);
  }, [activeTab, isHardwareAlertsExpanded]);

  useEffect(() => {
    isBannedIPsExpandedRef.current = activeTab === 'security' && isBannedIPsExpanded;
    if (activeTab === 'security' && isBannedIPsExpanded) setUnreadBannedCount(0);
  }, [activeTab, isBannedIPsExpanded]);

  const isMountedForSales = useRef(false);
  useEffect(() => {
    if (!isMountedForSales.current) {
      isMountedForSales.current = true;
      return; // Skip on initial mount as fetchData handles it
    }
    isSalesFilteredRef.current = !!(salesStartDate || salesEndDate);
    
    const fetchFilteredSales = async () => {
      const token = localStorage.getItem('token');
      let url = 'http://localhost:5000/api/admin/monthly-sales';
      const params = new URLSearchParams();
      if (salesStartDate) params.append('startDate', salesStartDate);
      if (salesEndDate) params.append('endDate', salesEndDate);
      if (params.toString()) url += `?${params.toString()}`;
      
      try {
        const res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
        if (res.ok) setMonthlySales(await res.json());
      } catch (err) { console.error("Failed to fetch filtered sales", err); }
    };
    fetchFilteredSales();
  }, [salesStartDate, salesEndDate]);

  // Fetch crowd insights
  const fetchInsights = React.useCallback(async () => {
    setLoadingInsights(true);
    try {
      const token = localStorage.getItem('token');
      if (isTokenExpired(token)) {
        handleLogout();
        return;
      }
      const dateStr = insightStartDate.toISOString().split('T')[0];
      const response = await fetch(`http://localhost:5000/api/tickets/insights?startDate=${dateStr}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setInsights(data);
      } else {
        setInsights(null);
      }
    } catch (err) {
      console.error('Failed to fetch insights:', err);
      setInsights(null);
    } finally {
      setLoadingInsights(false);
    }
  }, [insightStartDate]);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (isTokenExpired(token)) {
      console.log("Token is expired or missing. Redirecting to login.");
      // Clear potentially bad token and user info
      localStorage.removeItem('token');
      localStorage.removeItem('adminEmail');
      localStorage.removeItem('role');
      navigate('/');
      return;
    }

    const fetchData = async () => {
      try {
        const statsRes = await fetch('http://localhost:5000/api/admin/stats', {
          headers: { 'Authorization': `Bearer ${token}` }
        });

        if (statsRes.ok) {
          const statsData = await statsRes.json();
          setStats(statsData);
        } else if (statsRes.status === 401) {
          // This is a secondary catch-all in case the token becomes invalid between pages.
          handleLogout();
          return;
        }

        const usersRes = await fetch('http://localhost:5000/api/admin/users?role=user&page=1&limit=10', { headers: { 'Authorization': `Bearer ${token}` } });
        if (usersRes.status === 401) { handleLogout(); return; }
        if (usersRes.ok) {
          const data = await usersRes.json();
          setRegularUsers(data.users || []);
          setTotalUserPages(data.totalPages || 1);
          setTotalUsersCount(data.totalUsers || 0);
        }

        const adminsRes = await fetch('http://localhost:5000/api/admin/users?role=admin', { headers: { 'Authorization': `Bearer ${token}` } });
        if (adminsRes.status === 401) { handleLogout(); return; }
        if (adminsRes.ok) {
          const data = await adminsRes.json();
          setSubAdmins(data.users || []);
        }

        if (isSuperAdmin) {
          const auditLogsRes = await fetch('http://localhost:5000/api/admin/audit-logs?page=1&limit=10', {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          if (auditLogsRes.status === 401) { handleLogout(); return; }
          if (auditLogsRes.ok) {
            const data = await auditLogsRes.json();
            setAuditLogs(data.logs);
            setAuditLogHasMore(data.currentPage < data.totalPages);
          }

          const bannedIPsRes = await fetch('http://localhost:5000/api/admin/banned-ips?page=1&limit=10', {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          if (bannedIPsRes.status === 401) { handleLogout(); return; }
          if (bannedIPsRes.ok) {
            const data = await bannedIPsRes.json();
            setBannedIPs(data.bannedIPs);
            setTotalBannedIPs(data.totalBannedIPs || 0);
            setBannedIPsHasMore(data.currentPage < data.totalPages);
          }

          const whitelistRes = await fetch('http://localhost:5000/api/admin/whitelisted-ips?page=1&limit=10', {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          if (whitelistRes.status === 401) { handleLogout(); return; }
          if (whitelistRes.ok) {
            const data = await whitelistRes.json();
            setWhitelistedIPs(data.ips);
            setTotalWhitelistedIPs(data.totalIps || 0);
            setWhitelistHasMore(data.currentPage < data.totalPages);
          }

        const backupsRes = await fetch('http://localhost:5000/api/admin/backups', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (backupsRes.status === 401) { handleLogout(); return; }
        if (backupsRes.ok) {
          setBackups(await backupsRes.json());
        }
        }

        const salesRes = await fetch('http://localhost:5000/api/admin/monthly-sales', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (salesRes.status === 401) { handleLogout(); return; }
        if (salesRes.ok) {
          setMonthlySales(await salesRes.json());
        }

        const alertsRes = await fetch('http://localhost:5000/api/admin/hardware-alerts?page=1&limit=10', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (alertsRes.status === 401) { handleLogout(); return; }
        if (alertsRes.ok) {
          const data = await alertsRes.json();
          setAlerts(data.alerts || (Array.isArray(data) ? data : []));
          setTotalAlertPages(data.totalPages || 1);
          setTotalAlertsCount(data.totalAlerts || 0);
        }

        const promoRes = await fetch('http://localhost:5000/api/admin/promo-stats', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (promoRes.status === 401) { handleLogout(); return; }
        if (promoRes.ok) {
          setPromoStats(await promoRes.json());
        }
      } catch (error) {
        console.error("Failed to fetch data", error);
      } finally {
        setIsLoadingStats(false);
      }
    };

    fetchData();
  }, [navigate]);

  useEffect(() => {
    fetchInsights();
    const interval = setInterval(fetchInsights, 60000);
    return () => clearInterval(interval);
  }, [fetchInsights]);

  const fetchStats = async () => {
    const token = localStorage.getItem('token');
    if (isTokenExpired(token)) {
      handleLogout();
      return;
    }
    try {
      const statsRes = await fetch('http://localhost:5000/api/admin/stats', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (statsRes.status === 401) { handleLogout(); return; }
      if (statsRes.ok) {
        const statsData = await statsRes.json();
        setStats(statsData);
      }


      const salesRes = await fetch('http://localhost:5000/api/admin/monthly-sales', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (salesRes.status === 401) {
        handleLogout();
        return;
      }
      if (salesRes.ok) {
        setMonthlySales(await salesRes.json());
      }
    } catch (error) {
      console.error("Failed to refresh stats", error);
    }
  };

  useEffect(() => {
    let timer;
    if (activeTab === 'hardware') {
      // Add a slight delay to ensure React has painted the <div id="reader"> into the DOM
      timer = setTimeout(() => {
        const readerElement = document.getElementById('reader');
        if (readerElement && !scannerRef.current) {
          scannerRef.current = new Html5QrcodeScanner(
            "reader",
            { fps: 10, qrbox: { width: 250, height: 250 } },
            false
          );
          scannerRef.current.render(onScanSuccess, onScanFailure);
        }
      }, 100);
    }

    return () => {
      clearTimeout(timer);
      if (scannerRef.current) {
        try { scannerRef.current.clear().catch(() => {}); } catch(e) {}
        scannerRef.current = null;
      }
    };
  }, [activeTab]);

  const handleScanRequest = async (idToScan) => {
    const token = localStorage.getItem('token');
    if (isTokenExpired(token)) {
      setScanMessage({ type: 'error', text: 'Your session has expired. Please log in again.' });
      handleLogout();
      return;
    }

    try {
      setScanMessage(null); // Clear previous message
      const response = await fetch('http://localhost:5000/api/admin/scan', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ ticketId: idToScan })
      });

      const data = await response.json();

      if (response.ok) {
        setScanMessage({ type: 'success', text: data.message });

        // Refresh stats immediately
        fetchStats();

      } else {
        setScanMessage({ type: 'error', text: data.message || 'Scan failed' });
        playErrorBuzz();
        if (response.status === 401) {
          console.error('Admin Authorization Error:', data.message);
          handleLogout();
        }
      }
    } catch (error) {
      console.error(error);
      if (error.response) {
        console.log(error.response);
      }
      setScanMessage({ type: 'error', text: 'Network error or server down.' });
      playErrorBuzz();
    }
  };

  const playSuccessBeep = () => {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      
      const audioCtx = new AudioContext();
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);
      
      oscillator.type = 'sine'; // 'sine', 'square', 'sawtooth', 'triangle'
      oscillator.frequency.value = 800; // Frequency in Hz (higher number = higher pitch)
      gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime); // Volume (0.0 to 1.0)
      
      oscillator.start();
      setTimeout(() => {
        oscillator.stop();
        audioCtx.close();
      }, 150); // Beep duration in ms
    } catch (err) {
      console.error('Audio beep failed', err);
    }
  };

  const playErrorBuzz = () => {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      
      const audioCtx = new AudioContext();
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);
      
      oscillator.type = 'sawtooth'; // Rough waveform for an aggressive buzz
      oscillator.frequency.value = 150; // Low pitch
      gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime); // Volume
      
      oscillator.start();
      setTimeout(() => {
        oscillator.stop();
        audioCtx.close();
      }, 400); // 400ms duration
    } catch (err) {
      console.error('Audio buzz failed', err);
    }
  };

  const onScanSuccess = (decodedText) => {
    playSuccessBeep();

    let finalId = decodedText;

    // Check if it's a JWT from our system
    try {
      const parts = decodedText.split('.');
      if (parts.length === 3) {
        // Decode the base64 payload
        const payload = JSON.parse(atob(parts[1]));
        if (payload && payload.ticketId) {
          finalId = payload.ticketId;
        }
      }
    } catch (e) {
      // Not a JWT, use raw string
    }

    handleScanRequest(finalId);
  };

  const onScanFailure = (error) => {
    // Ignore routine scan errors (e.g. no QR in frame)
  };

  const handleManualOverride = (e) => {
    e.preventDefault();
    const cleanId = manualTicketId.trim();
    if (cleanId) {
      handleScanRequest(cleanId);
      setManualTicketId('');
    }
  };

  const handleUnlockScanner = async () => {
    const token = localStorage.getItem('token');
    try {
      const response = await fetch('http://localhost:5000/api/admin/unlock-scanner', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        setScanMessage({ type: 'success', text: 'Scanner unlocked successfully.' });
      } else {
        const data = await response.json();
        setScanMessage({ type: 'error', text: data.message || 'Failed to unlock scanner' });
      }
    } catch (error) {
      setScanMessage({ type: 'error', text: 'Network error.' });
    }
  };

  const handleToggleCamera = () => {
    const selectElement = document.querySelector('#reader select');
    if (selectElement && selectElement.options.length > 1) {
      const nextIndex = (selectElement.selectedIndex + 1) % selectElement.options.length;
      selectElement.selectedIndex = nextIndex;
      selectElement.dispatchEvent(new Event('change'));
    } else {
      setScanMessage({ type: 'error', text: 'Multiple cameras not detected or scanner not active yet.' });
    }
  };

  const handleBlockUser = async (userId, currentStatus) => {
    const token = localStorage.getItem('token');
    if (isTokenExpired(token)) {
      alert('Your session has expired. Please log in again.');
      handleLogout();
      return;
    }
    try {
      const response = await fetch(`http://localhost:5000/api/admin/users/${userId}/block`, {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        setRegularUsers(prev => prev.map(u => u._id === userId ? { ...u, isBlocked: !currentStatus } : u));
        setSubAdmins(prev => prev.map(u => u._id === userId ? { ...u, isBlocked: !currentStatus } : u));
      } else if (response.status === 401) {
        alert('Your session has expired. Please log in again.');
        handleLogout();
      } else {
        const data = await response.json();
        alert(data.message || 'Failed to update user status.');
      }
    } catch (error) {
      console.error("Failed to toggle block status", error);
      alert('A network error occurred. Please try again.');
    }
  };

  const handleCreateSubAdmin = async (e) => {
    e.preventDefault();
    if (!newAdminName || !newAdminEmail || !newAdminPassword || !newAdminIp) return;

    const token = localStorage.getItem('token');
    if (isTokenExpired(token)) {
      alert('Your session has expired. Please log in again.');
      handleLogout();
      return;
    }
    try {
      const response = await fetch('http://localhost:5000/api/admin/sub-admin', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}` 
        },
        body: JSON.stringify({ name: newAdminName, email: newAdminEmail, password: newAdminPassword, ipAddress: newAdminIp, macAddress: newAdminMac })
      });
      
      const data = await response.json();
      if (response.ok) {
        setNewAdminName('');
        setNewAdminEmail('');
        setNewAdminPassword('');
        setNewAdminIp('');
        setNewAdminMac('');
        alert(data.message);
      } else if (response.status === 401) {
        alert('Your session has expired. Please log in again.');
        handleLogout();
      } else {
        alert(data.message || 'Failed to create sub-admin');
      }
    } catch (error) {
      console.error('Error creating sub-admin:', error);
      alert('Network error while creating sub-admin.');
    }
  };

  const handleDeleteUser = async (userId) => {
    if (!window.confirm('Are you sure you want to permanently delete this user? This action cannot be undone.')) return;
    const token = localStorage.getItem('token');
    if (isTokenExpired(token)) {
      alert('Your session has expired. Please log in again.');
      handleLogout();
      return;
    }
    try {
      const response = await fetch(`http://localhost:5000/api/admin/users/${userId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        // The websocket event 'userDeleted' will handle the UI update.
        alert('User deleted successfully.');
      } else if (response.status === 401) {
        alert('Your session has expired. Please log in again.');
        handleLogout();
      } else {
        const data = await response.json();
        alert(data.message || 'Failed to delete user');
      }
    } catch (error) {
      console.error("Failed to delete user", error);
      alert('A network error occurred. Please try again.');
    }
  };

  const handleResetOccupancy = async () => {
    if (!window.confirm('Are you sure you want to reset the park occupancy? This will archive all currently scanned tickets. This action cannot be undone.')) {
      return;
    }

    const token = localStorage.getItem('token');
    try {
      const response = await fetch('http://localhost:5000/api/admin/reset-occupancy', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        alert('Park occupancy has been reset successfully.');
        fetchStats();
      } else {
        const data = await response.json();
        alert(data.message || 'Failed to reset occupancy');
      }
    } catch (error) {
      console.error("Reset Occupancy Error:", error);
      alert('Network error while resetting occupancy.');
    }
  };

  const handleGenerateDummyTickets = async () => {
    const token = localStorage.getItem('token');
    try {
      const response = await fetch('http://localhost:5000/api/admin/generate-dummy-tickets', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        alert('Dummy data generated successfully! The charts will now update.');
        fetchStats();
        fetchInsights();
      } else {
        const data = await response.json();
        alert(data.message || 'Failed to generate dummy tickets');
      }
    } catch (error) {
      console.error("Generate Dummy Data Error:", error);
      alert('Network error while generating dummy data.');
    }
  };

  const handleClearDummyData = async () => {
    if (!window.confirm('Are you sure you want to delete all tickets? This will clear all chart data and cannot be undone.')) {
      return;
    }

    const token = localStorage.getItem('token');
    try {
      const response = await fetch('http://localhost:5000/api/admin/clear-dummy-tickets', {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        alert('All dummy data cleared successfully!');
        fetchStats();
        fetchInsights();
      } else {
        const data = await response.json();
        alert(data.message || 'Failed to clear dummy data');
      }
    } catch (error) {
      console.error("Clear Dummy Data Error:", error);
      alert('Network error while clearing dummy data.');
    }
  };

  const handleBackupDatabase = async () => {
    if (!window.confirm('Are you sure you want to trigger a manual database backup now?')) return;
    
    const token = localStorage.getItem('token');
    try {
      const response = await fetch('http://localhost:5000/api/admin/backup', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await response.json();
      if (response.ok) {
        alert(data.message);
        // Refresh backups list
        const backupsRes = await fetch('http://localhost:5000/api/admin/backups', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (backupsRes.ok) {
          setBackups(await backupsRes.json());
        }
      } else {
        alert(data.message || 'Backup failed');
      }
    } catch (err) {
      console.error('Backup Error:', err);
      alert('Network error while requesting backup.');
    }
  };

  const handleLoadMoreAuditLogs = async () => {
    setIsLoadingAuditLogs(true);
    const token = localStorage.getItem('token');
    try {
      const response = await fetch(`http://localhost:5000/api/admin/audit-logs?page=${auditLogPage + 1}&limit=10`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setAuditLogs(prev => [...prev, ...data.logs]);
        setAuditLogPage(data.currentPage);
        setAuditLogHasMore(data.currentPage < data.totalPages);
      }
    } catch (error) {
      console.error("Failed to load older audit logs", error);
    } finally {
      setIsLoadingAuditLogs(false);
    }
  };

  const handleClearAuditLogs = async (olderThan = null) => {
    const confirmMsg = olderThan 
      ? `Are you sure you want to wipe security audit logs older than ${olderThan} days?`
      : 'Are you sure you want to completely wipe the security audit history? This action cannot be undone.';
    
    if (!window.confirm(confirmMsg)) {
      return;
    }

    setIsLoadingAuditLogs(true);
    const token = localStorage.getItem('token');
    let url = 'http://localhost:5000/api/admin/audit-logs';
    if (olderThan) url += `?olderThan=${olderThan}`;
    
    try {
      const response = await fetch(url, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!response.ok) {
        const data = await response.json();
        alert(data.message || 'Failed to clear audit logs');
      }
    } catch (error) {
      console.error("Failed to clear audit logs", error);
      alert('Network error while clearing audit logs.');
    } finally {
      setIsLoadingAuditLogs(false);
    }
  };

  const handleClearHardwareAlerts = async () => {
    if (!window.confirm('Are you sure you want to completely clear all hardware alerts? This action cannot be undone.')) return;
    const token = localStorage.getItem('token');
    try {
      const response = await fetch('http://localhost:5000/api/admin/hardware-alerts', {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        setAlerts([]); // Clear the local state alerts immediately
      } else {
        const data = await response.json();
        alert(data.message || 'Failed to clear hardware alerts');
      }
    } catch (error) {
      console.error("Failed to clear hardware alerts", error);
      alert('Network error while clearing hardware alerts.');
    }
  };

  const fetchBannedIPs = async (page = 1, append = false) => {
    setIsLoadingBannedIPs(true);
    const token = localStorage.getItem('token');
    try {
      let url = `http://localhost:5000/api/admin/banned-ips?page=${page}&limit=10`;
      if (bannedIPsSearchQuery) url += `&search=${encodeURIComponent(bannedIPsSearchQuery)}`;
      const response = await fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        if (append) setBannedIPs(prev => [...prev, ...data.bannedIPs]);
        else setBannedIPs(data.bannedIPs || []);
        
        setTotalBannedIPs(data.totalBannedIPs || 0);
        setBannedIPsPage(data.currentPage);
        setBannedIPsHasMore(data.currentPage < data.totalPages);
      }
    } catch (error) {
      console.error("Failed to load older banned IPs", error);
    } finally {
      setIsLoadingBannedIPs(false);
    }
  };

  const handleLoadMoreBannedIPs = () => fetchBannedIPs(bannedIPsPage + 1, true);

  const isFirstRenderBanned = useRef(true);
  useEffect(() => {
    if (isFirstRenderBanned.current) { isFirstRenderBanned.current = false; return; }
    const timeout = setTimeout(() => fetchBannedIPs(1, false), 500);
    return () => clearTimeout(timeout);
  }, [bannedIPsSearchQuery]);

  const handleUnbanIP = async (id) => {
    if (!window.confirm('Are you sure you want to unban this IP address?')) return;
    const token = localStorage.getItem('token');
    try {
      const response = await fetch(`http://localhost:5000/api/admin/banned-ips/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        setBannedIPs(prev => prev.filter(ip => ip._id !== id));
      } else {
        const data = await response.json();
        alert(data.message || 'Failed to unban IP');
      }
    } catch (error) {
      console.error('Error unbanning IP:', error);
    }
  };

  const handleAddWhitelistIP = async (e) => {
    e.preventDefault();
    if (!newWhitelistIP) return;
    
    const token = localStorage.getItem('token');
    try {
      const response = await fetch('http://localhost:5000/api/admin/whitelisted-ips', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}` 
        },
        body: JSON.stringify({ ipAddress: newWhitelistIP, description: newWhitelistDesc, macAddress: newWhitelistMac })
      });
      
      const data = await response.json();
      if (response.ok) {
        setNewWhitelistIP('');
        setNewWhitelistDesc('');
        setNewWhitelistMac('');
      } else {
        alert(data.message || 'Failed to add IP');
      }
    } catch (error) {
      console.error('Error adding whitelist IP:', error);
    }
  };

  const handleRemoveWhitelistIP = async (id) => {
    if (!window.confirm('Are you sure you want to remove this IP from the whitelist?')) return;
    const token = localStorage.getItem('token');
    try {
      const response = await fetch(`http://localhost:5000/api/admin/whitelisted-ips/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!response.ok) {
        const data = await response.json();
        alert(data.message || 'Failed to remove IP');
      }
    } catch (error) {
      console.error('Error removing whitelist IP:', error);
    }
  };

  const handleDownloadBackup = async (filename) => {
    const token = localStorage.getItem('token');
    try {
      const response = await fetch(`http://localhost:5000/api/admin/backups/${filename}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!response.ok) throw new Error('Failed to download');
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Download error:', err);
      alert('Failed to download backup file.');
    }
  };

  const handleDeleteBackup = async (filename) => {
    if (!window.confirm(`Are you sure you want to permanently delete the backup file: ${filename}?`)) return;
    const token = localStorage.getItem('token');
    try {
      const response = await fetch(`http://localhost:5000/api/admin/backups/${filename}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        setBackups(prev => prev.filter(b => b.filename !== filename));
      } else {
        const data = await response.json();
        alert(data.message || 'Failed to delete backup');
      }
    } catch (err) {
      console.error('Delete backup error:', err);
      alert('Network error while deleting backup.');
    }
  };

  const handleRestoreBackup = async (filename) => {
    if (!window.confirm(`Are you sure you want to restore the database to the state in ${filename}? This action will overwrite current data and cannot be undone.`)) return;
    
    setRestoringBackupFilename(filename);
    const token = localStorage.getItem('token');
    try {
      const response = await fetch(`http://localhost:5000/api/admin/backups/${filename}/restore`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      let data;
      try {
        data = await response.json();
      } catch (parseError) {
        throw new Error(`Server returned a non-JSON response (Status: ${response.status}). The backend endpoint might be missing or crashing.`);
      }

      if (response.ok) {
        alert(data.message || 'Backup restored successfully!');
        fetchStats(); // Refresh dashboard stats to reflect the restored data
      } else {
        alert(data.message || 'Failed to restore backup');
      }
    } catch (err) {
      console.error('Restore backup error:', err);
      alert(err.message || 'Network error while restoring backup.');
    } finally {
      setRestoringBackupFilename(null);
    }
  };

  const fetchWhitelistedIPs = async (page = 1, append = false) => {
    setIsLoadingWhitelist(true);
    const token = localStorage.getItem('token');
    try {
      let url = `http://localhost:5000/api/admin/whitelisted-ips?page=${page}&limit=10`;
      if (whitelistedIPsSearchQuery) url += `&search=${encodeURIComponent(whitelistedIPsSearchQuery)}`;
      const response = await fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        if (append) setWhitelistedIPs(prev => [...prev, ...data.ips]);
        else setWhitelistedIPs(data.ips || []);
        
        setTotalWhitelistedIPs(data.totalIps || 0);
        setWhitelistPage(data.currentPage);
        setWhitelistHasMore(data.currentPage < data.totalPages);
      }
    } catch (error) {
      console.error("Failed to load older whitelisted IPs", error);
    } finally {
      setIsLoadingWhitelist(false);
    }
  };

  const handleLoadMoreWhitelistIPs = () => fetchWhitelistedIPs(whitelistPage + 1, true);

  const isFirstRenderWhitelist = useRef(true);
  useEffect(() => {
    if (isFirstRenderWhitelist.current) { isFirstRenderWhitelist.current = false; return; }
    const timeout = setTimeout(() => fetchWhitelistedIPs(1, false), 500);
    return () => clearTimeout(timeout);
  }, [whitelistedIPsSearchQuery]);

  const fetchDashboardAlerts = async (type, silent = false) => {
    if (!silent) setIsLoadingAlerts(true);
    const token = localStorage.getItem('token');
    try {
      let url = `http://localhost:5000/api/admin/hardware-alerts?page=1&limit=10`;
      if (type !== 'all') url += `&type=${type}`;
      const response = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
      if (response.ok) {
        const data = await response.json();
        setAlerts(data.alerts || (Array.isArray(data) ? data : []));
        setAlertPage(1);
        setTotalAlertPages(data.totalPages || 1);
        setTotalAlertsCount(data.totalAlerts || 0);
      }
    } catch(err) {
      console.error(err);
    } finally {
      if (!silent) setIsLoadingAlerts(false);
    }
  };

  const fetchAlertsPage = async (page, silent = false) => {
    if (!silent) setIsLoadingAlerts(true);
    const token = localStorage.getItem('token');
    if (isTokenExpired(token)) {
      handleLogout();
      return;
    }
    try {
      let url = `http://localhost:5000/api/admin/hardware-alerts?page=${page}&limit=10`;
      if (alertFilterType !== 'all') url += `&type=${alertFilterType}`;
      const response = await fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setAlerts(data.alerts || []);
        setAlertPage(data.currentPage);
        setTotalAlertPages(data.totalPages || 1);
        setTotalAlertsCount(data.totalAlerts || 0);
      }
    } catch (error) {
      console.error("Failed to load alerts page", error);
    } finally {
      if (!silent) setIsLoadingAlerts(false);
    }
  };

  useEffect(() => {
    const interval = setInterval(() => {
      fetchAlertsPage(alertPage, true);
    }, 30000);
    return () => clearInterval(interval);
  }, [alertPage, alertFilterType]);

  // Connect to real-time WebSockets
  useEffect(() => {
    if (!socket.connected) {
      socket.connect();
    }

    const onConnect = () => {
      console.log('✅ Connected to WebSocket server! Socket ID:', socket.id);
    };

    const onHardwareAlert = (newAlert) => {
      const formattedAlert = {
        _id: newAlert.id || newAlert._id,
        message: newAlert.message,
        type: newAlert.type,
        timeString: newAlert.time || newAlert.timeString,
        createdAt: newAlert.createdAt || new Date().toISOString(),
      };
      setAlerts(prevAlerts => {
        if (alertPageRef.current === 1) {
          return [formattedAlert, ...prevAlerts].slice(0, 10);
        }
        return prevAlerts;
      });
      setTotalAlertsCount(prev => prev + 1);
      if (!isHardwareAlertsExpandedRef.current) {
        setUnreadAlertsCount(prev => prev + 1);
      }
    };

    const onOccupancyUpdate = (data) => {
      setStats(prev => prev ? {
        ...prev,
        currentOccupancy: data.currentOccupancy,
        capacityPercentage: data.capacityPercentage,
      } : null);
    };

    const onTotalTicketsUpdate = (data) => {
      setStats(prev => prev ? {
        ...prev,
        totalTicketsSold: data.totalTicketsSold,
        purchasingUsers: data.purchasingUsers,
        mostSoldTicket: data.mostSoldTicket,
      } : null);
    };

    const onMonthlySalesUpdate = (newSalesData) => {
      if (!isSalesFilteredRef.current) {
        setMonthlySales(newSalesData);
      }
    };

    const onAuditLogUpdate = (newLog) => {
      setAuditLogs(prevLogs => [newLog, ...prevLogs]); // Prepend new logs instantly
      if (!isAuditLogsExpandedRef.current) {
        setUnreadAuditCount(prev => prev + 1);
      }
    };

    const onAuditLogsCleared = async (data) => {
      if (data && data.partial) {
        const token = localStorage.getItem('token');
        if (token) {
          try {
            const res = await fetch('http://localhost:5000/api/admin/audit-logs?page=1&limit=50', {
              headers: { 'Authorization': `Bearer ${token}` },
            });
            if (res.ok) {
              const json = await res.json();
              setAuditLogs(json.logs);
              setAuditLogPage(1);
              setAuditLogHasMore(json.currentPage < json.totalPages);
            }
          } catch (err) {
            console.error('Failed to refetch after partial clear', err);
          }
        }
      } else {
        setAuditLogs([]);
        setAuditLogHasMore(false);
        setAuditLogPage(1);
        setUnreadAuditCount(0);
      }
    };

    const onHardwareAlertsCleared = async (data) => {
      if (data && data.partial) {
        const token = localStorage.getItem('token');
        if (token) {
          try {
            const res = await fetch('http://localhost:5000/api/admin/hardware-alerts?page=1&limit=10', {
              headers: { 'Authorization': `Bearer ${token}` },
            });
            if (res.ok) {
              const json = await res.json();
              setAlerts(json.alerts || (Array.isArray(json) ? json : []));
              setAlertPage(1);
              setTotalAlertPages(json.totalPages || 1);
              setTotalAlertsCount(json.totalAlerts || 0);
            }
          } catch (err) {
            console.error('Failed to refetch hardware alerts after partial clear', err);
          }
        }
      } else {
        setAlerts([]);
        setTotalAlertPages(1);
        setTotalAlertsCount(0);
        setAlertPage(1);
        setUnreadAlertsCount(0);
      }
    };

    const onBannedIpAdded = (newBannedIp) => {
      setBannedIPs(prev => [newBannedIp, ...prev]);
      if (!isBannedIPsExpandedRef.current) {
        setUnreadBannedCount(prev => prev + 1);
      }
    };

    const onBannedIpRemoved = (removedId) => {
      setBannedIPs(prev => prev.filter(ip => ip._id !== removedId));
    };

    const onWhitelistIpAdded = (newIp) => {
      setWhitelistedIPs(prev => [newIp, ...prev]);
    };

    const onWhitelistIpRemoved = (removedId) => {
      setWhitelistedIPs(prev => prev.filter(ip => ip._id !== removedId));
    };

    const onSubAdminCreated = (newAdmin) => {
      if (!isSuperAdmin) return;
      setSubAdmins(prevUsers => [newAdmin, ...prevUsers]);
    };

    const onNewUserRegistered = (newUser) => {
      if (!isSuperAdmin && newUser.role === 'admin') return;

      if (newUser.role === 'admin') {
        setSubAdmins(prev => [newUser, ...prev]);
      } else {
        setRegularUsers(prev => [newUser, ...prev].slice(0, 10));
        setTotalUsersCount(prev => prev + 1);
        setStats(prev => prev ? {
          ...prev,
          activeUsers: (prev.activeUsers || 0) + 1
        } : null);
      }
    };

    const onUserStatusUpdate = ({ userId, isBlocked }) => {
      setRegularUsers(prev => prev.map(u => u._id === userId ? { ...u, isBlocked } : u));
      setSubAdmins(prev => prev.map(u => u._id === userId ? { ...u, isBlocked } : u));
    };

    const onUserDeleted = (deletedUserId) => {
      setRegularUsers(prev => prev.filter(u => u._id !== deletedUserId));
      setTotalUsersCount(prev => Math.max(prev - 1, 0));
      setStats(prev => prev ? {
        ...prev,
        activeUsers: Math.max((prev.activeUsers || 1) - 1, 0),
      } : null);
    };

    const onSubAdminDeleted = (deletedAdminId) => {
      setSubAdmins(prev => prev.filter(u => u._id !== deletedAdminId));
    };

    socket.on('connect', onConnect);
    socket.on('hardwareAlert', onHardwareAlert);
    socket.on('occupancyUpdate', onOccupancyUpdate);
    socket.on('totalTicketsUpdate', onTotalTicketsUpdate);
    socket.on('monthlySalesUpdate', onMonthlySalesUpdate);
    socket.on('auditLogUpdate', onAuditLogUpdate);
    socket.on('auditLogsCleared', onAuditLogsCleared);
    socket.on('hardwareAlertsCleared', onHardwareAlertsCleared);
    socket.on('bannedIpAdded', onBannedIpAdded);
    socket.on('bannedIpRemoved', onBannedIpRemoved);
    socket.on('whitelistIpAdded', onWhitelistIpAdded);
    socket.on('whitelistIpRemoved', onWhitelistIpRemoved);
    socket.on('subAdminCreated', onSubAdminCreated);
    socket.on('newUserRegistered', onNewUserRegistered);
    socket.on('userStatusUpdate', onUserStatusUpdate);
    socket.on('userDeleted', onUserDeleted);
    socket.on('subAdminDeleted', onSubAdminDeleted);

    return () => {
      // Only remove the listeners for this component, do not disconnect the socket
      socket.off('connect', onConnect);
      socket.off('hardwareAlert', onHardwareAlert);
      socket.off('occupancyUpdate', onOccupancyUpdate);
      socket.off('totalTicketsUpdate', onTotalTicketsUpdate);
      socket.off('monthlySalesUpdate', onMonthlySalesUpdate);
      socket.off('auditLogUpdate', onAuditLogUpdate);
      socket.off('auditLogsCleared', onAuditLogsCleared);
      socket.off('hardwareAlertsCleared', onHardwareAlertsCleared);
      socket.off('bannedIpAdded', onBannedIpAdded);
      socket.off('bannedIpRemoved', onBannedIpRemoved);
      socket.off('whitelistIpAdded', onWhitelistIpAdded);
      socket.off('whitelistIpRemoved', onWhitelistIpRemoved);
      socket.off('subAdminCreated', onSubAdminCreated);
      socket.off('newUserRegistered', onNewUserRegistered);
      socket.off('userStatusUpdate', onUserStatusUpdate);
      socket.off('userDeleted', onUserDeleted);
      socket.off('subAdminDeleted', onSubAdminDeleted);
    };
  }, []);

  const handleExportCSV = () => {
    if (auditLogs.length === 0) return;
    
    // Define CSV headers
    const headers = ['Date & Time', 'Email Attempted', 'Action', 'Status', 'Status Code', 'IP Address', 'User Agent'];
    const csvRows = [headers.join(',')];
    
    // Map data to rows
    auditLogs.forEach(log => {
      const row = [
        `"${new Date(log.createdAt).toLocaleString()}"`,
        `"${log.email}"`,
        `"${log.action || 'Authentication / System'}"`,
        `"${log.status}"`,
        `"${log.statusCode || ''}"`,
        `"${log.ipAddress}"`,
        `"${log.userAgent ? log.userAgent.replace(/"/g, '""') : 'Unknown'}"` // Escape internal quotes
      ];
      csvRows.push(row.join(','));
    });
    
    // Create and trigger download
    const csvString = csvRows.join('\n');
    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `smart-park-audit-logs-${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('role');
    localStorage.removeItem('adminEmail');
    navigate('/');
  };

  const fetchUsers = async (page = 1) => {
    const token = localStorage.getItem('token');
    if (isTokenExpired(token)) {
      handleLogout();
      return;
    }

    try {
      let url = `http://localhost:5000/api/admin/users?role=user&page=${page}&limit=10`;
      if (searchQuery) url += `&search=${encodeURIComponent(searchQuery)}`;
      if (filterStatus !== 'all') url += `&status=${filterStatus}`;
      
      const res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
      if (res.ok) {
        const data = await res.json();
        setRegularUsers(data.users || []);
        setTotalUserPages(data.totalPages || 1);
        setTotalUsersCount(data.totalUsers || 0);
        setUserPage(page);
      } else if (res.status === 401) {
        handleLogout();
      }
    } catch (error) {
      console.error(error);
    }
  };

  useEffect(() => {
    setUserPage(1);
  }, [searchQuery, filterStatus]);

  const isFirstRenderUsers = useRef(true);
  useEffect(() => {
    if (isFirstRenderUsers.current) { isFirstRenderUsers.current = false; return; }
    const timeout = setTimeout(() => {
      fetchUsers(userPage);
    }, 500);
    return () => clearTimeout(timeout);
  }, [userPage, searchQuery, filterStatus]);

  const handleExportUsersCSV = async () => {
    const token = localStorage.getItem('token');
    let url = `http://localhost:5000/api/admin/users?role=user&limit=10000`;
    if (searchQuery) url += `&search=${encodeURIComponent(searchQuery)}`;
    if (filterStatus !== 'all') url += `&status=${filterStatus}`;
    
    try {
      const res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
      const data = await res.json();
      const exportData = data.users || [];
      if (exportData.length === 0) return;
    
    const headers = ['Name', 'Email', 'Phone', 'Age', 'Role', 'Status', 'Has Disability'];
    const csvRows = [headers.join(',')];
    
    exportData.forEach(user => {
      const row = [
        `"${(user.name || '').replace(/"/g, '""')}"`,
        `"${(user.email || '').replace(/"/g, '""')}"`,
        `"${(user.phone || 'N/A').replace(/"/g, '""')}"`,
        `"${user.age || 'N/A'}"`,
        `"${user.role || 'user'}"`,
        `"${user.isBlocked ? 'Blocked' : 'Active'}"`,
        `"${user.hasDisability ? 'Yes' : 'No'}"`
      ];
      csvRows.push(row.join(','));
    });
    
    const csvString = csvRows.join('\n');
    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `smart-park-users-${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    } catch (e) { console.error('Export Error:', e); }
  };

  const handlePrevWeek = () => {
    setInsightStartDate(prev => {
      const newDate = new Date(prev);
      newDate.setDate(newDate.getDate() - 7);
      return newDate;
    });
  };

  const handleNextWeek = () => {
    setInsightStartDate(prev => {
      const newDate = new Date(prev);
      newDate.setDate(newDate.getDate() + 7);
      return newDate;
    });
  };

  const filteredAlerts = useMemo(() => alerts.filter(alert => {
    if (alertFilterType === 'all') return true;
    return alert.type === alertFilterType;
  }), [alerts, alertFilterType]);

  const handleExportBannedIPsCSV = async () => {
    const token = localStorage.getItem('token');
    let url = `http://localhost:5000/api/admin/banned-ips?limit=10000`;
    if (bannedIPsSearchQuery) url += `&search=${encodeURIComponent(bannedIPsSearchQuery)}`;
    try {
      const res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
      const data = await res.json();
      const exportData = data.bannedIPs || [];
      if (exportData.length === 0) return;
    
    const headers = ['IP Address', 'Reason', 'Date Banned'];
    const csvRows = [headers.join(',')];
    
    exportData.forEach(banned => {
      const row = [
        `"${banned.ipAddress || ''}"`,
        `"${banned.reason || ''}"`,
        `"${new Date(banned.createdAt).toLocaleString()}"`
      ];
      csvRows.push(row.join(','));
    });
    
    const csvString = csvRows.join('\n');
    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `smart-park-banned-ips-${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    } catch(e) { console.error('Export error:', e); }
  };

  const handleExportWhitelistedIPsCSV = async () => {
    const token = localStorage.getItem('token');
    let url = `http://localhost:5000/api/admin/whitelisted-ips?limit=10000`;
    if (whitelistedIPsSearchQuery) url += `&search=${encodeURIComponent(whitelistedIPsSearchQuery)}`;
    try {
      const res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
      const data = await res.json();
      const exportData = data.ips || [];
      if (exportData.length === 0) return;
    
    const headers = ['IP Address', 'Description', 'Added On'];
    const csvRows = [headers.join(',')];
    
    exportData.forEach(ip => {
      const row = [
        `"${ip.ipAddress || ''}"`,
        `"${ip.description ? ip.description.replace(/"/g, '""') : ''}"`,
        `"${new Date(ip.createdAt).toLocaleString()}"`
      ];
      csvRows.push(row.join(','));
    });
    
    const csvString = csvRows.join('\n');
    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `smart-park-whitelisted-ips-${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    } catch(e) { console.error('Export error:', e); }
  };

  const handleExportMonthlySalesCSV = () => {
    if (monthlySales.length === 0) return;
    
    const headers = ['Month', 'Total Tickets Sold', 'Revenue (EGP)'];
    const csvRows = [headers.join(',')];
    
    monthlySales.forEach(sale => {
      const row = [
        `"${sale.month}"`,
        `"${sale.totalTickets}"`,
        `"${sale.revenue}"`
      ];
      csvRows.push(row.join(','));
    });
    
    const csvString = csvRows.join('\n');
    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `smart-park-monthly-sales-${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportPromoCSV = () => {
    if (promoStats.length === 0) return;
    
    const headers = ['Promo Code', 'Times Used', 'Total Discount Provided (%)'];
    const csvRows = [headers.join(',')];
    
    promoStats.forEach(promo => {
      csvRows.push(`"${promo._id}","${promo.count}","${promo.totalDiscount}"`);
    });
    
    const csvString = csvRows.join('\n');
    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `smart-park-promo-stats-${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const maxMonthlySales = useMemo(() => Math.max(...monthlySales.map(s => s.totalTickets), 1), [monthlySales]);

  // Helper to determine the global collapse/expand state for the currently active tab
  const getTabExpansionState = () => {
    switch (activeTab) {
      case 'overview':
        return {
          canToggle: true,
          allExpanded: isCrowdInsightsExpanded && isMonthlySalesExpanded,
          toggle: (state) => {
            setIsCrowdInsightsExpanded(state);
            setIsMonthlySalesExpanded(state);
          }
        };
      case 'users':
        return {
          canToggle: true,
          allExpanded: isUserManagementExpanded && isPromoStatsExpanded,
          toggle: (state) => {
            setIsUserManagementExpanded(state);
            setIsPromoStatsExpanded(state);
          }
        };
      case 'access':
        if (!isSuperAdmin) return { canToggle: false };
        return {
          canToggle: true,
          allExpanded: isSubAdminProvisioningExpanded && isSubAdminsExpanded && isWhitelistExpanded,
          toggle: (state) => {
            setIsSubAdminProvisioningExpanded(state);
            setIsSubAdminsExpanded(state);
            setIsWhitelistExpanded(state);
          }
        };
      case 'security':
        if (!isSuperAdmin) return { canToggle: false };
        return {
          canToggle: true,
          allExpanded: isAuditLogsExpanded && isBannedIPsExpanded,
          toggle: (state) => {
            setIsAuditLogsExpanded(state);
            setIsBannedIPsExpanded(state);
          }
        };
      default:
        return { canToggle: false }; // Hardware and System Backup tabs don't have multiple collapsible panels
    }
  };

  const { canToggle, allExpanded, toggle: toggleAllPanels } = getTabExpansionState();

  return (
    <div className="min-h-screen bg-smart-bg dark:bg-black font-sans flex flex-col transition-colors duration-300">
      <AdminHeader 
        title="Admin Control Panel"
        subtitle={isSuperAdmin ? "Smart Park Ecosystem (Super Admin)" : "Smart Park Ecosystem (Sub-Admin)"}
        userName={localStorage.getItem('adminEmail')}
        unreadAlertsCount={unreadAlertsCount}
        unreadAuditCount={isSuperAdmin ? unreadAuditCount : 0}
        unreadBannedCount={isSuperAdmin ? unreadBannedCount : 0}
        onAlertsClick={() => {
          setActiveTab('hardware');
          setIsHardwareAlertsExpanded(true);
          setTimeout(() => {
            document.getElementById('hardware-alerts-panel')?.scrollIntoView({ behavior: 'smooth' });
          }, 100);
        }}
        onAuditClick={isSuperAdmin ? () => {
          setActiveTab('security');
          setIsAuditLogsExpanded(true);
          setTimeout(() => {
            document.getElementById('audit-logs-panel')?.scrollIntoView({ behavior: 'smooth' });
          }, 100);
        } : undefined}
        onBannedClick={isSuperAdmin ? () => {
          setActiveTab('security');
          setIsBannedIPsExpanded(true);
          setTimeout(() => {
            document.getElementById('banned-ips-panel')?.scrollIntoView({ behavior: 'smooth' });
          }, 100);
        } : undefined}
        onLogout={handleLogout}
      />

      <div className="flex flex-grow w-full max-w-[1600px] mx-auto">
        
        {/* Desktop Sidebar Navigation */}
        <aside className="hidden lg:flex flex-col w-80 p-8 flex-shrink-0">
          <div className="bg-white dark:bg-gray-800 rounded-[30px] p-5 shadow-2xl border border-smart-light/10 dark:border-gray-700 sticky top-8 flex flex-col space-y-2">
            <h3 className="text-[10px] font-black text-smart-gray dark:text-gray-500 uppercase tracking-widest mb-3 px-4 pt-2">Admin Modules</h3>
            {[
              { id: 'overview', label: 'Overview & Stats', icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z' },
              { id: 'users', label: 'Users & Promos', icon: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z' },
              { id: 'hardware', label: 'Gate & Hardware', icon: 'M13 10V3L4 14h7v7l9-11h-7z' },
              ...(isSuperAdmin ? [
                { id: 'access', label: 'Access Control', icon: 'M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z' },
                { id: 'security', label: 'Security Logs', icon: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z' },
                { id: 'system', label: 'System Backups', icon: 'M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01' }
              ] : [])
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center px-5 py-4 rounded-xl text-xs font-black uppercase tracking-widest w-full transition-all duration-300 ${activeTab === tab.id ? 'bg-smart-dark text-white shadow-lg transform scale-[1.02] dark:bg-smart-light dark:text-smart-dark' : 'bg-transparent text-smart-gray dark:text-gray-400 hover:bg-smart-light/10 dark:hover:bg-gray-700'}`}
              >
                <svg className="w-5 h-5 mr-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d={tab.icon}></path></svg>
                {tab.label}
              </button>
            ))}
          </div>
        </aside>

        <main className="flex-grow max-w-full lg:max-w-[calc(100%-20rem)] px-6 py-8 w-full">
          
          {/* Mobile Tab Navigation Menu */}
          <div className="lg:hidden flex flex-nowrap space-x-4 bg-white dark:bg-gray-800 p-3 rounded-3xl mb-8 overflow-x-auto border border-smart-light/20 shadow-xl scrollbar-hide">
          {[
            { id: 'overview', label: 'Overview & Stats', icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z' },
            { id: 'users', label: 'Users & Promos', icon: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z' },
            { id: 'hardware', label: 'Gate & Hardware', icon: 'M13 10V3L4 14h7v7l9-11h-7z' },
            ...(isSuperAdmin ? [
              { id: 'access', label: 'Access Control', icon: 'M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z' },
              { id: 'security', label: 'Security Logs', icon: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z' },
              { id: 'system', label: 'System Backups', icon: 'M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01' }
            ] : [])
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center flex-1 shrink-0 justify-center px-6 py-4 rounded-2xl text-xs font-black uppercase tracking-widest whitespace-nowrap transition-all duration-300 ${activeTab === tab.id ? 'bg-smart-light text-white shadow-lg transform -translate-y-1' : 'bg-transparent text-smart-gray dark:text-gray-400 hover:bg-smart-light/10 dark:hover:bg-gray-700'}`}
            >
              <svg className="w-5 h-5 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d={tab.icon}></path></svg>
              {tab.label}
            </button>
          ))}
          </div>

        {activeTab === 'overview' && (
        <>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-8 mb-10 animate-fade-in-up">
          
          {/* Circular Card 1 */}
          <div className="relative bg-white dark:bg-gray-800 rounded-full w-[250px] h-[250px] flex flex-col items-center justify-center p-6 shadow-[0_10px_40px_rgba(0,0,0,0.08)] dark:shadow-[0_10px_40px_rgba(0,0,0,0.4)] border-[10px] border-blue-500/20 hover:border-blue-500/40 transition-all transform hover:scale-105 mx-auto text-center group shrink-0">
            <div className="w-12 h-12 bg-blue-500/10 rounded-full flex items-center justify-center mb-3 text-blue-500 group-hover:bg-blue-500 group-hover:text-white transition-colors">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z"></path></svg>
            </div>
            <h3 className="text-smart-gray dark:text-gray-400 font-black text-[10px] uppercase tracking-widest mb-1">Total Tickets Sold</h3>
            {isLoadingStats ? (
              <span className="text-sm font-bold text-gray-400 animate-pulse">Analyzing...</span>
            ) : (
              <span className="text-4xl font-black text-smart-dark dark:text-white italic">{stats?.totalTicketsSold || 0}</span>
            )}
          </div>

          {/* Circular Card 2 */}
          <div className="relative bg-white dark:bg-gray-800 rounded-full w-[250px] h-[250px] flex flex-col items-center justify-center p-6 shadow-[0_10px_40px_rgba(0,0,0,0.08)] dark:shadow-[0_10px_40px_rgba(0,0,0,0.4)] mx-auto text-center transform transition-transform hover:scale-105 group shrink-0">
            <svg className="absolute inset-0 w-full h-full transform -rotate-90 pointer-events-none" viewBox="0 0 100 100">
              <circle cx="50" cy="50" r="46" fill="transparent" stroke="currentColor" strokeWidth="8" className="text-gray-100 dark:text-gray-700" />
              <circle cx="50" cy="50" r="46" fill="transparent" stroke="currentColor" strokeWidth="8" strokeDasharray="289" strokeDashoffset={289 - (289 * (stats?.capacityPercentage || 0)) / 100} strokeLinecap="round" className="text-smart-light transition-all duration-1000 ease-out" />
            </svg>
            <div className="w-12 h-12 bg-smart-light/10 rounded-full flex items-center justify-center mb-3 text-smart-light group-hover:bg-smart-light group-hover:text-white transition-colors z-10">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"></path></svg>
            </div>
            <h3 className="text-smart-gray dark:text-gray-400 font-black text-[10px] uppercase tracking-widest mb-1 z-10">Current Occupancy</h3>
            {isLoadingStats ? (
              <span className="text-sm font-bold text-gray-400 animate-pulse z-10">Analyzing...</span>
            ) : (
              <div className="flex flex-col items-center z-10">
                <span className="text-4xl font-black text-smart-light italic leading-none">{stats?.currentOccupancy || 0}</span>
                <span className="text-smart-gray dark:text-gray-500 font-bold text-xs uppercase tracking-widest mt-1">/ 200 Limit</span>
              </div>
            )}
          </div>

          {/* Circular Card 3 */}
          <div className="relative bg-white dark:bg-gray-800 rounded-full w-[250px] h-[250px] flex flex-col items-center justify-center p-6 shadow-[0_10px_40px_rgba(0,0,0,0.08)] dark:shadow-[0_10px_40px_rgba(0,0,0,0.4)] border-[10px] border-orange-500/20 hover:border-orange-500/40 transition-all transform hover:scale-105 mx-auto text-center group shrink-0">
            <div className="w-12 h-12 bg-orange-500/10 rounded-full flex items-center justify-center mb-3 text-orange-500 group-hover:bg-orange-500 group-hover:text-white transition-colors">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
            </div>
            <h3 className="text-smart-gray dark:text-gray-400 font-black text-[10px] uppercase tracking-widest mb-1">Most Sold Ticket</h3>
            {isLoadingStats ? (
              <span className="text-sm font-bold text-gray-400 animate-pulse">Analyzing...</span>
            ) : (
              <span className="text-lg font-black text-smart-dark dark:text-white uppercase italic leading-tight px-2">{stats?.mostSoldTicket || 'N/A'}</span>
            )}
          </div>

          {/* Circular Card 4 */}
          <div className="relative bg-white dark:bg-gray-800 rounded-full w-[250px] h-[250px] flex flex-col items-center justify-center p-6 shadow-[0_10px_40px_rgba(0,0,0,0.08)] dark:shadow-[0_10px_40px_rgba(0,0,0,0.4)] mx-auto text-center transform transition-transform hover:scale-105 group shrink-0">
            <svg className="absolute inset-0 w-full h-full transform -rotate-90 pointer-events-none" viewBox="0 0 100 100">
              <circle cx="50" cy="50" r="46" fill="transparent" stroke="currentColor" strokeWidth="8" className="text-gray-100 dark:text-gray-700" />
              <circle cx="50" cy="50" r="46" fill="transparent" stroke="currentColor" strokeWidth="8" strokeDasharray="289" strokeDashoffset={289 - (289 * (stats?.activeUsers ? (stats.purchasingUsers / stats.activeUsers) : 0))} strokeLinecap="round" className="text-smart-glow transition-all duration-1000 ease-out" />
            </svg>
            <div className="w-12 h-12 bg-smart-glow/10 rounded-full flex items-center justify-center mb-3 text-smart-glow group-hover:bg-smart-glow group-hover:text-white transition-colors z-10">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"></path></svg>
            </div>
            <h3 className="text-smart-gray dark:text-gray-400 font-black text-[10px] uppercase tracking-widest mb-1 z-10">User Statistics</h3>
            {isLoadingStats ? (
              <span className="text-sm font-bold text-gray-400 animate-pulse z-10">Analyzing...</span>
            ) : (
              <div className="flex flex-col items-center z-10">
                <span className="text-4xl font-black text-smart-dark dark:text-white italic leading-none">{stats?.purchasingUsers || 0}</span>
                <span className="text-smart-gray dark:text-gray-500 font-bold text-xs uppercase tracking-widest mt-1">of {stats?.activeUsers || 0} Total</span>
              </div>
            )}
          </div>

        </div>

        {/* Admin Quick Actions Row */}
        {isSuperAdmin && !isLoadingStats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10 animate-fade-in-up">
              <button onClick={handleResetOccupancy} className="py-4 bg-red-600 hover:bg-red-700 text-white text-[10px] font-black uppercase tracking-widest rounded-3xl transition-all shadow-lg hover:shadow-red-900/40 active:scale-95 flex flex-col items-center justify-center gap-2">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
                  Reset Occupancy
              </button>
              <button onClick={handleGenerateDummyTickets} className="py-4 bg-smart-light hover:bg-smart-dark text-white text-[10px] font-black uppercase tracking-widest rounded-3xl transition-all shadow-lg hover:shadow-smart-light/40 active:scale-95 flex flex-col items-center justify-center gap-2">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"></path></svg>
                  Generate Data
              </button>
              <button onClick={handleClearDummyData} className="py-4 bg-gray-600 hover:bg-gray-700 text-white text-[10px] font-black uppercase tracking-widest rounded-3xl transition-all shadow-lg hover:shadow-gray-900/40 active:scale-95 flex flex-col items-center justify-center gap-2">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                  Clear Data
              </button>
              <button onClick={handleBackupDatabase} className="py-4 bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-black uppercase tracking-widest rounded-3xl transition-all shadow-lg hover:shadow-blue-900/40 active:scale-95 flex flex-col items-center justify-center gap-2">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4"></path></svg>
                  Backup DB
              </button>
          </div>
        )}
        </>
        )}

        {canToggle && (
          <div className="flex justify-end mb-6 animate-fade-in-up">
            <button
              onClick={() => toggleAllPanels(!allExpanded)}
              className="flex items-center px-4 py-2 bg-white dark:bg-gray-800 border border-smart-light/20 rounded-xl text-[10px] font-black uppercase tracking-widest text-smart-gray dark:text-gray-400 hover:text-smart-dark dark:hover:text-white hover:border-smart-light/40 transition-all shadow-sm active:scale-95"
            >
              <span>{allExpanded ? 'Collapse All Panels' : 'Expand All Panels'}</span>
              <svg className={`w-4 h-4 ml-2 transform transition-transform duration-300 ${allExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
            </button>
          </div>
        )}

        {/* Crowd Insights Panel */}
        {activeTab === 'overview' && (
        <div className={`mb-10 bg-white dark:bg-gray-800 rounded-[40px] shadow-2xl border border-smart-light/10 dark:border-gray-700 overflow-hidden transition-all duration-300 ${isCrowdInsightsExpanded ? 'h-auto' : ''}`}>
          <div 
            className="bg-smart-bg dark:bg-gray-900 px-8 py-6 border-b border-smart-light/10 flex justify-between items-center cursor-pointer hover:bg-smart-bg/80 dark:hover:bg-gray-800 transition-colors"
            onClick={() => setIsCrowdInsightsExpanded(!isCrowdInsightsExpanded)}
          >
            <h2 className="text-xl font-black text-smart-dark dark:text-white flex items-center tracking-tighter uppercase italic select-none">
              <svg className="w-6 h-6 mr-3 text-smart-light" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"></path>
              </svg>
              Crowd Insights Window
            </h2>
            <div className="flex items-center space-x-6">
              <div className="flex items-center space-x-2">
                <button onClick={(e) => { e.stopPropagation(); handlePrevWeek(); }} className="px-3 py-1.5 bg-smart-bg dark:bg-gray-800 rounded-lg text-xs font-bold hover:bg-smart-light/20 transition-colors">
                  &larr; Prev 7 Days
                </button>
                <button onClick={(e) => { e.stopPropagation(); setInsightStartDate(new Date()); }} className="px-3 py-1.5 bg-smart-light text-white rounded-lg text-xs font-bold hover:bg-smart-dark transition-colors shadow-sm">
                  Today
                </button>
                <button onClick={(e) => { e.stopPropagation(); handleNextWeek(); }} className="px-3 py-1.5 bg-smart-bg dark:bg-gray-800 rounded-lg text-xs font-bold hover:bg-smart-light/20 transition-colors">
                  Next 7 Days &rarr;
                </button>
              </div>
              <svg className={`w-6 h-6 text-smart-gray dark:text-gray-400 transform transition-transform duration-300 ${isCrowdInsightsExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
            </div>
          </div>
          {isCrowdInsightsExpanded && (
            <WidgetErrorBoundary>
            <div className="p-8">
              {loadingInsights ? (
                <div className="flex justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-smart-light"></div>
                </div>
              ) : insights ? (
                <>
                  <div className="grid grid-cols-7 gap-4 mb-6">
                    {insights.days.map((day, index) => (
                      <div 
                        key={index} 
                        className={`p-4 rounded-2xl text-center ${day.isToday ? 'ring-2 ring-smart-light bg-smart-light/5' : 'bg-smart-bg/30 dark:bg-gray-900/50'}`}
                      >
                        <div className="text-xs font-black text-gray-500 dark:text-gray-400 mb-2">{day.dayName}</div>
                        <div className={`w-full h-12 rounded-xl flex items-center justify-center ${day.crowdLevel === 'quiet' ? 'bg-green-100 dark:bg-green-900/30' : day.crowdLevel === 'moderate' ? 'bg-yellow-100 dark:bg-yellow-900/30' : 'bg-red-100 dark:bg-red-900/30'}`}>
                          <span className={`text-lg font-black ${day.crowdLevel === 'quiet' ? 'text-green-600' : day.crowdLevel === 'moderate' ? 'text-yellow-600' : 'text-red-600'}`}>
                            {day.count}
                          </span>
                        </div>
                        <div className={`text-xs font-black mt-2 ${day.crowdLevel === 'quiet' ? 'text-green-600' : day.crowdLevel === 'moderate' ? 'text-yellow-600' : 'text-red-600'}`}>
                          {day.crowdLevel === 'quiet' ? '🟢 Quiet' : day.crowdLevel === 'moderate' ? '🟡 Moderate' : '🔴 Busy'}
                        </div>
                        <div className="text-[10px] text-gray-400 dark:text-gray-500 mt-1">{day.displayDate}</div>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center justify-center gap-8 text-xs">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-green-500"></div>
                      <span className="text-gray-500 dark:text-gray-400">Quiet (0-30%)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                      <span className="text-gray-500 dark:text-gray-400">Moderate (31-70%)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-red-500"></div>
                      <span className="text-gray-500 dark:text-gray-400">Busy (71-100%)</span>
                    </div>
                    <div className="text-gray-400 dark:text-gray-500">
                      Daily Capacity: {insights.capacity}
                    </div>
                  </div>
                </>
              ) : (
                <div className="py-8 flex flex-col items-center justify-center text-smart-gray dark:text-gray-500 font-black uppercase tracking-widest text-xs">
                  <p className="mb-4">Failed to load crowd insights.</p>
                  <button onClick={fetchInsights} className="px-6 py-2.5 bg-smart-light/10 hover:bg-smart-light/20 text-smart-light rounded-xl transition-colors">
                    Retry Connection
                  </button>
                </div>
              )}
            </div>
            </WidgetErrorBoundary>
          )}
        </div>
        )}

        {/* Monthly Sales History Panel */}
        {activeTab === 'overview' && (
        <div className={`mb-10 bg-white dark:bg-gray-800 rounded-[40px] shadow-2xl border border-smart-light/10 dark:border-gray-700 overflow-hidden transition-all duration-300 ${isMonthlySalesExpanded ? 'h-auto' : ''}`}>
          <div 
            className="bg-smart-bg dark:bg-gray-900 px-8 py-6 border-b border-smart-light/10 flex justify-between items-center cursor-pointer hover:bg-smart-bg/80 dark:hover:bg-gray-800 transition-colors"
            onClick={() => setIsMonthlySalesExpanded(!isMonthlySalesExpanded)}
          >
            <h2 className="text-xl font-black text-smart-dark dark:text-white flex items-center tracking-tighter uppercase italic select-none">
              <svg className="w-6 h-6 mr-3 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path></svg>
              Historical Ticket Sales
            </h2>
            <div className="flex items-center text-smart-gray dark:text-gray-400">
              <button 
                onClick={(e) => { e.stopPropagation(); handleExportMonthlySalesCSV(); }} 
                className="hidden sm:flex items-center mr-4 px-3 py-1.5 bg-smart-light/10 hover:bg-smart-light/20 text-smart-light rounded-lg text-[10px] font-bold uppercase tracking-widest transition-colors border border-smart-light/20"
                disabled={monthlySales.length === 0}
              >
                <svg className="w-3 h-3 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
                Export CSV
              </button>
              <svg className={`w-6 h-6 transform transition-transform duration-300 ${isMonthlySalesExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
            </div>
          </div>
          
          {isMonthlySalesExpanded && (
            <WidgetErrorBoundary>
            <>
              <div className="bg-smart-bg/30 dark:bg-gray-900/30 px-8 py-5 border-b border-smart-light/10 flex flex-col md:flex-row gap-4 justify-between items-center">
                <div className="flex items-center space-x-3 w-full md:w-auto">
                  <span className="text-[10px] font-black text-smart-gray dark:text-gray-400 uppercase tracking-widest hidden sm:block">Filter Period:</span>
                  <input 
                    type="month"
                    value={salesStartDate}
                    onChange={(e) => setSalesStartDate(e.target.value)}
                    className="px-4 py-2 rounded-xl border-2 border-smart-light/20 bg-white dark:bg-gray-800 text-smart-dark dark:text-white focus:ring-2 focus:ring-smart-light/50 outline-none transition font-mono text-[10px] font-black tracking-widest cursor-pointer"
                  />
                  <span className="text-[10px] font-black text-smart-gray dark:text-gray-400 uppercase tracking-widest">to</span>
                  <input 
                    type="month"
                    value={salesEndDate}
                    onChange={(e) => setSalesEndDate(e.target.value)}
                    className="px-4 py-2 rounded-xl border-2 border-smart-light/20 bg-white dark:bg-gray-800 text-smart-dark dark:text-white focus:ring-2 focus:ring-smart-light/50 outline-none transition font-mono text-[10px] font-black tracking-widest cursor-pointer"
                  />
                  {(salesStartDate || salesEndDate) && (
                    <button onClick={() => { setSalesStartDate(''); setSalesEndDate(''); }} className="px-4 py-2 bg-red-50 dark:bg-red-900/30 hover:bg-red-100 dark:hover:bg-red-900/50 text-red-600 dark:text-red-400 rounded-xl font-bold text-[10px] uppercase tracking-widest transition-colors border border-red-200 dark:border-red-800">Clear</button>
                  )}
                </div>
              </div>

              {monthlySales.length > 0 ? (
                <div className="p-8 overflow-x-auto">
                  <div className="flex items-end justify-between space-x-4 min-w-[600px] h-64 mt-4 mb-4 border-b-2 border-smart-light/20 pb-4">
                    {monthlySales.map((sale, index) => {
                      const heightPercent = Math.max((sale.totalTickets / maxMonthlySales) * 100, 5);
                      return (
                        <div key={index} className="flex flex-col items-center justify-end w-full h-full group relative">
                          <div className="absolute -top-12 opacity-0 group-hover:opacity-100 transition-opacity text-center bg-smart-dark text-white text-[10px] font-bold px-2 py-1 rounded shadow-lg whitespace-nowrap z-10 pointer-events-none">
                            {sale.totalTickets} Tickets<br/>
                            {sale.revenue} EGP
                          </div>
                          <div className="w-full max-w-[50px] bg-smart-light/20 group-hover:bg-smart-light transition-colors rounded-t-xl relative border border-smart-light/30" style={{ height: `${heightPercent}%` }}>
                            <div className="absolute bottom-0 w-full h-1/3 bg-gradient-to-t from-smart-light/50 to-transparent rounded-t-xl"></div>
                          </div>
                          <div className="absolute -bottom-10 text-[10px] font-black text-smart-gray dark:text-gray-400 uppercase tracking-tighter text-center w-full">
                            {sale.month.split(' ')[0]}<br/>{sale.month.split(' ')[1]}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="p-12 text-center text-smart-gray dark:text-gray-500 font-black uppercase tracking-widest">No sales data available.</div>
              )}
            </>
            </WidgetErrorBoundary>
          )}
        </div>
        )}

        {activeTab === 'users' && (
        <div className="mb-10 bg-white dark:bg-gray-800 rounded-[40px] shadow-2xl border border-smart-light/10 dark:border-gray-700 overflow-hidden transition-all duration-300">
          <div 
            className="bg-smart-bg dark:bg-gray-900 px-8 py-6 border-b border-smart-light/10 flex justify-between items-center cursor-pointer hover:bg-smart-bg/80 dark:hover:bg-gray-800 transition-colors"
            onClick={() => setIsUserManagementExpanded(!isUserManagementExpanded)}
          >
            <h2 className="text-xl font-black text-smart-dark dark:text-white flex items-center tracking-tighter uppercase italic select-none">
              <svg className="w-6 h-6 mr-3 text-smart-light" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"></path></svg>
              User Management
            </h2>
            <div className="flex items-center text-smart-gray dark:text-gray-400">
              <button 
                onClick={(e) => { e.stopPropagation(); handleExportUsersCSV(); }} 
                className="hidden sm:flex items-center mr-4 px-3 py-1.5 bg-smart-light/10 hover:bg-smart-light/20 text-smart-light rounded-lg text-[10px] font-bold uppercase tracking-widest transition-colors border border-smart-light/20"
                disabled={totalUsersCount === 0}
              >
                <svg className="w-3 h-3 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
                Export CSV
              </button>
              <span className="text-xs font-bold mr-4 uppercase tracking-widest">{totalUsersCount} Total Users</span>
              <svg className={`w-6 h-6 transform transition-transform duration-300 ${isUserManagementExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
            </div>
          </div>
          
          {isUserManagementExpanded && (
            <>
              {/* Filters and Search Bar */}
              <div className="bg-smart-bg/30 dark:bg-gray-900/30 px-8 py-5 border-b border-smart-light/10 flex flex-col md:flex-row gap-4 justify-between items-center">
                <div className="relative w-full md:max-w-md">
                  <input
                    type="text"
                    placeholder="SEARCH BY NAME OR EMAIL..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-11 pr-4 py-3 rounded-2xl border-2 border-smart-light/20 bg-white dark:bg-gray-800 text-smart-dark dark:text-white focus:ring-4 focus:ring-smart-light/20 focus:border-smart-light outline-none transition font-mono text-xs font-black tracking-widest"
                  />
                  <svg className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-smart-light/60" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
                </div>
                <div className="w-full md:w-auto">
                  <select 
                    value={filterStatus}
                    onChange={(e) => setFilterStatus(e.target.value)}
                    className="w-full md:w-auto px-5 py-3 rounded-2xl border-2 border-smart-light/20 bg-white dark:bg-gray-800 text-smart-dark dark:text-white focus:ring-4 focus:ring-smart-light/20 focus:border-smart-light outline-none transition font-mono text-xs font-black tracking-widest cursor-pointer"
                  >
                    <option value="all">ALL STATUSES</option>
                    <option value="active">ACTIVE USERS</option>
                    <option value="blocked">BLOCKED USERS</option>
                  </select>
                </div>
              </div>

              <div className="overflow-x-auto overflow-y-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-smart-bg dark:bg-gray-900 border-b border-smart-light/10 text-smart-gray dark:text-gray-500 text-[10px] font-black uppercase tracking-widest">
                      <th className="px-4 py-3 pl-6">Name</th>
                      <th className="px-4 py-3">Email</th>
                      <th className="px-4 py-3 text-center">Security Status</th>
                      <th className="px-4 py-3 pr-6 text-right">Access Control</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-smart-bg dark:divide-gray-700">
                    {regularUsers.map(user => (
                      <tr key={user._id} className="hover:bg-smart-bg/50 dark:hover:bg-gray-700/50 transition-colors">
                        <td className="px-4 py-3 pl-6 font-black text-smart-dark dark:text-white italic capitalize">{user.name}</td>
                        <td className="px-4 py-3 text-smart-gray dark:text-gray-400 font-medium">{user.email}</td>
                        <td className="px-4 py-3 text-center">
                          {user.isBlocked ? (
                            <span className="bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-400 text-[10px] font-black px-4 py-1.5 rounded-full uppercase tracking-widest border border-red-200 dark:border-red-800">Blocked</span>
                          ) : (
                            <span className="bg-smart-light/10 dark:bg-smart-light/20 text-smart-dark dark:text-smart-glow text-[10px] font-black px-4 py-1.5 rounded-full uppercase tracking-widest border border-smart-light/20">Active</span>
                          )}
                        </td>
                        <td className="px-4 py-3 pr-6 text-right">
                          <div className="flex justify-end items-center space-x-2">
                            <button
                              onClick={() => handleBlockUser(user._id, user.isBlocked)}
                              className={`px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${user.isBlocked ? 'bg-smart-light text-white hover:bg-smart-dark shadow-md' : 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 hover:bg-red-600 hover:text-white border border-red-200 dark:border-red-800 shadow-sm'}`}
                            >
                              {user.isBlocked ? 'Unblock' : 'Restrict'}
                            </button>
                            {isSuperAdmin && (
                              <button
                                onClick={() => handleDeleteUser(user._id)}
                                className="px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/20 shadow-sm"
                              >
                                Delete
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                    {regularUsers.length === 0 && (
                      <tr>
                        <td colSpan="4" className="p-8 text-center text-smart-gray dark:text-gray-500 font-black uppercase tracking-widest text-[10px]">No users found matching your criteria.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination Controls */}
              {totalUserPages > 1 && (
                <div className="bg-smart-bg/30 dark:bg-gray-900/30 px-8 py-4 border-t border-smart-light/10 flex justify-between items-center">
                  <span className="text-[10px] font-bold text-smart-gray dark:text-gray-400 uppercase tracking-widest hidden sm:inline">
                    Showing {(userPage - 1) * 10 + 1} to {Math.min(userPage * 10, totalUsersCount)} of {totalUsersCount}
                  </span>
                  <div className="flex space-x-2 ml-auto sm:ml-0">
                    <button
                      onClick={() => setUserPage(p => Math.max(1, p - 1))}
                      disabled={userPage === 1}
                      className="px-4 py-2 bg-white dark:bg-gray-800 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors border border-smart-light/20 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-smart-light/10"
                    >
                      Prev
                    </button>
                    <span className="px-4 py-2 text-[10px] font-black uppercase tracking-widest text-smart-dark dark:text-white flex items-center">
                      Page {userPage} of {totalUserPages}
                    </span>
                    <button
                      onClick={() => setUserPage(p => Math.min(totalUserPages, p + 1))}
                      disabled={userPage >= totalUserPages}
                      className="px-4 py-2 bg-white dark:bg-gray-800 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors border border-smart-light/20 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-smart-light/10"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
        )}

        {/* Sub-Admin Provisioning Panel */}
        {activeTab === 'access' && isSuperAdmin && (
        <div className={`mb-10 bg-white dark:bg-gray-800 rounded-[40px] shadow-2xl border border-smart-light/10 dark:border-gray-700 overflow-hidden transition-all duration-300 ${isSubAdminProvisioningExpanded ? 'h-auto flex flex-col' : ''}`}>
          <div 
            className="bg-smart-bg dark:bg-gray-900 px-8 py-6 border-b border-smart-light/10 flex justify-between items-center cursor-pointer hover:bg-smart-bg/80 dark:hover:bg-gray-800 transition-colors"
            onClick={() => setIsSubAdminProvisioningExpanded(!isSubAdminProvisioningExpanded)}
          >
            <h2 className="text-xl font-black text-smart-dark dark:text-white flex items-center tracking-tighter uppercase italic select-none">
              <svg className="w-6 h-6 mr-3 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"></path></svg>
              Sub-Admin Provisioning
            </h2>
            <div className="flex items-center text-smart-gray dark:text-gray-400">
              <svg className={`w-6 h-6 transform transition-transform duration-300 ${isSubAdminProvisioningExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
            </div>
          </div>
          
          {isSubAdminProvisioningExpanded && (
            <div className="p-8 bg-smart-bg/10 dark:bg-gray-900/10">
              <form onSubmit={handleCreateSubAdmin} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div>
                    <label className="block text-[10px] font-black text-smart-gray dark:text-gray-400 uppercase tracking-widest mb-2">Full Name</label>
                    <input 
                      type="text" 
                      placeholder="e.g. John Doe" 
                      value={newAdminName}
                      onChange={(e) => setNewAdminName(e.target.value)}
                      className="w-full px-4 py-3 rounded-xl border-2 border-smart-light/20 bg-white dark:bg-gray-800 text-smart-dark dark:text-white focus:ring-2 focus:ring-smart-light/50 outline-none font-mono text-sm"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-smart-gray dark:text-gray-400 uppercase tracking-widest mb-2">Email Address</label>
                    <input 
                      type="email" 
                      placeholder="e.g. john@smartpark.com" 
                      value={newAdminEmail}
                      onChange={(e) => setNewAdminEmail(e.target.value)}
                      className="w-full px-4 py-3 rounded-xl border-2 border-smart-light/20 bg-white dark:bg-gray-800 text-smart-dark dark:text-white focus:ring-2 focus:ring-smart-light/50 outline-none font-mono text-sm"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-smart-gray dark:text-gray-400 uppercase tracking-widest mb-2">Temporary Password</label>
                    <input 
                      type="password" 
                      placeholder="Enter password..." 
                      value={newAdminPassword}
                      onChange={(e) => setNewAdminPassword(e.target.value)}
                      className="w-full px-4 py-3 rounded-xl border-2 border-smart-light/20 bg-white dark:bg-gray-800 text-smart-dark dark:text-white focus:ring-2 focus:ring-smart-light/50 outline-none font-mono text-sm"
                      required
                    />
                  </div>
                </div>
                
                <div className="p-6 rounded-2xl bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800/30">
                  <h3 className="text-xs font-black text-blue-800 dark:text-blue-400 uppercase tracking-widest mb-4 flex items-center">
                    <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"></path></svg>
                    Network Binding (Required)
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-[10px] font-black text-smart-gray dark:text-gray-400 uppercase tracking-widest mb-2">Bound IP Address</label>
                      <input 
                        type="text" 
                        placeholder="e.g. 192.168.1.50" 
                        value={newAdminIp}
                        onChange={(e) => setNewAdminIp(e.target.value)}
                        className="w-full px-4 py-3 rounded-xl border-2 border-smart-light/20 bg-white dark:bg-gray-800 text-smart-dark dark:text-white focus:ring-2 focus:ring-smart-light/50 outline-none font-mono text-sm"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-black text-smart-gray dark:text-gray-400 uppercase tracking-widest mb-2">Bound MAC Address (Optional)</label>
                      <input 
                        type="text" 
                        placeholder="e.g. 00:1B:44:11:3A:B7" 
                        value={newAdminMac}
                        onChange={(e) => setNewAdminMac(e.target.value)}
                        className="w-full px-4 py-3 rounded-xl border-2 border-smart-light/20 bg-white dark:bg-gray-800 text-smart-dark dark:text-white focus:ring-2 focus:ring-smart-light/50 outline-none font-mono text-sm"
                      />
                    </div>
                  </div>
                  <p className="text-[10px] font-bold text-smart-gray dark:text-gray-500 mt-4 leading-relaxed">
                    This Sub-Admin will be permanently restricted to logging in from the specified IP address. Any attempt to log in from a different location will trigger a critical security alert and immediately block the connection.
                  </p>
                </div>

                <div className="flex justify-end pt-2">
                  <button type="submit" className="px-8 py-3 bg-purple-500 hover:bg-purple-600 text-white rounded-xl font-black uppercase tracking-widest text-[11px] shadow-lg transition-all transform hover:-translate-y-0.5">
                    Provision Sub-Admin
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
        )}

        {/* Security Audit Logs Panel */}
        {activeTab === 'security' && isSuperAdmin && (
        <div id="audit-logs-panel" className={`mb-10 bg-white dark:bg-gray-800 rounded-[40px] shadow-2xl border border-smart-light/10 dark:border-gray-700 overflow-hidden transition-all duration-300 ${isAuditLogsExpanded ? 'h-auto max-h-[800px] flex flex-col' : ''}`}>
          <div 
            className="bg-smart-bg dark:bg-gray-900 px-8 py-6 border-b border-smart-light/10 flex justify-between items-center cursor-pointer hover:bg-smart-bg/80 dark:hover:bg-gray-800 transition-colors"
            onClick={() => setIsAuditLogsExpanded(!isAuditLogsExpanded)}
          >
            <h2 className="text-xl font-black text-smart-dark dark:text-white flex items-center tracking-tighter uppercase italic select-none">
              <svg className="w-6 h-6 mr-3 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"></path></svg>
              Security Audit Logs
            </h2>
            <div className="flex items-center text-smart-gray dark:text-gray-400">
              <button 
                onClick={(e) => { e.stopPropagation(); handleClearAuditLogs(30); }} 
                className="hidden sm:flex items-center mr-2 px-3 py-1.5 bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-500 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-colors border border-yellow-500/20"
                disabled={auditLogs.length === 0}
              >
                <svg className="w-3 h-3 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                Clear &gt; 30 Days
              </button>
              <button 
                onClick={(e) => { e.stopPropagation(); handleClearAuditLogs(null); }} 
                className="hidden sm:flex items-center mr-2 px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-colors border border-red-500/20"
                disabled={auditLogs.length === 0}
              >
                <svg className="w-3 h-3 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                Clear All
              </button>
              <button 
                onClick={(e) => { e.stopPropagation(); handleExportCSV(); }} 
                className="hidden sm:flex items-center mr-4 px-3 py-1.5 bg-smart-light/10 hover:bg-smart-light/20 text-smart-light rounded-lg text-[10px] font-bold uppercase tracking-widest transition-colors border border-smart-light/20"
                disabled={auditLogs.length === 0}
              >
                <svg className="w-3 h-3 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
                Export CSV
              </button>
              <span className="text-xs font-bold mr-4 uppercase tracking-widest">{auditLogs.length} Records</span>
              <svg className={`w-6 h-6 transform transition-transform duration-300 ${isAuditLogsExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
            </div>
          </div>
          
          {isAuditLogsExpanded && (
            <div className="overflow-y-auto overflow-x-auto flex-grow">
              <table className="w-full text-left border-collapse">
                <thead className="sticky top-0 bg-smart-bg dark:bg-gray-900 z-10">
                  <tr className="border-b border-smart-light/10 text-smart-gray dark:text-gray-500 text-[10px] font-black uppercase tracking-widest">
                    <th className="px-4 py-3 pl-6">Date & Time</th>
                    <th className="px-4 py-3">Email Attempted</th>
                    <th className="px-4 py-3">Action / Details</th>
                    <th className="px-4 py-3 text-center">Status</th>
                    <th className="px-4 py-3 text-center">IP Address</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-smart-bg dark:divide-gray-700">
                  {auditLogs.map(log => (
                    <tr key={log._id} className="hover:bg-smart-bg/50 dark:hover:bg-gray-700/50 transition-colors">
                      <td className="px-4 py-3 pl-6 text-[11px] font-bold text-smart-gray dark:text-gray-400">
                        {new Date(log.createdAt).toLocaleString()}
                      </td>
                      <td className="px-4 py-3 font-black text-smart-dark dark:text-white italic">{log.email}</td>
                      <td className="px-4 py-3 font-medium text-smart-dark dark:text-gray-300">{log.action || 'Authentication / System'}</td>
                      <td className="px-4 py-3 text-center">
                        {log.status === 'success' ? (
                          <span className="bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400 text-[10px] font-black px-4 py-1.5 rounded-full uppercase tracking-widest border border-green-200 dark:border-green-800">Success</span>
                        ) : (
                          <span className="bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-400 text-[10px] font-black px-4 py-1.5 rounded-full uppercase tracking-widest border border-red-200 dark:border-red-800">Failed ({log.statusCode})</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center font-mono text-[10px] text-smart-gray dark:text-gray-500">{log.ipAddress}</td>
                    </tr>
                  ))}
                  {auditLogs.length === 0 && (
                    <tr>
                      <td colSpan="4" className="p-8 text-center text-smart-gray dark:text-gray-500 font-black uppercase tracking-widest text-[10px]">No audit logs found.</td>
                    </tr>
                  )}
                </tbody>
              </table>
              
              {auditLogHasMore && (
                <div className="flex justify-center p-4 bg-smart-bg dark:bg-gray-900 border-t border-smart-light/10">
                  <button 
                    onClick={handleLoadMoreAuditLogs}
                    disabled={isLoadingAuditLogs}
                    className="px-6 py-2.5 bg-smart-light/10 hover:bg-smart-light/20 text-smart-dark dark:text-white font-black text-[10px] uppercase tracking-widest rounded-xl transition-colors border border-smart-light/20"
                  >
                    {isLoadingAuditLogs ? 'Loading...' : 'Load Older Logs'}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
        )}

        {/* Banned IP Addresses Panel */}
        {activeTab === 'security' && isSuperAdmin && (
        <div id="banned-ips-panel" className={`mb-10 bg-white dark:bg-gray-800 rounded-[40px] shadow-2xl border border-smart-light/10 dark:border-gray-700 overflow-hidden transition-all duration-300 ${isBannedIPsExpanded ? 'h-auto max-h-[800px] flex flex-col' : ''}`}>
          <div 
            className="bg-smart-bg dark:bg-gray-900 px-8 py-6 border-b border-smart-light/10 flex justify-between items-center cursor-pointer hover:bg-smart-bg/80 dark:hover:bg-gray-800 transition-colors"
            onClick={() => setIsBannedIPsExpanded(!isBannedIPsExpanded)}
          >
            <h2 className="text-xl font-black text-smart-dark dark:text-white flex items-center tracking-tighter uppercase italic select-none">
              <svg className="w-6 h-6 mr-3 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
              Banned IP Addresses
            </h2>
            <div className="flex items-center text-smart-gray dark:text-gray-400">
              <button 
                onClick={(e) => { e.stopPropagation(); handleExportBannedIPsCSV(); }} 
                className="hidden sm:flex items-center mr-4 px-3 py-1.5 bg-smart-light/10 hover:bg-smart-light/20 text-smart-light rounded-lg text-[10px] font-bold uppercase tracking-widest transition-colors border border-smart-light/20"
                disabled={totalBannedIPs === 0}
              >
                <svg className="w-3 h-3 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
                Export CSV
              </button>
              <span className="text-xs font-bold mr-4 uppercase tracking-widest">{totalBannedIPs} Banned</span>
              <svg className={`w-6 h-6 transform transition-transform duration-300 ${isBannedIPsExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
            </div>
          </div>
          
          {isBannedIPsExpanded && (
            <div className="flex flex-col h-full overflow-hidden">
              <div className="bg-smart-bg/30 dark:bg-gray-900/30 px-8 py-5 border-b border-smart-light/10 flex flex-col md:flex-row gap-4 justify-between items-center">
                <div className="relative w-full md:max-w-md">
                  <input
                    type="text"
                    placeholder="SEARCH BY IP OR REASON..."
                    value={bannedIPsSearchQuery}
                    onChange={(e) => setBannedIPsSearchQuery(e.target.value)}
                    className="w-full pl-11 pr-4 py-3 rounded-2xl border-2 border-smart-light/20 bg-white dark:bg-gray-800 text-smart-dark dark:text-white focus:ring-4 focus:ring-smart-light/20 focus:border-smart-light outline-none transition font-mono text-xs font-black tracking-widest"
                  />
                  <svg className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-smart-light/60" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
                </div>
              </div>

              <div className="overflow-y-auto overflow-x-auto flex-grow">
              <table className="w-full text-left border-collapse">
                <thead className="sticky top-0 bg-smart-bg dark:bg-gray-900 z-10">
                  <tr className="border-b border-smart-light/10 text-smart-gray dark:text-gray-500 text-[10px] font-black uppercase tracking-widest">
                    <th className="px-4 py-3 pl-6">IP Address</th>
                    <th className="px-4 py-3">Reason</th>
                    <th className="px-4 py-3">Date Banned</th>
                    <th className="px-4 py-3 text-right pr-6">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-smart-bg dark:divide-gray-700">
                  {bannedIPs.map(banned => (
                    <tr key={banned._id} className="hover:bg-smart-bg/50 dark:hover:bg-gray-700/50 transition-colors">
                      <td className="px-4 py-3 pl-6 font-mono text-[13px] font-bold text-smart-dark dark:text-white">{banned.ipAddress}</td>
                      <td className="px-4 py-3 text-xs text-smart-gray dark:text-gray-400 font-medium">{banned.reason}</td>
                      <td className="px-4 py-3 text-[11px] font-bold text-smart-gray dark:text-gray-500">{new Date(banned.createdAt).toLocaleString()}</td>
                      <td className="px-4 py-3 pr-6 text-right">
                        <button onClick={() => handleUnbanIP(banned._id)} className="px-4 py-1.5 bg-smart-light/10 hover:bg-smart-light/20 text-smart-light rounded-lg text-[10px] font-black uppercase tracking-widest transition-colors border border-smart-light/20">Unban IP</button>
                      </td>
                    </tr>
                  ))}
                  {bannedIPs.length === 0 && (
                    <tr>
                      <td colSpan="4" className="p-8 text-center text-smart-gray dark:text-gray-500 font-black uppercase tracking-widest text-[10px]">No banned IP addresses found.</td>
                    </tr>
                  )}
                </tbody>
              </table>
              
              {bannedIPsHasMore && (
                <div className="flex justify-center p-4 bg-smart-bg dark:bg-gray-900 border-t border-smart-light/10">
                  <button 
                    onClick={handleLoadMoreBannedIPs}
                    disabled={isLoadingBannedIPs}
                    className="px-6 py-2.5 bg-smart-light/10 hover:bg-smart-light/20 text-smart-dark dark:text-white font-black text-[10px] uppercase tracking-widest rounded-xl transition-colors border border-smart-light/20"
                  >
                    {isLoadingBannedIPs ? 'Loading...' : 'Load More IPs'}
                  </button>
                </div>
              )}
              </div>
            </div>
          )}
        </div>
        )}

        {/* Sub-Admin Accounts Panel */}
        {activeTab === 'access' && isSuperAdmin && (
        <div className={`mb-10 bg-white dark:bg-gray-800 rounded-[40px] shadow-2xl border border-smart-light/10 dark:border-gray-700 overflow-hidden transition-all duration-300 ${isSubAdminsExpanded ? 'h-auto max-h-[800px] flex flex-col' : ''}`}>
          <div 
            className="bg-smart-bg dark:bg-gray-900 px-8 py-6 border-b border-smart-light/10 flex justify-between items-center cursor-pointer hover:bg-smart-bg/80 dark:hover:bg-gray-800 transition-colors"
            onClick={() => setIsSubAdminsExpanded(!isSubAdminsExpanded)}
          >
            <h2 className="text-xl font-black text-smart-dark dark:text-white flex items-center tracking-tighter uppercase italic select-none">
              <svg className="w-6 h-6 mr-3 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"></path></svg>
              Sub-Admin Accounts
            </h2>
            <div className="flex items-center text-smart-gray dark:text-gray-400">
              <span className="text-xs font-bold mr-4 uppercase tracking-widest">{subAdmins.length} Admins</span>
              <svg className={`w-6 h-6 transform transition-transform duration-300 ${isSubAdminsExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
            </div>
          </div>
          
          {isSubAdminsExpanded && (
            <div className="overflow-x-auto overflow-y-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-smart-bg dark:bg-gray-900 border-b border-smart-light/10 text-smart-gray dark:text-gray-500 text-[10px] font-black uppercase tracking-widest">
                    <th className="px-4 py-3 pl-6">Name</th>
                    <th className="px-4 py-3">Email</th>
                    <th className="px-4 py-3 text-center">Security Status</th>
                    <th className="px-4 py-3 pr-6 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-smart-bg dark:divide-gray-700">
                  {subAdmins.map(admin => (
                    <tr key={admin._id} className="hover:bg-smart-bg/50 dark:hover:bg-gray-700/50 transition-colors">
                      <td className="px-4 py-3 pl-6 font-black text-smart-dark dark:text-white italic capitalize">
                        {admin.name}
                        {admin.email === 'admin@smartpark.com' && <span className="ml-3 text-[9px] bg-purple-500/20 text-purple-500 px-2 py-0.5 rounded-full uppercase tracking-widest not-italic">System Owner</span>}
                      </td>
                      <td className="px-4 py-3 text-smart-gray dark:text-gray-400 font-medium">{admin.email}</td>
                      <td className="px-4 py-3 text-center">
                        {admin.isBlocked ? (
                          <span className="bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-400 text-[10px] font-black px-4 py-1.5 rounded-full uppercase tracking-widest border border-red-200 dark:border-red-800">Blocked</span>
                        ) : (
                          <span className="bg-smart-light/10 dark:bg-smart-light/20 text-smart-dark dark:text-smart-glow text-[10px] font-black px-4 py-1.5 rounded-full uppercase tracking-widest border border-smart-light/20">Active</span>
                        )}
                      </td>
                      <td className="px-4 py-3 pr-6 text-right">
                        <div className="flex justify-end items-center space-x-2">
                          {admin.email !== 'admin@smartpark.com' ? (
                            <>
                              <button onClick={() => handleBlockUser(admin._id, admin.isBlocked)} className={`px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${admin.isBlocked ? 'bg-smart-light text-white hover:bg-smart-dark shadow-md' : 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 hover:bg-red-600 hover:text-white border border-red-200 dark:border-red-800 shadow-sm'}`}>{admin.isBlocked ? 'Unblock' : 'Restrict'}</button>
                              <button onClick={() => handleDeleteUser(admin._id)} className="px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/20 shadow-sm">Delete</button>
                            </>
                          ) : (
                            <span className="text-[10px] font-black uppercase tracking-widest text-smart-gray dark:text-gray-500 mr-2">Protected</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {subAdmins.length === 0 && (
                    <tr><td colSpan="4" className="p-8 text-center text-smart-gray dark:text-gray-500 font-black uppercase tracking-widest text-[10px]">No sub-admin accounts found.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
        )}

        {/* Admin IP Whitelist Panel */}
        {activeTab === 'access' && isSuperAdmin && (
        <div className={`mb-10 bg-white dark:bg-gray-800 rounded-[40px] shadow-2xl border border-smart-light/10 dark:border-gray-700 overflow-hidden transition-all duration-300 ${isWhitelistExpanded ? 'h-auto max-h-[800px] flex flex-col' : ''}`}>
          <div 
            className="bg-smart-bg dark:bg-gray-900 px-8 py-6 border-b border-smart-light/10 flex justify-between items-center cursor-pointer hover:bg-smart-bg/80 dark:hover:bg-gray-800 transition-colors"
            onClick={() => setIsWhitelistExpanded(!isWhitelistExpanded)}
          >
            <h2 className="text-xl font-black text-smart-dark dark:text-white flex items-center tracking-tighter uppercase italic select-none">
              <svg className="w-6 h-6 mr-3 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"></path></svg>
              Admin IP Whitelist
            </h2>
            <div className="flex items-center text-smart-gray dark:text-gray-400">
              <button 
                onClick={(e) => { e.stopPropagation(); handleExportWhitelistedIPsCSV(); }} 
                className="hidden sm:flex items-center mr-4 px-3 py-1.5 bg-smart-light/10 hover:bg-smart-light/20 text-smart-light rounded-lg text-[10px] font-bold uppercase tracking-widest transition-colors border border-smart-light/20"
                disabled={totalWhitelistedIPs === 0}
              >
                <svg className="w-3 h-3 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
                Export CSV
              </button>
              <span className="text-xs font-bold mr-4 uppercase tracking-widest">{totalWhitelistedIPs} Allowed IPs</span>
              <svg className={`w-6 h-6 transform transition-transform duration-300 ${isWhitelistExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
            </div>
          </div>
          
          {isWhitelistExpanded && (
            <div className="flex flex-col h-full overflow-hidden">
              <div className="bg-smart-bg/30 dark:bg-gray-900/30 px-8 py-5 border-b border-smart-light/10">
                <form onSubmit={handleAddWhitelistIP} className="flex flex-col md:flex-row gap-4 items-end">
                  <div className="flex-1 w-full">
                    <label className="block text-[10px] font-black text-smart-gray dark:text-gray-400 uppercase tracking-widest mb-2">IP Address</label>
                    <input 
                      type="text" 
                      placeholder="e.g. 192.168.1.50" 
                      value={newWhitelistIP}
                      onChange={(e) => setNewWhitelistIP(e.target.value)}
                      className="w-full px-4 py-2.5 rounded-xl border-2 border-smart-light/20 bg-white dark:bg-gray-800 text-smart-dark dark:text-white focus:ring-2 focus:ring-smart-light/50 outline-none font-mono text-xs"
                      required
                    />
                  </div>
                  <div className="flex-1 w-full">
                    <label className="block text-[10px] font-black text-smart-gray dark:text-gray-400 uppercase tracking-widest mb-2">MAC Address (Optional)</label>
                    <input 
                      type="text" 
                      placeholder="e.g. 00:1B:44:11:3A:B7" 
                      value={newWhitelistMac}
                      onChange={(e) => setNewWhitelistMac(e.target.value)}
                      className="w-full px-4 py-2.5 rounded-xl border-2 border-smart-light/20 bg-white dark:bg-gray-800 text-smart-dark dark:text-white focus:ring-2 focus:ring-smart-light/50 outline-none font-mono text-xs"
                    />
                  </div>
                  <div className="flex-1 w-full">
                    <label className="block text-[10px] font-black text-smart-gray dark:text-gray-400 uppercase tracking-widest mb-2">Description / Note</label>
                    <input 
                      type="text" 
                      placeholder="e.g. Head Office Network" 
                      value={newWhitelistDesc}
                      onChange={(e) => setNewWhitelistDesc(e.target.value)}
                      className="w-full px-4 py-2.5 rounded-xl border-2 border-smart-light/20 bg-white dark:bg-gray-800 text-smart-dark dark:text-white focus:ring-2 focus:ring-smart-light/50 outline-none font-mono text-xs"
                    />
                  </div>
                  <button type="submit" className="w-full md:w-auto px-6 py-2.5 bg-blue-500 hover:bg-blue-600 text-white rounded-xl font-black uppercase tracking-widest text-[10px] shadow-sm transition-all whitespace-nowrap border border-blue-600">
                    Add to Whitelist
                  </button>
                </form>
              </div>

              <div className="bg-smart-bg/30 dark:bg-gray-900/30 px-8 py-5 border-b border-smart-light/10 flex flex-col md:flex-row gap-4 justify-between items-center">
                <div className="relative w-full md:max-w-md">
                  <input
                    type="text"
                    placeholder="SEARCH BY IP OR DESCRIPTION..."
                    value={whitelistedIPsSearchQuery}
                    onChange={(e) => setWhitelistedIPsSearchQuery(e.target.value)}
                    className="w-full pl-11 pr-4 py-3 rounded-2xl border-2 border-smart-light/20 bg-white dark:bg-gray-800 text-smart-dark dark:text-white focus:ring-4 focus:ring-smart-light/20 focus:border-smart-light outline-none transition font-mono text-xs font-black tracking-widest"
                  />
                  <svg className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-smart-light/60" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
                </div>
              </div>

              <div className="overflow-y-auto overflow-x-auto flex-grow">
                <table className="w-full text-left border-collapse">
                  <thead className="sticky top-0 bg-smart-bg dark:bg-gray-900 z-10">
                    <tr className="border-b border-smart-light/10 text-smart-gray dark:text-gray-500 text-[10px] font-black uppercase tracking-widest">
                      <th className="px-4 py-3 pl-6">IP Address</th>
                      <th className="px-4 py-3">MAC Address</th>
                      <th className="px-4 py-3">Description</th>
                      <th className="px-4 py-3">Added On</th>
                      <th className="px-4 py-3 text-right pr-6">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-smart-bg dark:divide-gray-700">
                    {whitelistedIPs.map(ip => (
                      <tr key={ip._id} className="hover:bg-smart-bg/50 dark:hover:bg-gray-700/50 transition-colors">
                        <td className="px-4 py-3 pl-6 font-mono text-[13px] font-bold text-smart-dark dark:text-white">{ip.ipAddress}</td>
                        <td className="px-4 py-3 font-mono text-xs text-smart-gray dark:text-gray-400 font-medium">{ip.macAddress || 'N/A'}</td>
                        <td className="px-4 py-3 text-xs text-smart-gray dark:text-gray-400 font-medium">{ip.description || 'N/A'}</td>
                        <td className="px-4 py-3 text-[11px] font-bold text-smart-gray dark:text-gray-500">{new Date(ip.createdAt).toLocaleString()}</td>
                        <td className="px-4 py-3 pr-6 text-right">
                          <button onClick={() => handleRemoveWhitelistIP(ip._id)} className="px-4 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-lg text-[10px] font-black uppercase tracking-widest transition-colors border border-red-500/20">Remove</button>
                        </td>
                      </tr>
                    ))}
                    {whitelistedIPs.length === 0 && (
                      <tr>
                        <td colSpan="5" className="p-8 text-center text-smart-gray dark:text-gray-500 font-black uppercase tracking-widest text-[10px]">No IP addresses have been whitelisted via the UI.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
                
                {whitelistHasMore && (
                  <div className="flex justify-center p-4 bg-smart-bg dark:bg-gray-900 border-t border-smart-light/10">
                    <button 
                      onClick={handleLoadMoreWhitelistIPs}
                      disabled={isLoadingWhitelist}
                      className="px-6 py-2.5 bg-smart-light/10 hover:bg-smart-light/20 text-smart-dark dark:text-white font-black text-[10px] uppercase tracking-widest rounded-xl transition-colors border border-smart-light/20"
                    >
                      {isLoadingWhitelist ? 'Loading...' : 'Load More IPs'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
        )}

        {/* Promotional Codes Usage Panel */}
        {activeTab === 'users' && (
        <div className={`mb-10 bg-white dark:bg-gray-800 rounded-[40px] shadow-2xl border border-smart-light/10 dark:border-gray-700 overflow-hidden transition-all duration-300 ${isPromoStatsExpanded ? 'h-auto max-h-[800px] flex flex-col' : ''}`}>
          <div 
            className="bg-smart-bg dark:bg-gray-900 px-8 py-6 border-b border-smart-light/10 flex justify-between items-center cursor-pointer hover:bg-smart-bg/80 dark:hover:bg-gray-800 transition-colors"
            onClick={() => setIsPromoStatsExpanded(!isPromoStatsExpanded)}
          >
            <h2 className="text-xl font-black text-smart-dark dark:text-white flex items-center tracking-tighter uppercase italic select-none">
              <svg className="w-6 h-6 mr-3 text-pink-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7"></path></svg>
              Promotional Codes Usage
            </h2>
            <div className="flex items-center text-smart-gray dark:text-gray-400">
              <button 
                onClick={(e) => { e.stopPropagation(); handleExportPromoCSV(); }} 
                className="hidden sm:flex items-center mr-4 px-3 py-1.5 bg-smart-light/10 hover:bg-smart-light/20 text-smart-light rounded-lg text-[10px] font-bold uppercase tracking-widest transition-colors border border-smart-light/20"
                disabled={promoStats.length === 0}
              >
                <svg className="w-3 h-3 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
                Export CSV
              </button>
              <svg className={`w-6 h-6 transform transition-transform duration-300 ${isPromoStatsExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
            </div>
          </div>
          
          {isPromoStatsExpanded && (
            <div className="overflow-x-auto overflow-y-auto flex-grow">
              <table className="w-full text-left border-collapse">
                <thead className="bg-smart-bg dark:bg-gray-900 z-10 border-b border-smart-light/10">
                  <tr className="text-smart-gray dark:text-gray-500 text-[10px] font-black uppercase tracking-widest">
                    <th className="px-4 py-3 pl-6">Promo Code</th>
                    <th className="px-4 py-3 text-center">Times Used</th>
                    <th className="px-4 py-3 text-right pr-6">Total Discount Provided</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-smart-bg dark:divide-gray-700">
                  {promoStats.map((promo, idx) => (
                    <tr key={promo._id || idx} className="hover:bg-smart-bg/50 dark:hover:bg-gray-700/50 transition-colors">
                      <td className="px-4 py-3 pl-6 font-mono text-[15px] font-black text-smart-dark dark:text-white">{promo._id}</td>
                      <td className="px-4 py-3 text-center text-sm font-bold text-smart-light">{promo.count}</td>
                      <td className="px-4 py-3 pr-6 text-right text-sm font-bold text-smart-gray dark:text-gray-400">{promo.totalDiscount}%</td>
                    </tr>
                  ))}
                  {promoStats.length === 0 && (
                    <tr>
                      <td colSpan="3" className="p-8 text-center text-smart-gray dark:text-gray-500 font-black uppercase tracking-widest text-[10px]">No promo codes have been used yet.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
        )}

        {/* Database Backups Panel */}
        {activeTab === 'system' && isSuperAdmin && (
        <div className={`mb-10 bg-white dark:bg-gray-800 rounded-[40px] shadow-2xl border border-smart-light/10 dark:border-gray-700 overflow-hidden transition-all duration-300 ${isBackupsExpanded ? 'h-auto max-h-[800px] flex flex-col' : ''}`}>
          <div 
            className="bg-smart-bg dark:bg-gray-900 px-8 py-6 border-b border-smart-light/10 flex justify-between items-center cursor-pointer hover:bg-smart-bg/80 dark:hover:bg-gray-800 transition-colors"
            onClick={() => setIsBackupsExpanded(!isBackupsExpanded)}
          >
            <h2 className="text-xl font-black text-smart-dark dark:text-white flex items-center tracking-tighter uppercase italic select-none">
              <svg className="w-6 h-6 mr-3 text-cyan-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2"></path></svg>
              Database Backups
            </h2>
            <div className="flex items-center text-smart-gray dark:text-gray-400">
              <span className="text-xs font-bold mr-4 uppercase tracking-widest">{backups.length} Files</span>
              <svg className={`w-6 h-6 transform transition-transform duration-300 ${isBackupsExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
            </div>
          </div>
          
          {isBackupsExpanded && (
            <div className="overflow-y-auto overflow-x-auto flex-grow">
              <table className="w-full text-left border-collapse">
                <thead className="sticky top-0 bg-smart-bg dark:bg-gray-900 z-10">
                  <tr className="border-b border-smart-light/10 text-smart-gray dark:text-gray-500 text-[10px] font-black uppercase tracking-widest">
                    <th className="px-4 py-3 pl-6">Filename</th>
                    <th className="px-4 py-3">Size</th>
                    <th className="px-4 py-3">Created On</th>
                    <th className="px-4 py-3 text-right pr-6">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-smart-bg dark:divide-gray-700">
                  {backups.map(backup => (
                    <tr key={backup.filename} className="hover:bg-smart-bg/50 dark:hover:bg-gray-700/50 transition-colors">
                      <td className="px-4 py-3 pl-6 font-mono text-[13px] font-bold text-smart-dark dark:text-white">{backup.filename}</td>
                      <td className="px-4 py-3 text-xs text-smart-gray dark:text-gray-400 font-medium">{backup.size}</td>
                      <td className="px-4 py-3 text-[11px] font-bold text-smart-gray dark:text-gray-500">{new Date(backup.createdAt).toLocaleString()}</td>
                      <td className="px-4 py-3 pr-6 text-right flex justify-end space-x-2">
                        <button onClick={() => handleDownloadBackup(backup.filename)} className="px-4 py-1.5 bg-blue-500/10 hover:bg-blue-500/20 text-blue-500 rounded-lg text-[10px] font-black uppercase tracking-widest transition-colors border border-blue-500/20">Download</button>
                        <button 
                          onClick={() => handleRestoreBackup(backup.filename)} 
                          disabled={restoringBackupFilename === backup.filename}
                          className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-colors border flex items-center justify-center ${restoringBackupFilename === backup.filename ? 'bg-green-500/20 text-green-600 border-green-500/40 cursor-wait' : 'bg-green-500/10 hover:bg-green-500/20 text-green-500 border-green-500/20'}`}
                        >
                          {restoringBackupFilename === backup.filename ? (
                            <>
                              <svg className="animate-spin -ml-1 mr-2 h-3 w-3 text-green-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                              </svg>
                              Restoring
                            </>
                          ) : 'Restore'}
                        </button>
                        <button onClick={() => handleDeleteBackup(backup.filename)} className="px-4 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-lg text-[10px] font-black uppercase tracking-widest transition-colors border border-red-500/20">Delete</button>
                      </td>
                    </tr>
                  ))}
                  {backups.length === 0 && (
                    <tr>
                      <td colSpan="4" className="p-8 text-center text-smart-gray dark:text-gray-500 font-black uppercase tracking-widest text-[10px]">No backup files found.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
        )}

        {activeTab === 'hardware' && (
        <div className="flex flex-col xl:flex-row gap-8 mb-10 animate-fade-in-up items-stretch">
          {/* Gate QR Scanner */}
          <div className="bg-white dark:bg-gray-800 rounded-[40px] shadow-2xl border border-smart-light/10 dark:border-gray-700 overflow-hidden flex flex-col w-full xl:w-1/3">
            <div className="bg-smart-bg dark:bg-gray-900 px-6 sm:px-8 py-6 border-b border-smart-light/10 flex flex-col items-center justify-center gap-4">
              <h2 className="text-xl font-black text-smart-dark dark:text-white flex items-center tracking-tighter uppercase italic shrink-0">
                <svg className="w-6 h-6 mr-3 text-smart-light" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm14 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z"></path></svg>
                Gate QR Scanner
              </h2>
              <div className="flex flex-row flex-wrap justify-center items-center gap-3">
                <button
                  onClick={handleToggleCamera}
                  className="px-3 py-1.5 bg-smart-bg dark:bg-gray-800 hover:bg-smart-light/20 text-smart-dark dark:text-white rounded-lg text-[10px] font-black uppercase tracking-widest transition-colors shadow-sm flex justify-center items-center border border-smart-light/10"
                >
                  <svg className="w-3 h-3 mr-1.5 text-smart-light" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
                  Switch Cam
                </button>
                <button
                  onClick={handleUnlockScanner}
                  className="px-3 py-1.5 bg-smart-bg dark:bg-gray-800 hover:bg-smart-light/20 text-smart-dark dark:text-white rounded-lg text-[10px] font-black uppercase tracking-widest transition-colors shadow-sm flex justify-center items-center border border-smart-light/10"
                >
                  <svg className="w-3 h-3 mr-1.5 text-smart-light" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z"></path></svg>
                  Unlock
                </button>
                <div className="flex justify-center items-center space-x-2 bg-smart-light/10 dark:bg-smart-light/20 px-3 py-1.5 rounded-full border border-smart-light/20">
                  <div className="w-2 h-2 bg-smart-light rounded-full animate-ping"></div>
                  <span className="text-[10px] text-smart-dark dark:text-smart-glow font-black uppercase tracking-widest">Online</span>
                </div>
              </div>
            </div>

            <div className="flex-grow flex flex-col bg-smart-dark/5 dark:bg-black p-6 sm:p-10 justify-center items-center relative">

              {scanMessage && (
                <div className={`mb-8 p-6 rounded-2xl font-black text-center text-sm shadow-xl border-2 w-full mx-auto transform animate-fade-in ${scanMessage.type === 'success' ? 'bg-smart-light/20 border-smart-light text-smart-dark dark:text-smart-glow' : 'bg-red-50 border-red-500 text-red-700 dark:bg-red-900/30 dark:text-red-400'}`}>
                  {scanMessage.text}
                </div>
              )}

              <style>{`
                #reader { border: none !important; background: transparent !important; }
                
                /* Modern Card Style for the Permissions/Empty Screen */
                #reader__dashboard_section_csr { 
                  padding: 30px 20px !important; 
                  text-align: center !important; 
                  background: rgba(128, 194, 65, 0.05) !important;
                  border-radius: 20px !important;
                  margin: 24px 0 0 0 !important;
                  border: 2px dashed rgba(128, 194, 65, 0.3) !important;
                  display: flex !important;
                  flex-direction: column !important;
                  align-items: center !important;
                  justify-content: center !important;
                }
                
                /* Hide original text but keep element in document flow */
                #reader__dashboard_section_csr > span { 
                  color: transparent !important;
                  font-size: 0 !important;
                  position: relative !important;
                  display: flex !important;
                  flex-direction: column !important;
                  align-items: center !important;
                  justify-content: center !important;
                  width: 100% !important;
                  gap: 12px !important;
                }
                
                /* Inject new themed text ONLY on the last span (prevents duplicate icons) */
                #reader__dashboard_section_csr > span:last-child {
                  padding-top: 0 !important;
                }
                
                #reader__dashboard_section_csr > span:last-child::after {
                  content: "OPTICAL SENSOR OFFLINE" !important;
                  position: relative !important;
                  top: 0 !important;
                  left: 0 !important;
                  width: 100% !important;
                  color: #ef4444 !important; /* Red for offline */
                  font-weight: 900 !important; 
                  font-size: 12px !important; 
                  font-family: inherit !important; 
                  text-transform: uppercase !important;
                  letter-spacing: 0.1em !important;
                  text-align: center !important;
                  order: -1 !important;
                }
                
                /* Inject a custom camera SVG icon above the permissions text ONLY on the last span */
                #reader__dashboard_section_csr > span:last-child::before {
                  content: '';
                  position: relative !important;
                  top: 0 !important;
                  width: 44px !important;
                  height: 44px !important;
                  background-color: #ef4444 !important; /* Match red offline theme */
                  -webkit-mask: url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='currentColor' stroke-width='2'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' d='M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z'/%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' d='M15 13a3 3 0 11-6 0 3 3 0 016 0z'/%3E%3C/svg%3E") no-repeat center / contain;
                  mask: url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='currentColor' stroke-width='2'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' d='M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z'/%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' d='M15 13a3 3 0 11-6 0 3 3 0 016 0z'/%3E%3C/svg%3E") no-repeat center / contain;
                  order: -2 !important;
                  margin-bottom: 8px !important;
                  animation: offline-pulse 2.5s infinite ease-in-out !important;
                }
                
                @keyframes offline-pulse {
                  0%, 100% { opacity: 1; transform: scale(1); }
                  50% { opacity: 0.5; transform: scale(0.92); }
                }
                
                #reader button {
                  padding: 10px 20px !important;
                  cursor: pointer !important;
                  margin: 0 auto !important;
                  display: flex !important;
                  align-items: center !important;
                  justify-content: center !important;
                  transition: all 0.2s ease-in-out !important;
                  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1) !important;
                  /* Hide actual text without breaking button shadow/clickability */
                  color: transparent !important;
                  font-size: 0 !important;
                  background: transparent !important;
                  border: none !important;
                  position: relative !important;
                  min-width: 200px !important;
                  min-height: 40px !important;
                }
                #reader button:hover { transform: translateY(-2px) !important; box-shadow: 0 6px 12px -2px rgba(128, 194, 65, 0.4) !important; }
                
                /* Inject custom button labels and backgrounds */
                #html5-qrcode-button-camera-permission::after,
                #html5-qrcode-button-camera-start::after,
                #html5-qrcode-button-camera-stop::after {
                  position: absolute !important;
                  top: 0 !important; left: 0 !important; right: 0 !important; bottom: 0 !important;
                  display: flex !important; align-items: center !important; justify-content: center !important;
                  border-radius: 12px !important; font-weight: 900 !important; 
                  text-transform: uppercase !important; letter-spacing: 0.1em !important; font-size: 10px !important;
                  color: white !important;
                  transition: background-color 0.2s ease-in-out !important;
                }
                
                #html5-qrcode-button-camera-permission::after {
                  content: "AUTHORIZE SENSOR LINK" !important;
                  background-color: #80C241 !important; 
                }
                #html5-qrcode-button-camera-start::after {
                  content: "ACTIVATE SENSOR" !important;
                  background-color: #80C241 !important; 
                }
                #html5-qrcode-button-camera-stop::after {
                  content: "HALT SENSOR" !important;
                  background-color: #ef4444 !important; 
                }
                
                /* Hover states for the ::after background colors */
                #html5-qrcode-button-camera-permission:hover::after,
                #html5-qrcode-button-camera-start:hover::after {
                  background-color: #6da336 !important;
                }
                #html5-qrcode-button-camera-stop:hover::after {
                  background-color: #dc2626 !important;
                }
                /* Hide default scanner target borders & camera dropdown */
                #reader select { display: none !important; }
                #reader a { color: #80C241 !important; text-decoration: none !important; font-weight: 900 !important; font-size: 11px !important; text-transform: uppercase !important; }
                #reader a:hover { text-decoration: underline !important; opacity: 0.8 !important; }
                
                /* Fix video frame and target constraints */
                #reader__scan_region { 
                  background: transparent !important; 
                  display: flex !important; 
                  justify-content: center !important; 
                  align-items: center !important;
                  border-radius: 20px !important;
                  overflow: hidden !important;
                  border: 1px solid rgba(128, 194, 65, 0.2) !important;
                  box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5) !important;
                  position: relative !important;
                }
                #reader__dashboard_section_swaplink { margin-top: 10px !important; display: inline-block !important; }
                #reader video { border-radius: 20px !important; object-fit: cover !important; }
                
                /* Hide default scanner target borders */
                #qr-shaded-region div { display: none !important; }
                
                /* Add custom sci-fi target overlay in the transparent scan region */
                #qr-shaded-region {
                  background-image: url("data:image/svg+xml;charset=utf-8,%3Csvg width='200' height='200' viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M40,4 L4,4 L4,40' fill='none' stroke='%2380C241' stroke-width='8' stroke-linecap='round' stroke-linejoin='round'/%3E%3Cpath d='M160,4 L196,4 L196,40' fill='none' stroke='%2380C241' stroke-width='8' stroke-linecap='round' stroke-linejoin='round'/%3E%3Cpath d='M40,196 L4,196 L4,160' fill='none' stroke='%2380C241' stroke-width='8' stroke-linecap='round' stroke-linejoin='round'/%3E%3Cpath d='M160,196 L196,196 L196,160' fill='none' stroke='%2380C241' stroke-width='8' stroke-linecap='round' stroke-linejoin='round'/%3E%3Ccircle cx='100' cy='100' r='40' fill='none' stroke='%2380C241' stroke-width='3' stroke-dasharray='10 6' opacity='0.7'/%3E%3Ccircle cx='100' cy='100' r='5' fill='%2380C241'/%3E%3C/svg%3E") !important;
                  background-repeat: no-repeat !important;
                  background-position: center center !important;
                  background-origin: content-box !important;
                  background-clip: content-box !important;
                  animation: reticle-pulse 2s infinite ease-in-out !important;
                  position: absolute !important;
                  top: 0 !important; left: 0 !important; right: 0 !important; bottom: 0 !important;
                }
                
                @keyframes reticle-pulse {
                  0% { background-size: 78% !important; }
                  50% { background-size: 84% !important; }
                  100% { background-size: 78% !important; }
                }
              `}</style>
              <div id="reader" className="w-full max-w-md mx-auto bg-white dark:bg-gray-800 p-4 sm:p-6 rounded-[30px] shadow-2xl border-4 border-smart-dark dark:border-smart-light/50 ring-8 ring-smart-bg dark:ring-gray-900"></div>

            </div>

            <div className="bg-smart-bg dark:bg-gray-900 p-6 sm:p-8 border-t border-smart-light/10 mt-auto w-full">
              <form onSubmit={handleManualOverride} className="flex flex-col space-y-4 max-w-md mx-auto w-full">
                <div className="relative">
                  <input
                    type="text"
                    value={manualTicketId}
                    onChange={(e) => setManualTicketId(e.target.value)}
                    placeholder="ENTER TICKET IDENTIFIER..."
                    className="w-full px-6 py-5 rounded-2xl border-2 border-smart-light/20 bg-white dark:bg-gray-800 text-smart-dark dark:text-white focus:ring-4 focus:ring-smart-light/20 focus:border-smart-light outline-none transition font-mono text-xs font-black tracking-widest"
                  />
                  <svg className="w-5 h-5 absolute right-6 top-1/2 -translate-y-1/2 text-smart-light/40" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01"></path></svg>
                </div>
                <button type="submit" className="w-full py-5 bg-smart-light hover:bg-smart-dark text-white rounded-2xl font-black uppercase tracking-widest text-xs transition-all shadow-xl hover:shadow-smart-light/20 active:scale-95">
                  Manual Entry Override
                </button>
              </form>
            </div>
          </div>

          {/* Hardware Alerts Table */}
          <div id="hardware-alerts-panel" className="bg-white dark:bg-gray-800 rounded-[40px] shadow-2xl border border-smart-light/10 dark:border-gray-700 flex flex-col overflow-hidden transition-all duration-300 w-full xl:w-2/3">
            <div className="bg-smart-bg dark:bg-gray-900 px-6 sm:px-8 py-6 border-b border-smart-light/10 flex flex-col lg:flex-row justify-between items-center gap-4">
              <h2 className="text-xl font-black text-smart-dark dark:text-white flex items-center tracking-tighter uppercase italic select-none shrink-0 w-full lg:w-auto justify-center lg:justify-start">
                <svg className="w-6 h-6 mr-3 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
                Hardware Alerts
              </h2>
              <div className="flex flex-row flex-wrap items-center justify-center lg:justify-end gap-3 w-full lg:w-auto text-smart-gray dark:text-gray-400">
                {isSuperAdmin && (
                  <button 
                    onClick={(e) => { e.stopPropagation(); handleClearHardwareAlerts(); }} 
                    className="hidden sm:flex items-center mr-4 px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-colors border border-red-500/20"
                    disabled={alerts.length === 0}
                  >
                    <svg className="w-3 h-3 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                    Clear All
                  </button>
                )}
                <div className="flex items-center space-x-2 bg-smart-bg dark:bg-gray-800 px-4 py-1.5 rounded-full border border-smart-light/10 mr-4">
                  <div className="w-2 h-2 bg-smart-light rounded-full animate-pulse"></div>
                  <span className="text-[10px] text-smart-gray dark:text-gray-500 font-black uppercase tracking-widest hidden sm:inline">Real-time Stream</span>
                </div>
              </div>
            </div>

            {isHardwareAlertsExpanded && (
              <>
                <div className="bg-smart-bg/30 dark:bg-gray-900/30 px-8 py-4 border-b border-smart-light/10 flex justify-between items-center">
                  <span className="text-xs font-bold text-smart-gray dark:text-gray-400 uppercase tracking-widest">{filteredAlerts.length} Alerts</span>
                  <select 
                    value={alertFilterType}
                    onChange={(e) => {
                      setAlertFilterType(e.target.value);
                      fetchDashboardAlerts(e.target.value);
                    }}
                    className="px-4 py-2 rounded-xl border-2 border-smart-light/20 bg-white dark:bg-gray-800 text-smart-dark dark:text-white focus:ring-2 focus:ring-smart-light/50 outline-none transition font-mono text-[10px] font-black tracking-widest cursor-pointer"
                  >
                    <option value="all">ALL ALERTS</option>
                    <option value="warning">WARNINGS</option>
                    <option value="info">INFO</option>
                    <option value="action">ACTIONS</option>
                    <option value="success">SUCCESS</option>
                    <option value="error">ERRORS</option>
                  </select>
                </div>

                <div className="flex-grow overflow-y-auto overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead className="sticky top-0 bg-smart-bg dark:bg-gray-900 z-10">
                      <tr className="border-b border-smart-light/10 text-smart-gray dark:text-gray-500 text-[10px] font-black uppercase tracking-widest">
                        <th className="px-4 py-3 pl-6 whitespace-nowrap text-left w-1/4">Date & Time</th>
                        <th className="px-4 py-3 whitespace-nowrap text-center w-[100px]">Type</th>
                        <th className="px-4 py-3 w-full text-left">Alert Message</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-smart-bg dark:divide-gray-700">
                      {filteredAlerts.map(alert => (
                        <tr key={alert._id || alert.id} className="hover:bg-smart-bg/50 dark:hover:bg-gray-700/50 transition-colors">
                          <td className="px-4 py-3 pl-6 whitespace-nowrap align-top text-left w-1/4">
                            <div className="text-sm font-bold text-smart-dark dark:text-gray-300">{alert.timeString || alert.time}</div>
                            <div className="text-xs font-bold text-smart-gray dark:text-gray-500 uppercase mt-0.5">{new Date(alert.createdAt).toLocaleDateString()}</div>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap align-top text-center w-[100px]">
                            {alert.type === 'warning' && <span className="bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-400 text-[9px] font-black px-2.5 py-1.5 rounded-md uppercase tracking-wider border border-yellow-200 dark:border-yellow-800 inline-block w-[72px] text-center">Warning</span>}
                            {alert.type === 'info' && <span className="bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-400 text-[9px] font-black px-2.5 py-1.5 rounded-md uppercase tracking-wider border border-blue-200 dark:border-blue-800 inline-block w-[72px] text-center">Info</span>}
                            {alert.type === 'action' && <span className="bg-smart-light/10 dark:bg-smart-light/20 text-smart-dark dark:text-smart-glow text-[9px] font-black px-2.5 py-1.5 rounded-md uppercase tracking-wider border border-smart-light/20 inline-block w-[72px] text-center">Action</span>}
                            {alert.type === 'success' && <span className="bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400 text-[9px] font-black px-2.5 py-1.5 rounded-md uppercase tracking-wider border border-green-200 dark:border-green-800 inline-block w-[72px] text-center">Success</span>}
                            {alert.type === 'error' && <span className="bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-400 text-[9px] font-black px-2.5 py-1.5 rounded-md uppercase tracking-wider border border-red-200 dark:border-red-800 inline-block w-[72px] text-center">Error</span>}
                          </td>
                          <td className="px-4 py-3 text-smart-dark dark:text-gray-200 font-medium text-sm leading-relaxed break-words align-top text-left w-full">{alert.message}</td>
                        </tr>
                      ))}
                      {filteredAlerts.length === 0 && (
                        <tr>
                          <td colSpan="3" className="p-8 text-center text-smart-gray dark:text-gray-500 font-black uppercase tracking-widest text-[10px]">No alerts match the selected filter.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="mt-auto flex flex-col w-full">
                  {totalAlertPages > 1 && !isLoadingAlerts && (
                    <div className="bg-smart-bg/30 dark:bg-gray-900/30 px-6 sm:px-8 py-4 border-t border-smart-light/10 flex flex-col sm:flex-row justify-between items-center gap-4">
                      <span className="text-[10px] font-bold text-smart-gray dark:text-gray-400 uppercase tracking-widest text-center sm:text-left w-full sm:w-auto shrink-0">
                        Showing {(alertPage - 1) * 10 + 1} to {Math.min(alertPage * 10, totalAlertsCount)} of {totalAlertsCount}
                      </span>
                      <div className="flex space-x-2 items-center justify-center sm:justify-end w-full sm:w-auto shrink-0">
                        <button
                          onClick={() => fetchAlertsPage(Math.max(1, alertPage - 1))}
                          disabled={alertPage === 1}
                          className="px-4 py-2 bg-white dark:bg-gray-800 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors border border-smart-light/20 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-smart-light/10 shadow-sm"
                        >
                          Prev
                        </button>
                        <span className="px-4 py-2 text-[10px] font-black uppercase tracking-widest text-smart-dark dark:text-white flex items-center shrink-0">
                          Page {alertPage} of {totalAlertPages}
                        </span>
                        <button
                          onClick={() => fetchAlertsPage(Math.min(totalAlertPages, alertPage + 1))}
                          disabled={alertPage >= totalAlertPages}
                          className="px-4 py-2 bg-white dark:bg-gray-800 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors border border-smart-light/20 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-smart-light/10 shadow-sm"
                        >
                          Next
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="bg-smart-bg dark:bg-gray-900 p-6 border-t border-smart-light/10 flex justify-center items-center">
                    <button onClick={() => navigate('/admin/alerts')} className="text-smart-light font-black text-[11px] hover:text-smart-dark dark:hover:text-white transition-all uppercase tracking-widest border-b-2 border-transparent hover:border-smart-light pb-1">
                      Establish Full Diagnostic Link
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>

        </div>
        )}
      </main>
      </div>
    </div>
  );
};

export default AdminDashboard;
