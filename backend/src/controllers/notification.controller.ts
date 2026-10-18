import { Request, Response } from 'express';
import { z } from 'zod';
import { pool } from '../config/db';
import {
  getActiveNotificationProvider,
  maskContact,
  renderNotificationMessage,
  NotificationChannel,
  NotificationEventType
} from '../services/notification.service';
import { emitNotificationsUpdated } from '../services/socket.service';
import { recordAuditEvent } from '../services/audit.service';

export const updateNotificationSettingsSchema = z.object({
  followUpsEnabled: z.boolean().optional(),
  notifyAbsent: z.boolean().optional(),
  notifyLate: z.boolean().optional(),
  defaultChannel: z.enum(['SMS', 'WHATSAPP', 'EMAIL']).optional(),
  absentTemplate: z.string().min(5, 'Absent template must be at least 5 characters').max(500).optional(),
  lateTemplate: z.string().min(5, 'Late template must be at least 5 characters').max(500).optional()
});

export const previewNotificationSchema = z.object({
  template: z.string().min(1, 'Template text is required').max(500),
  eventType: z.enum(['ABSENT', 'LATE']).optional(),
  studentId: z.string().uuid().optional()
});

/**
 * 1. Get Notification Settings for Organization
 */
export async function getNotificationSettingsHandler(req: Request, res: Response) {
  const role = req.user?.role;
  let targetOrgId = req.user?.organizationId;

  if (role === 'PLATFORM_ADMIN') {
    if (typeof req.query.organizationId === 'string') {
      targetOrgId = req.query.organizationId;
    }
  }

  if (!targetOrgId) {
    return res.status(400).json({ error: 'Organization ID is required to retrieve notification settings.' });
  }

  try {
    const existing = await pool.query(
      `SELECT id, organization_id as "organizationId", follow_ups_enabled as "followUpsEnabled",
              notify_absent as "notifyAbsent", notify_late as "notifyLate",
              default_channel as "defaultChannel", absent_template as "absentTemplate",
              late_template as "lateTemplate", created_at as "createdAt", updated_at as "updatedAt"
       FROM notification_settings
       WHERE organization_id = $1`,
      [targetOrgId]
    );

    if (existing.rows.length > 0) {
      return res.status(200).json({ settings: existing.rows[0] });
    }

    // Auto-initialize default settings for this organization if not present
    const inserted = await pool.query(
      `INSERT INTO notification_settings (
         organization_id, follow_ups_enabled, notify_absent, notify_late, default_channel
       )
       VALUES ($1, FALSE, TRUE, FALSE, 'SMS')
       ON CONFLICT (organization_id) DO UPDATE SET updated_at = CURRENT_TIMESTAMP
       RETURNING id, organization_id as "organizationId", follow_ups_enabled as "followUpsEnabled",
                 notify_absent as "notifyAbsent", notify_late as "notifyLate",
                 default_channel as "defaultChannel", absent_template as "absentTemplate",
                 late_template as "lateTemplate", created_at as "createdAt", updated_at as "updatedAt"`,
      [targetOrgId]
    );

    return res.status(200).json({ settings: inserted.rows[0] });
  } catch (error) {
    console.error('Error fetching notification settings:', error);
    return res.status(500).json({ error: 'Failed to retrieve notification settings.' });
  }
}

/**
 * 2. Update Notification Settings & Message Templates
 */
export async function updateNotificationSettingsHandler(req: Request, res: Response) {
  const parseResult = updateNotificationSettingsSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({
      error: 'Validation failed',
      details: parseResult.error.flatten().fieldErrors
    });
  }

  const role = req.user?.role;
  let targetOrgId = req.user?.organizationId;

  if (role === 'PLATFORM_ADMIN') {
    if (typeof req.query.organizationId === 'string') {
      targetOrgId = req.query.organizationId;
    } else if (typeof req.body.organizationId === 'string') {
      targetOrgId = req.body.organizationId;
    }
  }

  if (!targetOrgId) {
    return res.status(400).json({ error: 'Organization ID is required to update notification settings.' });
  }

  const {
    followUpsEnabled,
    notifyAbsent,
    notifyLate,
    defaultChannel,
    absentTemplate,
    lateTemplate
  } = parseResult.data;

  try {
    const updated = await pool.query(
      `INSERT INTO notification_settings (
         organization_id, follow_ups_enabled, notify_absent, notify_late,
         default_channel, absent_template, late_template, updated_at
       )
       VALUES (
         $1,
         COALESCE($2, FALSE),
         COALESCE($3, TRUE),
         COALESCE($4, FALSE),
         COALESCE($5, 'SMS'),
         COALESCE($6, 'Dear {guardian_name}, {student_name} was marked absent on {date} at {school_name}. Please contact us if you need assistance. - {organization_name}'),
         COALESCE($7, 'Dear {guardian_name}, {student_name} arrived late on {date} at {school_name}. - {organization_name}'),
         CURRENT_TIMESTAMP
       )
       ON CONFLICT (organization_id) DO UPDATE SET
         follow_ups_enabled = COALESCE($2, notification_settings.follow_ups_enabled),
         notify_absent = COALESCE($3, notification_settings.notify_absent),
         notify_late = COALESCE($4, notification_settings.notify_late),
         default_channel = COALESCE($5, notification_settings.default_channel),
         absent_template = COALESCE($6, notification_settings.absent_template),
         late_template = COALESCE($7, notification_settings.late_template),
         updated_at = CURRENT_TIMESTAMP
       RETURNING id, organization_id as "organizationId", follow_ups_enabled as "followUpsEnabled",
                 notify_absent as "notifyAbsent", notify_late as "notifyLate",
                 default_channel as "defaultChannel", absent_template as "absentTemplate",
                 late_template as "lateTemplate", created_at as "createdAt", updated_at as "updatedAt"`,
      [
        targetOrgId,
        followUpsEnabled !== undefined ? followUpsEnabled : null,
        notifyAbsent !== undefined ? notifyAbsent : null,
        notifyLate !== undefined ? notifyLate : null,
        defaultChannel || null,
        absentTemplate || null,
        lateTemplate || null
      ]
    );

    await recordAuditEvent({
      organizationId: targetOrgId,
      actorUserId: req.user?.userId || null,
      actorRole: role || null,
      action: 'NOTIFICATION_SETTINGS_UPDATE',
      targetType: 'NOTIFICATION_SETTINGS',
      targetId: updated.rows[0].id,
      ipAddress: (req.headers['x-forwarded-for'] as string)?.split(',')[0].trim() || req.ip || req.socket.remoteAddress || null,
      metadata: {
        followUpsEnabled,
        notifyAbsent,
        notifyLate,
        defaultChannel
      }
    });

    return res.status(200).json({
      message: 'Notification settings updated successfully.',
      settings: updated.rows[0]
    });
  } catch (error) {
    console.error('Error updating notification settings:', error);
    return res.status(500).json({ error: 'Failed to update notification settings.' });
  }
}

/**
 * 3. List Notification Deliveries (Audit Log with Masked Contacts & Filters)
 */
export async function listNotificationDeliveriesHandler(req: Request, res: Response) {
  const role = req.user?.role;
  let targetOrgId = req.user?.organizationId;

  if (role === 'PLATFORM_ADMIN') {
    if (typeof req.query.organizationId === 'string') {
      targetOrgId = req.query.organizationId;
    } else {
      targetOrgId = null;
    }
  }

  const status = typeof req.query.status === 'string' ? req.query.status.toUpperCase() : '';
  const channel = typeof req.query.channel === 'string' ? req.query.channel.toUpperCase() : '';
  const eventType = typeof req.query.eventType === 'string' ? req.query.eventType.toUpperCase() : '';
  const startDate = typeof req.query.startDate === 'string' ? req.query.startDate : '';
  const endDate = typeof req.query.endDate === 'string' ? req.query.endDate : '';
  const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
  const classroomId = typeof req.query.classroomId === 'string' ? req.query.classroomId : '';
  const schoolId = typeof req.query.schoolId === 'string' ? req.query.schoolId : '';

  const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string, 10) || 20));
  const offset = (page - 1) * limit;

  try {
    let whereClauses: string[] = [];
    let queryParams: any[] = [];
    let pIdx = 1;

    if (targetOrgId) {
      whereClauses.push(`nd.organization_id = $${pIdx++}`);
      queryParams.push(targetOrgId);
    }

    if (status && ['PENDING', 'SENT', 'FAILED', 'SKIPPED'].includes(status)) {
      whereClauses.push(`nd.status = $${pIdx++}`);
      queryParams.push(status);
    }

    if (channel && ['SMS', 'WHATSAPP', 'EMAIL'].includes(channel)) {
      whereClauses.push(`nd.channel = $${pIdx++}`);
      queryParams.push(channel);
    }

    if (eventType && ['ABSENT', 'LATE'].includes(eventType)) {
      whereClauses.push(`nd.event_type = $${pIdx++}`);
      queryParams.push(eventType);
    }

    if (startDate) {
      whereClauses.push(`att.date >= $${pIdx++}`);
      queryParams.push(startDate);
    }

    if (endDate) {
      whereClauses.push(`att.date <= $${pIdx++}`);
      queryParams.push(endDate);
    }

    if (classroomId) {
      whereClauses.push(`att.classroom_id = $${pIdx++}`);
      queryParams.push(classroomId);
    }

    if (schoolId) {
      whereClauses.push(`c.school_id = $${pIdx++}`);
      queryParams.push(schoolId);
    }

    if (search) {
      whereClauses.push(`(
        s.first_name ILIKE $${pIdx} OR
        s.last_name ILIKE $${pIdx} OR
        s.roll_number ILIKE $${pIdx} OR
        nd.recipient_name ILIKE $${pIdx}
      )`);
      queryParams.push(`%${search}%`);
      pIdx++;
    }

    const whereStr = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    // Total count query
    const countRes = await pool.query(
      `SELECT COUNT(*) as "total"
       FROM notification_deliveries nd
       JOIN students s ON s.id = nd.student_id
       JOIN attendance_sessions att ON att.id = nd.attendance_session_id
       JOIN classrooms c ON c.id = att.classroom_id
       JOIN schools sch ON sch.id = c.school_id
       ${whereStr}`,
      queryParams
    );
    const total = parseInt(countRes.rows[0].total, 10);

    // Summary counts query for organization
    let summaryWhereClauses = [];
    let summaryParams: any[] = [];
    if (targetOrgId) {
      summaryWhereClauses.push(`organization_id = $1`);
      summaryParams.push(targetOrgId);
    }
    const sumWhereStr = summaryWhereClauses.length > 0 ? `WHERE ${summaryWhereClauses.join(' AND ')}` : '';

    const summaryRes = await pool.query(
      `SELECT status, COUNT(*) as count
       FROM notification_deliveries
       ${sumWhereStr}
       GROUP BY status`,
      summaryParams
    );

    const stats = {
      total: 0,
      sent: 0,
      failed: 0,
      skipped: 0,
      pending: 0
    };

    for (const row of summaryRes.rows) {
      const c = parseInt(row.count, 10);
      stats.total += c;
      if (row.status === 'SENT') stats.sent = c;
      if (row.status === 'FAILED') stats.failed = c;
      if (row.status === 'SKIPPED') stats.skipped = c;
      if (row.status === 'PENDING') stats.pending = c;
    }

    // Deliveries List Query
    const listQuery = `
      SELECT nd.id, nd.organization_id as "organizationId", nd.student_id as "studentId",
             nd.attendance_session_id as "attendanceSessionId", nd.recipient_name as "recipientName",
             nd.recipient_contact as "rawContact", nd.channel, nd.event_type as "eventType",
             nd.status, nd.message_content as "messageContent", nd.provider,
             nd.provider_message_id as "providerMessageId", nd.error_message as "errorMessage",
             nd.retry_count as "retryCount", nd.max_retries as "maxRetries",
             nd.is_simulated as "isSimulated", nd.sent_at as "sentAt", nd.created_at as "createdAt",
             s.first_name as "studentFirstName", s.last_name as "studentLastName", s.roll_number as "studentRollNumber",
             sch.name as "schoolName", c.name as "classroomName", att.date as "sessionDate",
             u.full_name as "triggeredByName"
      FROM notification_deliveries nd
      JOIN students s ON s.id = nd.student_id
      JOIN attendance_sessions att ON att.id = nd.attendance_session_id
      JOIN classrooms c ON c.id = att.classroom_id
      JOIN schools sch ON sch.id = c.school_id
      LEFT JOIN users u ON u.id = nd.triggered_by_user_id
      ${whereStr}
      ORDER BY nd.created_at DESC
      LIMIT $${pIdx++} OFFSET $${pIdx++}
    `;

    const deliveriesRes = await pool.query(listQuery, [...queryParams, limit, offset]);

    // Privacy Masking: Never expose raw guardian phone numbers
    const deliveries = deliveriesRes.rows.map(row => {
      const { rawContact, ...rest } = row;
      return {
        ...rest,
        recipientContactMasked: maskContact(rawContact),
        canRetry: (row.status === 'FAILED' || row.status === 'PENDING') && row.retryCount < row.maxRetries
      };
    });

    return res.status(200).json({
      deliveries,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      },
      stats
    });
  } catch (error) {
    console.error('Error listing notification deliveries:', error);
    return res.status(500).json({ error: 'Failed to retrieve notification deliveries.' });
  }
}

/**
 * 4. Get Single Notification Delivery Detail
 */
export async function getNotificationDeliveryByIdHandler(req: Request, res: Response) {
  const { id } = req.params;
  const role = req.user?.role;
  const targetOrgId = req.user?.organizationId;

  try {
    let query = `
      SELECT nd.id, nd.organization_id as "organizationId", nd.student_id as "studentId",
             nd.attendance_session_id as "attendanceSessionId", nd.recipient_name as "recipientName",
             nd.recipient_contact as "rawContact", nd.channel, nd.event_type as "eventType",
             nd.status, nd.message_content as "messageContent", nd.provider,
             nd.provider_message_id as "providerMessageId", nd.error_message as "errorMessage",
             nd.retry_count as "retryCount", nd.max_retries as "maxRetries",
             nd.is_simulated as "isSimulated", nd.sent_at as "sentAt", nd.created_at as "createdAt",
             s.first_name as "studentFirstName", s.last_name as "studentLastName", s.roll_number as "studentRollNumber",
             sch.name as "schoolName", c.name as "classroomName", att.date as "sessionDate",
             u.full_name as "triggeredByName"
      FROM notification_deliveries nd
      JOIN students s ON s.id = nd.student_id
      JOIN attendance_sessions att ON att.id = nd.attendance_session_id
      JOIN classrooms c ON c.id = att.classroom_id
      JOIN schools sch ON sch.id = c.school_id
      LEFT JOIN users u ON u.id = nd.triggered_by_user_id
      WHERE nd.id = $1
    `;

    const params: any[] = [id];
    if (role !== 'PLATFORM_ADMIN' && targetOrgId) {
      query += ` AND nd.organization_id = $2`;
      params.push(targetOrgId);
    }

    const resDb = await pool.query(query, params);

    if (resDb.rows.length === 0) {
      return res.status(404).json({ error: 'Notification delivery record not found or access denied.' });
    }

    const row = resDb.rows[0];
    const { rawContact, ...rest } = row;

    return res.status(200).json({
      delivery: {
        ...rest,
        recipientContactMasked: maskContact(rawContact),
        canRetry: (row.status === 'FAILED' || row.status === 'PENDING') && row.retryCount < row.maxRetries
      }
    });
  } catch (error) {
    console.error('Error fetching notification delivery by id:', error);
    return res.status(500).json({ error: 'Failed to retrieve notification delivery details.' });
  }
}

/**
 * 5. Retry Notification Delivery (Bounded Manual Retry)
 */
export async function retryNotificationDeliveryHandler(req: Request, res: Response) {
  const { id } = req.params;
  const role = req.user?.role;
  const targetOrgId = req.user?.organizationId;

  try {
    let selectQuery = `
      SELECT nd.*, s.guardian_contact as "studentGuardianContact",
             COALESCE(s.guardian_consent_status, 'GRANTED') as "studentGuardianConsent",
             s.first_name as "firstName", s.last_name as "lastName", o.name as "orgName"
      FROM notification_deliveries nd
      JOIN students s ON s.id = nd.student_id
      JOIN organizations o ON o.id = nd.organization_id
      WHERE nd.id = $1
    `;
    const params: any[] = [id];

    if (role !== 'PLATFORM_ADMIN' && targetOrgId) {
      selectQuery += ` AND nd.organization_id = $2`;
      params.push(targetOrgId);
    }

    const deliveryRes = await pool.query(selectQuery, params);
    if (deliveryRes.rows.length === 0) {
      return res.status(404).json({ error: 'Notification record not found or access denied.' });
    }

    const delivery = deliveryRes.rows[0];

    // Status check
    if (delivery.status === 'SENT') {
      return res.status(400).json({ error: 'Notification has already been successfully sent and cannot be retried.' });
    }

    // Retry limit check
    if (delivery.retry_count >= delivery.max_retries) {
      return res.status(400).json({
        error: `Maximum retry limit reached (${delivery.max_retries} attempts). Further retries are blocked to prevent abuse.`
      });
    }

    // Consent check
    if (delivery.studentGuardianConsent && delivery.studentGuardianConsent !== 'GRANTED') {
      return res.status(400).json({
        error: 'Cannot retry: Guardian notification consent has been withdrawn or is pending.'
      });
    }

    // Resolve contact: either already saved, or latest from student record
    let contactToUse = delivery.recipient_contact || delivery.studentGuardianContact;
    if (!contactToUse || contactToUse.trim().length === 0) {
      return res.status(400).json({
        error: 'Cannot retry: Student does not have a guardian contact number on file.'
      });
    }

    // Attempt delivery via active provider
    const provider = getActiveNotificationProvider();
    const result = await provider.send({
      recipientName: delivery.recipient_name || 'Guardian',
      recipientContact: contactToUse,
      channel: delivery.channel as NotificationChannel,
      message: delivery.message_content,
      organizationName: delivery.orgName || 'Sahaara Attendance'
    });

    const newRetryCount = delivery.retry_count + 1;

    if (result.success) {
      await pool.query(
        `UPDATE notification_deliveries
         SET status = 'SENT',
             recipient_contact = $1,
             retry_count = $2,
             provider = $3,
             provider_message_id = $4,
             error_message = NULL,
             sent_at = CURRENT_TIMESTAMP,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $5`,
        [contactToUse, newRetryCount, result.provider, result.providerMessageId || null, id]
      );

      emitNotificationsUpdated({
        organizationId: delivery.organization_id,
        totalTriggered: 1,
        sent: 1,
        failed: 0,
        skipped: 0,
        timestamp: new Date().toISOString()
      });

      await recordAuditEvent({
        organizationId: delivery.organization_id,
        actorUserId: req.user?.userId || null,
        actorRole: role || null,
        action: 'NOTIFICATION_RETRY_SUCCESS',
        targetType: 'NOTIFICATION_DELIVERY',
        targetId: id,
        ipAddress: (req.headers['x-forwarded-for'] as string)?.split(',')[0].trim() || req.ip || req.socket.remoteAddress || null,
        metadata: { retryCount: newRetryCount, provider: result.provider }
      });

      return res.status(200).json({
        message: 'Notification delivery retried and sent successfully.',
        status: 'SENT',
        retryCount: newRetryCount,
        providerMessageId: result.providerMessageId
      });
    } else {
      await pool.query(
        `UPDATE notification_deliveries
         SET status = 'FAILED',
             recipient_contact = $1,
             retry_count = $2,
             provider = $3,
             error_message = $4,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $5`,
        [contactToUse, newRetryCount, result.provider, result.errorMessage || 'Retry delivery failed', id]
      );

      emitNotificationsUpdated({
        organizationId: delivery.organization_id,
        totalTriggered: 1,
        sent: 0,
        failed: 1,
        skipped: 0,
        timestamp: new Date().toISOString()
      });

      await recordAuditEvent({
        organizationId: delivery.organization_id,
        actorUserId: req.user?.userId || null,
        actorRole: role || null,
        action: 'NOTIFICATION_RETRY_FAILED',
        targetType: 'NOTIFICATION_DELIVERY',
        targetId: id,
        ipAddress: (req.headers['x-forwarded-for'] as string)?.split(',')[0].trim() || req.ip || req.socket.remoteAddress || null,
        metadata: { retryCount: newRetryCount, error: result.errorMessage }
      });

      return res.status(200).json({
        message: 'Notification delivery retry failed.',
        status: 'FAILED',
        retryCount: newRetryCount,
        errorMessage: result.errorMessage
      });
    }
  } catch (error) {
    console.error('Error retrying notification delivery:', error);
    return res.status(500).json({ error: 'Failed to process notification retry.' });
  }
}

/**
 * 6. Preview Rendered Notification Message
 */
export async function previewNotificationMessageHandler(req: Request, res: Response) {
  const parseResult = previewNotificationSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({
      error: 'Validation failed',
      details: parseResult.error.flatten().fieldErrors
    });
  }

  const { template, studentId, eventType } = parseResult.data;
  const targetOrgId = req.user?.organizationId;

  try {
    let studentName = 'Aarav Sharma';
    let guardianName = 'Pooja Sharma';
    let schoolName = 'Hope Primary Learning Centre';
    let organizationName = 'Hope Community Education';
    const date = new Date().toISOString().split('T')[0];

    if (studentId) {
      const studentRes = await pool.query(
        `SELECT s.first_name as "firstName", s.last_name as "lastName", s.guardian_name as "guardianName",
                sch.name as "schoolName", o.name as "organizationName"
         FROM students s
         JOIN schools sch ON sch.id = s.school_id
         JOIN organizations o ON o.id = s.organization_id
         WHERE s.id = $1 ${targetOrgId ? 'AND s.organization_id = $2' : ''}`,
        targetOrgId ? [studentId, targetOrgId] : [studentId]
      );

      if (studentRes.rows.length > 0) {
        const row = studentRes.rows[0];
        studentName = `${row.firstName} ${row.lastName}`.trim();
        guardianName = row.guardianName || 'Guardian';
        schoolName = row.schoolName;
        organizationName = row.organizationName;
      }
    }

    const rendered = renderNotificationMessage(template, {
      studentName,
      guardianName,
      schoolName,
      organizationName,
      date
    });

    return res.status(200).json({
      preview: rendered,
      eventType: eventType || 'ABSENT',
      sampleData: {
        studentName,
        guardianName,
        schoolName,
        organizationName,
        date
      }
    });
  } catch (error) {
    console.error('Error generating notification preview:', error);
    return res.status(500).json({ error: 'Failed to render notification preview.' });
  }
}
