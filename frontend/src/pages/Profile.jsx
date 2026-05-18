import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { useUI } from '../context/UIContext';
import api from '../api';

const Profile = () => {
  const [activeTab, setActiveTab] = useState('info');
  const { showModal, showConfirm } = useUI();
  const [user, setUser] = useState(null);
  const [tickets, setTickets] = useState([]);
  const [selectedQrId, setSelectedQrId] = useState(null);
  const [historyFilter, setHistoryFilter] = useState('all');

  // Form states
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [hasDisability, setHasDisability] = useState(false);
  const [message, setMessage] = useState('');

  const navigate = useNavigate();

  useEffect(() => {
    const fetchAllData = async () => {
      const token = localStorage.getItem('token');
      if (!token) {
        navigate('/');
        return;
      }

      try {
        // Fetch Profile & Cards
        const profileRes = await api.get('/users/profile', {
          headers: { Authorization: `Bearer ${token}` },
        });

        const data = profileRes.data;
        setUser(data);
        setName(data.name);
        setEmail(data.email);
        setPhone(data.phone);
        setHasDisability(data.hasDisability);

        // Fetch Tickets
        const ticketsRes = await api.get('/tickets/history', {
          headers: { Authorization: `Bearer ${token}` },
        });

        setTickets(ticketsRes.data);
      } catch (error) {
        console.error('Error fetching profile data:', error);
        if (error.response?.status === 401) {
          navigate('/');
        }
      }
    };

    fetchAllData();
  }, [navigate]);

  const handleUpdateInfo = async (e) => {
    e.preventDefault();
    const token = localStorage.getItem('token');
    try {
      await api.put(
        '/users/profile',
        { name, email, phone, hasDisability },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      setMessage('Profile Updated');
      setTimeout(() => setMessage(''), 3000);
    } catch (error) {
      setMessage(error.response?.data?.message || 'Update failed');
    }
  };

  const handleDeleteCard = async (cardId) => {
    const token = localStorage.getItem('token');
    try {
      const response = await api.delete(`/users/profile/cards/${cardId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      setUser((prev) => ({ ...prev, savedCards: response.data.savedCards }));
    } catch (error) {
      console.error('Failed to delete card:', error);
    }
  };

  const handleCancelTicket = async (ticketId) => {
    const isConfirmed = await showConfirm(
      'Are you sure you want to cancel this ticket? A refund will be initiated.',
      'Cancel Ticket'
    );
    if (!isConfirmed) return;

    const token = localStorage.getItem('token');
    try {
      await api.patch(
        `/tickets/${ticketId}/cancel`,
        {},
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      setTickets(tickets.map((t) => (t._id === ticketId ? { ...t, status: 'cancelled' } : t)));
      if (selectedQrId === ticketId) setSelectedQrId(null);
      showModal(
        'Ticket cancelled successfully! Your refund has been initiated.',
        'Success',
        'success'
      );
    } catch (error) {
      showModal(
        error.response?.data?.message || 'Network error while cancelling ticket.',
        'Error',
        'error'
      );
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-smart-bg dark:bg-black flex items-center justify-center transition-colors">
        <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-smart-light"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-smart-bg dark:bg-black py-12 px-6 font-sans text-smart-gray dark:text-gray-300 transition-colors duration-300">
      <div className="max-w-6xl mx-auto flex flex-col md:flex-row gap-10">
        {/* Sidebar */}
        <div className="w-full md:w-1/4">
          <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-xl p-8 border border-smart-light/30 dark:border-smart-light/10 sticky top-28">
            <div className="flex items-center space-x-4 mb-8 pb-8 border-b border-gray-100 dark:border-gray-700">
              <div className="w-16 h-16 bg-smart-light/10 rounded-full flex items-center justify-center text-smart-light font-black text-2xl uppercase shadow-inner border border-smart-light/20">
                {user.name?.charAt(0) || 'U'}
              </div>
              <div>
                <h2 className="text-xl font-black capitalize text-smart-dark dark:text-white italic">
                  {user.name}
                </h2>
                <p className="text-sm text-smart-gray dark:text-gray-400 font-medium">
                  {user.role}
                </p>
              </div>
            </div>

            <nav className="space-y-3">
              <button
                onClick={() => setActiveTab('info')}
                className={`w-full flex items-center space-x-3 px-5 py-4 rounded-2xl font-bold transition-all ${activeTab === 'info' ? 'bg-smart-dark dark:bg-smart-light text-white dark:text-smart-dark shadow-md' : 'text-smart-gray dark:text-gray-400 hover:bg-smart-bg dark:hover:bg-gray-700'}`}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                  ></path>
                </svg>
                <span>Edit Info</span>
              </button>

              <button
                onClick={() => setActiveTab('history')}
                className={`w-full flex items-center space-x-3 px-5 py-4 rounded-2xl font-bold transition-all ${activeTab === 'history' ? 'bg-smart-dark dark:bg-smart-light text-white dark:text-smart-dark shadow-md' : 'text-smart-gray dark:text-gray-400 hover:bg-smart-bg dark:hover:bg-gray-700'}`}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"
                  ></path>
                </svg>
                <span>Purchase History</span>
              </button>

              <button
                onClick={() => setActiveTab('cards')}
                className={`w-full flex items-center space-x-3 px-5 py-4 rounded-2xl font-bold transition-all ${activeTab === 'cards' ? 'bg-smart-dark dark:bg-smart-light text-white dark:text-smart-dark shadow-md' : 'text-smart-gray dark:text-gray-400 hover:bg-smart-bg dark:hover:bg-gray-700'}`}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"
                  ></path>
                </svg>
                <span>Saved Cards</span>
              </button>
            </nav>
          </div>
        </div>

        {/* Main Content Area */}
        <div className="w-full md:w-3/4">
          {/* INFO TAB */}
          {activeTab === 'info' && (
            <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-xl p-10 border border-smart-light/30 dark:border-smart-light/10 animate-fade-in-up">
              <h2 className="text-3xl font-black text-smart-dark dark:text-white mb-8 flex items-center italic">
                Personal Information
              </h2>

              {message && (
                <div
                  className={`p-5 mb-8 rounded-2xl font-bold text-sm shadow-sm ${message.includes('Updated') ? 'bg-green-50 border border-green-200 text-green-800' : 'bg-red-50 border border-red-200 text-red-800'}`}
                >
                  {message}
                </div>
              )}

              <form onSubmit={handleUpdateInfo} className="space-y-6 max-w-2xl">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-extrabold text-smart-dark dark:text-white mb-2 uppercase tracking-wide">
                      Full Name
                    </label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full px-5 py-4 rounded-xl border border-gray-200 dark:border-gray-600 focus:ring-4 focus:ring-smart-light/20 focus:border-smart-light outline-none transition bg-smart-bg dark:bg-gray-700 focus:bg-white dark:focus:bg-gray-600 font-medium text-smart-dark dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-extrabold text-smart-dark dark:text-white mb-2 uppercase tracking-wide">
                      Email Address
                    </label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full px-5 py-4 rounded-xl border border-gray-200 dark:border-gray-600 focus:ring-4 focus:ring-smart-light/20 focus:border-smart-light outline-none transition bg-smart-bg dark:bg-gray-700 focus:bg-white dark:focus:bg-gray-600 font-medium text-smart-dark dark:text-white"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-extrabold text-smart-dark dark:text-white mb-2 uppercase tracking-wide">
                    Phone Number
                  </label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full px-5 py-4 rounded-xl border border-gray-200 dark:border-gray-600 focus:ring-4 focus:ring-smart-light/20 focus:border-smart-light outline-none transition bg-smart-bg dark:bg-gray-700 focus:bg-white dark:focus:bg-gray-600 font-medium max-w-md text-smart-dark dark:text-white"
                  />
                </div>

                <div className="flex items-center p-5 bg-smart-bg dark:bg-gray-700 rounded-2xl border border-smart-light/10 max-w-md">
                  <input
                    type="checkbox"
                    id="disability"
                    checked={hasDisability}
                    onChange={(e) => setHasDisability(e.target.checked)}
                    className="w-6 h-6 text-smart-light border-gray-300 dark:border-gray-500 rounded focus:ring-smart-light cursor-pointer"
                  />
                  <div className="ml-4">
                    <label
                      htmlFor="disability"
                      className="block text-sm font-black text-smart-dark dark:text-white cursor-pointer italic"
                    >
                      Require accessibility features
                    </label>
                    <p className="text-xs text-smart-gray dark:text-gray-400 font-medium mt-1">
                      Wheelchair access, prioritized seating, etc.
                    </p>
                  </div>
                </div>

                <button
                  type="submit"
                  className="mt-8 px-10 py-4 bg-smart-light hover:bg-smart-dark text-white rounded-full font-black text-lg transition-all shadow-xl hover:shadow-2xl hover:-translate-y-1"
                >
                  Save Changes
                </button>
              </form>
            </div>
          )}

          {/* HISTORY TAB */}
          {activeTab === 'history' && (
            <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-xl p-10 border border-smart-light/30 dark:border-smart-light/10 animate-fade-in-up">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
                <h2 className="text-3xl font-black text-smart-dark dark:text-white flex items-center italic">
                  Purchase History
                </h2>
                <div className="flex bg-smart-bg dark:bg-gray-700 p-1 rounded-xl border border-smart-light/10 overflow-x-auto scrollbar-hide max-w-full">
                  {['all', 'active', 'used', 'expired'].map((status) => (
                    <button
                      key={status}
                      onClick={() => setHistoryFilter(status)}
                      className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${
                        historyFilter === status
                          ? 'bg-smart-light text-white shadow-sm'
                          : 'text-smart-gray dark:text-gray-400 hover:text-smart-dark dark:hover:text-white'
                      }`}
                    >
                      {status}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-6">
                {tickets.filter(t => historyFilter === 'all' || t.status === historyFilter).length === 0 ? (
                  <div className="p-12 text-center border-2 border-dashed border-smart-light/20 rounded-3xl bg-smart-bg dark:bg-gray-700">
                    <div className="w-20 h-20 bg-white dark:bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-4 border border-smart-light/10 shadow-sm">
                      <svg
                        className="w-10 h-10 text-smart-light/40"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="2"
                          d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z"
                        ></path>
                      </svg>
                    </div>
                    <p className="text-smart-gray dark:text-gray-400 font-bold text-lg">
                      No {historyFilter !== 'all' ? historyFilter : ''} tickets found.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                    {tickets
                      .filter((t) => historyFilter === 'all' || t.status === historyFilter)
                      .map((ticket) => (
                      <div
                        key={ticket._id}
                        className="bg-white dark:bg-gray-700 rounded-3xl shadow-md border border-smart-light/20 p-8 hover:shadow-lg transition-shadow flex flex-col justify-between"
                      >
                        <div className="flex justify-between items-start mb-6">
                          <div>
                            <span
                              className={`inline-block px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-widest shadow-sm ${
                                ticket.status === 'active'
                                  ? 'bg-smart-light/20 text-smart-dark dark:text-smart-light border border-smart-light/30'
                                  : ticket.status === 'used'
                                    ? 'bg-gray-100 dark:bg-gray-600 text-smart-gray dark:text-gray-400 border border-gray-200 dark:border-gray-500 opacity-60'
                                    : 'bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-300 border border-red-100 dark:border-red-900 opacity-60'
                              }`}
                            >
                              {ticket.status}
                            </span>
                            <h3 className="text-2xl font-black text-smart-dark dark:text-white capitalize mt-3 italic">
                              {ticket.ticketType} Pass
                            </h3>
                            <p className="text-sm font-bold text-smart-gray dark:text-gray-400 uppercase tracking-widest mt-1">
                              {ticket.subscriptionPlan} Subscription
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-3xl font-black text-smart-dark dark:text-smart-glow mb-2">
                              {ticket.price}{' '}
                              <span className="text-sm text-smart-gray dark:text-gray-400 italic">
                                EGP
                              </span>
                            </p>
                            {ticket.status === 'active' && (
                              <div className="flex flex-col gap-2 items-end">
                                <button
                                  onClick={() =>
                                    setSelectedQrId(selectedQrId === ticket._id ? null : ticket._id)
                                  }
                                  className="text-sm bg-smart-light hover:bg-smart-dark text-white font-bold py-1.5 px-4 rounded-lg shadow transition-colors w-full max-w-[140px]"
                                >
                                  {selectedQrId === ticket._id ? 'Hide QR' : 'Show QR Code'}
                                </button>
                                <button
                                  onClick={() => handleCancelTicket(ticket._id)}
                                  className="text-sm bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/40 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800 font-bold py-1.5 px-4 rounded-lg shadow-sm transition-colors w-full max-w-[140px]"
                                >
                                  Cancel & Refund
                                </button>
                              </div>
                            )}
                          </div>
                        </div>

                        {selectedQrId === ticket._id && (
                          <div className="bg-smart-bg dark:bg-gray-800 border-2 border-smart-light/20 rounded-2xl p-6 mb-6 flex flex-col items-center justify-center animate-fade-in-up">
                            <p className="text-xs font-bold text-smart-gray dark:text-gray-400 uppercase tracking-widest mb-4">
                              Gate Scanner QR
                            </p>
                            <div className="p-3 bg-white border-4 border-smart-dark rounded-xl shadow-sm mb-4">
                              <QRCodeSVG value={ticket._id} size={150} level="H" />
                            </div>
                            <div className="bg-white dark:bg-gray-700 px-4 py-2 rounded-lg border border-smart-light/10 w-full max-w-xs text-center mb-4 shadow-inner">
                              <p className="text-[10px] text-smart-gray dark:text-gray-400 font-bold uppercase tracking-widest mb-1">
                                Ticket ID
                              </p>
                              <p className="font-mono text-sm font-black text-smart-dark dark:text-white select-all tracking-wider text-center">
                                {ticket._id}
                              </p>
                            </div>
                            {ticket.validFrom && (
                              <div className="text-center w-full max-w-xs mb-2">
                                {ticket.subscriptionPlan === 'monthly' ? (
                                  <p className="font-semibold text-smart-dark dark:text-white text-xs">
                                    Valid from: {new Date(ticket.validFrom).toLocaleDateString()} to{' '}
                                    {new Date(ticket.validUntil).toLocaleDateString()}
                                  </p>
                                ) : (
                                  <p className="font-semibold text-smart-light text-xs font-bold">
                                    Valid strictly on:{' '}
                                    {new Date(ticket.validFrom).toLocaleDateString()}
                                  </p>
                                )}
                              </div>
                            )}
                          </div>
                        )}

                        <div className="flex justify-between items-center text-sm font-medium text-smart-gray/50 dark:text-gray-500 pt-4 border-t border-gray-100 dark:border-gray-600">
                          <p className="font-mono text-xs">ID: {ticket._id.slice(-8)}</p>
                          <p>
                            {new Date(ticket.createdAt).toLocaleDateString(undefined, {
                              year: 'numeric',
                              month: 'long',
                              day: 'numeric',
                            })}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* CARDS TAB */}
          {activeTab === 'cards' && (
            <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-xl p-10 border border-smart-light/30 dark:border-smart-light/10 animate-fade-in-up">
              <div className="flex justify-between items-center mb-8">
                <h2 className="text-3xl font-black text-smart-dark dark:text-white flex items-center italic">
                  Saved Cards
                </h2>
              </div>

              <div className="space-y-6 max-w-2xl">
                {!user.savedCards || user.savedCards.length === 0 ? (
                  <div className="p-12 text-center border-2 border-dashed border-smart-light/20 rounded-3xl bg-smart-bg dark:bg-gray-700">
                    <div className="w-20 h-20 bg-white dark:bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-4 border border-smart-light/10 shadow-sm">
                      <svg
                        className="w-10 h-10 text-smart-light/40"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="2"
                          d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"
                        ></path>
                      </svg>
                    </div>
                    <p className="text-smart-gray dark:text-gray-400 font-bold text-lg">
                      No saved cards found.
                    </p>
                  </div>
                ) : (
                  user.savedCards.map((card) => (
                    <div
                      key={card._id}
                      className="flex items-center justify-between p-6 bg-gradient-to-r from-smart-dark to-black rounded-2xl shadow-xl text-white transform transition hover:-translate-y-1 border border-white/5"
                    >
                      <div className="flex items-center space-x-6">
                        <div className="w-16 h-12 bg-white/10 backdrop-blur-sm rounded-lg border border-white/20 flex items-center justify-center">
                          <svg
                            className="w-8 h-8 text-smart-glow"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth="2"
                              d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"
                            ></path>
                          </svg>
                        </div>
                        <div>
                          <p className="text-sm text-smart-glow font-bold uppercase tracking-widest mb-1">
                            Credit Card
                          </p>
                          <p className="text-xl font-mono tracking-widest">
                            •••• •••• •••• {card.last4Digits}
                          </p>
                        </div>
                      </div>

                      <button
                        onClick={() => handleDeleteCard(card._id)}
                        className="p-3 bg-red-500/10 hover:bg-red-500 text-red-400 hover:text-white rounded-xl transition-all border border-red-500/20 hover:border-transparent group"
                        title="Delete Card"
                      >
                        <svg
                          className="w-6 h-6 transform group-hover:scale-110 transition"
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
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Profile;
