'use client';

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { apiFetch } from '@/lib/api';
import {
  Button,
  Input,
  Select,
  Modal,
  EmptyState,
  TableSkeleton,
  StatusBadge
} from '@/components/ui/components';
import {
  Shield,
  Search,
  Filter,
  RefreshCw,
  Calendar,
  Eye,
  Lock,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  FileText,
  User,
  Activity,
  ArrowLeft
} from 'lucide-react';

interface AuditLogItem {
  id: string;
  organizationId: string | null;
  organizationName?: string | null;
  actorUserId: string | null;
  actorRole: string | null;
  actorName?: string | null;
  actorEmail?: string | null;
  action: string;
  targetType: string;
  targetId: string | null;
  ipAddress: string | null;
  metadata: Record<string, any> | null;
  createdAt: string;
}

interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export default function SystemAuditPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'PLATFORM_ADMIN' || user?.role === 'ORG_ADMIN';

  const [logs, setLogs] = useState<AuditLogItem[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta>({ page: 1, limit: 25, total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [actionFilter, setActionFilter] = useState('');
  const [targetTypeFilter, setTargetTypeFilter] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [currentPage, setCurrentPage] = useState(1);

  // Modal inspection
  const [selectedLog, setSelectedLog] = useState<AuditLogItem | null>(null);

  const fetchAuditLogs = useCallback(async (page = 1, isManualRefresh = false) => {
    if (!isAdmin) return;

    if (isManualRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('limit', '25');

      if (actionFilter) params.set('action', actionFilter);
      if (targetTypeFilter) params.set('targetType', targetTypeFilter);
      if (startDate) params.set('startDate', startDate);
      if (endDate) params.set('endDate', endDate);

      const res = await apiFetch<{
        logs: AuditLogItem[];
        pagination: PaginationMeta;
      }>(`/api/audit-logs?${params.toString()}`);

      setLogs(res.logs || []);
      setPagination(res.pagination || { page: 1, limit: 25, total: 0, totalPages: 1 });
      setCurrentPage(page);
    } catch (err: any) {
      setError(err.message || 'Failed to retrieve system audit logs');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [isAdmin, actionFilter, targetTypeFilter, startDate, endDate]);

  useEffect(() => {
    fetchAuditLogs(1);
  }, [fetchAuditLogs]);

  // If role is Teacher, render clean access-denied state
  if (user && !isAdmin) {
    return (
      <div className="p-6 md:p-10 max-w-2xl mx-auto text-center">
        <div className="bg-white p-8 rounded-2xl border border-gray-200 shadow-sm">
          <div className="inline-flex p-3 bg-amber-50 rounded-full text-amber-700 mb-4" aria-hidden="true">
            <Lock className="w-8 h-8" />
          </div>
          <h1 className="text-xl font-bold text-gray-900">Restricted Access</h1>
          <p className="text-sm text-gray-600 mt-2 leading-relaxed">
            System audit logs are restricted to Organization and Platform Administrators for compliance and tenant security.
          </p>
          <div className="mt-6">
            <Link href="/dashboard/attendance">
              <Button size="sm" className="gap-2">
                <ArrowLeft className="w-4 h-4" />
                Return to Daily Attendance
              </Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const handleResetFilters = () => {
    setActionFilter('');
    setTargetTypeFilter('');
    setStartDate('');
    setEndDate('');
    fetchAuditLogs(1);
  };

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-7xl mx-auto w-full">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-gray-900 flex items-center gap-2.5">
              <Shield className="w-6 h-6 text-brand-700 shrink-0" aria-hidden="true" />
              Security & Audit Trail
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-brand-50 text-brand-800 border border-brand-200">
              Immutable
            </span>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            Tamper-evident record of security events, administrative changes, attendance submissions, and follow-ups.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchAuditLogs(currentPage, true)}
            loading={refreshing}
            className="text-xs gap-1.5"
            aria-label="Refresh audit logs"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <label htmlFor="audit-action" className="block text-xs font-medium text-gray-700 mb-1">
              Event Action
            </label>
            <select
              id="audit-action"
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
              className="block w-full px-3 py-2 text-xs border border-gray-300 rounded-lg bg-white text-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-700"
            >
              <option value="">All Actions</option>
              <option value="LOGIN_SUCCESS">LOGIN_SUCCESS</option>
              <option value="LOGIN_FAILURE">LOGIN_FAILURE</option>
              <option value="LOGOUT">LOGOUT</option>
              <option value="STUDENT_CREATE">STUDENT_CREATE</option>
              <option value="STUDENT_UPDATE">STUDENT_UPDATE</option>
              <option value="STUDENT_ENROLL">STUDENT_ENROLL</option>
              <option value="ATTENDANCE_SUBMIT">ATTENDANCE_SUBMIT</option>
              <option value="NOTIFICATION_SETTINGS_UPDATE">NOTIFICATION_SETTINGS_UPDATE</option>
              <option value="NOTIFICATION_RETRY_SUCCESS">NOTIFICATION_RETRY_SUCCESS</option>
              <option value="NOTIFICATION_RETRY_FAILED">NOTIFICATION_RETRY_FAILED</option>
            </select>
          </div>

          <div>
            <label htmlFor="audit-target" className="block text-xs font-medium text-gray-700 mb-1">
              Target Type
            </label>
            <select
              id="audit-target"
              value={targetTypeFilter}
              onChange={(e) => setTargetTypeFilter(e.target.value)}
              className="block w-full px-3 py-2 text-xs border border-gray-300 rounded-lg bg-white text-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-700"
            >
              <option value="">All Target Types</option>
              <option value="STUDENT">STUDENT</option>
              <option value="ATTENDANCE_SESSION">ATTENDANCE_SESSION</option>
              <option value="ENROLLMENT">ENROLLMENT</option>
              <option value="NOTIFICATION_SETTINGS">NOTIFICATION_SETTINGS</option>
              <option value="NOTIFICATION_DELIVERY">NOTIFICATION_DELIVERY</option>
              <option value="AUTH">AUTH</option>
            </select>
          </div>

          <div>
            <label htmlFor="audit-start" className="block text-xs font-medium text-gray-700 mb-1">
              From Date
            </label>
            <input
              id="audit-start"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="block w-full px-3 py-1.5 text-xs border border-gray-300 rounded-lg bg-white text-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-700"
            />
          </div>

          <div>
            <label htmlFor="audit-end" className="block text-xs font-medium text-gray-700 mb-1">
              To Date
            </label>
            <input
              id="audit-end"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="block w-full px-3 py-1.5 text-xs border border-gray-300 rounded-lg bg-white text-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-700"
            />
          </div>
        </div>

        {(actionFilter || targetTypeFilter || startDate || endDate) && (
          <div className="pt-2 border-t border-gray-100 flex justify-end">
            <button
              onClick={handleResetFilters}
              className="text-xs text-brand-700 hover:text-brand-800 font-medium hover:underline"
            >
              Clear all filters
            </button>
          </div>
        )}
      </div>

      {/* Error Notice */}
      {error && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-xs text-red-800 flex items-center gap-2" role="alert">
          <AlertCircle className="w-4 h-4 text-red-600 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}

      {/* Audit Log Table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-6">
            <TableSkeleton rows={8} cols={5} />
          </div>
        ) : logs.length === 0 ? (
          <EmptyState
            icon={Shield}
            title="No audit log entries found"
            description="There are no security or operational events matching your selected filter criteria."
            actionLabel={actionFilter || targetTypeFilter || startDate || endDate ? 'Reset Filters' : undefined}
            onAction={handleResetFilters}
            className="border-0 shadow-none"
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 text-left text-xs">
                <thead className="bg-gray-50/80 text-gray-600 font-semibold uppercase tracking-wider">
                  <tr>
                    <th scope="col" className="px-4 py-3">Timestamp</th>
                    <th scope="col" className="px-4 py-3">Action</th>
                    <th scope="col" className="px-4 py-3">Actor</th>
                    <th scope="col" className="px-4 py-3">Target</th>
                    <th scope="col" className="px-4 py-3">IP Address</th>
                    <th scope="col" className="px-4 py-3 text-right">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-gray-700">
                  {logs.map((log) => {
                    const isFailure = log.action.includes('FAIL');
                    return (
                      <tr key={log.id} className="hover:bg-gray-50/70 transition-colors">
                        <td className="px-4 py-3 text-gray-500 whitespace-nowrap font-mono text-[11px]">
                          {new Date(log.createdAt).toLocaleString(undefined, {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit'
                          })}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-mono font-bold ${
                              isFailure
                                ? 'bg-red-50 text-red-700 border border-red-200'
                                : 'bg-brand-50 text-brand-800 border border-brand-200'
                            }`}
                          >
                            {log.action}
                          </span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="flex flex-col">
                            <span className="font-semibold text-gray-900">{log.actorName || log.actorEmail || 'System'}</span>
                            <span className="text-[10px] text-gray-400 font-mono">{log.actorRole || 'SYSTEM'}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="flex flex-col">
                            <span className="font-medium text-gray-900">{log.targetType}</span>
                            {log.targetId && (
                              <span className="text-[10px] text-gray-400 font-mono truncate max-w-[120px]">
                                {log.targetId}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 font-mono text-[11px] text-gray-500 whitespace-nowrap">
                          {log.ipAddress || 'internal'}
                        </td>
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setSelectedLog(log)}
                            className="text-xs p-1.5 h-auto text-brand-700 hover:text-brand-800 hover:bg-brand-50"
                            aria-label={`View audit metadata for ${log.action}`}
                          >
                            <Eye className="w-3.5 h-3.5 mr-1" />
                            Inspect
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            <div className="p-4 border-t border-gray-100 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-gray-500">
              <p>
                Showing <span className="font-semibold text-gray-900">{(pagination.page - 1) * pagination.limit + 1}</span> to{' '}
                <span className="font-semibold text-gray-900">
                  {Math.min(pagination.page * pagination.limit, pagination.total)}
                </span>{' '}
                of <span className="font-semibold text-gray-900">{pagination.total}</span> audit records
              </p>

              <div className="flex items-center gap-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fetchAuditLogs(currentPage - 1)}
                  disabled={currentPage <= 1 || loading}
                  className="p-1.5 min-h-[32px]"
                  aria-label="Previous audit page"
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <span className="px-2 text-xs font-medium text-gray-700">
                  Page {pagination.page} of {pagination.totalPages || 1}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fetchAuditLogs(currentPage + 1)}
                  disabled={currentPage >= pagination.totalPages || loading}
                  className="p-1.5 min-h-[32px]"
                  aria-label="Next audit page"
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Metadata Inspector Modal */}
      {selectedLog && (
        <Modal
          isOpen={Boolean(selectedLog)}
          onClose={() => setSelectedLog(null)}
          title={`Audit Record Details: ${selectedLog.action}`}
          description={`Logged at ${new Date(selectedLog.createdAt).toLocaleString()} from ${selectedLog.ipAddress || 'internal'}`}
          maxWidth="lg"
        >
          <div className="space-y-4 text-xs">
            <div className="grid grid-cols-2 gap-3 p-3 bg-gray-50 rounded-lg border border-gray-100">
              <div>
                <p className="font-semibold text-gray-500 uppercase text-[10px]">Actor</p>
                <p className="font-medium text-gray-900 mt-0.5">{selectedLog.actorName || selectedLog.actorEmail || 'System / Anonymous'}</p>
                <p className="text-[10px] text-gray-500">{selectedLog.actorRole || 'SYSTEM'}</p>
              </div>
              <div>
                <p className="font-semibold text-gray-500 uppercase text-[10px]">Target</p>
                <p className="font-medium text-gray-900 mt-0.5">{selectedLog.targetType}</p>
                <p className="text-[10px] font-mono text-gray-500 truncate">{selectedLog.targetId || 'N/A'}</p>
              </div>
            </div>

            <div>
              <p className="font-semibold text-gray-700 mb-1 flex items-center justify-between">
                <span>Sanitized Metadata Payload</span>
                <span className="text-[10px] text-gray-400 font-normal">Passwords & tokens redacted</span>
              </p>
              <pre className="p-3 bg-gray-900 text-gray-100 rounded-lg overflow-x-auto text-[11px] font-mono leading-relaxed border border-gray-800 max-h-[280px]">
                {JSON.stringify(selectedLog.metadata || {}, null, 2)}
              </pre>
            </div>

            <div className="pt-2 flex justify-end">
              <Button size="sm" variant="outline" onClick={() => setSelectedLog(null)}>
                Close
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
