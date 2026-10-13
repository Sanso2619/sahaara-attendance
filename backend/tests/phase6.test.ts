import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../src/app';
import { pool } from '../src/config/db';
import { env } from '../src/config/env';
import {
  renderNotificationMessage,
  maskContact,
  MockNotificationProvider,
  processAttendanceFollowups
} from '../src/services/notification.service';

describe('Phase 6: Notifications & Guardian Follow-ups Suite', () => {
  const secret = env.JWT_SECRET;

  const org1Id = '11111111-1111-1111-1111-111111111111';
  const org2Id = '22222222-2222-2222-2222-222222222222';
  const teacherId = '44444444-4444-4444-4444-444444444444';
  const student1Id = '88888888-8888-8888-8888-888888888888';
  const sessionId = '99999999-9999-9999-9999-999999999999';

  const orgAdminToken = jwt.sign(
    { userId: 'admin-1', email: 'admin@hope.org', role: 'ORG_ADMIN', organizationId: org1Id },
    secret
  );

  const teacherToken = jwt.sign(
    { userId: teacherId, email: 'teacher@hope.org', role: 'TEACHER', organizationId: org1Id },
    secret
  );

  const platformAdminToken = jwt.sign(
    { userId: 'plat-admin', email: 'super@sahaara.org', role: 'PLATFORM_ADMIN', organizationId: null },
    secret
  );

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('1. Message Rendering & Contact Privacy Utilities', () => {
    it('Renders notification message with all placeholder substitutions', () => {
      const template = 'Hello {guardian_name}, {student_name} was marked absent on {date} at {school_name}. - {organization_name}';
      const rendered = renderNotificationMessage(template, {
        guardianName: 'Pooja Sharma',
        studentName: 'Aarav Sharma',
        date: '2026-10-13',
        schoolName: 'Hope Primary Centre',
        organizationName: 'Hope Foundation'
      });

      expect(rendered).toBe(
        'Hello Pooja Sharma, Aarav Sharma was marked absent on 2026-10-13 at Hope Primary Centre. - Hope Foundation'
      );
    });

    it('Uses sensible fallbacks when placeholder variables are missing', () => {
      const template = 'Dear {guardian_name}, {student_name} is absent. - {school_name}';
      const rendered = renderNotificationMessage(template, {});

      expect(rendered).toBe('Dear Guardian, Student is absent. - School');
    });

    it('Masks guardian contact numbers strictly for privacy', () => {
      expect(maskContact('+91 98000 11111')).toBe('+91 ****** 1111');
      expect(maskContact('9876543210')).toBe('****** 3210');
      expect(maskContact(null)).toBe('N/A');
      expect(maskContact(undefined)).toBe('N/A');
      expect(maskContact('123')).toBe('****');
    });
  });

  describe('2. Notification Settings API & Tenant Isolation', () => {
    it('Retrieves notification settings for organization admin', async () => {
      jest.spyOn(pool, 'query').mockResolvedValueOnce({
        rows: [
          {
            id: 'settings-1',
            organizationId: org1Id,
            followUpsEnabled: true,
            notifyAbsent: true,
            notifyLate: false,
            defaultChannel: 'SMS',
            absentTemplate: 'Dear {guardian_name}, {student_name} was absent.',
            lateTemplate: 'Dear {guardian_name}, {student_name} was late.',
            createdAt: '2026-10-13T00:00:00Z',
            updatedAt: '2026-10-13T00:00:00Z'
          }
        ]
      } as any);

      const res = await request(app)
        .get('/api/notifications/settings')
        .set('Authorization', `Bearer ${orgAdminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.settings.organizationId).toBe(org1Id);
      expect(res.body.settings.followUpsEnabled).toBe(true);
      expect(res.body.settings.notifyAbsent).toBe(true);
    });

    it('Updates notification settings and templates for authorized org admin', async () => {
      jest.spyOn(pool, 'query').mockResolvedValueOnce({
        rows: [
          {
            id: 'settings-1',
            organizationId: org1Id,
            followUpsEnabled: true,
            notifyAbsent: true,
            notifyLate: true,
            defaultChannel: 'WHATSAPP',
            absentTemplate: 'Custom absent notice for {student_name}',
            lateTemplate: 'Custom late notice for {student_name}',
            createdAt: '2026-10-13T00:00:00Z',
            updatedAt: '2026-10-13T00:00:00Z'
          }
        ]
      } as any);

      const res = await request(app)
        .put('/api/notifications/settings')
        .set('Authorization', `Bearer ${orgAdminToken}`)
        .send({
          followUpsEnabled: true,
          notifyAbsent: true,
          notifyLate: true,
          defaultChannel: 'WHATSAPP',
          absentTemplate: 'Custom absent notice for {student_name}',
          lateTemplate: 'Custom late notice for {student_name}'
        });

      expect(res.status).toBe(200);
      expect(res.body.settings.defaultChannel).toBe('WHATSAPP');
      expect(res.body.settings.notifyLate).toBe(true);
    });

    it('Forbids teachers from updating organization notification settings', async () => {
      const res = await request(app)
        .put('/api/notifications/settings')
        .set('Authorization', `Bearer ${teacherToken}`)
        .send({ followUpsEnabled: true });

      expect(res.status).toBe(403);
    });
  });

  describe('3. Attendance Submission Follow-up Trigger Logic', () => {
    it('Does not send notifications when follow-ups are disabled in settings', async () => {
      jest.spyOn(pool, 'query').mockResolvedValueOnce({
        rows: [
          {
            follow_ups_enabled: false,
            notify_absent: true,
            notify_late: false,
            default_channel: 'SMS'
          }
        ]
      } as any);

      const result = await processAttendanceFollowups({
        sessionId,
        organizationId: org1Id,
        classroomId: 'class-1',
        date: '2026-10-13',
        triggeredByUserId: teacherId,
        records: [{ studentId: student1Id, status: 'ABSENT' }]
      });

      expect(result.totalTriggered).toBe(0);
      expect(result.sent).toBe(0);
    });

    it('Marks delivery as SKIPPED when student lacks a guardian contact number', async () => {
      // 1. Settings query
      jest.spyOn(pool, 'query')
        .mockResolvedValueOnce({
          rows: [
            {
              follow_ups_enabled: true,
              notify_absent: true,
              notify_late: false,
              default_channel: 'SMS',
              absent_template: 'Absent: {student_name}',
              late_template: 'Late: {student_name}'
            }
          ]
        } as any)
        // 2. Student query (missing contact)
        .mockResolvedValueOnce({
          rows: [
            {
              id: student1Id,
              firstName: 'Ramesh',
              lastName: 'Kumar',
              rollNumber: '01',
              guardianName: 'Suresh Kumar',
              guardianContact: null, // missing contact
              schoolName: 'Hope Primary',
              organizationName: 'Hope Org'
            }
          ]
        } as any)
        // 3. Insert SKIPPED delivery
        .mockResolvedValueOnce({ rows: [] } as any);

      const result = await processAttendanceFollowups({
        sessionId,
        organizationId: org1Id,
        classroomId: 'class-1',
        date: '2026-10-13',
        triggeredByUserId: teacherId,
        records: [{ studentId: student1Id, status: 'ABSENT' }]
      });

      expect(result.totalTriggered).toBe(1);
      expect(result.sent).toBe(0);
      expect(result.skipped).toBe(1);
    });

    it('Successfully delivers and logs notification when valid contact is present', async () => {
      jest.spyOn(pool, 'query')
        .mockResolvedValueOnce({
          rows: [
            {
              follow_ups_enabled: true,
              notify_absent: true,
              notify_late: false,
              default_channel: 'SMS',
              absent_template: 'Absent: {student_name}',
              late_template: 'Late: {student_name}'
            }
          ]
        } as any)
        .mockResolvedValueOnce({
          rows: [
            {
              id: student1Id,
              firstName: 'Ramesh',
              lastName: 'Kumar',
              rollNumber: '01',
              guardianName: 'Suresh Kumar',
              guardianContact: '+91 98000 11111',
              schoolName: 'Hope Primary',
              organizationName: 'Hope Org'
            }
          ]
        } as any)
        .mockResolvedValueOnce({ rows: [] } as any); // Insert delivery record

      const result = await processAttendanceFollowups({
        sessionId,
        organizationId: org1Id,
        classroomId: 'class-1',
        date: '2026-10-13',
        triggeredByUserId: teacherId,
        records: [{ studentId: student1Id, status: 'ABSENT' }]
      });

      expect(result.totalTriggered).toBe(1);
      expect(result.sent).toBe(1);
      expect(result.skipped).toBe(0);
    });
  });

  describe('4. Deliveries Audit Log & Masking API', () => {
    it('Returns paginated deliveries with masked guardian contact', async () => {
      // 1. Count query
      jest.spyOn(pool, 'query')
        .mockResolvedValueOnce({
          rows: [{ total: '1' }]
        } as any)
        // 2. Summary stats query
        .mockResolvedValueOnce({
          rows: [{ status: 'SENT', count: '1' }]
        } as any)
        // 3. Deliveries list query
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'del-1',
              organizationId: org1Id,
              studentId: student1Id,
              attendanceSessionId: sessionId,
              recipientName: 'Suresh Kumar',
              rawContact: '+91 98000 11111',
              channel: 'SMS',
              eventType: 'ABSENT',
              status: 'SENT',
              messageContent: 'Absent notice',
              provider: 'MOCK_SANDBOX',
              providerMessageId: 'mock-123',
              errorMessage: null,
              retryCount: 0,
              maxRetries: 3,
              isSimulated: true,
              sentAt: '2026-10-13T08:00:00Z',
              createdAt: '2026-10-13T08:00:00Z',
              studentFirstName: 'Ramesh',
              studentLastName: 'Kumar',
              studentRollNumber: '01',
              schoolName: 'Hope Primary',
              classroomName: 'Grade 1',
              sessionDate: '2026-10-13',
              triggeredByName: 'Teacher Jane'
            }
          ]
        } as any);

      const res = await request(app)
        .get('/api/notifications/deliveries')
        .set('Authorization', `Bearer ${orgAdminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.deliveries.length).toBe(1);
      // Privacy check: raw contact must NOT be returned, only masked contact
      expect(res.body.deliveries[0].rawContact).toBeUndefined();
      expect(res.body.deliveries[0].recipientContactMasked).toBe('+91 ****** 1111');
      expect(res.body.stats.sent).toBe(1);
    });
  });

  describe('5. Bounded Manual Retry Handling', () => {
    it('Rejects retry if notification was already sent', async () => {
      jest.spyOn(pool, 'query').mockResolvedValueOnce({
        rows: [
          {
            id: 'del-sent',
            organization_id: org1Id,
            status: 'SENT',
            retry_count: 0,
            max_retries: 3
          }
        ]
      } as any);

      const res = await request(app)
        .post('/api/notifications/deliveries/del-sent/retry')
        .set('Authorization', `Bearer ${orgAdminToken}`);

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/already been successfully sent/i);
    });

    it('Rejects retry if maximum retries have been reached', async () => {
      jest.spyOn(pool, 'query').mockResolvedValueOnce({
        rows: [
          {
            id: 'del-failed',
            organization_id: org1Id,
            status: 'FAILED',
            retry_count: 3,
            max_retries: 3
          }
        ]
      } as any);

      const res = await request(app)
        .post('/api/notifications/deliveries/del-failed/retry')
        .set('Authorization', `Bearer ${orgAdminToken}`);

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/maximum retry limit reached/i);
    });

    it('Successfully retries a failed delivery and increments retry count', async () => {
      // 1. Select query
      jest.spyOn(pool, 'query')
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'del-failed',
              organization_id: org1Id,
              status: 'FAILED',
              retry_count: 1,
              max_retries: 3,
              recipient_contact: '+91 98000 11111',
              recipient_name: 'Suresh Kumar',
              channel: 'SMS',
              message_content: 'Absent notice',
              orgName: 'Hope Foundation'
            }
          ]
        } as any)
        // 2. Update query
        .mockResolvedValueOnce({ rows: [] } as any);

      const res = await request(app)
        .post('/api/notifications/deliveries/del-failed/retry')
        .set('Authorization', `Bearer ${orgAdminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('SENT');
      expect(res.body.retryCount).toBe(2);
    });
  });

  describe('6. Live Message Preview API', () => {
    it('Renders live preview with provided template', async () => {
      const res = await request(app)
        .post('/api/notifications/preview')
        .set('Authorization', `Bearer ${orgAdminToken}`)
        .send({
          template: 'Alert: {student_name} is absent today from {school_name}.',
          eventType: 'ABSENT'
        });

      expect(res.status).toBe(200);
      expect(res.body.preview).toContain('Alert: Aarav Sharma is absent today');
    });
  });
});
