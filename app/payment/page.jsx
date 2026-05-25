'use client';

import React, { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import api from '../../api';

const Payment = () => {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [isProcessing, setIsProcessing] = useState(false);
  const [success, setSuccess] = useState(false);
  const [generatedTickets, setGeneratedTickets] = useState([]);
  const [error, setError] = useState('');

  // Payment Options State
  const [paymentMethod, setPaymentMethod] = useState('credit_card');

  // Form states
  const [cardNumber, setCardNumber] = useState('');
  const [expiry, setExpiry] = useState('');
  const [cvv, setCvv] = useState('');
  const [saveCard, setSaveCard] = useState(false);

  const [savedCards, setSavedCards] = useState([]);
  const [selectedSavedCard, setSelectedSavedCard] = useState('');
  const [useSavedCard, setUseSavedCard] = useState(false);

  // Promo Code State
  const [promoCodeInput, setPromoCodeInput] = useState('');
  const [promoDiscount, setPromoDiscount] = useState(0);
  const [isPromoValid, setIsPromoValid] = useState(false);
  const [promoError, setPromoError] = useState('');
  const [promoLoading, setPromoLoading] = useState(false);

  const [bookingState, setBookingState] = useState(null);

  useEffect(() => {
    // Retrieve state from localStorage
    const savedState = localStorage.getItem('lastBookingState');
    if (savedState) {
      const parsed = JSON.parse(savedState);
      setBookingState(parsed);
      
      // Auto-populate promo if available
      const promoFromQuery = searchParams.get('promo');
      if (promoFromQuery) {
          setPromoCodeInput(promoFromQuery.toUpperCase());
      }
    }
  }, [searchParams]);

  useEffect(() => {
    const fetchProfile = async () => {
      const token = localStorage.getItem('token');
      if (token) {
        try {
          const res = await api.get('/users/profile', {
            headers: { Authorization: `Bearer ${token}` },
          });
          const data = res.data;
          if (data.savedCards && data.savedCards.length > 0) {
            setSavedCards(data.savedCards);
          }
        } catch (e) {
          console.error('Failed to fetch saved cards');
        }
      }
    };
    fetchProfile();
  }, []);

  if (!bookingState) {
      return (
          <div className="min-h-screen bg-smart-bg dark:bg-black flex items-center justify-center p-6">
              <div className="bg-white dark:bg-gray-800 p-10 rounded-[40px] shadow-2xl border border-smart-light/20 text-center max-w-md w-full">
                  <h2 className="text-2xl font-black text-smart-dark dark:text-white mb-6 uppercase italic tracking-tighter">No Active Booking</h2>
                  <p className="text-smart-gray dark:text-gray-400 mb-8 font-bold">Please select your tickets before proceeding to payment.</p>
                  <button onClick={() => router.push('/book')} className="w-full bg-smart-light hover:bg-smart-dark text-white font-black py-4 rounded-2xl transition-all shadow-lg uppercase tracking-widest text-xs">Return to Booking</button>
              </div>
          </div>
      );
  }

  const { tickets, subscriptionType, totalPrice, selectedDate } = bookingState;

  const handleCardNumberChange = (e) => {
    let value = e.target.value.replace(/\D/g, '');
    value = value.replace(/(.{4})/g, '$1 ').trim();
    if (value.length <= 19) setCardNumber(value);
  };

  const handleExpiryChange = (e) => {
    let value = e.target.value.replace(/\D/g, '');
    if (value.length >= 3) {
      value = value.substring(0, 2) + '/' + value.substring(2, 4);
    }
    if (value.length <= 5) setExpiry(value);
  };

  const handleCvvChange = (e) => {
    let value = e.target.value.replace(/\D/g, '');
    if (value.length <= 3) setCvv(value);
  };

  const handleValidatePromo = async () => {
    if (!promoCodeInput) return;
    setPromoLoading(true);
    setPromoError('');
    const token = localStorage.getItem('token');

    try {
      const res = await api.post('/promo/validate', { code: promoCodeInput }, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setPromoDiscount(res.data.discount);
      setIsPromoValid(true);
    } catch (err) {
      setPromoError(err.response?.data?.message || 'Invalid promo code');
      setIsPromoValid(false);
    } finally {
      setPromoLoading(false);
    }
  };

  const discountedPrice = totalPrice - totalPrice * (promoDiscount / 100);

  const handlePayment = async (e) => {
    e.preventDefault();
    setIsProcessing(true);
    setError('');

    if (paymentMethod === 'credit_card' && !useSavedCard && cardNumber.replace(/\s+/g, '').length < 16) {
      setError('Please enter a valid 16-digit card number.');
      setIsProcessing(false);
      return;
    }

    const token = localStorage.getItem('token');
    try {
      const response = await api.post('/tickets/checkout', {
        quantities: tickets,
        selectedDate,
        subscriptionPlan: subscriptionType,
        useSavedCard,
        savedCardId: useSavedCard ? selectedSavedCard : undefined,
        totalPrice,
        saveCard,
        paymentMethod,
        cardNumber: useSavedCard ? undefined : cardNumber.replace(/\s+/g, ''),
        expiry: useSavedCard ? undefined : expiry,
        cvv: useSavedCard ? undefined : cvv,
        promoCode: isPromoValid ? promoCodeInput : undefined,
      }, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.data?.tickets) setGeneratedTickets(response.data.tickets);
      setSuccess(true);
      localStorage.removeItem('lastBookingState');
    } catch (err) {
      setError(err.response?.data?.message || 'Payment failed. Connection error.');
    } finally {
      setIsProcessing(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen bg-smart-bg dark:bg-black flex items-center justify-center p-6 animate-fade-in transition-colors duration-500">
        <div className="bg-white dark:bg-gray-800 p-12 rounded-[50px] shadow-2xl border-t-8 border-smart-light text-center max-w-xl w-full border border-smart-light/10">
          <div className="w-24 h-24 bg-smart-light/20 rounded-full flex items-center justify-center mx-auto mb-8 shadow-inner animate-bounce">
            <svg className="w-12 h-12 text-smart-light" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" /></svg>
          </div>
          <h2 className="text-4xl md:text-5xl font-black text-smart-dark dark:text-smart-glow mb-6 tracking-tighter italic uppercase">Payment Confirmed</h2>
          <p className="text-lg md:text-xl text-smart-gray dark:text-gray-300 mb-10 font-bold max-w-md mx-auto">Your passes have been generated and sent to your email.</p>
          <button onClick={() => router.push('/profile')} className="w-full bg-smart-light hover:bg-smart-dark text-white font-black py-5 rounded-2xl shadow-xl transition-all uppercase tracking-widest text-sm active:scale-95">Go to My Passes</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-smart-bg dark:bg-black flex flex-col transition-colors duration-300">
      <main className="flex-grow max-w-6xl mx-auto px-4 md:px-6 py-12 w-full flex items-center justify-center">
        <div className="bg-white dark:bg-gray-800 rounded-[40px] shadow-2xl overflow-hidden flex flex-col lg:flex-row w-full border border-smart-light/10">
          
          {/* Summary */}
          <div className="bg-smart-dark p-8 md:p-12 text-white flex-1 flex flex-col justify-between">
            <div>
              <h2 className="text-2xl md:text-3xl font-black mb-10 flex items-center text-smart-glow italic uppercase tracking-tighter">
                <svg className="w-8 h-8 mr-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                Reservation Summary
              </h2>
              <div className="space-y-4 mb-10">
                {Object.entries(tickets).map(([type, count]) => count > 0 && (
                  <div key={type} className="flex justify-between items-center bg-black/20 p-5 rounded-2xl border border-white/10 backdrop-blur-sm">
                    <span className="font-black uppercase tracking-widest text-xs">{count}x {type} Pass</span>
                    <span className="text-smart-glow font-black italic">{count * (type === 'child' ? 100 : type === 'adult' ? 200 : 150)} EGP</span>
                  </div>
                ))}
                <div className="bg-smart-light/10 border border-smart-light/20 p-5 rounded-2xl">
                  <p className="text-[10px] text-smart-light uppercase tracking-widest font-black mb-1">Validity Matrix</p>
                  <p className="text-lg font-black italic uppercase text-white">{subscriptionType} {selectedDate && `• ${new Date(selectedDate).toLocaleDateString()}`}</p>
                </div>
              </div>
            </div>

            <div className="border-t border-white/10 pt-8">
              <div className="mb-8">
                 <label className="block text-[10px] font-black text-white/40 uppercase tracking-widest mb-3 italic">Establish Promo Handshake</label>
                 <div className="flex gap-2">
                    <input type="text" placeholder="CODE..." value={promoCodeInput} onChange={(e) => setPromoCodeInput(e.target.value.toUpperCase())} disabled={isPromoValid} className="flex-grow bg-black/40 border-2 border-white/10 rounded-xl px-5 py-3.5 text-sm font-black focus:border-smart-glow transition-all outline-none uppercase" />
                    <button type="button" onClick={handleValidatePromo} disabled={promoLoading || isPromoValid || !promoCodeInput} className={`px-6 rounded-xl font-black text-[10px] uppercase transition-all ${isPromoValid ? 'bg-green-500' : 'bg-smart-glow text-smart-dark hover:scale-105'}`}>{promoLoading ? '...' : isPromoValid ? 'OK' : 'Apply'}</button>
                 </div>
                 {promoError && <p className="text-red-400 text-[10px] font-black mt-3 uppercase italic tracking-widest">{promoError}</p>}
                 {isPromoValid && <p className="text-green-400 text-[10px] font-black mt-3 uppercase italic tracking-widest">Protocol Accepted: {promoDiscount}% Reduction</p>}
              </div>
              <div className="flex justify-between items-end">
                <span className="text-white/40 uppercase tracking-widest font-black text-xs italic">Terminal Value</span>
                <div className="text-right">
                  {isPromoValid && <p className="text-white/20 line-through text-sm font-black mb-[-5px] italic">{totalPrice} EGP</p>}
                  <p className="text-4xl md:text-5xl font-black text-smart-glow italic tracking-tighter">
                    {isPromoValid ? Math.round(discountedPrice) : totalPrice}
                    <span className="text-xl text-white/50 ml-2 italic">EGP</span>
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Form */}
          <div className="p-8 md:p-12 flex-1 bg-white dark:bg-gray-800 flex flex-col justify-center">
            <h2 className="text-2xl md:text-3xl font-black text-smart-dark dark:text-white mb-8 italic uppercase tracking-tighter">Gateway Access</h2>
            
            <div className="flex bg-smart-bg dark:bg-gray-700 p-1 rounded-2xl border border-smart-light/10 mb-8 overflow-x-auto no-scrollbar">
              {['credit_card', 'valu', 'klivvr', 'CASH'].map((method) => (
                <button key={method} type="button" onClick={() => { setPaymentMethod(method); setUseSavedCard(false); }} className={`flex-1 min-w-[90px] py-3.5 px-4 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${paymentMethod === method ? 'bg-white dark:bg-gray-800 text-smart-dark dark:text-white shadow-xl border border-smart-light/20' : 'text-smart-gray dark:text-gray-500 hover:text-smart-dark'}`}>
                  {method === 'credit_card' ? 'Card' : method.charAt(0).toUpperCase() + method.slice(1).toLowerCase()}
                </button>
              ))}
            </div>

            {error && <div className="mb-8 p-5 bg-red-50 border-l-4 border-red-500 text-red-700 rounded-r-2xl font-black text-xs uppercase tracking-widest shadow-sm">{error}</div>}

            <form onSubmit={handlePayment} className="space-y-6">
              {savedCards.length > 0 && (
                <div className="mb-6">
                  <label className="block text-[10px] font-black text-smart-dark dark:text-white mb-3 uppercase tracking-[0.2em]">Stored Protocols</label>
                  <select className="w-full px-5 py-4 rounded-2xl border-2 border-smart-light/10 bg-smart-bg dark:bg-gray-700 font-black text-xs text-smart-dark dark:text-white focus:ring-4 focus:ring-smart-light/10 outline-none transition-all" value={selectedSavedCard} onChange={(e) => { setSelectedSavedCard(e.target.value); setUseSavedCard(e.target.value !== ''); }}>
                    <option value="">-- NEW CARD PROTOCOL --</option>
                    {savedCards.map((c) => <option key={c._id} value={c._id}>•••• •••• •••• {c.last4Digits}</option>)}
                  </select>
                </div>
              )}

              {paymentMethod === 'credit_card' && !useSavedCard && (
                <div className="space-y-6">
                  <div>
                    <label className="block text-[10px] font-black text-smart-dark dark:text-white mb-3 uppercase tracking-[0.2em]">Hash Number</label>
                    <input type="text" value={cardNumber} onChange={handleCardNumberChange} className="w-full px-5 py-4 rounded-2xl border-2 border-smart-light/10 bg-smart-bg dark:bg-gray-900 text-smart-dark dark:text-white font-mono text-lg font-black focus:ring-4 outline-none tracking-widest" placeholder="0000 0000 0000 0000" required />
                  </div>
                  <div className="grid grid-cols-2 gap-6">
                    <div><label className="block text-[10px] font-black text-smart-dark dark:text-white mb-3 uppercase tracking-[0.2em]">Temporal Node</label><input type="text" value={expiry} onChange={handleExpiryChange} className="w-full px-5 py-4 rounded-2xl border-2 border-smart-light/10 bg-smart-bg dark:bg-gray-900 text-center font-mono text-lg font-black focus:ring-4 outline-none" placeholder="MM/YY" required /></div>
                    <div><label className="block text-[10px] font-black text-smart-dark dark:text-white mb-3 uppercase tracking-[0.2em]">Security Key</label><input type="password" value={cvv} onChange={handleCvvChange} className="w-full px-5 py-4 rounded-2xl border-2 border-smart-light/10 bg-smart-bg dark:bg-gray-900 text-center font-mono text-lg font-black focus:ring-4 outline-none tracking-[0.5em]" placeholder="•••" required /></div>
                  </div>
                  <label className="flex items-center gap-3 p-4 bg-smart-bg dark:bg-gray-900/50 rounded-2xl cursor-pointer hover:bg-smart-bg/80 transition-colors">
                    <input type="checkbox" checked={saveCard} onChange={(e) => setSaveCard(e.target.checked)} className="w-5 h-5 text-smart-light border-smart-light rounded focus:ring-smart-light" />
                    <span className="text-[10px] font-black text-smart-gray dark:text-gray-400 uppercase tracking-widest">Archive protocol for high-speed retrieval</span>
                  </label>
                </div>
              )}

              {paymentMethod === 'CASH' && (
                <div className="py-12 text-center border-4 border-dashed border-smart-light/20 rounded-[40px] bg-smart-bg dark:bg-gray-900/50 flex flex-col items-center gap-4">
                  <div className="w-16 h-16 bg-smart-light/10 rounded-full flex items-center justify-center text-smart-light"><svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" /></svg></div>
                  <h3 className="text-lg font-black text-smart-dark dark:text-white uppercase italic">Offline Liquidity Activation</h3>
                  <p className="text-[10px] text-smart-gray dark:text-gray-400 font-bold uppercase tracking-widest max-w-[200px]">Execute reservation now and finalize physical handshake at gate terminal.</p>
                </div>
              )}

              {['valu', 'klivvr'].includes(paymentMethod) && (
                 <div className="py-12 text-center border-4 border-dashed border-smart-light/20 rounded-[40px] bg-smart-bg dark:bg-gray-900/50 flex flex-col items-center gap-4">
                   <div className="w-16 h-16 bg-blue-500/10 rounded-full flex items-center justify-center text-blue-500"><svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg></div>
                   <h3 className="text-lg font-black text-smart-dark dark:text-white uppercase italic">{paymentMethod.toUpperCase()} Relay Link</h3>
                   <p className="text-[10px] text-smart-gray dark:text-gray-400 font-bold uppercase tracking-widest max-w-[200px]">You will be redirected to the {paymentMethod} protocol to authorize this session.</p>
                 </div>
              )}

              <button type="submit" disabled={isProcessing} className={`w-full py-6 rounded-[30px] font-black uppercase tracking-[0.3em] text-xs shadow-2xl transition-all flex items-center justify-center gap-4 ${isProcessing ? 'bg-gray-500 opacity-50' : 'bg-smart-light hover:bg-smart-dark text-white hover:-translate-y-1 active:scale-95'}`}>
                {isProcessing ? 'SYNCHRONIZING...' : <><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg> Execute Authorization</>}
              </button>
            </form>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Payment;
