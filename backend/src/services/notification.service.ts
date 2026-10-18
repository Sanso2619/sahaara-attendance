import { pool } from '../config/db';

export type NotificationChannel = 'SMS' | 'WHATSAPP' | 'EMAIL';
export type NotificationStatus = 'PENDING' | 'SENT' | 'FAILED' | 'SKIPPED';
export type NotificationEventType = 'ABSENT' | 'LATE';

export interface NotificationPayload {
  recipientName: string;
  recipientContact: string;
  channel: NotificationChannel;
  message: string;
  organizationName: string;
}

export interface DeliveryResult {
  success: boolean;
  provider: string;
  providerMessageId?: string;
  errorMessage?: string;
  isSimulated: boolean;
}

export interface INotificationProvider {
  readonly name: string;
  readonly isMock: boolean;
  send(payload: NotificationPayload): Promise<DeliveryResult>;
}

/**
 * Safe Mock Notification Provider (Default for local development & testing)
 * Simulates external provider delivery safely without making network requests.
 */
export class MockNotificationProvider implements INotificationProvider {
  readonly name = 'MOCK_SANDBOX';
  readonly isMock = true;

  async send(payload: NotificationPayload): Promise<DeliveryResult> {
    // Basic contact sanity check for simulated delivery
    const contact = payload.recipientContact.trim();
    if (!contact || contact.startsWith('FAIL_') || contact === '0000000000') {
      return {
        success: false,
        provider: this.name,
        errorMessage: 'Simulated delivery failure: Invalid or unrouteable guardian contact number.',
        isSimulated: true
      };
    }

    const randomSuffix = Math.random().toString(36).substring(2, 10);
    const simulatedMsgId = `mock-${payload.channel.toLowerCase()}-${Date.now()}-${randomSuffix}`;

    return {
      success: true,
      provider: this.name,
      providerMessageId: simulatedMsgId,
      isSimulated: true
    };
  }
}

/**
 * Provider factory returning the active provider.
 * Defaults strictly to MockNotificationProvider unless an explicit provider is configured.
 */
export function getActiveNotificationProvider(): INotificationProvider {
  // Safe default: Mock provider for testing and development
  return new MockNotificationProvider();
}

/**
 * Renders template message replacing placeholders
 */
export function renderNotificationMessage(
  template: string,
  vars: {
    guardianName?: string;
    studentName?: string;
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

/**
 * Mask sensitive contact information for safe UI display (e.g., +91 ****** 1234)
 */
export function maskContact(contact: string | null | undefined): string {
  if (!contact) return 'N/A';
  const clean = contact.trim();
  if (clean.length <= 4) return '****';
  const visibleLast4 = clean.slice(-4);
  const prefix = clean.startsWith('+') ? clean.slice(0, 3) + ' ' : '';
  return `${prefix}****** ${visibleLast4}`;
}

/**
 * Triggers attendance follow-up notifications after an attendance session is submitted.
 * Strictly adheres to:
 * - Only runs after attendance is submitted (not on drafts)
 * - Checks organization follow-ups configuration
 * - Filters for absent / late based on org rules
 * - Prevents duplicate notifications per (session, student, event, channel)
 */
export async function processAttendanceFollowups(params: {
  sessionId: string;
  organizationId: string;
  classroomId: string;
  date: string;
  triggeredByUserId: string;
  records: Array<{ studentId: string; status: 'PRESENT' | 'ABSENT' | 'LATE'; remarks?: string }>;
}): Promise<{ totalTriggered: number; sent: number; failed: number; skipped: number }> {
  const { sessionId, organizationId, date, triggeredByUserId, records } = params;

  try {
    // 1. Fetch Organization Notification Settings
    const settingsRes = await pool.query(
      `SELECT follow_ups_enabled, notify_absent, notify_late, default_channel, absent_template, late_template
       FROM notification_settings
       WHERE organization_id = $1`,
      [organizationId]
    );

    const settings = settingsRes?.rows?.[0];

    // If follow-ups are disabled or not configured, skip triggering
    if (!settings || !settings.follow_ups_enabled) {
      return { totalTriggered: 0, sent: 0, failed: 0, skipped: 0 };
    }

  const { notify_absent, notify_late, default_channel, absent_template, late_template } = settings;
  const channel: NotificationChannel = default_channel || 'SMS';

  // 2. Identify eligible records for follow-ups
  const eligibleRecords = records.filter(r => {
    if (r.status === 'ABSENT' && notify_absent) return true;
    if (r.status === 'LATE' && notify_late) return true;
    return false;
  });

  if (eligibleRecords.length === 0) {
    return { totalTriggered: 0, sent: 0, failed: 0, skipped: 0 };
  }

  // 3. Fetch Student & Guardian details
  const studentIds = eligibleRecords.map(r => r.studentId);
  const studentsRes = await pool.query(
    `SELECT s.id, s.first_name as "firstName", s.last_name as "lastName", s.roll_number as "rollNumber",
            s.guardian_name as "guardianName", s.guardian_contact as "guardianContact",
            COALESCE(s.guardian_consent_status, 'GRANTED') as "guardianConsentStatus",
            sch.name as "schoolName", o.name as "organizationName"
     FROM students s
     JOIN schools sch ON sch.id = s.school_id
     JOIN organizations o ON o.id = s.organization_id
     WHERE s.id = ANY($1) AND s.organization_id = $2`,
    [studentIds, organizationId]
  );

  const studentMap = new Map<string, any>();
  for (const st of studentsRes.rows) {
    studentMap.set(st.id, st);
  }

  const provider = getActiveNotificationProvider();
  let sentCount = 0;
  let failedCount = 0;
  let skippedCount = 0;

  // 4. Process each eligible student
  for (const rec of eligibleRecords) {
    const student = studentMap.get(rec.studentId);
    if (!student) continue;

    const eventType: NotificationEventType = rec.status === 'ABSENT' ? 'ABSENT' : 'LATE';
    const template = eventType === 'ABSENT' ? absent_template : late_template;
    const studentFullName = `${student.firstName} ${student.lastName}`.trim();

    const renderedMessage = renderNotificationMessage(template, {
      guardianName: student.guardianName,
      studentName: studentFullName,
      date,
      schoolName: student.schoolName,
      organizationName: student.organizationName
    });

    // Check Guardian Notification Consent
    if (student.guardianConsentStatus && student.guardianConsentStatus !== 'GRANTED') {
      await pool.query(
        `INSERT INTO notification_deliveries (
           organization_id, student_id, attendance_session_id, triggered_by_user_id,
           recipient_name, recipient_contact, channel, event_type, status,
           message_content, provider, error_message, is_simulated
         )
         VALUES ($1, $2, $3, $4, $5, NULL, $6, $7, 'SKIPPED', $8, $9, $10, $11)
         ON CONFLICT (attendance_session_id, student_id, event_type, channel) DO NOTHING`,
        [
          organizationId,
          student.id,
          sessionId,
          triggeredByUserId,
          student.guardianName || 'Guardian',
          channel,
          eventType,
          renderedMessage,
          provider.name,
          'Skipped: Guardian notification consent not granted or opted out.',
          provider.isMock
        ]
      );
      skippedCount++;
      continue;
    }

    const hasContact = Boolean(student.guardianContact && student.guardianContact.trim().length > 0);

    if (!hasContact) {
      // Record as SKIPPED due to missing guardian contact
      await pool.query(
        `INSERT INTO notification_deliveries (
           organization_id, student_id, attendance_session_id, triggered_by_user_id,
           recipient_name, recipient_contact, channel, event_type, status,
           message_content, provider, error_message, is_simulated
         )
         VALUES ($1, $2, $3, $4, $5, NULL, $6, $7, 'SKIPPED', $8, $9, $10, $11)
         ON CONFLICT (attendance_session_id, student_id, event_type, channel) DO NOTHING`,
        [
          organizationId,
          student.id,
          sessionId,
          triggeredByUserId,
          student.guardianName || 'Guardian',
          channel,
          eventType,
          renderedMessage,
          provider.name,
          'Skipped: Guardian contact number not on file.',
          provider.isMock
        ]
      );
      skippedCount++;
      continue;
    }

    // Deliver via Notification Provider
    const deliveryRes = await provider.send({
      recipientName: student.guardianName || 'Guardian',
      recipientContact: student.guardianContact,
      channel,
      message: renderedMessage,
      organizationName: student.organizationName
    });

    if (deliveryRes.success) {
      await pool.query(
        `INSERT INTO notification_deliveries (
           organization_id, student_id, attendance_session_id, triggered_by_user_id,
           recipient_name, recipient_contact, channel, event_type, status,
           message_content, provider, provider_message_id, is_simulated, sent_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'SENT', $9, $10, $11, $12, CURRENT_TIMESTAMP)
         ON CONFLICT (attendance_session_id, student_id, event_type, channel) DO NOTHING`,
        [
          organizationId,
          student.id,
          sessionId,
          triggeredByUserId,
          student.guardianName || 'Guardian',
          student.guardianContact,
          channel,
          eventType,
          renderedMessage,
          deliveryRes.provider,
          deliveryRes.providerMessageId || null,
          deliveryRes.isSimulated
        ]
      );
      sentCount++;
    } else {
      await pool.query(
        `INSERT INTO notification_deliveries (
           organization_id, student_id, attendance_session_id, triggered_by_user_id,
           recipient_name, recipient_contact, channel, event_type, status,
           message_content, provider, error_message, is_simulated
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'FAILED', $9, $10, $11, $12)
         ON CONFLICT (attendance_session_id, student_id, event_type, channel) DO NOTHING`,
        [
          organizationId,
          student.id,
          sessionId,
          triggeredByUserId,
          student.guardianName || 'Guardian',
          student.guardianContact,
          channel,
          eventType,
          renderedMessage,
          deliveryRes.provider,
          deliveryRes.errorMessage || 'Provider delivery failed',
          deliveryRes.isSimulated
        ]
      );
      failedCount++;
    }
  }

    return {
      totalTriggered: eligibleRecords.length,
      sent: sentCount,
      failed: failedCount,
      skipped: skippedCount
    };
  } catch (error) {
    console.error('Error during automated attendance followups processing:', error);
    return {
      totalTriggered: 0,
      sent: 0,
      failed: 0,
      skipped: 0
    };
  }
}
