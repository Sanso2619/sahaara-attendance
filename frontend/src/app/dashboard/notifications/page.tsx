'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/lib/auth-context';
import { apiFetch } from '@/lib/api';
import { Button, Modal, Input, Select, TableSkeleton, EmptyState } from '@/components/ui/components';
import {
  Bell,
  CheckCircle2,
  AlertCircle,
  Clock,
  Send,
  RefreshCw,
  Search,
  Filter,
  Eye,
  Settings,
  ShieldAlert,
  Smartphone,
  Mail,
  MessageSquare,
  ChevronLeft,
  ChevronRight,
  Info,
  Check,
  AlertTriangle
} from 'lucide-react';

interface NotificationSettings {
  id: string;
  organizationId: string;
  followUpsEnabled: boolean;
  notifyAbsent: boolean;
  notifyLate: boolean;
  defaultChannel: 'SMS' | 'WHATSAPP' | 'EMAIL';
  absentTemplate: string;
  lateTemplate: string;
  createdAt: string;
  updatedAt: string;
}

interface DeliveryRecord {
  id: string;
  organizationId: string;
  studentId: string;
  attendanceSessionId: string;
  recipientName: string;
  recipientContactMasked: string;
  channel: 'SMS' | 'WHATSAPP' | 'EMAIL';
  eventType: 'ABSENT' | 'LATE';
  status: 'PENDING' | 'SENT' | 'FAILED' | 'SKIPPED';
  messageContent: string;
  provider: string;
  providerMessageId?: string;
  errorMessage?: string;
  retryCount: number;
  maxRetries: number;
  isSimulated: boolean;
  canRetry: boolean;
  sentAt?: string;
  createdAt: string;
  studentFirstName: string;
  studentLastName: string;
  studentRollNumber: string;
  schoolName: string;
  classroomName: string;
  sessionDate: string;
  triggeredByName?: string;
}

interface DeliveryStats {
  total: number;
  sent: number;
  failed: number;
  skipped: number;
  pending: number;
}

export default function NotificationsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'PLATFORM_ADMIN' || user?.role === 'ORG_ADMIN';

  // Active Tab: 'log' or 'settings'
  const [activeTab, setActiveTab] = useState<'log' | 'settings'>('log');

  // Audit Log State
  const [deliveries, setDeliveries] = useState<DeliveryRecord[]>([]);
  const [stats, setStats] = useState<DeliveryStats>({ total: 0, sent: 0, failed: 0, skipped: 0, pending: 0 });
  const [loadingLog, setLoadingLog] = useState(false);
  const [logError, setLogError] = useState<string | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState('');
  const [channelFilter, setChannelFilter] = useState('');
  const [eventTypeFilter, setEventTypeFilter] = useState('');
  const [startDateFilter, setStartDateFilter] = useState('');
  const [endDateFilter, setEndDateFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  // Settings State
  const [settings, setSettings] = useState<NotificationSettings | null>(null);
  const [loadingSettings, setLoadingSettings] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsSuccess, setSettingsSuccess] = useState<string | null>(null);
  const [settingsError, setSettingsError] = useState<string | null>(null);

  // Detail Modal State
  const [selectedDelivery, setSelectedDelivery] = useState<DeliveryRecord | null>(null);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [retryMessage, setRetryMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Live Preview Modal State
  const [previewModalOpen, setPreviewModalOpen] = useState(false);
  const [previewTemplateType, setPreviewTemplateType] = useState<'ABSENT' | 'LATE'>('ABSENT');
  const [previewContent, setPreviewContent] = useState('');
  const [loadingPreview, setLoadingPreview] = useState(false);

  // 1. Fetch Audit Log
  const fetchDeliveries = useCallback(async () => {
    setLoadingLog(true);
    setLogError(null);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set('status', statusFilter);
      if (channelFilter) params.set('channel', channelFilter);
      if (eventTypeFilter) params.set('eventType', eventTypeFilter);
      if (startDateFilter) params.set('startDate', startDateFilter);
      if (endDateFilter) params.set('endDate', endDateFilter);
      if (searchQuery) params.set('search', searchQuery);
      params.set('page', currentPage.toString());
      params.set('limit', '15');

      const data = await apiFetch<{
        deliveries: DeliveryRecord[];
        pagination: { total: number; page: number; totalPages: number };
        stats: DeliveryStats;
      }>(`/api/notifications/deliveries?${params.toString()}`);

      setDeliveries(data.deliveries || []);
      setTotalPages(data.pagination?.totalPages || 1);
      setTotalCount(data.pagination?.total || 0);
      if (data.stats) setStats(data.stats);
    } catch (err: any) {
      setLogError(err.message || 'Failed to fetch notification history');
    } finally {
      setLoadingLog(false);
    }
  }, [statusFilter, channelFilter, eventTypeFilter, startDateFilter, endDateFilter, searchQuery, currentPage]);

  // 2. Fetch Settings
  const fetchSettings = useCallback(async () => {
    if (!isAdmin) return;
    setLoadingSettings(true);
    setSettingsError(null);
    try {
      const data = await apiFetch<{ settings: NotificationSettings }>('/api/notifications/settings');
      setSettings(data.settings);
    } catch (err: any) {
      setSettingsError(err.message || 'Failed to load notification settings');
    } finally {
      setLoadingSettings(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    fetchDeliveries();
  }, [fetchDeliveries]);

  useEffect(() => {
    if (isAdmin && activeTab === 'settings') {
      fetchSettings();
    }
  }, [isAdmin, activeTab, fetchSettings]);

  // Handle Save Settings
  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settings) return;

    setSavingSettings(true);
    setSettingsSuccess(null);
    setSettingsError(null);

    try {
      const res = await apiFetch<{ message: string; settings: NotificationSettings }>('/api/notifications/settings', {
        method: 'PUT',
        body: JSON.stringify({
          followUpsEnabled: settings.followUpsEnabled,
          notifyAbsent: settings.notifyAbsent,
          notifyLate: settings.notifyLate,
          defaultChannel: settings.defaultChannel,
          absentTemplate: settings.absentTemplate,
          lateTemplate: settings.lateTemplate
        })
      });
      setSettings(res.settings);
      setSettingsSuccess('Notification follow-up settings saved successfully.');
      setTimeout(() => setSettingsSuccess(null), 4000);
    } catch (err: any) {
      setSettingsError(err.message || 'Failed to update settings');
    } finally {
      setSavingSettings(false);
    }
  };

  // Handle Manual Retry
  const handleRetry = async (deliveryId: string) => {
    setRetryingId(deliveryId);
    setRetryMessage(null);
    try {
      const res = await apiFetch<{ message: string; status: string; retryCount: number }>(
        `/api/notifications/deliveries/${deliveryId}/retry`,
        { method: 'POST' }
      );
      setRetryMessage({ text: res.message, type: 'success' });
      // Refresh list
      fetchDeliveries();
      if (selectedDelivery && selectedDelivery.id === deliveryId) {
        setSelectedDelivery(prev => prev ? { ...prev, status: res.status as any, retryCount: res.retryCount, canRetry: false } : null);
      }
    } catch (err: any) {
      setRetryMessage({ text: err.message || 'Retry failed', type: 'error' });
    } finally {
      setRetryingId(null);
    }
  };

  // Handle Live Preview
  const handlePreview = async (type: 'ABSENT' | 'LATE') => {
    if (!settings) return;
    setPreviewTemplateType(type);
    setLoadingPreview(true);
    setPreviewModalOpen(true);
    try {
      const template = type === 'ABSENT' ? settings.absentTemplate : settings.lateTemplate;
      const res = await apiFetch<{ preview: string }>('/api/notifications/preview', {
        method: 'POST',
        body: JSON.stringify({ template, eventType: type })
      });
      setPreviewContent(res.preview);
    } catch (err: any) {
      setPreviewContent(`Error generating preview: ${err.message}`);
    } finally {
      setLoadingPreview(false);
    }
  };

  // Insert Variable Token into Template Textarea
  const insertToken = (templateType: 'ABSENT' | 'LATE', token: string) => {
    if (!settings) return;
    if (templateType === 'ABSENT') {
      setSettings({
        ...settings,
        absentTemplate: settings.absentTemplate + ' ' + token
      });
    } else {
      setSettings({
        ...settings,
        lateTemplate: settings.lateTemplate + ' ' + token
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 flex items-center gap-2">
            <Bell className="w-6 h-6 text-brand-700" />
            Notifications & Guardian Follow-ups
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Automated alerts triggered upon attendance register submission with privacy-safe delivery tracking.
          </p>
        </div>

        {/* Tab Controls */}
        <div className="flex items-center gap-2 bg-gray-100 p-1 rounded-lg">
          <button
            onClick={() => setActiveTab('log')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
              activeTab === 'log'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Delivery History & Audit
          </button>
          {isAdmin && (
            <button
              onClick={() => setActiveTab('settings')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                activeTab === 'settings'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Settings & Templates
            </button>
          )}
        </div>
      </div>

      {/* Mode / Security Banner */}
      <div className="bg-brand-50 border border-brand-200 rounded-lg p-3.5 flex items-start sm:items-center gap-3">
        <ShieldAlert className="w-5 h-5 text-brand-700 shrink-0 mt-0.5 sm:mt-0" />
        <div className="text-xs text-brand-900 flex-1">
          <span className="font-semibold">Safe Sandbox Delivery Mode Active: </span>
          All notifications are simulated safely in development without incurring carrier charges or leaking guardian data. Guardian phone numbers are strictly masked on all views for privacy.
        </div>
      </div>

      {/* TAB 1: AUDIT LOG */}
      {activeTab === 'log' && (
        <div className="space-y-6">
          {/* Summary KPI Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
              <p className="text-xs font-medium text-gray-500">Total Triggered</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{stats.total}</p>
            </div>
            <div className="bg-white p-4 rounded-xl border border-emerald-200 bg-emerald-50/20 shadow-sm">
              <p className="text-xs font-medium text-emerald-700 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" /> Sent Successfully
              </p>
              <p className="text-2xl font-bold text-emerald-800 mt-1">{stats.sent}</p>
            </div>
            <div className="bg-white p-4 rounded-xl border border-red-200 bg-red-50/20 shadow-sm">
              <p className="text-xs font-medium text-red-700 flex items-center gap-1">
                <AlertCircle className="w-3.5 h-3.5" /> Failed
              </p>
              <p className="text-2xl font-bold text-red-800 mt-1">{stats.failed}</p>
            </div>
            <div className="bg-white p-4 rounded-xl border border-amber-200 bg-amber-50/20 shadow-sm">
              <p className="text-xs font-medium text-amber-700 flex items-center gap-1">
                <Info className="w-3.5 h-3.5" /> Skipped (No Contact)
              </p>
              <p className="text-2xl font-bold text-amber-800 mt-1">{stats.skipped}</p>
            </div>
            <div className="bg-white p-4 rounded-xl border border-blue-200 bg-blue-50/20 shadow-sm">
              <p className="text-xs font-medium text-blue-700 flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" /> Pending
              </p>
              <p className="text-2xl font-bold text-blue-800 mt-1">{stats.pending}</p>
            </div>
          </div>

          {/* Filter Bar */}
          <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-6 gap-3">
              {/* Search */}
              <div className="md:col-span-2">
                <Input
                  placeholder="Search student, roll number, guardian..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="w-full text-xs"
                />
              </div>

              {/* Status Filter */}
              <div>
                <select
                  value={statusFilter}
                  onChange={(e) => {
                    setStatusFilter(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="w-full px-3 py-2 text-xs border border-gray-300 rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-brand-700"
                >
                  <option value="">All Statuses</option>
                  <option value="SENT">Sent</option>
                  <option value="FAILED">Failed</option>
                  <option value="SKIPPED">Skipped</option>
                  <option value="PENDING">Pending</option>
                </select>
              </div>

              {/* Event Type */}
              <div>
                <select
                  value={eventTypeFilter}
                  onChange={(e) => {
                    setEventTypeFilter(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="w-full px-3 py-2 text-xs border border-gray-300 rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-brand-700"
                >
                  <option value="">All Events</option>
                  <option value="ABSENT">Absent</option>
                  <option value="LATE">Late</option>
                </select>
              </div>

              {/* Channel */}
              <div>
                <select
                  value={channelFilter}
                  onChange={(e) => {
                    setChannelFilter(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="w-full px-3 py-2 text-xs border border-gray-300 rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-brand-700"
                >
                  <option value="">All Channels</option>
                  <option value="SMS">SMS</option>
                  <option value="WHATSAPP">WhatsApp</option>
                  <option value="EMAIL">Email</option>
                </select>
              </div>

              {/* Refresh / Reset */}
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSearchQuery('');
                    setStatusFilter('');
                    setEventTypeFilter('');
                    setChannelFilter('');
                    setStartDateFilter('');
                    setEndDateFilter('');
                    setCurrentPage(1);
                  }}
                  className="w-full text-xs"
                >
                  Reset
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={fetchDeliveries}
                  disabled={loadingLog}
                  className="w-full text-xs"
                >
                  <RefreshCw className={`w-3.5 h-3.5 mr-1 ${loadingLog ? 'animate-spin' : ''}`} />
                  Refresh
                </Button>
              </div>
            </div>
          </div>

          {/* Delivery Table */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            {logError && (
              <div className="p-4 bg-red-50 text-red-700 text-sm flex items-center gap-2">
                <AlertCircle className="w-4 h-4" /> {logError}
              </div>
            )}

            {loadingLog ? (
              <div className="p-4">
                <TableSkeleton rows={6} cols={6} />
              </div>
            ) : deliveries.length === 0 ? (
              <EmptyState
                icon={Bell}
                title="No follow-up notification records found"
                description="Follow-ups are automatically generated when attendance registers are finalized and submitted for absent or late students."
                className="border-0 shadow-none py-10"
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 text-left text-xs">
                  <thead className="bg-gray-50 text-gray-600 font-semibold uppercase tracking-wider">
                    <tr>
                      <th className="px-4 py-3">Student & Class</th>
                      <th className="px-4 py-3">Event Reason</th>
                      <th className="px-4 py-3">Guardian (Masked)</th>
                      <th className="px-4 py-3">Channel</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Timestamp</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 text-gray-700">
                    {deliveries.map((d) => {
                      const studentName = `${d.studentFirstName} ${d.studentLastName}`.trim();
                      return (
                        <tr key={d.id} className="hover:bg-gray-50/70 transition-colors">
                          <td className="px-4 py-3">
                            <p className="font-medium text-gray-900">{studentName}</p>
                            <p className="text-[11px] text-gray-500">
                              {d.studentRollNumber ? `Roll: ${d.studentRollNumber} • ` : ''}
                              {d.classroomName}
                            </p>
                          </td>
                          <td className="px-4 py-3">
                            {d.eventType === 'ABSENT' ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-red-100 text-red-800 border border-red-200">
                                Absent
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-100 text-amber-800 border border-amber-200">
                                Late Arrival
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <p className="font-medium text-gray-900">{d.recipientName || 'Guardian'}</p>
                            <p className="text-[11px] font-mono text-gray-500">{d.recipientContactMasked}</p>
                          </td>
                          <td className="px-4 py-3">
                            <span className="inline-flex items-center gap-1 font-medium text-gray-700">
                              {d.channel === 'SMS' && <Smartphone className="w-3.5 h-3.5 text-blue-600" />}
                              {d.channel === 'WHATSAPP' && <MessageSquare className="w-3.5 h-3.5 text-emerald-600" />}
                              {d.channel === 'EMAIL' && <Mail className="w-3.5 h-3.5 text-purple-600" />}
                              {d.channel}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            {d.status === 'SENT' && (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                                <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Sent
                              </span>
                            )}
                            {d.status === 'FAILED' && (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-red-50 text-red-700 border border-red-200" title={d.errorMessage}>
                                <AlertCircle className="w-3 h-3 text-red-600" /> Failed
                              </span>
                            )}
                            {d.status === 'SKIPPED' && (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-gray-100 text-gray-700 border border-gray-200" title="Missing guardian phone number">
                                <Info className="w-3 h-3 text-gray-500" /> Skipped
                              </span>
                            )}
                            {d.status === 'PENDING' && (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-blue-50 text-blue-700 border border-blue-200">
                                <Clock className="w-3 h-3 text-blue-600" /> Pending
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-gray-500">
                            {new Date(d.createdAt).toLocaleString(undefined, {
                              dateStyle: 'medium',
                              timeStyle: 'short'
                            })}
                          </td>
                          <td className="px-4 py-3 text-right whitespace-nowrap">
                            <div className="flex items-center justify-end gap-1.5">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setSelectedDelivery(d)}
                                className="px-2 py-1 text-xs"
                                title="View notification details"
                              >
                                <Eye className="w-3.5 h-3.5" />
                              </Button>

                              {isAdmin && d.canRetry && (
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  onClick={() => handleRetry(d.id)}
                                  disabled={retryingId === d.id}
                                  className="px-2 py-1 text-xs text-brand-700 hover:text-brand-800"
                                  title="Retry delivery"
                                >
                                  <RefreshCw className={`w-3.5 h-3.5 ${retryingId === d.id ? 'animate-spin' : ''}`} />
                                  <span className="ml-1 hidden sm:inline">Retry</span>
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Pagination footer */}
            {totalPages > 1 && (
              <div className="px-4 py-3 border-t border-gray-200 flex items-center justify-between text-xs text-gray-500">
                <span>
                  Showing {deliveries.length} of {totalCount} records
                </span>
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="p-1"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  <span className="px-2 font-medium text-gray-700">
                    Page {currentPage} of {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="p-1"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: SETTINGS & TEMPLATES */}
      {isAdmin && activeTab === 'settings' && (
        <div className="max-w-4xl space-y-6">
          {settingsSuccess && (
            <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg flex items-center gap-2 text-sm">
              <Check className="w-4 h-4 text-emerald-600" /> {settingsSuccess}
            </div>
          )}

          {settingsError && (
            <div className="p-4 bg-red-50 border border-red-200 text-red-800 rounded-lg flex items-center gap-2 text-sm">
              <AlertCircle className="w-4 h-4 text-red-600" /> {settingsError}
            </div>
          )}

          {loadingSettings ? (
            <div className="bg-white p-12 rounded-xl border border-gray-200 text-center text-gray-500 text-sm">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-brand-700" />
              Loading organization notification settings...
            </div>
          ) : settings ? (
            <form onSubmit={handleSaveSettings} className="space-y-6">
              {/* General Follow-up Switch Card */}
              <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm space-y-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-base font-semibold text-gray-900 flex items-center gap-2">
                      <Settings className="w-4 h-4 text-brand-700" />
                      Attendance Submission Automation
                    </h3>
                    <p className="text-xs text-gray-500 mt-1">
                      Control whether follow-up notifications are automatically triggered to parents/guardians when a teacher or administrator finalizes and submits an attendance register.
                    </p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings.followUpsEnabled}
                      onChange={(e) => setSettings({ ...settings, followUpsEnabled: e.target.checked })}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand-700"></div>
                  </label>
                </div>

                <div className="pt-3 border-t border-gray-100 grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Absent toggle */}
                  <label className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 hover:bg-gray-50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings.notifyAbsent}
                      onChange={(e) => setSettings({ ...settings, notifyAbsent: e.target.checked })}
                      className="rounded border-gray-300 text-brand-700 focus:ring-brand-700"
                    />
                    <div>
                      <p className="text-xs font-semibold text-gray-900">Notify for Absent Students</p>
                      <p className="text-[11px] text-gray-500">Send instant alert to guardians when a student is marked absent</p>
                    </div>
                  </label>

                  {/* Late toggle */}
                  <label className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 hover:bg-gray-50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings.notifyLate}
                      onChange={(e) => setSettings({ ...settings, notifyLate: e.target.checked })}
                      className="rounded border-gray-300 text-brand-700 focus:ring-brand-700"
                    />
                    <div>
                      <p className="text-xs font-semibold text-gray-900">Notify for Late Arrivals</p>
                      <p className="text-[11px] text-gray-500">Send an informational alert to guardians for late check-in</p>
                    </div>
                  </label>
                </div>

                {/* Default Channel */}
                <div className="pt-3 border-t border-gray-100">
                  <label className="block text-xs font-medium text-gray-700 mb-2">
                    Default Delivery Channel
                  </label>
                  <div className="grid grid-cols-3 gap-3">
                    {(['SMS', 'WHATSAPP', 'EMAIL'] as const).map((ch) => (
                      <button
                        key={ch}
                        type="button"
                        onClick={() => setSettings({ ...settings, defaultChannel: ch })}
                        className={`p-3 rounded-lg border text-xs font-medium flex items-center justify-center gap-2 transition-all ${
                          settings.defaultChannel === ch
                            ? 'border-brand-700 bg-brand-50 text-brand-900'
                            : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                        }`}
                      >
                        {ch === 'SMS' && <Smartphone className="w-4 h-4 text-blue-600" />}
                        {ch === 'WHATSAPP' && <MessageSquare className="w-4 h-4 text-emerald-600" />}
                        {ch === 'EMAIL' && <Mail className="w-4 h-4 text-purple-600" />}
                        {ch}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Message Template Editors */}
              <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm space-y-6">
                <div>
                  <h3 className="text-base font-semibold text-gray-900 flex items-center gap-2">
                    <MessageSquare className="w-4 h-4 text-brand-700" />
                    Notification Message Templates
                  </h3>
                  <p className="text-xs text-gray-500 mt-1">
                    Customize the messages sent to parents. Click on placeholder tags to automatically insert them into your message template.
                  </p>
                </div>

                {/* Variable Tags Palette */}
                <div className="bg-gray-50 p-3 rounded-lg border border-gray-200">
                  <p className="text-[11px] font-semibold text-gray-600 uppercase tracking-wider mb-2">
                    Available Dynamic Variables (Click to insert):
                  </p>
                  <div className="flex flex-wrap gap-2 text-xs">
                    {[
                      { tag: '{student_name}', label: 'Student Full Name' },
                      { tag: '{guardian_name}', label: 'Guardian Name' },
                      { tag: '{date}', label: 'Date of Register' },
                      { tag: '{school_name}', label: 'School Name' },
                      { tag: '{organization_name}', label: 'Organization Name' }
                    ].map(item => (
                      <span key={item.tag} className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => insertToken('ABSENT', item.tag)}
                          className="px-2 py-1 bg-white hover:bg-brand-50 hover:text-brand-700 border border-gray-300 rounded text-gray-700 font-mono text-[11px] transition-colors"
                          title={`Insert into Absent template`}
                        >
                          + {item.tag}
                        </button>
                      </span>
                    ))}
                  </div>
                </div>

                {/* Absent Template */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-gray-800">
                      Absent Notice Template
                    </label>
                    <button
                      type="button"
                      onClick={() => handlePreview('ABSENT')}
                      className="text-xs text-brand-700 hover:text-brand-900 font-medium flex items-center gap-1"
                    >
                      <Eye className="w-3.5 h-3.5" /> Preview Message
                    </button>
                  </div>
                  <textarea
                    rows={3}
                    value={settings.absentTemplate}
                    onChange={(e) => setSettings({ ...settings, absentTemplate: e.target.value })}
                    className="w-full p-3 text-xs border border-gray-300 rounded-md focus:ring-1 focus:ring-brand-700 font-sans"
                    placeholder="Enter message template for absent students..."
                    required
                  />
                  <p className="text-[11px] text-gray-400">
                    Characters: {settings.absentTemplate.length} / 500
                  </p>
                </div>

                {/* Late Template */}
                <div className="space-y-2 pt-4 border-t border-gray-100">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-gray-800">
                      Late Arrival Notice Template
                    </label>
                    <button
                      type="button"
                      onClick={() => handlePreview('LATE')}
                      className="text-xs text-brand-700 hover:text-brand-900 font-medium flex items-center gap-1"
                    >
                      <Eye className="w-3.5 h-3.5" /> Preview Message
                    </button>
                  </div>
                  <textarea
                    rows={3}
                    value={settings.lateTemplate}
                    onChange={(e) => setSettings({ ...settings, lateTemplate: e.target.value })}
                    className="w-full p-3 text-xs border border-gray-300 rounded-md focus:ring-1 focus:ring-brand-700 font-sans"
                    placeholder="Enter message template for late arrivals..."
                    required
                  />
                  <p className="text-[11px] text-gray-400">
                    Characters: {settings.lateTemplate.length} / 500
                  </p>
                </div>
              </div>

              {/* Save Button */}
              <div className="flex justify-end gap-3">
                <Button
                  type="submit"
                  variant="primary"
                  size="md"
                  disabled={savingSettings}
                  className="px-6"
                >
                  {savingSettings ? 'Saving Settings...' : 'Save Follow-up Configuration'}
                </Button>
              </div>
            </form>
          ) : null}
        </div>
      )}

      {/* DETAIL MODAL */}
      {selectedDelivery && (
        <Modal
          isOpen={Boolean(selectedDelivery)}
          onClose={() => {
            setSelectedDelivery(null);
            setRetryMessage(null);
          }}
          title="Notification Delivery Audit Record"
          description={`ID: ${selectedDelivery.id}`}
        >
          <div className="space-y-4 text-xs">
            {retryMessage && (
              <div className={`p-3 rounded-lg text-xs flex items-center gap-2 ${
                retryMessage.type === 'success' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-red-50 text-red-800 border border-red-200'
              }`}>
                {retryMessage.type === 'success' ? <Check className="w-4 h-4 text-emerald-600" /> : <AlertTriangle className="w-4 h-4 text-red-600" />}
                {retryMessage.text}
              </div>
            )}

            {/* Recipient & Event Details */}
            <div className="bg-gray-50 p-3.5 rounded-lg border border-gray-200 grid grid-cols-2 gap-3">
              <div>
                <p className="text-gray-500">Student</p>
                <p className="font-semibold text-gray-900">{selectedDelivery.studentFirstName} {selectedDelivery.studentLastName}</p>
                <p className="text-[11px] text-gray-500">Roll: {selectedDelivery.studentRollNumber || 'N/A'}</p>
              </div>
              <div>
                <p className="text-gray-500">Classroom & Centre</p>
                <p className="font-semibold text-gray-900">{selectedDelivery.classroomName}</p>
                <p className="text-[11px] text-gray-500">{selectedDelivery.schoolName}</p>
              </div>
              <div>
                <p className="text-gray-500">Guardian Contact</p>
                <p className="font-semibold text-gray-900">{selectedDelivery.recipientName}</p>
                <p className="font-mono text-gray-600">{selectedDelivery.recipientContactMasked}</p>
              </div>
              <div>
                <p className="text-gray-500">Event Trigger</p>
                <p className="font-semibold text-gray-900">
                  {selectedDelivery.eventType === 'ABSENT' ? 'Student Marked Absent' : 'Student Marked Late'}
                </p>
                <p className="text-[11px] text-gray-500">Date: {selectedDelivery.sessionDate}</p>
              </div>
            </div>

            {/* Message Content Rendered */}
            <div>
              <p className="text-gray-500 font-medium mb-1">Delivered Message Content</p>
              <div className="bg-white p-3 rounded-lg border border-gray-200 text-gray-800 font-mono text-[11px] whitespace-pre-wrap">
                {selectedDelivery.messageContent}
              </div>
            </div>

            {/* Provider and Audit Details */}
            <div className="grid grid-cols-2 gap-3 pt-2 border-t border-gray-100">
              <div>
                <p className="text-gray-500">Provider & Channel</p>
                <p className="font-medium text-gray-800">{selectedDelivery.provider} ({selectedDelivery.channel})</p>
                <p className="text-[11px] text-gray-400">
                  {selectedDelivery.isSimulated ? 'Simulated Sandbox' : 'Live Gateway'}
                </p>
              </div>
              <div>
                <p className="text-gray-500">Status & Attempts</p>
                <p className="font-medium text-gray-800">
                  {selectedDelivery.status} • Attempts: {selectedDelivery.retryCount} / {selectedDelivery.maxRetries}
                </p>
                {selectedDelivery.providerMessageId && (
                  <p className="text-[11px] font-mono text-gray-400 truncate">MsgId: {selectedDelivery.providerMessageId}</p>
                )}
              </div>
            </div>

            {/* Error Message if Failed */}
            {selectedDelivery.errorMessage && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-800">
                <p className="font-semibold flex items-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5 text-red-600" /> Error Details
                </p>
                <p className="mt-1 text-[11px] font-mono">{selectedDelivery.errorMessage}</p>
              </div>
            )}

            {/* Actions */}
            <div className="pt-3 border-t border-gray-200 flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelectedDelivery(null)}
              >
                Close
              </Button>

              {isAdmin && selectedDelivery.canRetry && (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => handleRetry(selectedDelivery.id)}
                  disabled={retryingId === selectedDelivery.id}
                >
                  <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${retryingId === selectedDelivery.id ? 'animate-spin' : ''}`} />
                  Retry Delivery Now
                </Button>
              )}
            </div>
          </div>
        </Modal>
      )}

      {/* LIVE PREVIEW MODAL */}
      {previewModalOpen && (
        <Modal
          isOpen={previewModalOpen}
          onClose={() => setPreviewModalOpen(false)}
          title={`Live Message Preview (${previewTemplateType})`}
          description="Simulated render with dynamic student and guardian placeholders"
        >
          <div className="space-y-4 text-xs">
            {loadingPreview ? (
              <div className="p-8 text-center text-gray-500">
                <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-brand-700" />
                Rendering preview...
              </div>
            ) : (
              <div>
                <p className="text-gray-500 font-medium mb-1.5">Sample Delivered Message:</p>
                <div className="bg-gray-50 p-4 rounded-xl border border-gray-200 text-gray-900 font-sans text-xs whitespace-pre-wrap leading-relaxed shadow-inner">
                  {previewContent}
                </div>
              </div>
            )}

            <div className="pt-3 border-t border-gray-200 flex justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPreviewModalOpen(false)}
              >
                Close Preview
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
