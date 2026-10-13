'use client';

import React from 'react';
import { Sidebar } from '@/components/navigation/Sidebar';
import { StatusBadge, Button } from '@/components/ui/components';
import { School, Users, CheckCircle2, Calendar } from 'lucide-react';

export default function DashboardPage() {
  // Demo mock context for Phase 1 visual foundation review
  const demoUser = {
    id: 'usr-1',
    fullName: 'Ananya Sharma',
    email: 'admin@hope-edu.org',
    role: 'ORG_ADMIN' as const,
    organization: {
      id: 'org-1',
      name: 'Hope Community Education Centre',
      slug: 'hope-community'
    }
  };

  return (
    <div className="flex min-h-screen bg-surface-canvas">
      {/* Persistent Sidebar */}
      <Sidebar user={demoUser} onLogout={() => alert('Logged out')} />

      {/* Main Content Area */}
      <main className="flex-1 p-8 overflow-y-auto">
        {/* Top Header */}
        <div className="flex items-center justify-between pb-6 border-b border-gray-200">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Organization Dashboard</h1>
            <p className="text-sm text-gray-500 mt-1">
              Real-time attendance overview for <span className="font-semibold text-gray-700">{demoUser.organization.name}</span>
            </p>
          </div>
          <div className="flex items-center gap-3">
            <StatusBadge status="ACTIVE" label="System Online" />
            <Button variant="outline" size="sm" className="gap-2">
              <Calendar className="w-4 h-4 text-gray-500" />
              {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            </Button>
          </div>
        </div>

        {/* Phase 1 Metric Cards Preview */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-8">
          <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Total Schools</span>
              <School className="w-5 h-5 text-brand-700" />
            </div>
            <p className="text-3xl font-extrabold text-gray-900 mt-3">4</p>
            <p className="text-xs text-gray-500 mt-1">Learning centres active</p>
          </div>

          <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Active Classrooms</span>
              <Users className="w-5 h-5 text-brand-700" />
            </div>
            <p className="text-3xl font-extrabold text-gray-900 mt-3">18</p>
            <p className="text-xs text-gray-500 mt-1">Classroom sections</p>
          </div>

          <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Today's Attendance</span>
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
            </div>
            <p className="text-3xl font-extrabold text-gray-900 mt-3">94.2%</p>
            <p className="text-xs text-emerald-600 font-medium mt-1">↑ 1.4% vs last week</p>
          </div>
        </div>

        {/* Status Indicators & Component Showcase Card */}
        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm mt-8">
          <h2 className="text-lg font-bold text-gray-900 mb-4">Design Tokens & Attendance Status Indicators</h2>
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg border border-gray-200">
              <span className="text-sm font-medium text-gray-700">Present Status:</span>
              <StatusBadge status="PRESENT" />
            </div>
            <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg border border-gray-200">
              <span className="text-sm font-medium text-gray-700">Absent Status:</span>
              <StatusBadge status="ABSENT" />
            </div>
            <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg border border-gray-200">
              <span className="text-sm font-medium text-gray-700">Late Status:</span>
              <StatusBadge status="LATE" />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
