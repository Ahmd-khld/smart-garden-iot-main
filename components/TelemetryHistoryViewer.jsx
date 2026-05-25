import React, { useState, useEffect } from 'react';
import api from '../api';

const TelemetryHistoryViewer = () => {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [limit, setLimit] = useState(50);

  const fetchHistory = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const res = await api.get(`/hardware/history?limit=${limit}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setHistory(res.data);
    } catch (err) {
      console.error('Failed to fetch telemetry history:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, [limit]);

  return (
    <div className="bg-[#15171E] p-6 w-full font-sans text-gray-300 rounded-3xl border border-[#2B2F3A] mb-8 overflow-hidden shadow-2xl">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-lg font-black text-gray-100 uppercase italic tracking-tighter flex items-center gap-3">
          <svg className="w-6 h-6 text-smart-light" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Telemetry Data Logs
        </h2>
        <div className="flex items-center gap-4">
          <select 
            value={limit} 
            onChange={(e) => setLimit(e.target.value)}
            className="bg-[#1D212A] border border-[#2B2F3A] text-xs font-bold text-gray-300 px-3 py-1.5 rounded-lg outline-none focus:border-smart-light transition-colors"
          >
            <option value={20}>Last 20</option>
            <option value={50}>Last 50</option>
            <option value={100}>Last 100</option>
          </select>
          <button 
            onClick={fetchHistory}
            className="p-2 hover:bg-[#2B2F3A] rounded-full transition-colors text-smart-light"
            title="Refresh History"
          >
            <svg className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>
      </div>

      <div className="overflow-x-auto custom-scrollbar">
        <table className="w-full text-left border-collapse min-w-[800px]">
          <thead className="bg-[#1D212A] border-y border-[#2B2F3A] text-[10px] font-black text-gray-400 uppercase tracking-widest">
            <tr>
              <th className="px-4 py-4">Timestamp</th>
              <th className="px-4 py-4">Moisture</th>
              <th className="px-4 py-4">Temp/Hum</th>
              <th className="px-4 py-4">RGB Dist</th>
              <th className="px-4 py-4">Servo Dist</th>
              <th className="px-4 py-4">Status</th>
              <th className="px-4 py-4 text-right">IP Address</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#2B2F3A] font-mono text-[11px]">
            {loading && history.length === 0 ? (
              <tr>
                <td colSpan="7" className="py-20 text-center">
                  <div className="flex flex-col items-center gap-4">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-smart-light"></div>
                    <span className="text-gray-500 font-black uppercase tracking-widest">Retrieving Historical Packets...</span>
                  </div>
                </td>
              </tr>
            ) : history.map((log, idx) => (
              <tr key={log._id || idx} className="hover:bg-[#1D212A]/50 transition-colors group">
                <td className="px-4 py-4 whitespace-nowrap text-gray-400 group-hover:text-gray-200 transition-colors">
                  {new Date(log.timestamp).toLocaleString()}
                </td>
                <td className="px-4 py-4">
                  <span className={`font-black ${log.moisture > 800 ? 'text-red-500' : log.moisture > 500 ? 'text-amber-500' : 'text-green-500'}`}>
                    {log.moisture}
                  </span>
                </td>
                <td className="px-4 py-4">
                  <span className="text-blue-400 font-bold">{log.temperature}°C</span>
                  <span className="mx-2 text-gray-600">/</span>
                  <span className="text-cyan-400 font-bold">{log.humidity}%</span>
                </td>
                <td className="px-4 py-4">
                  <span className="bg-[#1D212A] px-2 py-1 rounded border border-[#2B2F3A] text-gray-300">
                    {log.rgbDistance} cm
                  </span>
                </td>
                <td className="px-4 py-4">
                  <span className="bg-[#1D212A] px-2 py-1 rounded border border-[#2B2F3A] text-gray-300">
                    {log.servoDistance} cm
                  </span>
                </td>
                <td className="px-4 py-4">
                  <div className="flex gap-2">
                    <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase ${log.pumpStatus === 'ON' ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' : 'bg-gray-800 text-gray-500 border border-gray-700'}`}>PUMP:{log.pumpStatus}</span>
                    <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase ${log.servoStatus === 'OPEN' ? 'bg-green-500/20 text-green-400 border border-green-500/30' : 'bg-gray-800 text-gray-500 border border-gray-700'}`}>GATE:{log.servoStatus}</span>
                  </div>
                </td>
                <td className="px-4 py-4 text-right text-gray-500 text-[10px]">
                  {log.ipAddress}
                </td>
              </tr>
            ))}
            {history.length === 0 && !loading && (
              <tr>
                <td colSpan="7" className="py-20 text-center text-gray-500 font-black uppercase tracking-widest">
                  No historical telemetry found in database.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default TelemetryHistoryViewer;
