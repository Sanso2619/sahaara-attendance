'use client';

import React, { useState, useEffect } from 'react';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { Button, Input, Select, StatusBadge, Modal, ConfirmDialog, EmptyState } from '@/components/ui/components';
import { Users, Plus, Search, Edit2, Power, School, UserCheck, RefreshCw, AlertCircle, Calendar } from 'lucide-react';

interface ClassroomItem {
  id: string;
  name: string;
  gradeLevel: string | null;
  academicYear: string | null;
  isActive: boolean;
  schoolId: string;
  schoolName: string;
  schoolCode: string;
  teacherId: string | null;
  teacherName: string | null;
  teacherEmail: string | null;
  studentCount: string | number;
  createdAt: string;
}

interface SchoolOption {
  id: string;
  name: string;
  code: string;
}

interface TeacherOption {
  id: string;
  fullName: string;
  email: string;
}

export default function ClassroomsManagementPage() {
  const { user } = useAuth();
  const [classrooms, setClassrooms] = useState<ClassroomItem[]>([]);
  const [schools, setSchools] = useState<SchoolOption[]>([]);
  const [teachers, setTeachers] = useState<TeacherOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Filters
  const [search, setSearch] = useState('');
  const [selectedSchoolId, setSelectedSchoolId] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');

  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingClassroom, setEditingClassroom] = useState<ClassroomItem | null>(null);
  const [formSchoolId, setFormSchoolId] = useState('');
  const [formName, setFormName] = useState('');
  const [formGradeLevel, setFormGradeLevel] = useState('');
  const [formAcademicYear, setFormAcademicYear] = useState('2026-2027');
  const [formTeacherId, setFormTeacherId] = useState('');
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Deactivate dialog
  const [deactivatingClassroom, setDeactivatingClassroom] = useState<ClassroomItem | null>(null);
  const [deactivatingLoading, setDeactivatingLoading] = useState(false);

  const fetchClassrooms = async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (search) params.append('search', search);
      if (selectedSchoolId) params.append('schoolId', selectedSchoolId);
      if (statusFilter !== 'all') params.append('status', statusFilter);

      const data = await apiFetch<{ classrooms: ClassroomItem[] }>(`/api/classrooms?${params.toString()}`);
      setClassrooms(data.classrooms || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load classrooms');
    } finally {
      setLoading(false);
    }
  };

  const fetchDropdownOptions = async () => {
    try {
      const [schoolsData, teachersData] = await Promise.all([
        apiFetch<{ schools: any[] }>('/api/schools?status=active'),
        apiFetch<{ teachers: any[] }>('/api/teachers')
      ]);
      setSchools(schoolsData.schools || []);
      setTeachers(teachersData.teachers || []);
    } catch (err) {
      console.error('Failed to load form options:', err);
    }
  };

  useEffect(() => {
    if (user) {
      fetchClassrooms();
      fetchDropdownOptions();
    }
  }, [user, selectedSchoolId, statusFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchClassrooms();
  };

  const openCreateModal = () => {
    setEditingClassroom(null);
    setFormSchoolId(schools[0]?.id || '');
    setFormName('');
    setFormGradeLevel('');
    setFormAcademicYear('2026-2027');
    setFormTeacherId('');
    setFormError('');
    setIsModalOpen(true);
  };

  const openEditModal = (classroom: ClassroomItem) => {
    setEditingClassroom(classroom);
    setFormSchoolId(classroom.schoolId);
    setFormName(classroom.name);
    setFormGradeLevel(classroom.gradeLevel || '');
    setFormAcademicYear(classroom.academicYear || '2026-2027');
    setFormTeacherId(classroom.teacherId || '');
    setFormError('');
    setIsModalOpen(true);
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (!formSchoolId && !editingClassroom) {
      setFormError('Please select a school centre');
      return;
    }

    setSubmitting(true);
    try {
      if (editingClassroom) {
        await apiFetch(`/api/classrooms/${editingClassroom.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            name: formName.trim(),
            gradeLevel: formGradeLevel.trim(),
            academicYear: formAcademicYear.trim(),
            teacherId: formTeacherId ? formTeacherId : null
          })
        });
      } else {
        await apiFetch('/api/classrooms', {
          method: 'POST',
          body: JSON.stringify({
            schoolId: formSchoolId,
            name: formName.trim(),
            gradeLevel: formGradeLevel.trim(),
            academicYear: formAcademicYear.trim(),
            teacherId: formTeacherId ? formTeacherId : null
          })
        });
      }

      setIsModalOpen(false);
      await fetchClassrooms();
    } catch (err: any) {
      setFormError(err.message || 'Failed to save classroom');
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleActive = async () => {
    if (!deactivatingClassroom) return;
    setDeactivatingLoading(true);

    try {
      await apiFetch(`/api/classrooms/${deactivatingClassroom.id}/deactivate`, {
        method: 'PATCH'
      });
      setDeactivatingClassroom(null);
      await fetchClassrooms();
    } catch (err: any) {
      alert(err.message || 'Failed to update classroom status');
    } finally {
      setDeactivatingLoading(false);
    }
  };

  const isOrgAdminOrSuper = user?.role === 'ORG_ADMIN' || user?.role === 'PLATFORM_ADMIN';

  return (
    <main className="p-6 sm:p-8 flex-1 max-w-7xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-6 border-b border-gray-200 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight flex items-center gap-2">
            <Users className="w-6 h-6 text-brand-700" />
            Classrooms & Teacher Allocations
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Setup classroom batches, grade levels, and assigned classroom teachers.
          </p>
        </div>

        {isOrgAdminOrSuper && (
          <Button onClick={openCreateModal} className="gap-2">
            <Plus className="w-4 h-4" />
            Add Classroom
          </Button>
        )}
      </div>

      {/* Filter and Search Bar */}
      <div className="mt-6 flex flex-col md:flex-row items-center justify-between gap-4">
        <form onSubmit={handleSearchSubmit} className="flex-1 flex items-center gap-2 w-full md:w-auto">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by class name, grade, or teacher..."
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-brand-700 focus:border-brand-700"
            />
          </div>
          <Button type="submit" variant="secondary" size="sm">
            Search
          </Button>
        </form>

        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto justify-end">
          {/* School Selector Filter */}
          <div className="w-48">
            <select
              value={selectedSchoolId}
              onChange={(e) => setSelectedSchoolId(e.target.value)}
              className="block w-full px-3 py-1.5 text-xs border border-gray-300 rounded-md bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-brand-700"
            >
              <option value="">All Schools / Centres</option>
              {schools.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.code})
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
                className={`px-3 py-1 rounded capitalize font-medium transition-colors ${
                  statusFilter === filter
                    ? 'bg-brand-700 text-white shadow-xs'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                {filter}
              </button>
            ))}
          </div>

          <Button variant="outline" size="sm" onClick={fetchClassrooms} title="Refresh list">
            <RefreshCw className="w-4 h-4 text-gray-500" />
          </Button>
        </div>
      </div>

      {error && (
        <div className="mt-6 p-4 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Classroom Table */}
      <div className="mt-6">
        {loading ? (
          <div className="py-16 text-center text-gray-500 text-sm flex flex-col items-center gap-2">
            <div className="w-6 h-6 border-2 border-brand-700 border-t-transparent rounded-full animate-spin" />
            <span>Loading classrooms...</span>
          </div>
        ) : classrooms.length === 0 ? (
          <EmptyState
            icon={Users}
            title="No classrooms found"
            description={
              search || selectedSchoolId
                ? 'No classrooms matched your filter criteria.'
                : 'No classrooms have been created yet. Create a classroom to assign teachers and students.'
            }
            actionLabel={isOrgAdminOrSuper ? 'Create First Classroom' : undefined}
            onAction={isOrgAdminOrSuper ? openCreateModal : undefined}
          />
        ) : (
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 text-left text-sm">
                <thead className="bg-gray-50 text-gray-600 font-semibold text-xs uppercase tracking-wider">
                  <tr>
                    <th scope="col" className="px-6 py-3.5">Classroom & Batch</th>
                    <th scope="col" className="px-6 py-3.5">School / Centre</th>
                    <th scope="col" className="px-6 py-3.5">Assigned Teacher</th>
                    <th scope="col" className="px-6 py-3.5">Academic Year</th>
                    <th scope="col" className="px-6 py-3.5">Status</th>
                    {isOrgAdminOrSuper && (
                      <th scope="col" className="px-6 py-3.5 text-right">Actions</th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {classrooms.map((cls) => (
                    <tr key={cls.id} className="hover:bg-gray-50/70 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2.5">
                          <div className="p-1.5 bg-brand-50 rounded text-brand-700 shrink-0">
                            <Users className="w-4 h-4" />
                          </div>
                          <div>
                            <span className="font-semibold text-gray-900">{cls.name}</span>
                            {cls.gradeLevel && (
                              <span className="block text-xs text-gray-500 font-normal">
                                Grade / Level: {cls.gradeLevel}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-gray-700">
                        <div className="flex items-center gap-1.5 text-xs font-medium">
                          <School className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                          <span>{cls.schoolName}</span>
                          <span className="text-gray-400 font-mono">({cls.schoolCode})</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        {cls.teacherName ? (
                          <div className="flex items-center gap-1.5">
                            <UserCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                            <div>
                              <p className="text-xs font-semibold text-gray-900">{cls.teacherName}</p>
                              <p className="text-[11px] text-gray-400">{cls.teacherEmail}</p>
                            </div>
                          </div>
                        ) : (
                          <span className="inline-block px-2 py-0.5 rounded text-[11px] font-medium bg-gray-100 text-gray-500 border border-gray-200">
                            Unassigned
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-gray-600 text-xs">
                        <div className="flex items-center gap-1">
                          <Calendar className="w-3.5 h-3.5 text-gray-400" />
                          <span>{cls.academicYear || 'Current'}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <StatusBadge
                          status={cls.isActive ? 'ACTIVE' : 'INACTIVE'}
                          label={cls.isActive ? 'Active' : 'Deactivated'}
                        />
                      </td>
                      {isOrgAdminOrSuper && (
                        <td className="px-6 py-4 text-right space-x-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openEditModal(cls)}
                            className="p-1.5"
                            title="Edit classroom"
                          >
                            <Edit2 className="w-3.5 h-3.5 text-gray-600" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setDeactivatingClassroom(cls)}
                            className={`p-1.5 ${
                              cls.isActive
                                ? 'text-red-600 hover:bg-red-50 hover:border-red-200'
                                : 'text-emerald-600 hover:bg-emerald-50 hover:border-emerald-200'
                            }`}
                            title={cls.isActive ? 'Deactivate classroom' : 'Reactivate classroom'}
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

      {/* Create / Edit Classroom Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingClassroom ? 'Edit Classroom' : 'Create New Classroom'}
        description="Configure classroom identity, grade level, and assigned teacher."
      >
        <form onSubmit={handleFormSubmit} className="space-y-4">
          {formError && (
            <div className="p-3 rounded-md bg-red-50 border border-red-200 text-xs text-red-700">
              {formError}
            </div>
          )}

          {!editingClassroom && (
            <Select
              label="Associated School / Centre *"
              required
              value={formSchoolId}
              onChange={(e) => setFormSchoolId(e.target.value)}
            >
              <option value="">Select a school...</option>
              {schools.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.code})
                </option>
              ))}
            </Select>
          )}

          <Input
            label="Classroom Name *"
            required
            value={formName}
            onChange={(e) => setFormName(e.target.value)}
            placeholder="e.g. Grade 1 - Sunflowers"
          />

          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Grade / Level"
              value={formGradeLevel}
              onChange={(e) => setFormGradeLevel(e.target.value)}
              placeholder="e.g. Grade 1 or Primary"
            />
            <Input
              label="Academic Year"
              value={formAcademicYear}
              onChange={(e) => setFormAcademicYear(e.target.value)}
              placeholder="e.g. 2026-2027"
            />
          </div>

          <Select
            label="Assigned Classroom Teacher"
            value={formTeacherId}
            onChange={(e) => setFormTeacherId(e.target.value)}
          >
            <option value="">-- No Teacher Assigned --</option>
            {teachers.map((t) => (
              <option key={t.id} value={t.id}>
                {t.fullName} ({t.email})
              </option>
            ))}
          </Select>

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
              {submitting ? 'Saving...' : editingClassroom ? 'Save Changes' : 'Create Classroom'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Deactivate confirmation dialog */}
      <ConfirmDialog
        isOpen={!!deactivatingClassroom}
        onClose={() => setDeactivatingClassroom(null)}
        onConfirm={handleToggleActive}
        title={
          deactivatingClassroom?.isActive
            ? `Deactivate ${deactivatingClassroom?.name}?`
            : `Reactivate ${deactivatingClassroom?.name}?`
        }
        message={
          deactivatingClassroom?.isActive
            ? 'Deactivating this classroom will remove it from the active daily attendance register while preserving all previous attendance marks and history.'
            : 'Reactivating this classroom will restore it to the active school attendance register.'
        }
        confirmLabel={deactivatingClassroom?.isActive ? 'Deactivate Classroom' : 'Reactivate Classroom'}
        confirmVariant={deactivatingClassroom?.isActive ? 'danger' : 'primary'}
        loading={deactivatingLoading}
      />
    </main>
  );
}
