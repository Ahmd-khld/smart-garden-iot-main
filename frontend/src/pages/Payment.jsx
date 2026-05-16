import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom';

const Payment = () => {
  const location = useLocation();
  const navigate = useNavigate();
  
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

  const state = location.state;

  useEffect(() => {
    if (!state || !state.tickets) {
      navigate('/book');
    }
  }, [state, navigate]);

  useEffect(() => {
    const fetchProfile = async () => {
      const token = localStorage.getItem('token');
      if (token) {
        try {
          const res = await fetch('http://localhost:5000/api/users/profile', {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          if (res.ok) {
            const data = await res.json();
            if (data.savedCards && data.savedCards.length > 0) {
              setSavedCards(data.savedCards);
            }
          }
        } catch (e) {
          console.error('Failed to fetch saved cards');
        }
      }
    };
    fetchProfile();
  }, []);

  if (!state) return null;

  const { tickets, subscriptionType, totalPrice, selectedDate } = state;

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

  const getPaymentErrorMessage = (data) => {
    return data?.message || data?.error || data?.details || 'Payment failed. Please try again.';
  };

  const handleValidatePromo = async () => {
    if (!promoCodeInput) return;
    setPromoLoading(true);
    setPromoError('');
    const token = localStorage.getItem('token');
    
    try {
      const res = await fetch('http://localhost:5000/api/promo/validate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ code: promoCodeInput })
      });
      const data = await res.json();
      
      if (res.ok) {
        setPromoDiscount(data.discount);
        setIsPromoValid(true);
      } else {
        setPromoError(data.message || 'Invalid promo code');
        setIsPromoValid(false);
      }
    } catch (err) {
      setPromoError('Validation failed');
    } finally {
      setPromoLoading(false);
    }
  };

  const discountedPrice = totalPrice - (totalPrice * (promoDiscount / 100));

  const handlePayment = async (e) => {
    e.preventDefault();
    setIsProcessing(true);
    setError('');

    if (paymentMethod === 'credit_card' && !useSavedCard && cardNumber.length < 19) {
      setError('Please enter a valid 16-digit card number.');
      setIsProcessing(false);
      return;
    }

    if (subscriptionType === 'one-time' && !selectedDate) {
      setError('Please go back and select a visit date before paying.');
      setIsProcessing(false);
      return;
    }

    const token = localStorage.getItem('token');
    if (!token) {
      setError('You are not authenticated.');
      setIsProcessing(false);
      return;
    }

    try {
      const response = await fetch('http://localhost:5000/api/tickets/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ 
            quantities: tickets, 
            selectedDate,
            subscriptionPlan: subscriptionType, 
            useSavedCard,
            savedCardId: useSavedCard ? selectedSavedCard : undefined,
            // Keep remaining legacy fields to not break manual card checkouts
            totalPrice,
            saveCard,
            paymentMethod,
            cardNumber: useSavedCard ? undefined : cardNumber.replace(/\s+/g, ''),
            expiry: useSavedCard ? undefined : expiry,
            cvv: useSavedCard ? undefined : cvv,
            promoCode: isPromoValid ? promoCodeInput : undefined
        })
      });

      const data = await response.json();

      if (response.ok || response.status === 201 || response.status === 200) {
        if (data && data.tickets) {
          setGeneratedTickets(data.tickets);
        }
        setSuccess(true);
      } else {
        setError(getPaymentErrorMessage(data));
      }
    } catch (err) {
      setError('Server error during payment processing.');
    } finally {
      setIsProcessing(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen bg-smart-bg dark:bg-black flex items-center justify-center p-6 transition-colors duration-300">
        <div className="bg-white dark:bg-gray-800 p-12 rounded-[40px] shadow-2xl border-t-8 border-smart-light text-center max-w-xl w-full border border-smart-light/30 dark:border-smart-light/10 transform transition-all animate-fade-in">
          <div className="w-24 h-24 bg-smart-light/20 rounded-full flex items-center justify-center mx-auto mb-8 shadow-inner">
            <svg className="w-12 h-12 text-smart-light" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"></path></svg>
          </div>
          
          <h2 className="text-4xl md:text-5xl font-black text-smart-dark dark:text-smart-glow mb-6 tracking-tighter italic uppercase">
            🎉 Payment Successful!
          </h2>
          
          <p className="text-xl md:text-2xl text-smart-gray dark:text-gray-300 mb-10 font-bold leading-relaxed max-w-md mx-auto">
            Thank you! You will receive your tickets via email shortly.
          </p>

          <div className="bg-smart-bg dark:bg-gray-900 p-6 rounded-3xl border border-smart-light/10 mb-10">
            <p className="text-sm text-smart-gray dark:text-gray-400 font-medium">
              You can also find all your active tickets and QR codes anytime in your <strong className="text-smart-dark dark:text-white">Profile History</strong>.
            </p>
          </div>

          <button 
            onClick={() => navigate('/profile')}
            className="block bg-smart-light hover:bg-smart-dark text-white font-black py-5 px-10 rounded-2xl transition-all shadow-xl hover:shadow-2xl transform hover:-translate-y-1 w-full uppercase tracking-widest text-sm"
          >
            Go to Profile History
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-smart-bg dark:bg-black flex flex-col transition-colors duration-300">
      <main className="flex-grow max-w-6xl mx-auto px-6 py-12 w-full flex items-center justify-center">
        <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col lg:flex-row w-full border border-smart-light/30 dark:border-smart-light/10">
          
          {/* Order Summary (Left) */}
          <div className="bg-smart-dark p-10 text-white flex-1 flex flex-col">
            <h2 className="text-3xl font-extrabold mb-8 flex items-center text-smart-glow italic">
              <svg className="w-8 h-8 mr-3 text-smart-glow" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"></path></svg>
              Order Summary
            </h2>
            
            <div className="flex-grow">
              <div className="space-y-4 mb-8">
                {tickets.child > 0 && (
                  <div className="flex justify-between items-center bg-black/20 p-4 rounded-xl border border-white/10">
                    <span className="font-medium text-lg">{tickets.child}x Child Ticket</span>
                    <span className="text-smart-glow font-bold">{tickets.child * 100} EGP</span>
                  </div>
                )}
                {tickets.adult > 0 && (
                  <div className="flex justify-between items-center bg-black/20 p-4 rounded-xl border border-white/10">
                    <span className="font-medium text-lg">{tickets.adult}x Adult Ticket</span>
                    <span className="text-smart-glow font-bold">{tickets.adult * 200} EGP</span>
                  </div>
                )}
                {tickets.senior > 0 && (
                  <div className="flex justify-between items-center bg-black/20 p-4 rounded-xl border border-white/10">
                    <span className="font-medium text-lg">{tickets.senior}x Senior Ticket</span>
                    <span className="text-smart-glow font-bold">{tickets.senior * 150} EGP</span>
                  </div>
                )}
              </div>

              <div className="bg-smart-light/20 border border-smart-light/30 p-4 rounded-xl mb-8">
                <p className="text-sm text-smart-glow uppercase tracking-widest font-bold mb-1">Subscription Plan</p>
                <p className="text-xl font-bold capitalize text-white">{subscriptionType}</p>
              </div>
            </div>

            <div className="border-t border-white/10 pt-6 mt-auto">
              {/* Promo Code Input */}
              <div className="mb-6">
                <label className="block text-xs font-black text-white/50 uppercase tracking-widest mb-2">Have a Reward Code?</label>
                <div className="flex space-x-2">
                  <input 
                    type="text" 
                    placeholder="Enter Promo Code"
                    value={promoCodeInput}
                    onChange={(e) => setPromoCodeInput(e.target.value.toUpperCase())}
                    disabled={isPromoValid}
                    className="flex-grow bg-black/30 border border-white/10 rounded-xl px-4 py-3 text-sm font-bold focus:outline-none focus:border-smart-glow transition-all"
                  />
                  <button 
                    type="button"
                    onClick={handleValidatePromo}
                    disabled={promoLoading || isPromoValid || !promoCodeInput}
                    className={`px-4 py-3 rounded-xl font-black text-xs uppercase tracking-widest transition-all ${isPromoValid ? 'bg-green-500 text-white' : 'bg-smart-glow text-smart-dark hover:scale-105'}`}
                  >
                    {promoLoading ? '...' : isPromoValid ? '✓' : 'Apply'}
                  </button>
                </div>
                {promoError && <p className="text-red-400 text-[10px] font-bold mt-2 uppercase tracking-widest">{promoError}</p>}
                {isPromoValid && <p className="text-green-400 text-[10px] font-bold mt-2 uppercase tracking-widest">Discount Applied: {promoDiscount}% OFF!</p>}
              </div>

              <div className="flex justify-between items-end">
                <span className="text-white/60 uppercase tracking-widest font-bold">Total to Pay</span>
                <div className="text-right">
                  {isPromoValid && (
                    <p className="text-white/40 line-through text-sm font-bold mb-[-4px]">{totalPrice} EGP</p>
                  )}
                  <p className="text-4xl font-black text-smart-glow">
                    {isPromoValid ? Math.round(discountedPrice) : totalPrice} 
                    <span className="text-lg text-white/50 ml-1">EGP</span>
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Payment Interface (Right) */}
          <div className="p-10 flex-1 bg-white dark:bg-gray-800 flex flex-col">
            <div className="mb-8">
              <h2 className="text-3xl font-extrabold text-smart-dark dark:text-white mb-6 italic">Secure Payment</h2>
              
              {/* Payment Tabs */}
              <div className="flex space-x-2 bg-smart-bg dark:bg-gray-700 p-1 rounded-xl border border-smart-light/10">
                {['credit_card', 'valu', 'klivvr'].map((method) => (
                  <button
                    key={method}
                    type="button"
                    onClick={() => setPaymentMethod(method)}
                    className={`flex-1 py-3 px-4 rounded-lg text-sm font-bold transition-all ${
                      paymentMethod === method 
                        ? 'bg-white dark:bg-gray-800 text-smart-dark dark:text-white shadow-sm border border-smart-light/20' 
                        : 'text-smart-gray dark:text-gray-400 hover:text-smart-dark dark:hover:text-white hover:bg-white/50 dark:hover:bg-gray-600'
                    }`}
                  >
                    {method === 'credit_card' && 'Credit Card'}
                    {method === 'valu' && 'Valu (Installments)'}
                    {method === 'klivvr' && 'Klivvr'}
                  </button>
                ))}
              </div>
            </div>

            {error && (
              <div className="mb-6 p-4 bg-red-50 border-l-4 border-red-500 text-red-700 rounded-r-lg font-medium shadow-sm">
                {error}
              </div>
            )}

            <form onSubmit={handlePayment} className="space-y-6 flex-grow flex flex-col">
              
              {savedCards.length > 0 && (
                <div className="mb-4">
                  <label className="block text-sm font-extrabold text-smart-dark dark:text-white mb-2 uppercase tracking-wider">Use a Saved Payment Method</label>
                  <select 
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-600 focus:ring-2 focus:ring-smart-light outline-none font-bold text-smart-dark dark:text-white bg-smart-bg dark:bg-gray-700"
                    value={selectedSavedCard}
                    onChange={(e) => {
                      setSelectedSavedCard(e.target.value);
                      setUseSavedCard(e.target.value !== '');
                    }}
                  >
                    <option value="">-- Enter a new card --</option>
                    {savedCards.map(card => (
                      <option key={card._id} value={card._id}>Card ending in {card.last4Digits}</option>
                    ))}
                  </select>
                </div>
              )}

              {useSavedCard ? (
                <div className="flex-grow flex items-center justify-center p-8 bg-smart-bg dark:bg-gray-700 rounded-xl border-2 border-dashed border-smart-light/20">
                  <div className="text-center">
                    <div className="w-16 h-16 bg-white dark:bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-4 shadow-sm border border-smart-light/10">
                      <svg className="w-8 h-8 text-smart-light" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                    </div>
                    <h3 className="font-extrabold text-smart-dark dark:text-white text-lg mb-2">Using Saved Card</h3>
                    <p className="text-smart-gray dark:text-gray-300 text-sm">You are checking out with your securely saved card ending in {savedCards.find(c => c._id === selectedSavedCard)?.last4Digits}.</p>
                  </div>
                </div>
              ) : paymentMethod === 'credit_card' ? (
                <div className="space-y-6 flex-grow">
                  <div>
                    <label className="block text-sm font-extrabold text-smart-dark dark:text-white mb-2 uppercase tracking-wider">Card Number</label>
                    <div className="relative">
                      <input 
                        type="text" 
                        value={cardNumber}
                        onChange={handleCardNumberChange}
                        className="w-full px-4 py-4 pl-12 rounded-xl border border-gray-200 dark:border-gray-600 focus:ring-2 focus:ring-smart-light focus:border-transparent outline-none transition font-mono text-lg text-smart-dark dark:text-white bg-smart-bg dark:bg-gray-700"
                        placeholder="0000 0000 0000 0000"
                        required
                      />
                      <svg className="w-6 h-6 text-smart-light absolute left-4 top-1/2 transform -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"></path></svg>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-extrabold text-smart-dark dark:text-white mb-2 uppercase tracking-wider">Expiry Date</label>
                      <input 
                        type="text" 
                        value={expiry}
                        onChange={handleExpiryChange}
                        className="w-full px-4 py-4 rounded-xl border border-gray-200 dark:border-gray-600 focus:ring-2 focus:ring-smart-light focus:border-transparent outline-none transition font-mono text-lg text-center text-smart-dark dark:text-white bg-smart-bg dark:bg-gray-700"
                        placeholder="MM/YY"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-extrabold text-smart-dark dark:text-white mb-2 uppercase tracking-wider">CVV</label>
                      <input 
                        type="password" 
                        value={cvv}
                        onChange={handleCvvChange}
                        className="w-full px-4 py-4 rounded-xl border border-gray-200 dark:border-gray-600 focus:ring-2 focus:ring-smart-light focus:border-transparent outline-none transition font-mono text-lg text-center tracking-widest text-smart-dark dark:text-white bg-smart-bg dark:bg-gray-700"
                        placeholder="•••"
                        required
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex-grow flex items-center justify-center p-8 bg-smart-bg dark:bg-gray-700 rounded-xl border-2 border-dashed border-smart-light/20">
                  <div className="text-center">
                    <div className="w-16 h-16 bg-white dark:bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-4 shadow-sm border border-smart-light/10">
                      <svg className="w-8 h-8 text-smart-light" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
                    </div>
                    <h3 className="font-extrabold text-smart-dark dark:text-white text-lg mb-2">You will be redirected</h3>
                    <p className="text-smart-gray dark:text-gray-300 text-sm">You will securely finalize your payment directly on the {paymentMethod === 'valu' ? 'Valu' : 'Klivvr'} app after clicking Pay.</p>
                  </div>
                </div>
              )}

              <div className="mt-auto pt-6 border-t border-smart-light/10">
                {!useSavedCard && paymentMethod === 'credit_card' && (
                  <div className="flex items-center mb-6">
                    <input 
                      type="checkbox" 
                      id="saveCard"
                      checked={saveCard}
                      onChange={(e) => setSaveCard(e.target.checked)}
                      className="w-5 h-5 text-smart-light border-gray-300 dark:border-gray-500 rounded focus:ring-smart-light cursor-pointer"
                    />
                    <label htmlFor="saveCard" className="ml-3 block text-sm font-medium text-smart-gray dark:text-gray-400 cursor-pointer select-none">
                      Save this card securely for future fast checkouts
                    </label>
                  </div>
                )}

                <button 
                  type="submit" 
                  disabled={isProcessing}
                  className={`w-full font-extrabold py-4 text-lg rounded-xl transition-all shadow-xl flex items-center justify-center space-x-2 ${isProcessing ? 'bg-smart-gray cursor-not-allowed text-white' : 'bg-smart-light hover:bg-smart-dark text-white hover:shadow-2xl hover:-translate-y-1'}`}
                >
                  {isProcessing ? (
                    <>
                      <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      <span>Processing...</span>
                    </>
                  ) : (
                    <>
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"></path></svg>
                      <span>Pay & Generate Tickets</span>
                    </>
                  )}
                </button>
              </div>

            </form>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Payment;
