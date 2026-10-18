'use client';

import React, { useEffect } from 'react';
import Link from 'next/link';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';
import { Button } from '@/components/ui/components';

export default function GlobalErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log sanitized error summary locally in client console
    console.error('Unhandled UI boundary error:', error?.message);
  }, [error]);

  return (
    <div className="min-h-screen bg-surface-canvas flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-2xl border border-gray-200 shadow-sm p-8 text-center" role="alert">
        <div className="inline-flex p-4 rounded-full bg-red-50 text-red-600 mb-4" aria-hidden="true">
          <AlertTriangle className="w-10 h-10" />
        </div>
        <p className="text-xs font-bold text-red-600 uppercase tracking-widest">Application Notice</p>
        <h1 className="text-2xl font-bold text-gray-900 mt-2">Something went wrong</h1>
        <p className="text-sm text-gray-600 mt-2 leading-relaxed">
          An unexpected interface error occurred. We have isolated the issue to protect your session and attendance data.
        </p>

        {error.digest && (
          <p className="text-[11px] text-gray-400 mt-3 font-mono">
            Reference code: {error.digest}
          </p>
        )}

        <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
          <Button
            onClick={() => reset()}
            className="gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            Try again
          </Button>
          <Link
            href="/dashboard"
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-gray-300 bg-white text-gray-700 text-sm font-medium hover:bg-gray-50 transition-colors shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-700 focus-visible:ring-offset-2"
          >
            <Home className="w-4 h-4" />
            Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
