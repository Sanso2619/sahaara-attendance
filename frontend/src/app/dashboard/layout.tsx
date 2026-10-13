'use client';

import React from 'react';
import { AuthProvider, useAuth } from '@/lib/auth-context';
import { Sidebar } from '@/components/navigation/Sidebar';

function DashboardShell({ children }: { children: React.ReactNode }) {
  const { user, loading, logout } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-surface-canvas">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-3 border-brand-700 border-t-transparent rounded-full animate-spin" />
          <p className="text-xs text-gray-500 font-medium">Loading Sahaara workspace...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-surface-canvas">
      {/* Persistent Sidebar */}
      <Sidebar user={user} onLogout={logout} />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        {children}
      </div>
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
