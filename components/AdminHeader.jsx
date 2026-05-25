import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

const AdminHeader = ({
  title = 'Admin Control Panel',
  subtitle = 'Smart Park Ecosystem',
  icon,
  showBackButton = false,
  unreadAlertsCount = 0,
  unreadAuditCount = 0,
  unreadBannedCount = 0,
  userName,
  onAlertsClick,
  onAuditClick,
  onBannedClick,
  onLogout,
}) => {
  const router = useRouter();

  // Safety check for logout transitions
  useEffect(() => {
    if (!localStorage.getItem('token')) {
      router.push('/');
    }
  }, [router]);

  // Automatically apply dark mode if previously selected or if system prefers dark
  useEffect(() => {
    const storedTheme = localStorage.getItem('theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const hasDarkClass = document.documentElement.classList.contains('dark');

    if (storedTheme === 'dark' || (!storedTheme && prefersDark) || hasDarkClass) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, []);

  return (
    <header className="bg-black text-white shadow-2xl z-20 border-b border-[#80C241]/20 sticky top-0">
      <div className="max-w-[1600px] mx-auto py-4 px-8 flex justify-between items-center">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-[#80C241] rounded-xl flex items-center justify-center shadow-[0_0_20px_rgba(128,194,65,0.4)]">
            <svg className="w-8 h-8 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 11c0 3.517-1.009 6.799-2.753 9.571m-3.44-2.04l.054-.09A13.916 13.916 0 008 11a4 4 0 118 0c0 1.017-.071 2.019-.203 3m-2.118 6.844A21.88 21.88 0 0015.171 17m3.839 1.132c.645-2.266.99-4.659.99-7.132A8 8 0 008 4.07M3 15.364c.64-1.319 1-2.8 1-4.364 0-1.457.39-2.823 1.07-4"></path>
            </svg>
          </div>
          <div>
            <h1 className="text-2xl font-black italic tracking-tighter uppercase leading-none">Admin Control Panel</h1>
            <p className="text-[9px] font-black text-[#80C241] uppercase tracking-[0.3em] mt-1">Smart Park Ecosystem (Super Admin)</p>
          </div>
        </div>

        <div className="flex items-center gap-6">
          <div className="flex flex-col items-end pr-6 border-r border-white/10">
            <span className="text-[9px] font-black text-[#80C241] uppercase tracking-widest">Logged In As</span>
            <span className="text-xs font-bold text-white/90 lowercase">{userName}</span>
          </div>

          <div className="flex items-center gap-4 text-[#80C241]">
            <svg className="w-5 h-5 hover:text-white transition-colors cursor-pointer drop-shadow-[0_0_5px_rgba(128,194,65,0.5)]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
            <svg className="w-5 h-5 hover:text-white transition-colors cursor-pointer drop-shadow-[0_0_5px_rgba(128,194,65,0.5)]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"></path></svg>
            <svg className="w-5 h-5 hover:text-white transition-colors cursor-pointer drop-shadow-[0_0_5px_rgba(128,194,65,0.5)]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
          </div>

          <button onClick={onLogout} className="bg-red-600 hover:bg-white hover:text-red-600 px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-lg active:scale-95 border border-red-600">
            Secure Logout
          </button>
        </div>
      </div>
    </header>

  );
};

export default AdminHeader;
