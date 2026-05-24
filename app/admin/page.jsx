'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { socket } from '../../socket';
import { useUI } from '../../context/UIContext';
import { useTelemetry } from '../../context/TelemetryContext';
import api from '../../api';
import AdminHeader from '../../components/AdminHeader';
import WidgetErrorBoundary from '../../components/WidgetErrorBoundary';

// Dynamic import for client-only libraries if needed, 
// but we can also check for window object.

const AdminDashboard = () => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { showModal, showConfirm } = useUI();
  const { liveReadings } = useTelemetry();

  const [activeTab, setActiveTab] = useState(searchParams.get('tab') || 'users');
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);

  // User Management State
  const [users, setUsers] = useState([]);
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [userPage, setUserPage] = useState(1);
  const [totalUserPages, setTotalUserPages] = useState(1);
  const [totalUsersCount, setTotalUsersCount] = useState(0);

  // Ticket Management State
  const [tickets, setTickets] = useState([]);
  const [ticketSearchQuery, setTicketSearchQuery] = useState('');
  const [ticketPage, setTicketPage] = useState(1);
  const [totalTicketPages, setTotalTicketPages] = useState(1);
  const [totalTicketsCount, setTotalTicketsCount] = useState(0);
  const [pendingCashTickets, setPendingCashTickets] = useState([]);

  // Hardware Alerts State
  const [alerts, setAlerts] = useState([]);
  const [alertFilterType, setAlertFilterType] = useState('all');
  const [alertPage, setAlertPage] = useState(1);
  const [totalAlertPages, setTotalAlertPages] = useState(1);
  const [totalAlertsCount, setTotalAlertsCount] = useState(0);
  const [isHardwareAlertsExpanded, setIsHardwareAlertsExpanded] = useState(true);

  // Audit Logs State
  const [auditLogs, setAuditLogs] = useState([]);
  const [auditSearchQuery, setAuditSearchQuery] = useState('');
  const [auditPage, setAuditPage] = useState(1);
  const [totalAuditPages, setTotalAuditPages] = useState(1);
  const [totalAuditCount, setTotalAuditCount] = useState(0);
  const [isAuditLogsExpanded, setIsAuditLogsExpanded] = useState(true);

  // Banned IPs State
  const [bannedIPs, setBannedIPs] = useState([]);
  const [bannedIPsSearchQuery, setBannedIPsSearchQuery] = useState('');
  const [bannedIPPage, setBannedIPPage] = useState(1);
  const [totalBannedIPPages, setTotalBannedIPPages] = useState(1);
  const [totalBannedIPCount, setTotalBannedIPCount] = useState(0);
  const [isBannedIPsExpanded, setIsBannedIPsExpanded] = useState(true);

  // Whitelist State
  const [whitelistedIPs, setWhitelistedIPs] = useState([]);
  const [whitelistedIPsSearchQuery, setWhitelistedIPsSearchQuery] = useState('');
  const [whitelistPage, setWhitelistPage] = useState(1);
  const [whitelistTotalPages, setWhitelistTotalPages] = useState(1);
  const [whitelistHasMore, setWhitelistHasMore] = useState(false);
  const [newWhitelistIP, setNewWhitelistIP] = useState('');
  const [newWhitelistMAC, setNewWhitelistMAC] = useState('');
  const [newWhitelistDesc, setNewWhitelistDesc] = useState('');
  const [isLoadingWhitelist, setIsLoadingWhitelist] = useState(false);
  const [isWhitelistedIPsExpanded, setIsWhitelistedIPsExpanded] = useState(true);

  // Backup State
  const [backups, setBackups] = useState([]);
  const [isBackupsExpanded, setIsBackupsExpanded] = useState(true);
  const [restoringBackupFilename, setRestoringBackupFilename] = useState(null);

  // QR Scanner State
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [manualTicketId, setManualTicketId] = useState('');
  const [scanMessage, setScanMessage] = useState(null);
  const [isLockedUI, setIsLockedUI] = useState(false);
  const scannerRef = useRef(null);

  // Loading States
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const [isLoadingTickets, setIsLoadingTickets] = useState(false);
  const [isLoadingAlerts, setIsLoadingAlerts] = useState(false);
  const [isLoadingAudit, setIsLoadingAudit] = useState(false);
  const [isLoadingBanned, setIsLoadingBanned] = useState(false);

  // Check auth and role
  useEffect(() => {
    const token = localStorage.getItem('token');
    const role = localStorage.getItem('role');
    if (!token || (role !== 'admin' && role !== 'sub-admin')) {
      router.push('/');
    } else {
      setIsSuperAdmin(role === 'admin');
    }
  }, [router]);

  // Fetch Data Based on Active Tab
  useEffect(() => {
    if (activeTab === 'users') fetchUsers();
    if (activeTab === 'tickets') {
      fetchTickets();
      fetchPendingCashTickets();
    }
    if (activeTab === 'hardware') fetchDashboardAlerts('all');
    if (activeTab === 'system') {
      if (isSuperAdmin) {
        fetchAuditLogs();
        fetchBannedIPs();
        fetchWhitelistedIPs();
        fetchBackups();
      }
    }
  }, [activeTab, isSuperAdmin]);

  // --- Fetch Functions ---
  const fetchUsers = async (page = 1, query = '') => {
    setIsLoadingUsers(true);
    try {
      const res = await api.get('/admin/users', {
        params: { page, limit: 10, search: query },
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      setUsers(res.data.users);
      setTotalUserPages(res.data.totalPages);
      setUserPage(res.data.currentPage);
      setTotalUsersCount(res.data.totalUsers);
    } catch (err) {
      console.error('Failed to fetch users');
    } finally {
      setIsLoadingUsers(false);
    }
  };

  const fetchTickets = async (page = 1, query = '') => {
    setIsLoadingTickets(true);
    try {
      const res = await api.get('/admin/tickets', {
        params: { page, limit: 10, search: query },
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      setTickets(res.data.tickets);
      setTotalTicketPages(res.data.totalPages);
      setTicketPage(res.data.currentPage);
      setTotalTicketsCount(res.data.totalTickets);
    } catch (err) {
      console.error('Failed to fetch tickets');
    } finally {
      setIsLoadingTickets(false);
    }
  };

  const fetchPendingCashTickets = async () => {
    try {
      const res = await api.get('/admin/tickets/pending-cash', {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      setPendingCashTickets(res.data);
    } catch (err) {
      console.error('Failed to fetch pending cash tickets');
    }
  };

  const fetchDashboardAlerts = async (type = 'all', page = 1) => {
    setIsLoadingAlerts(true);
    try {
      const res = await api.get('/admin/hardware-alerts', {
        params: { type, page, limit: 10 },
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      setAlerts(res.data.alerts);
      setTotalAlertPages(res.data.totalPages);
      setAlertPage(res.data.currentPage);
      setTotalAlertsCount(res.data.totalAlerts);
    } catch (err) {
      console.error('Failed to fetch hardware alerts');
    } finally {
      setIsLoadingAlerts(false);
    }
  };

  const fetchAuditLogs = async (page = 1, query = '') => {
    setIsLoadingAudit(true);
    try {
      const res = await api.get('/admin/audit-logs', {
        params: { page, limit: 10, search: query },
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      setAuditLogs(res.data.logs);
      setTotalAuditPages(res.data.totalPages);
      setAuditPage(res.data.currentPage);
      setTotalAuditCount(res.data.totalCount);
    } catch (err) {
      console.error('Failed to fetch audit logs');
    } finally {
      setIsLoadingAudit(false);
    }
  };

  const fetchBannedIPs = async (page = 1, query = '') => {
    setIsLoadingBanned(true);
    try {
      const res = await api.get('/admin/banned-ips', {
        params: { page, limit: 10, search: query },
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      setBannedIPs(res.data.bannedIPs);
      setTotalBannedIPPages(res.data.totalPages);
      setBannedIPPage(res.data.currentPage);
      setTotalBannedIPCount(res.data.totalCount);
    } catch (err) {
      console.error('Failed to fetch banned IPs');
    } finally {
      setIsLoadingBanned(false);
    }
  };

  const fetchWhitelistedIPs = async (page = 1, query = '') => {
    setIsLoadingWhitelist(true);
    try {
      const res = await api.get('/admin/whitelisted-ips', {
        params: { page, limit: 10, search: query },
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      if (page === 1) {
        setWhitelistedIPs(res.data.whitelistedIPs);
      } else {
        setWhitelistedIPs(prev => [...prev, ...res.data.whitelistedIPs]);
      }
      setWhitelistTotalPages(res.data.totalPages);
      setWhitelistPage(res.data.currentPage);
      setWhitelistHasMore(res.data.currentPage < res.data.totalPages);
    } catch (err) {
      console.error('Failed to fetch whitelisted IPs');
    } finally {
      setIsLoadingWhitelist(false);
    }
  };

  const fetchBackups = async () => {
    try {
      const res = await api.get('/admin/backups', {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      setBackups(res.data);
    } catch (err) {
      console.error('Failed to fetch backups');
    }
  };

  // --- Search Handlers ---
  const handleUserSearch = (e) => {
    const q = e.target.value;
    setUserSearchQuery(q);
    fetchUsers(1, q);
  };

  const handleTicketSearch = (e) => {
    const q = e.target.value;
    setTicketSearchQuery(q);
    fetchTickets(1, q);
  };

  const handleAuditSearch = (e) => {
    const q = e.target.value;
    setAuditSearchQuery(q);
    fetchAuditLogs(1, q);
  };

  // --- Pagination Handlers ---
  const handleUserPageChange = (newPage) => {
    fetchUsers(newPage, userSearchQuery);
  };

  const handleTicketPageChange = (newPage) => {
    fetchTickets(newPage, ticketSearchQuery);
  };

  const handleAlertPageChange = (newPage) => {
    fetchDashboardAlerts(alertFilterType, newPage);
  };

  const handleAuditPageChange = (newPage) => {
    fetchAuditLogs(newPage, auditSearchQuery);
  };

  const handleLoadMoreWhitelisted = () => {
    fetchWhitelistedIPs(whitelistPage + 1, whitelistedIPsSearchQuery);
  };

  // --- Action Handlers ---
  const handleRestrictUser = async (userId, email, currentStatus) => {
    const action = currentStatus ? 'unrestrict' : 'restrict';
    const confirmed = await showConfirm(`Are you sure you want to ${action} ${email}?`, `${action.toUpperCase()} USER`);
    if (!confirmed) return;

    try {
      await api.patch(`/admin/users/${userId}/restrict`, { isRestricted: !currentStatus }, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      fetchUsers(userPage, userSearchQuery);
      showModal(`User ${email} has been ${action}ed.`, 'SUCCESS', 'success');
    } catch (err) {
      showModal(`Failed to ${action} user.`, 'ERROR', 'error');
    }
  };

  const handleVerifyUser = async (userId, email) => {
    try {
      await api.patch(`/admin/users/${userId}/verify`, {}, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      fetchUsers(userPage, userSearchQuery);
      showModal(`User ${email} verified.`, 'SUCCESS', 'success');
    } catch (err) {
      showModal('Failed to verify user.', 'ERROR', 'error');
    }
  };

  const handleActivateCashTicket = async (ticketId) => {
    try {
      await api.patch(`/admin/tickets/${ticketId}/activate-cash`, {}, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      fetchTickets(ticketPage, ticketSearchQuery);
      fetchPendingCashTickets();
      showModal('Ticket activated successfully!', 'SUCCESS', 'success');
    } catch (err) {
      showModal('Failed to activate ticket.', 'ERROR', 'error');
    }
  };

  const handleClearAuditLogs = async () => {
    const confirmed = await showConfirm('Permanent clear of security logs?', 'WIPE LOGS');
    if (!confirmed) return;

    try {
      await api.delete('/admin/audit-logs', {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      fetchAuditLogs();
      showModal('Audit logs cleared.', 'WIPE COMPLETE', 'success');
    } catch (err) {
      showModal('Failed to clear logs.', 'ERROR', 'error');
    }
  };

  const handleClearHardwareAlerts = async () => {
    const confirmed = await showConfirm('Clear all hardware alert history?', 'CLEAR ALERTS');
    if (!confirmed) return;

    try {
      await api.delete('/admin/hardware-alerts', {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      fetchDashboardAlerts();
      showModal('Alerts cleared.', 'CLEARED', 'success');
    } catch (err) {
      showModal('Failed to clear alerts.', 'ERROR', 'error');
    }
  };

  const handleUnbanIP = async (ip) => {
    try {
      await api.delete(`/admin/banned-ips/${ip}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      fetchBannedIPs();
      showModal(`IP ${ip} unbanned.`, 'SUCCESS', 'success');
    } catch (err) {
      showModal('Failed to unban IP.', 'ERROR', 'error');
    }
  };

  const handleAddWhitelistIP = async (e) => {
    e.preventDefault();
    try {
      await api.post('/admin/whitelisted-ips', { 
        ipAddress: newWhitelistIP, 
        macAddress: newWhitelistMAC, 
        description: newWhitelistDesc 
      }, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      setNewWhitelistIP('');
      setNewWhitelistMAC('');
      setNewWhitelistDesc('');
      fetchWhitelistedIPs();
      showModal('IP whitelisted successfully.', 'SUCCESS', 'success');
    } catch (err) {
      showModal('Failed to whitelist IP.', 'ERROR', 'error');
    }
  };

  const handleRemoveWhitelistIP = async (id) => {
    try {
      await api.delete(`/admin/whitelisted-ips/${id}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      fetchWhitelistedIPs();
      showModal('IP removed from whitelist.', 'SUCCESS', 'success');
    } catch (err) {
      showModal('Failed to remove IP.', 'ERROR', 'error');
    }
  };

  const handleCreateBackup = async () => {
    try {
      await api.post('/admin/backups', {}, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      fetchBackups();
      showModal('System backup created successfully.', 'SUCCESS', 'success');
    } catch (err) {
      showModal('Failed to create backup.', 'ERROR', 'error');
    }
  };

  const handleDownloadBackup = async (filename) => {
    try {
      const response = await api.get(`/admin/backups/${filename}`, {
        responseType: 'blob',
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) {
      showModal('Failed to download backup.', 'ERROR', 'error');
    }
  };

  const handleDeleteBackup = async (filename) => {
    const confirmed = await showConfirm(`Delete backup ${filename}?`, 'DELETE BACKUP');
    if (!confirmed) return;

    try {
      await api.delete(`/admin/backups/${filename}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      fetchBackups();
      showModal('Backup deleted.', 'SUCCESS', 'success');
    } catch (err) {
      showModal('Failed to delete backup.', 'ERROR', 'error');
    }
  };

  const handleRestoreBackup = async (filename) => {
    const confirmed = await showConfirm(`Restore system to state from ${filename}? Existing data will be overwritten!`, 'CRITICAL RESTORE');
    if (!confirmed) return;

    setRestoringBackupFilename(filename);
    try {
      await api.post(`/admin/backups/${filename}/restore`, {}, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      showModal('Restore complete. Reloading data...', 'RESTORE SUCCESS', 'success');
      setTimeout(() => window.location.reload(), 2000);
    } catch (err) {
      showModal('Restore failed.', 'ERROR', 'error');
    } finally {
      setRestoringBackupFilename(null);
    }
  };

  const handleHardwareCommand = async (command) => {
    try {
      await api.post('/hardware/control', { command }, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      showModal(`Command ${command} transmitted.`, 'HARDWARE LINK', 'success');
    } catch (err) {
      showModal('Hardware link failed.', 'ERROR', 'error');
    }
  };

  // --- QR Scanner Functions ---
  useEffect(() => {
    let html5QrCode = null;
    
    const startScanner = async () => {
      if (typeof window === 'undefined') return;
      
      const { Html5Qrcode } = await import('html5-qrcode');
      html5QrCode = new Html5Qrcode("reader");
      scannerRef.current = html5QrCode;

      const qrCodeSuccessCallback = (decodedText) => {
        handleTicketScan(decodedText);
      };

      const config = { fps: 10, qrbox: { width: 250, height: 250 } };
      
      try {
        await html5QrCode.start({ facingMode: "environment" }, config, qrCodeSuccessCallback);
        setIsCameraActive(true);
      } catch (err) {
        console.error("Camera start error:", err);
        setScanMessage({ type: 'error', text: 'Optical sensor blocked or unavailable.' });
      }
    };

    if (activeTab === 'hardware' && isCameraActive && !isLockedUI) {
      startScanner();
    }

    return () => {
      if (html5QrCode && html5QrCode.isScanning) {
        html5QrCode.stop().catch(e => console.error("Scanner stop error", e));
      }
    };
  }, [activeTab, isCameraActive, isLockedUI]);

  const handleTicketScan = async (ticketId) => {
    if (isLockedUI) return;
    setIsLockedUI(true);
    setScanMessage({ type: 'info', text: `Verifying Token: ${ticketId.slice(-8)}...` });

    try {
      const res = await api.get(`/admin/tickets/scan/${ticketId}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      setScanMessage({ type: 'success', text: `ACCESS GRANTED: ${res.data.ticketType.toUpperCase()} PASS VALID.` });
      // Trigger Gate Actuator
      handleHardwareCommand('SERVO_ON');
    } catch (err) {
      setScanMessage({ type: 'error', text: err.response?.data?.message || 'INVALID ACCESS TOKEN.' });
    }
  };

  const handleToggleSensor = () => {
    setIsCameraActive(!isCameraActive);
    setScanMessage(null);
  };

  const handleNextScan = () => {
    setIsLockedUI(false);
    setScanMessage(null);
  };

  const handleManualOverride = (e) => {
    e.preventDefault();
    if (manualTicketId) handleTicketScan(manualTicketId);
  };

  const handleUnlockScanner = () => {
    setIsLockedUI(false);
    setScanMessage(null);
  };

  const handleToggleCamera = () => {
    setIsCameraActive(!isCameraActive);
  };

  const handleFileScan = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (typeof window === 'undefined') return;
    const { Html5Qrcode } = await import('html5-qrcode');
    const html5QrCode = new Html5Qrcode("reader");

    try {
      const decodedText = await html5QrCode.scanFile(file, true);
      handleTicketScan(decodedText);
    } catch (err) {
      setScanMessage({ type: 'error', text: 'No readable QR code found in file.' });
    }
  };

  return (
    <div className="min-h-screen bg-smart-bg dark:bg-black font-sans text-smart-dark dark:text-gray-200 transition-colors duration-300">
      <AdminHeader />
      
      <div className="max-w-7xl mx-auto px-4 md:px-6 py-8 md:py-12">
        {/* Navigation Tabs */}
        <div className="flex bg-white dark:bg-gray-800 p-2 rounded-3xl shadow-xl mb-8 md:mb-12 border border-smart-light/10 overflow-x-auto scrollbar-hide">
          {[
            { id: 'users', label: 'Users', icon: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z' },
            { id: 'tickets', label: 'Tickets', icon: 'M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z' },
            { id: 'hardware', label: 'Hardware', icon: 'M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z' },
            { id: 'system', label: 'System', icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z' }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 flex items-center justify-center space-x-2 md:space-x-3 py-3 md:py-4 px-4 md:px-6 rounded-2xl font-black text-xs md:text-sm uppercase tracking-widest transition-all whitespace-nowrap ${activeTab === tab.id ? 'bg-smart-dark dark:bg-smart-light text-white dark:text-smart-dark shadow-xl scale-105' : 'text-smart-gray dark:text-gray-500 hover:bg-smart-bg dark:hover:bg-gray-700'}`}
            >
              <svg className="w-4 h-4 md:w-5 md:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d={tab.icon} />
              </svg>
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        <main className="animate-fade-in">
          {/* Users Tab */}
          {activeTab === 'users' && (
            <div className="bg-white dark:bg-gray-800 rounded-[40px] shadow-2xl border border-smart-light/10 dark:border-gray-700 overflow-hidden">
              <div className="bg-smart-bg dark:bg-gray-900 px-8 py-6 border-b border-smart-light/10 flex flex-col md:flex-row justify-between items-center gap-6">
                <h2 className="text-2xl font-black text-smart-dark dark:text-white italic tracking-tighter uppercase">User Registry</h2>
                <div className="relative w-full md:max-w-md">
                  <input
                    type="text"
                    placeholder="SEARCH BY NAME OR EMAIL..."
                    value={userSearchQuery}
                    onChange={handleUserSearch}
                    className="w-full pl-12 pr-4 py-4 rounded-2xl border-2 border-smart-light/20 bg-white dark:bg-gray-800 text-smart-dark dark:text-white focus:ring-4 focus:ring-smart-light/20 focus:border-smart-light outline-none transition font-mono text-[10px] font-black tracking-widest"
                  />
                  <svg className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-smart-light/60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
                  </svg>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-smart-bg dark:bg-gray-900/50 text-smart-gray dark:text-gray-500 text-[10px] font-black uppercase tracking-widest border-b border-smart-light/10">
                      <th className="px-6 py-5">Verified</th>
                      <th className="px-6 py-5">Full Identity</th>
                      <th className="px-6 py-5">Status</th>
                      <th className="px-6 py-5">Role</th>
                      <th className="px-6 py-5 text-right">Administrative Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-smart-bg dark:divide-gray-700">
                    {users.map((user) => (
                      <tr key={user._id} className="hover:bg-smart-bg/30 dark:hover:bg-gray-700/30 transition-colors">
                        <td className="px-6 py-5">
                          {user.isVerified ? (
                            <svg className="w-6 h-6 text-smart-light" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                            </svg>
                          ) : (
                            <button onClick={() => handleVerifyUser(user._id, user.email)} className="text-gray-300 dark:text-gray-600 hover:text-smart-light transition-colors">
                              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                            </button>
                          )}
                        </td>
                        <td className="px-6 py-5">
                          <p className="font-black text-smart-dark dark:text-white uppercase tracking-tight text-sm">{user.name}</p>
                          <p className="text-xs font-bold text-smart-gray dark:text-gray-500 font-mono mt-0.5">{user.email}</p>
                        </td>
                        <td className="px-6 py-5">
                          <span className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest border ${user.isRestricted ? 'bg-red-50 text-red-600 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800' : 'bg-green-50 text-green-600 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800'}`}>
                            {user.isRestricted ? 'Restricted' : 'Operational'}
                          </span>
                        </td>
                        <td className="px-6 py-5">
                          <span className="text-[10px] font-black uppercase tracking-widest text-smart-gray dark:text-gray-400 bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded-md">
                            {user.role}
                          </span>
                        </td>
                        <td className="px-6 py-5 text-right space-x-2">
                          <button
                            onClick={() => router.push(`/admin/users/${user._id}/tickets`)}
                            className="px-4 py-2 bg-smart-bg dark:bg-gray-700 text-smart-dark dark:text-white rounded-xl text-[9px] font-black uppercase tracking-widest border border-smart-light/10 hover:bg-smart-light/10 transition-colors"
                          >
                            View Pass History
                          </button>
                          {isSuperAdmin && (
                            <button
                              onClick={() => handleRestrictUser(user._id, user.email, user.isRestricted)}
                              className={`px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-colors ${user.isRestricted ? 'bg-green-500 text-white hover:bg-green-600' : 'bg-red-500 text-white hover:bg-red-600'}`}
                            >
                              {user.isRestricted ? 'Unrestrict Access' : 'Restrict Access'}
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              
              <div className="bg-smart-bg dark:bg-gray-900 px-8 py-6 border-t border-smart-light/10 flex flex-col sm:flex-row justify-between items-center gap-4">
                <span className="text-[10px] font-black text-smart-gray dark:text-gray-500 uppercase tracking-widest">
                  Displaying {users.length} of {totalUsersCount} registered entities
                </span>
                <div className="flex space-x-2">
                  <button onClick={() => handleUserPageChange(Math.max(1, userPage - 1))} disabled={userPage === 1} className="px-5 py-2.5 bg-white dark:bg-gray-800 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors border border-smart-light/10 hover:bg-smart-light/10 disabled:opacity-30 shadow-sm">Prev</button>
                  <span className="px-5 py-2.5 text-[10px] font-black text-smart-dark dark:text-white uppercase tracking-widest">Sector {userPage} / {totalUserPages}</span>
                  <button onClick={() => handleUserPageChange(Math.min(totalUserPages, userPage + 1))} disabled={userPage === totalUserPages} className="px-5 py-2.5 bg-white dark:bg-gray-800 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors border border-smart-light/10 hover:bg-smart-light/10 disabled:opacity-30 shadow-sm">Next</button>
                </div>
              </div>
            </div>
          )}

          {/* Tickets Tab */}
          {activeTab === 'tickets' && (
            <div className="space-y-8">
              {/* Active Subscriptions Registry */}
              <div className="bg-white dark:bg-gray-800 rounded-[40px] shadow-2xl border border-smart-light/10 dark:border-gray-700 overflow-hidden">
                <div className="bg-smart-bg dark:bg-gray-900 px-8 py-6 border-b border-smart-light/10 flex flex-col md:flex-row justify-between items-center gap-6">
                  <h2 className="text-2xl font-black text-smart-dark dark:text-white italic tracking-tighter uppercase">Subscription Ledger</h2>
                  <div className="relative w-full md:max-w-md">
                    <input
                      type="text"
                      placeholder="SEARCH BY TOKEN OR EMAIL..."
                      value={ticketSearchQuery}
                      onChange={handleTicketSearch}
                      className="w-full pl-12 pr-4 py-4 rounded-2xl border-2 border-smart-light/20 bg-white dark:bg-gray-800 text-smart-dark dark:text-white focus:ring-4 focus:ring-smart-light/20 focus:border-smart-light outline-none transition font-mono text-[10px] font-black tracking-widest"
                    />
                    <svg className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-smart-light/60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
                    </svg>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-smart-bg dark:bg-gray-900/50 text-smart-gray dark:text-gray-500 text-[10px] font-black uppercase tracking-widest border-b border-smart-light/10">
                        <th className="px-6 py-5">Pass Type</th>
                        <th className="px-6 py-5">Ownership</th>
                        <th className="px-6 py-5">Validity Matrix</th>
                        <th className="px-6 py-5">Protocol</th>
                        <th className="px-6 py-5 text-right">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-smart-bg dark:divide-gray-700">
                      {tickets.map((ticket) => (
                        <tr key={ticket._id} className="hover:bg-smart-bg/30 dark:hover:bg-gray-700/30 transition-colors">
                          <td className="px-6 py-5">
                            <span className="text-[11px] font-black uppercase tracking-tighter text-smart-dark dark:text-white italic">{ticket.ticketType} Pass</span>
                            <div className="h-1 w-8 bg-smart-light/30 rounded-full mt-1"></div>
                          </td>
                          <td className="px-6 py-5">
                            <p className="font-bold text-sm text-smart-dark dark:text-white">{ticket.userId?.name || 'N/A'}</p>
                            <p className="text-[10px] font-bold text-smart-gray dark:text-gray-500 font-mono mt-0.5">{ticket.userId?.email || 'N/A'}</p>
                          </td>
                          <td className="px-6 py-5">
                            <div className="flex flex-col gap-1">
                              <span className="text-[10px] font-black uppercase tracking-widest text-smart-dark dark:text-gray-300">
                                <span className="text-gray-400">INIT:</span> {new Date(ticket.validFrom || ticket.createdAt).toLocaleDateString()}
                              </span>
                              {ticket.validUntil && (
                                <span className="text-[10px] font-black uppercase tracking-widest text-smart-dark dark:text-gray-300">
                                  <span className="text-gray-400">EXP:</span> {new Date(ticket.validUntil).toLocaleDateString()}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-5">
                            <span className="text-[10px] font-black uppercase tracking-widest text-smart-gray dark:text-gray-500 bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded-md">
                              {ticket.paymentMethod}
                            </span>
                          </td>
                          <td className="px-6 py-5 text-right">
                            <span className={`px-4 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest border ${
                              ticket.status === 'active' ? 'bg-green-50 text-green-600 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800' :
                              ticket.status === 'used' ? 'bg-gray-50 text-gray-600 border-gray-200 dark:bg-gray-800 dark:text-gray-500 dark:border-gray-700' :
                              'bg-red-50 text-red-600 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800'
                            }`}>
                              {ticket.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="bg-smart-bg dark:bg-gray-900 px-8 py-6 border-t border-smart-light/10 flex flex-col sm:flex-row justify-between items-center gap-4">
                  <span className="text-[10px] font-black text-smart-gray dark:text-gray-500 uppercase tracking-widest">
                    Ledger indexing {tickets.length} of {totalTicketsCount} total issuances
                  </span>
                  <div className="flex space-x-2">
                    <button onClick={() => handleTicketPageChange(Math.max(1, ticketPage - 1))} disabled={ticketPage === 1} className="px-5 py-2.5 bg-white dark:bg-gray-800 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors border border-smart-light/10 hover:bg-smart-light/10 disabled:opacity-30 shadow-sm">Prev</button>
                    <span className="px-5 py-2.5 text-[10px] font-black text-smart-dark dark:text-white uppercase tracking-widest">Page {ticketPage} / {totalTicketPages}</span>
                    <button onClick={() => handleTicketPageChange(Math.min(totalTicketPages, ticketPage + 1))} disabled={ticketPage === totalTicketPages} className="px-5 py-2.5 bg-white dark:bg-gray-800 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors border border-smart-light/10 hover:bg-smart-light/10 disabled:opacity-30 shadow-sm">Next</button>
                  </div>
                </div>
              </div>

              {/* Pending Cash Activations */}
              <div className="bg-white dark:bg-gray-800 rounded-[40px] shadow-2xl border border-smart-light/10 dark:border-gray-700 overflow-hidden">
                <div className="bg-amber-500 px-8 py-6 flex justify-between items-center">
                  <h2 className="text-xl font-black text-white italic tracking-tighter uppercase">Physical Payment Bridge</h2>
                  <span className="px-4 py-1.5 bg-white/20 text-white rounded-full text-[10px] font-black uppercase tracking-widest border border-white/30 backdrop-blur-md">
                    {pendingCashTickets.length} Pending Activations
                  </span>
                </div>
                <div className="p-8">
                  {pendingCashTickets.length === 0 ? (
                    <div className="text-center py-10">
                      <p className="text-smart-gray dark:text-gray-500 font-bold uppercase tracking-widest text-xs italic">No physical tokens awaiting activation.</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      {pendingCashTickets.map((ticket) => (
                        <div key={ticket._id} className="bg-smart-bg dark:bg-gray-900/50 p-6 rounded-3xl border-2 border-amber-500/20 hover:border-amber-500/50 transition-all flex flex-col justify-between">
                          <div>
                            <div className="flex justify-between items-start mb-4">
                              <span className="text-[10px] font-black uppercase tracking-widest text-amber-600 bg-amber-100 px-2.5 py-1 rounded-md">Pending Cash</span>
                              <span className="text-xl font-black text-smart-dark dark:text-white italic">{ticket.price} EGP</span>
                            </div>
                            <h4 className="font-black text-smart-dark dark:text-white uppercase tracking-tight text-sm truncate">{ticket.userId?.name}</h4>
                            <p className="text-[10px] font-bold text-smart-gray dark:text-gray-500 font-mono mt-1">{ticket.userId?.email}</p>
                            <p className="text-[9px] font-black text-amber-500 uppercase tracking-widest mt-4">Subscription: {ticket.subscriptionPlan}</p>
                          </div>
                          <button
                            onClick={() => handleActivateCashTicket(ticket._id)}
                            className="mt-6 w-full py-4 bg-amber-500 hover:bg-amber-600 text-white rounded-2xl font-black uppercase tracking-widest text-[10px] shadow-lg shadow-amber-500/20 transition-all active:scale-95"
                          >
                            Confirm Payment & Activate
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Hardware Tab */}
          {activeTab === 'hardware' && (
            <div className="animate-fade-in">
              {/* LIVE SENSOR DATA MATRIX */}
              <div className="mb-10 bg-white dark:bg-gray-800 rounded-[40px] shadow-2xl border border-smart-light/10 dark:border-gray-700 overflow-hidden">
                <div className="bg-smart-bg dark:bg-gray-900 px-8 py-6 border-b border-smart-light/10 flex justify-between items-center">
                  <h2 className="text-xl font-black text-smart-dark dark:text-white flex items-center tracking-tighter uppercase italic select-none">
                    <svg className="w-6 h-6 mr-3 text-smart-glow" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z"></path>
                    </svg>
                    Live Sensor Matrix
                  </h2>
                  <div className="flex items-center space-x-4">
                    <span className="text-[10px] font-black text-smart-gray dark:text-gray-500 uppercase tracking-widest">
                      Node IP: <span className="text-smart-dark dark:text-white">{liveReadings.ipAddress}</span>
                    </span>
                    <span className="text-[10px] font-black text-smart-gray dark:text-gray-500 uppercase tracking-widest">
                      Last Sync: <span className="text-smart-dark dark:text-white">{liveReadings.lastUpdate || 'Waiting...'}</span>
                    </span>
                  </div>
                </div>
                <div className="p-8 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-6">
                  <div className="flex flex-col items-center p-4 bg-smart-bg dark:bg-gray-900 rounded-3xl border border-smart-light/10">
                    <span className="text-[9px] font-black text-smart-gray dark:text-gray-500 uppercase tracking-widest mb-2">Moisture</span>
                    <span className="text-2xl font-black text-smart-dark dark:text-white italic">{liveReadings.moisture}</span>
                    <div className="w-full h-1 bg-gray-200 dark:bg-gray-700 rounded-full mt-2 overflow-hidden">
                      <div className="h-full bg-blue-500 transition-all duration-500" style={{ width: `${Math.min(100, (liveReadings.moisture / 1023) * 100)}%` }}></div>
                    </div>
                  </div>
                  <div className="flex flex-col items-center p-4 bg-smart-bg dark:bg-gray-900 rounded-3xl border border-smart-light/10">
                    <span className="text-[9px] font-black text-smart-gray dark:text-gray-500 uppercase tracking-widest mb-2">Humidity</span>
                    <span className="text-2xl font-black text-smart-dark dark:text-white italic">{liveReadings.humidity}%</span>
                  </div>
                  <div className="flex flex-col items-center p-4 bg-smart-bg dark:bg-gray-900 rounded-3xl border border-smart-light/10">
                    <span className="text-[9px] font-black text-smart-gray dark:text-gray-500 uppercase tracking-widest mb-2">Temperature</span>
                    <span className="text-2xl font-black text-smart-dark dark:text-white italic">{liveReadings.temperature}°C</span>
                  </div>
                  <div className="flex flex-col items-center p-4 bg-smart-bg dark:bg-gray-900 rounded-3xl border border-smart-light/10">
                    <span className="text-[9px] font-black text-smart-gray dark:text-gray-500 uppercase tracking-widest mb-2">RGB Distance</span>
                    <span className="text-2xl font-black text-smart-dark dark:text-white italic">{liveReadings.rgbDistance} cm</span>
                  </div>
                  <div className="flex flex-col items-center p-4 bg-smart-bg dark:bg-gray-900 rounded-3xl border border-smart-light/10">
                    <span className="text-[9px] font-black text-smart-gray dark:text-gray-500 uppercase tracking-widest mb-2">Servo Distance</span>
                    <span className="text-2xl font-black text-smart-dark dark:text-white italic">{liveReadings.servoDistance} cm</span>
                  </div>
                </div>

                {/* REMOTE ACTUATOR CONTROL */}
                <div className="bg-smart-bg/30 dark:bg-gray-900/30 px-8 py-6 border-t border-smart-light/10">
                  <h3 className="text-xs font-black text-smart-dark dark:text-white uppercase italic mb-6 flex items-center">
                    <svg className="w-4 h-4 mr-2 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z"></path>
                    </svg>
                    Remote Actuator Control
                  </h3>
                  <div className="flex flex-wrap gap-4">
                    <div className="flex items-center bg-white dark:bg-gray-800 p-2 rounded-2xl border border-smart-light/10 shadow-sm">
                      <span className="px-4 text-[10px] font-black text-smart-gray dark:text-gray-400 uppercase tracking-widest">Gate Servo</span>
                      <button onClick={() => handleHardwareCommand('SERVO_ON')} className="px-6 py-2 bg-green-500 hover:bg-green-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all">Open</button>
                      <button onClick={() => handleHardwareCommand('SERVO_OFF')} className="px-6 py-2 bg-red-500 hover:bg-red-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ml-2">Close</button>
                    </div>
                    <div className="flex items-center bg-white dark:bg-gray-800 p-2 rounded-2xl border border-smart-light/10 shadow-sm">
                      <span className="px-4 text-[10px] font-black text-smart-gray dark:text-gray-400 uppercase tracking-widest">System Lamp</span>
                      <button onClick={() => handleHardwareCommand('LAMP_ON')} className="px-6 py-2 bg-green-500 hover:bg-green-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all">ON</button>
                      <button onClick={() => handleHardwareCommand('LAMP_OFF')} className="px-6 py-2 bg-red-500 hover:bg-red-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ml-2">OFF</button>
                    </div>
                    <div className="flex items-center bg-white dark:bg-gray-800 p-4 rounded-2xl border border-smart-light/10 shadow-sm ml-auto">
                      <div className="flex flex-col items-end mr-4">
                        <span className="text-[9px] font-black text-smart-gray dark:text-gray-500 uppercase tracking-widest">Pump Status</span>
                        <span className={`text-[11px] font-black uppercase italic ${liveReadings.pumpStatus === 'ON' ? 'text-green-500' : 'text-red-500'}`}>{liveReadings.pumpStatus}</span>
                      </div>
                      <div className={`w-3 h-3 rounded-full ${liveReadings.pumpStatus === 'ON' ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex flex-col xl:flex-row gap-8 mb-10 items-stretch">
                {/* Gate QR Scanner */}
                <div className="bg-white dark:bg-gray-800 rounded-[40px] shadow-2xl border border-smart-light/10 dark:border-gray-700 overflow-hidden flex flex-col w-full xl:w-1/3">
                  <div className="bg-smart-bg dark:bg-gray-900 px-6 sm:px-8 py-6 border-b border-smart-light/10 flex flex-col items-center justify-center gap-4">
                    <h2 className="text-xl font-black text-smart-dark dark:text-white flex items-center tracking-tighter uppercase italic shrink-0">
                      <svg
                        className="w-6 h-6 mr-3 text-smart-light"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="2"
                          d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm14 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z"
                        ></path>
                      </svg>
                      Gate QR Scanner
                    </h2>
                    <div className="flex flex-row flex-wrap justify-center items-center gap-3">
                      <button
                        onClick={handleToggleCamera}
                        className="px-3 py-1.5 bg-smart-bg dark:bg-gray-800 hover:bg-smart-light/20 text-smart-dark dark:text-white rounded-lg text-[10px] font-black uppercase tracking-widest transition-colors shadow-sm flex justify-center items-center border border-smart-light/10"
                      >
                        <svg
                          className="w-3 h-3 mr-1.5 text-smart-light"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2"
                            d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                          ></path>
                        </svg>
                        Switch Cam
                      </button>
                      <button
                        onClick={handleUnlockScanner}
                        className="px-3 py-1.5 bg-smart-bg dark:bg-gray-800 hover:bg-smart-light/20 text-smart-dark dark:text-white rounded-lg text-[10px] font-black uppercase tracking-widest transition-colors shadow-sm flex justify-center items-center border border-smart-light/10"
                      >
                        <svg
                          className="w-3 h-3 mr-1.5 text-smart-light"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2"
                            d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z"
                          ></path>
                        </svg>
                        Unlock
                      </button>
                      <div className="flex justify-center items-center space-x-2 bg-smart-light/10 dark:bg-smart-light/20 px-3 py-1.5 rounded-full border border-smart-light/20">
                        <div className="w-2 h-2 bg-smart-light rounded-full animate-ping"></div>
                        <span className="text-[10px] text-smart-dark dark:text-smart-glow font-black uppercase tracking-widest">
                          Online
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex-grow flex flex-col bg-smart-dark/5 dark:bg-black p-6 sm:p-10 justify-center items-center relative">
                    {scanMessage && (
                      <div
                        className={`mb-8 p-6 rounded-2xl font-black text-center text-sm shadow-xl border-2 w-full mx-auto transform animate-fade-in ${scanMessage.type === 'success' ? 'bg-smart-light/20 border-smart-light text-smart-dark dark:text-smart-glow' : 'bg-red-50 border-red-500 text-red-700 dark:bg-red-900/30 dark:text-red-400'}`}
                      >
                        {scanMessage.text}
                      </div>
                    )}

                    <div className="flex flex-col items-center justify-center p-6 bg-slate-800/50 rounded-xl border border-slate-700 w-full max-w-sm mx-auto gap-5 overflow-hidden shadow-2xl">
                      <div
                        className={`flex items-center justify-center gap-2 text-sm font-bold tracking-wider whitespace-nowrap ${isCameraActive ? 'text-green-400' : 'text-red-400'}`}
                      >
                        <svg
                          className="w-5 h-5"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2"
                            d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
                          ></path>
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2"
                            d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"
                          ></path>
                        </svg>
                        {isCameraActive ? 'OPTICAL SENSOR ONLINE' : 'OPTICAL SENSOR OFFLINE'}
                      </div>

                      <button
                        onClick={handleToggleSensor}
                        className={`w-full font-bold py-3 px-4 rounded-lg transition-all transform active:scale-95 flex items-center justify-center text-white shadow-lg ${isCameraActive ? 'bg-red-500 hover:bg-red-600 shadow-red-900/20' : 'bg-green-500 hover:bg-green-600 shadow-green-900/20'}`}
                      >
                        {isCameraActive ? 'HALT SENSOR LINK' : 'AUTHORIZE SENSOR LINK'}
                      </button>

                      <label className="text-sm text-slate-400 hover:text-white transition-colors cursor-pointer flex items-center gap-2">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        <span>Scan an Image File</span>
                        <input
                          type="file"
                          className="hidden"
                          accept="image/*"
                          onChange={handleFileScan}
                        />
                      </label>
                    </div>

                    <div className="relative w-full max-w-md mx-auto mt-10">
                      <div
                        id="reader"
                        className="w-full bg-white dark:bg-gray-800 rounded-[30px] shadow-2xl border-4 border-smart-dark dark:border-smart-light/50 ring-8 ring-smart-bg dark:ring-gray-900 overflow-hidden"
                      ></div>
                      {isLockedUI && (
                        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/60 backdrop-blur-sm rounded-[30px]">
                          <button
                            onClick={handleNextScan}
                            className="bg-blue-500 hover:bg-blue-600 text-white font-black py-4 px-10 rounded-2xl shadow-2xl transform transition hover:scale-105 active:scale-95 uppercase tracking-widest text-sm"
                          >
                            Next Scan
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="bg-smart-bg dark:bg-gray-900 p-6 sm:p-8 border-t border-smart-light/10 mt-auto w-full">
                    <form
                      onSubmit={handleManualOverride}
                      className="flex flex-col space-y-4 max-w-md mx-auto w-full"
                    >
                      <div className="relative">
                        <input
                          type="text"
                          value={manualTicketId}
                          onChange={(e) => setManualTicketId(e.target.value)}
                          placeholder="ENTER TICKET IDENTIFIER..."
                          className="w-full px-6 py-5 rounded-2xl border-2 border-smart-light/20 bg-white dark:bg-gray-800 text-smart-dark dark:text-white focus:ring-4 focus:ring-smart-light/20 focus:border-smart-light outline-none transition font-mono text-xs font-black tracking-widest"
                        />
                        <svg
                          className="w-5 h-5 absolute right-6 top-1/2 -translate-y-1/2 text-smart-light/40"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2"
                            d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01"
                          ></path>
                        </svg>
                      </div>
                      <button
                        type="submit"
                        className="w-full py-5 bg-smart-light hover:bg-smart-dark text-white rounded-2xl font-black uppercase tracking-widest text-xs transition-all shadow-xl hover:shadow-smart-light/20 active:scale-95"
                      >
                        Manual Entry Override
                      </button>
                    </form>
                  </div>
                </div>

                {/* Hardware Alerts Table */}
                <div
                  id="hardware-alerts-panel"
                  className="bg-white dark:bg-gray-800 rounded-[40px] shadow-2xl border border-smart-light/10 dark:border-gray-700 flex flex-col overflow-hidden transition-all duration-300 w-full xl:w-2/3"
                >
                  <div className="bg-smart-bg dark:bg-gray-900 px-6 sm:px-8 py-6 border-b border-smart-light/10 flex flex-col lg:flex-row justify-between items-center gap-4">
                    <h2 className="text-xl font-black text-smart-dark dark:text-white flex items-center tracking-tighter uppercase italic select-none shrink-0 w-full lg:w-auto justify-center lg:justify-start">
                      <svg
                        className="w-6 h-6 mr-3 text-red-500"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="2"
                          d="M13 10V3L4 14h7v7l9-11h-7z"
                        ></path>
                      </svg>
                      Hardware Alerts
                    </h2>
                    <div className="flex flex-row flex-wrap items-center justify-center lg:justify-end gap-3 w-full lg:w-auto text-smart-gray dark:text-gray-400">
                      {isSuperAdmin && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleClearHardwareAlerts();
                          }}
                          className="hidden sm:flex items-center mr-4 px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-colors border border-red-500/20"
                          disabled={alerts.length === 0}
                        >
                          <svg
                            className="w-3 h-3 mr-1.5"
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
                          Clear All
                        </button>
                      )}
                      <div className="flex items-center space-x-2 bg-smart-bg dark:bg-gray-800 px-4 py-1.5 rounded-full border border-smart-light/10 mr-4">
                        <div className="w-2 h-2 bg-smart-light rounded-full animate-pulse"></div>
                        <span className="text-[10px] text-smart-gray dark:text-gray-500 font-black uppercase tracking-widest hidden sm:inline">
                          Real-time Stream
                        </span>
                      </div>
                    </div>
                  </div>

                  {isHardwareAlertsExpanded && (
                    <div className="flex flex-col flex-grow">
                      <div className="bg-smart-bg/30 dark:bg-gray-900/30 px-8 py-4 border-b border-smart-light/10 flex justify-between items-center">
                        <span className="text-xs font-bold text-smart-gray dark:text-gray-400 uppercase tracking-widest">
                          {alerts.length} Alerts
                        </span>
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

                      <div className="flex-grow overflow-y-auto overflow-x-auto h-[450px] custom-scrollbar">
                        <table className="w-full text-left border-collapse">
                          <thead className="sticky top-0 bg-smart-bg dark:bg-gray-900 z-10">
                            <tr className="border-b border-smart-light/10 text-smart-gray dark:text-gray-500 text-[10px] font-black uppercase tracking-widest">
                              <th className="px-4 py-3 pl-6 whitespace-nowrap text-left w-1/4">
                                Date & Time
                              </th>
                              <th className="px-4 py-3 whitespace-nowrap text-center w-[100px]">
                                Type
                              </th>
                              <th className="px-4 py-3 w-full text-left">Alert Message</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-smart-bg dark:divide-gray-700">
                            {Array.isArray(alerts) && alerts.map((alert) => (
                              <tr
                                key={alert._id || alert.id}
                                className="hover:bg-smart-bg/50 dark:hover:bg-gray-700/50 transition-colors"
                              >
                                <td className="px-4 py-3 pl-6 whitespace-nowrap align-top text-left w-1/4">
                                  <div className="text-sm font-bold text-smart-dark dark:text-gray-300">
                                    {alert.timeString || alert.time}
                                  </div>
                                  <div className="text-xs font-bold text-smart-gray dark:text-gray-500 uppercase mt-0.5">
                                    {new Date(alert.createdAt).toLocaleDateString()}
                                  </div>
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap align-top text-center w-[100px]">
                                  {alert.type === 'warning' && (
                                    <span className="bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-400 text-[9px] font-black px-2.5 py-1.5 rounded-md uppercase tracking-wider border border-yellow-200 dark:border-yellow-800 inline-block w-[72px] text-center">
                                      Warning
                                    </span>
                                  )}
                                  {alert.type === 'info' && (
                                    <span className="bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-400 text-[9px] font-black px-2.5 py-1.5 rounded-md uppercase tracking-wider border border-blue-200 dark:border-blue-800 inline-block w-[72px] text-center">
                                      Info
                                    </span>
                                  )}
                                  {alert.type === 'action' && (
                                    <span className="bg-smart-light/10 dark:bg-smart-light/20 text-smart-dark dark:text-smart-glow text-[9px] font-black px-2.5 py-1.5 rounded-md uppercase tracking-wider border border-smart-light/20 inline-block w-[72px] text-center">
                                      Action
                                    </span>
                                  )}
                                  {alert.type === 'success' && (
                                    <span className="bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400 text-[9px] font-black px-2.5 py-1.5 rounded-md uppercase tracking-wider border border-green-200 dark:border-green-800 inline-block w-[72px] text-center">
                                      Success
                                    </span>
                                  )}
                                  {alert.type === 'error' && (
                                    <span className="bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-400 text-[9px] font-black px-2.5 py-1.5 rounded-md uppercase tracking-wider border border-red-200 dark:border-red-800 inline-block w-[72px] text-center">
                                      Error
                                    </span>
                                  )}
                                </td>
                                <td className="px-4 py-3 text-smart-dark dark:text-gray-200 font-medium text-sm leading-relaxed break-words align-top text-left w-full">
                                  {alert.message}
                                </td>
                              </tr>
                            ))}
                            {(!alerts || alerts.length === 0) && (
                              <tr>
                                <td
                                  colSpan="3"
                                  className="p-8 text-center text-smart-gray dark:text-gray-500 font-black uppercase tracking-widest text-[10px]"
                                >
                                  No hardware alerts detected. Waiting for telemetry...
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>

                      <div className="mt-auto flex flex-col w-full">
                        {(totalAlertPages > 1 || alerts.length === 0) && !isLoadingAlerts && (
                          <div className="bg-smart-bg/30 dark:bg-gray-900/30 px-6 sm:px-8 py-4 border-t border-smart-light/10 flex flex-col sm:flex-row justify-between items-center gap-4">
                            <span className="text-[10px] font-bold text-smart-gray dark:text-gray-400 uppercase tracking-widest text-center sm:text-left w-full sm:w-auto shrink-0">
                              Showing {alerts.length === 0 ? 0 : (alertPage - 1) * 10 + 1} to{' '}
                              {Math.min(alertPage * 10, totalAlertsCount)} of {totalAlertsCount}
                            </span>
                            <div className="flex space-x-2 items-center justify-center sm:justify-end w-full sm:w-auto shrink-0">
                              <button
                                onClick={() => handleAlertPageChange(Math.max(1, alertPage - 1))}
                                disabled={alertPage <= 1}
                                className="px-4 py-2 bg-white dark:bg-gray-800 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors border border-smart-light/20 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-smart-light/10 shadow-sm"
                              >
                                Prev
                              </button>
                              <span className="px-4 py-2 text-[10px] font-black uppercase tracking-widest text-smart-dark dark:text-white flex items-center shrink-0">
                                Page {alerts.length === 0 ? 0 : alertPage} of {alerts.length === 0 ? 0 : totalAlertPages}
                              </span>
                              <button
                                onClick={() =>
                                  handleAlertPageChange(Math.min(totalAlertPages, alertPage + 1))
                                }
                                disabled={alertPage >= totalAlertPages || alerts.length === 0}
                                className="px-4 py-2 bg-white dark:bg-gray-800 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors border border-smart-light/20 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-smart-light/10 shadow-sm"
                              >
                                Next
                              </button>
                            </div>
                          </div>
                        )}

                        <div className="bg-smart-bg dark:bg-gray-900 p-6 border-t border-smart-light/10 flex justify-center items-center">
                          <button
                            onClick={() => router.push('/admin/telemetry')}
                            className="bg-green-600 hover:bg-green-700 text-white font-black text-[11px] py-3 px-8 rounded-xl transition-all uppercase tracking-widest shadow-lg shadow-green-900/20"
                          >
                            View Live Telemetry
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* System Tab */}
          {activeTab === 'system' && isSuperAdmin && (
            <div className="space-y-10 animate-fade-in">
              {/* Audit Logs Registry */}
              <div className="bg-white dark:bg-gray-800 rounded-[40px] shadow-2xl border border-smart-light/10 dark:border-gray-700 overflow-hidden flex flex-col">
                <div className="bg-smart-bg dark:bg-gray-900 px-8 py-6 border-b border-smart-light/10 flex flex-col md:flex-row justify-between items-center gap-6">
                  <h2 className="text-xl font-black text-smart-dark dark:text-white flex items-center tracking-tighter uppercase italic">
                    Security Audit Logs
                  </h2>
                  <div className="flex flex-col md:flex-row gap-4 items-center w-full md:w-auto">
                    <button onClick={handleClearAuditLogs} className="px-4 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-colors border border-red-500/20 whitespace-nowrap">Clear Records</button>
                    <div className="relative w-full md:w-64">
                      <input type="text" placeholder="FILTER BY ADMIN EMAIL..." value={auditSearchQuery} onChange={handleAuditSearch} className="w-full pl-10 pr-4 py-3 rounded-2xl border-2 border-smart-light/20 bg-white dark:bg-gray-800 text-smart-dark dark:text-white focus:ring-4 focus:ring-smart-light/20 focus:border-smart-light outline-none transition font-mono text-[9px] font-black tracking-widest" />
                      <svg className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-smart-light/60" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
                    </div>
                  </div>
                </div>

                <div className="overflow-x-auto flex-grow max-h-[400px]">
                  <table className="w-full text-left border-collapse">
                    <thead className="sticky top-0 bg-smart-bg dark:bg-gray-900 z-10 shadow-sm">
                      <tr className="text-smart-gray dark:text-gray-500 text-[9px] font-black uppercase tracking-widest border-b border-smart-light/10">
                        <th className="px-6 py-4">Timestamp</th>
                        <th className="px-6 py-4">Administrator</th>
                        <th className="px-6 py-4">Intervention Description</th>
                        <th className="px-6 py-4 text-right">Endpoint</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-smart-bg dark:divide-gray-700">
                      {auditLogs.map((log) => (
                        <tr key={log._id} className="hover:bg-smart-bg/30 dark:hover:bg-gray-700/30 transition-colors">
                          <td className="px-6 py-4 whitespace-nowrap">
                            <p className="text-[10px] font-bold text-smart-dark dark:text-gray-300">{new Date(log.createdAt).toLocaleString()}</p>
                          </td>
                          <td className="px-6 py-4">
                            <p className="text-[10px] font-black text-smart-light italic">{log.email}</p>
                          </td>
                          <td className="px-6 py-4">
                            <p className="text-[11px] font-bold text-smart-dark dark:text-white tracking-tight">{log.action}</p>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <p className="text-[9px] font-mono text-smart-gray dark:text-gray-500">{log.ipAddress}</p>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="bg-smart-bg dark:bg-gray-900 px-8 py-4 border-t border-smart-light/10 flex flex-col sm:flex-row justify-between items-center gap-4">
                  <span className="text-[9px] font-black text-smart-gray dark:text-gray-500 uppercase tracking-widest">Index {auditLogs.length} of {totalAuditCount} security entries</span>
                  <div className="flex space-x-2">
                    <button onClick={() => handleAuditPageChange(Math.max(1, auditPage - 1))} disabled={auditPage === 1} className="px-4 py-2 bg-white dark:bg-gray-800 rounded-xl text-[9px] font-black uppercase tracking-widest transition-colors border border-smart-light/10 disabled:opacity-30">Prev</button>
                    <button onClick={() => handleAuditPageChange(Math.min(totalAuditPages, auditPage + 1))} disabled={auditPage === totalAuditPages} className="px-4 py-2 bg-white dark:bg-gray-800 rounded-xl text-[9px] font-black uppercase tracking-widest transition-colors border border-smart-light/10 disabled:opacity-30">Next</button>
                  </div>
                </div>
              </div>

              {/* Banned IPs Panel */}
              <div className="bg-white dark:bg-gray-800 rounded-[40px] shadow-2xl border border-smart-light/10 dark:border-gray-700 overflow-hidden flex flex-col">
                <div className="bg-red-500/10 px-8 py-6 border-b border-red-500/20 flex justify-between items-center">
                  <h2 className="text-xl font-black text-red-500 italic tracking-tighter uppercase">Blacklisted Node Protocol</h2>
                  <span className="text-[10px] font-black text-red-500 uppercase tracking-widest">{totalBannedIPCount} Denied Addresses</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="text-smart-gray dark:text-gray-500 text-[9px] font-black uppercase tracking-widest border-b border-smart-light/10 bg-smart-bg dark:bg-gray-900/30">
                        <th className="px-6 py-4">Network Node</th>
                        <th className="px-6 py-4">Incursion Reason</th>
                        <th className="px-6 py-4">Quarantine Date</th>
                        <th className="px-6 py-4 text-right">Neutralization</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-smart-bg dark:divide-gray-700">
                      {bannedIPs.map((ip) => (
                        <tr key={ip._id} className="hover:bg-red-500/5 transition-colors">
                          <td className="px-6 py-4 font-mono text-[11px] font-black text-smart-dark dark:text-white tracking-widest">{ip.ipAddress}</td>
                          <td className="px-6 py-4 text-[11px] font-bold text-red-400 italic">{ip.reason}</td>
                          <td className="px-6 py-4 text-[10px] font-bold text-smart-gray">{new Date(ip.createdAt).toLocaleDateString()}</td>
                          <td className="px-6 py-4 text-right">
                            <button onClick={() => handleUnbanIP(ip.ipAddress)} className="px-4 py-2 bg-smart-light/10 hover:bg-smart-light text-smart-light hover:text-white rounded-xl text-[9px] font-black uppercase tracking-widest border border-smart-light/20 transition-all shadow-sm">Authorize Node</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Whitelist and Backups */}
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-10">
                {/* Whitelist Panel */}
                <div className="bg-white dark:bg-gray-800 rounded-[40px] shadow-2xl border border-smart-light/10 dark:border-gray-700 overflow-hidden flex flex-col h-full">
                  <div className="bg-blue-500 px-8 py-6 flex justify-between items-center">
                    <h2 className="text-xl font-black text-white italic tracking-tighter uppercase">Infrastructure Whitelist</h2>
                    <svg className="w-6 h-6 text-white/50" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"></path></svg>
                  </div>
                  <div className="p-8 bg-blue-500/5 border-b border-blue-500/10">
                    <form onSubmit={handleAddWhitelistIP} className="space-y-4">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <input type="text" placeholder="IP ADDRESS..." value={newWhitelistIP} onChange={(e) => setNewWhitelistIP(e.target.value)} className="w-full px-5 py-3.5 rounded-2xl border-2 border-blue-500/20 bg-white dark:bg-gray-800 text-smart-dark dark:text-white focus:ring-4 focus:ring-blue-500/10 outline-none font-mono text-[10px] font-black tracking-widest" required />
                        <input type="text" placeholder="MAC ADDRESS (OPTIONAL)..." value={newWhitelistMAC} onChange={(e) => setNewWhitelistMAC(e.target.value)} className="w-full px-5 py-3.5 rounded-2xl border-2 border-blue-500/20 bg-white dark:bg-gray-800 text-smart-dark dark:text-white focus:ring-4 focus:ring-blue-500/10 outline-none font-mono text-[10px] font-black tracking-widest" />
                      </div>
                      <input type="text" placeholder="NODE DESCRIPTION (E.G. MAIN GATE ESP8266)..." value={newWhitelistDesc} onChange={(e) => setNewWhitelistDesc(e.target.value)} className="w-full px-5 py-3.5 rounded-2xl border-2 border-blue-500/20 bg-white dark:bg-gray-800 text-smart-dark dark:text-white focus:ring-4 focus:ring-blue-500/10 outline-none font-black text-[9px] tracking-widest" />
                      <button type="submit" className="w-full py-4 bg-blue-500 hover:bg-blue-600 text-white rounded-2xl font-black uppercase tracking-widest text-[10px] shadow-lg shadow-blue-500/20 transition-all active:scale-95">Authorize Hardware Protocol</button>
                    </form>
                  </div>
                  <div className="flex-grow overflow-y-auto max-h-[300px]">
                    <table className="w-full text-left border-collapse">
                      <tbody className="divide-y divide-smart-bg dark:divide-gray-700">
                        {whitelistedIPs.map((ip) => (
                          <tr key={ip._id} className="hover:bg-blue-500/5 transition-colors">
                            <td className="px-6 py-4">
                              <p className="font-mono text-[11px] font-black text-smart-dark dark:text-white tracking-widest">{ip.ipAddress}</p>
                              <p className="text-[9px] font-bold text-blue-500 mt-1 uppercase">{ip.description || 'Verified System Node'}</p>
                            </td>
                            <td className="px-6 py-4 text-right">
                              <button onClick={() => handleRemoveWhitelistIP(ip._id)} className="p-2 text-red-400 hover:text-red-500 transition-colors"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg></button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Backups Panel */}
                <div className="bg-white dark:bg-gray-800 rounded-[40px] shadow-2xl border border-smart-light/10 dark:border-gray-700 overflow-hidden flex flex-col h-full">
                  <div className="bg-cyan-500 px-8 py-6 flex justify-between items-center">
                    <h2 className="text-xl font-black text-white italic tracking-tighter uppercase">Data Preservation Ledger</h2>
                    <button onClick={handleCreateBackup} className="p-2 bg-white/20 hover:bg-white/30 rounded-xl transition-all"><svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4"></path></svg></button>
                  </div>
                  <div className="flex-grow overflow-y-auto">
                    {backups.length === 0 ? (
                      <div className="flex flex-col items-center justify-center h-full p-10 opacity-40">
                        <svg className="w-12 h-12 mb-4 text-smart-gray" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20 13V6a2 2 0 00-2-2H4a2 2 0 00-2 2v7m18 0v5a2 2 0 01-2 2H4a2 2 0 01-2-2v-5m18 0h-2m-16 0H4m16 0L12 9l-8 4"></path></svg>
                        <p className="font-black text-[10px] uppercase tracking-widest">No recovery points available</p>
                      </div>
                    ) : (
                      <div className="divide-y divide-smart-bg dark:divide-gray-700">
                        {backups.map((backup) => (
                          <div key={backup.filename} className="px-8 py-5 flex items-center justify-between hover:bg-cyan-500/5 transition-colors">
                            <div className="overflow-hidden pr-4">
                              <p className="font-mono text-[10px] font-black text-smart-dark dark:text-white truncate">{backup.filename}</p>
                              <p className="text-[9px] font-bold text-smart-gray dark:text-gray-500 mt-1 uppercase tracking-widest">{backup.size} • {new Date(backup.createdAt).toLocaleString()}</p>
                            </div>
                            <div className="flex gap-2 shrink-0">
                              <button onClick={() => handleDownloadBackup(backup.filename)} className="p-2.5 bg-smart-bg dark:bg-gray-700 text-smart-dark dark:text-white rounded-xl hover:bg-smart-light/20 transition-all border border-smart-light/10 shadow-sm"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg></button>
                              <button onClick={() => handleRestoreBackup(backup.filename)} disabled={restoringBackupFilename === backup.filename} className={`p-2.5 rounded-xl transition-all border border-smart-light/10 shadow-sm ${restoringBackupFilename === backup.filename ? 'bg-amber-500 text-white animate-pulse' : 'bg-smart-bg dark:bg-gray-700 text-smart-dark dark:text-white hover:bg-green-500/20'}`}><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg></button>
                              <button onClick={() => handleDeleteBackup(backup.filename)} className="p-2.5 bg-red-500/10 text-red-500 rounded-xl hover:bg-red-500 hover:text-white transition-all border border-red-500/20"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg></button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
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
