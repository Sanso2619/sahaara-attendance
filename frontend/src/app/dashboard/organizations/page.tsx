'use client';

import React, { useState, useEffect } from 'react';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { Button, Input, StatusBadge, Modal, ConfirmDialog, EmptyState } from '@/components/ui/components';
import { Building2, Plus, Search, Edit2, Power, Mail, Phone, RefreshCw, AlertCircle, School, Users } from 'lucide-react';

interface OrganizationItem {
  id: string;
  name: string;
  slug: string;
  code: string;
  contactEmail: string | null;
  contactPhone: string | null;
  isActive: boolean;
  schoolCount: string | number;
  classroomCount: string | number;
  createdAt: string;
}

export default function OrganizationsManagementPage() {
  const { user } = useAuth();
  const [organizations, setOrganizations] = useState<OrganizationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');

  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingOrg, setEditingOrg] = useState<OrganizationItem | null>(null);
  const [formName, setFormName] = useState('');
  const [formCode, setFormCode] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Status toggle confirmation
  const [togglingOrg, setTogglingOrg] = useState<OrganizationItem | null>(null);
  const [toggleLoading, setToggleLoading] = useState(false);

  const fetchOrganizations = async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (search) params.append('search', search);
      if (statusFilter !== 'all') params.append('status', statusFilter);

      const data = await apiFetch<{ organizations: OrganizationItem[] }>(`/api/organizations?${params.toString()}`);
      setOrganizations(data.organizations || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load organizations');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      fetchOrganizations();
    }
  }, [user, statusFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchOrganizations();
  };

  const openCreateModal = () => {
    setEditingOrg(null);
    setFormName('');
    setFormCode('');
    setFormEmail('');
    setFormPhone('');
    setFormError('');
    setIsModalOpen(true);
  };

  const openEditModal = (org: OrganizationItem) => {
    setEditingOrg(org);
    setFormName(org.name);
    setFormCode(org.code);
    setFormEmail(org.contactEmail || '');
    setFormPhone(org.contactPhone || '');
    setFormError('');
    setIsModalOpen(true);
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    setSubmitting(true);

    try {
      if (editingOrg) {
        await apiFetch(`/api/organizations/${editingOrg.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            name: user?.role === 'PLATFORM_ADMIN' ? formName.trim() : undefined,
            code: user?.role === 'PLATFORM_ADMIN' ? formCode.trim().toUpperCase() : undefined,
            contactEmail: formEmail.trim(),
            contactPhone: formPhone.trim()
          })
        });
      } else {
        await apiFetch('/api/organizations', {
          method: 'POST',
          body: JSON.stringify({
            name: formName.trim(),
            code: formCode.trim().toUpperCase(),
            contactEmail: formEmail.trim(),
            contactPhone: formPhone.trim()
          })
        });
      }

      setIsModalOpen(false);
      await fetchOrganizations();
    } catch (err: any) {
      setFormError(err.message || 'Failed to save organization');
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleStatus = async () => {
    if (!togglingOrg) return;
    setToggleLoading(true);

    try {
      await apiFetch(`/api/organizations/${togglingOrg.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: !togglingOrg.isActive })
      });
      setTogglingOrg(null);
      await fetchOrganizations();
    } catch (err: any) {
      alert(err.message || 'Failed to update organization status');
    } finally {
      setToggleLoading(false);
    }
  };

  const isPlatformAdmin = user?.role === 'PLATFORM_ADMIN';

  return (
    <main className="p-6 sm:p-8 flex-1 max-w-7xl">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-6 border-b border-gray-200 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight flex items-center gap-2">
            <Building2 className="w-6 h-6 text-brand-700" />
            Organizations & Partner NGOs
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {isPlatformAdmin
              ? 'Onboard and manage NGO tenant organizations across the Sahaara platform.'
              : 'View and update your organization profile details.'}
          </p>
        </div>

        {isPlatformAdmin && (
          <Button onClick={openCreateModal} className="gap-2">
            <Plus className="w-4 h-4" />
            Onboard Organization
          </Button>
        )}
      </div>

      {/* Filter and Search Bar */}
      <div className="mt-6 flex flex-col sm:flex-row items-center justify-between gap-4">
        <form onSubmit={handleSearchSubmit} className="flex-1 flex items-center gap-2 w-full sm:w-auto">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by organization name or code..."
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
          <Button variant="outline" size="sm" onClick={fetchOrganizations} title="Refresh list">
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

      {/* Main Content Area */}
      <div className="mt-6">
        {loading ? (
          <div className="py-16 text-center text-gray-500 text-sm flex flex-col items-center gap-2">
            <div className="w-6 h-6 border-2 border-brand-700 border-t-transparent rounded-full animate-spin" />
            <span>Loading organizations...</span>
          </div>
        ) : organizations.length === 0 ? (
          <EmptyState
            icon={Building2}
            title="No organizations found"
            description={
              search
                ? `No organizations matched "${search}".`
                : 'No organizations have been registered in the system.'
            }
            actionLabel={isPlatformAdmin ? 'Onboard Organization' : undefined}
            onAction={isPlatformAdmin ? openCreateModal : undefined}
          />
        ) : (
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 text-left text-sm">
                <thead className="bg-gray-50 text-gray-600 font-semibold text-xs uppercase tracking-wider">
                  <tr>
                    <th scope="col" className="px-6 py-3.5">Organization</th>
                    <th scope="col" className="px-6 py-3.5">Code</th>
                    <th scope="col" className="px-6 py-3.5">Contact Details</th>
                    <th scope="col" className="px-6 py-3.5">Centres & Classes</th>
                    <th scope="col" className="px-6 py-3.5">Status</th>
                    <th scope="col" className="px-6 py-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {organizations.map((org) => (
                    <tr key={org.id} className="hover:bg-gray-50/70 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2.5">
                          <div className="p-1.5 bg-brand-50 rounded text-brand-700 shrink-0">
                            <Building2 className="w-4 h-4" />
                          </div>
                          <div>
                            <span className="font-semibold text-gray-900">{org.name}</span>
                            <span className="block text-xs text-gray-400 font-mono">slug: {org.slug}</span>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="inline-block px-2 py-0.5 rounded font-mono text-xs bg-gray-100 text-gray-800 font-semibold border border-gray-200">
                          {org.code}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-xs text-gray-600 space-y-0.5">
                        {org.contactEmail && (
                          <div className="flex items-center gap-1.5 text-gray-600">
                            <Mail className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                            <span>{org.contactEmail}</span>
                          </div>
                        )}
                        {org.contactPhone && (
                          <div className="flex items-center gap-1.5 text-gray-500">
                            <Phone className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                            <span>{org.contactPhone}</span>
                          </div>
                        )}
                        {!org.contactEmail && !org.contactPhone && (
                          <span className="italic text-gray-400">None provided</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-xs text-gray-600">
                        <div className="flex items-center gap-3">
                          <span className="flex items-center gap-1 font-medium">
                            <School className="w-3.5 h-3.5 text-brand-700" />
                            {org.schoolCount} centres
                          </span>
                          <span className="flex items-center gap-1 text-gray-500">
                            <Users className="w-3.5 h-3.5 text-gray-400" />
                            {org.classroomCount} classes
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <StatusBadge
                          status={org.isActive ? 'ACTIVE' : 'INACTIVE'}
                          label={org.isActive ? 'Active' : 'Inactive'}
                        />
                      </td>
                      <td className="px-6 py-4 text-right space-x-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openEditModal(org)}
                          className="p-1.5"
                          title="Edit organization"
                        >
                          <Edit2 className="w-3.5 h-3.5 text-gray-600" />
                        </Button>
                        {isPlatformAdmin && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setTogglingOrg(org)}
                            className={`p-1.5 ${
                              org.isActive
                                ? 'text-red-600 hover:bg-red-50 hover:border-red-200'
                                : 'text-emerald-600 hover:bg-emerald-50 hover:border-emerald-200'
                            }`}
                            title={org.isActive ? 'Deactivate organization' : 'Reactivate organization'}
                          >
                            <Power className="w-3.5 h-3.5" />
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Create / Edit Organization Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingOrg ? 'Edit Organization Profile' : 'Onboard New NGO Organization'}
        description="Provide organization identification and primary contact details."
      >
        <form onSubmit={handleFormSubmit} className="space-y-4">
          {formError && (
            <div className="p-3 rounded-md bg-red-50 border border-red-200 text-xs text-red-700">
              {formError}
            </div>
          )}

          <Input
            label="Organization Name *"
            required
            disabled={!isPlatformAdmin && !!editingOrg}
            value={formName}
            onChange={(e) => setFormName(e.target.value)}
            placeholder="e.g. Hope Community Education Centre"
          />

          <Input
            label="Unique Organization Code *"
            required
            disabled={!isPlatformAdmin && !!editingOrg}
            value={formCode}
            onChange={(e) => setFormCode(e.target.value.toUpperCase())}
            placeholder="e.g. HOPE_EDU"
            helperText="Uppercase alphanumeric shortcode identifier"
          />

          <Input
            label="Contact Email"
            type="email"
            value={formEmail}
            onChange={(e) => setFormEmail(e.target.value)}
            placeholder="contact@hope-edu.org"
          />

          <Input
            label="Contact Phone / Hotline"
            value={formPhone}
            onChange={(e) => setFormPhone(e.target.value)}
            placeholder="+91 98765 43210"
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
              {submitting ? 'Saving...' : editingOrg ? 'Save Changes' : 'Onboard NGO'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Confirmation Dialog for Organization Status */}
      <ConfirmDialog
        isOpen={!!togglingOrg}
        onClose={() => setTogglingOrg(null)}
        onConfirm={handleToggleStatus}
        title={
          togglingOrg?.isActive
            ? `Deactivate ${togglingOrg?.name}?`
            : `Reactivate ${togglingOrg?.name}?`
        }
        message={
          togglingOrg?.isActive
            ? 'Deactivating this NGO will suspend access for its administrators and teachers. Historical data remains intact.'
            : 'Reactivating this NGO will immediately restore portal access for its authorized staff.'
        }
        confirmLabel={togglingOrg?.isActive ? 'Deactivate NGO' : 'Reactivate NGO'}
        confirmVariant={togglingOrg?.isActive ? 'danger' : 'primary'}
        loading={toggleLoading}
      />
    </main>
  );
}
