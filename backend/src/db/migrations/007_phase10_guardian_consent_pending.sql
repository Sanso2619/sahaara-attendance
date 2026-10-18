-- Migration 007: Phase 10 Default Student Guardian Notification Consent to PENDING
-- New students must not be assumed to have granted consent without explicit guardian authorization.
-- Existing student records maintain their historical consent status.

ALTER TABLE students
  ALTER COLUMN guardian_consent_status SET DEFAULT 'PENDING';
