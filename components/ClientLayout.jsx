'use client';

import React from 'react';
import { usePathname } from 'next/navigation';
import Navbar from './Navbar';
import CloudBackground from './CloudBackground';
import { socket } from '../socket';

export default function ClientLayout({ children }) {
  const pathname = usePathname();
  const isAdminRoute = pathname?.startsWith('/admin');

  React.useEffect(() => {
    // 1. Listen for account restriction (Instant Kick)
    const handleAccountRestricted = (data) => {
      if (!data) return;
      const localUserId = localStorage.getItem('userId'); 
      if (localUserId === data.userId) {
        localStorage.removeItem('token');
        localStorage.removeItem('role');
        localStorage.removeItem('userId');
        localStorage.removeItem('adminEmail');
        window.location.href = `/login?restrictionReason=${encodeURIComponent(data.message)}`;
      }
    };

    socket.on('accountRestricted', handleAccountRestricted);

    return () => {
      socket.off('accountRestricted', handleAccountRestricted);
    };
  }, []);

  React.useEffect(() => {
    try {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } catch (error) {
      console.warn('Local storage restricted: could not save theme');
    }
  }, []);

  return (
    <div className="min-h-screen bg-[#020617] text-gray-100 font-sans flex flex-col transition-colors duration-500 relative">
      <CloudBackground />
      <div className="relative z-10 flex flex-col min-h-screen">
        <Navbar />
        <main className="flex-grow w-full flex flex-col">
          {children}
        </main>
      </div>
    </div>
  );
}
