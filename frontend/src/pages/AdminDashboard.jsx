import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { socket } from '../socket';
import { useUI } from '../context/UIContext';
import { useTelemetry } from '../context/TelemetryContext';
import api from '../api';
import AdminHeader from '../components/AdminHeader';
import WidgetErrorBoundary from '../components/WidgetErrorBoundary';
import { FiUsers, FiDownload, FiSearch, FiBarChart2, FiRefreshCw, FiZap, FiTrash2, FiActivity } from 'react-icons/fi';

// Helper function to decode JWT and check for expiration
const isTokenExpired = (token) => {
  if (!token || token === 'undefined' || token === 'null') return true;
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return true;
    const base64Url = parts[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');

    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map(function (c) {
          return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
        })
        .join('')
    );

    const payload = JSON.parse(jsonPayload);
    return payload.exp ? Date.now() >= payload.exp * 1000 : false;
  } catch (error) {
    console.error('Failed to parse token:', error);
    return true;
  }
};

const AdminDashboard = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [isMounted, setIsMounted] = useState(false);
  const { showModal, showPrompt, showConfirm } = useUI();

  // State Declarations
  const [activeTab, setActiveTab] = useState(searchParams.get('tab') || 'overview');
  const [currentAdminEmail, setCurrentAdminEmail] = useState('');
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const superAdminEmail = (import.meta.env.VITE_SUPER_ADMIN_EMAIL || 'admin@smartpark.com').toLowerCase();

  const [stats, setStats] = useState(null);
  const [isLoadingStats, setIsLoadingStats] = useState(true);
  const [regularUsers, setRegularUsers] = useState([]);
  const [subAdmins, setSubAdmins] = useState([]);
  const [totalUsersCount, setTotalUsersCount] = useState(0);
  const [userPage, setUserPage] = useState(1);
  const [totalUserPages, setTotalUserPages] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState('ALL');

  const [auditLogs, setAuditLogs] = useState([]);
  const [bannedIPs, setBannedIPs] = useState([]);
  const [totalBannedIPs, setTotalBannedIPs] = useState(0);
  const [whitelistedIPs, setWhitelistedIPs] = useState([]);
  const [totalWhitelistedIPs, setTotalWhitelistedIPs] = useState(0);

  const [newAdminName, setNewAdminName] = useState('');
  const [newAdminEmail, setNewAdminEmail] = useState('');
  const [newAdminPassword, setNewAdminPassword] = useState('');
  const [newAdminIp, setNewAdminIp] = useState('');
  const [newAdminMac, setNewAdminMac] = useState('');
  const [isSubAdminProvisioningExpanded, setIsSubAdminProvisioningExpanded] = useState(true);

  const [newWhitelistIP, setNewWhitelistIP] = useState('');
  const [newWhitelistDesc, setNewWhitelistDesc] = useState('');
  const [newWhitelistMac, setNewWhitelistMac] = useState('');
  const [whitelistedIPsSearchQuery, setWhitelistedIPsSearchQuery] = useState('');

  const [backups, setBackups] = useState([]);
  const [restoringBackupFilename, setRestoringBackupFilename] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const [pendingCashTickets, setPendingCashTickets] = useState([]);
  const [cashSearchQuery, setCashSearchQuery] = useState('');
  const [cashFilterStatus, setCashFilterStatus] = useState('PENDING');
  const [cashPage, setCashPage] = useState(1);

  const { alerts, setAlerts, setTotalAlertsCount, liveReadings } = useTelemetry();

  const [monthlySales, setMonthlySales] = useState([]);

  // Hydration Fix & Initial Auth
  useEffect(() => {
    setIsMounted(true);
    const token = localStorage.getItem('token');
    if (!token || isTokenExpired(token)) {
      navigate('/login');
      return;
    }
    const email = (localStorage.getItem('adminEmail') || '').toLowerCase().trim();
    setCurrentAdminEmail(email);
    setIsSuperAdmin(email === superAdminEmail);
  }, [navigate, superAdminEmail]);

  // Data Fetching Handlers
  const fetchStats = useCallback(async () => {
    try {
      const res = await api.get('/admin/stats');
      setStats(res.data);
    } catch (e) { console.error(e); }
  }, []);

  const fetchMonthlySales = useCallback(async () => {
    try {
      const res = await api.get('/admin/monthly-sales');
      setMonthlySales(res.data || []);
    } catch (e) { console.error(e); }
  }, []);

  const fetchUsers = useCallback(async (page = 1) => {
    try {
      const res = await api.get('/admin/users', {
        params: { role: 'user', page, limit: 10, search: searchQuery, status: filterStatus }
      });
      setRegularUsers(res.data.users || []);
      setTotalUserPages(res.data.totalPages || 1);
      setTotalUsersCount(res.data.totalUsers || 0);
      setUserPage(page);
    } catch (e) { console.error(e); }
  }, [searchQuery, filterStatus]);

  const fetchSubAdmins = useCallback(async () => {
    try {
      const res = await api.get('/admin/users', { params: { role: 'admin' } });
      setSubAdmins(res.data.users || []);
    } catch (e) { console.error(e); }
  }, []);

  const fetchSecurityData = useCallback(async () => {
    if (!isSuperAdmin) return;
    try {
      const [auditRes, bannedRes, whitelistRes, backupsRes] = await Promise.all([
        api.get('/admin/audit-logs', { params: { limit: 50 } }),
        api.get('/admin/banned-ips'),
        api.get('/admin/whitelisted-ips'),
        api.get('/admin/backups')
      ]);
      setAuditLogs(auditRes.data.logs || []);
      setBannedIPs(bannedRes.data.bannedIPs || []);
      setTotalBannedIPs(bannedRes.data.totalBannedIPs || 0);
      setWhitelistedIPs(whitelistRes.data.ips || []);
      setTotalWhitelistedIPs(whitelistRes.data.totalIps || 0);
      setBackups(backupsRes.data || []);
    } catch (e) { console.error(e); }
  }, [isSuperAdmin]);

  const fetchPendingCashTickets = useCallback(async () => {
    try {
      const res = await api.get('/admin/pending-cash-tickets', {
        params: { status: cashFilterStatus }
      });
      setPendingCashTickets(res.data || []);
    } catch (err) {
      console.error('Failed to fetch cash tickets:', err);
    }
  }, [cashFilterStatus]);

  useEffect(() => {
    if (isMounted) {
      fetchStats();
      fetchUsers(1);
      fetchSubAdmins();
      fetchMonthlySales();
      if (isSuperAdmin) fetchSecurityData();
      if (activeTab === 'collections') fetchPendingCashTickets();
      setIsLoadingStats(false);
    }
  }, [isMounted, isSuperAdmin, fetchStats, fetchUsers, fetchSubAdmins, fetchSecurityData, activeTab, fetchPendingCashTickets, fetchMonthlySales]);

  // Action Handlers
  const handleTabChange = (id) => {
    if (id === 'grc') {
      navigate('/admin/grc');
      return;
    }
    setActiveTab(id);
    navigate(`/admin/dashboard?tab=${id}`);
  };

  const handleLogout = () => {
    localStorage.clear();
    navigate('/');
  };

  const handleRestrictUser = async (userId, currentStatus) => {
    let reason = '';
    if (!currentStatus) {
      reason = await showPrompt('Reason for restriction:', 'Restrict User', 'Policy violation');
      if (reason === null) return;
    } else {
      if (!await showConfirm('Remove restriction?', 'Unrestrict')) return;
    }
    try {
      const res = await api.patch(`/admin/users/${userId}/restrict`, { reason });
      showModal(res.data.message, 'Success', 'success');
      fetchUsers(userPage);
      fetchSubAdmins();
    } catch (e) { showModal('Action failed', 'Error', 'error'); }
  };

  const handleDeleteUser = async (userId) => {
    if (!await showConfirm('Delete user permanently?', 'Delete User')) return;
    try {
      await api.delete(`/admin/users/${userId}`);
      showModal('User deleted', 'Success', 'success');
      fetchUsers(userPage);
      fetchSubAdmins();
    } catch (e) { showModal('Failed to delete', 'Error', 'error'); }
  };

  const handleCreateSubAdmin = async (e) => {
    e.preventDefault();
    try {
      await api.post('/admin/sub-admin', { name: newAdminName, email: newAdminEmail, password: newAdminPassword, ipAddress: newAdminIp, macAddress: newAdminMac });
      setNewAdminName(''); setNewAdminEmail(''); setNewAdminPassword(''); setNewAdminIp(''); setNewAdminMac('');
      showModal('Sub-Admin added successfully', 'Success', 'success');
      fetchSubAdmins();
    } catch (error) { showModal(error.response?.data?.message || 'Creation failed', 'Error', 'error'); }
  };

  const handleAddWhitelistIP = async (e) => {
    e.preventDefault();
    try {
      await api.post('/admin/whitelisted-ips', { ipAddress: newWhitelistIP, description: newWhitelistDesc, macAddress: newWhitelistMac });
      setNewWhitelistIP(''); setNewWhitelistDesc(''); setNewWhitelistMac('');
      fetchSecurityData();
    } catch (e) { showModal('Failed to whitelist', 'Error', 'error'); }
  };

  const handleRemoveWhitelistIP = async (id) => {
    if (!await showConfirm('Remove IP from whitelist?', 'Remove')) return;
    try {
      await api.delete(`/admin/whitelisted-ips/${id}`);
      fetchSecurityData();
    } catch (e) { showModal('Failed to remove', 'Error', 'error'); }
  };

  const handleConfirmCash = async (ticketId, amount) => {
    if (!await showConfirm(`Confirm collection of ${amount} EGP?`, 'Confirm Cash')) return;
    try {
      await api.put(`/admin/activate-cash-ticket/${ticketId}`, {});
      showModal('Cash collected. Ticket activated.', 'Success', 'success');
      fetchPendingCashTickets();
      fetchStats();
    } catch (error) {
      showModal(error.response?.data?.message || 'Failed to activate ticket.', 'Error', 'error');
    }
  };

  const handleHardwareCommand = async (command) => {
    try {
      const res = await api.post('/hardware/control', { command });
      showModal(res.data.message, 'Hardware Control', 'success');
    } catch (err) {
      showModal('Failed to control hardware.', 'Hardware Error', 'error');
    }
  };

  const handleExportUsersCSV = async () => {
    const token = localStorage.getItem('token');
    try {
      const res = await api.get('/admin/users', {
        params: { role: 'user', limit: 10000 },
        headers: { Authorization: `Bearer ${token}` }
      });
      const exportData = res.data.users || [];
      const headers = ['Name', 'Email', 'Tickets', 'Status'];
      const csvRows = [headers.join(',')];
      exportData.forEach((u) => {
        csvRows.push([
          `"${u.name}"`,
          `"${u.email}"`,
          `"${u.ticketCount || 0}"`,
          `"${u.isRestricted ? 'Restricted' : 'Active'}"`
        ].join(','));
      });
      const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `smart-park-users-${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (e) {
      showModal('Failed to export users.', 'Error', 'error');
    }
  };

  const handleExportWhitelistedIPsCSV = () => {
    if (whitelistedIPs.length === 0) return;
    const headers = ['IP Address', 'MAC Address', 'Description'];
    const csvRows = [headers.join(',')];
    whitelistedIPs.forEach((ip) => {
      csvRows.push([
        `"${ip.ipAddress}"`,
        `"${ip.macAddress || 'N/A'}"`,
        `"${ip.description || 'N/A'}"`
      ].join(','));
    });
    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `whitelisted-ips-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    try {
      if (activeTab === 'overview') {
        await Promise.all([fetchStats(), fetchMonthlySales()]);
      } else if (activeTab === 'collections') {
        await fetchPendingCashTickets();
      }
    } catch (err) {
      console.error('Manual refresh failed:', err);
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleResetOccupancy = async () => {
    if (!await showConfirm('Reset park occupancy?', 'Reset Occupancy')) return;
    try {
      await api.post('/admin/reset-occupancy');
      showModal('Occupancy reset.', 'Success', 'success');
      fetchStats();
    } catch (error) {
      showModal('Failed to reset occupancy', 'Error', 'error');
    }
  };

  const handleGenerateDummyTickets = async () => {
    try {
      const response = await api.post('/admin/generate-mock-data');
      showModal(response.data.message, 'Success', 'success');
      fetchStats();
    } catch (error) {
      showModal('Failed to generate mock data', 'Error', 'error');
    }
  };

  const handleClearDummyData = async () => {
    if (!await showConfirm('Delete all records?', 'Clear Records')) return;
    try {
      await api.delete('/admin/clear-dummy-tickets');
      showModal('Data cleared.', 'Success', 'success');
      fetchStats();
    } catch (error) {
      showModal('Failed to clear data', 'Error', 'error');
    }
  };

  const handleBackupDatabase = async () => {
    if (!await showConfirm('Trigger a manual database backup?', 'Database Backup')) return;
    try {
      const response = await api.post('/admin/backup');
      showModal(response.data.message, 'Success', 'success');
      fetchSecurityData();
    } catch (err) {
      showModal('Failed to trigger backup', 'Error', 'error');
    }
  };

  const handleDeleteBackup = async (filename) => {
    if (!await showConfirm(`Delete backup: ${filename}?`, 'Delete Backup')) return;
    try {
      await api.delete(`/admin/backups/${filename}`);
      setBackups((prev) => prev.filter((b) => b.filename !== filename));
    } catch (err) {
      showModal('Failed to delete backup', 'Error', 'error');
    }
  };

  // Cash Pagination Logic
  const cashPerPage = 10;
  const indexOfLastCash = cashPage * cashPerPage;
  const indexOfFirstCash = indexOfLastCash - cashPerPage;
  const filteredCashTickets = useMemo(() => {
    const query = cashSearchQuery.toLowerCase().trim();
    return pendingCashTickets.filter(t => {
      const ticketId = (t._id || '').toLowerCase();
      const userName = (t.userId?.name || '').toLowerCase();
      const userEmail = (t.userId?.email || '').toLowerCase();
      const userPhone = (t.userId?.phone || '').toLowerCase();
      
      return ticketId.includes(query) || 
             userName.includes(query) || 
             userEmail.includes(query) || 
             userPhone.includes(query);
    });
  }, [pendingCashTickets, cashSearchQuery]);
  const currentCashTickets = useMemo(() => {
    return filteredCashTickets.slice(indexOfFirstCash, indexOfLastCash);
  }, [filteredCashTickets, indexOfFirstCash, indexOfLastCash]);
  const totalCashPages = Math.ceil(filteredCashTickets.length / cashPerPage);

  // Pagination Logic
  const usersPerPage = 10;
  const indexOfLastUser = userPage * usersPerPage;
  const indexOfFirstUser = indexOfLastUser - usersPerPage;
  const currentUsers = useMemo(() => regularUsers, [regularUsers]); // API handles pagination
  const totalPages = totalUserPages;
  const currentPage = userPage;
  const setCurrentPage = setUserPage;

  if (!isMounted) return null;

  const tabs = [
    { id: 'overview', label: 'OVERVIEW & STATS', icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z' },
    { id: 'users', label: 'USER MANAGEMENT', icon: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z' },
    { id: 'hardware', label: 'GATE & HARDWARE', icon: 'M13 10V3L4 14h7v7l9-11h-7z' },
    { id: 'collections', label: 'CASH COLLECTIONS', icon: 'M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z' },
    ...(isSuperAdmin ? [
      { id: 'access', label: 'ACCESS CONTROL', icon: 'M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z' },
      { id: 'security', label: 'SECURITY LOGS', icon: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z' },
      { id: 'grc', label: 'GRC & SECURITY', icon: 'M12 11c0 3.517-1.009 6.799-2.753 9.571m-3.44-2.04l.054-.09A13.916 13.916 0 008 11a4 4 0 118 0c0 1.017-.071 2.019-.203 3m-2.118 6.844A21.88 21.88 0 0015.171 17m3.839 1.132c.645-2.266.99-4.659.99-7.132A8 8 0 008 4.07M3 15.364c.64-1.319 1-2.8 1-4.364 0-1.457.39-2.823 1.07-4' }
    ] : [])
  ];

  return (
    <div className="min-h-screen bg-[#0f172a] text-white flex flex-col font-sans">
      <AdminHeader title="Admin Dashboard" userName={currentAdminEmail} onLogout={handleLogout} />

      <div className="flex flex-grow w-full max-w-7xl mx-auto px-6 py-8 gap-8">
        <aside className="w-80 flex-shrink-0 hidden lg:block">
          <div className="bg-[#1e293b] rounded-[32px] p-6 border border-gray-700/50 sticky top-8">
            <div className="text-[10px] font-black text-[#80C241] uppercase tracking-[0.3em] mb-6 ml-4 italic">Admin Modules</div>
            {tabs.map(tab => (
              <button key={tab.id} onClick={() => handleTabChange(tab.id)} className={`w-full flex items-center gap-4 px-6 py-4 rounded-2xl text-xs font-black uppercase tracking-widest transition-all ${activeTab === tab.id ? 'bg-[#80C241] text-white shadow-lg' : 'text-gray-400 hover:bg-gray-800'}`}>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d={tab.icon}></path></svg>
                {tab.label}
              </button>
            ))}
          </div>
        </aside>

        <main className="flex-1 min-w-0 space-y-10">
          
          {activeTab === 'overview' && (
            <div className="animate-fade-in space-y-10">
              {/* Main Stats Row */}
              <div className="bg-[#1e2330] rounded-[40px] border border-white/5 p-12 flex flex-col gap-12 shadow-2xl overflow-visible">
                <div className="flex justify-between items-center">
                  <h2 className="text-xl font-black text-white uppercase italic tracking-tighter flex items-center">
                    <FiBarChart2 className="w-8 h-8 mr-3 text-[#80C241]" />
                    System Overview
                  </h2>

                  <button onClick={handleManualRefresh} disabled={isRefreshing} className="flex items-center px-6 py-3 bg-[#1e293b] border border-gray-700/50 rounded-xl text-[10px] font-black uppercase tracking-widest text-gray-400 hover:text-white transition-all shadow-xl active:scale-95 disabled:opacity-50">
                    <svg className={`w-4 h-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
                    Refresh Live Data
                  </button>
                </div>

                <div className="flex items-center justify-center -space-x-12 px-4 h-64 relative overflow-visible">
                  {/* Card 1: TOTAL TICKETS SOLD */}
                  <div className="relative z-40 group">
                    <div className="w-56 h-56 flex items-center justify-center rounded-full border-[10px] border-blue-600 bg-[#1a1f2c] shadow-[15px_0_30px_rgba(0,0,0,0.5)] transition-transform group-hover:scale-105 duration-500">
                      <div className="flex flex-col items-center text-center px-4 gap-1">
                        <svg className="w-5 h-5 text-blue-600 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z"></path></svg>
                        <h3 className="text-xs font-bold text-gray-400 uppercase tracking-tight">Total Tickets Sold</h3>
                        <span className="text-5xl font-black italic text-white tracking-tighter drop-shadow-lg">{stats?.totalTicketsSold || 0}</span>
                      </div>
                    </div>
                  </div>

                  {/* Card 2: CURRENT OCCUPANCY */}
                  <div className="relative z-30 -ml-12 group">
                    <div className="w-56 h-56 flex items-center justify-center rounded-full bg-[#1a1f2c] shadow-[15px_0_30px_rgba(0,0,0,0.5)] transition-transform group-hover:scale-105 duration-500 overflow-hidden relative border-[10px] border-gray-700">
                      <svg className="absolute inset-0 w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                        <circle cx="50" cy="50" r="45" fill="transparent" stroke="transparent" strokeWidth="10" />
                        <circle cx="50" cy="50" r="45" fill="transparent" stroke="#80C241" strokeWidth="10" strokeDasharray="283" strokeDashoffset={283 - (283 * 30) / 100} strokeLinecap="round" className="drop-shadow-[0_0_10px_rgba(128,194,65,0.6)]" />
                      </svg>
                      <div className="flex flex-col items-center z-10 text-center px-4 gap-1">
                        <svg className="w-5 h-5 text-gray-700 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 21V5a2 2 0 00-2-2H5a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"></path></svg>
                        <h3 className="text-xs font-bold text-gray-400 uppercase tracking-tight">Current Occupancy</h3>
                        <span className="text-5xl font-black italic text-[#80C241] tracking-tighter drop-shadow-lg">{stats?.currentOccupancy || 0}</span>
                        <span className="text-[10px] font-bold text-gray-500 uppercase mt-0.5 tracking-widest">/ {stats?.maxCapacity || 200} Limit</span>
                      </div>
                    </div>
                  </div>

                  {/* Card 3: MOST SOLD TICKET */}
                  <div className="relative z-20 -ml-12 group">
                    <div className="w-56 h-56 flex items-center justify-center rounded-full border-[10px] border-orange-700 bg-[#1a1f2c] shadow-[15px_0_30px_rgba(0,0,0,0.5)] transition-transform group-hover:scale-105 duration-500">
                      <div className="flex flex-col items-center px-6 text-center gap-1">
                        <svg className="w-5 h-5 text-orange-700 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                        <h3 className="text-xs font-bold text-gray-400 uppercase tracking-tight">Most Sold Ticket</h3>
                        <span className="text-2xl font-black italic text-white leading-tight uppercase tracking-tighter max-w-[140px] break-words">Adult<br/>(One-Time)</span>
                      </div>
                    </div>
                  </div>

                  {/* Card 4: USER STATISTICS */}
                  <div className="relative z-10 -ml-12 group">
                    <div className="w-56 h-56 flex items-center justify-center rounded-full border-[10px] border-lime-400 bg-[#1a1f2c] shadow-[0_0_30px_rgba(0,0,0,0.5)] transition-transform group-hover:scale-105 duration-500">
                      <div className="flex flex-col items-center text-center px-4 gap-1">
                        <svg className="w-5 h-5 text-lime-400 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"></path></svg>
                        <h3 className="text-xs font-bold text-gray-400 uppercase tracking-tight">User Statistics</h3>
                        <span className="text-5xl font-black italic text-white tracking-tighter drop-shadow-lg">{totalUsersCount}</span>
                        <span className="text-[10px] font-bold text-gray-500 uppercase mt-0.5 tracking-widest">Of {totalUsersCount + subAdmins.length} Total</span>
                      </div>
                    </div>
                  </div>
                </div>

                {isSuperAdmin && (
                  <div className="grid grid-cols-4 gap-4 mt-8">
                    <button onClick={handleResetOccupancy} className="group flex flex-col items-center justify-center gap-2 py-4 bg-red-600 hover:bg-red-500 text-white rounded-2xl transition-all shadow-xl active:scale-95">
                       <FiRefreshCw className="w-6 h-6 group-hover:rotate-180 transition-transform duration-500" />
                       <span className="text-xs font-black uppercase">Reset Occupancy</span>
                    </button>
                    <button onClick={handleGenerateDummyTickets} className="group flex flex-col items-center justify-center gap-2 py-4 bg-lime-500 hover:bg-lime-400 text-white rounded-2xl transition-all shadow-xl active:scale-95">
                       <FiZap className="w-6 h-6 group-hover:scale-125 transition-transform duration-500" />
                       <span className="text-xs font-black uppercase">Generate Data</span>
                    </button>
                    <button onClick={handleClearDummyData} className="group flex flex-col items-center justify-center gap-2 py-4 bg-gray-700 hover:bg-gray-600 text-white rounded-2xl transition-all shadow-xl active:scale-95">
                       <FiTrash2 className="w-6 h-6 group-hover:shake transition-transform duration-500" />
                       <span className="text-xs font-black uppercase">Clear Data</span>
                    </button>
                    <button onClick={handleBackupDatabase} className="group flex flex-col items-center justify-center gap-2 py-4 bg-blue-600 hover:bg-blue-500 text-white rounded-2xl transition-all shadow-xl active:scale-95">
                       <FiDownload className="w-6 h-6 group-hover:-translate-y-2 transition-transform duration-500" />
                       <span className="text-xs font-black uppercase">Backup DB</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Historical Trend */}
              <div className="bg-[#1e2330] rounded-[40px] border border-white/5 p-10 flex flex-col gap-10 shadow-2xl">
                <div className="flex flex-col">
                  <h2 className="text-xl font-black text-white uppercase italic tracking-tighter flex items-center">
                    <FiActivity className="w-6 h-6 mr-3 text-orange-500" />
                    Revenue & Sales Velocity
                  </h2>
                  <span className="text-[10px] font-black text-gray-500 uppercase tracking-[0.4em] mt-1 ml-9 italic">Historical Performance Analytics</span>
                </div>
                <div className="flex items-end justify-between space-x-4 min-w-[600px] h-64 border-b border-white/10 pb-6 overflow-x-auto">
                  {monthlySales.map((sale, idx) => {
                    const heightPercent = Math.max((sale.totalTickets / (Math.max(...monthlySales.map(s => s.totalTickets)) || 1)) * 100, 10);
                    return (
                      <div key={idx} className="flex flex-col items-center justify-end w-full h-full group relative">
                        <div className="w-full max-w-[50px] bg-[#80C241]/10 group-hover:bg-[#80C241] transition-all duration-300 rounded-t-2xl relative border-t border-x border-[#80C241]/20 shadow-[0_0_20px_rgba(128,194,65,0.05)]" style={{ height: `${heightPercent}%` }}>
                          <div className="absolute -top-12 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-black text-[#80C241] text-[10px] font-black px-3 py-2 rounded-lg border border-[#80C241]/20 whitespace-nowrap shadow-2xl z-20">
                            {sale.totalTickets} TICKETS
                          </div>
                        </div>
                        <div className="mt-6 text-[10px] font-black text-gray-600 uppercase tracking-widest group-hover:text-white transition-colors">{sale.month}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'users' && (
            <div className="bg-[#1e293b] rounded-[32px] border border-gray-700/50 p-8 flex flex-col gap-6 shadow-2xl animate-fade-in">
              <div className="flex justify-between items-center">
                <h2 className="text-2xl font-bold flex items-center gap-3 text-white"><FiUsers /> User Management</h2>
                <div className="flex gap-4">
                  <button onClick={handleExportUsersCSV} className="bg-[#80C241] text-white px-5 py-2.5 rounded-xl text-xs font-black tracking-widest flex items-center gap-2 hover:bg-[#6b9e36] transition shadow-lg">EXPORT CSV</button>
                  <span className="bg-gray-800 border border-gray-700 px-5 py-2.5 rounded-xl text-xs font-black text-gray-300 tracking-widest shadow-inner">TOTAL: {totalUsersCount}</span>
                </div>
              </div>
              <div className="flex bg-[#0f172a] rounded-2xl border border-gray-700/50 p-2 shadow-inner">
                <div className="flex-1 flex items-center px-4"><FiSearch className="text-gray-500 mr-2" /><input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search..." className="w-full bg-transparent outline-none text-sm text-white" /></div>
                <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="bg-[#0f172a] border-l border-gray-700 px-4 text-xs font-black uppercase outline-none cursor-pointer text-white">
                  <option value="ALL">ALL STATUSES</option>
                  <option value="ACTIVE">ACTIVE</option>
                  <option value="RESTRICTED">RESTRICTED</option>
                </select>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse min-w-[900px]">
                  <thead>
                    <tr className="text-[10px] font-black uppercase text-gray-400 tracking-widest border-b border-gray-700 pb-4">
                      <th className="py-4 px-2">Name</th><th className="py-4 px-2">Email</th><th className="py-4 px-2 text-center">Tickets</th><th className="py-4 px-2 text-center">Status</th><th className="py-4 px-2 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {regularUsers.map(user => (
                      <tr key={user._id} className="border-b border-gray-800/50 hover:bg-gray-800/30 h-16 transition-colors">
                        <td className="py-4 px-2 text-sm font-medium text-white">{user.name}</td>
                        <td className="py-4 px-2 text-sm text-gray-400">{user.email}</td>
                        <td className="py-4 px-2 text-center"><span className="bg-gray-700 text-white px-3 py-1 rounded-full text-[10px] font-black">{user.ticketCount || 0}</span></td>
                        <td className="py-4 px-2 text-center">
                          <span className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase ${user.isRestricted ? 'bg-red-500/10 text-red-400 border border-red-500/20' : 'bg-green-500/10 text-green-400 border border-green-500/20'}`}>
                            {user.isRestricted ? 'Restricted' : 'Active'}
                          </span>
                        </td>
                        <td className="py-4 px-2 align-middle">
                          <div className="flex justify-end gap-2 whitespace-nowrap">
                            <button onClick={() => navigate(`/admin/users/${user._id}/tickets?fromTab=${activeTab}`)} className="bg-transparent border border-gray-600 px-4 py-2 rounded-xl text-[10px] font-black uppercase hover:bg-gray-700 text-gray-300 transition">Tickets</button>
                            <button onClick={() => handleRestrictUser(user._id, user.isRestricted)} className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase border transition ${user.isRestricted ? 'border-green-500/30 text-green-400 hover:bg-green-500/10' : 'border-red-500/30 text-red-400 hover:bg-red-500/10'}`}>{user.isRestricted ? 'Enable' : 'Restrict'}</button>
                            <button onClick={() => handleDeleteUser(user._id)} className="bg-transparent text-red-400 border border-red-800/50 px-4 py-2 rounded-xl text-[10px] font-black uppercase hover:bg-red-900/30 transition">Delete</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex justify-between items-center pt-4 border-t border-gray-700/50">
                <span className="text-xs text-gray-500 font-medium">Page {currentPage} of {totalPages}</span>
                <div className="flex gap-2">
                  <button onClick={() => setCurrentPage(p => Math.max(1, p-1))} disabled={currentPage === 1} className="px-4 py-2 bg-[#0f172a] text-gray-400 rounded-xl text-xs font-bold disabled:opacity-50 hover:bg-gray-800 transition">Previous</button>
                  <button onClick={() => setCurrentPage(p => Math.min(totalPages, p+1))} disabled={currentPage === totalPages} className="px-4 py-2 bg-[#0f172a] text-gray-400 rounded-xl text-xs font-bold disabled:opacity-50 hover:bg-gray-800 transition">Next</button>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'collections' && (
            <div className="bg-[#1e293b] rounded-[32px] shadow-2xl border border-gray-700/50 overflow-hidden animate-fade-in">
              {/* Header & Controls */}
              <div className="bg-[#0f172a]/50 px-8 py-6 border-b border-gray-700/50 flex flex-col md:flex-row justify-between items-center gap-4">
                <h2 className="text-xl font-black italic uppercase tracking-tighter flex items-center text-white">
                  <svg className="w-6 h-6 mr-3 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z"></path></svg>
                  Cash Collections Management
                </h2>
                <div className="flex items-center gap-3">
                  <div className="flex bg-[#0f172a] p-1 rounded-xl border border-gray-700/50 shadow-inner">
                    <button onClick={() => {setCashFilterStatus('PENDING'); setCashPage(1);}} className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${cashFilterStatus === 'PENDING' ? 'bg-[#80C241] text-white shadow-md' : 'text-gray-400 hover:text-gray-200'}`}>Pending</button>
                    <button onClick={() => {setCashFilterStatus('PAID'); setCashPage(1);}} className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${cashFilterStatus === 'PAID' ? 'bg-[#80C241] text-white shadow-md' : 'text-gray-400 hover:text-gray-200'}`}>History</button>
                  </div>
                  <button onClick={handleManualRefresh} disabled={isRefreshing} className="p-2.5 bg-[#0f172a] text-gray-400 hover:text-white rounded-full border border-gray-700/50 transition-all active:scale-95 disabled:opacity-50 shadow-inner">
                    <svg className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
                  </button>
                </div>
              </div>

              {/* Search Bar */}
              <div className="px-8 py-5 bg-[#0f172a]/30 border-b border-gray-700/30">
                <div className="relative w-full shadow-inner rounded-2xl overflow-hidden">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none"><FiSearch className="h-4 w-4 text-gray-500" /></div>
                  <input type="text" value={cashSearchQuery} onChange={(e) => {setCashSearchQuery(e.target.value); setCashPage(1);}} placeholder="SEARCH BY NAME, EMAIL, PHONE OR TICKET ID..." className="w-full bg-[#0f172a] text-white text-xs font-bold tracking-widest py-4 pl-12 pr-4 outline-none focus:border-[#80C241]/50 transition-all placeholder-gray-600 font-mono" />
                </div>
              </div>

              {/* List Container */}
              <div className="p-8 min-h-[600px] flex flex-col justify-between">
                <div>
                  <div className="grid grid-cols-12 gap-4 pb-4 border-b border-gray-700/30 mb-4 px-2">
                    <div className="col-span-3 text-[10px] font-black uppercase text-gray-500 tracking-[0.2em]">Ticket ID</div>
                    <div className="col-span-4 text-[10px] font-black uppercase text-gray-500 tracking-[0.2em]">Customer Details</div>
                    <div className="col-span-2 text-[10px] font-black uppercase text-gray-500 tracking-[0.2em]">Amount Due</div>
                    <div className="col-span-3 text-[10px] font-black uppercase text-gray-500 tracking-[0.2em] text-right">Status / Action</div>
                  </div>

                  <div className="space-y-1">
                    {currentCashTickets.length > 0 ? (
                      currentCashTickets.map((t) => (
                          <div key={t._id} className="grid grid-cols-12 gap-4 py-6 px-2 border-b border-gray-800/50 hover:bg-gray-800/20 transition-colors items-center">
                            <div className="col-span-3 flex flex-col">
                              <span className="text-sm font-bold text-white tracking-tight font-mono">#{t._id.substring(t._id.length - 8).toUpperCase()}</span>
                              <span className="text-[10px] text-gray-500 font-medium mt-1 uppercase">{new Date(t.createdAt).toLocaleString()}</span>
                            </div>
                            <div className="col-span-4 flex flex-col">
                              <span className="text-sm font-black italic text-white uppercase tracking-tight">{t.userId?.name || 'CUSTOMER NAME'}</span>
                              <span className="text-[10px] text-gray-500 font-bold mt-1 uppercase">{t.userId?.email || 'N/A'} | {t.userId?.phone || 'N/A'}</span>
                            </div>
                            <div className="col-span-2 flex items-baseline gap-1.5">
                              <span className="text-2xl font-black italic text-[#80C241] tracking-tighter">{t.price}</span>
                              <span className="text-[10px] font-black text-gray-500 uppercase">EGP</span>
                            </div>
                            <div className="col-span-3 flex justify-end items-center gap-3">
                              {cashFilterStatus === 'PAID' ? (
                                <span className="bg-green-500/10 text-green-400 border border-green-500/30 px-6 py-2 rounded-full text-[10px] font-black uppercase tracking-widest shadow-inner">
                                  PAID & ACTIVE
                                </span>
                              ) : (
                                <button
                                  onClick={() => handleConfirmCash(t._id, t.price)}
                                  className="flex items-center gap-3 bg-[#80C241] hover:bg-[#6b9e36] text-white px-6 py-2.5 rounded-full text-[10px] font-black uppercase tracking-widest shadow-md transition-all active:scale-95"
                                >
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"></path>
                                  </svg>
                                  Collect & Activate
                                </button>
                              )}
                            </div>
                          </div>
                        ))
                    ) : (
                      <div className="py-20 text-center">
                        <span className="text-sm text-gray-500 font-black uppercase tracking-[0.3em] italic opacity-50">No transaction records found.</span>
                      </div>
                    )}
                  </div>
                </div>

                {totalCashPages > 1 && (
                  <div className="flex justify-between items-center pt-8 border-t border-gray-700/50 mt-4">
                    <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">
                      SHOWING {indexOfFirstCash + 1} - {Math.min(indexOfLastCash, filteredCashTickets.length)} OF {filteredCashTickets.length} ENTRIES
                    </span>
                    <div className="flex gap-2">
                      <button onClick={() => setCashPage(p => Math.max(1, p-1))} disabled={cashPage === 1} className="px-6 py-2 bg-[#0f172a] text-gray-400 rounded-xl text-[10px] font-black uppercase tracking-widest border border-gray-700/50 hover:bg-gray-800 disabled:opacity-30 transition-all">Previous</button>
                      <button onClick={() => setCashPage(p => Math.min(totalCashPages, p + 1))} disabled={cashPage === totalCashPages} className="px-6 py-2 bg-[#0f172a] text-gray-400 rounded-xl text-[10px] font-black uppercase tracking-widest border border-gray-700/50 hover:bg-gray-800 disabled:opacity-30 transition-all">Next</button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'hardware' && (
            <div className="animate-fade-in space-y-10">
              <div className="bg-white dark:bg-gray-800 rounded-[40px] shadow-2xl border border-smart-light/10 dark:border-gray-700 overflow-hidden">
                <div className="bg-smart-bg dark:bg-gray-900 px-8 py-6 border-b border-smart-light/10 flex justify-between items-center">
                  <h2 className="text-xl font-black text-smart-dark dark:text-white flex items-center tracking-tighter uppercase italic select-none">
                    <svg className="w-6 h-6 mr-3 text-smart-glow" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z"></path></svg>
                    Live Sensor Matrix
                  </h2>
                </div>
                <div className="p-8 grid grid-cols-2 md:grid-cols-5 gap-6">
                  {[
                    { label: 'Moisture', value: liveReadings.moisture },
                    { label: 'Humidity', value: `${liveReadings.humidity}%` },
                    { label: 'Temperature', value: `${liveReadings.temperature}°C` },
                    { label: 'RGB Distance', value: `${liveReadings.rgbDistance} cm` },
                    { label: 'Servo Distance', value: `${liveReadings.servoDistance} cm` },
                  ].map((sensor, idx) => (
                    <div key={idx} className="flex flex-col items-center p-6 bg-smart-bg dark:bg-gray-900 rounded-[35px] border border-smart-light/10 shadow-inner">
                      <span className="text-[9px] font-black text-smart-gray uppercase mb-3 tracking-widest">{sensor.label}</span>
                      <span className="text-3xl font-black text-smart-dark dark:text-white italic tracking-tighter">{sensor.value || 0}</span>
                    </div>
                  ))}
                </div>
                <div className="bg-smart-bg/30 dark:bg-gray-900/30 px-8 py-6 border-t border-smart-light/10 flex flex-wrap gap-4 items-center">
                  <h3 className="text-[10px] font-black text-smart-gray uppercase tracking-tighter mr-4 italic">Remote Actuators</h3>
                  <div className="flex bg-white dark:bg-gray-800 p-2 rounded-2xl border border-smart-light/10 shadow-sm">
                    <span className="px-4 text-[10px] font-black text-smart-gray uppercase tracking-widest flex items-center">Gate Servo</span>
                    <button onClick={() => handleHardwareCommand('SERVO_ON')} className="px-6 py-2 bg-green-500 hover:bg-green-600 text-white rounded-xl text-[10px] font-black uppercase transition-all">Open</button>
                    <button onClick={() => handleHardwareCommand('SERVO_OFF')} className="px-6 py-2 bg-red-500 hover:bg-red-600 text-white rounded-xl text-[10px] font-black uppercase transition-all ml-2">Close</button>
                  </div>
                  <div className="flex bg-white dark:bg-gray-800 p-2 rounded-2xl border border-smart-light/10 shadow-sm">
                    <span className="px-4 text-[10px] font-black text-smart-gray uppercase tracking-widest flex items-center">Flood Lamp</span>
                    <button onClick={() => handleHardwareCommand('LAMP_ON')} className="px-6 py-2 bg-green-500 hover:bg-green-600 text-white rounded-xl text-[10px] font-black uppercase transition-all">ON</button>
                    <button onClick={() => handleHardwareCommand('LAMP_OFF')} className="px-6 py-2 bg-red-500 hover:bg-red-600 text-white rounded-xl text-[10px] font-black uppercase transition-all ml-2">OFF</button>
                  </div>
                </div>
              </div>

              <div id="hardware-alerts-panel" className="bg-[#1e293b] rounded-[32px] border border-gray-700/50 p-8 flex flex-col gap-6 shadow-2xl">
                <div className="flex justify-between items-center">
                  <h2 className="text-2xl font-bold flex items-center gap-3 text-white"><FiSearch className="text-red-500" /> Hardware Alerts Log</h2>
                </div>
                <div className="overflow-x-auto max-h-[600px] custom-scrollbar">
                  <table className="w-full text-left border-collapse min-w-[800px]">
                    <thead>
                      <tr className="text-[10px] font-black uppercase text-gray-400 tracking-widest border-b border-gray-700 pb-4">
                        <th className="py-4 px-2">Time</th><th className="py-4 px-2 text-center">Type</th><th className="py-4 px-2">Alert Details</th>
                      </tr>
                    </thead>
                    <tbody>
                      {alerts.map((alert, idx) => (
                        <tr key={idx} className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors h-16">
                          <td className="py-5 px-2 align-top"><div className="text-sm font-bold text-gray-300">{alert.timeString || alert.time}</div><div className="text-[10px] text-gray-500 font-bold uppercase mt-1">{new Date(alert.createdAt).toLocaleDateString()}</div></td>
                          <td className="py-5 px-2 text-center align-top"><span className={`inline-block w-20 py-1.5 rounded-md text-[9px] font-black uppercase tracking-wider border ${alert.type === 'warning' ? 'bg-yellow-100 text-yellow-800 border-yellow-200' : alert.type === 'error' ? 'bg-red-100 text-red-800 border-red-200' : alert.type === 'success' ? 'bg-green-100 text-green-800 border-green-200' : 'bg-blue-100 text-blue-800 border-blue-200'}`}>{alert.type}</span></td>
                          <td className="py-5 px-2 text-gray-200 font-medium text-sm leading-relaxed">{alert.message}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'access' && isSuperAdmin && (
            <div className="space-y-10 animate-fade-in">
              <div className="bg-[#1e293b] rounded-[32px] border border-gray-700/50 p-8 flex flex-col gap-6 shadow-2xl">
                <div className="flex justify-between items-center">
                  <h2 className="text-2xl font-bold flex items-center gap-3 text-white"><FiUsers className="text-purple-500" /> Sub-Admin Registry</h2>
                  <span className="bg-gray-800 border border-gray-700 px-5 py-2.5 rounded-xl text-xs font-black text-gray-300 tracking-widest shadow-inner uppercase">TOTAL NODES: {subAdmins.length}</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse min-w-[900px]">
                    <thead>
                      <tr className="text-[10px] font-black uppercase text-gray-400 tracking-widest border-b border-gray-700 pb-4">
                        <th className="py-4 px-2">Name</th><th className="py-4 px-2">Email</th><th className="py-4 px-2 text-center">Tickets</th><th className="py-4 px-2 text-center">Security Status</th><th className="py-4 px-2 text-right">Access Control</th>
                      </tr>
                    </thead>
                    <tbody>
                      {subAdmins.map(admin => (
                        <tr key={admin._id} className="border-b border-gray-800/50 hover:bg-gray-800/30 h-16 transition-colors">
                          <td className="py-4 px-2 text-sm text-white font-medium">{admin.name}</td>
                          <td className="py-4 px-2 text-sm text-gray-400">{admin.email}</td>
                          <td className="py-4 px-2 text-center"><span className="bg-gray-700 text-white text-[10px] font-black px-3 py-1 rounded-full">{admin.ticketCount || 0}</span></td>
                          <td className="py-4 px-2 text-center">
                            <span className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase ${admin.isRestricted ? 'bg-red-500/10 text-red-400 border border-red-500/20' : 'bg-green-500/10 text-green-400 border border-green-500/20'}`}>
                              {admin.isRestricted ? 'Restricted' : 'Active'}
                            </span>
                          </td>
                          <td className="py-4 px-2 align-middle">
                            <div className="flex justify-end gap-2 whitespace-nowrap">
                              {admin.email !== superAdminEmail ? (
                                <>
                                  <button onClick={() => navigate(`/admin/users/${admin._id}/tickets?fromTab=${activeTab}`)} className="bg-transparent border border-gray-600 px-4 py-2 rounded-xl text-[10px] font-black uppercase hover:bg-gray-700 transition">Tickets</button>
                                  <button onClick={() => handleRestrictUser(admin._id, admin.isRestricted)} className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase border transition ${admin.isRestricted ? 'border-green-500/30 text-green-400' : 'border-red-500/30 text-red-400'}`}>{admin.isRestricted ? 'Enable' : 'Restrict'}</button>
                                  <button onClick={() => handleDeleteUser(admin._id)} className="bg-transparent text-red-400 border border-red-800/50 px-4 py-2 rounded-xl text-[10px] font-black uppercase hover:bg-red-900/30 transition">Delete</button>
                                </>
                              ) : <span className="text-[10px] font-black text-gray-500 uppercase italic pr-4 tracking-widest">System Owner</span>}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className={`bg-[#1e293b] rounded-[32px] border border-gray-700/50 overflow-hidden transition-all duration-300 w-full ${isSubAdminProvisioningExpanded ? 'h-auto flex flex-col' : ''}`}>
                <div onClick={() => setIsSubAdminProvisioningExpanded(!isSubAdminProvisioningExpanded)} className="bg-[#0f172a]/50 px-8 py-6 border-b border-gray-700/50 flex justify-between items-center cursor-pointer hover:bg-[#0f172a]/80 transition-colors">
                  <h2 className="text-xl font-bold text-white flex items-center tracking-wide"><FiUsers className="w-6 h-6 mr-3 text-purple-500" /> Sub-Admin Provisioning</h2>
                  <svg className={`w-6 h-6 transform transition-transform duration-300 ${isSubAdminProvisioningExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                </div>
                {isSubAdminProvisioningExpanded && (
                  <div className="p-8">
                    <form onSubmit={handleCreateSubAdmin} className="space-y-6">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div><label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Full Name</label><input type="text" placeholder="e.g. John Doe" value={newAdminName} onChange={(e) => setNewAdminName(e.target.value)} className="w-full px-5 py-3.5 rounded-2xl border border-gray-700/50 bg-[#0f172a] text-white focus:ring-2 focus:ring-purple-500/50 outline-none font-mono text-sm shadow-inner" required /></div>
                        <div><label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Email</label><input type="email" placeholder="e.g. admin@smartpark.com" value={newAdminEmail} onChange={(e) => setNewAdminEmail(e.target.value)} className="w-full px-5 py-3.5 rounded-2xl border border-gray-700/50 bg-[#0f172a] text-white focus:ring-2 focus:ring-purple-500/50 outline-none font-mono text-sm shadow-inner" required /></div>
                        <div><label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Password</label><input type="password" placeholder="••••••••" value={newAdminPassword} onChange={(e) => setNewAdminPassword(e.target.value)} className="w-full px-5 py-3.5 rounded-2xl border border-gray-700/50 bg-[#0f172a] text-white focus:ring-2 focus:ring-purple-500/50 outline-none font-mono text-sm shadow-inner" required /></div>
                      </div>
                      <div className="p-6 rounded-2xl bg-[#0f172a]/80 border border-blue-900/30 shadow-inner">
                        <h3 className="text-xs font-black text-blue-400 uppercase tracking-widest mb-4">Network Binding</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <input type="text" placeholder="IP: 192.168.1.50" value={newAdminIp} onChange={(e) => setNewAdminIp(e.target.value)} className="w-full px-5 py-3.5 rounded-2xl border border-gray-700/50 bg-[#1e293b] text-white focus:ring-2 focus:ring-blue-500/50 outline-none font-mono text-sm" required />
                          <input type="text" placeholder="MAC (Optional)" value={newAdminMac} onChange={(e) => setNewAdminMac(e.target.value)} className="w-full px-5 py-3.5 rounded-2xl border border-gray-700/50 bg-[#1e293b] text-white focus:ring-2 focus:ring-blue-500/50 outline-none font-mono text-sm" />
                        </div>
                      </div>
                      <div className="flex justify-end pt-2"><button type="submit" className="px-10 py-3.5 bg-purple-600 hover:bg-purple-500 text-white rounded-xl font-black uppercase tracking-widest text-[11px] shadow-lg transition-all transform hover:-translate-y-0.5 active:scale-95">ADD</button></div>
                    </form>
                  </div>
                )}
              </div>

              {/* Admin IP Whitelist */}
              <div className="bg-[#1e293b] rounded-[32px] border border-gray-700/50 p-8 flex flex-col gap-6 shadow-2xl">
                <div className="flex justify-between items-center">
                  <h2 className="text-2xl font-bold flex items-center gap-3 text-white"><FiSearch className="text-blue-500" /> Admin IP Whitelist</h2>
                  <div className="flex gap-4">
                    <button onClick={handleExportWhitelistedIPsCSV} className="bg-gray-800 text-gray-300 border border-gray-700 px-5 py-2.5 rounded-xl text-xs font-black tracking-widest flex items-center gap-2 hover:bg-gray-700 transition">EXPORT CSV</button>
                    <span className="bg-gray-800 border border-gray-700 px-5 py-2.5 rounded-xl text-xs font-black text-gray-300 tracking-widest shadow-inner">ALLOWED: {totalWhitelistedIPs}</span>
                  </div>
                </div>
                <form onSubmit={handleAddWhitelistIP} className="grid grid-cols-1 md:grid-cols-4 gap-4 bg-[#0f172a]/50 p-6 rounded-2xl border border-gray-700/30 shadow-inner">
                  <input type="text" value={newWhitelistIP} onChange={e => setNewWhitelistIP(e.target.value)} className="bg-[#0f172a] border border-gray-700/50 rounded-xl px-4 py-3 text-sm outline-none text-white focus:ring-2 focus:ring-blue-500/50 font-mono" placeholder="IP Address" required />
                  <input type="text" value={newWhitelistMac} onChange={e => setNewWhitelistMac(e.target.value)} className="bg-[#0f172a] border border-gray-700/50 rounded-xl px-4 py-3 text-sm outline-none text-white focus:ring-2 focus:ring-blue-500/50 font-mono" placeholder="MAC (Optional)" />
                  <input type="text" value={newWhitelistDesc} onChange={e => setNewWhitelistDesc(e.target.value)} className="bg-[#0f172a] border border-gray-700/50 rounded-xl px-4 py-3 text-sm outline-none text-white focus:ring-2 focus:ring-blue-500/50" placeholder="Description" />
                  <button type="submit" className="bg-blue-600 hover:bg-blue-500 text-white font-black rounded-xl uppercase text-xs tracking-widest shadow-lg transition-all active:scale-95">Whitelist IP</button>
                </form>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse min-w-[900px]">
                    <thead>
                      <tr className="text-[10px] font-black uppercase text-gray-400 tracking-widest border-b border-gray-700 pb-4">
                        <th className="py-4 px-2">IP Address</th><th className="py-4 px-2">MAC Address</th><th className="py-4 px-2">Description</th><th className="py-4 px-2 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {whitelistedIPs.map(ip => (
                        <tr key={ip._id} className="border-b border-gray-800/50 hover:bg-gray-800/30 h-14 transition-colors">
                          <td className="py-2 px-2 font-mono text-sm text-blue-400">{ip.ipAddress}</td>
                          <td className="py-2 px-2 font-mono text-xs text-gray-500">{ip.macAddress || 'N/A'}</td>
                          <td className="py-2 px-2 text-sm text-gray-300">{ip.description || 'N/A'}</td>
                          <td className="py-2 px-2 text-right"><button onClick={() => handleRemoveWhitelistIP(ip._id)} className="text-red-400 hover:text-red-300 uppercase font-black text-[10px] tracking-widest transition-colors">Remove</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'security' && isSuperAdmin && (
            <div className="space-y-10 animate-fade-in">
              <div className="bg-[#1e293b] rounded-[32px] border border-gray-700/50 p-8 flex flex-col gap-6 shadow-2xl">
                <h2 className="text-2xl font-bold flex items-center gap-3 text-white"><FiSearch className="text-purple-500" /> Security Audit Log</h2>
                <div className="overflow-x-auto max-h-[600px] custom-scrollbar">
                  <table className="w-full text-left border-collapse min-w-[900px]">
                    <thead>
                      <tr className="text-[10px] font-black uppercase text-gray-400 border-b border-gray-700 pb-4">
                        <th className="py-4 px-2">Time Entry</th><th className="py-4 px-2">Identity</th><th className="py-4 px-2">Intervention</th><th className="py-4 px-2 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {auditLogs.map(log => (
                        <tr key={log._id} className="border-b border-gray-800/50 h-16 hover:bg-gray-800/30 transition-colors">
                          <td className="text-[11px] text-gray-500 font-bold px-2">{new Date(log.createdAt).toLocaleString()}</td>
                          <td className="text-xs font-black text-smart-light italic px-2">{log.email}</td>
                          <td className="text-[12px] font-black uppercase text-white px-2">{log.action || 'Authentication'}</td>
                          <td className="text-center px-2"><span className={`px-4 py-1 rounded-full text-[9px] uppercase font-black border ${log.status === 'success' ? 'bg-green-500/10 text-green-500 border-green-500/20' : 'bg-red-500/10 text-red-500 border-red-500/20'}`}>{log.status}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

        </main>
      </div>
    </div>
  );
};

export default AdminDashboard;
