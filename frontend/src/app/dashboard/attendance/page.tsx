'use client';

import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { useAuth } from '@/lib/auth-context';
import { apiFetch } from '@/lib/api';
import { StatusBadge, Button, TableSkeleton, EmptyState } from '@/components/ui/components';
import {
  ClipboardCheck,
  Calendar,
  Users,
  CheckCircle2,
  Clock,
  XCircle,
  AlertCircle,
  Save,
  Send,
  Lock,
  History,
  Building2,
  School,
  ArrowRight,
  Filter,
  Check,
  ChevronRight,
  UserCheck,
  MessageSquare
} from 'lucide-react';

type AttendanceStatus = 'PRESENT' | 'ABSENT' | 'LATE';

interface ClassroomOption {
  id: string;
  name: string;
  gradeLevel?: string;
  academicYear?: string;
  schoolId: string;
  schoolName: string;
  schoolCode: string;
  studentCount: string | number;
}

interface StudentRosterItem {
  id: string;
  rollNumber: string;
  firstName: string;
  lastName: string;
  gender?: string;
  dateOfBirth?: string;
  guardianName?: string;
  guardianContact?: string;
  attendance?: {
    status: AttendanceStatus;
    remarks?: string;
    updatedAt?: string;
  } | null;
}

interface AttendanceSession {
  id: string;
  status: 'OPEN' | 'SUBMITTED';
  date: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  submittedAt?: string;
  markedByName?: string;
  submittedByName?: string;
}

interface OverviewClassroom {
  classroomId: string;
  classroomName: string;
  gradeLevel?: string;
  schoolId: string;
  schoolName: string;
  schoolCode: string;
  sessionId?: string;
  sessionStatus: 'SUBMITTED' | 'OPEN' | 'NOT_STARTED';
  submittedAt?: string;
  submittedByName?: string;
  totalStudents: number;
  presentCount: number;
  lateCount: number;
  absentCount: number;
  unmarkedCount: number;
  attendancePercentage: number;
}

interface OverviewSummary {
  totalClassrooms: number;
  submittedCount: number;
  openCount: number;
  notStartedCount: number;
  totalStudents: number;
  totalPresent: number;
  totalLate: number;
  totalAbsent: number;
  overallPercentage: number;
}

interface StudentHistoryRecord {
  id: string;
  status: AttendanceStatus;
  remarks?: string;
  markedAt: string;
  date: string;
  sessionStatus: string;
  classroomName: string;
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

export default function AttendancePage() {
  const { user } = useAuth();

  // Tab: 'register' (daily marking) or 'overview' (admin summary)
  const isTeacher = user?.role === 'TEACHER';
  const [activeTab, setActiveTab] = useState<'register' | 'overview'>('register');

  // Shared Filters
  const getTodayString = () => new Date().toISOString().split('T')[0];
  const [selectedDate, setSelectedDate] = useState<string>(getTodayString());
  const [classrooms, setClassrooms] = useState<ClassroomOption[]>([]);
  const [selectedClassroomId, setSelectedClassroomId] = useState<string>('');
  const [loadingClassrooms, setLoadingClassrooms] = useState(true);

  // Register State
  const [loadingSession, setLoadingSession] = useState(false);
  const [session, setSession] = useState<AttendanceSession | null>(null);
  const [students, setStudents] = useState<StudentRosterItem[]>([]);
  const [attendanceMarks, setAttendanceMarks] = useState<Record<string, AttendanceStatus>>({});
  const [remarks, setRemarks] = useState<Record<string, string>>({});
  const [sessionNotes, setSessionNotes] = useState<string>('');
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState<boolean>(false);
  const [savingProgress, setSavingProgress] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [submitError, setSubmitError] = useState<string>('');
  const [successToast, setSuccessToast] = useState<string>('');

  // Confirmation Modal
  const [showConfirmModal, setShowConfirmModal] = useState<boolean>(false);

  // Student History Modal
  const [historyStudentId, setHistoryStudentId] = useState<string | null>(null);
  const [historyData, setHistoryData] = useState<StudentHistoryData | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Overview Tab State
  const [overviewData, setOverviewData] = useState<{
    summary: OverviewSummary;
    classrooms: OverviewClassroom[];
  } | null>(null);
  const [loadingOverview, setLoadingOverview] = useState(false);
  const [overviewSchoolFilter, setOverviewSchoolFilter] = useState<string>('');

  // 1. Fetch available classrooms
  useEffect(() => {
    async function loadClassrooms() {
      setLoadingClassrooms(true);
      try {
        const data = await apiFetch<{ classrooms: ClassroomOption[] }>('/api/attendance/classrooms');
        setClassrooms(data.classrooms || []);
        if (data.classrooms && data.classrooms.length > 0 && !selectedClassroomId) {
          setSelectedClassroomId(data.classrooms[0].id);
        }
      } catch (err: any) {
        console.error('Failed to load classrooms:', err);
      } finally {
        setLoadingClassrooms(false);
      }
    }

    if (user) {
      loadClassrooms();
    }
  }, [user]);

  // 2. Fetch session and roster when classroom or date changes
  const loadSessionRoster = useCallback(async (classroomId: string, date: string) => {
    if (!classroomId || !date) return;
    setLoadingSession(true);
    setSubmitError('');
    try {
      const data = await apiFetch<{
        classroom: any;
        date: string;
        session: AttendanceSession | null;
        students: StudentRosterItem[];
      }>(`/api/attendance/session?classroomId=${classroomId}&date=${date}`);

      setSession(data.session);
      setStudents(data.students || []);

      // Restore previously saved attendance marks
      const initialMarks: Record<string, AttendanceStatus> = {};
      const initialRemarks: Record<string, string> = {};

      for (const st of data.students || []) {
        if (st.attendance?.status) {
          initialMarks[st.id] = st.attendance.status;
        }
        if (st.attendance?.remarks) {
          initialRemarks[st.id] = st.attendance.remarks;
        }
      }

      setAttendanceMarks(initialMarks);
      setRemarks(initialRemarks);
      setSessionNotes(data.session?.notes || '');
      setHasUnsavedChanges(false);
    } catch (err: any) {
      console.error('Failed to load attendance session:', err);
      setSubmitError(err.message || 'Failed to load attendance session');
    } finally {
      setLoadingSession(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'register' && selectedClassroomId && selectedDate) {
      loadSessionRoster(selectedClassroomId, selectedDate);
    }
  }, [activeTab, selectedClassroomId, selectedDate, loadSessionRoster]);

  // 3. Overview Tab: Fetch aggregated statistics
  const loadOverview = useCallback(async (date: string, schoolId?: string) => {
    setLoadingOverview(true);
    try {
      let url = `/api/attendance/overview?date=${date}`;
      if (schoolId) url += `&schoolId=${schoolId}`;
      const data = await apiFetch<{
        summary: OverviewSummary;
        classrooms: OverviewClassroom[];
      }>(url);
      setOverviewData(data);
    } catch (err: any) {
      console.error('Failed to load overview:', err);
    } finally {
      setLoadingOverview(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'overview' && selectedDate) {
      loadOverview(selectedDate, overviewSchoolFilter);
    }
  }, [activeTab, selectedDate, overviewSchoolFilter, loadOverview]);

  // Warn before unload if unsaved
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedChanges]);

  // Counts & Calculations
  const counts = useMemo(() => {
    let present = 0;
    let late = 0;
    let absent = 0;

    for (const st of students) {
      const status = attendanceMarks[st.id];
      if (status === 'PRESENT') present++;
      else if (status === 'LATE') late++;
      else if (status === 'ABSENT') absent++;
    }

    const total = students.length;
    const marked = present + late + absent;
    const unmarked = Math.max(0, total - marked);

    // Percentage formula: (present + late) / total students * 100
    const percentage = total > 0 ? Math.round(((present + late) / total) * 1000) / 10 : 0;

    return { total, present, late, absent, unmarked, percentage, marked };
  }, [students, attendanceMarks]);

  const isSubmitted = session?.status === 'SUBMITTED';

  // Mark single student
  const handleMarkStatus = (studentId: string, status: AttendanceStatus) => {
    if (isSubmitted) return;
    setAttendanceMarks(prev => ({
      ...prev,
      [studentId]: status
    }));
    setHasUnsavedChanges(true);
    setSubmitError('');
  };

  // Mark All Present
  const handleMarkAllPresent = () => {
    if (isSubmitted) return;
    const newMarks: Record<string, AttendanceStatus> = {};
    for (const st of students) {
      newMarks[st.id] = 'PRESENT';
    }
    setAttendanceMarks(newMarks);
    setHasUnsavedChanges(true);
    setSubmitError('');
  };

  // Save Progress (Draft)
  const handleSaveProgress = async () => {
    if (isSubmitted) return;
    setSavingProgress(true);
    setSubmitError('');
    setSuccessToast('');

    try {
      const records = Object.entries(attendanceMarks).map(([studentId, status]) => ({
        studentId,
        status,
        remarks: remarks[studentId] || null
      }));

      const res = await apiFetch<{ message: string; session: AttendanceSession }>(
        '/api/attendance/save',
        {
          method: 'POST',
          body: JSON.stringify({
            classroomId: selectedClassroomId,
            date: selectedDate,
            notes: sessionNotes,
            records
          })
        }
      );

      setSession(prev => ({
        ...(prev || ({} as any)),
        id: res.session.id,
        status: 'OPEN',
        date: selectedDate,
        notes: sessionNotes
      }));
      setHasUnsavedChanges(false);
      setSuccessToast('Draft saved successfully! You can resume marking anytime.');
      setTimeout(() => setSuccessToast(''), 4000);
    } catch (err: any) {
      setSubmitError(err.message || 'Failed to save attendance progress');
    } finally {
      setSavingProgress(false);
    }
  };

  // Click Submit Attendance Button: Check incomplete and open confirmation modal
  const handleInitiateSubmit = () => {
    if (isSubmitted) return;

    if (counts.unmarked > 0) {
      setSubmitError(
        `Cannot submit incomplete register: ${counts.unmarked} student(s) remain unmarked. Every enrolled student must have an attendance status marked before submission.`
      );
      return;
    }

    setSubmitError('');
    setShowConfirmModal(true);
  };

  // Confirm Submit
  const handleConfirmSubmit = async () => {
    setShowConfirmModal(false);
    setSubmitting(true);
    setSubmitError('');
    setSuccessToast('');

    try {
      const records = students.map(st => ({
        studentId: st.id,
        status: attendanceMarks[st.id] || 'PRESENT',
        remarks: remarks[st.id] || null
      }));

      const res = await apiFetch<{ message: string; session: AttendanceSession }>(
        '/api/attendance/submit',
        {
          method: 'POST',
          body: JSON.stringify({
            classroomId: selectedClassroomId,
            date: selectedDate,
            notes: sessionNotes,
            records
          })
        }
      );

      setSession(prev => ({
        ...(prev || ({} as any)),
        id: res.session.id,
        status: 'SUBMITTED',
        date: selectedDate,
        notes: sessionNotes,
        submittedByName: user?.fullName
      }));
      setHasUnsavedChanges(false);
      setSuccessToast('Attendance register finalized and submitted successfully!');
      setTimeout(() => setSuccessToast(''), 5000);
    } catch (err: any) {
      setSubmitError(err.message || 'Failed to submit attendance register');
    } finally {
      setSubmitting(false);
    }
  };

  // Open Student History Modal
  const handleOpenStudentHistory = async (studentId: string) => {
    setHistoryStudentId(studentId);
    setLoadingHistory(true);
    try {
      const data = await apiFetch<StudentHistoryData>(`/api/attendance/students/${studentId}`);
      setHistoryData(data);
    } catch (err: any) {
      console.error('Failed to load student history:', err);
    } finally {
      setLoadingHistory(false);
    }
  };

  const selectedClassroom = classrooms.find(c => c.id === selectedClassroomId);

  return (
    <main className="p-4 sm:p-6 lg:p-8 flex-1 max-w-7xl mx-auto w-full">
      {/* Top Header & View Tabs */}
      <div className="flex flex-col md:flex-row md:items-center justify-between pb-6 border-b border-gray-200 gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight flex items-center gap-2">
              <ClipboardCheck className="w-7 h-7 text-brand-700" />
              Daily Attendance Register
            </h1>
            <StatusBadge
              status={isSubmitted ? 'ACTIVE' : session ? 'LATE' : 'INACTIVE'}
              label={isSubmitted ? 'Submitted' : session ? 'Draft Open' : 'Not Started'}
            />
          </div>
          <p className="text-sm text-gray-500 mt-1">
            {isTeacher
              ? 'Mark student attendance for your assigned classrooms and submit daily records'
              : 'Take classroom attendance or review organization-wide daily registers and percentages'}
          </p>
        </div>

        {/* View Switcher for Admins */}
        <div className="flex items-center gap-2 bg-gray-100 p-1 rounded-lg border border-gray-200 self-start md:self-auto">
          <button
            onClick={() => setActiveTab('register')}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors flex items-center gap-1.5 ${
              activeTab === 'register'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <UserCheck className="w-3.5 h-3.5" />
            Classroom Register
          </button>
          {!isTeacher && (
            <button
              onClick={() => setActiveTab('overview')}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors flex items-center gap-1.5 ${
                activeTab === 'overview'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              Organization Overview
            </button>
          )}
        </div>
      </div>

      {/* Global Alerts / Toasts */}
      {successToast && (
        <div className="mt-4 p-4 rounded-lg bg-emerald-50 border border-emerald-200 text-sm text-emerald-800 flex items-center justify-between animate-fade-in">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
            <span className="font-medium">{successToast}</span>
          </div>
          <button onClick={() => setSuccessToast('')} className="text-emerald-700 hover:text-emerald-900 text-xs">
            Dismiss
          </button>
        </div>
      )}

      {submitError && (
        <div className="mt-4 p-4 rounded-lg bg-rose-50 border border-rose-200 text-sm text-rose-800 flex items-start gap-2 animate-fade-in">
          <AlertCircle className="w-5 h-5 text-rose-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <span className="font-semibold">Attention: </span>
            <span>{submitError}</span>
          </div>
        </div>
      )}

      {/* TAB 1: CLASSROOM ATTENDANCE REGISTER */}
      {activeTab === 'register' && (
        <div className="mt-6 space-y-6">
          {/* Controls Filter Bar: Classroom Selector & Date Picker */}
          <div className="bg-white p-4 sm:p-5 rounded-xl border border-gray-200 shadow-sm flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 flex-1">
              {/* Classroom Selector */}
              <div className="flex-1 min-w-[240px]">
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
                  Classroom Cohort
                </label>
                {loadingClassrooms ? (
                  <div className="h-10 bg-gray-100 rounded-lg animate-pulse" />
                ) : classrooms.length === 0 ? (
                  <div className="p-2.5 bg-amber-50 rounded-lg border border-amber-200 text-xs text-amber-800">
                    No assigned active classrooms found. Contact your organization administrator.
                  </div>
                ) : (
                  <select
                    value={selectedClassroomId}
                    onChange={e => {
                      if (hasUnsavedChanges && !confirm('You have unsaved changes. Switch classroom anyway?')) {
                        return;
                      }
                      setSelectedClassroomId(e.target.value);
                    }}
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-300 rounded-lg text-sm font-medium text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-500"
                  >
                    {classrooms.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.name} • {c.schoolName} ({c.studentCount} students)
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* Date Picker */}
              <div className="min-w-[170px]">
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
                  Attendance Date
                </label>
                <div className="relative">
                  <input
                    type="date"
                    value={selectedDate}
                    max={getTodayString()}
                    onChange={e => {
                      if (hasUnsavedChanges && !confirm('You have unsaved changes. Switch date anyway?')) {
                        return;
                      }
                      setSelectedDate(e.target.value);
                    }}
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-300 rounded-lg text-sm font-medium text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>
              </div>
            </div>

            {/* Session Status Pill & Unsaved Indicator */}
            <div className="flex items-center gap-3 pt-2 md:pt-0 border-t md:border-t-0 border-gray-100 justify-between md:justify-end">
              {hasUnsavedChanges ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-300 animate-pulse">
                  <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
                  Unsaved Changes
                </span>
              ) : isSubmitted ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                  <Lock className="w-3.5 h-3.5 text-emerald-700" />
                  Register Finalized
                </span>
              ) : session ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-sky-100 text-sky-800 border border-sky-300">
                  <Check className="w-3.5 h-3.5 text-sky-700" />
                  Draft Saved
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600 border border-gray-200">
                  New Register
                </span>
              )}

              {!isSubmitted && students.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleMarkAllPresent}
                  className="text-xs font-semibold border-brand-300 text-brand-800 hover:bg-brand-50 gap-1.5"
                >
                  <UserCheck className="w-4 h-4 text-brand-600" />
                  Mark All Present
                </Button>
              )}
            </div>
          </div>

          {/* Locked Register Banner */}
          {isSubmitted && (
            <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-emerald-900">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-emerald-100 rounded-lg text-emerald-700">
                  <Lock className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm font-bold">This attendance register is finalized & submitted</h4>
                  <p className="text-xs text-emerald-700 mt-0.5">
                    Submitted by {session?.submittedByName || 'Assigned Teacher'} on{' '}
                    {session?.submittedAt ? new Date(session.submittedAt).toLocaleDateString() : 'today'}. Records are protected against unintended modifications.
                  </p>
                </div>
              </div>
              <StatusBadge status="ACTIVE" label="Submission Locked" />
            </div>
          )}

          {/* Metric Summary Counters */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
              <span className="text-xs font-medium text-gray-500 uppercase">Enrolled</span>
              <p className="text-2xl font-extrabold text-gray-900 mt-1">{counts.total}</p>
              <p className="text-[11px] text-gray-400 mt-0.5">Active students</p>
            </div>

            <div className="bg-white p-4 rounded-xl border border-emerald-200 shadow-sm bg-emerald-50/20">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-emerald-700 uppercase">Present</span>
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              </div>
              <p className="text-2xl font-extrabold text-emerald-700 mt-1">{counts.present}</p>
              <p className="text-[11px] text-emerald-600 mt-0.5">In attendance</p>
            </div>

            <div className="bg-white p-4 rounded-xl border border-amber-200 shadow-sm bg-amber-50/20">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-amber-700 uppercase">Late</span>
                <Clock className="w-4 h-4 text-amber-600" />
              </div>
              <p className="text-2xl font-extrabold text-amber-700 mt-1">{counts.late}</p>
              <p className="text-[11px] text-amber-600 mt-0.5">Tardy arrivals</p>
            </div>

            <div className="bg-white p-4 rounded-xl border border-rose-200 shadow-sm bg-rose-50/20">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-rose-700 uppercase">Absent</span>
                <XCircle className="w-4 h-4 text-rose-600" />
              </div>
              <p className="text-2xl font-extrabold text-rose-700 mt-1">{counts.absent}</p>
              <p className="text-[11px] text-rose-600 mt-0.5">Not present</p>
            </div>

            <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
              <span className="text-xs font-bold text-gray-500 uppercase">Unmarked</span>
              <p className={`text-2xl font-extrabold mt-1 ${counts.unmarked > 0 ? 'text-amber-600' : 'text-gray-400'}`}>
                {counts.unmarked}
              </p>
              <p className="text-[11px] text-gray-400 mt-0.5">Must be 0 to submit</p>
            </div>

            <div className="bg-white p-4 rounded-xl border border-brand-200 shadow-sm bg-brand-50/30">
              <span className="text-xs font-bold text-brand-800 uppercase">Attendance %</span>
              <p className="text-2xl font-extrabold text-brand-900 mt-1">{counts.percentage}%</p>
              <p className="text-[11px] text-brand-700 mt-0.5">(Present + Late) / Total</p>
            </div>
          </div>

          {/* Student Roster Register */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="p-4 sm:p-5 border-b border-gray-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-gray-50/50">
              <div>
                <h3 className="text-base font-bold text-gray-900">
                  Classroom Roster: {selectedClassroom?.name || 'Selected Class'}
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Tap status for each child. Tap child name to view historical attendance logs.
                </p>
              </div>
              <div className="text-xs font-medium text-gray-500">
                Date: <span className="font-semibold text-gray-800">{selectedDate}</span>
              </div>
            </div>

            {loadingSession ? (
              <div className="p-5">
                <TableSkeleton rows={5} cols={3} />
              </div>
            ) : students.length === 0 ? (
              <EmptyState
                icon={Users}
                title="No students enrolled"
                description="There are no active enrolled students in this classroom cohort. Enrol students under Students & Enrolment first."
                className="border-0 shadow-none rounded-none py-10"
              />
            ) : (
              <div className="divide-y divide-gray-100">
                {students.map((student, idx) => {
                  const currentStatus = attendanceMarks[student.id];

                  return (
                    <div
                      key={student.id}
                      className={`p-4 sm:px-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-colors ${
                        currentStatus === 'PRESENT'
                          ? 'bg-emerald-50/30'
                          : currentStatus === 'LATE'
                          ? 'bg-amber-50/30'
                          : currentStatus === 'ABSENT'
                          ? 'bg-rose-50/30'
                          : 'hover:bg-gray-50/60'
                      }`}
                    >
                      {/* Student Details */}
                      <div className="flex items-center gap-3.5 min-w-[200px]">
                        <span className="text-xs font-mono font-semibold text-gray-400 w-6 text-right">
                          {idx + 1}.
                        </span>
                        <div>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleOpenStudentHistory(student.id)}
                              className="text-sm font-bold text-gray-900 hover:text-brand-700 hover:underline text-left flex items-center gap-1 group"
                              title="Click to view student attendance history"
                            >
                              {student.firstName} {student.lastName}
                              <History className="w-3.5 h-3.5 text-gray-400 group-hover:text-brand-600" />
                            </button>
                            <span className="text-xs font-mono bg-gray-100 text-gray-600 px-2 py-0.5 rounded border border-gray-200">
                              {student.rollNumber}
                            </span>
                          </div>
                          <p className="text-xs text-gray-500 mt-0.5">
                            {student.gender || 'Student'} {student.guardianName && `• Guardian: ${student.guardianName}`}
                          </p>
                        </div>
                      </div>

                      {/* Status Selection Buttons (Large touch targets for mobile) */}
                      <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
                        <button
                          type="button"
                          disabled={isSubmitted}
                          onClick={() => handleMarkStatus(student.id, 'PRESENT')}
                          className={`flex-1 sm:flex-none px-4 py-2.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 min-w-[96px] ${
                            currentStatus === 'PRESENT'
                              ? 'bg-emerald-600 text-white shadow-sm ring-2 ring-emerald-600 ring-offset-1'
                              : 'bg-white border border-gray-300 text-gray-700 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-300'
                          } ${isSubmitted ? 'opacity-85 cursor-not-allowed' : ''}`}
                        >
                          <CheckCircle2 className="w-4 h-4" />
                          PRESENT
                        </button>

                        <button
                          type="button"
                          disabled={isSubmitted}
                          onClick={() => handleMarkStatus(student.id, 'LATE')}
                          className={`flex-1 sm:flex-none px-4 py-2.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 min-w-[85px] ${
                            currentStatus === 'LATE'
                              ? 'bg-amber-500 text-white shadow-sm ring-2 ring-amber-500 ring-offset-1'
                              : 'bg-white border border-gray-300 text-gray-700 hover:bg-amber-50 hover:text-amber-700 hover:border-amber-300'
                          } ${isSubmitted ? 'opacity-85 cursor-not-allowed' : ''}`}
                        >
                          <Clock className="w-4 h-4" />
                          LATE
                        </button>

                        <button
                          type="button"
                          disabled={isSubmitted}
                          onClick={() => handleMarkStatus(student.id, 'ABSENT')}
                          className={`flex-1 sm:flex-none px-4 py-2.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 min-w-[90px] ${
                            currentStatus === 'ABSENT'
                              ? 'bg-rose-600 text-white shadow-sm ring-2 ring-rose-600 ring-offset-1'
                              : 'bg-white border border-gray-300 text-gray-700 hover:bg-rose-50 hover:text-rose-700 hover:border-rose-300'
                          } ${isSubmitted ? 'opacity-85 cursor-not-allowed' : ''}`}
                        >
                          <XCircle className="w-4 h-4" />
                          ABSENT
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Session Notes Input */}
            {students.length > 0 && (
              <div className="p-4 sm:p-5 bg-gray-50 border-t border-gray-200">
                <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1.5">
                  Daily Classroom Notes / Remarks (Optional)
                </label>
                <input
                  type="text"
                  disabled={isSubmitted}
                  value={sessionNotes}
                  onChange={e => {
                    setSessionNotes(e.target.value);
                    setHasUnsavedChanges(true);
                  }}
                  placeholder="e.g. Rainy morning, special assembly, or remarks for this date"
                  className="w-full px-3.5 py-2 bg-white border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:bg-gray-100 disabled:text-gray-500"
                />
              </div>
            )}

            {/* Action Bar: Save Progress & Submit Attendance */}
            {students.length > 0 && !isSubmitted && (
              <div className="p-4 sm:p-5 bg-white border-t border-gray-200 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                <div className="text-xs text-gray-500 flex items-center gap-2">
                  <span>{counts.marked} of {counts.total} marked</span>
                  <span>•</span>
                  <span className={counts.unmarked > 0 ? 'text-amber-600 font-semibold' : 'text-emerald-600 font-semibold'}>
                    {counts.unmarked > 0 ? `${counts.unmarked} unmarked remaining` : 'All students marked!'}
                  </span>
                </div>

                <div className="flex items-center gap-3">
                  <Button
                    variant="outline"
                    onClick={handleSaveProgress}
                    disabled={savingProgress || isSubmitted}
                    className="gap-2 border-gray-300 text-gray-700 hover:bg-gray-50 flex-1 sm:flex-none justify-center"
                  >
                    <Save className="w-4 h-4 text-gray-600" />
                    {savingProgress ? 'Saving Draft...' : 'Save Progress'}
                  </Button>

                  <Button
                    onClick={handleInitiateSubmit}
                    disabled={submitting || isSubmitted}
                    className="gap-2 bg-brand-700 hover:bg-brand-800 text-white font-semibold flex-1 sm:flex-none justify-center"
                  >
                    <Send className="w-4 h-4 text-white" />
                    {submitting ? 'Submitting...' : 'Submit Attendance'}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: ADMINISTRATOR OVERVIEW */}
      {activeTab === 'overview' && (
        <div className="mt-6 space-y-6">
          {/* Overview Filter Bar */}
          <div className="bg-white p-4 sm:p-5 rounded-xl border border-gray-200 shadow-sm flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3 flex-1">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
                  Summary Date
                </label>
                <input
                  type="date"
                  value={selectedDate}
                  max={getTodayString()}
                  onChange={e => setSelectedDate(e.target.value)}
                  className="px-3 py-2 bg-gray-50 border border-gray-300 rounded-lg text-sm font-medium text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>

              <div className="flex-1 max-w-xs">
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
                  School / Centre Filter
                </label>
                <select
                  value={overviewSchoolFilter}
                  onChange={e => setOverviewSchoolFilter(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-300 rounded-lg text-sm font-medium text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-500"
                >
                  <option value="">All Schools</option>
                  {Array.from(new Set(classrooms.map(c => JSON.stringify({ id: c.schoolId, name: c.schoolName })))).map(
                    str => {
                      const s = JSON.parse(str);
                      return (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      );
                    }
                  )}
                </select>
              </div>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => loadOverview(selectedDate, overviewSchoolFilter)}
              className="gap-2 text-xs"
            >
              Refresh Data
            </Button>
          </div>

          {/* Overview Metric Cards */}
          {overviewData?.summary && (
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-3">
              <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                <span className="text-xs font-semibold text-gray-500 uppercase">Classrooms</span>
                <p className="text-2xl font-extrabold text-gray-900 mt-1">
                  {overviewData.summary.submittedCount} / {overviewData.summary.totalClassrooms}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">Registers submitted</p>
              </div>

              <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                <span className="text-xs font-semibold text-gray-500 uppercase">Enrolled Students</span>
                <p className="text-2xl font-extrabold text-gray-900 mt-1">
                  {overviewData.summary.totalStudents}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">Across filtered cohorts</p>
              </div>

              <div className="bg-white p-4 rounded-xl border border-emerald-200 shadow-sm bg-emerald-50/20">
                <span className="text-xs font-bold text-emerald-700 uppercase">Present</span>
                <p className="text-2xl font-extrabold text-emerald-700 mt-1">
                  {overviewData.summary.totalPresent}
                </p>
                <p className="text-xs text-emerald-600 mt-0.5">Children marked present</p>
              </div>

              <div className="bg-white p-4 rounded-xl border border-amber-200 shadow-sm bg-amber-50/20">
                <span className="text-xs font-bold text-amber-700 uppercase">Late</span>
                <p className="text-2xl font-extrabold text-amber-700 mt-1">
                  {overviewData.summary.totalLate}
                </p>
                <p className="text-xs text-amber-600 mt-0.5">Children marked late</p>
              </div>

              <div className="bg-white p-4 rounded-xl border border-brand-200 shadow-sm bg-brand-50/40 col-span-2 sm:col-span-1">
                <span className="text-xs font-bold text-brand-800 uppercase">Overall Attendance</span>
                <p className="text-2xl font-extrabold text-brand-900 mt-1">
                  {overviewData.summary.overallPercentage}%
                </p>
                <p className="text-xs text-brand-700 mt-0.5">(Present + Late) / Total</p>
              </div>
            </div>
          )}

          {/* Overview Table */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-gray-200 bg-gray-50/50 flex items-center justify-between">
              <h3 className="text-sm font-bold text-gray-900">
                Classroom Status Breakdown for {selectedDate}
              </h3>
              <span className="text-xs text-gray-500">
                {overviewData?.classrooms.length || 0} classrooms
              </span>
            </div>

            {loadingOverview ? (
              <div className="p-12 text-center text-gray-500">
                <div className="inline-block w-8 h-8 border-4 border-brand-600 border-t-transparent rounded-full animate-spin" />
                <p className="text-sm mt-3 font-medium">Loading organization attendance summary...</p>
              </div>
            ) : overviewData?.classrooms.length === 0 ? (
              <div className="p-8 text-center text-gray-500 text-sm">
                No active classrooms found matching filters.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 bg-gray-50 text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                      <th className="py-3 px-4">School & Code</th>
                      <th className="py-3 px-4">Classroom</th>
                      <th className="py-3 px-4">Register Status</th>
                      <th className="py-3 px-4 text-center">Enrolled</th>
                      <th className="py-3 px-4 text-center">Present</th>
                      <th className="py-3 px-4 text-center">Late</th>
                      <th className="py-3 px-4 text-center">Absent</th>
                      <th className="py-3 px-4 text-center">Unmarked</th>
                      <th className="py-3 px-4">Attendance Rate</th>
                      <th className="py-3 px-4 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {overviewData?.classrooms.map(row => (
                      <tr key={row.classroomId} className="hover:bg-gray-50/80 transition-colors">
                        <td className="py-3.5 px-4">
                          <p className="font-semibold text-gray-900">{row.schoolName}</p>
                          <p className="text-xs font-mono text-gray-400">{row.schoolCode}</p>
                        </td>
                        <td className="py-3.5 px-4 font-medium text-gray-800">
                          {row.classroomName}
                          {row.gradeLevel && <span className="text-xs text-gray-400 block">{row.gradeLevel}</span>}
                        </td>
                        <td className="py-3.5 px-4">
                          <StatusBadge
                            status={
                              row.sessionStatus === 'SUBMITTED'
                                ? 'ACTIVE'
                                : row.sessionStatus === 'OPEN'
                                ? 'LATE'
                                : 'INACTIVE'
                            }
                            label={
                              row.sessionStatus === 'SUBMITTED'
                                ? 'Submitted'
                                : row.sessionStatus === 'OPEN'
                                ? 'Draft Open'
                                : 'Not Started'
                            }
                          />
                        </td>
                        <td className="py-3.5 px-4 text-center font-bold text-gray-700">{row.totalStudents}</td>
                        <td className="py-3.5 px-4 text-center font-bold text-emerald-700">{row.presentCount}</td>
                        <td className="py-3.5 px-4 text-center font-bold text-amber-700">{row.lateCount}</td>
                        <td className="py-3.5 px-4 text-center font-bold text-rose-700">{row.absentCount}</td>
                        <td className="py-3.5 px-4 text-center font-bold text-gray-400">{row.unmarkedCount}</td>
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-2">
                            <div className="w-16 bg-gray-200 rounded-full h-2 overflow-hidden">
                              <div
                                className="bg-brand-600 h-2 rounded-full"
                                style={{ width: `${Math.min(100, row.attendancePercentage)}%` }}
                              />
                            </div>
                            <span className="text-xs font-bold text-gray-800">{row.attendancePercentage}%</span>
                          </div>
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setSelectedClassroomId(row.classroomId);
                              setActiveTab('register');
                            }}
                            className="text-xs gap-1"
                          >
                            Open Register
                            <ChevronRight className="w-3.5 h-3.5" />
                          </Button>
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

      {/* CONFIRMATION MODAL BEFORE SUBMIT */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-gray-200 animate-scale-in">
            <div className="flex items-center gap-3 text-brand-800 mb-4">
              <div className="p-3 bg-brand-100 rounded-xl">
                <Send className="w-6 h-6 text-brand-700" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-gray-900">Confirm Attendance Submission</h3>
                <p className="text-xs text-gray-500">Finalize daily attendance register</p>
              </div>
            </div>

            <div className="bg-gray-50 p-4 rounded-xl border border-gray-200 space-y-2 text-sm mb-5">
              <div className="flex justify-between">
                <span className="text-gray-500">Classroom:</span>
                <span className="font-semibold text-gray-800">{selectedClassroom?.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Date:</span>
                <span className="font-semibold text-gray-800">{selectedDate}</span>
              </div>
              <div className="flex justify-between border-t border-gray-200 pt-2">
                <span className="text-gray-500">Total Enrolled:</span>
                <span className="font-bold text-gray-900">{counts.total} students</span>
              </div>
              <div className="flex justify-between">
                <span className="text-emerald-700 font-medium">Present:</span>
                <span className="font-bold text-emerald-700">{counts.present}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-amber-700 font-medium">Late:</span>
                <span className="font-bold text-amber-700">{counts.late}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-rose-700 font-medium">Absent:</span>
                <span className="font-bold text-rose-700">{counts.absent}</span>
              </div>
              <div className="flex justify-between border-t border-gray-200 pt-2">
                <span className="text-brand-800 font-bold">Attendance Rate:</span>
                <span className="font-extrabold text-brand-800">{counts.percentage}%</span>
              </div>
            </div>

            <p className="text-xs text-gray-500 mb-6 bg-amber-50 border border-amber-200 p-3 rounded-lg text-amber-800">
              Note: Once submitted, this register is finalized. You will not be able to modify records without administrative intervention.
            </p>

            <div className="flex items-center justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => setShowConfirmModal(false)}
                className="text-sm font-semibold"
              >
                Cancel
              </Button>
              <Button
                onClick={handleConfirmSubmit}
                className="bg-brand-700 hover:bg-brand-800 text-white font-semibold gap-1.5"
              >
                <CheckCircle2 className="w-4 h-4" />
                Confirm & Submit
              </Button>
            </div>
          </div>
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
                    <span className="text-[10px] font-semibold text-gray-400 uppercase">Total Marked</span>
                    <p className="text-lg font-bold text-gray-900 mt-0.5">{historyData.stats.totalDays} days</p>
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

                {/* History Timeline List */}
                <div className="divide-y divide-gray-100 border border-gray-200 rounded-xl overflow-hidden">
                  {historyData.history.length === 0 ? (
                    <div className="p-6 text-center text-xs text-gray-400">
                      No attendance sessions recorded yet for this student.
                    </div>
                  ) : (
                    historyData.history.map(rec => (
                      <div key={rec.id} className="p-3.5 flex items-center justify-between text-xs hover:bg-gray-50">
                        <div>
                          <p className="font-semibold text-gray-900">
                            {new Date(rec.date).toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric'
                            })}
                          </p>
                          <p className="text-[11px] text-gray-400 mt-0.5">
                            Classroom: {rec.classroomName} {rec.markedByName && `• Marked by ${rec.markedByName}`}
                          </p>
                          {rec.remarks && (
                            <p className="text-[11px] text-amber-700 mt-0.5 italic flex items-center gap-1">
                              <MessageSquare className="w-3 h-3" />
                              {rec.remarks}
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
