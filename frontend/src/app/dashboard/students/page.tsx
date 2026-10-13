'use client';

import React, { useState, useEffect } from 'react';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { Button, Input, Select, StatusBadge, Modal, ConfirmDialog, EmptyState } from '@/components/ui/components';
import {
  GraduationCap,
  Plus,
  Search,
  Edit2,
  Power,
  School,
  Users,
  Phone,
  Calendar,
  History,
  ArrowRightLeft,
  RefreshCw,
  AlertCircle,
  Clock,
  User
} from 'lucide-react';

interface StudentItem {
  id: string;
  rollNumber: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string | null;
  gender: string | null;
  guardianName: string | null;
  guardianContact: string | null;
  isActive: boolean;
  organizationId: string;
  schoolId: string;
  schoolName: string;
  schoolCode: string;
  classroomId: string | null;
  classroomName: string | null;
  gradeLevel: string | null;
  enrolledAt: string | null;
  createdAt: string;
}

interface EnrollmentHistoryItem {
  id: string;
  classroomId: string;
  classroomName: string;
  gradeLevel: string | null;
  enrolledAt: string;
  endedAt: string | null;
  isActive: boolean;
  schoolName: string;
}

interface SchoolOption {
  id: string;
  name: string;
  code: string;
}

interface ClassroomOption {
  id: string;
  name: string;
  schoolId: string;
  gradeLevel: string | null;
}

export default function StudentsManagementPage() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'directory' | 'roster'>('directory');
  const [students, setStudents] = useState<StudentItem[]>([]);
  const [schools, setSchools] = useState<SchoolOption[]>([]);
  const [classrooms, setClassrooms] = useState<ClassroomOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Filters
  const [search, setSearch] = useState('');
  const [filterSchoolId, setFilterSchoolId] = useState('');
  const [filterClassroomId, setFilterClassroomId] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');

  // Roster Tab specific state
  const [rosterClassroomId, setRosterClassroomId] = useState('');
  const [rosterData, setRosterData] = useState<{ classroom: any; roster: any[] } | null>(null);
  const [rosterLoading, setRosterLoading] = useState(false);

  // Add / Edit Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingStudent, setEditingStudent] = useState<StudentItem | null>(null);
  const [formSchoolId, setFormSchoolId] = useState('');
  const [formRollNumber, setFormRollNumber] = useState('');
  const [formFirstName, setFormFirstName] = useState('');
  const [formLastName, setFormLastName] = useState('');
  const [formDob, setFormDob] = useState('');
  const [formGender, setFormGender] = useState<'MALE' | 'FEMALE' | 'OTHER' | ''>('');
  const [formGuardianName, setFormGuardianName] = useState('');
  const [formGuardianContact, setFormGuardianContact] = useState('');
  const [formClassroomId, setFormClassroomId] = useState('');
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Transfer / Enrollment Modal states
  const [transferringStudent, setTransferringStudent] = useState<StudentItem | null>(null);
  const [transferTargetClassId, setTransferTargetClassId] = useState('');
  const [transferError, setTransferError] = useState('');
  const [transferSubmitting, setTransferSubmitting] = useState(false);

  // History timeline modal states
  const [historyStudent, setHistoryStudent] = useState<StudentItem | null>(null);
  const [historyTimeline, setHistoryTimeline] = useState<EnrollmentHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Deactivate dialog
  const [deactivatingStudent, setDeactivatingStudent] = useState<StudentItem | null>(null);
  const [deactivatingLoading, setDeactivatingLoading] = useState(false);

  const fetchDropdowns = async () => {
    try {
      const [schoolsData, classroomsData] = await Promise.all([
        apiFetch<{ schools: any[] }>('/api/schools?status=active'),
        apiFetch<{ classrooms: any[] }>('/api/classrooms?status=active')
      ]);
      setSchools(schoolsData.schools || []);
      setClassrooms(classroomsData.classrooms || []);
      if (classroomsData.classrooms?.length > 0 && !rosterClassroomId) {
        setRosterClassroomId(classroomsData.classrooms[0].id);
      }
    } catch (err) {
      console.error('Failed to load filter dropdowns:', err);
    }
  };

  const fetchStudents = async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (search) params.append('search', search);
      if (filterSchoolId) params.append('schoolId', filterSchoolId);
      if (filterClassroomId) params.append('classroomId', filterClassroomId);
      if (statusFilter !== 'all') params.append('status', statusFilter);

      const data = await apiFetch<{ students: StudentItem[] }>(`/api/students?${params.toString()}`);
      setStudents(data.students || []);
    } catch (err: any) {
      setError(err.message || 'Failed to retrieve students');
    } finally {
      setLoading(false);
    }
  };

  const fetchRoster = async (classId: string) => {
    if (!classId) return;
    setRosterLoading(true);
    try {
      const data = await apiFetch<{ classroom: any; roster: any[] }>(`/api/classrooms/${classId}/roster`);
      setRosterData(data);
    } catch (err: any) {
      setError(err.message || 'Failed to retrieve classroom roster');
    } finally {
      setRosterLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      fetchDropdowns();
      fetchStudents();
    }
  }, [user, filterSchoolId, filterClassroomId, statusFilter]);

  useEffect(() => {
    if (activeTab === 'roster' && rosterClassroomId) {
      fetchRoster(rosterClassroomId);
    }
  }, [activeTab, rosterClassroomId]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchStudents();
  };

  const openCreateModal = () => {
    setEditingStudent(null);
    setFormSchoolId(schools[0]?.id || '');
    setFormRollNumber('');
    setFormFirstName('');
    setFormLastName('');
    setFormDob('');
    setFormGender('');
    setFormGuardianName('');
    setFormGuardianContact('');
    setFormClassroomId('');
    setFormError('');
    setIsModalOpen(true);
  };

  const openEditModal = (stu: StudentItem) => {
    setEditingStudent(stu);
    setFormSchoolId(stu.schoolId);
    setFormRollNumber(stu.rollNumber);
    setFormFirstName(stu.firstName);
    setFormLastName(stu.lastName || '');
    setFormDob(stu.dateOfBirth ? stu.dateOfBirth.split('T')[0] : '');
    setFormGender((stu.gender as any) || '');
    setFormGuardianName(stu.guardianName || '');
    setFormGuardianContact(stu.guardianContact || '');
    setFormClassroomId(stu.classroomId || '');
    setFormError('');
    setIsModalOpen(true);
  };

  const openTransferModal = (stu: StudentItem) => {
    setTransferringStudent(stu);
    setTransferTargetClassId('');
    setTransferError('');
  };

  const openHistoryModal = async (stu: StudentItem) => {
    setHistoryStudent(stu);
    setHistoryLoading(true);
    try {
      const data = await apiFetch<{ student: StudentItem; enrollmentHistory: EnrollmentHistoryItem[] }>(
        `/api/students/${stu.id}`
      );
      setHistoryTimeline(data.enrollmentHistory || []);
    } catch (err: any) {
      alert(err.message || 'Failed to load enrollment history');
      setHistoryStudent(null);
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    setSubmitting(true);

    try {
      if (editingStudent) {
        await apiFetch(`/api/students/${editingStudent.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            schoolId: formSchoolId,
            rollNumber: formRollNumber.trim(),
            firstName: formFirstName.trim(),
            lastName: formLastName.trim(),
            dateOfBirth: formDob || null,
            gender: formGender || null,
            guardianName: formGuardianName.trim() || null,
            guardianContact: formGuardianContact.trim() || null
          })
        });
      } else {
        await apiFetch('/api/students', {
          method: 'POST',
          body: JSON.stringify({
            schoolId: formSchoolId,
            rollNumber: formRollNumber.trim(),
            firstName: formFirstName.trim(),
            lastName: formLastName.trim(),
            dateOfBirth: formDob || null,
            gender: formGender || null,
            guardianName: formGuardianName.trim() || null,
            guardianContact: formGuardianContact.trim() || null,
            classroomId: formClassroomId || null
          })
        });
      }

      setIsModalOpen(false);
      await fetchStudents();
      if (activeTab === 'roster' && rosterClassroomId) {
        await fetchRoster(rosterClassroomId);
      }
    } catch (err: any) {
      setFormError(err.message || 'Failed to save student record');
    } finally {
      setSubmitting(false);
    }
  };

  const handleTransferSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!transferringStudent || !transferTargetClassId) return;

    setTransferError('');
    setTransferSubmitting(true);
    try {
      await apiFetch(`/api/students/${transferringStudent.id}/enroll`, {
        method: 'POST',
        body: JSON.stringify({ classroomId: transferTargetClassId })
      });
      setTransferringStudent(null);
      await fetchStudents();
      if (activeTab === 'roster' && rosterClassroomId) {
        await fetchRoster(rosterClassroomId);
      }
    } catch (err: any) {
      setTransferError(err.message || 'Failed to transfer student');
    } finally {
      setTransferSubmitting(false);
    }
  };

  const handleToggleActive = async () => {
    if (!deactivatingStudent) return;
    setDeactivatingLoading(true);

    try {
      await apiFetch(`/api/students/${deactivatingStudent.id}/deactivate`, {
        method: 'PATCH'
      });
      setDeactivatingStudent(null);
      await fetchStudents();
      if (activeTab === 'roster' && rosterClassroomId) {
        await fetchRoster(rosterClassroomId);
      }
    } catch (err: any) {
      alert(err.message || 'Failed to update student status');
    } finally {
      setDeactivatingLoading(false);
    }
  };

  const isOrgAdminOrSuper = user?.role === 'ORG_ADMIN' || user?.role === 'PLATFORM_ADMIN';
  const availableClassroomsForSchool = classrooms.filter(
    (c) => !formSchoolId || c.schoolId === formSchoolId
  );

  return (
    <main className="p-6 sm:p-8 flex-1 max-w-7xl">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-6 border-b border-gray-200 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight flex items-center gap-2">
            <GraduationCap className="w-6 h-6 text-brand-700" />
            Students & Classroom Enrolment
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Maintain admission records, manage guardian details, and track classroom roster assignments.
          </p>
        </div>

        {isOrgAdminOrSuper && (
          <Button onClick={openCreateModal} className="gap-2">
            <Plus className="w-4 h-4" />
            Register Student
          </Button>
        )}
      </div>

      {/* Tabs Switcher */}
      <div className="mt-6 border-b border-gray-200 flex gap-6 text-sm font-medium">
        <button
          onClick={() => setActiveTab('directory')}
          className={`pb-3 border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === 'directory'
              ? 'border-brand-700 text-brand-800 font-bold'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <GraduationCap className="w-4 h-4" />
          Student Directory ({students.length})
        </button>
        <button
          onClick={() => setActiveTab('roster')}
          className={`pb-3 border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === 'roster'
              ? 'border-brand-700 text-brand-800 font-bold'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <Users className="w-4 h-4" />
          Classroom Roster View
        </button>
      </div>

      {error && (
        <div className="mt-6 p-4 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* TAB 1: STUDENT DIRECTORY */}
      {activeTab === 'directory' && (
        <div className="mt-6">
          {/* Filters Bar */}
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <form onSubmit={handleSearchSubmit} className="flex-1 flex items-center gap-2 w-full md:w-auto">
              <div className="relative flex-1 max-w-md">
                <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by student name, roll number, or guardian..."
                  className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-brand-700 focus:border-brand-700"
                />
              </div>
              <Button type="submit" variant="secondary" size="sm">
                Search
              </Button>
            </form>

            <div className="flex flex-wrap items-center gap-3 w-full md:w-auto justify-end">
              {/* School Filter */}
              <div className="w-44">
                <select
                  value={filterSchoolId}
                  onChange={(e) => setFilterSchoolId(e.target.value)}
                  className="block w-full px-2.5 py-1.5 text-xs border border-gray-300 rounded-md bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-brand-700"
                >
                  <option value="">All Schools / Centres</option>
                  {schools.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.code})
                    </option>
                  ))}
                </select>
              </div>

              {/* Classroom Filter */}
              <div className="w-44">
                <select
                  value={filterClassroomId}
                  onChange={(e) => setFilterClassroomId(e.target.value)}
                  className="block w-full px-2.5 py-1.5 text-xs border border-gray-300 rounded-md bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-brand-700"
                >
                  <option value="">All Classrooms</option>
                  {classrooms.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Status Filter */}
              <div className="inline-flex rounded-md shadow-sm border border-gray-200 bg-white p-0.5 text-xs">
                {(['all', 'active', 'inactive'] as const).map((filter) => (
                  <button
                    key={filter}
                    onClick={() => setStatusFilter(filter)}
                    className={`px-2.5 py-1 rounded capitalize font-medium transition-colors ${
                      statusFilter === filter
                        ? 'bg-brand-700 text-white shadow-xs'
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    {filter}
                  </button>
                ))}
              </div>

              <Button variant="outline" size="sm" onClick={fetchStudents} title="Refresh list">
                <RefreshCw className="w-4 h-4 text-gray-500" />
              </Button>
            </div>
          </div>

          {/* Students Directory Table */}
          <div className="mt-6">
            {loading ? (
              <div className="py-16 text-center text-gray-500 text-sm flex flex-col items-center gap-2">
                <div className="w-6 h-6 border-2 border-brand-700 border-t-transparent rounded-full animate-spin" />
                <span>Loading student records...</span>
              </div>
            ) : students.length === 0 ? (
              <EmptyState
                icon={GraduationCap}
                title="No students found"
                description={
                  search || filterSchoolId || filterClassroomId
                    ? 'No student records match the active filter criteria.'
                    : 'No students have been registered yet. Add a student to start attendance tracking.'
                }
                actionLabel={isOrgAdminOrSuper ? 'Register First Student' : undefined}
                onAction={isOrgAdminOrSuper ? openCreateModal : undefined}
              />
            ) : (
              <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200 text-left text-sm">
                    <thead className="bg-gray-50 text-gray-600 font-semibold text-xs uppercase tracking-wider">
                      <tr>
                        <th scope="col" className="px-6 py-3.5">Student Name</th>
                        <th scope="col" className="px-6 py-3.5">Roll / ID</th>
                        <th scope="col" className="px-6 py-3.5">School & Class</th>
                        <th scope="col" className="px-6 py-3.5">Guardian Details</th>
                        <th scope="col" className="px-6 py-3.5">Status</th>
                        {isOrgAdminOrSuper && (
                          <th scope="col" className="px-6 py-3.5 text-right">Actions</th>
                        )}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 bg-white">
                      {students.map((stu) => (
                        <tr key={stu.id} className="hover:bg-gray-50/70 transition-colors">
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-2.5">
                              <div className="w-8 h-8 rounded-full bg-brand-100 text-brand-800 font-semibold text-xs flex items-center justify-center shrink-0">
                                {stu.firstName[0]}
                                {stu.lastName ? stu.lastName[0] : ''}
                              </div>
                              <div>
                                <span className="font-semibold text-gray-900">
                                  {stu.firstName} {stu.lastName}
                                </span>
                                {stu.gender && (
                                  <span className="block text-[11px] text-gray-400">
                                    {stu.gender.toLowerCase()}
                                    {stu.dateOfBirth && ` • DOB: ${stu.dateOfBirth.split('T')[0]}`}
                                  </span>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <span className="inline-block px-2 py-0.5 rounded font-mono text-xs bg-gray-100 text-gray-800 font-semibold border border-gray-200">
                              {stu.rollNumber}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-xs">
                            <p className="font-medium text-gray-800">{stu.schoolName}</p>
                            {stu.classroomName ? (
                              <p className="text-brand-700 font-semibold mt-0.5">
                                {stu.classroomName}
                              </p>
                            ) : (
                              <span className="inline-block mt-0.5 text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded text-[11px] font-medium border border-amber-200">
                                Unenrolled
                              </span>
                            )}
                          </td>
                          <td className="px-6 py-4 text-xs text-gray-600">
                            {stu.guardianName ? (
                              <div>
                                <p className="font-medium text-gray-800">{stu.guardianName}</p>
                                {stu.guardianContact && (
                                  <p className="text-gray-400 flex items-center gap-1 mt-0.5">
                                    <Phone className="w-3 h-3" />
                                    {stu.guardianContact}
                                  </p>
                                )}
                              </div>
                            ) : (
                              <span className="italic text-gray-400">Not recorded</span>
                            )}
                          </td>
                          <td className="px-6 py-4">
                            <StatusBadge
                              status={stu.isActive ? 'ACTIVE' : 'INACTIVE'}
                              label={stu.isActive ? 'Active' : 'Deactivated'}
                            />
                          </td>
                          {isOrgAdminOrSuper && (
                            <td className="px-6 py-4 text-right space-x-1.5 whitespace-nowrap">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => openHistoryModal(stu)}
                                className="p-1.5"
                                title="View Enrollment History"
                              >
                                <History className="w-3.5 h-3.5 text-brand-700" />
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => openTransferModal(stu)}
                                className="p-1.5"
                                title="Transfer / Change Classroom"
                              >
                                <ArrowRightLeft className="w-3.5 h-3.5 text-blue-600" />
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => openEditModal(stu)}
                                className="p-1.5"
                                title="Edit details"
                              >
                                <Edit2 className="w-3.5 h-3.5 text-gray-600" />
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setDeactivatingStudent(stu)}
                                className={`p-1.5 ${
                                  stu.isActive
                                    ? 'text-red-600 hover:bg-red-50 hover:border-red-200'
                                    : 'text-emerald-600 hover:bg-emerald-50 hover:border-emerald-200'
                                }`}
                                title={stu.isActive ? 'Deactivate student' : 'Reactivate student'}
                              >
                                <Power className="w-3.5 h-3.5" />
                              </Button>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: CLASSROOM ROSTER VIEW */}
      {activeTab === 'roster' && (
        <div className="mt-6">
          <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="w-full sm:w-80">
              <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                Select Classroom Cohort
              </label>
              <select
                value={rosterClassroomId}
                onChange={(e) => setRosterClassroomId(e.target.value)}
                className="block w-full px-3 py-2 text-sm border border-gray-300 rounded-md bg-white text-gray-900 focus:outline-none focus:ring-1 focus:ring-brand-700"
              >
                {classrooms.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.gradeLevel || 'Section'})
                  </option>
                ))}
              </select>
            </div>

            {rosterData && (
              <div className="flex flex-wrap items-center gap-6 text-xs text-gray-600">
                <div>
                  <span className="text-gray-400 block font-medium">Campus / School:</span>
                  <span className="font-semibold text-gray-900 text-sm">
                    {rosterData.classroom?.schoolName}
                  </span>
                </div>
                <div>
                  <span className="text-gray-400 block font-medium">Assigned Teacher:</span>
                  <span className="font-semibold text-gray-900 text-sm">
                    {rosterData.classroom?.teacherName || 'None assigned'}
                  </span>
                </div>
                <div>
                  <span className="text-gray-400 block font-medium">Enrolled Roster:</span>
                  <span className="font-extrabold text-brand-700 text-sm">
                    {rosterData.roster?.length || 0} Students
                  </span>
                </div>
              </div>
            )}
          </div>

          <div className="mt-6">
            {rosterLoading ? (
              <div className="py-16 text-center text-gray-500 text-sm flex flex-col items-center gap-2">
                <div className="w-6 h-6 border-2 border-brand-700 border-t-transparent rounded-full animate-spin" />
                <span>Loading classroom roster...</span>
              </div>
            ) : !rosterData || rosterData.roster?.length === 0 ? (
              <EmptyState
                icon={Users}
                title="Classroom roster is empty"
                description="No active students are currently enrolled in this classroom cohort."
                actionLabel={isOrgAdminOrSuper ? 'Register a Student' : undefined}
                onAction={isOrgAdminOrSuper ? openCreateModal : undefined}
              />
            ) : (
              <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
                <table className="min-w-full divide-y divide-gray-200 text-left text-sm">
                  <thead className="bg-gray-50 text-gray-600 font-semibold text-xs uppercase tracking-wider">
                    <tr>
                      <th scope="col" className="px-6 py-3.5">Roll No</th>
                      <th scope="col" className="px-6 py-3.5">Student Full Name</th>
                      <th scope="col" className="px-6 py-3.5">Gender / Age</th>
                      <th scope="col" className="px-6 py-3.5">Guardian Contact</th>
                      <th scope="col" className="px-6 py-3.5">Enrolment Date</th>
                      {isOrgAdminOrSuper && (
                        <th scope="col" className="px-6 py-3.5 text-right">Actions</th>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 bg-white">
                    {rosterData.roster.map((stu) => (
                      <tr key={stu.id} className="hover:bg-gray-50/70 transition-colors">
                        <td className="px-6 py-4">
                          <span className="inline-block px-2 py-0.5 rounded font-mono text-xs bg-gray-100 text-gray-800 font-semibold border border-gray-200">
                            {stu.rollNumber}
                          </span>
                        </td>
                        <td className="px-6 py-4 font-semibold text-gray-900">
                          {stu.firstName} {stu.lastName}
                        </td>
                        <td className="px-6 py-4 text-xs text-gray-500 capitalize">
                          {stu.gender?.toLowerCase() || 'Unspecified'}
                        </td>
                        <td className="px-6 py-4 text-xs text-gray-600">
                          {stu.guardianName && <span>{stu.guardianName} </span>}
                          {stu.guardianContact && (
                            <span className="text-gray-400">({stu.guardianContact})</span>
                          )}
                          {!stu.guardianName && !stu.guardianContact && (
                            <span className="italic text-gray-400">-</span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-xs text-gray-500">
                          {stu.enrolledAt ? stu.enrolledAt.split('T')[0] : 'Active'}
                        </td>
                        {isOrgAdminOrSuper && (
                          <td className="px-6 py-4 text-right">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                const found = students.find((s) => s.id === stu.id);
                                if (found) openTransferModal(found);
                              }}
                              className="text-xs gap-1"
                            >
                              <ArrowRightLeft className="w-3 h-3 text-blue-600" />
                              Transfer
                            </Button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* CREATE / EDIT STUDENT MODAL */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingStudent ? 'Edit Student Record' : 'Register New Student'}
        description="Fill in admission identifiers, demographic details, and initial classroom enrolment."
      >
        <form onSubmit={handleFormSubmit} className="space-y-4">
          {formError && (
            <div className="p-3 rounded-md bg-red-50 border border-red-200 text-xs text-red-700">
              {formError}
            </div>
          )}

          <Select
            label="School / Learning Centre *"
            required
            value={formSchoolId}
            onChange={(e) => setFormSchoolId(e.target.value)}
          >
            {schools.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.code})
              </option>
            ))}
          </Select>

          <Input
            label="Admission / Roll Number *"
            required
            value={formRollNumber}
            onChange={(e) => setFormRollNumber(e.target.value)}
            placeholder="e.g. STU-001"
            helperText="Unique identifier within your organization"
          />

          <div className="grid grid-cols-2 gap-4">
            <Input
              label="First Name *"
              required
              value={formFirstName}
              onChange={(e) => setFormFirstName(e.target.value)}
              placeholder="e.g. Aarav"
            />
            <Input
              label="Last Name"
              value={formLastName}
              onChange={(e) => setFormLastName(e.target.value)}
              placeholder="e.g. Kumar"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Date of Birth"
              type="date"
              value={formDob}
              onChange={(e) => setFormDob(e.target.value)}
            />
            <Select
              label="Gender"
              value={formGender}
              onChange={(e) => setFormGender(e.target.value as any)}
            >
              <option value="">-- Select Gender --</option>
              <option value="MALE">Male</option>
              <option value="FEMALE">Female</option>
              <option value="OTHER">Other</option>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Guardian Name"
              value={formGuardianName}
              onChange={(e) => setFormGuardianName(e.target.value)}
              placeholder="e.g. Ramesh Kumar"
            />
            <Input
              label="Guardian Phone"
              value={formGuardianContact}
              onChange={(e) => setFormGuardianContact(e.target.value)}
              placeholder="e.g. +91 98000 11111"
            />
          </div>

          {!editingStudent && (
            <Select
              label="Enrol into Classroom Cohort"
              value={formClassroomId}
              onChange={(e) => setFormClassroomId(e.target.value)}
            >
              <option value="">-- Do Not Enrol Yet (Unenrolled) --</option>
              {availableClassroomsForSchool.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.gradeLevel || 'Batch'})
                </option>
              ))}
            </Select>
          )}

          <div className="pt-3 flex justify-end gap-3 border-t border-gray-100">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsModalOpen(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={submitting}>
              {submitting ? 'Saving...' : editingStudent ? 'Save Changes' : 'Register Student'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* TRANSFER / ENROL MODAL */}
      <Modal
        isOpen={!!transferringStudent}
        onClose={() => setTransferringStudent(null)}
        title="Classroom Enrolment & Transfer"
        description={`Move ${transferringStudent?.firstName} ${transferringStudent?.lastName} to a new classroom cohort.`}
      >
        <form onSubmit={handleTransferSubmit} className="space-y-4">
          {transferError && (
            <div className="p-3 rounded-md bg-red-50 border border-red-200 text-xs text-red-700">
              {transferError}
            </div>
          )}

          <div className="p-3 bg-gray-50 rounded-lg text-xs text-gray-700 space-y-1 border border-gray-200">
            <p>
              <span className="font-semibold">Current Centre:</span> {transferringStudent?.schoolName}
            </p>
            <p>
              <span className="font-semibold">Current Classroom:</span>{' '}
              {transferringStudent?.classroomName || 'None (Unenrolled)'}
            </p>
            <p className="text-gray-500 pt-1">
              Transferring automatically closes the previous classroom assignment and logs a new active enrollment record.
            </p>
          </div>

          <Select
            label="Target Classroom Cohort *"
            required
            value={transferTargetClassId}
            onChange={(e) => setTransferTargetClassId(e.target.value)}
          >
            <option value="">-- Select Destination Classroom --</option>
            {classrooms.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.gradeLevel || 'Section'})
              </option>
            ))}
          </Select>

          <div className="pt-3 flex justify-end gap-3 border-t border-gray-100">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setTransferringStudent(null)}
              disabled={transferSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={transferSubmitting}>
              {transferSubmitting ? 'Transferring...' : 'Confirm Transfer'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* ENROLLMENT HISTORY TIMELINE MODAL */}
      <Modal
        isOpen={!!historyStudent}
        onClose={() => setHistoryStudent(null)}
        title="Enrolment History Timeline"
        description={`Historical classroom attendance tracks for ${historyStudent?.firstName} ${historyStudent?.lastName} (${historyStudent?.rollNumber}).`}
      >
        <div className="space-y-4">
          {historyLoading ? (
            <div className="py-8 text-center text-xs text-gray-500">Loading enrollment timeline...</div>
          ) : historyTimeline.length === 0 ? (
            <p className="py-8 text-center text-xs text-gray-500 italic">
              No enrollment history recorded for this student yet.
            </p>
          ) : (
            <div className="relative border-l-2 border-brand-200 ml-3 space-y-4 py-2">
              {historyTimeline.map((item, idx) => (
                <div key={item.id} className="relative pl-6">
                  <div
                    className={`absolute -left-2 top-1.5 w-3.5 h-3.5 rounded-full border-2 bg-white ${
                      item.isActive ? 'border-emerald-600 bg-emerald-50' : 'border-gray-400'
                    }`}
                  />
                  <div className="bg-gray-50 p-3 rounded-lg border border-gray-200 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-gray-900 text-sm">{item.classroomName}</span>
                      <StatusBadge
                        status={item.isActive ? 'ACTIVE' : 'INACTIVE'}
                        label={item.isActive ? 'Current Enrolment' : 'Past Enrolment'}
                      />
                    </div>
                    <p className="text-gray-500 mt-0.5">{item.schoolName}</p>
                    <div className="mt-2 text-[11px] text-gray-500 flex items-center gap-2">
                      <Clock className="w-3 h-3 text-gray-400" />
                      <span>Enrolled: {item.enrolledAt ? item.enrolledAt.split('T')[0] : 'N/A'}</span>
                      {item.endedAt && <span>• Left: {item.endedAt.split('T')[0]}</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="pt-3 flex justify-end border-t border-gray-100">
            <Button size="sm" variant="outline" onClick={() => setHistoryStudent(null)}>
              Close
            </Button>
          </div>
        </div>
      </Modal>

      {/* DEACTIVATE CONFIRMATION DIALOG */}
      <ConfirmDialog
        isOpen={!!deactivatingStudent}
        onClose={() => setDeactivatingStudent(null)}
        onConfirm={handleToggleActive}
        title={
          deactivatingStudent?.isActive
            ? `Deactivate ${deactivatingStudent?.firstName} ${deactivatingStudent?.lastName}?`
            : `Reactivate ${deactivatingStudent?.firstName} ${deactivatingStudent?.lastName}?`
        }
        message={
          deactivatingStudent?.isActive
            ? 'Deactivating this student will close their active classroom enrollment and exclude them from daily attendance registers. All historical attendance marks will be permanently retained.'
            : 'Reactivating this student will restore their record in the directory. You can re-enroll them into a classroom cohort.'
        }
        confirmLabel={deactivatingStudent?.isActive ? 'Deactivate Student' : 'Reactivate Student'}
        confirmVariant={deactivatingStudent?.isActive ? 'danger' : 'primary'}
        loading={deactivatingLoading}
      />
    </main>
  );
}
