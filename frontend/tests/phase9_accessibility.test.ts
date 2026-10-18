import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import {
  StatusBadge,
  Button,
  Input,
  Select,
  ConfirmDialog,
  AlertBanner,
  TableSkeleton,
  CardSkeleton,
  EmptyState
} from '../src/components/ui/components';

describe('Phase 9 Accessibility & UI Polish Tests', () => {
  describe('StatusBadge Accessibility', () => {
    it('renders icon with aria-hidden="true" alongside label text (not color alone)', () => {
      const html = renderToString(React.createElement(StatusBadge, { status: 'PRESENT' }));
      expect(html).toContain('PRESENT');
      expect(html).toContain('aria-hidden="true"');
      // Verifies accessible WCAG high-contrast text styling
      expect(html).toContain('text-emerald-800');
    });

    it('renders absent status with red high contrast tokens and icon', () => {
      const html = renderToString(React.createElement(StatusBadge, { status: 'ABSENT' }));
      expect(html).toContain('ABSENT');
      expect(html).toContain('aria-hidden="true"');
      expect(html).toContain('text-red-800');
    });

    it('renders late status with amber high contrast tokens and icon', () => {
      const html = renderToString(React.createElement(StatusBadge, { status: 'LATE' }));
      expect(html).toContain('LATE');
      expect(html).toContain('aria-hidden="true"');
      expect(html).toContain('text-amber-800');
    });

    it('renders custom label correctly', () => {
      const html = renderToString(React.createElement(StatusBadge, { status: 'NOT_STARTED', label: 'Unrecorded' }));
      expect(html).toContain('Unrecorded');
    });
  });

  describe('Button Accessibility & Focus Indicators', () => {
    it('includes focus-visible rings and reduced motion classes', () => {
      const html = renderToString(React.createElement(Button, {}, 'Save'));
      expect(html).toContain('focus-visible:ring-2');
      expect(html).toContain('motion-reduce:transition-none');
    });

    it('sets aria-busy and disabled when loading', () => {
      const html = renderToString(React.createElement(Button, { loading: true }, 'Submitting'));
      expect(html).toContain('aria-busy="true"');
      expect(html).toContain('disabled');
      expect(html).toContain('animate-spin');
    });
  });

  describe('Input & Select Form Accessibility', () => {
    it('links input with error via aria-describedby and marks aria-invalid', () => {
      const html = renderToString(React.createElement(Input, {
        id: 'email-input',
        label: 'Email Address',
        error: 'Invalid email address'
      }));
      expect(html).toContain('aria-invalid="true"');
      expect(html).toContain('aria-describedby="email-input-error"');
      expect(html).toContain('id="email-input-error"');
      expect(html).toContain('role="alert"');
      expect(html).toContain('Invalid email address');
    });

    it('marks required inputs with visual asterisk marked aria-hidden', () => {
      const html = renderToString(React.createElement(Input, {
        id: 'name-input',
        label: 'Full Name',
        required: true
      }));
      expect(html).toContain('aria-hidden="true">*</span>');
    });

    it('links select control with error via aria-describedby and role="alert"', () => {
      const html = renderToString(React.createElement(Select, {
        id: 'role-select',
        label: 'Select Role',
        error: 'Role is mandatory'
      }));
      expect(html).toContain('aria-invalid="true"');
      expect(html).toContain('aria-describedby="role-select-error"');
      expect(html).toContain('role="alert"');
    });
  });

  describe('Dialog & Alert Accessibility', () => {
    it('ConfirmDialog exposes role="alertdialog" and aria-modal="true"', () => {
      const html = renderToString(React.createElement(ConfirmDialog, {
        isOpen: true,
        title: 'Delete Classroom?',
        message: 'This action cannot be undone.',
        onConfirm: () => {},
        onClose: () => {}
      }));
      expect(html).toContain('role="alertdialog"');
      expect(html).toContain('aria-modal="true"');
      expect(html).toContain('aria-labelledby=');
      expect(html).toContain('Delete Classroom?');
    });

    it('ConfirmDialog disables buttons during pending action', () => {
      const html = renderToString(React.createElement(ConfirmDialog, {
        isOpen: true,
        title: 'Confirm',
        message: 'Proceeding...',
        loading: true,
        onConfirm: () => {},
        onClose: () => {}
      }));
      expect(html).toContain('disabled');
    });

    it('AlertBanner has role="alert"', () => {
      const html = renderToString(React.createElement(AlertBanner, {
        variant: 'error',
        message: 'Database connection failed'
      }));
      expect(html).toContain('role="alert"');
      expect(html).toContain('Database connection failed');
    });
  });

  describe('Skeleton Loaders & Empty States', () => {
    it('TableSkeleton provides loading accessibility label', () => {
      const html = renderToString(React.createElement(TableSkeleton, { rows: 3, cols: 3 }));
      expect(html).toContain('aria-label="Loading content..."');
      expect(html).toContain('animate-pulse');
    });

    it('CardSkeleton is marked aria-hidden="true" to prevent screen reader noise during loading', () => {
      const html = renderToString(React.createElement(CardSkeleton));
      expect(html).toContain('aria-hidden="true"');
      expect(html).toContain('animate-pulse');
    });

    it('EmptyState renders title and descriptive text', () => {
      const html = renderToString(React.createElement(EmptyState, {
        title: 'No Data Found',
        description: 'Try adjusting filters to see results.'
      }));
      expect(html).toContain('No Data Found');
      expect(html).toContain('Try adjusting filters to see results.');
    });
  });
});
