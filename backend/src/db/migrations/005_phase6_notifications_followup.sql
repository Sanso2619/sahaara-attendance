-- Migration 005: Phase 6 Notifications and Guardian Follow-ups

-- 1. Organization Notification Settings & Templates
CREATE TABLE IF NOT EXISTS notification_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  follow_ups_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  notify_absent BOOLEAN NOT NULL DEFAULT TRUE,
  notify_late BOOLEAN NOT NULL DEFAULT FALSE,
  default_channel VARCHAR(20) NOT NULL DEFAULT 'SMS' CHECK (default_channel IN ('SMS', 'WHATSAPP', 'EMAIL')),
  absent_template TEXT NOT NULL DEFAULT 'Dear {guardian_name}, {student_name} was marked absent on {date} at {school_name}. Please contact us if you need assistance. - {organization_name}',
  late_template TEXT NOT NULL DEFAULT 'Dear {guardian_name}, {student_name} arrived late on {date} at {school_name}. - {organization_name}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT unique_org_notification_settings UNIQUE (organization_id)
);

CREATE INDEX IF NOT EXISTS idx_notification_settings_org ON notification_settings(organization_id);

-- 2. Notification Deliveries Log
CREATE TABLE IF NOT EXISTS notification_deliveries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  attendance_session_id UUID NOT NULL REFERENCES attendance_sessions(id) ON DELETE CASCADE,
  attendance_record_id UUID REFERENCES attendance_records(id) ON DELETE SET NULL,
  triggered_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  recipient_name VARCHAR(150),
  recipient_contact VARCHAR(100),
  channel VARCHAR(20) NOT NULL CHECK (channel IN ('SMS', 'WHATSAPP', 'EMAIL')),
  event_type VARCHAR(20) NOT NULL CHECK (event_type IN ('ABSENT', 'LATE')),
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'SENT', 'FAILED', 'SKIPPED')),
  message_content TEXT NOT NULL,
  provider VARCHAR(50) NOT NULL DEFAULT 'MOCK',
  provider_message_id VARCHAR(100),
  error_message TEXT,
  retry_count INT NOT NULL DEFAULT 0,
  max_retries INT NOT NULL DEFAULT 3,
  is_simulated BOOLEAN NOT NULL DEFAULT TRUE,
  sent_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT unique_session_student_event_channel UNIQUE (attendance_session_id, student_id, event_type, channel)
);

CREATE INDEX IF NOT EXISTS idx_notification_deliveries_org ON notification_deliveries(organization_id);
CREATE INDEX IF NOT EXISTS idx_notification_deliveries_status ON notification_deliveries(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_notification_deliveries_created ON notification_deliveries(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notification_deliveries_student ON notification_deliveries(student_id);
CREATE INDEX IF NOT EXISTS idx_notification_deliveries_session ON notification_deliveries(attendance_session_id);
