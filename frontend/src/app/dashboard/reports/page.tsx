'use client';

import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { useAuth } from '@/lib/auth-context';
import { apiFetch } from '@/lib/api';
import { StatusBadge, Button, TableSkeleton, EmptyState } from '@/components/ui/components';
import {
  BarChart3,
  Calendar,
  Download,
  Printer,
  School,
  Users,
  CheckCircle2,
  Clock,
  XCircle,
  TrendingUp,
  Search,
  Filter,
  FileSpreadsheet,
  ChevronRight,
  History,
  GraduationCap,
  Building2,
  RefreshCw,
  AlertCircle
} from 'lucide-react';

interface ClassroomOption {
  id: string;
  name: string;
  gradeLevel?: string;
  schoolId: string;
  schoolName: string;
  schoolCode: string;
}

interface SchoolOption {
  id: string;
  name: string;
  code: string;
}

interface AnalyticsData {
  filters: {
    startDate: string;
    endDate: string;
    schoolId: string | null;
    classroomId: string | null;
  };
  summary: {
    totalActiveStudents: number;
    totalSessions: number;
    submittedSessions: number;
    openSessions: number;
    presentCount: number;
    lateCount: number;
    absentCount: number;
    totalMarkedRecords: number;
    overallPercentage: number;
  };
  dailyTrends: Array<{
    date: string;
    totalSessions: number;
    submittedSessions: number;
    openSessions: number;
    presentCount: number;
    lateCount: number;
    absentCount: number;
    totalMarked: number;
    attendancePercentage: number;
  }>;
  schoolComparison: Array<{
    schoolId: string;
    schoolName: string;
    schoolCode: string;
    classroomCount: number;
    totalSessions: number;
    submittedSessions: number;
    presentCount: number;
    lateCount: number;
    absentCount: number;
    totalMarked: number;
    attendancePercentage: number;
  }>;
  classroomSummary: Array<{
    classroomId: string;
    classroomName: string;
    gradeLevel?: string;
    schoolId: string;
    schoolName: string;
    schoolCode: string;
    totalEnrolled: number;
    totalSessions: number;
    submittedSessions: number;
    openSessions: number;
    presentCount: number;
    lateCount: number;
    absentCount: number;
    totalMarked: number;
    attendancePercentage: number;
  }>;
}

interface StudentReportItem {
  studentId: string;
  rollNumber: string;
  firstName: string;
  lastName: string;
  gender?: string;
  schoolName: string;
  schoolCode: string;
  classroomName: string;
  gradeLevel?: string;
  daysRecorded: number;
  presentCount: number;
  lateCount: number;
  absentCount: number;
  totalMarked: number;
  attendancePercentage: number;
}

interface StudentHistoryRecord {
  id: string;
  status: 'PRESENT' | 'ABSENT' | 'LATE';
  remarks?: string;
  markedAt: string;
  date: string;
  sessionStatus: string;
  classroomName: string;
  schoolName: string;
  markedByName?: string;
}

interface StudentHistoryData {
  student: {
    id: string;
    rollNumber: string;
    firstName: string;
    lastName: string;
    schoolName?: string;
    classroomName?: string;
  };
  stats: {
    totalDays: number;
    presentCount: number;
    lateCount: number;
    absentCount: number;
    attendancePercentage: number;
  };
  history: StudentHistoryRecord[];
}

export default function ReportsPage() {
  const { user } = useAuth();

  // Helper date calculators
  const getTodayStr = () => new Date().toISOString().split('T')[0];
  const getDaysAgoStr = (days: number) =>
    new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const getMonthStartStr = () => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().split('T')[0];
  };

  // Date Range State
  const [rangePreset, setRangePreset] = useState<'today' | 'week' | 'month' | '30days' | 'custom'>('30days');
  const [startDate, setStartDate] = useState<string>(getDaysAgoStr(30));
  const [endDate, setEndDate] = useState<string>(getTodayStr());

  // Filter Dropdowns
  const [schools, setSchools] = useState<SchoolOption[]>([]);
  const [classrooms, setClassrooms] = useState<ClassroomOption[]>([]);
  const [selectedSchoolId, setSelectedSchoolId] = useState<string>('');
  const [selectedClassroomId, setSelectedClassroomId] = useState<string>('');
  const [studentSearch, setStudentSearch] = useState<string>('');

  // Active Report View
  const [activeTab, setActiveTab] = useState<'overview' | 'students' | 'classrooms' | 'daily'>('overview');

  // Data States
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [studentsReport, setStudentsReport] = useState<StudentReportItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>('');

  // CSV Export Modal/State
  const [isExporting, setIsExporting] = useState<boolean>(false);

  // Student Attendance History Modal
  const [historyStudentId, setHistoryStudentId] = useState<string | null>(null);
  const [historyData, setHistoryData] = useState<StudentHistoryData | null>(null);
  const [loadingHistory, setLoadingHistory] = useState<boolean>(false);

  // 1. Load Filter Options (Schools and Classrooms)
  useEffect(() => {
    async function loadFilters() {
      try {
        const [schoolsRes, classesRes] = await Promise.all([
          apiFetch<{ schools: any[] }>('/api/schools?status=active'),
          apiFetch<{ classrooms: any[] }>('/api/classrooms?status=active')
        ]);
        setSchools(schoolsRes.schools || []);
        setClassrooms(classesRes.classrooms || []);
      } catch (err: any) {
        console.error('Failed to load filter metadata:', err);
      }
    }

    if (user) {
      loadFilters();
    }
  }, [user]);

  // Handle Preset Clicks
  const handleSelectPreset = (preset: 'today' | 'week' | 'month' | '30days') => {
    setRangePreset(preset);
    const today = getTodayStr();
    setEndDate(today);

    if (preset === 'today') {
      setStartDate(today);
    } else if (preset === 'week') {
      setStartDate(getDaysAgoStr(7));
    } else if (preset === 'month') {
      setStartDate(getMonthStartStr());
    } else if (preset === '30days') {
      setStartDate(getDaysAgoStr(30));
    }
  };

  // 2. Load Report Data
  const loadReports = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      let queryParams = `startDate=${startDate}&endDate=${endDate}`;
      if (selectedSchoolId) queryParams += `&schoolId=${selectedSchoolId}`;
      if (selectedClassroomId) queryParams += `&classroomId=${selectedClassroomId}`;

      if (activeTab === 'students') {
        let studentParams = queryParams;
        if (studentSearch) studentParams += `&search=${encodeURIComponent(studentSearch)}`;
        const studentsData = await apiFetch<{ students: StudentReportItem[] }>(
          `/api/reports/students?${studentParams}`
        );
        setStudentsReport(studentsData.students || []);
      } else {
        const analyticsData = await apiFetch<AnalyticsData>(`/api/reports/dashboard?${queryParams}`);
        setAnalytics(analyticsData);
      }
    } catch (err: any) {
      console.error('Failed to load attendance report:', err);
      setError(err.message || 'Failed to load attendance report data');
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, selectedSchoolId, selectedClassroomId, activeTab, studentSearch]);

  useEffect(() => {
    if (user) {
      loadReports();
    }
  }, [user, loadReports]);

  // Filtered Classrooms for dropdown based on selected school
  const filteredClassroomOptions = useMemo(() => {
    if (!selectedSchoolId) return classrooms;
    return classrooms.filter(c => c.schoolId === selectedSchoolId);
  }, [classrooms, selectedSchoolId]);

  // 3. Export CSV Action
  const handleExportCsv = async (type: 'summary' | 'classrooms' | 'students' | 'daily') => {
    setIsExporting(true);
    try {
      let url = `/api/reports/export/csv?type=${type}&startDate=${startDate}&endDate=${endDate}`;
      if (selectedSchoolId) url += `&schoolId=${selectedSchoolId}`;
      if (selectedClassroomId) url += `&classroomId=${selectedClassroomId}`;

      // Trigger download via native anchor
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `sahaara-${type}-${startDate}-to-${endDate}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err: any) {
      console.error('CSV export failed:', err);
      alert('Failed to download CSV: ' + err.message);
    } finally {
      setIsExporting(false);
    }
  };

  // 4. Print / PDF Action
  const handlePrint = () => {
    window.print();
  };

  // 5. Open Student History Modal
  const handleOpenStudentHistory = async (studentId: string) => {
    setHistoryStudentId(studentId);
    setLoadingHistory(true);
    try {
      const data = await apiFetch<StudentHistoryData>(
        `/api/attendance/students/${studentId}?startDate=${startDate}&endDate=${endDate}`
      );
      setHistoryData(data);
    } catch (err: any) {
      console.error('Failed to load student history:', err);
    } finally {
      setLoadingHistory(false);
    }
  };

  return (
    <main className="p-4 sm:p-6 lg:p-8 flex-1 max-w-7xl mx-auto w-full">
      {/* Printable Header (Visible only on print) */}
      <div className="hidden print:block mb-6 border-b border-gray-900 pb-4">
        <h1 className="text-2xl font-bold text-gray-900">Sahaara Attendance Report</h1>
        <p className="text-xs text-gray-600 mt-1">
          Organization: <span className="font-semibold">{user?.organization?.name || 'Platform Administrator'}</span> • Date Range: {startDate} to {endDate}
        </p>
        <p className="text-[11px] text-gray-500 mt-0.5">
          Generated on: {new Date().toLocaleString()} • Authorized attendance audit
        </p>
      </div>

      {/* Top Header & Actions (Hidden on print) */}
      <div className="flex flex-col md:flex-row md:items-center justify-between pb-6 border-b border-gray-200 gap-4 print:hidden">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight flex items-center gap-2">
              <BarChart3 className="w-7 h-7 text-brand-700" />
              Attendance Reports & Analytics
            </h1>
            <StatusBadge status="ACTIVE" label="Live Reports" />
          </div>
          <p className="text-sm text-gray-500 mt-1">
            Analyze attendance percentages, daily trends, school performance, and export audit registers
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={handlePrint}
            className="gap-2 border-gray-300 text-gray-700 hover:bg-gray-50"
            title="Print report or save as PDF"
          >
            <Printer className="w-4 h-4 text-gray-600" />
            Print / PDF
          </Button>

          <div className="relative inline-block">
            <Button
              size="sm"
              onClick={() => handleExportCsv(activeTab === 'students' ? 'students' : 'classrooms')}
              disabled={isExporting}
              className="gap-2 bg-brand-700 hover:bg-brand-800 text-white font-semibold shadow-sm"
              title="Download sanitized CSV"
            >
              <FileSpreadsheet className="w-4 h-4" />
              {isExporting ? 'Exporting...' : 'Export CSV'}
            </Button>
          </div>
        </div>
      </div>

      {/* Controls & Filter Panel (Hidden on print) */}
      <div className="mt-6 bg-white p-4 sm:p-5 rounded-xl border border-gray-200 shadow-sm space-y-4 print:hidden">
        {/* Preset Range Pills */}
        <div className="flex items-center justify-between flex-wrap gap-2 pb-3 border-b border-gray-100">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider mr-2">Range Preset:</span>
            <button
              onClick={() => handleSelectPreset('today')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                rangePreset === 'today'
                  ? 'bg-brand-700 text-white shadow-sm'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Today
            </button>
            <button
              onClick={() => handleSelectPreset('week')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                rangePreset === 'week'
                  ? 'bg-brand-700 text-white shadow-sm'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Last 7 Days
            </button>
            <button
              onClick={() => handleSelectPreset('month')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                rangePreset === 'month'
                  ? 'bg-brand-700 text-white shadow-sm'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              This Month
            </button>
            <button
              onClick={() => handleSelectPreset('30days')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                rangePreset === '30days'
                  ? 'bg-brand-700 text-white shadow-sm'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Last 30 Days
            </button>
          </div>

          <button
            onClick={() => loadReports()}
            className="text-xs font-semibold text-brand-700 hover:text-brand-800 flex items-center gap-1"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {/* Filters Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          {/* Start Date */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
              Start Date
            </label>
            <input
              type="date"
              value={startDate}
              max={endDate}
              onChange={e => {
                setRangePreset('custom');
                setStartDate(e.target.value);
              }}
              className="w-full px-3 py-2 bg-gray-50 border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>

          {/* End Date */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
              End Date
            </label>
            <input
              type="date"
              value={endDate}
              min={startDate}
              max={getTodayStr()}
              onChange={e => {
                setRangePreset('custom');
                setEndDate(e.target.value);
              }}
              className="w-full px-3 py-2 bg-gray-50 border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>

          {/* School Selector */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
              Learning Centre / School
            </label>
            <select
              value={selectedSchoolId}
              onChange={e => {
                setSelectedSchoolId(e.target.value);
                setSelectedClassroomId('');
              }}
              className="w-full px-3 py-2 bg-gray-50 border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              <option value="">All Schools & Centres</option>
              {schools.map(s => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.code})
                </option>
              ))}
            </select>
          </div>

          {/* Classroom Selector */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
              Classroom Cohort
            </label>
            <select
              value={selectedClassroomId}
              onChange={e => setSelectedClassroomId(e.target.value)}
              className="w-full px-3 py-2 bg-gray-50 border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              <option value="">All Classrooms</option>
              {filteredClassroomOptions.map(c => (
                <option key={c.id} value={c.id}>
                  {c.name} {c.gradeLevel && `• ${c.gradeLevel}`}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Report View Navigation Tabs */}
      <div className="mt-6 flex items-center gap-2 border-b border-gray-200 overflow-x-auto print:hidden">
        <button
          onClick={() => setActiveTab('overview')}
          className={`pb-3 px-3 text-sm font-semibold transition-colors border-b-2 flex items-center gap-1.5 whitespace-nowrap ${
            activeTab === 'overview'
              ? 'border-brand-700 text-brand-700'
              : 'border-transparent text-gray-500 hover:text-gray-900'
          }`}
        >
          <TrendingUp className="w-4 h-4" />
          Dashboard & Trends
        </button>

        <button
          onClick={() => setActiveTab('students')}
          className={`pb-3 px-3 text-sm font-semibold transition-colors border-b-2 flex items-center gap-1.5 whitespace-nowrap ${
            activeTab === 'students'
              ? 'border-brand-700 text-brand-700'
              : 'border-transparent text-gray-500 hover:text-gray-900'
          }`}
        >
          <GraduationCap className="w-4 h-4" />
          Student-Wise Report
        </button>

        <button
          onClick={() => setActiveTab('classrooms')}
          className={`pb-3 px-3 text-sm font-semibold transition-colors border-b-2 flex items-center gap-1.5 whitespace-nowrap ${
            activeTab === 'classrooms'
              ? 'border-brand-700 text-brand-700'
              : 'border-transparent text-gray-500 hover:text-gray-900'
          }`}
        >
          <School className="w-4 h-4" />
          Classroom Summaries
        </button>

        <button
          onClick={() => setActiveTab('daily')}
          className={`pb-3 px-3 text-sm font-semibold transition-colors border-b-2 flex items-center gap-1.5 whitespace-nowrap ${
            activeTab === 'daily'
              ? 'border-brand-700 text-brand-700'
              : 'border-transparent text-gray-500 hover:text-gray-900'
          }`}
        >
          <Calendar className="w-4 h-4" />
          Daily Registers Log
        </button>
      </div>

      {/* Global Error Banner */}
      {error && (
        <div className="mt-6 p-4 rounded-xl bg-rose-50 border border-rose-200 text-sm text-rose-800 flex items-center gap-2">
          <AlertCircle className="w-5 h-5 text-rose-600 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* TAB 1: OVERVIEW & TRENDS */}
      {activeTab === 'overview' && (
        <div className="mt-6 space-y-6">
          {/* Summary KPI Cards */}
          {analytics?.summary && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                <span className="text-xs font-semibold text-gray-500 uppercase">Active Students</span>
                <p className="text-2xl font-extrabold text-gray-900 mt-1">{analytics.summary.totalActiveStudents}</p>
                <p className="text-[11px] text-gray-400 mt-0.5">In filtered scope</p>
              </div>

              <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                <span className="text-xs font-semibold text-gray-500 uppercase">Registers Held</span>
                <p className="text-2xl font-extrabold text-gray-900 mt-1">{analytics.summary.totalSessions}</p>
                <p className="text-[11px] text-emerald-700 font-medium mt-0.5">
                  {analytics.summary.submittedSessions} submitted ({analytics.summary.openSessions} draft)
                </p>
              </div>

              <div className="bg-white p-4 rounded-xl border border-emerald-200 shadow-sm bg-emerald-50/20">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-emerald-700 uppercase">Present</span>
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                </div>
                <p className="text-2xl font-extrabold text-emerald-700 mt-1">{analytics.summary.presentCount}</p>
                <p className="text-[11px] text-emerald-600 mt-0.5">Recorded present</p>
              </div>

              <div className="bg-white p-4 rounded-xl border border-amber-200 shadow-sm bg-amber-50/20">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-amber-700 uppercase">Late</span>
                  <Clock className="w-4 h-4 text-amber-600" />
                </div>
                <p className="text-2xl font-extrabold text-amber-700 mt-1">{analytics.summary.lateCount}</p>
                <p className="text-[11px] text-amber-600 mt-0.5">Recorded late</p>
              </div>

              <div className="bg-white p-4 rounded-xl border border-rose-200 shadow-sm bg-rose-50/20">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-rose-700 uppercase">Absent</span>
                  <XCircle className="w-4 h-4 text-rose-600" />
                </div>
                <p className="text-2xl font-extrabold text-rose-700 mt-1">{analytics.summary.absentCount}</p>
                <p className="text-[11px] text-rose-600 mt-0.5">Recorded absent</p>
              </div>

              <div className="bg-white p-4 rounded-xl border border-brand-200 shadow-sm bg-brand-50/30">
                <span className="text-xs font-bold text-brand-800 uppercase">Overall Attendance</span>
                <p className="text-2xl font-extrabold text-brand-900 mt-1">
                  {analytics.summary.overallPercentage}%
                </p>
                <p className="text-[11px] text-brand-700 mt-0.5">(Present + Late) / Marked</p>
              </div>
            </div>
          )}

          {/* Daily Trend Chart (Lightweight Responsive SVG Chart) */}
          <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-gray-100 gap-2">
              <div>
                <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-brand-700" />
                  Daily Attendance Trends ({startDate} to {endDate})
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Daily attendance percentages and student attendance records across recorded dates
                </p>
              </div>
              <div className="flex items-center gap-4 text-xs font-medium text-gray-600">
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-sm bg-emerald-600 inline-block" /> Present
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-sm bg-amber-500 inline-block" /> Late
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-sm bg-rose-500 inline-block" /> Absent
                </span>
              </div>
            </div>

            {loading ? (
              <div className="p-12 text-center text-gray-500">
                <div className="inline-block w-8 h-8 border-4 border-brand-600 border-t-transparent rounded-full animate-spin" />
                <p className="text-xs mt-3">Loading daily trends...</p>
              </div>
            ) : !analytics?.dailyTrends || analytics.dailyTrends.length === 0 ? (
              <div className="p-10 text-center text-gray-400 text-sm">
                No attendance registers recorded in this date range. Try widening the date filters above.
              </div>
            ) : (
              <div className="mt-6 space-y-4">
                {/* Visual Bars for each recorded date */}
                <div className="space-y-3">
                  {analytics.dailyTrends.map(day => (
                    <div key={day.date} className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 text-xs">
                      <div className="w-24 font-mono font-semibold text-gray-700 flex-shrink-0">
                        {new Date(day.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </div>

                      {/* Stacked bar */}
                      <div className="flex-1 bg-gray-100 rounded-lg h-6 flex overflow-hidden border border-gray-200">
                        {day.totalMarked > 0 ? (
                          <>
                            <div
                              style={{ width: `${(day.presentCount / day.totalMarked) * 100}%` }}
                              className="bg-emerald-600 text-white flex items-center justify-center font-bold text-[10px] truncate px-1"
                              title={`Present: ${day.presentCount}`}
                            >
                              {day.presentCount > 0 ? day.presentCount : ''}
                            </div>
                            <div
                              style={{ width: `${(day.lateCount / day.totalMarked) * 100}%` }}
                              className="bg-amber-500 text-white flex items-center justify-center font-bold text-[10px] truncate px-1"
                              title={`Late: ${day.lateCount}`}
                            >
                              {day.lateCount > 0 ? day.lateCount : ''}
                            </div>
                            <div
                              style={{ width: `${(day.absentCount / day.totalMarked) * 100}%` }}
                              className="bg-rose-500 text-white flex items-center justify-center font-bold text-[10px] truncate px-1"
                              title={`Absent: ${day.absentCount}`}
                            >
                              {day.absentCount > 0 ? day.absentCount : ''}
                            </div>
                          </>
                        ) : (
                          <div className="w-full text-center text-gray-400 text-[10px] py-1">No marks</div>
                        )}
                      </div>

                      <div className="w-28 text-right flex-shrink-0">
                        <span className="font-extrabold text-brand-900 text-sm">
                          {day.attendancePercentage}%
                        </span>
                        <span className="text-[11px] text-gray-400 block">
                          {day.totalMarked} records
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* School/Centre-Wise Comparison */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="p-4 bg-gray-50/50 border-b border-gray-200 flex items-center justify-between">
              <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                <School className="w-4 h-4 text-brand-700" />
                School / Learning Centre Comparison
              </h3>
              <span className="text-xs text-gray-500 font-medium">
                {analytics?.schoolComparison.length || 0} centres
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50 text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                    <th className="py-3 px-4">School & Code</th>
                    <th className="py-3 px-4 text-center">Classrooms</th>
                    <th className="py-3 px-4 text-center">Sessions Held</th>
                    <th className="py-3 px-4 text-center">Present</th>
                    <th className="py-3 px-4 text-center">Late</th>
                    <th className="py-3 px-4 text-center">Absent</th>
                    <th className="py-3 px-4 text-center">Total Marked</th>
                    <th className="py-3 px-4 text-right">Attendance Rate</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {analytics?.schoolComparison.map(s => (
                    <tr key={s.schoolId} className="hover:bg-gray-50/60 transition-colors">
                      <td className="py-3 px-4 font-semibold text-gray-900">
                        {s.schoolName}
                        <span className="text-xs font-mono text-gray-400 block">{s.schoolCode}</span>
                      </td>
                      <td className="py-3 px-4 text-center font-medium text-gray-700">{s.classroomCount}</td>
                      <td className="py-3 px-4 text-center font-medium text-gray-700">{s.totalSessions}</td>
                      <td className="py-3 px-4 text-center font-bold text-emerald-700">{s.presentCount}</td>
                      <td className="py-3 px-4 text-center font-bold text-amber-700">{s.lateCount}</td>
                      <td className="py-3 px-4 text-center font-bold text-rose-700">{s.absentCount}</td>
                      <td className="py-3 px-4 text-center font-bold text-gray-800">{s.totalMarked}</td>
                      <td className="py-3 px-4 text-right font-extrabold text-brand-900">
                        {s.attendancePercentage}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: STUDENT-WISE ATTENDANCE REPORT */}
      {activeTab === 'students' && (
        <div className="mt-6 space-y-4">
          {/* Search bar inside students tab */}
          <div className="bg-white p-3.5 rounded-xl border border-gray-200 shadow-sm flex items-center gap-3">
            <Search className="w-4 h-4 text-gray-400 ml-1" />
            <input
              type="text"
              value={studentSearch}
              onChange={e => setStudentSearch(e.target.value)}
              placeholder="Search by student name or roll number..."
              className="w-full text-sm text-gray-900 focus:outline-none placeholder-gray-400"
            />
            {studentSearch && (
              <button
                onClick={() => setStudentSearch('')}
                className="text-xs text-gray-400 hover:text-gray-600 px-2"
              >
                Clear
              </button>
            )}
          </div>

          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="p-4 bg-gray-50/50 border-b border-gray-200 flex items-center justify-between">
              <h3 className="text-sm font-bold text-gray-900">
                Individual Student Attendance Report ({startDate} to {endDate})
              </h3>
              <span className="text-xs text-gray-500 font-medium">
                {studentsReport.length} students
              </span>
            </div>

            {loading ? (
              <div className="p-4">
                <TableSkeleton rows={6} cols={6} />
              </div>
            ) : studentsReport.length === 0 ? (
              <EmptyState
                icon={GraduationCap}
                title="No student reports found"
                description="No attendance records were found for the selected date range and filter scope."
                className="border-0 shadow-none py-10"
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 bg-gray-50 text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                      <th className="py-3 px-4">Roll No</th>
                      <th className="py-3 px-4">Student Name</th>
                      <th className="py-3 px-4">Centre & Classroom</th>
                      <th className="py-3 px-4 text-center">Days Marked</th>
                      <th className="py-3 px-4 text-center">Present</th>
                      <th className="py-3 px-4 text-center">Late</th>
                      <th className="py-3 px-4 text-center">Absent</th>
                      <th className="py-3 px-4 text-right">Attendance Rate</th>
                      <th className="py-3 px-4 text-right print:hidden">History</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {studentsReport.map(student => (
                      <tr key={student.studentId} className="hover:bg-gray-50/60 transition-colors">
                        <td className="py-3.5 px-4 font-mono font-semibold text-gray-800 text-xs">
                          {student.rollNumber}
                        </td>
                        <td className="py-3.5 px-4 font-bold text-gray-900">
                          {student.firstName} {student.lastName}
                        </td>
                        <td className="py-3.5 px-4 text-xs text-gray-600">
                          <span className="font-semibold text-gray-800">{student.classroomName}</span>
                          <span className="block text-gray-400">{student.schoolName}</span>
                        </td>
                        <td className="py-3.5 px-4 text-center font-medium text-gray-700">{student.daysRecorded}</td>
                        <td className="py-3.5 px-4 text-center font-bold text-emerald-700">{student.presentCount}</td>
                        <td className="py-3.5 px-4 text-center font-bold text-amber-700">{student.lateCount}</td>
                        <td className="py-3.5 px-4 text-center font-bold text-rose-700">{student.absentCount}</td>
                        <td className="py-3.5 px-4 text-right font-extrabold text-brand-900">
                          <span
                            className={`px-2 py-0.5 rounded-full text-xs ${
                              student.attendancePercentage >= 85
                                ? 'bg-emerald-100 text-emerald-800'
                                : student.attendancePercentage >= 70
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-rose-100 text-rose-800'
                            }`}
                          >
                            {student.attendancePercentage}%
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-right print:hidden">
                          <button
                            onClick={() => handleOpenStudentHistory(student.studentId)}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-brand-700 hover:bg-brand-50 transition-colors"
                            title="View attendance history"
                          >
                            <History className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: CLASSROOM SUMMARIES */}
      {activeTab === 'classrooms' && (
        <div className="mt-6 bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="p-4 bg-gray-50/50 border-b border-gray-200 flex items-center justify-between">
            <h3 className="text-sm font-bold text-gray-900">
              Classroom Attendance Summary ({startDate} to {endDate})
            </h3>
            <span className="text-xs text-gray-500 font-medium">
              {analytics?.classroomSummary.length || 0} classrooms
            </span>
          </div>

          {!analytics?.classroomSummary || analytics.classroomSummary.length === 0 ? (
            <EmptyState
              icon={School}
              title="No classroom attendance records"
              description="No attendance registers have been conducted for classrooms in the selected date range."
              className="border-0 shadow-none py-10"
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50 text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                    <th className="py-3 px-4">School & Code</th>
                    <th className="py-3 px-4">Classroom</th>
                    <th className="py-3 px-4 text-center">Enrolled</th>
                    <th className="py-3 px-4 text-center">Sessions</th>
                    <th className="py-3 px-4 text-center">Submitted</th>
                    <th className="py-3 px-4 text-center">Draft</th>
                    <th className="py-3 px-4 text-center">Present</th>
                    <th className="py-3 px-4 text-center">Late</th>
                    <th className="py-3 px-4 text-center">Absent</th>
                    <th className="py-3 px-4 text-right">Attendance Rate</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {analytics.classroomSummary.map(c => (
                    <tr key={c.classroomId} className="hover:bg-gray-50/60 transition-colors">
                      <td className="py-3.5 px-4">
                        <p className="font-semibold text-gray-900">{c.schoolName}</p>
                        <p className="text-xs font-mono text-gray-400">{c.schoolCode}</p>
                      </td>
                      <td className="py-3.5 px-4 font-medium text-gray-800">
                        {c.classroomName}
                        {c.gradeLevel && <span className="text-xs text-gray-400 block">{c.gradeLevel}</span>}
                      </td>
                      <td className="py-3.5 px-4 text-center font-bold text-gray-700">{c.totalEnrolled}</td>
                      <td className="py-3.5 px-4 text-center font-medium text-gray-700">{c.totalSessions}</td>
                      <td className="py-3.5 px-4 text-center font-bold text-emerald-700">{c.submittedSessions}</td>
                      <td className="py-3.5 px-4 text-center font-bold text-amber-700">{c.openSessions}</td>
                      <td className="py-3.5 px-4 text-center font-bold text-emerald-700">{c.presentCount}</td>
                      <td className="py-3.5 px-4 text-center font-bold text-amber-700">{c.lateCount}</td>
                      <td className="py-3.5 px-4 text-center font-bold text-rose-700">{c.absentCount}</td>
                      <td className="py-3.5 px-4 text-right font-extrabold text-brand-900">
                        {c.attendancePercentage}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB 4: DAILY REGISTERS LOG */}
      {activeTab === 'daily' && (
        <div className="mt-6 bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="p-4 bg-gray-50/50 border-b border-gray-200 flex items-center justify-between">
            <h3 className="text-sm font-bold text-gray-900">
              Recorded Daily Registers Log ({startDate} to {endDate})
            </h3>
            <span className="text-xs text-gray-500 font-medium">
              {analytics?.dailyTrends.length || 0} dates recorded
            </span>
          </div>

          {!analytics?.dailyTrends || analytics.dailyTrends.length === 0 ? (
            <EmptyState
              icon={Calendar}
              title="No daily registers recorded"
              description="No attendance sessions were conducted or submitted during this date range."
              className="border-0 shadow-none py-10"
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50 text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                    <th className="py-3 px-4">Date</th>
                    <th className="py-3 px-4 text-center">Registers Held</th>
                    <th className="py-3 px-4 text-center">Submitted</th>
                    <th className="py-3 px-4 text-center">Open Draft</th>
                    <th className="py-3 px-4 text-center">Present</th>
                    <th className="py-3 px-4 text-center">Late</th>
                    <th className="py-3 px-4 text-center">Absent</th>
                    <th className="py-3 px-4 text-center">Total Marked</th>
                    <th className="py-3 px-4 text-right">Attendance Rate</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {analytics.dailyTrends.map(day => (
                    <tr key={day.date} className="hover:bg-gray-50/60 transition-colors">
                      <td className="py-3.5 px-4 font-semibold text-gray-900">
                        {new Date(day.date).toLocaleDateString('en-US', {
                          weekday: 'short',
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric'
                        })}
                      </td>
                      <td className="py-3.5 px-4 text-center font-bold text-gray-800">{day.totalSessions}</td>
                      <td className="py-3.5 px-4 text-center font-bold text-emerald-700">{day.submittedSessions}</td>
                      <td className="py-3.5 px-4 text-center font-bold text-amber-700">{day.openSessions}</td>
                      <td className="py-3.5 px-4 text-center font-bold text-emerald-700">{day.presentCount}</td>
                      <td className="py-3.5 px-4 text-center font-bold text-amber-700">{day.lateCount}</td>
                      <td className="py-3.5 px-4 text-center font-bold text-rose-700">{day.absentCount}</td>
                      <td className="py-3.5 px-4 text-center font-bold text-gray-700">{day.totalMarked}</td>
                      <td className="py-3.5 px-4 text-right font-extrabold text-brand-900">
                        {day.attendancePercentage}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* STUDENT ATTENDANCE HISTORY MODAL */}
      {historyStudentId && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-xl border border-gray-200 animate-scale-in max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between pb-4 border-b border-gray-200">
              <div className="flex items-center gap-2.5">
                <div className="p-2.5 bg-brand-100 rounded-lg text-brand-700">
                  <History className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-gray-900">Student Attendance History</h3>
                  <p className="text-xs text-gray-500">
                    {historyData?.student.firstName} {historyData?.student.lastName} ({historyData?.student.rollNumber})
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  setHistoryStudentId(null);
                  setHistoryData(null);
                }}
                className="p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            {loadingHistory ? (
              <div className="p-10 text-center text-gray-500">
                <div className="inline-block w-7 h-7 border-4 border-brand-600 border-t-transparent rounded-full animate-spin" />
                <p className="text-xs mt-2">Loading attendance history...</p>
              </div>
            ) : historyData ? (
              <div className="flex-1 overflow-y-auto mt-4 space-y-4 pr-1">
                {/* Stats Summary */}
                <div className="grid grid-cols-4 gap-2 bg-gray-50 p-3.5 rounded-xl border border-gray-200 text-center">
                  <div>
                    <span className="text-[10px] font-semibold text-gray-400 uppercase">Days Recorded</span>
                    <p className="text-lg font-bold text-gray-900 mt-0.5">{historyData.stats.totalDays}</p>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-emerald-600 uppercase">Present</span>
                    <p className="text-lg font-bold text-emerald-700 mt-0.5">{historyData.stats.presentCount}</p>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-amber-600 uppercase">Late</span>
                    <p className="text-lg font-bold text-amber-700 mt-0.5">{historyData.stats.lateCount}</p>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-brand-800 uppercase">Rate</span>
                    <p className="text-lg font-extrabold text-brand-900 mt-0.5">{historyData.stats.attendancePercentage}%</p>
                  </div>
                </div>

                {/* History Timeline */}
                <div className="divide-y divide-gray-100 border border-gray-200 rounded-xl overflow-hidden">
                  {historyData.history.length === 0 ? (
                    <div className="p-6 text-center text-xs text-gray-400">
                      No attendance sessions recorded for this student in the selected range.
                    </div>
                  ) : (
                    historyData.history.map(rec => (
                      <div key={rec.id} className="p-3.5 flex items-center justify-between text-xs hover:bg-gray-50">
                        <div>
                          <p className="font-semibold text-gray-900">
                            {new Date(rec.date).toLocaleDateString('en-US', {
                              weekday: 'short',
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric'
                            })}
                          </p>
                          <p className="text-[11px] text-gray-400 mt-0.5">
                            {rec.classroomName} • {rec.schoolName} {rec.markedByName && `• Marked by ${rec.markedByName}`}
                          </p>
                          {rec.remarks && (
                            <p className="text-[11px] text-amber-700 mt-0.5 italic">
                              Remarks: {rec.remarks}
                            </p>
                          )}
                        </div>

                        <span
                          className={`px-2.5 py-1 rounded-full font-bold text-[11px] ${
                            rec.status === 'PRESENT'
                              ? 'bg-emerald-100 text-emerald-800'
                              : rec.status === 'LATE'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-rose-100 text-rose-800'
                          }`}
                        >
                          {rec.status}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            ) : null}

            <div className="mt-4 pt-3 border-t border-gray-200 flex justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setHistoryStudentId(null);
                  setHistoryData(null);
                }}
              >
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
