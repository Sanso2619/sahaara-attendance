import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../src/app';
import { pool } from '../src/config/db';
import { env, envSchema } from '../src/config/env';
import { seedDemoData } from '../src/db/seed';
import { recordAuditEvent, listAuditLogs } from '../src/services/audit.service';
import { processAttendanceFollowups } from '../src/services/notification.service';

describe('Phase 8: Security Hardening & Auditability Suite', () => {
  const secret = env.JWT_SECRET;

  let org1Id: string;
  let org2Id: string;
  let teacherId: string;
  let school1Id: string;
  let testStudentId: string;

  let orgAdminToken: string;
  let org2AdminToken: string;
  let teacherToken: string;
  let platformAdminToken: string;

  beforeAll(async () => {
    // 1. Fetch or create real organizations to ensure foreign key integrity
    const orgs = await pool.query('SELECT id, slug FROM organizations ORDER BY created_at ASC LIMIT 2');
    if (orgs.rows.length >= 2) {
      org1Id = orgs.rows[0].id;
      org2Id = orgs.rows[1].id;
    } else {
      const o1 = await pool.query(
        "INSERT INTO organizations (name, slug, code) VALUES ('Hope Test Org', 'hope-test', 'HTO') ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name RETURNING id"
      );
      const o2 = await pool.query(
        "INSERT INTO organizations (name, slug, code) VALUES ('Pratham Test Org', 'pratham-test', 'PTO') ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name RETURNING id"
      );
      org1Id = o1.rows[0].id;
      org2Id = o2.rows[0].id;
    }

    // 2. Fetch or create school for org1
    const schools = await pool.query('SELECT id FROM schools WHERE organization_id = $1 LIMIT 1', [org1Id]);
    if (schools.rows.length > 0) {
      school1Id = schools.rows[0].id;
    } else {
      const s = await pool.query(
        "INSERT INTO schools (organization_id, name, code) VALUES ($1, 'Hope Test School', 'HTS') RETURNING id",
        [org1Id]
      );
      school1Id = s.rows[0].id;
    }

    // 3. Ensure a test student exists in org1 with guardian contact
    const existingStudent = await pool.query(
      'SELECT id FROM students WHERE organization_id = $1 AND guardian_contact IS NOT NULL LIMIT 1',
      [org1Id]
    );
    if (existingStudent.rows.length > 0) {
      testStudentId = existingStudent.rows[0].id;
    } else {
      const stu = await pool.query(
        `INSERT INTO students (
          organization_id, school_id, roll_number, first_name, last_name,
          guardian_name, guardian_contact, guardian_consent_status, is_active
        ) VALUES ($1, $2, 'TEST-P8-01', 'Privacy', 'Student', 'Guardian One', '+919876543210', 'GRANTED', TRUE)
        RETURNING id`,
        [org1Id, school1Id]
      );
      testStudentId = stu.rows[0].id;
    }

    // 4. Find or create teacher
    const users = await pool.query("SELECT id FROM users WHERE organization_id = $1 AND role = 'TEACHER' LIMIT 1", [org1Id]);
    teacherId = users.rows.length > 0 ? users.rows[0].id : '00000000-0000-0000-0000-000000000001';

    // 5. Generate test tokens
    orgAdminToken = jwt.sign(
      { userId: 'admin-1', email: 'admin@hope.org', role: 'ORG_ADMIN', organizationId: org1Id },
      secret
    );

    org2AdminToken = jwt.sign(
      { userId: 'admin-2', email: 'admin@pratham.org', role: 'ORG_ADMIN', organizationId: org2Id },
      secret
    );

    teacherToken = jwt.sign(
      { userId: teacherId, email: 'teacher@hope.org', role: 'TEACHER', organizationId: org1Id },
      secret
    );

    platformAdminToken = jwt.sign(
      { userId: 'plat-admin', email: 'super@sahaara.org', role: 'PLATFORM_ADMIN', organizationId: null },
      secret
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('1. Authentication Security & Rate Limiting', () => {
    it('returns generic error on invalid login credentials without leaking account existence', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'nonexistent@example.com', password: 'wrongpassword123' });

      expect(res.status).toBe(401);
      expect(res.body.error).toContain('Invalid email or password');
    });

    it('enforces rate limiting on repeated authentication failures', async () => {
      const uniqueIp = '10.99.88.77';
      // Send 10 rapid failed login attempts with explicit test rate limiting header
      for (let i = 0; i < 10; i++) {
        await request(app)
          .post('/api/auth/login')
          .set('X-Forwarded-For', uniqueIp)
          .set('x-test-rate-limit', 'true')
          .send({ email: 'tester@example.com', password: 'badpassword' });
      }

      // 11th attempt must be rejected with 429
      const rateLimitedRes = await request(app)
        .post('/api/auth/login')
        .set('X-Forwarded-For', uniqueIp)
        .set('x-test-rate-limit', 'true')
        .send({ email: 'tester@example.com', password: 'badpassword' });

      expect(rateLimitedRes.status).toBe(429);
      expect(rateLimitedRes.body.error).toContain('Too many login attempts');
    });

    it('clears session cookie on logout', async () => {
      const res = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${orgAdminToken}`);

      expect(res.status).toBe(200);
      const cookies = res.headers['set-cookie'];
      expect(cookies).toBeDefined();
      expect(cookies[0]).toContain('sahaara_auth_token=;');
    });
  });

  describe('2. CSRF Protection for Cookie-Authenticated Requests', () => {
    it('allows Bearer token authenticated requests without origin header', async () => {
      const res = await request(app)
        .put('/api/notifications/settings')
        .set('Authorization', `Bearer ${orgAdminToken}`)
        .send({
          notifyOnAbsent: true,
          notifyOnLate: false,
          preferredChannel: 'WHATSAPP'
        });

      expect([200, 201]).toContain(res.status);
    });

    it('blocks state-changing requests when authenticated via cookie with mismatched Origin', async () => {
      const res = await request(app)
        .put('/api/notifications/settings')
        .set('Cookie', `sahaara_auth_token=${orgAdminToken}`)
        .set('Origin', 'http://malicious-site.com')
        .send({
          notifyOnAbsent: true,
          preferredChannel: 'SMS'
        });

      expect(res.status).toBe(403);
      expect(res.body.error).toContain('CSRF');
    });

    it('allows state-changing requests when authenticated via cookie with matching Origin or custom header', async () => {
      const res = await request(app)
        .put('/api/notifications/settings')
        .set('Cookie', `sahaara_auth_token=${orgAdminToken}`)
        .set('Origin', env.FRONTEND_URL)
        .send({
          notifyOnAbsent: true,
          preferredChannel: 'WHATSAPP'
        });

      expect([200, 201]).toContain(res.status);
    });
  });

  describe('3. Production Environment & Seeding Safeguards', () => {
    it('blocks demo seeding when NODE_ENV is production', async () => {
      const originalEnv = process.env.NODE_ENV;
      try {
        process.env.NODE_ENV = 'production';
        await expect(seedDemoData()).rejects.toThrow(
          'Production safety guard: Seeding demo or test data is forbidden in production environment.'
        );
      } finally {
        process.env.NODE_ENV = originalEnv;
      }
    });

    it('rejects weak JWT secrets and dev credentials when validated in production', () => {
      const prevJwt = process.env.JWT_SECRET;
      try {
        process.env.JWT_SECRET = 'dev_jwt_key_too_short';
        expect(() => {
          envSchema.parse({
            NODE_ENV: 'production',
            PORT: '5001',
            DB_PASSWORD: 'real_strong_password_123',
            JWT_SECRET: 'dev_jwt_key_too_short',
            COOKIE_SECRET: 'a'.repeat(32),
            FRONTEND_URL: 'https://attendance.sahaara.org'
          });
        }).toThrow(/JWT_SECRET must be explicitly set/);
      } finally {
        process.env.JWT_SECRET = prevJwt;
      }
    });
  });

  describe('4. Guardian Consent & Data Privacy', () => {
    it('masks guardian contact for teachers while exposing to org admins', async () => {
      // Teacher request
      const teacherRes = await request(app)
        .get('/api/students')
        .set('Authorization', `Bearer ${teacherToken}`);

      expect(teacherRes.status).toBe(200);
      const students = teacherRes.body.students;
      expect(students.length).toBeGreaterThan(0);
      const maskedStudent = students.find((s: any) => s.guardianContact);
      expect(maskedStudent).toBeDefined();
      expect(maskedStudent.guardianContact).toContain('***');

      // Admin request
      const adminRes = await request(app)
        .get('/api/students')
        .set('Authorization', `Bearer ${orgAdminToken}`);

      expect(adminRes.status).toBe(200);
      const adminStudents = adminRes.body.students;
      const unmaskedStudent = adminStudents.find((s: any) => s.id === maskedStudent.id);
      expect(unmaskedStudent).toBeDefined();
      expect(unmaskedStudent.guardianContact).not.toContain('***');
    });

    it('skips notification follow-up if student guardian consent is not GRANTED', async () => {
      // 1. Create a student with WITHDRAWN consent
      const studentRes = await pool.query(
        `INSERT INTO students (
          organization_id, school_id, roll_number, first_name, last_name,
          guardian_name, guardian_contact, guardian_consent_status, is_active
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'WITHDRAWN', TRUE)
        RETURNING id`,
        [org1Id, school1Id, `SEC-${Date.now()}`, 'Consent', 'Test', 'Consent Guardian', '+919876500000']
      );
      const studentId = studentRes.rows[0].id;

      // Ensure notification settings are enabled for org1Id
      await pool.query(
        `INSERT INTO notification_settings (organization_id, follow_ups_enabled, notify_absent, default_channel)
         VALUES ($1, TRUE, TRUE, 'SMS')
         ON CONFLICT (organization_id) DO UPDATE
         SET follow_ups_enabled = TRUE, notify_absent = TRUE, default_channel = 'SMS'`,
        [org1Id]
      );

      // Ensure an attendance session exists for foreign key constraint
      let sessionId: string;
      let classroomId: string;
      const sessionRes = await pool.query('SELECT id, classroom_id FROM attendance_sessions WHERE organization_id = $1 LIMIT 1', [org1Id]);
      if (sessionRes.rows.length > 0) {
        sessionId = sessionRes.rows[0].id;
        classroomId = sessionRes.rows[0].classroom_id;
      } else {
        const crRes = await pool.query(
          "INSERT INTO classrooms (organization_id, school_id, name, grade_level, academic_year) VALUES ($1, $2, 'Consent Class', '1', '2026') RETURNING id",
          [org1Id, school1Id]
        );
        classroomId = crRes.rows[0].id;
        const sRes = await pool.query(
          "INSERT INTO attendance_sessions (organization_id, classroom_id, session_date, status, taken_by_user_id) VALUES ($1, $2, '2026-10-18', 'SUBMITTED', $3) RETURNING id",
          [org1Id, classroomId, teacherId]
        );
        sessionId = sRes.rows[0].id;
      }

      // 2. Process followups for absent mark
      const summary = await processAttendanceFollowups({
        sessionId,
        organizationId: org1Id,
        classroomId,
        date: '2026-10-18',
        triggeredByUserId: teacherId,
        records: [
          {
            studentId,
            status: 'ABSENT'
          }
        ]
      });

      // Verify delivery was skipped due to consent
      expect(summary.skipped).toBe(1);

      // Verify in DB
      const dbDelivery = await pool.query(
        'SELECT status, error_message FROM notification_deliveries WHERE student_id = $1',
        [studentId]
      );
      expect(dbDelivery.rows[0].status).toBe('SKIPPED');
      expect(dbDelivery.rows[0].error_message).toContain('not granted');
    });
  });

  describe('5. Audit Logging & Access Control', () => {
    it('records audit events without passwords or sensitive secrets', async () => {
      const log = await recordAuditEvent({
        organizationId: org1Id,
        actorUserId: 'admin-1',
        actorRole: 'ORG_ADMIN',
        action: 'TEST_ACTION',
        targetType: 'TEST',
        targetId: 'target-1',
        ipAddress: '127.0.0.1',
        metadata: {
          password: 'SecretPassword123!',
          token: 'jwt.token.secret',
          safeField: 'This is visible'
        }
      });

      expect(log).not.toBeNull();
      expect(log!.metadata!.password).toBe('[REDACTED]');
      expect(log!.metadata!.token).toBe('[REDACTED]');
      expect(log!.metadata!.safeField).toBe('This is visible');

      // Verify in database
      const dbLog = await pool.query('SELECT metadata FROM audit_logs WHERE id = $1', [log!.id]);
      expect(dbLog.rows[0].metadata.password).toBe('[REDACTED]');
    });

    it('restricts /api/audit-logs: TEACHER receives 403 Forbidden', async () => {
      const res = await request(app)
        .get('/api/audit-logs')
        .set('Authorization', `Bearer ${teacherToken}`);

      expect(res.status).toBe(403);
      expect(res.body.error).toContain('Forbidden');
    });

    it('enforces tenant isolation: ORG_ADMIN cannot view audit logs of other organizations', async () => {
      // Insert test log in Org 2
      await pool.query(
        `INSERT INTO audit_logs (organization_id, actor_role, action, target_type)
         VALUES ($1, 'ORG_ADMIN', 'ORG2_EVENT', 'TEST')`,
        [org2Id]
      );

      // Org 1 admin queries audit logs
      const res = await request(app)
        .get('/api/audit-logs')
        .set('Authorization', `Bearer ${orgAdminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.logs).toBeDefined();
      const org2Events = res.body.logs.filter((l: any) => l.organizationId === org2Id);
      expect(org2Events.length).toBe(0);
    });

    it('allows PLATFORM_ADMIN to view all audit logs and filter by organization', async () => {
      const res = await request(app)
        .get(`/api/audit-logs?organizationId=${org1Id}`)
        .set('Authorization', `Bearer ${platformAdminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.logs).toBeDefined();
      for (const log of res.body.logs) {
        expect(log.organizationId).toBe(org1Id);
      }
    });
  });
});
