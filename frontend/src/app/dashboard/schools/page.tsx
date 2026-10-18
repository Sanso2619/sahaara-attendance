'use client';

import React, { useState, useEffect } from 'react';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { Button, Input, StatusBadge, Modal, ConfirmDialog, EmptyState, TableSkeleton } from '@/components/ui/components';
import { School, Plus, Search, Edit2, Power, MapPin, Layers, RefreshCw, AlertCircle } from 'lucide-react';

interface SchoolItem {
  id: string;
  name: string;
  code: string;
  address: string | null;
  isActive: boolean;
  organizationId: string;
  organizationName: string;
  classroomCount: string | number;
  createdAt: string;
}

export default function SchoolsManagementPage() {
  const { user } = useAuth();
  const [schools, setSchools] = useState<SchoolItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');

  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSchool, setEditingSchool] = useState<SchoolItem | null>(null);
  const [formName, setFormName] = useState('');
  const [formCode, setFormCode] = useState('');
  const [formAddress, setFormAddress] = useState('');
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Deactivate dialog state
  const [deactivatingSchool, setDeactivatingSchool] = useState<SchoolItem | null>(null);
  const [deactivatingLoading, setDeactivatingLoading] = useState(false);

  const fetchSchools = async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (search) params.append('search', search);
      if (statusFilter !== 'all') params.append('status', statusFilter);

      const data = await apiFetch<{ schools: SchoolItem[] }>(`/api/schools?${params.toString()}`);
      setSchools(data.schools || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load schools');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      fetchSchools();
    }
  }, [user, statusFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchSchools();
  };

  const openCreateModal = () => {
    setEditingSchool(null);
    setFormName('');
    setFormCode('');
    setFormAddress('');
    setFormError('');
    setIsModalOpen(true);
  };

  const openEditModal = (school: SchoolItem) => {
    setEditingSchool(school);
    setFormName(school.name);
    setFormCode(school.code);
    setFormAddress(school.address || '');
    setFormError('');
    setIsModalOpen(true);
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    setSubmitting(true);

    try {
      if (editingSchool) {
        await apiFetch(`/api/schools/${editingSchool.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            name: formName.trim(),
            code: formCode.trim().toUpperCase(),
            address: formAddress.trim()
          })
        });
      } else {
        await apiFetch('/api/schools', {
          method: 'POST',
          body: JSON.stringify({
            name: formName.trim(),
            code: formCode.trim().toUpperCase(),
            address: formAddress.trim()
          })
        });
      }

      setIsModalOpen(false);
      await fetchSchools();
    } catch (err: any) {
      setFormError(err.message || 'Failed to save school');
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleActive = async () => {
    if (!deactivatingSchool) return;
    setDeactivatingLoading(true);

    try {
      await apiFetch(`/api/schools/${deactivatingSchool.id}/deactivate`, {
        method: 'PATCH'
      });
      setDeactivatingSchool(null);
      await fetchSchools();
    } catch (err: any) {
      alert(err.message || 'Failed to update school status');
    } finally {
      setDeactivatingLoading(false);
    }
  };

  const isOrgAdminOrSuper = user?.role === 'ORG_ADMIN' || user?.role === 'PLATFORM_ADMIN';

  return (
    <main className="p-6 sm:p-8 flex-1 max-w-7xl">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-6 border-b border-gray-200 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight flex items-center gap-2">
            <School className="w-6 h-6 text-brand-700" />
            Schools & Learning Centres
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Manage learning centres, unique campus codes, and classroom allocations.
          </p>
        </div>

        {isOrgAdminOrSuper && (
          <Button onClick={openCreateModal} className="gap-2">
            <Plus className="w-4 h-4" />
            Add School / Centre
          </Button>
        )}
      </div>

      {/* Filters & Search Toolbar */}
      <div className="mt-6 flex flex-col sm:flex-row items-center justify-between gap-4">
        <form onSubmit={handleSearchSubmit} className="flex-1 flex items-center gap-2 w-full sm:w-auto">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by school name or code..."
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-brand-700 focus:border-brand-700"
            />
          </div>
          <Button type="submit" variant="secondary" size="sm">
            Search
          </Button>
        </form>

        <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
          <span className="text-xs font-medium text-gray-500">Status:</span>
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
          <Button variant="outline" size="sm" onClick={fetchSchools} title="Refresh list">
            <RefreshCw className="w-4 h-4 text-gray-500" />
          </Button>
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="mt-6 p-4 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Main Content Area */}
      <div className="mt-6">
        {loading ? (
          <TableSkeleton rows={4} cols={5} />
        ) : schools.length === 0 ? (
          <EmptyState
            icon={School}
            title="No schools found"
            description={
              search
                ? `No results matching "${search}". Try clearing your search query.`
                : 'No schools or learning centres have been registered in this organization yet.'
            }
            actionLabel={isOrgAdminOrSuper ? 'Add First School' : undefined}
            onAction={isOrgAdminOrSuper ? openCreateModal : undefined}
          />
        ) : (
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 text-left text-sm">
                <thead className="bg-gray-50 text-gray-600 font-semibold text-xs uppercase tracking-wider">
                  <tr>
                    <th scope="col" className="px-6 py-3.5">School / Centre Name</th>
                    <th scope="col" className="px-6 py-3.5">Code</th>
                    <th scope="col" className="px-6 py-3.5">Address</th>
                    <th scope="col" className="px-6 py-3.5">Classrooms</th>
                    <th scope="col" className="px-6 py-3.5">Status</th>
                    {isOrgAdminOrSuper && (
                      <th scope="col" className="px-6 py-3.5 text-right">Actions</th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {schools.map((school) => (
                    <tr key={school.id} className="hover:bg-gray-50/70 transition-colors">
                      <td className="px-6 py-4 font-medium text-gray-900">
                        <div className="flex items-center gap-2.5">
                          <div className="p-1.5 bg-brand-50 rounded text-brand-700 shrink-0">
                            <School className="w-4 h-4" />
                          </div>
                          <div>
                            <span className="font-semibold text-gray-900">{school.name}</span>
                            {user?.role === 'PLATFORM_ADMIN' && (
                              <span className="block text-xs text-gray-400 font-normal">
                                Org: {school.organizationName}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="inline-block px-2 py-0.5 rounded font-mono text-xs bg-gray-100 text-gray-800 font-semibold border border-gray-200">
                          {school.code}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-gray-500 text-xs max-w-xs truncate">
                        {school.address ? (
                          <span className="flex items-center gap-1">
                            <MapPin className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                            <span className="truncate">{school.address}</span>
                          </span>
                        ) : (
                          <span className="italic text-gray-400">None specified</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-gray-600 font-medium">
                        <span className="inline-flex items-center gap-1 text-xs">
                          <Layers className="w-3.5 h-3.5 text-brand-600" />
                          {school.classroomCount} classrooms
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <StatusBadge
                          status={school.isActive ? 'ACTIVE' : 'INACTIVE'}
                          label={school.isActive ? 'Active' : 'Deactivated'}
                        />
                      </td>
                      {isOrgAdminOrSuper && (
                        <td className="px-6 py-4 text-right space-x-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openEditModal(school)}
                            className="p-1.5"
                            title="Edit school"
                          >
                            <Edit2 className="w-3.5 h-3.5 text-gray-600" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setDeactivatingSchool(school)}
                            className={`p-1.5 ${
                              school.isActive
                                ? 'text-red-600 hover:bg-red-50 hover:border-red-200'
                                : 'text-emerald-600 hover:bg-emerald-50 hover:border-emerald-200'
                            }`}
                            title={school.isActive ? 'Deactivate school' : 'Reactivate school'}
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

      {/* Create / Edit School Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingSchool ? 'Edit School / Learning Centre' : 'Add New School / Learning Centre'}
        description="Specify the centre name and unique identifier code."
      >
        <form onSubmit={handleFormSubmit} className="space-y-4">
          {formError && (
            <div className="p-3 rounded-md bg-red-50 border border-red-200 text-xs text-red-700">
              {formError}
            </div>
          )}

          <Input
            label="School / Centre Name *"
            required
            value={formName}
            onChange={(e) => setFormName(e.target.value)}
            placeholder="e.g. Chembur Community Learning Hub"
          />

          <Input
            label="School Code *"
            required
            value={formCode}
            onChange={(e) => setFormCode(e.target.value.toUpperCase())}
            placeholder="e.g. CCL-01"
            helperText="Unique code identifier within your organization"
          />

          <Input
            label="Physical Address / Landmark"
            value={formAddress}
            onChange={(e) => setFormAddress(e.target.value)}
            placeholder="e.g. Sector 5, Near Community Water Post, Dharavi"
          />

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
              {submitting ? 'Saving...' : editingSchool ? 'Save Changes' : 'Create School'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Confirmation Dialog for Deactivation */}
      <ConfirmDialog
        isOpen={!!deactivatingSchool}
        onClose={() => setDeactivatingSchool(null)}
        onConfirm={handleToggleActive}
        title={
          deactivatingSchool?.isActive
            ? `Deactivate ${deactivatingSchool?.name}?`
            : `Reactivate ${deactivatingSchool?.name}?`
        }
        message={
          deactivatingSchool?.isActive
            ? 'Deactivating this centre will hide it from normal day-to-day attendance registers. Existing student history and classroom records will be safely preserved.'
            : 'Reactivating this centre will restore its classrooms and make it active in daily workflows.'
        }
        confirmLabel={deactivatingSchool?.isActive ? 'Deactivate School' : 'Reactivate School'}
        confirmVariant={deactivatingSchool?.isActive ? 'danger' : 'primary'}
        loading={deactivatingLoading}
      />
    </main>
  );
}
