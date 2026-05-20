import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { socket } from '../socket';
import AdminHeader from '../components/AdminHeader';
import { useUI } from '../context/UIContext';
import api from '../api';

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

const AdminHardwareAlerts = () => {
  const navigate = useNavigate();

  // Early return if token is missing (prevents crash during logout transition)
  if (!localStorage.getItem('token')) return null;

  const { showModal, showConfirm } = useUI();

  const fetchAlerts = useCallback(
    async (pageNum, silent = false) => {
      const token = localStorage.getItem('token');
      if (isTokenExpired(token)) {
        console.log('Token is expired or missing. Redirecting to login.');
        // Clear potentially bad token and user info
        localStorage.removeItem('token');
        localStorage.removeItem('adminEmail');
        navigate('/');
        return;
      }

      if (!silent) setLoading(true);

      try {
        const params = {
          page: pageNum,
          limit: 50,
        };
        if (filterDate) params.date = filterDate;
        if (filterType !== 'all') params.type = filterType;

        const response = await api.get('/admin/hardware-alerts', { params });
        const data = response.data;

        // Fallback to raw array if backend hasn't been updated to pagination yet
        setAlerts(data.alerts || (Array.isArray(data) ? data : []));
        setTotalPages(data.totalPages || 1);
        setTotalAlertsCount(data.totalAlerts || 0);
      } catch (error) {
        console.error('Error fetching alerts:', error);
        if (error.response?.status === 401) {
          console.error('Unauthorized: Invalid or expired token. Logging out.');
          localStorage.removeItem('token');
          localStorage.removeItem('adminEmail');
          navigate('/');
        }
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [filterDate, filterType, navigate]
  );

  // Stabilize the navigate function for props
  const onAuditClick = useCallback(() => {
    navigate('/admin/dashboard');
  }, [navigate]);

  // Keep a ref of the current page so WebSockets know if they should append to the view
  useEffect(() => {
    pageRef.current = page;
  }, [page]);

  useEffect(() => {
    fetchAlerts(page);
    const interval = setInterval(() => fetchAlerts(page, true), 30000);
    return () => clearInterval(interval);
  }, [page, fetchAlerts]);

  // Connect to real-time WebSockets
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      socket.auth = { token };
      if (!socket.connected) {
        socket.connect();
      }
    }

    const onHardwareAlert = (newAlert) => {
      // Format the incoming socket alert to match the MongoDB schema
      const formattedAlert = {
        _id: newAlert.id || newAlert._id,
        message: newAlert.message,
        type: newAlert.type,
        timeString: newAlert.time || newAlert.timeString,
        createdAt: newAlert.createdAt || new Date().toISOString(),
      };

      // Only push real-time alerts to the top if the user is looking at Page 1
      if (pageRef.current === 1) {
        setAlerts((prevAlerts) => [formattedAlert, ...prevAlerts].slice(0, 50));
      }
    };

    const onAuditLogUpdate = () => {
      setUnreadAuditCount((prev) => prev + 1);
    };

    const onHardwareAlertsCleared = async (data) => {
      console.log('🧹 Received Hardware Alerts Cleared signal');
      if (data && data.partial) {
        try {
          const res = await api.get('/admin/hardware-alerts', {
            params: { page: 1, limit: 10 },
          });
          const json = res.data;
          setAlerts(json.alerts || (Array.isArray(json) ? json : []));
          setPage(1);
          setTotalPages(json.totalPages || 1);
          setTotalAlertsCount(json.totalAlerts || 0);
        } catch (err) {
          console.error('Failed to refetch after partial clear', err);
        }
      } else {
        setAlerts([]);
        setTotalPages(1);
        setTotalAlertsCount(0);
        setPage(1);
      }
    };

    const onDataRefresh = () => {
      console.log('🔄 Hardware Alerts: Received Global Data Refresh Signal');
      fetchAlerts(pageRef.current, true);
    };

    socket.on('hardwareAlert', onHardwareAlert);
    socket.on('auditLogUpdate', onAuditLogUpdate);
    socket.on('hardwareAlertsCleared', onHardwareAlertsCleared);
    socket.on('dataRefresh', onDataRefresh);

    socket.on('connect_error', (err) => {
      console.error('❌ Socket Connection Error:', err.message);
      if (err.message.includes('Authentication error')) {
        showModal('Session expired or unauthorized. Redirecting to login.', 'Auth Error', 'error');
        localStorage.removeItem('token');
        localStorage.removeItem('adminEmail');
        navigate('/');
      }
    });

    return () => {
      // Only remove the listeners for this component, do not disconnect the socket
      socket.off('hardwareAlert', onHardwareAlert);
      socket.off('auditLogUpdate', onAuditLogUpdate);
      socket.off('hardwareAlertsCleared', onHardwareAlertsCleared);
      socket.off('dataRefresh', onDataRefresh);
      socket.off('connect_error');
    };
  }, [fetchAlerts]);

  const handleClearHardwareAlerts = async (olderThan = null) => {
    const confirmMsg = olderThan
      ? `Are you sure you want to wipe hardware alerts older than ${olderThan} days?`
      : 'Are you sure you want to completely wipe the hardware alert history? This action cannot be undone.';

    const isConfirmed = await showConfirm(confirmMsg, 'Clear Alerts');
    if (!isConfirmed) return;


    try {
      const params = {};
      if (olderThan) params.olderThan = olderThan;

      const response = await api.delete('/admin/hardware-alerts', { params });
      if (olderThan === null) {
        showModal(response.data?.message || 'Hardware alert history has been cleared.', 'Success', 'success');
      }
      } catch (error) {
      console.error('Failed to clear hardware alerts', error);
      showModal(
        error.response?.data?.message || 'Network error while clearing alerts.',
        'Error',
        'error'
      );
      }

  };

  const filteredAlerts = useMemo(
    () =>
      alerts.filter((alert) => {
        if (filterType !== 'all' && alert.type !== filterType) return false;
        if (filterDate) {
          const alertDate = new Date(alert.createdAt).toISOString().split('T')[0];
          if (alertDate !== filterDate) return false;
        }
        return true;
      }),
    [alerts, filterType, filterDate]
  );

  const handleExportCSV = () => {
    if (filteredAlerts.length === 0) return;

    const headers = ['Date', 'Time', 'Type', 'Message'];
    const csvRows = [headers.join(',')];

    filteredAlerts.forEach((alert) => {
      const row = [
        `"${new Date(alert.createdAt).toLocaleDateString()}"`,
        `"${alert.timeString || ''}"`,
        `"${alert.type.toUpperCase()}"`,
        `"${alert.message ? alert.message.replace(/"/g, '""') : ''}"`,
      ];
      csvRows.push(row.join(','));
    });

    const csvString = csvRows.join('\n');
    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute(
      'download',
      `smart-park-hardware-alerts-${new Date().toISOString().split('T')[0]}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="min-h-screen bg-smart-bg dark:bg-black font-sans flex flex-col transition-colors duration-300">
      <AdminHeader
        title="Hardware Logs"
        subtitle="Diagnostic History"
        userName={localStorage.getItem('adminEmail')}
        showBackButton={true}
        unreadAuditCount={unreadAuditCount}
        onAuditClick={onAuditClick}
      />

      <main className="flex-grow max-w-5xl mx-auto px-6 py-10 w-full">
        <div className="bg-white dark:bg-gray-800 rounded-[40px] shadow-2xl border border-smart-light/10 dark:border-gray-700 overflow-hidden flex flex-col h-[80vh]">
          <div className="bg-smart-bg dark:bg-gray-900 px-8 py-6 border-b border-smart-light/10 flex justify-between items-center">
            <h2 className="text-xl font-black text-smart-dark dark:text-white flex items-center tracking-tighter uppercase italic">
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
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                ></path>
              </svg>
              Historical Alerts ({filteredAlerts.length})
            </h2>
            <div className="flex items-center space-x-3">
              <button
                onClick={handleExportCSV}
                className="hidden sm:flex items-center px-3 py-2 bg-smart-light/10 hover:bg-smart-light/20 text-smart-light rounded-xl text-[10px] font-bold uppercase tracking-widest transition-colors border border-smart-light/20"
                disabled={filteredAlerts.length === 0}
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
                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                  ></path>
                </svg>
                Export CSV
              </button>
              {isSuperAdmin && (
                <>
                  <button
                    onClick={() => handleClearAlerts(30)}
                    className="hidden sm:flex items-center px-3 py-2 bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-500 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-colors border border-yellow-500/20"
                    disabled={alerts.length === 0}
                  >
                    Clear &gt; 30 Days
                  </button>
                  <button
                    onClick={() => handleClearAlerts(null)}
                    className="hidden sm:flex items-center px-3 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-colors border border-red-500/20"
                    disabled={alerts.length === 0}
                  >
                    Clear All
                  </button>
                </>
              )}
              <input
                type="date"
                value={filterDate}
                onChange={(e) => {
                  setFilterDate(e.target.value);
                  setPage(1); // Reset pagination when searching a new date
                }}
                className="px-4 py-2 rounded-xl border-2 border-smart-light/20 bg-white dark:bg-gray-800 text-smart-dark dark:text-white focus:ring-2 focus:ring-smart-light/50 outline-none transition font-mono text-[10px] font-black tracking-widest cursor-pointer"
              />
              <select
                value={filterType}
                onChange={(e) => {
                  setFilterType(e.target.value);
                  setPage(1); // Reset pagination when searching a new type
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
              {(filterDate || filterType !== 'all') && (
                <button
                  onClick={() => {
                    setFilterDate('');
                    setFilterType('all');
                    setPage(1);
                  }}
                  className="px-3 py-2 bg-red-50 dark:bg-red-900/30 hover:bg-red-100 dark:hover:bg-red-900/50 text-red-600 dark:text-red-400 rounded-xl font-bold text-[10px] uppercase tracking-widest transition-colors border border-red-200 dark:border-red-800"
                >
                  Clear
                </button>
              )}
            </div>
          </div>
          <div className="flex-grow overflow-y-auto">
            {loading ? (
              <div className="flex justify-center items-center h-full">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-smart-light"></div>
              </div>
            ) : (
              <table className="w-full text-left border-collapse">
                <thead className="sticky top-0 bg-smart-bg dark:bg-gray-900 z-10">
                  <tr className="border-b border-smart-light/10 text-smart-gray dark:text-gray-500 text-[10px] font-black uppercase tracking-widest">
                    <th className="px-4 py-3 pl-8 whitespace-nowrap text-left w-1/4">
                      Date &amp; Time
                    </th>
                    <th className="px-4 py-3 whitespace-nowrap text-left w-[100px]">Type</th>
                    <th className="px-4 py-3 w-full">Alert Message</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-smart-bg dark:divide-gray-700">
                  {filteredAlerts.map((alert) => (
                    <tr
                      key={alert._id || alert.id}
                      className="hover:bg-smart-bg/50 dark:hover:bg-gray-700/50 transition-colors"
                    >
                      <td className="px-4 py-3 pl-8 whitespace-nowrap align-top">
                        <div className="text-sm font-bold text-smart-dark dark:text-gray-300">
                          {alert.timeString || alert.time}
                        </div>
                        <div className="text-xs font-bold text-smart-gray dark:text-gray-500 uppercase mt-0.5">
                          {new Date(alert.createdAt).toLocaleDateString()}
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap align-top">
                        {alert.type === 'warning' && (
                          <span className="bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-400 text-[9px] font-black px-2 py-1 rounded-md uppercase tracking-wider border border-yellow-200 dark:border-yellow-800 inline-block w-[72px] text-center">
                            Warning
                          </span>
                        )}
                        {alert.type === 'info' && (
                          <span className="bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-400 text-[9px] font-black px-2 py-1 rounded-md uppercase tracking-wider border border-blue-200 dark:border-blue-800 inline-block w-[72px] text-center">
                            Info
                          </span>
                        )}
                        {alert.type === 'action' && (
                          <span className="bg-smart-light/10 dark:bg-smart-light/20 text-smart-dark dark:text-smart-glow text-[9px] font-black px-2 py-1 rounded-md uppercase tracking-wider border border-smart-light/20 inline-block w-[72px] text-center">
                            Action
                          </span>
                        )}
                        {alert.type === 'success' && (
                          <span className="bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400 text-[9px] font-black px-2 py-1 rounded-md uppercase tracking-wider border border-green-200 dark:border-green-800 inline-block w-[72px] text-center">
                            Success
                          </span>
                        )}
                        {alert.type === 'error' && (
                          <span className="bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-400 text-[9px] font-black px-2 py-1 rounded-md uppercase tracking-wider border border-red-200 dark:border-red-800 inline-block w-[72px] text-center">
                            Error
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-smart-dark dark:text-gray-200 font-medium text-sm leading-relaxed break-words align-top">
                        {alert.message}
                      </td>
                    </tr>
                  ))}
                  {filteredAlerts.length === 0 && (
                    <tr>
                      <td
                        colSpan="3"
                        className="p-8 text-center text-smart-gray dark:text-gray-500 font-black uppercase tracking-widest text-[10px]"
                      >
                        No alerts match the selected filter.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
            {totalPages > 1 && !loading && (
              <div className="bg-smart-bg/30 dark:bg-gray-900/30 px-6 py-4 border-t border-smart-light/10 flex flex-col sm:flex-row justify-between items-center gap-4 mt-auto">
                <span className="text-[10px] font-bold text-smart-gray dark:text-gray-400 uppercase tracking-widest text-center sm:text-left w-full sm:w-1/3">
                  Showing {(page - 1) * 50 + 1} to {Math.min(page * 50, totalAlertsCount)} of{' '}
                  {totalAlertsCount}
                </span>
                <div className="flex space-x-2 items-center justify-center sm:justify-end w-full sm:w-2/3">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="px-4 py-2 bg-white dark:bg-gray-800 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors border border-smart-light/20 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-smart-light/10"
                  >
                    Prev
                  </button>
                  <span className="px-4 py-2 text-[10px] font-black uppercase tracking-widest text-smart-dark dark:text-white flex items-center">
                    Page {page} of {totalPages}
                  </span>
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page >= totalPages}
                    className="px-4 py-2 bg-white dark:bg-gray-800 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors border border-smart-light/20 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-smart-light/10"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
};

export default AdminHardwareAlerts;
