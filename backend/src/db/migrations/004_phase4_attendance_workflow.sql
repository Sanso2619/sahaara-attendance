-- Migration 004: Phase 4 Attendance Session Status and Submission Workflow

-- 1. Add status and submission tracking to attendance_sessions
ALTER TABLE attendance_sessions
  ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'SUBMITTED')),
  ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS submitted_by_user_id UUID REFERENCES users(id);

CREATE INDEX IF NOT EXISTS idx_attendance_sessions_class_date ON attendance_sessions(classroom_id, date);
CREATE INDEX IF NOT EXISTS idx_attendance_sessions_status ON attendance_sessions(organization_id, status);

-- 2. Add updated_at tracking to attendance_records
ALTER TABLE attendance_records
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;
