import React from 'react';
import { useNavigate } from 'react-router-dom';
import AdminHeader from '../components/AdminHeader';
import HardwareStatsWidget from '../components/HardwareStatsWidget';

const AdminTelemetry = ({ socket }) => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-smart-bg dark:bg-gray-900 transition-colors duration-500">
      <AdminHeader />
      <div className="flex flex-col lg:flex-row">
        {/* Sidebar Space Placeholder - matches AdminDashboard layout structure */}
        <aside className="hidden lg:block w-80 flex-shrink-0 border-r border-smart-light/10 p-6 min-h-[calc(100vh-80px)]" />

        <main className="flex-grow max-w-full lg:max-w-[calc(100%-20rem)] px-6 py-8 w-full">
          <div className="mb-8">
            <h1 className="text-3xl font-black text-smart-dark dark:text-white uppercase tracking-tighter mb-2 italic">
              Hardware Telemetry
            </h1>
            <p className="text-smart-gray dark:text-gray-400 font-bold uppercase tracking-widest text-[10px]">
              Dedicated Live System Health & Sensor Data
            </p>
          </div>

          <button
            onClick={() => navigate('/admin/dashboard?tab=hardware')}
            className="flex items-center gap-2 text-[12px] font-bold text-gray-400 hover:text-gray-100 uppercase tracking-wider mb-4 transition-colors cursor-pointer w-fit"
          >
            <span>←</span>
            <span>Back to Gate & Hardware</span>
          </button>

          <HardwareStatsWidget socket={socket} />

          <div className="bg-white dark:bg-gray-800 rounded-3xl p-8 border border-smart-light/20 shadow-xl">
            <h3 className="text-lg font-black text-smart-dark dark:text-white uppercase tracking-tight mb-4 italic">
              Telemetry Insights
            </h3>
            <p className="text-sm text-smart-gray dark:text-gray-400 leading-relaxed">
              This page provides a dedicated, high-frequency stream of IoT sensor data from across the park. 
              Use the statistics above to monitor the real-time health of your hardware infrastructure. 
              New alerts and state changes are pushed instantly via Socket.io.
            </p>
          </div>
        </main>
      </div>
    </div>
  );
};

export default AdminTelemetry;
