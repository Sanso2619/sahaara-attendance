'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/components';
import { Lock, Mail, AlertCircle, Shield, Building2, UserCheck } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to authenticate');
      }

      router.push('/dashboard');
    } catch (err: any) {
      setError(err.message || 'Unable to connect to login service.');
    } finally {
      setLoading(false);
    }
  };

  const setDemoCredentials = (roleEmail: string) => {
    setEmail(roleEmail);
    setPassword('Password123!');
    setError('');
  };

  return (
    <div className="min-h-screen flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8 bg-surface-canvas">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-brand-700 text-white font-black text-xl mb-3 shadow-md" aria-hidden="true">
          SA
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">
          Sign in to Sahaara
        </h1>
        <p className="mt-1 text-xs text-gray-600">
          Digital attendance management for NGO schools & learning centres
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-6 shadow-sm border border-gray-200 rounded-2xl sm:px-10">
          {error && (
            <div className="mb-4 p-3.5 rounded-xl bg-red-50 border border-red-200 flex items-start gap-2.5 text-xs text-red-800" role="alert">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" aria-hidden="true" />
              <span>{error}</span>
            </div>
          )}

          <form className="space-y-4" onSubmit={handleSubmit} noValidate>
            <div>
              <label htmlFor="email" className="block text-xs font-semibold text-gray-700 mb-1">
                Email Address <span className="text-red-500">*</span>
              </label>
              <div className="relative rounded-lg shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none" aria-hidden="true">
                  <Mail className="h-4 w-4 text-gray-400" />
                </div>
                <input
                  id="email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@ngo.org"
                  className="block w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg bg-white text-gray-900 placeholder-gray-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-700 focus-visible:border-brand-700 text-sm transition-colors"
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="block text-xs font-semibold text-gray-700 mb-1">
                Password <span className="text-red-500">*</span>
              </label>
              <div className="relative rounded-lg shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none" aria-hidden="true">
                  <Lock className="h-4 w-4 text-gray-400" />
                </div>
                <input
                  id="password"
                  type="password"
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="block w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg bg-white text-gray-900 placeholder-gray-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-700 focus-visible:border-brand-700 text-sm transition-colors"
                />
              </div>
            </div>

            <div className="pt-2">
              <Button
                type="submit"
                loading={loading}
                className="w-full font-semibold shadow-sm"
              >
                Sign In
              </Button>
            </div>
          </form>

          {/* Quick Demo Accounts for Local User Acceptance Testing */}
          <div className="mt-6 pt-5 border-t border-gray-100">
            <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2.5 text-center">
              Quick Demo Fill (UAT Testing)
            </p>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setDemoCredentials('platform.admin@sahaara.org')}
                className="flex flex-col items-center justify-center p-2 rounded-lg border border-gray-200 bg-gray-50 hover:bg-gray-100 text-[11px] font-medium text-gray-700 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-700"
              >
                <Shield className="w-3.5 h-3.5 text-brand-700 mb-1" aria-hidden="true" />
                Platform
              </button>
              <button
                type="button"
                onClick={() => setDemoCredentials('admin@hope-edu.org')}
                className="flex flex-col items-center justify-center p-2 rounded-lg border border-gray-200 bg-gray-50 hover:bg-gray-100 text-[11px] font-medium text-gray-700 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-700"
              >
                <Building2 className="w-3.5 h-3.5 text-brand-700 mb-1" aria-hidden="true" />
                Org Admin
              </button>
              <button
                type="button"
                onClick={() => setDemoCredentials('teacher@hope-edu.org')}
                className="flex flex-col items-center justify-center p-2 rounded-lg border border-gray-200 bg-gray-50 hover:bg-gray-100 text-[11px] font-medium text-gray-700 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-700"
              >
                <UserCheck className="w-3.5 h-3.5 text-brand-700 mb-1" aria-hidden="true" />
                Teacher
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
