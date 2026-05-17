import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import WeatherWidget from '../components/WeatherWidget';
import api from '../api';

const pricingTiers = {
  'one-time': { child: 100, adult: 200, senior: 150 },
  'monthly': { child: 1500, adult: 3000, senior: 2000 }
};

const getCrowdColor = (level) => {
  switch (level) {
    case 'quiet': return 'bg-green-500';
    case 'moderate': return 'bg-yellow-500';
    case 'busy': return 'bg-red-500';
    default: return 'bg-gray-400';
  }
};

const getCrowdText = (level) => {
  switch (level) {
    case 'quiet': return 'Quiet';
    case 'moderate': return 'Moderate';
    case 'busy': return 'Busy';
    default: return 'Unknown';
  }
};

const BookingPage = () => {
  const [tickets, setTickets] = useState({
    child: 0,
    adult: 0,
    senior: 0
  });
  const [subscriptionType, setSubscriptionType] = useState('one-time');
  const [selectedDate, setSelectedDate] = useState('');
  const [error, setError] = useState('');
  const [insights, setInsights] = useState(null);
  const [loadingInsights, setLoadingInsights] = useState(true);
  const [insightStartDate, setInsightStartDate] = useState(new Date());
  const navigate = useNavigate();

  // Calculate week window (today through today + 6 days)
  const getWeekWindow = () => {
    const weekStart = new Date(insightStartDate);
    weekStart.setHours(0, 0, 0, 0);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    return { weekStart, weekEnd };
  };

  const { weekStart, weekEnd } = getWeekWindow();

  // Format dates for input
  const minDate = weekStart.toISOString().split('T')[0];
  const maxDate = weekEnd.toISOString().split('T')[0];

  // Fetch crowd insights
  const fetchInsights = React.useCallback(async () => {
    setLoadingInsights(true);
    try {
      const token = localStorage.getItem('token');
      const dateStr = insightStartDate.toISOString().split('T')[0];
      const response = await api.get('/tickets/insights', {
        params: { startDate: dateStr },
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      });
      setInsights(response.data);
    } catch (err) {
      console.error('Failed to fetch insights:', err);
    } finally {
      setLoadingInsights(false);
    }
  }, [insightStartDate]);

  useEffect(() => {
    fetchInsights();
    // Poll every 60 seconds
    const interval = setInterval(fetchInsights, 60000);
    return () => clearInterval(interval);
  }, [fetchInsights]);

  const currentPrices = pricingTiers[subscriptionType];

  // Redirect to login if no token is found
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      navigate('/');
    }
  }, [navigate]);

  const totalTickets = tickets.child + tickets.adult + tickets.senior;

  const handleIncrement = (type) => {
    // Dynamically calculate actual remaining capacity for the selected date
    let remainingCapacity = 200;
    if (subscriptionType === 'one-time' && selectedDate && insights) {
      const dayData = insights.days.find(d => d.date === selectedDate);
      if (dayData) {
        remainingCapacity = (insights.capacity || 200) - dayData.count;
      }
    }

    if (totalTickets >= remainingCapacity) {
      setError(`Capacity reached. You can only add ${remainingCapacity} tickets for this selection.`);
      return;
    }
    setError('');
    setTickets(prev => ({ ...prev, [type]: prev[type] + 1 }));
  };

  const handleDecrement = (type) => {
    setError('');
    setTickets(prev => ({ ...prev, [type]: Math.max(0, prev[type] - 1) }));
  };

  const totalPrice = (tickets.child * currentPrices.child) + (tickets.adult * currentPrices.adult) + (tickets.senior * currentPrices.senior);

  const handleProceed = (e) => {
    e.preventDefault();
    setError('');

    if (totalPrice === 0) {
      setError('Please select at least one ticket to proceed.');
      return;
    }

    if (!subscriptionType) {
      setError('Please select a subscription duration.');
      return;
    }

    if (subscriptionType === 'one-time' && !selectedDate) {
      setError('Please select a visit date.');
      return;
    }

    navigate('/payment', { 
      state: { 
        tickets, 
        subscriptionType, 
        totalPrice,
        selectedDate
      } 
    });
  };

  // Check if a specific date is sold out
  const isDateSoldOut = (dateStr) => {
    if (!insights) return false;
    const day = insights.days.find(d => d.date === dateStr);
    return day && day.count >= insights.capacity;
  };

  return (
    <div className="min-h-screen bg-smart-bg dark:bg-black flex flex-col transition-colors duration-300">
      <main className="flex-grow max-w-5xl mx-auto px-6 py-12 flex items-center justify-center w-full">
        <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col md:flex-row w-full border border-smart-light/30 dark:border-smart-light/10">
          
          {/* Info Side */}
          <div className="bg-smart-dark p-10 text-white flex-1 flex flex-col justify-between">
            <div>
              <h2 className="text-4xl font-extrabold mb-6 text-smart-glow">Select Your Passes</h2>
              <p className="text-white/80 text-lg mb-8 leading-relaxed">
                Choose the tickets that best fit your group. Our monthly subscriptions offer unlimited access to all IoT park features.
              </p>
              
              <div className="my-10 w-full flex justify-center">
                <WeatherWidget />
              </div>
            </div>
            
            <div className="space-y-6">
              <div className="flex items-center space-x-4">
                <div className="bg-white/10 p-2 rounded-lg">
                  <svg className="w-6 h-6 text-smart-glow" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                </div>
                <span className="text-lg font-medium">Access to all inclusive paths</span>
              </div>
              <div className="flex items-center space-x-4">
                <div className="bg-white/10 p-2 rounded-lg">
                  <svg className="w-6 h-6 text-smart-glow" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                </div>
                <span className="text-lg font-medium">Smart app navigation</span>
              </div>
              <div className="flex items-center space-x-4">
                <div className="bg-white/10 p-2 rounded-lg">
                  <svg className="w-6 h-6 text-smart-glow" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                </div>
                <span className="text-lg font-medium">Priority support</span>
              </div>
            </div>
          </div>

          {/* Form Side */}
          <div className="p-10 flex-1 bg-white dark:bg-gray-800 flex flex-col justify-center">
            {error && (
              <div className="mb-8 p-4 bg-red-50 dark:bg-red-900/30 border-l-4 border-red-500 text-red-700 dark:text-red-200 rounded-r-lg font-medium shadow-sm">
                {error}
              </div>
            )}
            <form onSubmit={handleProceed} className="space-y-8">

              {/* Subscription Type Toggle */}
              <div>
                <label className="block text-sm font-extrabold text-smart-dark dark:text-white mb-4 uppercase tracking-wider">Duration</label>
                <div className="grid grid-cols-2 gap-4">
                  <label className={`cursor-pointer border-2 rounded-xl p-5 text-center transition-all ${subscriptionType === 'one-time' ? 'border-smart-light bg-smart-light/5 dark:bg-smart-light/10 text-smart-dark dark:text-white font-extrabold shadow-sm transform scale-105' : 'border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-smart-light/40 hover:bg-gray-50 dark:hover:bg-gray-700/50'}`}>
                    <input 
                      type="radio" 
                      name="subscriptionType" 
                      value="one-time" 
                      className="hidden"
                      checked={subscriptionType === 'one-time'}
                      onChange={() => setSubscriptionType('one-time')}
                    />
                    <div className="text-xl mb-1">One-Time</div>
                    <div className="text-sm opacity-80 font-normal">Valid for 24 hours</div>
                  </label>
                  
                  <label className={`relative cursor-pointer border-2 rounded-xl p-5 text-center transition-all ${subscriptionType === 'monthly' ? 'border-smart-light bg-smart-light/5 dark:bg-smart-light/10 text-smart-dark dark:text-white font-extrabold shadow-sm transform scale-105' : 'border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-smart-light/40 hover:bg-gray-50 dark:hover:bg-gray-700/50'}`}>
                    <input 
                      type="radio" 
                      name="subscriptionType" 
                      value="monthly" 
                      className="hidden"
                      checked={subscriptionType === 'monthly'}
                      onChange={() => setSubscriptionType('monthly')}
                    />
                    <span className="absolute -top-3 -right-3 bg-red-500 text-white text-xs font-black uppercase px-3 py-1 rounded-full shadow-lg transform rotate-3">Best Value!</span>
                    <div className="text-xl mb-1">Monthly</div>
                    <div className="text-sm opacity-80 font-normal">Unlimited access</div>
                  </label>
                </div>
              </div>
              
              {/* Visit Date */}
              {subscriptionType === 'one-time' && (
                <div className="animate-fade-in-up">
                  <label className="block text-sm font-extrabold text-smart-dark dark:text-white mb-4 uppercase tracking-wider">Select Visit Date</label>
                  <select
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                    className="w-full px-5 py-4 rounded-xl border border-gray-200 dark:border-gray-600 focus:ring-4 focus:ring-smart-light/20 focus:border-smart-light outline-none transition bg-smart-bg dark:bg-gray-700 focus:bg-white dark:focus:bg-gray-600 font-bold text-smart-dark dark:text-white"
                  >
                    <option value="">-- Select a Date --</option>
                    {insights?.days.map((day) => (
                      <option 
                        key={day.date} 
                        value={day.date}
                        disabled={day.count >= (insights?.capacity || 200)}
                      >
                        {day.displayDate} - {day.count >= (insights?.capacity || 200) ? 'SOLD OUT' : `${day.count}/${insights?.capacity || 200} tickets`}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                    Available: {weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - {weekEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </p>
                </div>
              )}

              {/* Ticket Quantities */}
              <div>
                <label className="block text-sm font-extrabold text-smart-dark dark:text-white mb-4 uppercase tracking-wider">Ticket Quantities</label>
                <div className="space-y-4">
                  
                  {/* Child */}
                  <div className="flex items-center justify-between p-4 border border-gray-200 dark:border-gray-700 rounded-xl hover:border-smart-light/40 transition-colors">
                    <div>
                      <h4 className="font-bold text-smart-dark dark:text-white text-lg">Child</h4>
                      <p className="text-sm text-smart-light font-bold transition-all">{currentPrices.child} EGP</p>
                    </div>
                    <div className="flex items-center space-x-4">
                      <button type="button" onClick={() => handleDecrement('child')} className="w-10 h-10 rounded-full bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 flex items-center justify-center text-gray-600 dark:text-white font-bold transition-colors">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20 12H4"></path></svg>
                      </button>
                      <span className="font-extrabold text-xl w-6 text-center text-smart-dark dark:text-white">{tickets.child}</span>
                      <button type="button" onClick={() => handleIncrement('child')} className="w-10 h-10 rounded-full bg-smart-light/10 dark:bg-smart-light/20 hover:bg-smart-light/20 text-smart-light flex items-center justify-center font-bold transition-colors">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"></path></svg>
                      </button>
                    </div>
                  </div>

                  {/* Adult */}
                  <div className="flex items-center justify-between p-4 border border-gray-200 dark:border-gray-700 rounded-xl hover:border-smart-light/40 transition-colors">
                    <div>
                      <h4 className="font-bold text-smart-dark dark:text-white text-lg">Adult</h4>
                      <p className="text-sm text-smart-light font-bold transition-all">{currentPrices.adult} EGP</p>
                    </div>
                    <div className="flex items-center space-x-4">
                      <button type="button" onClick={() => handleDecrement('adult')} className="w-10 h-10 rounded-full bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 flex items-center justify-center text-gray-600 dark:text-white font-bold transition-colors">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20 12H4"></path></svg>
                      </button>
                      <span className="font-extrabold text-xl w-6 text-center text-smart-dark dark:text-white">{tickets.adult}</span>
                      <button type="button" onClick={() => handleIncrement('adult')} className="w-10 h-10 rounded-full bg-smart-light/10 dark:bg-smart-light/20 hover:bg-smart-light/20 text-smart-light flex items-center justify-center font-bold transition-colors">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"></path></svg>
                      </button>
                    </div>
                  </div>

                  {/* Senior */}
                  <div className="flex items-center justify-between p-4 border border-gray-200 dark:border-gray-700 rounded-xl hover:border-smart-light/40 transition-colors">
                    <div>
                      <h4 className="font-bold text-smart-dark dark:text-white text-lg">Senior</h4>
                      <p className="text-sm text-smart-light font-bold transition-all">{currentPrices.senior} EGP</p>
                    </div>
                    <div className="flex items-center space-x-4">
                      <button type="button" onClick={() => handleDecrement('senior')} className="w-10 h-10 rounded-full bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 flex items-center justify-center text-gray-600 dark:text-white font-bold transition-colors">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20 12H4"></path></svg>
                      </button>
                      <span className="font-extrabold text-xl w-6 text-center text-smart-dark dark:text-white">{tickets.senior}</span>
                      <button type="button" onClick={() => handleIncrement('senior')} className="w-10 h-10 rounded-full bg-smart-light/10 dark:bg-smart-light/20 hover:bg-smart-light/20 text-smart-light flex items-center justify-center font-bold transition-colors">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"></path></svg>
                      </button>
                    </div>
                  </div>

                </div>
              </div>

              {/* Dynamic Total Price */}
              <div className="pt-6 border-t border-gray-100 dark:border-gray-700 flex justify-between items-end">
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400 font-bold uppercase tracking-widest mb-1">Total Price</p>
                  <p className="text-4xl font-black text-smart-dark dark:text-smart-glow transition-all">{totalPrice} <span className="text-xl text-gray-500 dark:text-gray-400 font-medium italic">EGP</span></p>
                </div>
                <button 
                  type="submit" 
                  className="bg-smart-light hover:bg-smart-dark text-white font-extrabold py-4 px-8 rounded-xl transition-all shadow-xl hover:shadow-2xl hover:-translate-y-1"
                >
                  Proceed to Payment
                </button>
              </div>

            </form>

            {/* Crowd Insights Panel */}
            {subscriptionType === 'one-time' && (
              <div className="mt-8 pt-6 border-t border-gray-100 dark:border-gray-700">
                <h3 className="text-sm font-extrabold text-smart-dark dark:text-white mb-4 uppercase tracking-wider flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"></path>
                    </svg>
                    Availability Window
                  </div>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setInsightStartDate(prev => new Date(new Date(prev).setDate(prev.getDate() - 7)))} className="px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded text-xs hover:bg-gray-200 dark:hover:bg-gray-600 transition">&larr; Prev</button>
                    <button type="button" onClick={() => setInsightStartDate(new Date())} className="px-2 py-1 bg-smart-light/10 text-smart-light rounded text-xs font-bold hover:bg-smart-light/20 transition">Today</button>
                    <button type="button" onClick={() => setInsightStartDate(prev => new Date(new Date(prev).setDate(prev.getDate() + 7)))} className="px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded text-xs hover:bg-gray-200 dark:hover:bg-gray-600 transition">Next &rarr;</button>
                  </div>
                </h3>
                {loadingInsights ? (
                  <div className="flex justify-center py-4">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-smart-light"></div>
                  </div>
                ) : insights ? (
                  <div className="grid grid-cols-7 gap-2">
                    {insights.days.map((day, index) => (
                      <div 
                        key={index} 
                        className={`p-2 rounded-lg text-center ${day.isToday ? 'ring-2 ring-smart-light' : ''}`}
                      >
                        <div className="text-xs font-bold text-gray-500 dark:text-gray-400 mb-1">{day.dayName}</div>
                        <div className={`w-full h-8 rounded-md ${getCrowdColor(day.crowdLevel)} flex items-center justify-center`}>
                          <span className="text-white text-xs font-bold">{day.count}</span>
                        </div>
                        <div className={`text-xs font-bold mt-1 ${day.crowdLevel === 'quiet' ? 'text-green-600' : day.crowdLevel === 'moderate' ? 'text-yellow-600' : 'text-red-600'}`}>
                          {getCrowdText(day.crowdLevel)}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="py-4 text-center text-smart-gray dark:text-gray-500 font-bold text-sm">
                    Failed to load availability calendar.
                    <button type="button" onClick={fetchInsights} className="block mx-auto mt-2 text-smart-light hover:underline">Retry</button>
                  </div>
                )}
                <div className="flex items-center justify-center gap-4 mt-3 text-xs">
                  <div className="flex items-center gap-1">
                    <div className="w-3 h-3 rounded-full bg-green-500"></div>
                    <span className="text-gray-500 dark:text-gray-400">Quiet (0-30%)</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                    <span className="text-gray-500 dark:text-gray-400">Moderate (31-70%)</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-3 h-3 rounded-full bg-red-500"></div>
                    <span className="text-gray-500 dark:text-gray-400">Busy (71-100%)</span>
                  </div>
                </div>
              </div>
            )}

          </div>
        </div>
      </main>
    </div>
  );
};

export default BookingPage;
