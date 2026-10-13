'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { apiFetch } from '@/lib/api';
import { StatusBadge, Button } from '@/components/ui/components';
import { School, Users, Building2, Calendar, ArrowRight, GraduationCap, ClipboardCheck } from 'lucide-react';

export default function DashboardOverviewPage() {
  const { user } = useAuth();
  const [stats, setStats] = useState({
    schoolCount: 0,
    classroomCount: 0,
    studentCount: 0,
    loading: true,
    error: ''
  });

  useEffect(() => {
    async function loadDashboardStats() {
      try {
        const [schoolsData, classroomsData, studentsData] = await Promise.all([
          apiFetch<{ schools: any[] }>('/api/schools?status=active'),
          apiFetch<{ classrooms: any[] }>('/api/classrooms?status=active'),
          apiFetch<{ students: any[] }>('/api/students?status=active')
        ]);
        setStats({
          schoolCount: schoolsData.schools?.length || 0,
          classroomCount: classroomsData.classrooms?.length || 0,
          studentCount: studentsData.students?.length || 0,
          loading: false,
          error: ''
        });
      } catch (err: any) {
        setStats(prev => ({
          ...prev,
          loading: false,
          error: err.message || 'Failed to load live statistics'
        }));
      }
    }

    if (user) {
      loadDashboardStats();
    }
  }, [user]);

  return (
    <main className="p-6 sm:p-8 flex-1 max-w-7xl">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-6 border-b border-gray-200 gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Organization Overview</h1>
            <StatusBadge status="ACTIVE" label="System Live" />
          </div>
          <p className="text-sm text-gray-500 mt-1">
            {user?.role === 'PLATFORM_ADMIN' ? (
              'Platform-wide administration & multi-NGO monitoring'
            ) : (
              <>Managing workspace for <span className="font-semibold text-gray-800">{user?.organization?.name || 'Assigned Organization'}</span></>
            )}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" className="gap-2">
            <Calendar className="w-4 h-4 text-gray-500" />
            {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
          </Button>
          {user?.role === 'PLATFORM_ADMIN' && (
            <Link href="/dashboard/organizations">
              <Button size="sm" className="gap-2">
                <Building2 className="w-4 h-4" />
                Manage Organizations
              </Button>
            </Link>
          )}
        </div>
      </div>

      {stats.error && (
        <div className="mt-6 p-4 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-800">
          Note: {stats.error}. Please ensure backend services and database are connected.
        </div>
      )}

      {/* Metrics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mt-6">
        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Schools / Centres</span>
              <div className="p-2 bg-brand-50 rounded-lg text-brand-700">
                <School className="w-5 h-5" />
              </div>
            </div>
            <p className="text-3xl font-extrabold text-gray-900 mt-3">
              {stats.loading ? '...' : stats.schoolCount}
            </p>
            <p className="text-xs text-gray-500 mt-1">Active learning centres in organization</p>
          </div>
          <div className="mt-4 pt-4 border-t border-gray-100">
            <Link href="/dashboard/schools" className="text-xs font-semibold text-brand-700 hover:text-brand-800 flex items-center gap-1">
              View all schools <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Classrooms</span>
              <div className="p-2 bg-brand-50 rounded-lg text-brand-700">
                <Users className="w-5 h-5" />
              </div>
            </div>
            <p className="text-3xl font-extrabold text-gray-900 mt-3">
              {stats.loading ? '...' : stats.classroomCount}
            </p>
            <p className="text-xs text-gray-500 mt-1">Active classroom cohorts & batches</p>
          </div>
          <div className="mt-4 pt-4 border-t border-gray-100">
            <Link href="/dashboard/classrooms" className="text-xs font-semibold text-brand-700 hover:text-brand-800 flex items-center gap-1">
              View all classrooms <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Total Enrolled</span>
              <div className="p-2 bg-brand-50 rounded-lg text-brand-700">
                <GraduationCap className="w-5 h-5" />
              </div>
            </div>
            <p className="text-3xl font-extrabold text-gray-900 mt-3">
              {stats.loading ? '...' : stats.studentCount}
            </p>
            <p className="text-xs text-gray-500 mt-1">Active registered children</p>
          </div>
          <div className="mt-4 pt-4 border-t border-gray-100">
            <Link href="/dashboard/students" className="text-xs font-semibold text-brand-700 hover:text-brand-800 flex items-center gap-1">
              Manage students <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Tenant Isolation</span>
              <div className="p-2 bg-emerald-50 rounded-lg text-emerald-700">
                <Building2 className="w-5 h-5" />
              </div>
            </div>
            <div className="mt-3">
              <p className="text-sm font-bold text-gray-900 truncate">
                {user?.organization?.name || 'Platform Administrator'}
              </p>
              <p className="text-xs text-gray-500 font-mono mt-0.5 truncate">
                ID: {user?.organization?.id || 'GLOBAL_TENANT'}
              </p>
            </div>
          </div>
          <div className="mt-4 pt-4 border-t border-gray-100 flex items-center justify-between text-xs text-emerald-700 font-medium">
            <span>Isolation Enforced</span>
            <span className="inline-block w-2 h-2 rounded-full bg-emerald-600 animate-pulse" />
          </div>
        </div>
      </div>

      {/* Quick Access Actions */}
      <div className="mt-8 bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
        <h2 className="text-base font-bold text-gray-900 mb-4">Core Management Quick Actions</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          <Link
            href="/dashboard/schools"
            className="p-4 rounded-lg border border-gray-200 hover:border-brand-700 hover:bg-brand-50/30 transition-colors group flex items-start gap-3"
          >
            <div className="p-2 bg-brand-100 rounded-lg text-brand-800 group-hover:bg-brand-700 group-hover:text-white transition-colors">
              <School className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900 group-hover:text-brand-800">Schools & Centres</p>
              <p className="text-xs text-gray-500 mt-0.5">Manage learning centres & codes</p>
            </div>
          </Link>

          <Link
            href="/dashboard/classrooms"
            className="p-4 rounded-lg border border-gray-200 hover:border-brand-700 hover:bg-brand-50/30 transition-colors group flex items-start gap-3"
          >
            <div className="p-2 bg-brand-100 rounded-lg text-brand-800 group-hover:bg-brand-700 group-hover:text-white transition-colors">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900 group-hover:text-brand-800">Classrooms</p>
              <p className="text-xs text-gray-500 mt-0.5">Configure cohorts & teacher assignments</p>
            </div>
          </Link>

          <Link
            href="/dashboard/attendance"
            className="p-4 rounded-lg border border-gray-200 hover:border-brand-700 hover:bg-brand-50/30 transition-colors group flex items-start gap-3"
          >
            <div className="p-2 bg-brand-100 rounded-lg text-brand-800 group-hover:bg-brand-700 group-hover:text-white transition-colors">
              <ClipboardCheck className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900 group-hover:text-brand-800">Daily Attendance</p>
              <p className="text-xs text-gray-500 mt-0.5">Take register, review draft & view daily percentages</p>
            </div>
          </Link>
        </div>
      </div>
    </main>
  );
}
