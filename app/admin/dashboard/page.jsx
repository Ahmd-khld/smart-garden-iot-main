'use client';

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { socket } from '../../../socket';
import { useUI } from '../../../context/UIContext';
import { useTelemetry } from '../../../context/TelemetryContext';
import api from '../../../api';
import AdminHeader from '../../../components/AdminHeader';
import WidgetErrorBoundary from '../../../components/WidgetErrorBoundary';

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
  const router = useRouter();
  const searchParams = useSearchParams();

  const { showModal, showPrompt, showConfirm } = useUI();
  const [stats, setStats] = useState(null);
  const [isLoadingStats, setIsLoadingStats] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [currentAdminEmail, setCurrentAdminEmail] = useState('');
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const superAdminEmail = (process.env.NEXT_PUBLIC_SUPER_ADMIN_EMAIL || 'admin@smartpark.com').toLowerCase();

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const email = (localStorage.getItem('adminEmail') || '').toLowerCase().trim();
      setCurrentAdminEmail(email);
      setIsSuperAdmin(email === superAdminEmail);
    }
  }, [superAdminEmail]);

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
  const [filterStatus, setFilterStatus] = useState('ALL');
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
  const {
    alerts,
    setAlerts,
    totalAlertsCount,
    setTotalAlertsCount,
    liveReadings,
  } = useTelemetry();

  const [alertPage, setAlertPage] = useState(1);
  const [totalAlertPages, setTotalAlertPages] = useState(1);
  const [isLoadingAlerts, setIsLoadingAlerts] = useState(false);

  const [userPage, setUserPage] = useState(1);

  const [monthlySales, setMonthlySales] = useState([]);
  const [isMonthlySalesExpanded, setIsMonthlySalesExpanded] = useState(true);
  const [salesStartDate, setSalesStartDate] = useState('');
  const [salesEndDate, setSalesEndDate] = useState('');
  const isSalesFilteredRef = useRef(false);
  const [backups, setBackups] = useState([]);
  const [isBackupsExpanded, setIsBackupsExpanded] = useState(true);
  const [restoringBackupFilename, setRestoringBackupFilename] = useState(null);
  const [pendingCashTickets, setPendingCashTickets] = useState([]);
  const [isLoadingPendingCash, setIsLoadingPendingCash] = useState(false);
  const [cashSearchQuery, setCashSearchQuery] = useState('');
  const [cashFilterStatus, setCashFilterStatus] = useState('PENDING'); // PENDING or PAID
  const [activeTab, setActiveTab] = useState(searchParams.get('tab') || 'overview');

  const [unreadAuditCount, setUnreadAuditCount] = useState(0);
  const [unreadAlertsCount, setUnreadAlertsCount] = useState(0);
  const [unreadBannedCount, setUnreadBannedCount] = useState(0);

  const alertPageRef = useRef(alertPage);
  const userPageRef = useRef(userPage);
  const auditLogPageRef = useRef(auditLogPage);
  const bannedIPsPageRef = useRef(bannedIPsPage);
  const whitelistPageRef = useRef(whitelistPage);
  const isAuditLogsExpandedRef = useRef(isAuditLogsExpanded);
  const isHardwareAlertsExpandedRef = useRef(isHardwareAlertsExpanded);
  const isBannedIPsExpandedRef = useRef(isBannedIPsExpanded);
  const [isSubAdminsExpanded, setIsSubAdminsExpanded] = useState(true);

  useEffect(() => {
    alertPageRef.current = alertPage;
    userPageRef.current = userPage;
    auditLogPageRef.current = auditLogPage;
    bannedIPsPageRef.current = bannedIPsPage;
    whitelistPageRef.current = whitelistPage;
    isAuditLogsExpandedRef.current = activeTab === 'security' && isAuditLogsExpanded;
    isHardwareAlertsExpandedRef.current = activeTab === 'hardware' && isHardwareAlertsExpanded;
    isBannedIPsExpandedRef.current = activeTab === 'security' && isBannedIPsExpanded;
  }, [alertPage, userPage, auditLogPage, bannedIPsPage, whitelistPage, activeTab, isAuditLogsExpanded, isHardwareAlertsExpanded, isBannedIPsExpanded]);

  // Sync activeTab state with URL search params
  useEffect(() => {
    const tabFromUrl = searchParams.get('tab');
    if (tabFromUrl && tabFromUrl !== activeTab) {
      setActiveTab(tabFromUrl);
    }

    const ticketIdFromUrl = searchParams.get('ticketId');
    if (ticketIdFromUrl) {
      setManualTicketId(ticketIdFromUrl);
    }
  }, [searchParams, activeTab]);

  const handleTabChange = (tabId) => {
    if (tabId === 'grc') {
      router.push('/admin/grc');
      return;
    }
    setActiveTab(tabId);
    router.push(`/admin/dashboard?tab=${tabId}`);
  };

  const handleLogout = useCallback(() => {
    localStorage.removeItem('token');
    localStorage.removeItem('role');
    localStorage.removeItem('adminEmail');
    router.push('/');
  }, [router]);

  const [newAdminName, setNewAdminName] = useState('');
  const [newAdminEmail, setNewAdminEmail] = useState('');
  const [newAdminPassword, setNewAdminPassword] = useState('');
  const [newAdminIp, setNewAdminIp] = useState('');
  const [newAdminMac, setNewAdminMac] = useState('');

  const [syncTrigger, setSyncTrigger] = useState(0);
  const [isLockedUI, setIsLockedUI] = useState(false);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const scanLock = useRef(false);

  // Html5Qrcode dynamic import handling
  const [Html5Qrcode, setHtml5Qrcode] = useState(null);
  useEffect(() => {
    import('html5-qrcode').then((mod) => {
      setHtml5Qrcode(() => mod.Html5Qrcode);
    });
  }, []);

  // Fetch crowd insights
  const fetchInsights = useCallback(async () => {
    setLoadingInsights(true);
    try {
      const token = localStorage.getItem('token');
      if (isTokenExpired(token)) {
        handleLogout();
        return;
      }
      const dateStr = insightStartDate.toISOString().split('T')[0];
      const response = await api.get('/tickets/insights', {
        params: { startDate: dateStr },
        headers: { Authorization: `Bearer ${token}` },
      });
      setInsights(response.data);
    } catch (err) {
      console.error('Failed to fetch insights:', err);
      setInsights(null);
    } finally {
      setLoadingInsights(false);
    }
  }, [insightStartDate, handleLogout]);

  const fetchStats = useCallback(async () => {
    const token = localStorage.getItem('token');
    if (isTokenExpired(token)) {
      handleLogout();
      return;
    }
    try {
      const statsRes = await api.get('/admin/stats', {
        headers: { Authorization: `Bearer ${token}` },
      });
      setStats(statsRes.data);

      const salesRes = await api.get('/admin/monthly-sales', {
        headers: { Authorization: `Bearer ${token}` },
      });
      setMonthlySales(salesRes.data);
    } catch (error) {
      console.error('Failed to refresh stats', error);
    }
  }, [handleLogout]);

  const fetchUsers = useCallback(async (page = 1) => {
    const token = localStorage.getItem('token');
    if (isTokenExpired(token)) {
      handleLogout();
      return;
    }

    try {
      const res = await api.get('/admin/users', {
        params: {
          role: 'user',
          page,
          limit: 10,
          ...(searchQuery ? { search: searchQuery } : {}),
          ...(filterStatus !== 'ALL' ? { status: filterStatus } : {}),
        },
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = res.data;
      setRegularUsers(data.users || []);
      setTotalUserPages(data.totalPages || 1);
      setTotalUsersCount(data.totalUsers || 0);
      setUserPage(page);
    } catch (error) {
      console.error('Failed to fetch users', error);
    }
  }, [searchQuery, filterStatus, handleLogout]);

  const fetchSubAdmins = useCallback(async () => {
    const token = localStorage.getItem('token');
    if (!token || isTokenExpired(token)) return;
    try {
      const adminsRes = await api.get('/admin/users', {
        params: { role: 'admin' },
        headers: { Authorization: `Bearer ${token}` },
      });
      setSubAdmins(adminsRes.data.users || []);
    } catch (err) {
      console.error('Failed to fetch sub-admins:', err);
    }
  }, []);

  const fetchAuditLogs = useCallback(async (page = 1, append = false) => {
    setIsLoadingAuditLogs(true);
    const token = localStorage.getItem('token');
    try {
      const response = await api.get('/admin/audit-logs', {
        params: { page, limit: 10 },
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = response.data;
      if (append) setAuditLogs((prev) => [...prev, ...data.logs]);
      else setAuditLogs(data.logs || []);

      setAuditLogPage(data.currentPage);
      setAuditLogHasMore(data.currentPage < data.totalPages);
    } catch (error) {
      console.error('Failed to fetch audit logs', error);
    } finally {
      setIsLoadingAuditLogs(false);
    }
  }, []);

  const fetchBannedIPs = useCallback(async (page = 1, append = false) => {
    setIsLoadingBannedIPs(true);
    const token = localStorage.getItem('token');
    try {
      const response = await api.get('/admin/banned-ips', {
        params: {
          page,
          limit: 10,
          ...(bannedIPsSearchQuery ? { search: bannedIPsSearchQuery } : {}),
        },
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = response.data;
      if (append) setBannedIPs((prev) => [...prev, ...data.bannedIPs]);
      else setBannedIPs(data.bannedIPs || []);

      setTotalBannedIPs(data.totalBannedIPs || 0);
      setBannedIPsPage(data.currentPage);
      setBannedIPsHasMore(data.currentPage < data.totalPages);
    } catch (error) {
      console.error('Failed to load banned IPs', error);
    } finally {
      setIsLoadingBannedIPs(false);
    }
  }, [bannedIPsSearchQuery]);

  const fetchWhitelistedIPs = useCallback(async (page = 1, append = false) => {
    setIsLoadingWhitelist(true);
    const token = localStorage.getItem('token');
    try {
      const response = await api.get('/admin/whitelisted-ips', {
        params: {
          page,
          limit: 10,
          ...(whitelistedIPsSearchQuery ? { search: whitelistedIPsSearchQuery } : {}),
        },
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = response.data;
      if (append) setWhitelistedIPs((prev) => [...prev, ...data.ips]);
      else setWhitelistedIPs(data.ips || []);

      setTotalWhitelistedIPs(data.totalIps || 0);
      setWhitelistPage(data.currentPage);
      setWhitelistHasMore(data.currentPage < data.totalPages);
    } catch (error) {
      console.error('Failed to load whitelisted IPs', error);
    } finally {
      setIsLoadingWhitelist(false);
    }
  }, [whitelistedIPsSearchQuery]);

  const fetchAlertsPage = useCallback(async (page, silent = false) => {
    if (!silent) setIsLoadingAlerts(true);
    const token = localStorage.getItem('token');
    if (isTokenExpired(token)) {
      handleLogout();
      return;
    }
    try {
      const response = await api.get('/admin/hardware-alerts', {
        params: {
          page,
          limit: 10,
          ...(alertFilterType !== 'all' ? { type: alertFilterType } : {}),
        },
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = response.data;
      setAlerts(data.alerts || []);
      setAlertPage(data.currentPage);
      setTotalAlertPages(data.totalPages || 1);
      setTotalAlertsCount(data.totalAlerts || 0);
    } catch (error) {
      console.error('Failed to load alerts page', error);
    } finally {
      if (!silent) setIsLoadingAlerts(false);
    }
  }, [alertFilterType, setAlerts, setTotalAlertsCount, handleLogout]);

  const fetchPendingCashTickets = useCallback(async () => {
    const token = localStorage.getItem('token');
    if (!token || isTokenExpired(token)) return;
    setIsLoadingPendingCash(true);
    try {
      const res = await api.get('/admin/pending-cash-tickets', {
        params: { status: cashFilterStatus },
        headers: { Authorization: `Bearer ${token}` },
      });
      setPendingCashTickets(res.data || []);
    } catch (err) {
      console.error('Failed to fetch cash tickets:', err);
    } finally {
      setIsLoadingPendingCash(false);
    }
  }, [cashFilterStatus]);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token || isTokenExpired(token)) {
      router.push('/');
      return;
    }

    const fetchData = async () => {
      try {
        await fetchStats();
        await fetchUsers(1);
        await fetchSubAdmins();

        if (isSuperAdmin) {
          await fetchAuditLogs(1);
          await fetchBannedIPs(1);
          await fetchWhitelistedIPs(1);
          const backupsRes = await api.get('/admin/backups', {
            headers: { Authorization: `Bearer ${token}` },
          });
          setBackups(backupsRes.data);
        }

        await fetchAlertsPage(1, true);
      } catch (error) {
        console.error('Initial data fetch failed', error);
      } finally {
        setIsLoadingStats(false);
      }
    };

    fetchData();
  }, [isSuperAdmin, router, fetchStats, fetchUsers, fetchSubAdmins, fetchAuditLogs, fetchBannedIPs, fetchWhitelistedIPs, fetchAlertsPage]);

  useEffect(() => {
    fetchInsights();
    fetchStats();
  }, [fetchInsights, fetchStats, syncTrigger]);

  useEffect(() => {
    if (activeTab === 'collections') {
      fetchPendingCashTickets();
    }
  }, [activeTab, cashFilterStatus, fetchPendingCashTickets]);

  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    try {
      if (activeTab === 'overview') {
        await Promise.all([fetchStats(), fetchInsights()]);
      } else if (activeTab === 'collections') {
        await fetchPendingCashTickets();
      }
    } catch (err) {
      console.error('Manual refresh failed:', err);
    } finally {
      setIsRefreshing(false);
    }
  };

  const playSuccessSound = () => {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      const audioCtx = new AudioContext();
      const playNote = (freq, start, duration) => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, start);
        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(0.1, start + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(start);
        osc.stop(start + duration);
      };
      playNote(523.25, audioCtx.currentTime, 0.15);
      playNote(783.99, audioCtx.currentTime + 0.1, 0.25);
      setTimeout(() => audioCtx.close(), 1000);
    } catch (err) {}
  };

  const playErrorSound = () => {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      const audioCtx = new AudioContext();
      const playBuzz = (start) => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(150, start);
        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(0.1, start + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.2);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(start);
        osc.stop(start + 0.2);
      };
      playBuzz(audioCtx.currentTime);
      playBuzz(audioCtx.currentTime + 0.25);
      setTimeout(() => audioCtx.close(), 1000);
    } catch (err) {}
  };

  const handleScanRequest = async (idToScan) => {
    const token = localStorage.getItem('token');
    try {
      setScanMessage(null);
      const response = await api.post(
        '/admin/scan',
        { ticketId: idToScan },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setScanMessage({ type: 'success', text: response.data.message });
      fetchStats();
    } catch (error) {
      const errorMessage = error.response?.data?.message || 'Scan failed';
      setScanMessage({ type: 'error', text: errorMessage });
      playErrorSound();
    }
  };

  const onScanSuccess = useCallback((decodedText) => {
    if (scanLock.current || !decodedText) return;
    scanLock.current = true;
    setIsLockedUI(true);
    playSuccessSound();
    let finalId = decodedText;
    try {
      const parts = decodedText.split('.');
      if (parts.length === 3) {
        const payload = JSON.parse(atob(parts[1]));
        if (payload && payload.ticketId) finalId = payload.ticketId;
      }
    } catch (e) {}
    handleScanRequest(finalId);
  }, []);

  const handleToggleSensor = async () => {
    if (!Html5Qrcode) return;
    if (!scannerRef.current) scannerRef.current = new Html5Qrcode('reader');

    if (isCameraActive) {
      try {
        await scannerRef.current.stop();
        setIsCameraActive(false);
      } catch (err) {}
    } else {
      try {
        await scannerRef.current.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 250, height: 250 } },
          onScanSuccess,
          () => {}
        );
        setIsCameraActive(true);
      } catch (err) {
        setScanMessage({ type: 'error', text: 'Camera access denied.' });
      }
    }
  };

  const handleFileScan = async (e) => {
    if (!Html5Qrcode || !e.target.files[0]) return;
    if (!scannerRef.current) scannerRef.current = new Html5Qrcode('reader');
    try {
      const decodedText = await scannerRef.current.scanFile(e.target.files[0], true);
      onScanSuccess(decodedText);
    } catch (err) {
      setScanMessage({ type: 'error', text: 'No QR code found in image.' });
    }
  };

  const handleNextScan = () => {
    scanLock.current = false;
    setIsLockedUI(false);
    setScanMessage(null);
  };

  const handleHardwareCommand = async (command) => {
    try {
      const res = await api.post('/hardware/control', { command });
      showModal(res.data.message, 'Hardware Control', 'success');
    } catch (err) {
      showModal('Failed to control hardware.', 'Hardware Error', 'error');
    }
  };

  const handleRestrictUser = async (userId, currentStatus) => {
    let reason = '';
    if (!currentStatus) {
      reason = await showPrompt('Reason for restriction:', 'Restrict User', 'Violating platform policies');
      if (reason === null) return;
    } else {
      if (!await showConfirm('Remove restrictions from this user?', 'Remove Restriction')) return;
    }
    const token = localStorage.getItem('token');
    try {
      const res = await api.patch(`/admin/users/${userId}/restrict`, { reason }, { headers: { Authorization: `Bearer ${token}` } });
      showModal(res.data.message, 'Success', 'success');
      const updatedData = { isRestricted: !currentStatus, restrictionReason: res.data.restrictionReason };
      setRegularUsers((prev) => prev.map((u) => (u._id === userId ? { ...u, ...updatedData } : u)));
      setSubAdmins((prev) => prev.map((u) => (u._id === userId ? { ...u, ...updatedData } : u)));
    } catch (error) {
      showModal('Action failed.', 'Error', 'error');
    }
  };

  const handleCreateSubAdmin = async (e) => {
    e.preventDefault();
    if (!newAdminName || !newAdminEmail || !newAdminPassword || !newAdminIp) return;
    const token = localStorage.getItem('token');
    try {
      const response = await api.post('/admin/sub-admin', { name: newAdminName, email: newAdminEmail, password: newAdminPassword, ipAddress: newAdminIp, macAddress: newAdminMac }, { headers: { Authorization: `Bearer ${token}` } });
      setNewAdminName(''); setNewAdminEmail(''); setNewAdminPassword(''); setNewAdminIp(''); setNewAdminMac('');
      showModal(response.data.message, 'Success', 'success');
    } catch (error) {
      showModal(error.response?.data?.message || 'Failed to create sub-admin', 'Error', 'error');
    }
  };

  const handleDeleteUser = async (userId) => {
    if (!await showConfirm('Permanently delete this user?', 'Delete User')) return;
    const token = localStorage.getItem('token');
    try {
      await api.delete(`/admin/users/${userId}`, { headers: { Authorization: `Bearer ${token}` } });
      showModal('User deleted successfully.', 'Success', 'success');
    } catch (error) {
      showModal('Failed to delete user', 'Error', 'error');
    }
  };

  const handleResetOccupancy = async () => {
    if (!await showConfirm('Reset park occupancy?', 'Reset Occupancy')) return;
    const token = localStorage.getItem('token');
    try {
      await api.post('/admin/reset-occupancy', {}, { headers: { Authorization: `Bearer ${token}` } });
      showModal('Occupancy reset.', 'Success', 'success');
      fetchStats(); setSyncTrigger((prev) => prev + 1);
    } catch (error) {
      showModal('Failed to reset occupancy', 'Error', 'error');
    }
  };

  const handleGenerateDummyTickets = async () => {
    const token = localStorage.getItem('token');
    try {
      const response = await api.post('/admin/generate-mock-data', {}, { headers: { Authorization: `Bearer ${token}` } });
      showModal(response.data.message, 'Success', 'success');
      setSyncTrigger((prev) => prev + 1);
    } catch (error) {
      showModal('Failed to generate mock data', 'Error', 'error');
    }
  };

  const handleClearDummyData = async () => {
    if (!await showConfirm('Delete all tickets?', 'Clear Database')) return;
    const token = localStorage.getItem('token');
    try {
      await api.delete('/admin/clear-dummy-tickets', { headers: { Authorization: `Bearer ${token}` } });
      showModal('Dummy data cleared.', 'Success', 'success');
      fetchStats(); fetchInsights(); setSyncTrigger((prev) => prev + 1);
    } catch (error) {
      showModal('Failed to clear dummy data', 'Error', 'error');
    }
  };

  const handleBackupDatabase = async () => {
    if (!await showConfirm('Trigger a manual database backup?', 'Database Backup')) return;
    const token = localStorage.getItem('token');
    try {
      const response = await api.post('/admin/backup', {}, { headers: { Authorization: `Bearer ${token}` } });
      showModal(response.data.message, 'Success', 'success');
      const bRes = await api.get('/admin/backups', { headers: { Authorization: `Bearer ${token}` } });
      setBackups(bRes.data);
    } catch (err) {
      showModal('Failed to trigger backup', 'Error', 'error');
    }
  };

  const handleUnbanIP = async (id) => {
    if (!await showConfirm('Unban this IP address?', 'Unban IP')) return;
    const token = localStorage.getItem('token');
    try {
      await api.delete(`/admin/banned-ips/${id}`, { headers: { Authorization: `Bearer ${token}` } });
      setBannedIPs((prev) => prev.filter((ip) => ip._id !== id));
    } catch (error) {
      showModal('Failed to unban IP', 'Error', 'error');
    }
  };

  const handleAddWhitelistIP = async (e) => {
    e.preventDefault();
    if (!newWhitelistIP) return;
    const token = localStorage.getItem('token');
    try {
      await api.post('/admin/whitelisted-ips', { ipAddress: newWhitelistIP, description: newWhitelistDesc, macAddress: newWhitelistMac }, { headers: { Authorization: `Bearer ${token}` } });
      setNewWhitelistIP(''); setNewWhitelistDesc(''); setNewWhitelistMac('');
    } catch (error) {
      showModal('Failed to add IP', 'Error', 'error');
    }
  };

  const handleRemoveWhitelistIP = async (id) => {
    if (!await showConfirm('Remove this IP from whitelist?', 'Remove Whitelist')) return;
    const token = localStorage.getItem('token');
    try {
      await api.delete(`/admin/whitelisted-ips/${id}`, { headers: { Authorization: `Bearer ${token}` } });
    } catch (error) {
      showModal('Failed to remove IP', 'Error', 'error');
    }
  };

  const handleDownloadBackup = async (filename) => {
    const token = localStorage.getItem('token');
    try {
      const response = await api.get(`/admin/backups/${filename}`, { headers: { Authorization: `Bearer ${token}` }, responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const a = document.createElement('a'); a.href = url; a.download = filename;
      document.body.appendChild(a); a.click(); a.remove(); window.URL.revokeObjectURL(url);
    } catch (err) {
      showModal('Failed to download backup.', 'Error', 'error');
    }
  };

  const handleDeleteBackup = async (filename) => {
    if (!await showConfirm(`Delete backup: ${filename}?`, 'Delete Backup')) return;
    const token = localStorage.getItem('token');
    try {
      await api.delete(`/admin/backups/${filename}`, { headers: { Authorization: `Bearer ${token}` } });
      setBackups((prev) => prev.filter((b) => b.filename !== filename));
    } catch (err) {
      showModal('Failed to delete backup', 'Error', 'error');
    }
  };

  const handleRestoreBackup = async (filename) => {
    if (!await showConfirm(`Restore to ${filename}?`, 'Restore Backup')) return;
    setRestoringBackupFilename(filename);
    const token = localStorage.getItem('token');
    try {
      const response = await api.post(`/admin/backups/${filename}/restore`, {}, { headers: { Authorization: `Bearer ${token}` } });
      showModal(response.data.message || 'Backup restored!', 'Success', 'success');
      fetchStats();
    } catch (err) {
      showModal('Restore failed.', 'Error', 'error');
    } finally {
      setRestoringBackupFilename(null);
    }
  };

  const handleConfirmCash = async (ticketId, amount) => {
    if (!await showConfirm(`Confirm collection of ${amount} EGP for ticket ${ticketId}?`, 'Confirm Cash')) return;
    const token = localStorage.getItem('token');
    try {
      // Use the administrative endpoint which has more robust sub-admin authorization
      await api.put(`/admin/activate-cash-ticket/${ticketId}`, {}, { headers: { Authorization: `Bearer ${token}` } });
      showModal('Cash collected. Ticket activated.', 'Success', 'success');
      setPendingCashTickets((prev) => prev.filter((t) => t._id !== ticketId));
      fetchStats();
    } catch (error) {
      console.error('Confirm Cash Error:', error);
      showModal(error.response?.data?.message || 'Failed to activate ticket.', 'Error', 'error');
    }
  };

  const handleExportCSV = () => {
    if (auditLogs.length === 0) return;
    const headers = ['Date', 'Email', 'Action', 'Status', 'IP Address'];
    const csvRows = [headers.join(',')];
    auditLogs.forEach((log) => {
      const row = [`"${new Date(log.createdAt).toLocaleString()}"`, `"${log.email}"`, `"${log.action || 'System'}"`, `"${log.status}"`, `"${log.ipAddress}"` ];
      csvRows.push(row.join(','));
    });
    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a'); link.href = url; link.download = `audit-logs-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link); link.click(); document.body.removeChild(link);
  };

  const handleExportUsersCSV = async () => {
    const token = localStorage.getItem('token');
    try {
      const res = await api.get('/admin/users', { params: { role: 'user', limit: 10000 }, headers: { Authorization: `Bearer ${token}` } });
      const exportData = res.data.users || [];
      const headers = ['Name', 'Email', 'Phone', 'Role', 'Status'];
      const csvRows = [headers.join(',')];
      exportData.forEach((u) => csvRows.push([`"${u.name}"`, `"${u.email}"`, `"${u.phone || ''}"`, `"${u.role}"`, `"${u.isRestricted ? 'Restricted' : 'Active'}"`].join(',')));
      const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a'); link.href = url; link.download = 'users.csv';
      document.body.appendChild(link); link.click(); document.body.removeChild(link);
    } catch (e) {}
  };

  const handleExportMonthlySalesCSV = () => {
    if (monthlySales.length === 0) return;
    const headers = ['Month', 'Tickets', 'Revenue'];
    const csvRows = [headers.join(',')];
    monthlySales.forEach((s) => csvRows.push([`"${s.month}"`, `"${s.totalTickets}"`, `"${s.revenue}"`].join(',')));
    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a'); link.href = url; link.download = 'monthly-sales.csv';
    document.body.appendChild(link); link.click(); document.body.removeChild(link);
  };

  // WebSockets
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      socket.auth = { token };
      if (!socket.connected) socket.connect();
    }
    const onConnect = () => socket.emit('joinAdminRoom');
    const onHardwareAlert = (a) => {
      setAlerts((prev) => alertPageRef.current === 1 ? [{ ...a, _id: a.id || a._id, timeString: a.time || a.timeString, createdAt: a.createdAt || new Date().toISOString() }, ...prev].slice(0, 10) : prev);
      setTotalAlertsCount((p) => p + 1);
      if (!isHardwareAlertsExpandedRef.current) setUnreadAlertsCount((p) => p + 1);
    };
    const onOccupancyUpdate = (data) => setStats((prev) => prev ? { ...prev, currentOccupancy: data.currentOccupancy, capacityPercentage: data.capacityPercentage } : null);
    const onTotalTicketsUpdate = (data) => {
      setStats((prev) => prev ? { ...prev, totalTicketsSold: data.totalTicketsSold, purchasingUsers: data.purchasingUsers, mostSoldTicket: data.mostSoldTicket } : null);
      setSyncTrigger((p) => p + 1);
    };
    const onDataRefresh = () => setSyncTrigger((p) => p + 1);
    const onAuditLogUpdate = (l) => {
      setAuditLogs((prev) => auditLogPageRef.current === 1 ? [l, ...prev].slice(0, 50) : prev);
      if (!isAuditLogsExpandedRef.current) setUnreadAuditCount((p) => p + 1);
    };
    const onBannedIpAdded = (ip) => {
      setBannedIPs((prev) => bannedIPsPageRef.current === 1 ? [ip, ...prev].slice(0, 50) : prev);
      setTotalBannedIPs((p) => p + 1);
      if (!isBannedIPsExpandedRef.current) setUnreadBannedCount((p) => p + 1);
    };

    socket.on('connect', onConnect);
    socket.on('hardwareAlert', onHardwareAlert);
    socket.on('occupancyUpdate', onOccupancyUpdate);
    socket.on('totalTicketsUpdate', onTotalTicketsUpdate);
    socket.on('dataRefresh', onDataRefresh);
    socket.on('auditLogUpdate', onAuditLogUpdate);
    socket.on('bannedIpAdded', onBannedIpAdded);
    socket.on('dashboardStatsUpdated', () => setSyncTrigger((p) => p + 1));

    return () => {
      socket.off('connect', onConnect);
      socket.off('hardwareAlert', onHardwareAlert);
      socket.off('occupancyUpdate', onOccupancyUpdate);
      socket.off('totalTicketsUpdate', onTotalTicketsUpdate);
      socket.off('dataRefresh', onDataRefresh);
      socket.off('auditLogUpdate', onAuditLogUpdate);
      socket.off('bannedIpAdded', onBannedIpAdded);
      socket.off('dashboardStatsUpdated');
    };
  }, [setAlerts, setTotalAlertsCount]);

  const maxMonthlySales = useMemo(() => Math.max(...monthlySales.map((s) => s.totalTickets), 1), [monthlySales]);

  const tabs = [
    { id: 'overview', label: 'Overview & Stats', icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z' },
    { id: 'users', label: 'User Management', icon: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z' },
    { id: 'hardware', label: 'Gate & Status', icon: 'M13 10V3L4 14h7v7l9-11h-7z' },
    { id: 'collections', label: 'Cash Collections', icon: 'M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z' },
    ...(isSuperAdmin ? [
      { id: 'access', label: 'Access Control', icon: 'M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z' },
      { id: 'security', label: 'Security Logs', icon: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z' },
      { id: 'grc', label: 'GRC & Security', icon: 'M12 11c0 3.517-1.009 6.799-2.753 9.571m-3.44-2.04l.054-.09A13.916 13.916 0 008 11a4 4 0 118 0c0 1.017-.071 2.019-.203 3m-2.118 6.844A21.88 21.88 0 0015.171 17m3.839 1.132c.645-2.266.99-4.659.99-7.132A8 8 0 008 4.07M3 15.364c.64-1.319 1-2.8 1-4.364 0-1.457.39-2.823 1.07-4' },
      { id: 'system', label: 'System Backups', icon: 'M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01' },
    ] : []),
  ];

  return (
    <div className="min-h-screen bg-smart-bg dark:bg-black font-sans flex flex-col transition-colors duration-300">
      <AdminHeader
        title="Admin Control Panel"
        subtitle={isSuperAdmin ? 'Smart Park Ecosystem (Super Admin)' : 'Smart Park Ecosystem (Sub-Admin)'}
        userName={currentAdminEmail}
        unreadAlertsCount={unreadAlertsCount}
        unreadAuditCount={isSuperAdmin ? unreadAuditCount : 0}
        unreadBannedCount={isSuperAdmin ? unreadBannedCount : 0}
        onLogout={handleLogout}
        onAlertsClick={() => handleTabChange('hardware')}
        onAuditClick={isSuperAdmin ? () => handleTabChange('security') : null}
      />

      <div className="flex flex-grow w-full max-w-[1440px] mx-auto px-4 md:px-8">
        {/* Sidebar Navigation */}
        <aside className="hidden lg:flex flex-col w-72 py-6 pr-6 flex-shrink-0">
          <div className="bg-white dark:bg-gray-800 rounded-[30px] p-5 shadow-2xl border border-smart-light/10 dark:border-gray-700 sticky top-8 flex flex-col space-y-2">
            <h3 className="text-[10px] font-black text-smart-gray dark:text-gray-500 uppercase italic tracking-tighter mb-3 px-4 pt-2">Admin Modules</h3>
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => handleTabChange(tab.id)}
                className={`flex items-center px-5 py-4 rounded-xl text-xs font-black uppercase tracking-widest w-full transition-all duration-300 ${activeTab === tab.id ? 'bg-smart-dark text-white shadow-lg transform scale-[1.02] dark:bg-smart-light dark:text-smart-dark' : 'bg-transparent text-smart-gray dark:text-gray-400 hover:bg-smart-light/10 dark:hover:bg-gray-700'}`}
              >
                <svg className="w-5 h-5 mr-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d={tab.icon}></path></svg>
                {tab.label}
              </button>
            ))}
          </div>
        </aside>

        <main className="flex-1 min-w-0 px-6 py-8 w-full">
          {/* Mobile Tab Navigation */}
          <div className="lg:hidden flex flex-nowrap space-x-4 bg-white dark:bg-gray-800 p-3 rounded-[40px] mb-8 overflow-x-auto whitespace-nowrap gap-4 scrollbar-hide no-scrollbar border border-smart-light/20 shadow-xl">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => handleTabChange(tab.id)}
                className={`inline-flex items-center flex-1 shrink-0 justify-center px-6 py-4 rounded-2xl text-xs font-black uppercase tracking-widest whitespace-nowrap transition-all duration-300 ${activeTab === tab.id ? 'bg-smart-light text-white shadow-lg transform -translate-y-1' : 'bg-transparent text-smart-gray dark:text-gray-400 hover:bg-smart-light/10 dark:hover:bg-gray-700'}`}
              >
                <svg className="w-5 h-5 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d={tab.icon}></path></svg>
                {tab.label}
              </button>
            ))}
          </div>

          {activeTab === 'overview' && (
            <div className="p-4 md:p-8 bg-white dark:bg-gray-800/30 rounded-[40px] border border-smart-light/10 shadow-2xl mb-10 animate-fade-in-up w-full max-w-[1400px] mx-auto">
              <div className="flex justify-between items-center mb-8">
                <h2 className="text-2xl font-black text-smart-dark dark:text-white uppercase italic tracking-tighter flex items-center">
                  <svg className="w-8 h-8 mr-3 text-smart-light" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path></svg>
                  System Overview
                </h2>
                <button onClick={handleManualRefresh} disabled={isRefreshing} className="flex items-center px-6 py-3 bg-white dark:bg-gray-800 border-2 border-smart-light/20 rounded-2xl text-[10px] font-black uppercase tracking-widest text-smart-gray hover:text-smart-dark hover:border-smart-light transition-all shadow-xl active:scale-95 disabled:opacity-50">
                  <svg className={`w-5 h-5 mr-3 ${isRefreshing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
                  {isRefreshing ? 'Syncing...' : 'Refresh Live Data'}
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6 mb-10">
                <div className="relative bg-white dark:bg-gray-800 rounded-full w-[240px] h-[240px] mx-auto flex flex-col items-center justify-center p-4 shadow-xl border-[10px] border-blue-500/20 hover:border-blue-500/40 transition-all transform hover:scale-105 text-center group">
                  <div className="w-12 h-12 bg-blue-500/10 rounded-full flex items-center justify-center mb-3 text-blue-500 group-hover:bg-blue-500 group-hover:text-white transition-colors">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z"></path></svg>
                  </div>
                  <h3 className="text-smart-gray dark:text-gray-400 font-black text-[10px] uppercase tracking-tighter mb-1">Tickets Sold</h3>
                  <span className="text-4xl font-black text-smart-dark dark:text-white italic">{stats?.totalTicketsSold || 0}</span>
                </div>

                <div className="relative bg-white dark:bg-gray-800 rounded-full w-[240px] h-[240px] mx-auto flex flex-col items-center justify-center p-4 shadow-xl text-center transform transition-transform hover:scale-105 group">
                  <svg className="absolute inset-0 w-full h-full transform -rotate-90 pointer-events-none" viewBox="0 0 100 100">
                    <circle cx="50" cy="50" r="46" fill="transparent" stroke="currentColor" strokeWidth="8" className="text-gray-100 dark:text-gray-700" />
                    <circle cx="50" cy="50" r="46" fill="transparent" stroke="currentColor" strokeWidth="8" strokeDasharray="289" strokeDashoffset={289 - (289 * (stats?.capacityPercentage || 0)) / 100} strokeLinecap="round" className="text-smart-light transition-all duration-1000" />
                  </svg>
                  <div className="w-12 h-12 bg-smart-light/10 rounded-full flex items-center justify-center mb-3 text-smart-light group-hover:bg-smart-light group-hover:text-white transition-colors z-10">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"></path></svg>
                  </div>
                  <h3 className="text-smart-gray font-black text-[10px] uppercase mb-1 z-10 tracking-tighter">Occupancy</h3>
                  <span className="text-4xl font-black text-smart-light italic z-10">{stats?.currentOccupancy || 0}</span>
                  <span className="text-[10px] font-bold text-gray-500 z-10 uppercase italic">/ {stats?.maxCapacity || 1000}</span>
                </div>

                <div className="relative bg-white dark:bg-gray-800 rounded-full w-[240px] h-[240px] mx-auto flex flex-col items-center justify-center p-4 shadow-xl border-[10px] border-orange-500/20 hover:border-orange-500/40 transition-all transform hover:scale-105 text-center group">
                  <div className="w-12 h-12 bg-orange-500/10 rounded-full flex items-center justify-center mb-3 text-orange-500 group-hover:bg-orange-500 group-hover:text-white transition-colors">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                  </div>
                  <h3 className="text-smart-gray font-black text-[10px] uppercase mb-1 tracking-tighter">Popular Choice</h3>
                  <span className="text-lg font-black text-smart-dark dark:text-white uppercase italic leading-tight px-2">{stats?.mostSoldTicket || 'N/A'}</span>
                </div>

                <div className="relative bg-white dark:bg-gray-800 rounded-full w-[240px] h-[240px] mx-auto flex flex-col items-center justify-center p-4 shadow-xl text-center transform transition-transform hover:scale-105 group">
                  <svg className="absolute inset-0 w-full h-full transform -rotate-90 pointer-events-none" viewBox="0 0 100 100">
                    <circle cx="50" cy="50" r="46" fill="transparent" stroke="currentColor" strokeWidth="8" className="text-gray-100 dark:text-gray-700" />
                    <circle cx="50" cy="50" r="46" fill="transparent" stroke="currentColor" strokeWidth="8" strokeDasharray="289" strokeDashoffset={289 - (289 * (stats?.activeUsers ? stats.purchasingUsers / stats.activeUsers : 0)) } strokeLinecap="round" className="text-smart-glow transition-all duration-1000" />
                  </svg>
                  <div className="w-12 h-12 bg-smart-glow/10 rounded-full flex items-center justify-center mb-3 text-smart-glow group-hover:bg-smart-glow group-hover:text-white transition-colors z-10">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
                  </div>
                  <h3 className="text-smart-gray font-black text-[10px] uppercase mb-1 z-10 tracking-tighter">User Balance</h3>
                  <span className="text-4xl font-black text-smart-dark dark:text-white italic z-10">{stats?.purchasingUsers || 0}</span>
                  <span className="text-[10px] font-bold text-gray-500 z-10 uppercase italic">of {stats?.activeUsers || 0} Active</span>
                </div>
              </div>

              {isSuperAdmin && !isLoadingStats && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
                  <button onClick={handleResetOccupancy} className="py-4 bg-red-600 hover:bg-red-700 text-white text-[10px] font-black uppercase tracking-widest rounded-3xl transition-all shadow-lg active:scale-95 flex flex-col items-center justify-center gap-2">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
                    Reset Occupancy
                  </button>
                  <button onClick={handleGenerateDummyTickets} className="py-4 bg-smart-light hover:bg-smart-dark text-white text-[10px] font-black uppercase tracking-widest rounded-3xl transition-all shadow-lg active:scale-95 flex flex-col items-center justify-center gap-2">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"></path></svg>
                    Seed Simulation
                  </button>
                  <button onClick={handleClearDummyData} className="py-4 bg-gray-600 hover:bg-gray-700 text-white text-[10px] font-black uppercase tracking-widest rounded-3xl transition-all shadow-lg active:scale-95 flex flex-col items-center justify-center gap-2">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                    Clear Database
                  </button>
                  <button onClick={handleBackupDatabase} className="py-4 bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-black uppercase tracking-widest rounded-3xl transition-all shadow-lg active:scale-95 flex flex-col items-center justify-center gap-2">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4"></path></svg>
                    Fast Backup
                  </button>
                </div>
              )}

              {/* Crowd Insights Panel */}
              <div className={`mb-10 bg-white dark:bg-gray-800 rounded-[40px] shadow-2xl border border-smart-light/10 dark:border-gray-700 overflow-hidden transition-all duration-300 ${isCrowdInsightsExpanded ? 'h-auto' : ''}`}>
                <div className="bg-smart-bg dark:bg-gray-900 px-8 py-6 border-b border-smart-light/10 flex justify-between items-center cursor-pointer hover:bg-smart-bg/80 dark:hover:bg-gray-800 transition-colors" onClick={() => setIsCrowdInsightsExpanded(!isCrowdInsightsExpanded)}>
                  <h2 className="text-xl font-black text-smart-dark dark:text-white flex items-center tracking-tighter uppercase italic select-none">
                    <svg className="w-6 h-6 mr-3 text-smart-light" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"></path></svg>
                    Crowd Insights Grid
                  </h2>
                  <div className="flex items-center space-x-6">
                    <div className="flex items-center space-x-2">
                      <button onClick={(e) => { e.stopPropagation(); setInsightStartDate(prev => { const d = new Date(prev); d.setDate(d.getDate() - 7); return d; }); }} className="px-3 py-1.5 bg-smart-bg dark:bg-gray-800 rounded-lg text-xs font-bold hover:bg-smart-light/20 transition-colors">&larr; Prev 7 Days</button>
                      <button onClick={(e) => { e.stopPropagation(); setInsightStartDate(new Date()); }} className="px-3 py-1.5 bg-smart-light text-white rounded-lg text-xs font-bold hover:bg-smart-dark transition-colors shadow-sm">Today</button>
                      <button onClick={(e) => { e.stopPropagation(); setInsightStartDate(prev => { const d = new Date(prev); d.setDate(d.getDate() + 7); return d; }); }} className="px-3 py-1.5 bg-smart-bg dark:bg-gray-800 rounded-lg text-xs font-bold hover:bg-smart-light/20 transition-colors">Next 7 Days &rarr;</button>
                    </div>
                    <svg className={`w-6 h-6 text-smart-gray dark:text-gray-400 transform transition-transform duration-300 ${isCrowdInsightsExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                  </div>
                </div>
                {isCrowdInsightsExpanded && (
                  <div className="p-8">
                    {loadingInsights ? <div className="flex justify-center py-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-smart-light"></div></div> : (
                      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-4 mb-6">
                        {insights?.days?.map((day, idx) => (
                          <div key={idx} className={`flex flex-col items-center justify-center py-5 px-2 rounded-xl transition-all cursor-pointer ${day.isToday ? 'bg-[#2a3038] border-2 border-[#8cc63f]' : 'bg-[#1e2329] border-2 border-transparent hover:bg-[#2a3038]'}`}>
                            <div className="text-[10px] font-black text-gray-400 mb-2 uppercase tracking-tighter">{day.dayName}</div>
                            <div className={`text-2xl md:text-3xl font-bold mb-1 ${day.crowdLevel === 'quiet' ? 'text-green-500' : day.crowdLevel === 'moderate' ? 'text-yellow-500' : 'text-red-500'}`}>{day.count}</div>
                            <div className={`flex items-center gap-1.5 text-xs font-semibold ${day.crowdLevel === 'quiet' ? 'text-green-500' : day.crowdLevel === 'moderate' ? 'text-yellow-500' : 'text-red-500'}`}>
                              <div className={`w-2 h-2 rounded-full ${day.crowdLevel === 'quiet' ? 'bg-green-500' : day.crowdLevel === 'moderate' ? 'bg-yellow-500' : 'bg-red-500'}`}></div>
                              {day.crowdLevel.charAt(0).toUpperCase() + day.crowdLevel.slice(1)}
                            </div>
                            <div className="text-[9px] text-gray-500 mt-2">{day.displayDate}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Historical Ticket Sales Panel */}
              <div className={`mb-10 bg-white dark:bg-gray-800 rounded-[40px] shadow-2xl border border-smart-light/10 dark:border-gray-700 overflow-hidden transition-all duration-300 ${isMonthlySalesExpanded ? 'h-auto' : ''}`}>
                <div className="bg-smart-bg dark:bg-gray-900 px-8 py-6 border-b border-smart-light/10 flex justify-between items-center cursor-pointer hover:bg-smart-bg/80 dark:hover:bg-gray-800 transition-colors" onClick={() => setIsMonthlySalesExpanded(!isMonthlySalesExpanded)}>
                  <h2 className="text-xl font-black text-smart-dark dark:text-white flex items-center tracking-tighter uppercase italic select-none">
                    <svg className="w-6 h-6 mr-3 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path></svg>
                    Monthly Sales Trend Table
                  </h2>
                  <div className="flex items-center text-smart-gray dark:text-gray-400">
                    <button onClick={(e) => { e.stopPropagation(); handleExportMonthlySalesCSV(); }} className="hidden sm:flex items-center mr-4 px-3 py-1.5 bg-smart-light/10 hover:bg-smart-light/20 text-smart-light rounded-lg text-[10px] font-bold uppercase tracking-widest transition-colors border border-smart-light/20">
                      <svg className="w-3 h-3 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
                      Export CSV
                    </button>
                    <svg className={`w-6 h-6 transform transition-transform duration-300 ${isMonthlySalesExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                  </div>
                </div>
                {isMonthlySalesExpanded && (
                  <div className="p-8">
                    {monthlySales.length > 0 ? (
                      <>
                        <div className="flex items-end justify-between space-x-4 min-w-[600px] h-64 mt-4 mb-4 border-b-2 border-smart-light/20 pb-4 overflow-x-auto">
                          {monthlySales.map((sale, idx) => {
                            const heightPercent = Math.max((sale.totalTickets / maxMonthlySales) * 100, 5);
                            return (
                              <div key={idx} className="flex flex-col items-center justify-end w-full h-full group relative">
                                <div className="absolute -top-12 opacity-0 group-hover:opacity-100 transition-opacity text-center bg-smart-dark text-white text-[10px] font-bold px-2 py-1 rounded shadow-lg whitespace-nowrap z-10">{sale.totalTickets} Sold</div>
                                <div className="w-full max-w-[50px] bg-smart-light/20 group-hover:bg-smart-light transition-colors rounded-t-xl relative border border-smart-light/30" style={{ height: `${heightPercent}%` }}></div>
                                <div className="absolute -bottom-10 text-[10px] font-black text-smart-gray dark:text-gray-400 uppercase tracking-tighter text-center w-full">{sale.month}</div>
                              </div>
                            );
                          })}
                        </div>
                        <div className="mt-12 overflow-x-auto">
                          <table className="w-full text-left">
                            <thead>
                              <tr className="bg-smart-bg dark:bg-gray-900 border-b border-smart-light/10 text-smart-gray dark:text-gray-500 text-[10px] font-black uppercase tracking-widest">
                                <th className="px-6 py-4">Month</th>
                                <th className="px-6 py-4 text-center">Tickets Sold</th>
                                <th className="px-6 py-4 text-right">Revenue (EGP)</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-smart-bg dark:divide-gray-700">
                              {monthlySales.map((sale, idx) => (
                                <tr key={idx} className="hover:bg-smart-bg/50 dark:hover:bg-gray-700/50 transition-colors">
                                  <td className="px-6 py-4 font-black text-smart-dark dark:text-white uppercase italic text-sm">{sale.month}</td>
                                  <td className="px-6 py-4 text-center text-smart-gray dark:text-gray-400 font-bold">{sale.totalTickets}</td>
                                  <td className="px-6 py-4 text-right font-black text-smart-dark dark:text-white italic">{sale.revenue}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </>
                    ) : <div className="p-12 text-center text-smart-gray font-black uppercase tracking-widest">No sales data found.</div>}
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'users' && (
            <div className="mb-10 bg-white dark:bg-gray-800 rounded-[40px] shadow-2xl border border-smart-light/10 dark:border-gray-700 overflow-hidden animate-fade-in-up">
              <div className="bg-smart-bg dark:bg-gray-900 px-8 py-6 border-b border-smart-light/10 flex justify-between items-center cursor-pointer" onClick={() => setIsUserManagementExpanded(!isUserManagementExpanded)}>
                <h2 className="text-xl font-black text-smart-dark dark:text-white flex items-center tracking-tighter uppercase italic">
                  <svg className="w-6 h-6 mr-3 text-smart-light" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"></path></svg>
                  User Management Registry
                </h2>
                <div className="flex items-center text-smart-gray dark:text-gray-400">
                  <button onClick={(e) => { e.stopPropagation(); handleExportUsersCSV(); }} className="hidden sm:flex items-center mr-4 px-3 py-1.5 bg-smart-light/10 hover:bg-smart-light/20 text-smart-light rounded-lg text-[10px] font-bold uppercase tracking-widest border border-smart-light/20 transition-colors">Export CSV</button>
                  <span className="text-xs font-bold mr-4 uppercase tracking-widest">{totalUsersCount} Total</span>
                  <svg className={`w-6 h-6 transform transition-transform duration-300 ${isUserManagementExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                </div>
              </div>
              {isUserManagementExpanded && (
                <>
                  <div className="bg-smart-bg/30 dark:bg-gray-900/30 px-8 py-5 border-b border-smart-light/10 flex flex-col md:flex-row gap-4 justify-between items-center">
                    <input type="text" placeholder="SEARCH BY NAME OR EMAIL..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full md:max-w-md pl-11 pr-4 py-3 rounded-2xl border-2 border-smart-light/20 bg-white dark:bg-gray-800 text-smart-dark dark:text-white focus:ring-4 focus:ring-smart-light/20 focus:border-smart-light outline-none transition font-mono text-xs font-black tracking-widest" />
                    <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="w-full md:w-auto px-5 py-3 rounded-2xl border-2 border-smart-light/20 bg-white dark:bg-gray-800 text-smart-dark dark:text-white focus:ring-4 focus:ring-smart-light/20 focus:border-smart-light outline-none transition font-mono text-xs font-black tracking-widest cursor-pointer">
                      <option value="ALL">ALL STATUSES</option>
                      <option value="ACTIVE">ACTIVE USERS</option>
                      <option value="RESTRICTED">RESTRICTED USERS</option>
                    </select>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left">
                      <thead>
                        <tr className="bg-smart-bg dark:bg-gray-900 border-b border-smart-light/10 text-smart-gray dark:text-gray-500 text-[10px] font-black uppercase tracking-widest">
                          <th className="px-6 py-4">Name</th><th className="px-6 py-4">Email</th><th className="px-6 py-4 text-center">Tickets</th><th className="px-6 py-4 text-center">Status</th><th className="px-6 py-4 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-smart-bg dark:divide-gray-700">
                        {regularUsers.map((user) => (
                          <tr key={user._id} className="hover:bg-smart-bg/50 dark:hover:bg-gray-700/50 transition-colors">
                            <td className="px-6 py-5 font-black text-smart-dark dark:text-white italic capitalize text-sm">{user.name}</td>
                            <td className="px-6 py-5 text-smart-gray dark:text-gray-400 font-medium text-xs">{user.email}</td>
                            <td className="px-6 py-5 text-center"><span className="px-3 py-1 bg-blue-500/10 text-blue-500 rounded-full font-black text-[11px] border border-blue-500/20">{user.ticketCount || 0}</span></td>
                            <td className="px-6 py-5 text-center">
                              <span className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border ${user.isRestricted ? 'bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-900/30 dark:text-orange-400' : 'bg-smart-light/10 text-smart-glow border-smart-light/20'}`}>
                                {user.isRestricted ? 'Restricted' : 'Active'}
                              </span>
                            </td>
                            <td className="px-6 py-5 text-right space-x-2">
                              <button onClick={() => router.push(`/admin/users/${user._id}/tickets?fromTab=${activeTab}`)} className="px-4 py-2 bg-blue-50 dark:bg-blue-900/20 text-blue-600 rounded-xl text-[10px] font-black uppercase tracking-widest border border-blue-200 hover:bg-blue-600 hover:text-white transition-all">Passes</button>
                              <button onClick={() => handleRestrictUser(user._id, user.isRestricted)} className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest text-white transition-all ${user.isRestricted ? 'bg-orange-500 hover:bg-orange-600' : 'bg-red-500 hover:bg-red-600'}`}>{user.isRestricted ? 'Enable' : 'Restrict'}</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {totalUserPages > 1 && (
                    <div className="bg-smart-bg/30 dark:bg-gray-900/30 px-8 py-4 border-t border-smart-light/10 flex justify-between items-center">
                      <span className="text-[10px] font-bold text-smart-gray uppercase tracking-widest">Page {userPage} of {totalUserPages}</span>
                      <div className="flex space-x-2">
                        <button onClick={() => fetchUsers(userPage - 1)} disabled={userPage === 1} className="px-4 py-2 bg-white dark:bg-gray-800 rounded-xl text-[10px] font-black border border-smart-light/20 disabled:opacity-50">Prev</button>
                        <button onClick={() => fetchUsers(userPage + 1)} disabled={userPage >= totalUserPages} className="px-4 py-2 bg-white dark:bg-gray-800 rounded-xl text-[10px] font-black border border-smart-light/20 disabled:opacity-50">Next</button>
                      </div>
                    </div>
                  )}
                </>
              )}
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

              <div className="grid grid-cols-1 xl:grid-cols-3 gap-10">
                <div className="xl:col-span-1 bg-white dark:bg-gray-800 rounded-[40px] shadow-2xl border border-smart-light/10 overflow-hidden flex flex-col">
                  <div className="bg-smart-bg dark:bg-gray-900 px-8 py-6 border-b border-smart-light/10 flex flex-col items-center">
                    <h3 className="text-xl font-black italic uppercase tracking-tighter mb-4">Optical Node Scanner</h3>
                    <div className="flex gap-2">
                      <button onClick={handleToggleSensor} className={`px-6 py-2 rounded-xl text-[10px] font-black uppercase transition-all shadow-md text-white ${isCameraActive ? 'bg-red-500' : 'bg-green-500'}`}>{isCameraActive ? 'Halt Sensor' : 'Authorize Sensor'}</button>
                    </div>
                  </div>
                  <div className="p-8 flex flex-col items-center bg-gray-50 dark:bg-black/20">
                    <div id="reader" className="w-full aspect-square bg-gray-900 rounded-[50px] border-8 border-smart-dark overflow-hidden shadow-2xl relative">
                      {isLockedUI && (
                        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/60 backdrop-blur-sm">
                          <button onClick={handleNextScan} className="bg-blue-500 hover:bg-blue-600 text-white font-black py-4 px-10 rounded-2xl shadow-2xl uppercase tracking-widest text-sm active:scale-95 transition-all">Next Scan</button>
                        </div>
                      )}
                    </div>
                    {scanMessage && (
                      <div className={`mt-6 p-4 rounded-xl font-black text-center text-xs shadow-lg border-2 w-full ${scanMessage.type === 'success' ? 'bg-green-50 border-green-500 text-green-700' : 'bg-red-50 border-red-500 text-red-700'}`}>
                        {scanMessage.text}
                      </div>
                    )}
                    <label className="mt-6 text-sm text-slate-400 hover:text-smart-dark cursor-pointer transition-colors flex items-center gap-2 font-bold uppercase tracking-widest">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                      Scan Image File
                      <input type="file" className="hidden" accept="image/*" onChange={handleFileScan} />
                    </label>
                  </div>
                  <div className="bg-smart-bg dark:bg-gray-900 p-8 border-t border-smart-light/10">
                    <form onSubmit={(e) => { e.preventDefault(); if (manualTicketId) onScanSuccess(manualTicketId); }} className="space-y-4">
                      <input type="text" value={manualTicketId} onChange={(e) => setManualTicketId(e.target.value)} placeholder="ENTER TOKEN IDENTIFIER..." className="w-full px-6 py-5 rounded-[30px] border-4 border-smart-bg bg-white dark:bg-gray-800 text-smart-dark dark:text-white font-mono text-sm font-black focus:border-smart-light outline-none transition-all" />
                      <button type="submit" className="w-full py-5 bg-smart-dark text-white rounded-[30px] font-black uppercase text-xs shadow-xl active:scale-95 transition-all">Verify Node ID</button>
                    </form>
                  </div>
                </div>

                <div id="hardware-alerts-panel" className="xl:col-span-2 bg-white dark:bg-gray-800 rounded-[40px] shadow-2xl border border-smart-light/10 dark:border-gray-700 flex flex-col overflow-hidden">
                  <div className="bg-smart-bg dark:bg-gray-900 px-8 py-6 border-b border-smart-light/10 flex justify-between items-center">
                    <h2 className="text-xl font-black text-smart-dark dark:text-white flex items-center tracking-tighter uppercase italic">
                      <svg className="w-6 h-6 mr-3 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
                      Hardware Alerts Log
                    </h2>
                    <select value={alertFilterType} onChange={(e) => { setAlertFilterType(e.target.value); fetchAlertsPage(1); }} className="px-4 py-2 rounded-xl border-2 border-smart-light/20 bg-white dark:bg-gray-800 text-smart-dark dark:text-white font-mono text-[10px] font-black uppercase tracking-widest cursor-pointer">
                      <option value="all">ALL ALERTS</option><option value="warning">WARNINGS</option><option value="info">INFO</option><option value="error">ERRORS</option><option value="success">SUCCESS</option>
                    </select>
                  </div>
                  <div className="flex-grow overflow-y-auto max-h-[600px] custom-scrollbar">
                    <table className="w-full text-left">
                      <thead className="sticky top-0 bg-smart-bg dark:bg-gray-900 z-10 text-smart-gray text-[10px] font-black uppercase tracking-widest">
                        <tr className="border-b border-smart-light/10"><th className="px-6 py-4">Time</th><th className="px-6 py-4 text-center">Type</th><th className="px-6 py-4">Alert Details</th></tr>
                      </thead>
                      <tbody className="divide-y divide-smart-bg dark:divide-gray-700">
                        {alerts.map((alert, idx) => (
                          <tr key={idx} className="hover:bg-smart-bg/50 dark:hover:bg-gray-700/50 transition-colors">
                            <td className="px-6 py-5 align-top">
                              <div className="text-sm font-bold text-smart-dark dark:text-gray-300">{alert.timeString || alert.time}</div>
                              <div className="text-[10px] text-smart-gray font-bold uppercase mt-1">{new Date(alert.createdAt).toLocaleDateString()}</div>
                            </td>
                            <td className="px-6 py-5 text-center align-top">
                              <span className={`inline-block w-20 py-1.5 rounded-md text-[9px] font-black uppercase tracking-wider border ${alert.type === 'warning' ? 'bg-yellow-100 text-yellow-800 border-yellow-200' : alert.type === 'error' ? 'bg-red-100 text-red-800 border-red-200' : alert.type === 'success' ? 'bg-green-100 text-green-800 border-green-200' : 'bg-blue-100 text-blue-800 border-blue-200'}`}>
                                {alert.type}
                              </span>
                            </td>
                            <td className="px-6 py-5 text-smart-dark dark:text-gray-200 font-medium text-sm leading-relaxed">{alert.message}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="bg-smart-bg dark:bg-gray-900 p-6 border-t border-smart-light/10 flex justify-center">
                    <button onClick={() => router.push('/admin/telemetry')} className="bg-green-600 hover:bg-green-700 text-white font-black text-[11px] py-3 px-8 rounded-xl transition-all uppercase tracking-widest shadow-lg">Live Telemetry Feed</button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'collections' && (
            <div className="bg-white dark:bg-gray-800 rounded-[40px] shadow-2xl border border-smart-light/10 overflow-hidden animate-fade-in-up">
              <div className="bg-smart-bg dark:bg-gray-900 px-8 py-6 border-b border-smart-light/10 flex justify-between items-center">
                <h2 className="text-xl font-black italic uppercase tracking-tighter flex items-center">
                  <svg className="w-6 h-6 mr-3 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z"></path></svg>
                  Cash Collections Portal
                </h2>
                <div className="flex bg-white dark:bg-gray-800 p-1 rounded-xl border border-smart-light/10">
                  <button onClick={() => setCashFilterStatus('PENDING')} className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${cashFilterStatus === 'PENDING' ? 'bg-smart-light text-white shadow-md' : 'text-smart-gray'}`}>Pending</button>
                  <button onClick={() => setCashFilterStatus('PAID')} className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${cashFilterStatus === 'PAID' ? 'bg-smart-light text-white shadow-md' : 'text-smart-gray'}`}>History</button>
                </div>
              </div>
              <div className="p-8 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                {pendingCashTickets.length > 0 ? pendingCashTickets.map((t) => (
                  <div key={t._id} className="p-8 bg-smart-bg dark:bg-gray-900 rounded-[40px] border-4 border-smart-light/10 hover:border-smart-light/30 transition-all flex flex-col justify-between shadow-xl group">
                    <div>
                      <div className="flex justify-between items-start mb-6">
                        <span className={`text-[10px] font-black uppercase px-4 py-1.5 rounded-full tracking-widest ${t.paymentStatus === 'PENDING' ? 'bg-amber-500 text-white' : 'bg-green-500 text-white'}`}>{t.paymentStatus}</span>
                        <span className="text-3xl font-black italic tracking-tighter text-smart-dark dark:text-white group-hover:text-smart-glow transition-colors">{t.price} EGP</span>
                      </div>
                      <h4 className="font-black text-base uppercase truncate text-smart-dark dark:text-white italic">{t.userId?.name || 'Unknown'}</h4>
                      <p className="text-[11px] font-bold font-mono text-smart-gray mb-8 truncate">{t.userId?.email || 'N/A'}</p>
                    </div>
                    {t.paymentStatus === 'PENDING' && (
                      <button onClick={() => handleConfirmCash(t._id, t.price)} className="w-full py-5 bg-smart-light hover:bg-smart-dark text-white rounded-[25px] font-black uppercase text-[11px] shadow-lg transition-all active:scale-95">Confirm Collection</button>
                    )}
                  </div>
                )) : <div className="col-span-full py-20 text-center text-smart-gray font-black uppercase italic tracking-widest">No transaction records found.</div>}
              </div>
            </div>
          )}

          {activeTab === 'access' && isSuperAdmin && (
            <div className="space-y-10 animate-fade-in-up">
              <div className="bg-white dark:bg-gray-800 rounded-[40px] shadow-2xl border border-smart-light/10 dark:border-gray-700 overflow-hidden flex flex-col">
                <div className="bg-smart-bg dark:bg-gray-900 px-8 py-6 border-b border-smart-light/10 flex justify-between items-center cursor-pointer" onClick={() => setIsSubAdminsExpanded(!isSubAdminsExpanded)}>
                  <h2 className="text-xl font-black text-smart-dark dark:text-white flex items-center tracking-tighter uppercase italic">
                    <svg className="w-6 h-6 mr-3 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
                    Sub-Admin Registry
                  </h2>
                  <span className="text-xs font-bold text-smart-gray uppercase tracking-widest">{subAdmins.length} Nodes</span>
                </div>
                {isSubAdminsExpanded && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left">
                      <thead>
                        <tr className="bg-smart-bg dark:bg-gray-900 border-b border-smart-light/10 text-smart-gray dark:text-gray-500 text-[10px] font-black uppercase tracking-widest">
                          <th className="px-6 py-4">Identity</th><th className="px-6 py-4">Security Status</th><th className="px-6 py-4 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-smart-bg dark:divide-gray-700">
                        {subAdmins.map((admin) => (
                          <tr key={admin._id} className="hover:bg-smart-bg/30 transition-colors">
                            <td className="px-6 py-5"><p className="font-black text-sm uppercase italic text-smart-dark dark:text-white">{admin.name}</p><p className="text-[10px] font-bold text-smart-gray font-mono">{admin.email}</p></td>
                            <td className="px-6 py-5"><span className={`px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest border ${admin.isRestricted ? 'bg-orange-100 text-orange-800 border-orange-200' : 'bg-smart-light/10 text-smart-glow border-smart-light/20'}`}>{admin.isRestricted ? 'Restricted' : 'Operational'}</span></td>
                            <td className="px-6 py-5 text-right space-x-2">
                              {admin.email !== superAdminEmail ? (
                                <>
                                  <button onClick={() => handleRestrictUser(admin._id, admin.isRestricted)} className={`px-4 py-2 rounded-xl text-[9px] font-black uppercase text-white transition-all ${admin.isRestricted ? 'bg-green-500 hover:bg-green-600' : 'bg-orange-500 hover:bg-orange-600'}`}>{admin.isRestricted ? 'Enable' : 'Restrict'}</button>
                                  <button onClick={() => handleDeleteUser(admin._id)} className="px-4 py-2 bg-red-500/10 text-red-500 rounded-xl text-[9px] font-black uppercase border border-red-500/20 hover:bg-red-500 hover:text-white transition-all">Delete</button>
                                </>
                              ) : <span className="text-[10px] font-black uppercase text-smart-gray italic mr-2">System Owner</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div className="bg-white dark:bg-gray-800 rounded-[40px] shadow-2xl border border-smart-light/10 dark:border-gray-700 overflow-hidden">
                <div className="bg-smart-bg dark:bg-gray-900 px-8 py-6 border-b border-smart-light/10"><h2 className="text-xl font-black italic uppercase tracking-tighter">Authorize New Node</h2></div>
                <div className="p-8"><form onSubmit={handleCreateSubAdmin} className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div><label className="block text-[10px] font-black text-smart-gray uppercase mb-2">Node Name</label><input type="text" value={newAdminName} onChange={(e) => setNewAdminName(e.target.value)} className="w-full px-5 py-3 rounded-2xl border-2 border-smart-light/20 bg-smart-bg dark:bg-gray-900 text-sm font-bold focus:border-smart-light outline-none transition-all" required /></div>
                  <div><label className="block text-[10px] font-black text-smart-gray uppercase mb-2">Node Email</label><input type="email" value={newAdminEmail} onChange={(e) => setNewAdminEmail(e.target.value)} className="w-full px-5 py-3 rounded-2xl border-2 border-smart-light/20 bg-smart-bg dark:bg-gray-900 text-sm font-bold focus:border-smart-light outline-none transition-all" required /></div>
                  <div><label className="block text-[10px] font-black text-smart-gray uppercase mb-2">Auth Key</label><input type="password" value={newAdminPassword} onChange={(e) => setNewAdminPassword(e.target.value)} className="w-full px-5 py-3 rounded-2xl border-2 border-smart-light/20 bg-smart-bg dark:bg-gray-900 text-sm font-bold focus:border-smart-light outline-none transition-all" required /></div>
                  <div><label className="block text-[10px] font-black text-smart-gray uppercase mb-2">IP Binding</label><input type="text" value={newAdminIp} onChange={(e) => setNewAdminIp(e.target.value)} className="w-full px-5 py-3 rounded-2xl border-2 border-smart-light/20 bg-smart-bg dark:bg-gray-900 text-sm font-bold focus:border-smart-light outline-none transition-all" required /></div>
                  <div className="md:col-span-2 flex justify-end"><button type="submit" className="px-10 py-4 bg-smart-light hover:bg-smart-dark text-white rounded-2xl font-black uppercase text-[11px] shadow-xl transition-all active:scale-95">Provision Node</button></div>
                </form></div>
              </div>
            </div>
          )}

          {activeTab === 'security' && isSuperAdmin && (
            <div className="space-y-10 animate-fade-in-up">
              <div id="audit-logs-panel" className="bg-white dark:bg-gray-800 rounded-[40px] shadow-2xl border border-smart-light/10 dark:border-gray-700 overflow-hidden flex flex-col">
                <div className="bg-smart-bg dark:bg-gray-900 px-8 py-6 border-b border-smart-light/10 flex justify-between items-center cursor-pointer" onClick={() => setIsAuditLogsExpanded(!isAuditLogsExpanded)}>
                  <h2 className="text-xl font-black text-smart-dark dark:text-white flex items-center tracking-tighter uppercase italic">
                    <svg className="w-6 h-6 mr-3 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"></path></svg>
                    Security Audit Registry
                  </h2>
                  <div className="flex items-center gap-4">
                    <button onClick={(e) => { e.stopPropagation(); handleExportCSV(); }} className="hidden sm:flex items-center px-4 py-2 bg-smart-light/10 text-smart-light rounded-lg text-[10px] font-black uppercase border border-smart-light/20">Export Logs</button>
                    <svg className={`w-6 h-6 text-smart-gray transform transition-transform duration-300 ${isAuditLogsExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                  </div>
                </div>
                {isAuditLogsExpanded && (
                  <div className="overflow-x-auto max-h-[500px]">
                    <table className="w-full text-left">
                      <thead className="sticky top-0 bg-smart-bg dark:bg-gray-900 z-10 text-smart-gray text-[10px] font-black uppercase tracking-widest">
                        <tr className="border-b border-smart-light/10"><th className="px-8 py-4">Time Entry</th><th className="px-8 py-4">Identity</th><th className="px-8 py-4">Intervention</th><th className="px-8 py-4 text-center">Status</th><th className="px-8 py-4 text-right">IP Origin</th></tr>
                      </thead>
                      <tbody className="divide-y divide-smart-bg dark:divide-gray-700">
                        {auditLogs.map((log) => (
                          <tr key={log._id} className="hover:bg-smart-bg/30 transition-colors">
                            <td className="px-8 py-5 text-[11px] font-bold text-smart-gray">{new Date(log.createdAt).toLocaleString()}</td>
                            <td className="px-8 py-5 text-[11px] font-black text-smart-light italic">{log.email}</td>
                            <td className="px-8 py-5 text-[12px] font-black uppercase text-smart-dark dark:text-white">{log.action || 'Authentication'}</td>
                            <td className="px-8 py-5 text-center"><span className={`px-4 py-1 rounded-full text-[9px] font-black uppercase border ${log.status === 'success' ? 'bg-green-500/10 text-green-500 border-green-500/20' : 'bg-red-500/10 text-red-500 border-red-500/20'}`}>{log.status}</span></td>
                            <td className="px-8 py-5 text-right font-mono text-[10px] text-smart-gray">{log.ipAddress}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div id="banned-ips-panel" className="bg-white dark:bg-gray-800 rounded-[40px] shadow-2xl border border-smart-light/10 dark:border-gray-700 overflow-hidden flex flex-col">
                <div className="bg-smart-bg dark:bg-gray-900 px-8 py-6 border-b border-smart-light/10 flex justify-between items-center cursor-pointer" onClick={() => setIsBannedIPsExpanded(!isBannedIPsExpanded)}>
                  <h2 className="text-xl font-black text-smart-dark dark:text-white flex items-center tracking-tighter uppercase italic">
                    <svg className="w-6 h-6 mr-3 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
                    Banned IP Nodes
                  </h2>
                  <span className="text-xs font-bold text-smart-gray uppercase tracking-widest">{totalBannedIPs} Restricted Nodes</span>
                </div>
                {isBannedIPsExpanded && (
                  <div className="overflow-x-auto max-h-[400px]">
                    <table className="w-full text-left">
                      <thead>
                        <tr className="bg-smart-bg dark:bg-gray-900 text-smart-gray text-[10px] font-black uppercase tracking-widest border-b border-smart-light/10"><th className="px-8 py-4">IP Address</th><th className="px-8 py-4">Restriction Reason</th><th className="px-8 py-4 text-right">Actions</th></tr>
                      </thead>
                      <tbody className="divide-y divide-smart-bg dark:divide-gray-700">
                        {bannedIPs.map((ip) => (
                          <tr key={ip._id} className="hover:bg-smart-bg/30 transition-colors"><td className="px-8 py-5 font-mono text-sm text-smart-dark dark:text-white font-black">{ip.ipAddress}</td><td className="px-8 py-5 text-xs text-smart-gray italic">{ip.reason}</td><td className="px-8 py-5 text-right"><button onClick={() => handleUnbanIP(ip._id)} className="px-6 py-2 bg-green-500/10 text-green-600 rounded-xl text-[10px] font-black uppercase border border-green-500/20 hover:bg-green-500 hover:text-white transition-all">Authorize Node</button></td></tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'system' && isSuperAdmin && (
            <div className="bg-white dark:bg-gray-800 rounded-[40px] shadow-2xl border border-smart-light/10 dark:border-gray-700 overflow-hidden flex flex-col animate-fade-in-up">
              <div className="bg-smart-bg dark:bg-gray-900 px-8 py-6 border-b border-smart-light/10 flex justify-between items-center"><h2 className="text-xl font-black italic uppercase tracking-tighter">System Data Preservation</h2></div>
              <div className="overflow-x-auto"><table className="w-full text-left">
                <thead className="text-smart-gray text-[10px] font-black uppercase tracking-widest bg-smart-bg dark:bg-gray-900 border-b border-smart-light/10"><tr className="border-b border-smart-light/10"><th className="px-8 py-4">Archive Hash</th><th className="px-8 py-4">Volume</th><th className="px-8 py-4 text-right">Preservation Protocol</th></tr></thead>
                <tbody className="divide-y divide-smart-bg dark:divide-gray-700">
                  {backups.map((b) => (
                    <tr key={b.filename} className="hover:bg-smart-bg/30 transition-colors">
                      <td className="px-8 py-5 font-mono text-xs text-smart-dark dark:text-white font-black">{b.filename}</td><td className="px-8 py-5 text-xs text-smart-gray">{b.size}</td>
                      <td className="px-8 py-5 text-right space-x-2">
                        <button onClick={() => handleDownloadBackup(b.filename)} className="px-4 py-2 bg-blue-500/10 text-blue-500 rounded-xl text-[9px] font-black uppercase border border-blue-500/20 hover:bg-blue-500 hover:text-white transition-all">Retrieve</button>
                        <button onClick={() => handleRestoreBackup(b.filename)} disabled={restoringBackupFilename === b.filename} className="px-4 py-2 bg-green-500/10 text-green-600 rounded-xl text-[9px] font-black uppercase border border-green-500/20 flex-inline items-center justify-center min-w-[80px]">{restoringBackupFilename === b.filename ? 'Restoring' : 'Restore'}</button>
                        <button onClick={() => handleDeleteBackup(b.filename)} className="px-4 py-2 bg-red-500/10 text-red-500 rounded-xl text-[9px] font-black uppercase border border-red-500/20 hover:bg-red-500 hover:text-white transition-all">Purge</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
};

export default AdminDashboard;
