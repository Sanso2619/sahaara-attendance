'use client';

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { apiFetch } from '@/lib/api';
import { Button } from '@/components/ui/components';
import { useLiveDashboard, SocketConnectionStatus } from '@/lib/use-socket';
import {
  School,
  Users,
  Building2,
  Calendar,
  ArrowRight,
  GraduationCap,
  ClipboardCheck,
  CheckCircle2,
  Clock,
  Radio,
  Wifi,
  WifiOff,
  RefreshCw,
  Bell,
  Activity,
  Percent,
  Check,
  AlertCircle
} from 'lucide-react';

interface AnalyticsSummary {
  totalActiveStudents: number;
  totalSessions: number;
  submittedSessions: number;
  openSessions: number;
  presentCount: number;
  lateCount: number;
  absentCount: number;
  totalMarkedRecords: number;
  overallPercentage: number;
}

interface ClassroomSummaryItem {
  classroomId: string;
  classroomName: string;
  gradeLevel: string;
  schoolName: string;
  totalEnrolled: number;
  totalSessions: number;
  submittedSessions: number;
  openSessions: number;
  presentCount: number;
  lateCount: number;
  absentCount: number;
  attendancePercentage: number;
}

export default function DashboardOverviewPage() {
  const { user } = useAuth();

  const [stats, setStats] = useState({
    schoolCount: 0,
    classroomCount: 0,
    studentCount: 0,
    loading: true,
    refreshing: false,
    error: ''
  });

  const [analytics, setAnalytics] = useState<AnalyticsSummary | null>(null);
  const [classrooms, setClassrooms] = useState<ClassroomSummaryItem[]>([]);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date>(new Date());

  // Data loader - resilient fallback that works whether socket is connected or not
  const loadDashboardData = useCallback(async (isBackground = false) => {
    if (!isBackground) {
      setStats(prev => ({ ...prev, loading: true }));
    } else {
      setStats(prev => ({ ...prev, refreshing: true }));
    }

    try {
      const today = new Date().toISOString().split('T')[0];
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      const [schoolsData, classroomsData, studentsData, reportData] = await Promise.all([
        apiFetch<{ schools: any[] }>('/api/schools?status=active').catch(() => ({ schools: [] })),
        apiFetch<{ classrooms: any[] }>('/api/classrooms?status=active').catch(() => ({ classrooms: [] })),
        apiFetch<{ students: any[] }>('/api/students?status=active').catch(() => ({ students: [] })),
        apiFetch<{
          summary: AnalyticsSummary;
          classroomSummary: ClassroomSummaryItem[];
        }>(`/api/reports/dashboard?startDate=${thirtyDaysAgo}&endDate=${today}`).catch(() => null)
      ]);

      setStats({
        schoolCount: schoolsData.schools?.length || 0,
        classroomCount: classroomsData.classrooms?.length || 0,
        studentCount: studentsData.students?.length || 0,
        loading: false,
        refreshing: false,
        error: ''
      });

      if (reportData) {
        setAnalytics(reportData.summary);
        setClassrooms(reportData.classroomSummary || []);
      }
      setLastRefreshedAt(new Date());
    } catch (err: any) {
      setStats(prev => ({
        ...prev,
        loading: false,
        refreshing: false,
        error: err.message || 'Failed to refresh dashboard data'
      }));
    }
  }, []);

  // Real-time Socket.IO hook
  const { status: socketStatus, activityFeed, refreshNow } = useLiveDashboard({
    onDataRefresh: () => loadDashboardData(true),
    debounceMs: 350
  });

  useEffect(() => {
    if (user) {
      loadDashboardData(false);
    }
  }, [user, loadDashboardData]);

  const renderStatusBadge = (status: SocketConnectionStatus) => {
    switch (status) {
      case 'connected':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <Wifi className="w-3.5 h-3.5" />
            Live Updates
          </span>
        );
      case 'connecting':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
            <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
            Connecting...
          </span>
        );
      case 'reconnecting':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
            <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
            Reconnecting...
          </span>
        );
      case 'disconnected':
      case 'error':
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-600 border border-gray-200" title="Socket disconnected. Data loaded via HTTP fallback.">
            <WifiOff className="w-3.5 h-3.5 text-gray-500" />
            Offline Mode
          </span>
        );
    }
  };

  return (
    <main className="p-6 sm:p-8 flex-1 max-w-7xl space-y-8">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-6 border-b border-gray-200 gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Organization Overview</h1>
            {renderStatusBadge(socketStatus)}
          </div>
          <p className="text-sm text-gray-500 mt-1">
            {user?.role === 'PLATFORM_ADMIN' ? (
              'Platform-wide administration & real-time NGO monitoring'
            ) : (
              <>Managing workspace for <span className="font-semibold text-gray-800">{user?.organization?.name || 'Assigned Organization'}</span></>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => loadDashboardData(true)}
            disabled={stats.refreshing}
            className="text-xs"
            title={`Last refreshed at ${lastRefreshedAt.toLocaleTimeString()}`}
          >
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 text-gray-500 ${stats.refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>

          <Button variant="outline" size="sm" className="text-xs gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-gray-500" />
            {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
          </Button>

          {user?.role === 'PLATFORM_ADMIN' && (
            <Link href="/dashboard/organizations">
              <Button size="sm" className="text-xs gap-1.5">
                <Building2 className="w-3.5 h-3.5" />
                Organizations
              </Button>
            </Link>
          )}
        </div>
      </div>

      {stats.error && (
        <div className="p-4 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
          <span>Note: {stats.error}. Dashboard is displaying cached or fallback values.</span>
        </div>
      )}

      {/* Primary Live KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Overall Attendance Rate */}
        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Attendance Rate</span>
              <div className="p-2 bg-emerald-50 rounded-lg text-emerald-700">
                <Percent className="w-4 h-4" />
              </div>
            </div>
            <p className="text-3xl font-extrabold text-gray-900 mt-2">
              {stats.loading ? '...' : analytics ? `${analytics.overallPercentage}%` : 'N/A'}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              {analytics ? `${analytics.presentCount} present • ${analytics.lateCount} late` : '30-day recorded rate'}
            </p>
          </div>
          <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between text-[11px] text-gray-500">
            <span>(Present + Late) / Total</span>
            <Link href="/dashboard/reports" className="text-brand-700 font-medium hover:underline flex items-center gap-0.5">
              Analytics <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
        </div>

        {/* Sessions & Completion */}
        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Registers Finalized</span>
              <div className="p-2 bg-brand-50 rounded-lg text-brand-700">
                <ClipboardCheck className="w-4 h-4" />
              </div>
            </div>
            <p className="text-3xl font-extrabold text-gray-900 mt-2">
              {stats.loading ? '...' : analytics ? `${analytics.submittedSessions} / ${analytics.totalSessions}` : '0'}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              {analytics && analytics.openSessions > 0 ? (
                <span className="text-amber-600 font-medium">{analytics.openSessions} open drafts pending</span>
              ) : (
                'All registers submitted'
              )}
            </p>
          </div>
          <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between text-[11px] text-gray-500">
            <span>Submitted vs total</span>
            <Link href="/dashboard/attendance" className="text-brand-700 font-medium hover:underline flex items-center gap-0.5">
              Daily Register <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
        </div>

        {/* Total Active Students */}
        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Active Students</span>
              <div className="p-2 bg-brand-50 rounded-lg text-brand-700">
                <GraduationCap className="w-4 h-4" />
              </div>
            </div>
            <p className="text-3xl font-extrabold text-gray-900 mt-2">
              {stats.loading ? '...' : stats.studentCount}
            </p>
            <p className="text-xs text-gray-500 mt-1">Enrolled across active batches</p>
          </div>
          <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between text-[11px] text-gray-500">
            <span>Rosters active</span>
            <Link href="/dashboard/students" className="text-brand-700 font-medium hover:underline flex items-center gap-0.5">
              Roster <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
        </div>

        {/* Classrooms & Centres */}
        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Classrooms & Centres</span>
              <div className="p-2 bg-brand-50 rounded-lg text-brand-700">
                <School className="w-4 h-4" />
              </div>
            </div>
            <p className="text-3xl font-extrabold text-gray-900 mt-2">
              {stats.loading ? '...' : `${stats.classroomCount} / ${stats.schoolCount}`}
            </p>
            <p className="text-xs text-gray-500 mt-1">Cohorts in {stats.schoolCount} centres</p>
          </div>
          <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between text-[11px] text-gray-500">
            <span>Tenant scoped</span>
            <Link href="/dashboard/classrooms" className="text-brand-700 font-medium hover:underline flex items-center gap-0.5">
              Classrooms <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
        </div>
      </div>

      {/* Main Grid: Live Activity Feed + Classroom Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column (2 cols): Classroom Live Attendance Summary */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="p-5 border-b border-gray-100 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                <Users className="w-4 h-4 text-brand-700" />
                Classroom Attendance Overview
              </h2>
              <p className="text-xs text-gray-500 mt-0.5">Real-time cohort register summaries</p>
            </div>
            <Link href="/dashboard/reports" className="text-xs font-semibold text-brand-700 hover:text-brand-800">
              View Detailed Reports &rarr;
            </Link>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-left text-xs">
              <thead className="bg-gray-50 text-gray-500 font-semibold uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-3">Classroom</th>
                  <th className="px-4 py-3">Enrolled</th>
                  <th className="px-4 py-3">Submitted</th>
                  <th className="px-4 py-3">Attendance Rate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-gray-700">
                {stats.loading ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-gray-500">
                      <RefreshCw className="w-4 h-4 animate-spin mx-auto mb-1 text-brand-700" />
                      Loading live cohort registers...
                    </td>
                  </tr>
                ) : classrooms.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-gray-500">
                      No classroom attendance sessions recorded yet.
                    </td>
                  </tr>
                ) : (
                  classrooms.slice(0, 6).map((c) => (
                    <tr key={c.classroomId} className="hover:bg-gray-50/70 transition-colors">
                      <td className="px-4 py-3">
                        <p className="font-semibold text-gray-900">{c.classroomName}</p>
                        <p className="text-[11px] text-gray-400">{c.schoolName}</p>
                      </td>
                      <td className="px-4 py-3">{c.totalEnrolled} students</td>
                      <td className="px-4 py-3">
                        {c.submittedSessions} / {c.totalSessions}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-16 bg-gray-200 rounded-full h-2 overflow-hidden">
                            <div
                              className="bg-brand-700 h-2 rounded-full"
                              style={{ width: `${Math.min(100, c.attendancePercentage || 0)}%` }}
                            />
                          </div>
                          <span className="font-semibold text-gray-900 text-[11px]">
                            {c.attendancePercentage}%
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right Column (1 col): Live Activity Feed */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm flex flex-col">
          <div className="p-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-sm font-bold text-gray-900 flex items-center gap-1.5">
              <Activity className="w-4 h-4 text-brand-700" />
              Real-Time Activity Feed
            </h2>
            <span className="text-[10px] px-2 py-0.5 bg-gray-100 rounded text-gray-600 font-medium">
              Live
            </span>
          </div>

          <div className="p-4 flex-1 overflow-y-auto max-h-[380px] space-y-3">
            {activityFeed.length === 0 ? (
              <div className="py-8 text-center text-gray-400">
                <Radio className="w-6 h-6 mx-auto mb-2 text-gray-300 animate-pulse" />
                <p className="text-xs font-semibold text-gray-600">Waiting for live events</p>
                <p className="text-[11px] text-gray-400 mt-0.5">
                  Attendance submissions and follow-up alerts will appear here in real time.
                </p>
              </div>
            ) : (
              activityFeed.map((event) => {
                let Icon = Activity;
                let iconColor = 'bg-brand-50 text-brand-700';

                if (event.type === 'attendance:submitted') {
                  Icon = CheckCircle2;
                  iconColor = 'bg-emerald-50 text-emerald-700';
                } else if (event.type === 'attendance:updated') {
                  Icon = Clock;
                  iconColor = 'bg-blue-50 text-blue-700';
                } else if (event.type === 'notifications:updated') {
                  Icon = Bell;
                  iconColor = 'bg-purple-50 text-purple-700';
                }

                return (
                  <div
                    key={event.id}
                    className="p-2.5 rounded-lg border border-gray-100 bg-gray-50/50 hover:bg-gray-50 transition-colors flex items-start gap-2.5 text-xs"
                  >
                    <div className={`p-1.5 rounded-md ${iconColor} shrink-0 mt-0.5`}>
                      <Icon className="w-3.5 h-3.5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-900 truncate">{event.title}</p>
                      <p className="text-[11px] text-gray-500 mt-0.5 line-clamp-2">{event.description}</p>
                      <p className="text-[10px] text-gray-400 mt-1">
                        {new Date(event.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Quick Action Navigation Grid */}
      <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
        <h2 className="text-base font-bold text-gray-900 mb-4">Workspace Quick Actions</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
          <Link
            href="/dashboard/attendance"
            className="p-4 rounded-lg border border-gray-200 hover:border-brand-700 hover:bg-brand-50/30 transition-colors group flex items-start gap-3"
          >
            <div className="p-2 bg-brand-100 rounded-lg text-brand-800 group-hover:bg-brand-700 group-hover:text-white transition-colors">
              <ClipboardCheck className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900 group-hover:text-brand-800">Daily Attendance</p>
              <p className="text-xs text-gray-500 mt-0.5">Take registers & submit</p>
            </div>
          </Link>

          <Link
            href="/dashboard/reports"
            className="p-4 rounded-lg border border-gray-200 hover:border-brand-700 hover:bg-brand-50/30 transition-colors group flex items-start gap-3"
          >
            <div className="p-2 bg-brand-100 rounded-lg text-brand-800 group-hover:bg-brand-700 group-hover:text-white transition-colors">
              <Percent className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900 group-hover:text-brand-800">Reports & Analytics</p>
              <p className="text-xs text-gray-500 mt-0.5">Trends, analytics & CSV export</p>
            </div>
          </Link>

          <Link
            href="/dashboard/notifications"
            className="p-4 rounded-lg border border-gray-200 hover:border-brand-700 hover:bg-brand-50/30 transition-colors group flex items-start gap-3"
          >
            <div className="p-2 bg-brand-100 rounded-lg text-brand-800 group-hover:bg-brand-700 group-hover:text-white transition-colors">
              <Bell className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900 group-hover:text-brand-800">Notifications</p>
              <p className="text-xs text-gray-500 mt-0.5">Guardian follow-ups & audit</p>
            </div>
          </Link>

          <Link
            href="/dashboard/students"
            className="p-4 rounded-lg border border-gray-200 hover:border-brand-700 hover:bg-brand-50/30 transition-colors group flex items-start gap-3"
          >
            <div className="p-2 bg-brand-100 rounded-lg text-brand-800 group-hover:bg-brand-700 group-hover:text-white transition-colors">
              <GraduationCap className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900 group-hover:text-brand-800">Students Roster</p>
              <p className="text-xs text-gray-500 mt-0.5">Manage students & enrollment</p>
            </div>
          </Link>
        </div>
      </div>
    </main>
  );
}
