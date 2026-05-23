import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import AdminHeader from '../components/AdminHeader';
import api from '../api';
import { socket } from '../socket';

const AdminGRC = () => {
  const navigate = useNavigate();
  
  // Strict Super Admin Access Control
  const superAdminEmail = (import.meta.env.VITE_SUPER_ADMIN_EMAIL || 'admin@smartpark.com').toLowerCase();
  const currentAdminEmail = (localStorage.getItem('adminEmail') || '').toLowerCase().trim();
  const isSuperAdmin = currentAdminEmail === superAdminEmail;

  useEffect(() => {
    if (!isSuperAdmin) {
      console.warn('Unauthorized GRC Access Attempt blocked.');
      navigate('/admin/dashboard');
    }
  }, [isSuperAdmin, navigate]);

  const [activeTab, setActiveTab] = useState('Risk Assessment');
  const [selectedFramework, setSelectedFramework] = useState('CIS_V8');
  const frameworks = [
    { id: 'CIS_V8', name: 'CIS v8 Framework' },
    { id: 'NIST CSF v1.1', name: 'NIST CSF Framework' },
    { id: 'ISO/IEC 27001:2022 Annex A', name: 'ISO/IEC 27001 Annex' }
  ];
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [updating, setUpdating] = useState(false);
  const [remediating, setRemediating] = useState(null);
  const [executedRemediations, setExecutedRemediations] = useState(new Set());
  const [selectedControl, setSelectedControl] = useState(null);
  const [selectedRisk, setSelectedRisk] = useState(null); 
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [scoreFilter, setScoreFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('Open'); // Default to Open for focus
  const [currentPage, setCurrentPage] = useState(1); // Pagination State
  const itemsPerPage = 10;

  const [notification, setNotification] = useState(null);

  const showNotification = (message, type = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 4000);
  };

  const [riskRegister, setRiskRegister] = useState([]);
  const [complianceControls, setComplianceControls] = useState([]);

  const fetchGRCData = async (showLoading = true, framework = selectedFramework) => {
    try {
      if (showLoading && !data) setLoading(true);
      const token = localStorage.getItem('token');
      const res = await api.get(`/grc/summary?framework=${encodeURIComponent(framework)}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (res.data) {
        setData(res.data);
        setRiskRegister(res.data.risk_register || []);
        setComplianceControls(res.data.compliance || []);
        setError(null);
      }
    } catch (err) {
      console.error('GRC Fetch Error:', err);
      if (err.response?.status === 403) {
        // Diagnostic check for 403
        try {
          const token = localStorage.getItem('token');
          const whoami = await api.get('/grc/whoami', { headers: { Authorization: `Bearer ${token}` } });
          const { authenticatedUser, userRole, expectedSuperAdmin } = whoami.data;
          setError(`Forbidden: Exclusive access restricted. Current User: ${authenticatedUser} (${userRole}). Required: ${expectedSuperAdmin}`);
        } catch (diagErr) {
          setError('Forbidden: Exclusive Super Admin access required.');
        }
      } else {
        setError(err.response?.data?.message || err.message || 'Failed to fetch GRC data.');
      }
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  useEffect(() => {
    fetchGRCData(true, selectedFramework);
    
    // Ensure socket is connected
    if (!socket.connected) {
      socket.connect();
    }

    // Listen for live audit log updates and data refresh events to trigger immediate GRC risk re-evaluation
    const handleLiveUpdate = () => {
      console.log('Live event detected, re-evaluating risks...');
      fetchGRCData(false, selectedFramework);
    };

    socket.on('auditLogUpdate', handleLiveUpdate);
    socket.on('dataRefresh', handleLiveUpdate);

    // Keep a slower background poll as a fallback (every 15 seconds)
    const interval = setInterval(() => fetchGRCData(false, selectedFramework), 15000);
    
    return () => {
      clearInterval(interval);
      socket.off('auditLogUpdate', handleLiveUpdate);
      socket.off('dataRefresh', handleLiveUpdate);
    };
  }, [selectedFramework]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [categoryFilter, scoreFilter, statusFilter]);

  const handleStatusChange = async (controlId, newStatus) => {
    try {
      setUpdating(true);
      const token = localStorage.getItem('token');
      await api.patch(`/grc/compliance/${controlId}`, 
        { status: newStatus },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      setComplianceControls(prev => 
        prev.map(c => (c.controlId === controlId || c.control_id === controlId) ? { ...c, status: newStatus } : c)
      );
      showNotification(`Control ${controlId} status updated to ${newStatus}`);
      setSelectedControl(null); 
    } catch (err) {
      console.error('Failed to update compliance status:', err);
      showNotification('Failed to update control status.', 'error');
    } finally {
      setUpdating(false);
    }
  };

  const handleResolveRisk = async (riskId) => {
    try {
      setUpdating(true);
      const token = localStorage.getItem('token');
      await api.patch(`/grc/risks/${riskId}`, 
        { status: 'Resolved' },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      // Update local state immediately for instant UI feedback
      setRiskRegister(prev => prev.map(r => r.id === riskId ? { ...r, status: 'Resolved' } : r));
      if (selectedRisk && selectedRisk.id === riskId) {
        setSelectedRisk({ ...selectedRisk, status: 'Resolved' });
      }

      showNotification(`Risk ${riskId} marked as Resolved`);
      // Optional: keep modal open for a second so they see the change
      setTimeout(() => {
        setSelectedRisk(null);
        fetchGRCData(false);
      }, 1000);
      
    } catch (err) {
      console.error('Resolve Risk Error:', err);
      showNotification('Failed to resolve risk.', 'error');
    } finally {
      setUpdating(false);
    }
  };

  const handleRemediate = async (riskId, action, params) => {
    try {
      setRemediating(riskId);
      const token = localStorage.getItem('token');
      
      // --- INSIDER THREAT SPECIAL HANDLER ---
      if (riskId.includes('RISK-INSIDER')) {
        const offendingAdminId = selectedRisk?.offendingAdminId;
        if (offendingAdminId) {
          await api.patch(`/admin/users/${offendingAdminId}/restrict`, 
            { reason: 'Automated GRC Protocol: Critical Insider Abuse Detected' },
            { headers: { Authorization: `Bearer ${token}` } }
          );
          
          showNotification('Rogue Admin Restricted successfully.', 'success');
          
          // Mark as resolved locally and update risk status
          setExecutedRemediations(prev => new Set(prev).add(`${riskId}-${action}`));
          setRiskRegister(prev => prev.map(r => r.id === riskId ? { ...r, status: 'Resolved' } : r));
          
          if (selectedRisk && selectedRisk.id === riskId) {
            setSelectedRisk({ ...selectedRisk, status: 'Resolved' });
          }
          
          fetchGRCData(false);
          return;
        }
      }
      // --- END SPECIAL HANDLER ---

      // Execute the standard GRC remediation
      const res = await api.post('/grc/remediate', 
        { riskId, action, params },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      // Automated Account Restriction for Critical Security Violations
      const isSecurityRisk = action === 'block_user' || action === 'revoke_access' || riskId.includes('ADMIN_UNAUTHORIZED');
      const targetUserId = params?.userId || params?.adminId || params?.targetUserId;

      if (isSecurityRisk && targetUserId) {
        try {
          await api.patch(`/admin/users/${targetUserId}/restrict`, 
            { reason: `Automated GRC Protocol: Critical Security Violation Detected (${riskId})` },
            { headers: { Authorization: `Bearer ${token}` } }
          );
          console.log(`[GRC] Account ${targetUserId} restricted successfully via unified endpoint.`);
        } catch (restrictErr) {
          // Silent fail for secondary restriction if the backend remediate already handled it
          console.warn('[GRC] Secondary restriction attempt bypassed:', restrictErr.response?.data?.message || restrictErr.message);
        }
      }
      
      // Mark as executed locally
      setExecutedRemediations(prev => new Set(prev).add(`${riskId}-${action}`));
      
      showNotification(res.data.message || 'Risk Resolved & Account Restricted');
      fetchGRCData(false);
    } catch (err) {
      console.error('Remediation Error:', err);
      showNotification(err.response?.data?.message || 'Failed to execute remediation.', 'error');
    } finally {
      setRemediating(null);
    }
  };

  const getRiskScoreColor = (score) => {
    if (score >= 20) return 'text-red-500';
    if (score >= 12) return 'text-orange-500';
    if (score >= 6) return 'text-yellow-500';
    return 'text-green-500';
  };

  const getOverallScoreBadgeClass = (score) => {
    if (score >= 20) return 'bg-red-500/20 text-red-500 border-red-500/30';
    if (score >= 12) return 'bg-orange-500/20 text-orange-500 border-orange-500/30';
    if (score >= 6) return 'bg-yellow-500/20 text-yellow-500 border-yellow-500/30';
    return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
  };

  const getScorePillClass = (score) => {
    if (score >= 4) return 'bg-red-500/20 text-red-400 border-red-500/30';
    if (score === 3) return 'bg-amber-500/20 text-amber-400 border-amber-500/30';
    return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
  };

  const getStatusBadgeClass = (status) => {
    const s = (status || '').toLowerCase();
    switch (s) {
      case 'implemented': return 'bg-emerald-500';
      case 'partial': return 'bg-amber-500';
      case 'not_implemented': return 'bg-red-500';
      case 'open': return 'bg-red-500/10 text-red-500 border-red-500/20';
      case 'mitigating': return 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20';
      case 'accepted': return 'bg-blue-500/10 text-blue-500 border-blue-500/20';
      case 'resolved': return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
      default: return 'bg-slate-500';
    }
  };

  const calculateOverallCompliance = () => {
    if (!complianceControls.length) return 0;
    const implemented = complianceControls.filter(c => (c.status || c.default_status || '').toLowerCase() === 'implemented').length;
    const partial = complianceControls.filter(c => (c.status || c.default_status || '').toLowerCase() === 'partial').length;
    return Math.round(((implemented + (partial * 0.5)) / complianceControls.length) * 100);
  };

  const filteredRisks = riskRegister
    .filter(r => {
      const score = r.likelihood * r.impact;
      const matchesCategory = categoryFilter === 'All' || r.category === categoryFilter;
      const matchesStatus = statusFilter === 'All' || (r.status || '').toLowerCase() === statusFilter.toLowerCase();
      
      let matchesScore = true;
      if (scoreFilter === 'High') matchesScore = score > 15;
      else if (scoreFilter === 'Medium') matchesScore = score >= 5 && score <= 15;
      else if (scoreFilter === 'Low') matchesScore = score < 5;
      
      return matchesCategory && matchesScore && matchesStatus;
    })
    .sort((a, b) => {
      const scoreA = (a.likelihood || 0) * (a.impact || 0);
      const scoreB = (b.likelihood || 0) * (b.impact || 0);
      
      // Sort by score descending
      if (scoreB !== scoreA) {
        return scoreB - scoreA;
      }
      
      // Tie-breaker: sort by most recent detection date
      return new Date(b.createdAt || b.timestamp || 0) - new Date(a.createdAt || a.timestamp || 0);
    });

  const categories = ['All', ...new Set(riskRegister.map(r => r.category))];

  if (loading && !data) {
    return (
      <div className="min-h-screen bg-smart-bg dark:bg-[#0A0C10] flex flex-col items-center justify-center">
        <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-emerald-500 mb-6"></div>
        <p className="text-emerald-500 font-black uppercase tracking-widest animate-pulse">Engaging GRC Brain...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-smart-bg dark:bg-[#0A0C10] text-slate-200 font-sans selection:bg-smart-light/30 pb-20">
      <AdminHeader 
        title="Enterprise GRC Suite" 
        subtitle="Governance, Risk & Compliance Control Plane" 
        icon="M12 11c0 3.517-1.009 6.799-2.753 9.571m-3.44-2.04l.054-.09A13.916 13.916 0 008 11a4 4 0 118 0c0 1.017-.071 2.019-.203 3m-2.118 6.844A21.88 21.88 0 0015.171 17m3.839 1.132c.645-2.266.99-4.659.99-7.132A8 8 0 008 4.07M3 15.364c.64-1.319 1-2.8 1-4.364 0-1.457.39-2.823 1.07-4"
      />
      
      <main className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <Link 
            to="/admin/dashboard"
            className="inline-flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-semibold rounded-lg border border-slate-700 transition-colors duration-200 w-fit"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
            Back to Dashboard
          </Link>

          {error && (
            <div className="bg-red-500/10 border border-red-500/20 px-4 py-2 rounded-lg flex items-center gap-3">
              <div className="w-2 h-2 rounded-full bg-red-500 animate-ping"></div>
              <span className="text-red-500 text-[10px] font-black uppercase tracking-widest">{error}</span>
            </div>
          )}
        </div>

        {/* Framework Selector */}
        <div className="flex flex-col md:flex-row md:items-center gap-4 mb-8 bg-[#151921] p-6 rounded-2xl border border-[#2B2F3A] shadow-xl">
          <div className="flex flex-col gap-1.5">
            <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest italic">Governance Framework Control Plane</span>
            <div className="flex items-center gap-3">
              <select
                value={selectedFramework}
                onChange={(e) => setSelectedFramework(e.target.value)}
                className="bg-[#1D212A] border border-[#2B2F3A] text-slate-200 text-xs font-black uppercase tracking-widest rounded-xl px-4 py-3 outline-none focus:border-emerald-500 transition-all cursor-pointer min-w-[280px] sm:min-w-[320px] shadow-inner"
              >
                {frameworks.map(f => (
                  <option key={f.id} value={f.id}>{f.name}</option>
                ))}
              </select>
              <div className="bg-emerald-500/10 text-emerald-400 px-3 py-1.5 rounded-lg border border-emerald-500/20 text-[10px] font-black uppercase tracking-widest flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></div>
                Active
              </div>
            </div>
          </div>
          <div className="hidden lg:block h-12 w-px bg-[#2B2F3A] mx-6"></div>
          <div className="flex-1">
            <p className="text-[11px] text-slate-400 leading-relaxed max-w-2xl italic font-medium">
              Real-time evaluation of platform adherence against <span className="text-emerald-400 font-bold">{selectedFramework}</span>. 
              Status updates are persisted to the enterprise ledger. Risk detection engine is currently processing live audit logs.
            </p>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex gap-1 bg-[#151921] p-1 rounded-xl mb-8 border border-[#2B2F3A] w-fit overflow-x-auto max-w-full">
          {['Risk Assessment', 'Risk Register', 'Compliance Posture'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`whitespace-nowrap px-6 py-2.5 rounded-lg text-xs font-black uppercase tracking-widest transition-all duration-300 ${
                activeTab === tab 
                ? 'bg-emerald-500 text-black shadow-lg shadow-emerald-500/20' 
                : 'text-gray-500 hover:text-gray-300 hover:bg-[#1D212A]'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
          {activeTab === 'Risk Assessment' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Summary Cards */}
              <div className="lg:col-span-1 space-y-4">
                <div className="bg-[#151921] border border-[#2B2F3A] p-6 rounded-2xl relative overflow-hidden group">
                  <div className="absolute top-0 right-0 p-4 text-blue-400 group-hover:scale-110 transition-transform">
                    <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>
                  </div>
                  <span className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em] block mb-1">Total Active Risks</span>
                  <div className="text-4xl font-black italic text-white">{riskRegister.filter(r => (r.status || '').toLowerCase() !== 'resolved').length}</div>
                </div>

                <div className="bg-[#151921] border border-[#2B2F3A] p-6 rounded-2xl relative overflow-hidden group">
                  <div className="absolute top-0 right-0 p-4 text-red-500 group-hover:scale-110 transition-transform">
                    <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                  </div>
                  <span className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em] block mb-1">Critical Risks</span>
                  <div className="text-4xl font-black italic text-red-500">{riskRegister.filter(r => (r.likelihood * r.impact) >= 20 && (r.status || '').toLowerCase() !== 'resolved').length}</div>
                </div>

                <div className="bg-[#151921] border border-[#2B2F3A] p-6 rounded-2xl relative overflow-hidden group">
                  <div className="absolute top-0 right-0 p-4 text-emerald-500 group-hover:scale-110 transition-transform">
                    <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  </div>
                  <span className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em] block mb-1">Compliance Score</span>
                  <div className="text-4xl font-black italic text-emerald-500">{calculateOverallCompliance()}%</div>
                  <div className="mt-2 w-full bg-gray-800 h-1.5 rounded-full overflow-hidden">
                    <div className="bg-emerald-500 h-full" style={{ width: `${calculateOverallCompliance()}%` }}></div>
                  </div>
                </div>
              </div>

              {/* Heatmap */}
              <div className="lg:col-span-2 bg-[#151921] border border-[#2B2F3A] p-8 rounded-2xl">
                <div className="flex justify-between items-center mb-8">
                  <div className="flex items-center">
                    <span className="relative flex h-3 w-3 shrink-0 mr-3">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
                    </span>
                    <h3 className="text-lg font-black text-white uppercase italic tracking-tighter">Risk Heatmap (L x I)</h3>
                  </div>
                  <div className="flex gap-4 text-[10px] font-bold uppercase tracking-widest text-gray-500">
                    <span className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-green-500"></div> Low</span>
                    <span className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-yellow-500"></div> Med</span>
                    <span className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-orange-500"></div> High</span>
                    <span className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-red-500"></div> Crit</span>
                  </div>
                </div>
                
                <div className="flex items-center justify-center gap-6 max-w-md mx-auto">
                  <div className="w-8 flex items-center justify-center">
                    <div className="whitespace-nowrap -rotate-90 text-[10px] font-black uppercase tracking-[0.3em] text-gray-500">Likelihood</div>
                  </div>

                  <div className="flex-1">
                    <div className="grid grid-cols-5 grid-rows-5 gap-2 aspect-square">
                      {Array.from({ length: 25 }).map((_, i) => {
                        const row = 5 - Math.floor(i / 5); 
                        const col = (i % 5) + 1; 
                        const score = row * col;
                        const risksInCell = riskRegister.filter(r => r.likelihood === col && r.impact === row).length;
                        let bgColor = 'bg-green-500/10';
                        if (score >= 20) bgColor = 'bg-red-500/60';
                        else if (score >= 12) bgColor = 'bg-orange-500/40';
                        else if (score >= 6) bgColor = 'bg-yellow-500/20';

                        return (
                          <div key={i} title={`Score: ${score} | Risks: ${risksInCell}`} className={`${bgColor} border border-white/5 rounded-md flex items-center justify-center text-[10px] font-black transition-all hover:scale-105 hover:border-white/20 cursor-help relative`}>
                            {risksInCell > 0 ? (
                              <span className="bg-white text-black px-1.5 py-0.5 rounded-full text-[8px] animate-pulse">
                                {risksInCell}
                              </span>
                            ) : (
                              <span className="text-white/10">{score}</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    <div className="mt-8 text-center text-[10px] font-black uppercase tracking-[0.3em] text-gray-500 whitespace-nowrap">Impact</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'Risk Register' && (
            <div className="space-y-6">
              {/* Premium Enterprise Filter Bar */}
              <div className="bg-[#151921] border border-[#2B2F3A] p-6 rounded-2xl flex flex-wrap items-center gap-6 shadow-2xl relative overflow-hidden">
                {/* Decorative Accent */}
                <div className="absolute top-0 left-0 w-1 h-full bg-emerald-500/50"></div>
                
                <div className="flex flex-col gap-2 min-w-[200px]">
                  <span className="text-[9px] font-black uppercase text-gray-500 tracking-[0.2em] flex items-center gap-2">
                    <svg className="w-3 h-3 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" /></svg>
                    Risk Category
                  </span>
                  <select 
                    value={categoryFilter}
                    onChange={(e) => setCategoryFilter(e.target.value)}
                    className="bg-[#1D212A] border border-[#2B2F3A] text-slate-200 text-[11px] font-black uppercase tracking-widest rounded-xl px-4 py-3 outline-none focus:border-emerald-500 transition-all cursor-pointer shadow-inner hover:bg-[#252a35]"
                  >
                    {categories.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>

                <div className="flex flex-col gap-2 min-w-[180px]">
                  <span className="text-[9px] font-black uppercase text-gray-500 tracking-[0.2em] flex items-center gap-2">
                    <svg className="w-3 h-3 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>
                    Severity Score
                  </span>
                  <select 
                    value={scoreFilter}
                    onChange={(e) => setScoreFilter(e.target.value)}
                    className="bg-[#1D212A] border border-[#2B2F3A] text-slate-200 text-[11px] font-black uppercase tracking-widest rounded-xl px-4 py-3 outline-none focus:border-emerald-500 transition-all cursor-pointer shadow-inner hover:bg-[#252a35]"
                  >
                    <option value="All">All Severities</option>
                    <option value="High">High Criticality</option>
                    <option value="Medium">Medium Priority</option>
                    <option value="Low">Low Observation</option>
                  </select>
                </div>

                <div className="flex flex-col gap-2 min-w-[180px]">
                  <span className="text-[9px] font-black uppercase text-gray-500 tracking-[0.2em] flex items-center gap-2">
                    <svg className="w-3 h-3 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    Operational Status
                  </span>
                  <div className="flex bg-[#1D212A] border border-[#2B2F3A] rounded-xl p-1 shadow-inner">
                    {['All', 'Open', 'Resolved'].map((status) => (
                      <button
                        key={status}
                        onClick={() => setStatusFilter(status)}
                        className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
                          statusFilter === status 
                          ? 'bg-emerald-500 text-black shadow-lg' 
                          : 'text-gray-500 hover:text-gray-300'
                        }`}
                      >
                        {status}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex-1 hidden xl:flex justify-end items-end pb-1">
                  <div className="text-right">
                    <div className="text-[9px] font-black text-gray-600 uppercase tracking-[0.3em]">Filtered Posture</div>
                    <div className="text-xl font-black text-white italic">{filteredRisks.length} <span className="text-xs text-gray-500 not-italic">Risks</span></div>
                  </div>
                </div>
              </div>

              <div className="bg-[#151921] border border-[#2B2F3A] rounded-2xl overflow-hidden shadow-2xl">
                <div className="overflow-x-auto w-full">
                  <table className="w-full text-left border-collapse table-fixed">
                    <thead className="bg-[#1D212A] border-b border-[#2B2F3A]">
                      <tr className="text-[10px] font-black text-gray-400 uppercase tracking-[0.15em]">
                        <th className="px-4 py-5 w-24">Risk ID</th>
                        <th className="px-4 py-5 w-32">Category</th>
                        <th className="px-4 py-5 w-32">Detected</th>
                        <th className="px-4 py-5 w-1/3">Description</th>
                        <th className="px-4 py-5 w-24 text-center">Score</th>
                        <th className="px-4 py-5 w-24 text-right">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#2B2F3A]">
                      {filteredRisks.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage).map((risk) => {
                        const calculatedScore = risk.likelihood * risk.impact;
                        return (
                          <tr 
                            key={risk.id}
                            onClick={() => setSelectedRisk(risk)}
                            className={`transition-colors cursor-pointer group ${selectedRisk?.id === risk.id ? 'bg-emerald-500/10' : 'hover:bg-[#1D212A]/30'}`}
                          >
                            <td className="px-4 py-6 font-mono text-sm font-medium text-emerald-400 truncate pr-4">{risk.id}</td>
                            <td className="px-4 py-6 text-sm truncate pr-4">
                              <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded bg-gray-800 text-slate-300 border border-white/5">{risk.category}</span>
                            </td>
                            <td className="px-4 py-6 text-[10px] font-bold text-slate-400 truncate pr-4">
                              {risk.createdAt || risk.timestamp ? new Date(risk.createdAt || risk.timestamp).toLocaleString() : 'Recent Scan'}
                            </td>
                            <td className="px-4 py-6 text-sm truncate text-slate-200 font-medium pr-4 max-w-0" title={risk.description}>
                              {risk.description}
                            </td>
                            <td className="px-4 py-6 text-center truncate">
                              <span className={`px-4 py-1.5 rounded-full text-[11px] font-black border shadow-lg ${getOverallScoreBadgeClass(calculatedScore)}`}>
                                {calculatedScore}
                              </span>
                            </td>
                            <td className="px-4 py-6 text-right truncate">
                              <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase border shadow-sm ${getStatusBadgeClass(risk.status)} text-white`}>
                                {risk.status}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Pagination UI */}
                {filteredRisks.length > itemsPerPage && (
                  <div className="px-6 py-4 bg-[#1D212A] border-t border-[#2B2F3A] flex items-center justify-between">
                    <div className="text-[10px] font-black text-gray-500 uppercase tracking-widest text-ellipsis overflow-hidden whitespace-nowrap pr-4">
                      Showing {(currentPage - 1) * itemsPerPage + 1} to {Math.min(currentPage * itemsPerPage, filteredRisks.length)} of {filteredRisks.length} Risks
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <button 
                        disabled={currentPage === 1}
                        onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                        className="px-4 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed text-white text-[10px] font-black uppercase tracking-widest rounded-lg border border-slate-700 transition-all shadow-lg"
                      >
                        Previous
                      </button>
                      <button 
                        disabled={currentPage * itemsPerPage >= filteredRisks.length}
                        onClick={() => setCurrentPage(prev => prev + 1)}
                        className="px-4 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed text-white text-[10px] font-black uppercase tracking-widest rounded-lg border border-slate-700 transition-all shadow-lg"
                      >
                        Next
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'Compliance Posture' && (
            <div className="space-y-6">
              {/* Adherence Overview */}
              <div className="bg-[#151921] border border-[#2B2F3A] p-8 rounded-2xl shadow-xl">
                <div className="flex justify-between items-end mb-4">
                  <div>
                    <h3 className="text-xl font-black text-white uppercase italic tracking-tighter">Framework Adherence</h3>
                    <p className="text-xs text-gray-500 font-bold uppercase tracking-widest mt-1">
                      {frameworks.find(f => f.id === selectedFramework)?.name || selectedFramework} | {
                        complianceControls.filter((v, i, a) => {
                          const getNormId = (c) => (c.controlId || c.control_id || c.id || "").toString().replace(/^CIS-/, "");
                          return a.findIndex(t => getNormId(t) === getNormId(v)) === i;
                        }).length
                      } Controls
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="text-4xl font-black text-emerald-500 italic">{calculateOverallCompliance()}%</span>
                  </div>
                </div>
                <div className="w-full bg-[#1D212A] h-4 rounded-full border border-[#2B2F3A] p-1">
                  <div 
                    className="bg-gradient-to-r from-emerald-500 to-cyan-500 h-full rounded-full transition-all duration-1000 shadow-[0_0_15px_rgba(16,185,129,0.3)]"
                    style={{ width: `${calculateOverallCompliance()}%` }}
                  ></div>
                </div>
              </div>

              {/* Responsive Grid of Tiles */}
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                {complianceControls
                  .filter((v, i, a) => {
                    const getNormId = (c) => (c.controlId || c.control_id || c.id || "").toString().replace(/^CIS-/, "");
                    return a.findIndex(t => getNormId(t) === getNormId(v)) === i;
                  })
                  .map((ctrl) => (
                  <div 
                    key={ctrl.controlId || ctrl.control_id || ctrl.id}
                    onClick={() => setSelectedControl(ctrl)}
                    className="relative flex flex-col items-center justify-center p-6 bg-slate-800/50 border border-slate-700 rounded-2xl hover:bg-slate-700 cursor-pointer transition-all aspect-square text-center group shadow-lg hover:shadow-emerald-900/20"
                  >
                    <div className={`absolute top-4 right-4 w-3 h-3 rounded-full border-2 border-[#151921] ${getStatusBadgeClass(ctrl.status || ctrl.default_status)}`}></div>
                    <span className="text-xl md:text-2xl font-black text-white group-hover:text-emerald-400 transition-colors">
                      {(ctrl.controlId || ctrl.control_id || ctrl.id || "").toString().replace(/^CIS-/, "")}
                    </span>
                    <p className="text-[10px] md:text-xs text-slate-400 mt-2 line-clamp-2 uppercase font-bold tracking-tighter">
                      {ctrl.title || ctrl.name}
                    </p>
                    <span className="mt-2 text-[8px] font-black text-slate-500 uppercase tracking-widest">{ctrl.category}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Edit Compliance Control Modal */}
        {selectedControl && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-300">
            <div className="bg-[#151921] border border-[#2B2F3A] w-full max-w-xl rounded-[30px] overflow-hidden shadow-2xl animate-in zoom-in-95 duration-300">
              <div className="px-8 py-6 border-b border-[#2B2F3A] flex justify-between items-center bg-[#1D212A]">
                <div>
                  <h3 className="text-xl font-black text-white uppercase italic tracking-tighter">
                    {selectedControl.controlId || selectedControl.id}: {selectedControl.title || selectedControl.name}
                  </h3>
                  <span className="text-[10px] font-black text-emerald-500 uppercase tracking-widest">{selectedControl.category}</span>
                </div>
                <button onClick={() => setSelectedControl(null)} className="text-slate-500 hover:text-white transition-colors bg-white/5 p-2 rounded-xl">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>

              <div className="p-8 space-y-6">
                <div>
                  <h5 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 italic">Control Requirement</h5>
                  <p className="text-sm text-slate-300 leading-relaxed">{selectedControl.description}</p>
                </div>

                <div>
                  <h5 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 italic">Compliance Evidence</h5>
                  <div className="bg-slate-900 p-4 rounded-xl border border-slate-700 text-xs text-emerald-400 font-mono italic">
                    {selectedControl.evidence || selectedControl.default_evidence}
                  </div>
                </div>

                <div className="pt-4">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 block italic">Management Action: Update Status</label>
                  <select 
                    defaultValue={(selectedControl.status || selectedControl.default_status || 'not_implemented')}
                    id="status-update-select"
                    className="w-full bg-slate-900 border border-slate-700 text-slate-200 rounded-xl px-4 py-3 text-xs font-black uppercase tracking-widest outline-none focus:border-emerald-500 transition-all cursor-pointer"
                  >
                    <option value="implemented">Implemented</option>
                    <option value="partial">Partial</option>
                    <option value="not_implemented">Not Implemented</option>
                  </select>
                </div>
              </div>

              <div className="px-8 py-6 bg-[#1D212A] border-t border-[#2B2F3A] flex gap-3">
                <button 
                  onClick={() => handleStatusChange(selectedControl.control_id || selectedControl.id, document.getElementById('status-update-select').value)}
                  disabled={updating}
                  className="flex-1 py-3 bg-emerald-500 hover:bg-emerald-600 text-black font-black uppercase text-xs rounded-xl transition-all shadow-lg shadow-emerald-500/10 disabled:opacity-50"
                >
                  {updating ? 'Saving...' : 'Save Changes'}
                </button>
                <button 
                  onClick={() => setSelectedControl(null)}
                  className="px-6 py-3 bg-slate-800 hover:bg-slate-700 text-white font-black uppercase text-xs rounded-xl transition-all border border-slate-700"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Risk Details Modal */}
        {selectedRisk && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-300">
            <div className="bg-[#151921] border border-[#2B2F3A] w-full max-w-2xl rounded-[30px] overflow-hidden shadow-2xl animate-in zoom-in-95 duration-300">
              <div className="px-8 py-6 border-b border-[#2B2F3A] flex justify-between items-center bg-[#1D212A]">
                <div>
                  <h3 className="text-xl font-black text-white uppercase italic tracking-tighter">
                    {selectedRisk.id} - {selectedRisk.category}
                  </h3>
                  <span className="text-[10px] font-black text-emerald-500 uppercase tracking-widest flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${getStatusBadgeClass(selectedRisk.status)}`}></div>
                    Current Status: {selectedRisk.status}
                  </span>
                </div>
                <button onClick={() => setSelectedRisk(null)} className="text-slate-500 hover:text-white transition-colors bg-white/5 p-1.5 rounded-lg">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>

              <div className="p-8 space-y-8 max-h-[70vh] overflow-y-auto custom-scrollbar">
                {/* Full Description */}
                <div>
                  <h5 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3 italic">Full Risk Description</h5>
                  <p className="text-base text-slate-200 leading-relaxed font-medium bg-slate-900/50 p-6 rounded-2xl border border-slate-700/50 shadow-inner">
                    {selectedRisk.description}
                  </p>
                </div>

                {/* Risk Metadata */}
                <div className="grid grid-cols-2 gap-4">
                  <div className={`p-4 rounded-2xl border flex flex-col items-center justify-center ${getScorePillClass(selectedRisk.likelihood)}`}>
                    <span className="text-[8px] font-black uppercase mb-1 tracking-widest opacity-60">Likelihood</span>
                    <span className="text-2xl font-black italic">{selectedRisk.likelihood}/5</span>
                  </div>
                  <div className={`p-4 rounded-2xl border flex flex-col items-center justify-center ${getScorePillClass(selectedRisk.impact)}`}>
                    <span className="text-[8px] font-black uppercase mb-1 tracking-widest opacity-60">Impact</span>
                    <span className="text-2xl font-black italic">{selectedRisk.impact}/5</span>
                  </div>
                </div>

                {/* Remediation Playbook */}
                <div>
                  <h4 className="text-[10px] font-black text-emerald-400 uppercase tracking-widest mb-4 flex items-center gap-2 italic">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></div>
                    Remediation Playbook
                  </h4>
                  <div className="grid grid-cols-1 gap-4">
                    {selectedRisk.recommendations?.map((rec, idx) => (
                      <div key={idx} className="bg-slate-800/40 border border-slate-700/50 p-5 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-6 group/rec transition-all hover:bg-slate-800/60">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-1">
                            <h5 className="text-sm font-bold text-white">{rec.title}</h5>
                            <span className={`text-[8px] font-black uppercase px-2 py-0.5 rounded border whitespace-nowrap ${
                              rec.priority === 'critical' ? 'bg-red-500/10 text-red-500 border-red-500/20' :
                              rec.priority === 'high' ? 'bg-orange-500/10 text-orange-500 border-orange-500/20' :
                              'bg-blue-500/10 text-blue-500 border-blue-500/20'
                            }`}>{rec.priority}</span>
                          </div>
                          <p className="text-xs text-slate-400 leading-relaxed">{rec.body}</p>
                        </div>
                        
                        {rec.action && (
                          <button 
                            onClick={(e) => { e.stopPropagation(); handleRemediate(selectedRisk.id, rec.action, rec.params); }}
                            disabled={remediating === selectedRisk.id || executedRemediations.has(`${selectedRisk.id}-${rec.action}`)}
                            className={`whitespace-nowrap px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border ${
                              executedRemediations.has(`${selectedRisk.id}-${rec.action}`)
                              ? 'bg-emerald-500 text-black border-emerald-500'
                              : 'bg-emerald-500/10 hover:bg-emerald-500 text-emerald-400 hover:text-black border-emerald-500/20'
                            }`}
                          >
                            {executedRemediations.has(`${selectedRisk.id}-${rec.action}`) ? '✓ Action Executed' : 'Execute Resolve'}
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Risk Resolution Footer */}
              <div className="px-8 py-6 bg-[#1D212A] border-t border-[#2B2F3A]">
                <button 
                  onClick={() => handleResolveRisk(selectedRisk.id)}
                  disabled={updating || selectedRisk.status === 'Resolved'}
                  className={`w-full py-4 rounded-2xl font-black uppercase tracking-[0.2em] text-xs transition-all shadow-lg ${
                    selectedRisk.status === 'Resolved'
                    ? 'bg-emerald-500/20 text-emerald-400 cursor-not-allowed border border-emerald-500/30'
                    : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-500/20 active:scale-[0.98]'
                  }`}
                >
                  {selectedRisk.status === 'Resolved' ? '✓ Risk Marked as Resolved' : 'Mark as Resolved'}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Premium Dark Enterprise Toast Notification */}
      {notification && (
        <div className="fixed bottom-8 right-8 z-[200] animate-in slide-in-from-right-10 fade-in duration-300 pointer-events-none">
          <div className={`flex items-center gap-4 px-6 py-4 rounded-xl border-l-4 shadow-2xl shadow-black/50 backdrop-blur-xl bg-slate-800 border-slate-700 pointer-events-auto min-w-[320px] ${
            notification.type === 'error' 
              ? 'border-l-red-500' 
              : 'border-l-emerald-500'
          }`}>
            <div className="flex-1 flex items-center gap-4">
              <div className={`w-2.5 h-2.5 rounded-full animate-pulse shadow-[0_0_10px_rgba(0,0,0,0.5)] ${
                notification.type === 'error' ? 'bg-red-500 shadow-red-500/50' : 'bg-emerald-500 shadow-emerald-500/50'
              }`}></div>
              <div className="flex flex-col">
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 mb-0.5">
                  System Intelligence
                </span>
                <span className="text-sm font-bold text-slate-200 leading-tight">
                  {notification.message}
                </span>
              </div>
            </div>
            <button 
              onClick={() => setNotification(null)}
              className="p-1 hover:bg-slate-700 rounded-md text-slate-500 hover:text-white transition-all ml-4"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminGRC;
