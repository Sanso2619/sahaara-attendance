-- Migration 006: Phase 8 Security Hardening, Auditability & Guardian Consent
-- 1. Student Guardian Notification Consent Status
ALTER TABLE students
  ADD COLUMN IF NOT EXISTS guardian_consent_status VARCHAR(20) NOT NULL DEFAULT 'GRANTED' CHECK (guardian_consent_status IN ('GRANTED', 'WITHDRAWN', 'PENDING')),
  ADD COLUMN IF NOT EXISTS guardian_consent_updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_students_guardian_consent ON students(organization_id, guardian_consent_status);

-- 2. Immutable System Audit Log
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  actor_role VARCHAR(50),
  action VARCHAR(100) NOT NULL,
  target_type VARCHAR(100) NOT NULL,
  target_id VARCHAR(100),
  ip_address VARCHAR(50),
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_org_date ON audit_logs(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON audit_logs(actor_user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);
