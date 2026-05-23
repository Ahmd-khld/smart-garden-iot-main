import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import AdminHeader from '../components/AdminHeader';
import api from '../api';

const AdminGRC = () => {
  const [activeTab, setActiveTab] = useState('Risk Assessment');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [expandedRiskId, setExpandedRiskId] = useState(null);
  const [expandedControlId, setExpandedControlId] = useState(null);
  const navigate = useNavigate();

  // Primary state for risks and compliance, initialized from API
  const [riskRegister, setRiskRegister] = useState([]);
  const [complianceControls, setComplianceControls] = useState([]);

  useEffect(() => {
    const fetchGRCData = async () => {
      try {
        const token = localStorage.getItem('token');
        const res = await api.get('/grc/summary', {
          headers: { Authorization: `Bearer ${token}` }
        });
        
        setData(res.data);
        if (res.data.risk_register) setRiskRegister(res.data.risk_register);
        if (res.data.compliance) setComplianceControls(res.data.compliance);
        
      } catch (err) {
        console.error('GRC Fetch Error:', err);
      } finally {
        setLoading(false);
      }
    };

    // Initial fetch
    fetchGRCData();

    // Set up 5s polling interval
    const interval = setInterval(fetchGRCData, 5000);

    // Cleanup interval on unmount
    return () => clearInterval(interval);
  }, []);

  const handleStatusChange = async (controlId, newStatus) => {
    try {
      setUpdating(true);
      const token = localStorage.getItem('token');
      await api.patch(`/grc/compliance/${controlId}`, 
        { status: newStatus },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      // Update local state on success
      setComplianceControls(prev => 
        prev.map(c => c.id === controlId ? { ...c, status: newStatus } : c)
      );
    } catch (err) {
      console.error('Failed to update compliance status:', err);
      alert('Failed to update control status. Please try again.');
    } finally {
      setUpdating(false);
    }
  };

  const getRiskScoreColor = (score) => {
    if (score >= 20) return 'text-red-500';
    if (score >= 12) return 'text-orange-500';
    if (score >= 6) return 'text-yellow-500';
    return 'text-green-500';
  };

  const getStatusBadgeClass = (status) => {
    switch (status) {
      case 'Open': return 'bg-red-500/10 text-red-500 border-red-500/20';
      case 'Mitigating': return 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20';
      case 'Accepted': return 'bg-blue-500/10 text-blue-500 border-blue-500/20';
      case 'Implemented': return 'bg-green-500/10 text-green-500 border-green-500/20';
      case 'Partial': return 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20';
      case 'Not Implemented': return 'bg-red-500/10 text-red-500 border-red-500/20';
      default: return 'bg-gray-500/10 text-gray-500 border-gray-500/20';
    }
  };

  const calculateOverallCompliance = () => {
    if (!complianceControls.length) return 0;
    const total = complianceControls.length;
    const implemented = complianceControls.filter(c => c.status === 'Implemented').length;
    const partial = complianceControls.filter(c => c.status === 'Partial').length;
    return Math.round(((implemented + (partial * 0.5)) / total) * 100);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-smart-bg dark:bg-gray-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-smart-light"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-smart-bg dark:bg-[#0A0C10] text-gray-300 font-sans selection:bg-smart-light/30">
      <AdminHeader 
        title="Enterprise GRC Suite" 
        subtitle="Governance, Risk & Compliance Control Plane" 
        icon="M12 11c0 3.517-1.009 6.799-2.753 9.571m-3.44-2.04l.054-.09A13.916 13.916 0 008 11a4 4 0 118 0c0 1.017-.071 2.019-.203 3m-2.118 6.844A21.88 21.88 0 0015.171 17m3.839 1.132c.645-2.266.99-4.659.99-7.132A8 8 0 008 4.07M3 15.364c.64-1.319 1-2.8 1-4.364 0-1.457.39-2.823 1.07-4"
      />
      
      <main className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex justify-start">
          <Link 
            to="/admin/dashboard"
            className="inline-flex items-center gap-2 px-4 py-2 mb-6 bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-semibold rounded-lg border border-slate-700 transition-colors duration-200"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Back to Dashboard
          </Link>
        </div>
        {/* Tab Navigation */}
        <div className="flex gap-1 bg-[#151921] p-1 rounded-xl mb-8 border border-[#2B2F3A] w-fit">
          {['Risk Assessment', 'Risk Register', 'Compliance Posture'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-6 py-2.5 rounded-lg text-xs font-black uppercase tracking-widest transition-all duration-300 ${
                activeTab === tab 
                ? 'bg-smart-light text-black shadow-lg shadow-smart-light/20' 
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
                  <div className="text-4xl font-black italic text-white">{riskRegister.length}</div>
                  <div className="mt-2 text-[10px] text-gray-400 font-bold uppercase tracking-tighter">Across {new Set(riskRegister.map(r => r.category)).size} Categories</div>
                </div>

                <div className="bg-[#151921] border border-[#2B2F3A] p-6 rounded-2xl relative overflow-hidden group">
                  <div className="absolute top-0 right-0 p-4 text-red-500 group-hover:scale-110 transition-transform">
                    <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                  </div>
                  <span className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em] block mb-1">Critical Risks</span>
                  <div className="text-4xl font-black italic text-red-500">{riskRegister.filter(r => r.likelihood * r.impact >= 20).length}</div>
                  <div className="mt-2 text-[10px] text-gray-400 font-bold uppercase tracking-tighter">Immediate Action Required</div>
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
                  <div className="flex gap-4 text-[10px] font-bold uppercase tracking-widest">
                    <span className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-green-500"></div> Low</span>
                    <span className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-yellow-500"></div> Med</span>
                    <span className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-orange-500"></div> High</span>
                    <span className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-red-500"></div> Crit</span>
                  </div>
                </div>
                
                <div className="flex items-center justify-center gap-6 max-w-md mx-auto">
                  {/* Y-Axis Label Container */}
                  <div className="w-8 flex items-center justify-center">
                    <div className="whitespace-nowrap -rotate-90 text-[10px] font-black uppercase tracking-[0.3em] text-gray-500">Likelihood</div>
                  </div>

                  <div className="flex-1">
                    <div className="grid grid-cols-5 grid-rows-5 gap-2 aspect-square">
                      {/* Heatmap Grid Cells */}
                      {Array.from({ length: 25 }).map((_, i) => {
                        const row = 5 - Math.floor(i / 5); // Impact (5 down to 1)
                        const col = (i % 5) + 1; // Likelihood (1 to 5)
                        const score = row * col;
                        
                        const risksInCell = riskRegister.filter(r => r.likelihood === col && r.impact === row).length;

                        let bgColor = 'bg-green-500/10';
                        if (score >= 20) bgColor = 'bg-red-500/60';
                        else if (score >= 12) bgColor = 'bg-orange-500/40';
                        else if (score >= 6) bgColor = 'bg-yellow-500/20';

                        return (
                          <div key={i} title={`Score: ${score} | Risks: ${risksInCell}`} className={`${bgColor} border border-white/5 rounded-md flex items-center justify-center text-[10px] font-black transition-all hover:scale-105 hover:border-white/20 cursor-help group relative`}>
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
                    {/* X-Axis Label - Moved into flow to prevent leakage */}
                    <div className="mt-8 text-center text-[10px] font-black uppercase tracking-[0.3em] text-gray-500 whitespace-nowrap">Impact</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'Risk Register' && (
            <div className="bg-[#151921] border border-[#2B2F3A] rounded-2xl overflow-hidden shadow-2xl">
              <div className="px-8 py-6 border-b border-[#2B2F3A] flex justify-between items-center bg-[#1D212A]/50">
                <h3 className="text-lg font-black text-white uppercase italic tracking-tighter">Active Risk Register</h3>
                <button className="px-4 py-2 bg-smart-light/10 text-smart-light border border-smart-light/20 rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-smart-light hover:text-black transition-all">
                  Export CSV
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead className="bg-[#1D212A] border-b border-[#2B2F3A]">
                    <tr className="text-[10px] font-black text-gray-400 uppercase tracking-[0.15em]">
                      <th className="px-8 py-5">Risk ID</th>
                      <th className="px-8 py-5">Category</th>
                      <th className="px-8 py-5">Description</th>
                      <th className="px-8 py-5">Asset</th>
                      <th className="px-8 py-5 text-center">Score</th>
                      <th className="px-8 py-5 text-right">Status</th>
                      <th className="px-4 py-5 w-10"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#2B2F3A]">
                    {riskRegister.map((risk) => (
                      <React.Fragment key={risk.id}>
                        <tr 
                          onClick={() => setExpandedRiskId(expandedRiskId === risk.id ? null : risk.id)}
                          className={`hover:bg-[#1D212A]/30 transition-colors group cursor-pointer ${expandedRiskId === risk.id ? 'bg-[#1D212A]/50' : ''}`}
                        >
                          <td className="px-8 py-5 font-mono text-[11px] text-smart-light font-bold">{risk.id}</td>
                          <td className="px-8 py-5">
                            <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded bg-gray-800 text-gray-400">{risk.category}</span>
                          </td>
                          <td className="px-8 py-5 text-sm text-gray-300 font-medium max-w-md truncate">{risk.description}</td>
                          <td className="px-8 py-5 text-[11px] font-bold text-gray-500 uppercase">{risk.asset}</td>
                          <td className={`px-8 py-5 text-center font-black italic ${getRiskScoreColor(risk.likelihood * risk.impact)}`}>
                            {risk.likelihood * risk.impact}
                          </td>
                          <td className="px-8 py-5 text-right">
                            <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase border shadow-sm ${getStatusBadgeClass(risk.status)}`}>
                              {risk.status}
                            </span>
                          </td>
                          <td className="px-4 py-5 text-center">
                            <svg className={`w-4 h-4 text-gray-500 transition-transform ${expandedRiskId === risk.id ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                            </svg>
                          </td>
                        </tr>
                        {expandedRiskId === risk.id && (
                          <tr className="bg-[#1D212A]/20">
                            <td colSpan="7" className="px-8 py-6">
                              <div className="animate-in slide-in-from-top-2 duration-300">
                                <h4 className="text-[10px] font-black text-smart-light uppercase tracking-widest mb-4 flex items-center gap-2">
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
                                  Remediation Playbook
                                </h4>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                  {risk.recommendations?.map((rec, idx) => (
                                    <div key={idx} className="bg-[#0A0C10] border border-[#2B2F3A] p-4 rounded-xl">
                                      <div className="flex justify-between items-start mb-2">
                                        <h5 className="text-sm font-bold text-white">{rec.title}</h5>
                                        <span className={`text-[8px] font-black uppercase px-2 py-0.5 rounded border ${
                                          rec.priority === 'critical' ? 'bg-red-500/10 text-red-500 border-red-500/20' :
                                          rec.priority === 'high' ? 'bg-orange-500/10 text-orange-500 border-orange-500/20' :
                                          'bg-blue-500/10 text-blue-500 border-blue-500/20'
                                        }`}>
                                          {rec.priority}
                                        </span>
                                      </div>
                                      <p className="text-xs text-gray-500 leading-relaxed">{rec.body}</p>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'Compliance Posture' && (
            <div className="space-y-6">
              {/* Overall Progress */}
              <div className="bg-[#151921] border border-[#2B2F3A] p-8 rounded-2xl shadow-xl">
                <div className="flex justify-between items-end mb-4">
                  <div>
                    <h3 className="text-xl font-black text-white uppercase italic tracking-tighter">Framework Adherence</h3>
                    <p className="text-xs text-gray-500 font-bold uppercase tracking-widest mt-1">Managed Controls | {complianceControls.length} Active</p>
                  </div>
                  <div className="text-right">
                    <span className="text-4xl font-black text-smart-light italic">{calculateOverallCompliance()}%</span>
                  </div>
                </div>
                <div className="w-full bg-[#1D212A] h-4 rounded-full border border-[#2B2F3A] p-1">
                  <div 
                    className="bg-gradient-to-r from-smart-light to-cyan-500 h-full rounded-full transition-all duration-1000 shadow-[0_0_15px_rgba(0,255,255,0.3)]"
                    style={{ width: `${calculateOverallCompliance()}%` }}
                  ></div>
                </div>
              </div>

              {/* Controls List */}
              <div className="grid grid-cols-1 gap-4">
                {complianceControls.map((ctrl) => (
                  <div key={ctrl.id} className="flex flex-col">
                    <div 
                      onClick={() => setExpandedControlId(expandedControlId === ctrl.id ? null : ctrl.id)}
                      className={`bg-[#151921] border border-[#2B2F3A] p-5 rounded-xl flex items-center justify-between group hover:border-smart-light/30 transition-all cursor-pointer ${expandedControlId === ctrl.id ? 'border-smart-light/20 bg-[#1D212A]/50' : ''}`}
                    >
                      <div className="flex items-center gap-6">
                        <div className="w-16 font-mono text-xs font-black text-smart-light bg-smart-light/5 border border-smart-light/10 py-2 rounded text-center">
                          {ctrl.id}
                        </div>
                        <div>
                          <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest block mb-1">{ctrl.category}</span>
                          <h4 className="text-sm font-bold text-gray-200">{ctrl.name || ctrl.title}</h4>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-4">
                        <select 
                          value={ctrl.status}
                          disabled={updating}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => handleStatusChange(ctrl.id, e.target.value)}
                          className={`bg-[#1D212A] border border-[#2B2F3A] rounded-lg px-4 py-2 text-[10px] font-black uppercase tracking-widest outline-none focus:border-smart-light transition-all cursor-pointer ${getStatusBadgeClass(ctrl.status)} ${updating ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                          <option value="Implemented">Implemented</option>
                          <option value="Partial">Partial</option>
                          <option value="Not Implemented">Not Implemented</option>
                        </select>
                        <svg className={`w-4 h-4 text-gray-600 transition-transform ${expandedControlId === ctrl.id ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>
                    </div>
                    {expandedControlId === ctrl.id && (
                      <div className="bg-[#1D212A]/10 border-x border-b border-[#2B2F3A] p-6 rounded-b-xl -mt-2 mx-1 animate-in slide-in-from-top-2 duration-300">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                          <div>
                            <h5 className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2">Control Requirement</h5>
                            <p className="text-sm text-gray-300 leading-relaxed">{ctrl.description || 'This control requires formal documentation of security procedures and regular auditing of access logs to ensure compliance with enterprise standards.'}</p>
                          </div>
                          <div>
                            <h5 className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2">Evidence Required</h5>
                            <div className="bg-[#0A0C10] p-4 rounded-lg border border-[#2B2F3A] text-xs text-smart-light font-mono italic">
                              {ctrl.evidence || 'No evidence recorded yet. Attach logs or policy documents to satisfy this control.'}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default AdminGRC;
