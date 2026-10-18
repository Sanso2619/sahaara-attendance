import React, { useEffect, useId } from 'react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import {
  X,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  MinusCircle,
  AlertCircle,
  Check,
  Info
} from 'lucide-react';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// ---------------------------------------------------------------------------
// 1. BUTTON
// ---------------------------------------------------------------------------
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', loading = false, disabled, children, ...props }, ref) => {
    const base = 'inline-flex items-center justify-center font-medium rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-700 focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none active:scale-[0.98] motion-reduce:active:scale-100 motion-reduce:transition-none select-none';
    const variants = {
      primary: 'bg-brand-700 text-white hover:bg-brand-800 shadow-sm border border-transparent',
      secondary: 'bg-gray-100 text-gray-900 hover:bg-gray-200 border border-transparent',
      outline: 'border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 shadow-sm',
      danger: 'bg-red-600 text-white hover:bg-red-700 shadow-sm border border-transparent',
      ghost: 'bg-transparent text-gray-600 hover:bg-gray-100 border border-transparent'
    };
    const sizes = {
      sm: 'px-3 py-1.5 text-xs gap-1.5 min-h-[32px]',
      md: 'px-4 py-2 text-sm gap-2 min-h-[40px]',
      lg: 'px-5 py-2.5 text-base gap-2.5 min-h-[48px]'
    };

    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        aria-busy={loading ? 'true' : undefined}
        className={cn(base, variants[variant], sizes[size], className)}
        {...props}
      >
        {loading && (
          <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin shrink-0" aria-hidden="true" />
        )}
        {children}
      </button>
    );
  }
);
Button.displayName = 'Button';

// ---------------------------------------------------------------------------
// 2. STATUS BADGE (Accessible with icons - not color alone)
// ---------------------------------------------------------------------------
export type BadgeStatus =
  | 'PRESENT'
  | 'ABSENT'
  | 'LATE'
  | 'ACTIVE'
  | 'INACTIVE'
  | 'PENDING'
  | 'SENT'
  | 'FAILED'
  | 'SKIPPED'
  | 'SUBMITTED'
  | 'OPEN'
  | 'NOT_STARTED'
  | 'GRANTED'
  | 'WITHDRAWN';

export interface StatusBadgeProps {
  status: BadgeStatus | string;
  label?: string;
  className?: string;
}

export function StatusBadge({ status, label, className }: StatusBadgeProps) {
  const normStatus = status?.toUpperCase() as BadgeStatus;

  const config: Record<string, { bg: string; text: string; border: string; icon: React.ComponentType<{ className?: string }> }> = {
    PRESENT: { bg: 'bg-emerald-50', text: 'text-emerald-800', border: 'border-emerald-200', icon: CheckCircle2 },
    ACTIVE: { bg: 'bg-emerald-50', text: 'text-emerald-800', border: 'border-emerald-200', icon: CheckCircle2 },
    SENT: { bg: 'bg-emerald-50', text: 'text-emerald-800', border: 'border-emerald-200', icon: CheckCircle2 },
    SUBMITTED: { bg: 'bg-emerald-50', text: 'text-emerald-800', border: 'border-emerald-200', icon: CheckCircle2 },
    GRANTED: { bg: 'bg-emerald-50', text: 'text-emerald-800', border: 'border-emerald-200', icon: CheckCircle2 },

    ABSENT: { bg: 'bg-red-50', text: 'text-red-800', border: 'border-red-200', icon: XCircle },
    INACTIVE: { bg: 'bg-gray-100', text: 'text-gray-700', border: 'border-gray-200', icon: MinusCircle },
    FAILED: { bg: 'bg-red-50', text: 'text-red-800', border: 'border-red-200', icon: XCircle },
    WITHDRAWN: { bg: 'bg-red-50', text: 'text-red-800', border: 'border-red-200', icon: XCircle },

    LATE: { bg: 'bg-amber-50', text: 'text-amber-800', border: 'border-amber-200', icon: Clock },
    PENDING: { bg: 'bg-amber-50', text: 'text-amber-800', border: 'border-amber-200', icon: Clock },
    OPEN: { bg: 'bg-amber-50', text: 'text-amber-800', border: 'border-amber-200', icon: Clock },

    SKIPPED: { bg: 'bg-gray-50', text: 'text-gray-700', border: 'border-gray-200', icon: MinusCircle },
    NOT_STARTED: { bg: 'bg-gray-50', text: 'text-gray-700', border: 'border-gray-200', icon: MinusCircle },
  };

  const current = config[normStatus] || {
    bg: 'bg-gray-50',
    text: 'text-gray-700',
    border: 'border-gray-200',
    icon: Info
  };

  const Icon = current.icon;
  const displayLabel = label || status?.replace('_', ' ');

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold border',
        current.bg,
        current.text,
        current.border,
        className
      )}
    >
      <Icon className="w-3 h-3 shrink-0" aria-hidden="true" />
      <span>{displayLabel}</span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// 3. INPUT
// ---------------------------------------------------------------------------
export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, helperText, id, ...props }, ref) => {
    const generatedId = useId();
    const inputId = id || generatedId;
    const errorId = `${inputId}-error`;
    const helperId = `${inputId}-helper`;

    return (
      <div className="w-full">
        {label && (
          <label htmlFor={inputId} className="block text-xs font-medium text-gray-700 mb-1">
            {label}
            {props.required && <span className="text-red-500 ml-0.5" aria-hidden="true">*</span>}
          </label>
        )}
        <input
          id={inputId}
          ref={ref}
          aria-invalid={error ? 'true' : 'false'}
          aria-describedby={error ? errorId : helperText ? helperId : undefined}
          className={cn(
            'block w-full px-3 py-2 text-sm border rounded-lg shadow-sm bg-white placeholder-gray-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-700 focus-visible:border-brand-700 transition-colors',
            error
              ? 'border-red-300 text-red-900 focus-visible:ring-red-500 focus-visible:border-red-500'
              : 'border-gray-300 text-gray-900',
            className
          )}
          {...props}
        />
        {error && (
          <p id={errorId} className="mt-1 text-xs text-red-600 flex items-center gap-1" role="alert">
            <AlertCircle className="w-3 h-3 shrink-0" aria-hidden="true" />
            <span>{error}</span>
          </p>
        )}
        {helperText && !error && (
          <p id={helperId} className="mt-1 text-xs text-gray-500">{helperText}</p>
        )}
      </div>
    );
  }
);
Input.displayName = 'Input';

// ---------------------------------------------------------------------------
// 4. SELECT
// ---------------------------------------------------------------------------
export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  options?: { value: string; label: string }[];
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, label, error, children, id, options, ...props }, ref) => {
    const generatedId = useId();
    const selectId = id || generatedId;
    const errorId = `${selectId}-error`;

    return (
      <div className="w-full">
        {label && (
          <label htmlFor={selectId} className="block text-xs font-medium text-gray-700 mb-1">
            {label}
            {props.required && <span className="text-red-500 ml-0.5" aria-hidden="true">*</span>}
          </label>
        )}
        <select
          id={selectId}
          ref={ref}
          aria-invalid={error ? 'true' : 'false'}
          aria-describedby={error ? errorId : undefined}
          className={cn(
            'block w-full px-3 py-2 text-sm border rounded-lg shadow-sm bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-700 focus-visible:border-brand-700 transition-colors',
            error
              ? 'border-red-300 text-red-900 focus-visible:ring-red-500 focus-visible:border-red-500'
              : 'border-gray-300 text-gray-900',
            className
          )}
          {...props}
        >
          {options
            ? options.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))
            : children}
        </select>
        {error && (
          <p id={errorId} className="mt-1 text-xs text-red-600 flex items-center gap-1" role="alert">
            <AlertCircle className="w-3 h-3 shrink-0" aria-hidden="true" />
            <span>{error}</span>
          </p>
        )}
      </div>
    );
  }
);
Select.displayName = 'Select';

// ---------------------------------------------------------------------------
// 5. MODAL (Accessible dialog with ESC support)
// ---------------------------------------------------------------------------
export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl';
}

export function Modal({ isOpen, onClose, title, description, children, maxWidth = 'lg' }: ModalProps) {
  const titleId = useId();

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const maxWidthClasses = {
    sm: 'sm:max-w-sm',
    md: 'sm:max-w-md',
    lg: 'sm:max-w-lg',
    xl: 'sm:max-w-xl',
    '2xl': 'sm:max-w-2xl'
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className="fixed inset-0 z-50 overflow-y-auto"
    >
      <div className="flex min-h-full items-center justify-center p-4 text-center sm:p-0">
        <div
          className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm transition-opacity"
          onClick={onClose}
          aria-hidden="true"
        />
        <div
          className={cn(
            'relative transform overflow-hidden rounded-xl bg-white text-left shadow-xl transition-all sm:my-8 w-full border border-gray-200',
            maxWidthClasses[maxWidth]
          )}
        >
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
            <div>
              <h3 id={titleId} className="text-base font-semibold text-gray-900">{title}</h3>
              {description && <p className="text-xs text-gray-500 mt-0.5">{description}</p>}
            </div>
            <button
              onClick={onClose}
              className="rounded-lg text-gray-400 hover:text-gray-600 p-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-700"
              aria-label="Close dialog"
            >
              <X className="w-5 h-5" aria-hidden="true" />
            </button>
          </div>
          <div className="px-6 py-5">{children}</div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 6. CONFIRM DIALOG
// ---------------------------------------------------------------------------
export interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  confirmVariant?: 'danger' | 'primary';
  loading?: boolean;
}

export function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Confirm',
  confirmVariant = 'danger',
  loading = false
}: ConfirmDialogProps) {
  const titleId = useId();

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !loading) onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, loading]);

  if (!isOpen) return null;

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className="fixed inset-0 z-50 overflow-y-auto"
    >
      <div className="flex min-h-full items-center justify-center p-4 text-center sm:p-0">
        <div
          className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm transition-opacity"
          onClick={() => { if (!loading) onClose(); }}
          aria-hidden="true"
        />
        <div className="relative transform overflow-hidden rounded-xl bg-white text-left shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-md border border-gray-200 p-6">
          <div className="flex items-start gap-4">
            <div
              className={cn(
                'p-2.5 rounded-full shrink-0',
                confirmVariant === 'danger' ? 'bg-red-100 text-red-600' : 'bg-brand-100 text-brand-700'
              )}
              aria-hidden="true"
            >
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h3 id={titleId} className="text-base font-semibold text-gray-900">{title}</h3>
              <p className="mt-1 text-sm text-gray-600 leading-relaxed">{message}</p>
            </div>
          </div>
          <div className="mt-6 flex justify-end gap-3">
            <Button variant="outline" size="sm" onClick={onClose} disabled={loading}>
              Cancel
            </Button>
            <Button variant={confirmVariant} size="sm" onClick={onConfirm} loading={loading} disabled={loading}>
              {confirmLabel}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 7. EMPTY STATE
// ---------------------------------------------------------------------------
export interface EmptyStateProps {
  icon?: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
}

export function EmptyState({ icon: Icon, title, description, actionLabel, onAction, className }: EmptyStateProps) {
  return (
    <div className={cn('text-center py-12 px-4 bg-white rounded-xl border border-gray-200 shadow-sm', className)}>
      {Icon && (
        <div className="inline-flex items-center justify-center p-3.5 bg-brand-50 rounded-full text-brand-700 mb-3" aria-hidden="true">
          <Icon className="w-6 h-6" />
        </div>
      )}
      <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
      <p className="mt-1.5 text-xs text-gray-500 max-w-sm mx-auto leading-relaxed">{description}</p>
      {actionLabel && onAction && (
        <div className="mt-5">
          <Button size="sm" onClick={onAction}>
            {actionLabel}
          </Button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 8. SKELETON LOADERS
// ---------------------------------------------------------------------------
export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('animate-pulse rounded-md bg-gray-200/80 motion-reduce:animate-none', className)}
      aria-hidden="true"
      {...props}
    />
  );
}

export function TableSkeleton({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="space-y-3 p-4 bg-white rounded-xl border border-gray-200" aria-label="Loading content...">
      <div className="flex gap-4 border-b border-gray-100 pb-3">
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={`head-${i}`} className="h-4 flex-1" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={`row-${r}`} className="flex gap-4 py-2 border-b border-gray-50 last:border-0">
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton key={`cell-${r}-${c}`} className={cn('h-4 flex-1', c === 0 ? 'w-1/3 flex-none' : '')} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function CardSkeleton() {
  return (
    <div className="p-5 bg-white rounded-xl border border-gray-200 shadow-sm space-y-3" aria-hidden="true">
      <div className="flex justify-between items-center">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-8 w-8 rounded-lg" />
      </div>
      <Skeleton className="h-8 w-32" />
      <Skeleton className="h-3 w-40" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// 9. ALERT BANNER
// ---------------------------------------------------------------------------
export interface AlertBannerProps {
  variant?: 'success' | 'error' | 'warning' | 'info';
  title?: string;
  message: string;
  onDismiss?: () => void;
  className?: string;
}

export function AlertBanner({ variant = 'info', title, message, onDismiss, className }: AlertBannerProps) {
  const styles = {
    success: 'bg-emerald-50 border-emerald-200 text-emerald-900',
    error: 'bg-red-50 border-red-200 text-red-900',
    warning: 'bg-amber-50 border-amber-200 text-amber-900',
    info: 'bg-brand-50 border-brand-200 text-brand-900'
  };

  const icons = {
    success: CheckCircle2,
    error: AlertCircle,
    warning: AlertTriangle,
    info: Info
  };

  const Icon = icons[variant];

  return (
    <div
      role="alert"
      className={cn('p-4 rounded-xl border flex items-start gap-3 shadow-sm', styles[variant], className)}
    >
      <Icon className="w-5 h-5 shrink-0 mt-0.5" aria-hidden="true" />
      <div className="flex-1 text-xs leading-relaxed">
        {title && <p className="font-semibold text-sm mb-0.5">{title}</p>}
        <p>{message}</p>
      </div>
      {onDismiss && (
        <button
          onClick={onDismiss}
          className="text-gray-400 hover:text-gray-600 p-1 rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-700"
          aria-label="Dismiss alert"
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}
