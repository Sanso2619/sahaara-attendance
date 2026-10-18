'use client';

import React, { useState } from 'react';
import { AuthProvider, useAuth } from '@/lib/auth-context';
import { Sidebar } from '@/components/navigation/Sidebar';
import { Menu } from 'lucide-react';

function DashboardShell({ children }: { children: React.ReactNode }) {
  const { user, loading, logout } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-surface-canvas" role="status">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-3 border-brand-700 border-t-transparent rounded-full animate-spin" aria-hidden="true" />
          <p className="text-xs text-gray-500 font-medium">Loading Sahaara workspace...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col md:flex-row min-h-screen bg-surface-canvas">
      {/* Mobile Header Bar */}
      <header className="md:hidden flex items-center justify-between px-4 py-3 bg-surface-sidebar text-white border-b border-gray-800 sticky top-0 z-20">
        <button
          onClick={() => setMobileMenuOpen(true)}
          className="p-2 rounded-lg text-gray-300 hover:text-white hover:bg-gray-800/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
          aria-label="Open navigation menu"
          aria-expanded={mobileMenuOpen}
        >
          <Menu className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2">
          <span className="bg-brand-600 text-white px-2 py-0.5 rounded-md text-xs font-black" aria-hidden="true">SA</span>
          <span className="text-sm font-bold tracking-tight">Sahaara</span>
        </div>

        <div className="text-right">
          <p className="text-xs font-medium text-gray-300 truncate max-w-[120px]">{user?.fullName || 'User'}</p>
        </div>
      </header>

      {/* Persistent & Responsive Sidebar */}
      <Sidebar
        user={user}
        onLogout={logout}
        isOpen={mobileMenuOpen}
        onClose={() => setMobileMenuOpen(false)}
      />

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <DashboardShell>{children}</DashboardShell>
    </AuthProvider>
  );
}
