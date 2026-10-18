'use client';

import React, { useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Building2,
  School,
  Users,
  ClipboardCheck,
  BarChart3,
  LogOut,
  Shield,
  GraduationCap,
  Bell,
  X
} from 'lucide-react';
import { Button } from '../ui/components';

export interface UserSession {
  id: string;
  fullName: string;
  email: string;
  role: 'PLATFORM_ADMIN' | 'ORG_ADMIN' | 'TEACHER';
  organization?: {
    id: string;
    name: string;
    slug: string;
  } | null;
}

interface SidebarProps {
  user?: UserSession | null;
  onLogout?: () => void;
  isOpen?: boolean;
  onClose?: () => void;
}

export function Sidebar({ user, onLogout, isOpen = false, onClose }: SidebarProps) {
  const pathname = usePathname();

  // Close mobile drawer on route change or ESC
  useEffect(() => {
    if (onClose) onClose();
  }, [pathname]);

  useEffect(() => {
    if (!isOpen || !onClose) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const getNavLinks = () => {
    if (!user) return [];

    if (user.role === 'PLATFORM_ADMIN') {
      return [
        { label: 'Organizations', href: '/dashboard/organizations', icon: Building2 },
        { label: 'Attendance', href: '/dashboard/attendance', icon: ClipboardCheck },
        { label: 'Reports & Analytics', href: '/dashboard/reports', icon: BarChart3 },
        { label: 'Notifications', href: '/dashboard/notifications', icon: Bell },
        { label: 'Students', href: '/dashboard/students', icon: GraduationCap },
        { label: 'Security & Audit', href: '/dashboard/audit', icon: Shield },
      ];
    }

    if (user.role === 'ORG_ADMIN') {
      return [
        { label: 'Overview', href: '/dashboard', icon: BarChart3 },
        { label: 'Daily Attendance', href: '/dashboard/attendance', icon: ClipboardCheck },
        { label: 'Reports & Analytics', href: '/dashboard/reports', icon: BarChart3 },
        { label: 'Notifications & Follow-ups', href: '/dashboard/notifications', icon: Bell },
        { label: 'Schools', href: '/dashboard/schools', icon: School },
        { label: 'Classrooms & Teachers', href: '/dashboard/classrooms', icon: Users },
        { label: 'Students & Enrolment', href: '/dashboard/students', icon: GraduationCap },
        { label: 'Security & Audit', href: '/dashboard/audit', icon: Shield },
      ];
    }

    // TEACHER
    return [
      { label: 'Daily Attendance', href: '/dashboard/attendance', icon: ClipboardCheck },
      { label: 'Reports & History', href: '/dashboard/reports', icon: BarChart3 },
      { label: 'Follow-up Status', href: '/dashboard/notifications', icon: Bell },
      { label: 'My Classrooms', href: '/dashboard', icon: School },
      { label: 'Class Roster', href: '/dashboard/students', icon: GraduationCap },
    ];
  };

  const navLinks = getNavLinks();

  const sidebarContent = (
    <aside className="w-64 bg-surface-sidebar text-white flex flex-col h-full border-r border-gray-800 select-none">
      {/* Brand Header */}
      <div className="p-5 border-b border-gray-800 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
            <span className="bg-brand-600 text-white p-1.5 rounded-lg text-sm font-black" aria-hidden="true">SA</span>
            Sahaara
          </h1>
          <p className="text-xs text-gray-400 mt-0.5">Attendance Management</p>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="md:hidden text-gray-400 hover:text-white p-1.5 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
            aria-label="Close navigation menu"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Tenant Context Badge */}
      {user?.organization && (
        <div className="mx-4 mt-4 p-3 bg-brand-800/60 rounded-xl border border-brand-700/50">
          <p className="text-[10px] font-bold text-brand-300 uppercase tracking-wider">Organization</p>
          <p className="text-xs font-semibold text-white truncate mt-0.5">{user.organization.name}</p>
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto" aria-label="Main Navigation">
        {navLinks.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive ? 'page' : undefined}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 ${
                isActive
                  ? 'bg-brand-700 text-white font-semibold shadow-sm'
                  : 'text-gray-300 hover:bg-brand-900/60 hover:text-white'
              }`}
            >
              <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-white' : 'text-brand-400'}`} aria-hidden="true" />
              <span className="truncate">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* User Profile & Logout Footer */}
      <div className="p-4 border-t border-gray-800 bg-brand-900/40">
        <div className="flex items-center justify-between gap-2">
          <div className="truncate">
            <p className="text-sm font-semibold text-white truncate">{user?.fullName || 'User Session'}</p>
            <p className="text-[11px] text-gray-400 truncate">{user?.role?.replace('_', ' ') || 'Guest'}</p>
          </div>
          {onLogout && (
            <Button
              variant="outline"
              size="sm"
              onClick={onLogout}
              className="bg-transparent border-gray-700 text-gray-300 hover:bg-gray-800 hover:text-white p-2 min-h-[36px]"
              aria-label="Log out"
              title="Log out"
            >
              <LogOut className="w-4 h-4" aria-hidden="true" />
            </Button>
          )}
        </div>
      </div>
    </aside>
  );

  return (
    <>
      {/* Desktop Sticky Sidebar */}
      <div className="hidden md:flex h-screen sticky top-0 shrink-0 z-30">
        {sidebarContent}
      </div>

      {/* Mobile Drawer Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 md:hidden transition-opacity"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* Mobile Drawer */}
      <div
        className={`fixed inset-y-0 left-0 z-50 transform md:hidden transition-transform duration-200 ease-in-out ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {sidebarContent}
      </div>
    </>
  );
}
