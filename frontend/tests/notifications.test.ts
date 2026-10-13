import { describe, it, expect } from 'vitest';

// Template variable substitution utility
function renderFrontendTemplate(
  template: string,
  vars: {
    studentName?: string;
    guardianName?: string;
    date?: string;
    schoolName?: string;
    organizationName?: string;
  }
): string {
  return template
    .replace(/\{guardian_name\}/g, vars.guardianName?.trim() || 'Guardian')
    .replace(/\{student_name\}/g, vars.studentName?.trim() || 'Student')
    .replace(/\{date\}/g, vars.date || '')
    .replace(/\{school_name\}/g, vars.schoolName || 'School')
    .replace(/\{organization_name\}/g, vars.organizationName || 'Sahaara Attendance');
}

// Contact masking utility
function maskContact(contact: string | null | undefined): string {
  if (!contact) return 'N/A';
  const clean = contact.trim();
  if (clean.length <= 4) return '****';
  const visibleLast4 = clean.slice(-4);
  const prefix = clean.startsWith('+') ? clean.slice(0, 3) + ' ' : '';
  return `${prefix}****** ${visibleLast4}`;
}

describe('Phase 6 Frontend Utilities & Logic', () => {
  describe('Message Template Variable Substitution', () => {
    it('substitutes all dynamic tokens correctly', () => {
      const template = 'Dear {guardian_name}, {student_name} was absent on {date} at {school_name}. - {organization_name}';
      const rendered = renderFrontendTemplate(template, {
        studentName: 'Aarav Sharma',
        guardianName: 'Pooja Sharma',
        date: '2026-10-13',
        schoolName: 'Hope Primary Centre',
        organizationName: 'Hope Education'
      });

      expect(rendered).toBe('Dear Pooja Sharma, Aarav Sharma was absent on 2026-10-13 at Hope Primary Centre. - Hope Education');
    });

    it('falls back to defaults if tokens are missing', () => {
      const template = 'Notice: {student_name} was marked late at {school_name}.';
      const rendered = renderFrontendTemplate(template, {});
      expect(rendered).toBe('Notice: Student was marked late at School.');
    });
  });

  describe('Guardian Contact Privacy Masking', () => {
    it('masks standard international phone numbers safely', () => {
      expect(maskContact('+91 98000 11111')).toBe('+91 ****** 1111');
      expect(maskContact('+91 99988 77665')).toBe('+91 ****** 7665');
    });

    it('masks local phone numbers without country code', () => {
      expect(maskContact('9876543210')).toBe('****** 3210');
    });

    it('handles null, empty, or short strings safely', () => {
      expect(maskContact(null)).toBe('N/A');
      expect(maskContact('')).toBe('N/A');
      expect(maskContact('123')).toBe('****');
    });
  });

  describe('Retry Eligibility Rules', () => {
    it('permits retry only for FAILED/PENDING status under max retries', () => {
      const checkCanRetry = (status: string, retryCount: number, maxRetries: number) => {
        return (status === 'FAILED' || status === 'PENDING') && retryCount < maxRetries;
      };

      expect(checkCanRetry('FAILED', 0, 3)).toBe(true);
      expect(checkCanRetry('FAILED', 2, 3)).toBe(true);
      expect(checkCanRetry('FAILED', 3, 3)).toBe(false);
      expect(checkCanRetry('SENT', 0, 3)).toBe(false);
      expect(checkCanRetry('SKIPPED', 0, 3)).toBe(false);
    });
  });
});
