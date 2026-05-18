import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { socket } from '../socket';
import api from '../api';
import AdminHeader from '../components/AdminHeader';
import { useUI } from '../context/UIContext';

const AdminUserTickets = () => {
  const { userId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { showModal } = useUI();
  const [tickets, setTickets] = useState([]);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');

  const fetchTickets = useCallback(async () => {
    if (!userId) return;
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const url = `/admin/users/${userId}/tickets`;
      console.log(`[Frontend] Fetching: ${url}`);
      const response = await api.get(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      console.log(`[Frontend] Received:`, response.data);
      setTickets(response.data.tickets || []);
      setUser(response.data.user);
    } catch (error) {
      console.error('Failed to fetch tickets:', error);
      if (error.response?.status === 403) {
        showModal(
          'Access Denied: You do not have permission to view this user.',
          'Permission Error',
          'error'
        );
        navigate('/admin/dashboard');
      }
    } finally {
      setLoading(false);
    }
  }, [userId, navigate]);

  useEffect(() => {
    fetchTickets();

    // 1. Authenticate Socket & Join User Room
    const token = localStorage.getItem('token');
    if (token) {
      socket.auth = { token };
      if (!socket.connected) {
        socket.connect();
      }
      socket.emit('joinUserRoom', userId);
    }

    // 2. Real-Time Socket Listener
    const onTicketStatusChanged = (data) => {
      console.log('⚡ Real-time update: Ticket status changed:', data);
      setTickets((prev) =>
        prev.map((t) =>
          t._id === data.ticketId
            ? { ...t, status: data.status, updatedAt: data.updatedAt, ...data.ticket }
            : t
        )
      );
    };

    socket.on('ticketStatusChanged', onTicketStatusChanged);

    // Keep legacy listener for backward compatibility if needed
    const onTicketScanned = (data) => {
      console.log('⚡ Real-time legacy update: Ticket scanned:', data);
      setTickets((prev) =>
        prev.map((t) => (t._id === data.ticketId ? { ...t, status: data.status, updatedAt: data.updatedAt } : t))
      );
    };

    socket.on('ticketScanned', onTicketScanned);

    const onNewTickets = (data) => {
      console.log('⚡ Real-time update: New tickets purchased:', data);
      // Ensure the update is for the user we are currently viewing
      if (data.userId === userId) {
        setTickets((prev) => [...data.tickets, ...prev]);
      }
    };

    socket.on('newTicketsPurchased', onNewTickets);

    const onDataRefresh = () => {
      console.log('🔄 Data Refresh Signal Received');
      fetchTickets();
    };

    socket.on('dataRefresh', onDataRefresh);

    // 3. Cleanup: Leave Room & Remove Listener
    return () => {
      socket.emit('leaveUserRoom', userId);
      socket.off('ticketStatusChanged', onTicketStatusChanged);
      socket.off('ticketScanned', onTicketScanned);
      socket.off('newTicketsPurchased', onNewTickets);
      socket.off('dataRefresh', onDataRefresh);
    };
  }, [userId, fetchTickets]);

  const handleScanAndExpireNavigation = (ticketId) => {
    // Navigate to the Hardware tab and pass the ticketId as a query parameter
    navigate(`/admin/dashboard?tab=hardware&ticketId=${ticketId}`);
  };

  const filteredTickets = tickets.filter((t) => {
    if (statusFilter === 'all') return true;
    if (statusFilter === 'active') return t.status === 'active';
    if (statusFilter === 'used') return t.status === 'used';
    if (statusFilter === 'expired') return t.status === 'expired';
    return true;
  });

  if (loading) {
    return (
      <div className="min-h-screen bg-smart-bg dark:bg-gray-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-smart-light"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-smart-bg dark:bg-gray-900 transition-colors duration-300">
      <AdminHeader title="Ticket Management" />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        {/* User Info Header */}
        <div className="mb-10 flex items-center justify-between">
          <div>
            <button
              onClick={() =>
                navigate(`/admin/dashboard?tab=${location.state?.fromTab || 'overview'}`)
              }
              className="mb-4 flex items-center text-sm font-black text-smart-light uppercase tracking-widest hover:text-smart-dark transition-colors"
            >
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M15 19l-7-7 7-7" />
              </svg>
              Back to Dashboard
            </button>
            <h1 className="text-4xl font-black text-smart-dark dark:text-white tracking-tighter italic uppercase">
              {user?.name || location.state?.userName || 'User'}'s Tickets
            </h1>
            <p className="text-smart-gray dark:text-gray-400 font-bold mt-1">
              User ID: <span className="font-mono text-xs">{userId}</span>
              {user?.diag_db && (
                <span className="ml-4 text-[10px] text-pink-500 uppercase tracking-tighter bg-pink-500/10 px-2 py-0.5 rounded">
                  Connected to: {user.diag_db}
                </span>
              )}
              {tickets.length === 0 && user?.diag_totalTickets !== undefined && (
                <span className="ml-4 text-[10px] text-orange-500 uppercase tracking-tighter bg-orange-500/10 px-2 py-0.5 rounded">
                  DB has {user.diag_totalTickets} total tickets (non-matching)
                </span>
              )}
            </p>
            {user?.isBlocked && (
              <div className="mt-4 p-4 bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800 rounded-2xl flex items-center">
                <svg className="w-5 h-5 text-red-500 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
                <div>
                  <p className="text-[10px] font-black uppercase text-red-600 dark:text-red-400 tracking-widest">Account Restricted</p>
                  <p className="text-sm font-bold text-smart-dark dark:text-white italic">Reason: {user.blockReason || 'No reason specified'}</p>
                </div>
              </div>
            )}
          </div>

          <div className="bg-white dark:bg-gray-800 p-4 rounded-3xl shadow-xl border border-smart-light/10 flex items-center gap-4">
             <div className="text-right">
                <p className="text-[10px] font-black uppercase text-smart-gray dark:text-gray-500 tracking-widest">Total Tickets</p>
                <p className="text-2xl font-black text-smart-dark dark:text-white italic">{tickets.length}</p>
             </div>
             <div className="w-px h-8 bg-smart-light/10" />
             <div className="text-right pr-2">
                <p className="text-[10px] font-black uppercase text-smart-gray dark:text-gray-500 tracking-widest">Active</p>
                <p className="text-2xl font-black text-green-500 italic">{tickets.filter(t => t.status === 'active').length}</p>
             </div>
          </div>
        </div>

        {/* Status Filter Bar */}
        <div className="mb-8 flex flex-wrap items-center gap-3">
          {['all', 'active', 'used', 'expired'].map((filter) => (
            <button
              key={filter}
              onClick={() => setStatusFilter(filter)}
              className={`px-6 py-2.5 rounded-2xl font-black uppercase tracking-widest text-[10px] transition-all transform active:scale-95 ${
                statusFilter === filter
                  ? 'bg-smart-light text-white shadow-lg shadow-smart-light/20 -translate-y-1'
                  : 'bg-white dark:bg-gray-800 text-smart-gray dark:text-gray-400 border border-smart-light/10 hover:border-smart-light/30'
              }`}
            >
              {filter}
            </button>
          ))}
        </div>

        {/* Tickets Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredTickets.map((ticket) => (
            <div
              key={ticket._id}
              className={`relative overflow-hidden rounded-[35px] border-2 transition-all duration-500 shadow-xl ${
                ticket.status === 'active'
                  ? 'bg-white dark:bg-gray-800 border-smart-light/20 hover:border-smart-light shadow-smart-light/5 hover:shadow-smart-light/10'
                  : 'bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-800 grayscale opacity-75'
              }`}
            >
              {/* Ticket Status Badge */}
              <div className={`absolute top-0 right-0 px-6 py-2 rounded-bl-3xl font-black text-[10px] uppercase tracking-[0.2em] italic ${
                ticket.status === 'active' ? 'bg-smart-light text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-500'
              }`}>
                {ticket.status}
              </div>

              <div className="p-8">
                <div className="flex items-center gap-4 mb-6">
                   <div className="p-4 bg-smart-light/10 rounded-2xl">
                      <span className="text-3xl">🎟️</span>
                   </div>
                   <div>
                      <p className="text-[10px] font-black uppercase text-smart-gray dark:text-gray-500 tracking-widest">Ticket Type</p>
                      <h3 className="text-xl font-black text-smart-dark dark:text-white italic uppercase">{ticket.ticketType}</h3>
                   </div>
                </div>

                <div className="space-y-4 mb-8">
                  <div className="flex justify-between items-end border-b border-smart-light/5 pb-2">
                    <span className="text-[10px] font-black uppercase text-smart-gray dark:text-gray-500 tracking-widest">
                      Ticket ID
                    </span>
                    <span className="font-mono text-xs font-black text-smart-dark dark:text-white select-all">
                      {ticket._id}
                    </span>
                  </div>
                  <div className="flex justify-between items-end border-b border-smart-light/5 pb-2">
                    <span className="text-[10px] font-black uppercase text-smart-gray dark:text-gray-500 tracking-widest">Plan</span>
                    <span className="font-bold text-smart-dark dark:text-white capitalize">{ticket.subscriptionPlan}</span>
                  </div>
                  <div className="flex justify-between items-end border-b border-smart-light/5 pb-2">
                    <span className="text-[10px] font-black uppercase text-smart-gray dark:text-gray-500 tracking-widest">Price</span>
                    <span className="font-black text-smart-light italic">{ticket.price} EGP</span>
                  </div>
                  <div className="flex justify-between items-end border-b border-smart-light/5 pb-2">
                    <span className="text-[10px] font-black uppercase text-smart-gray dark:text-gray-500 tracking-widest">Purchased On</span>
                    <span className="font-bold text-smart-dark dark:text-white text-sm">
                      {new Date(ticket.createdAt).toLocaleDateString(undefined, {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                      })}
                    </span>
                  </div>
                  <div className="flex justify-between items-end">
                    <span className="text-[10px] font-black uppercase text-smart-gray dark:text-gray-500 tracking-widest">Valid Until</span>
                    <span className="font-bold text-smart-dark dark:text-white text-sm">
                      {new Date(ticket.validUntil).toLocaleDateString(undefined, {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                      })}
                    </span>
                  </div>
                </div>

                {ticket.status === 'active' ? (
                  <button
                    onClick={() => handleScanAndExpireNavigation(ticket._id)}
                    className="w-full py-4 bg-smart-dark text-white rounded-2xl font-black uppercase tracking-[0.2em] italic text-xs hover:bg-black transition-all transform hover:-translate-y-1 active:scale-95 shadow-lg shadow-black/20"
                  >
                    Scan & Expire
                  </button>
                ) : (
                  <div className="w-full py-4 bg-gray-100 dark:bg-gray-800 border-2 border-dashed border-gray-300 dark:border-gray-700 text-gray-400 dark:text-gray-600 rounded-2xl font-black uppercase tracking-[0.2em] italic text-xs text-center">
                    Ticket Closed
                  </div>
                )}
              </div>
            </div>
          ))}

          {tickets.length === 0 && (
            <div className="col-span-full py-20 text-center bg-white dark:bg-gray-800 rounded-[50px] border-2 border-dashed border-smart-light/20">
              <span className="text-6xl mb-6 block">📭</span>
              <h2 className="text-2xl font-black text-smart-dark dark:text-white uppercase italic tracking-tighter">No tickets found</h2>
              <p className="text-smart-gray dark:text-gray-500 font-bold mt-2">This user has not purchased any tickets yet.</p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default AdminUserTickets;
