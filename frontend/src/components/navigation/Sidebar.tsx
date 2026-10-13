'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Building2, School, Users, ClipboardCheck, BarChart3, LogOut, Shield, GraduationCap } from 'lucide-react';
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
}

export function Sidebar({ user, onLogout }: SidebarProps) {
  const pathname = usePathname();

  const getNavLinks = () => {
    if (!user) return [];

    if (user.role === 'PLATFORM_ADMIN') {
      return [
        { label: 'Organizations', href: '/dashboard/organizations', icon: Building2 },
        { label: 'Attendance', href: '/dashboard/attendance', icon: ClipboardCheck },
        { label: 'Reports & Analytics', href: '/dashboard/reports', icon: BarChart3 },
        { label: 'Students', href: '/dashboard/students', icon: GraduationCap },
        { label: 'System Audit', href: '/dashboard/audit', icon: Shield },
      ];
    }

    if (user.role === 'ORG_ADMIN') {
      return [
        { label: 'Overview', href: '/dashboard', icon: BarChart3 },
        { label: 'Daily Attendance', href: '/dashboard/attendance', icon: ClipboardCheck },
        { label: 'Reports & Analytics', href: '/dashboard/reports', icon: BarChart3 },
        { label: 'Schools', href: '/dashboard/schools', icon: School },
        { label: 'Classrooms & Teachers', href: '/dashboard/classrooms', icon: Users },
        { label: 'Students & Enrolment', href: '/dashboard/students', icon: GraduationCap },
      ];
    }

    // TEACHER
    return [
      { label: 'Daily Attendance', href: '/dashboard/attendance', icon: ClipboardCheck },
      { label: 'Reports & History', href: '/dashboard/reports', icon: BarChart3 },
      { label: 'My Classrooms', href: '/dashboard', icon: School },
      { label: 'Class Roster', href: '/dashboard/students', icon: GraduationCap },
    ];
  };

  const navLinks = getNavLinks();

  return (
    <aside className="w-64 bg-surface-sidebar text-white flex flex-col h-screen sticky top-0 border-r border-gray-800">
      {/* Brand Header */}
      <div className="p-5 border-b border-gray-800 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
            <span className="bg-brand-600 text-white p-1.5 rounded-lg text-sm">SA</span>
            Sahaara
          </h1>
          <p className="text-xs text-gray-400 mt-0.5">Attendance Management</p>
        </div>
      </div>

      {/* Tenant Context Badge */}
      {user?.organization && (
        <div className="mx-4 mt-4 p-3 bg-brand-800/60 rounded-lg border border-brand-700/50">
          <p className="text-xs font-medium text-brand-300 uppercase tracking-wider">Organization</p>
          <p className="text-sm font-semibold text-white truncate mt-0.5">{user.organization.name}</p>
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {navLinks.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-brand-700 text-white'
                  : 'text-gray-300 hover:bg-brand-900/50 hover:text-white'
              }`}
            >
              <Icon className="w-4 h-4 text-brand-400" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* User Profile & Logout Footer */}
      <div className="p-4 border-t border-gray-800 bg-brand-900/40">
        <div className="flex items-center justify-between">
          <div className="truncate">
            <p className="text-sm font-medium text-white truncate">{user?.fullName || 'User Session'}</p>
            <p className="text-xs text-gray-400 truncate">{user?.role?.replace('_', ' ') || 'Guest'}</p>
          </div>
          {onLogout && (
            <Button
              variant="outline"
              size="sm"
              onClick={onLogout}
              className="bg-transparent border-gray-700 text-gray-300 hover:bg-gray-800 hover:text-white p-2"
              title="Log out"
            >
              <LogOut className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>
    </aside>
  );
}
