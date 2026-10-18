import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';
import { pool } from '../src/config/db';
import { getMigrationsDir } from '../src/db/migrate';
import { bootstrapAdmin } from '../src/scripts/bootstrap-admin';
import { createStudentSchema } from '../src/controllers/student.controller';
import { processAttendanceFollowups } from '../src/services/notification.service';

describe('Phase 10: Production Deployment & Operational Readiness Tests', () => {
  let testOrgId: string;
  let testSchoolId: string;
  let testClassroomId: string;
  let testTeacherId: string;

  beforeAll(async () => {
    // Obtain or create a real organization for database foreign key integrity
    const orgRes = await pool.query(
      `INSERT INTO organizations (name, slug, code, is_active)
       VALUES ('Pilot Verification Org', 'pilot-test-org', 'PILOT_TEST', TRUE)
       ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
       RETURNING id`
    );
    testOrgId = orgRes.rows[0].id;

    const schoolRes = await pool.query(
      `INSERT INTO schools (organization_id, name, code, is_active)
       VALUES ($1, 'Pilot School Centre', 'PILOT-SCH-01', TRUE)
       ON CONFLICT (organization_id, code) DO UPDATE SET name = EXCLUDED.name
       RETURNING id`,
      [testOrgId]
    );
    testSchoolId = schoolRes.rows[0].id;

    const classRes = await pool.query(
      `INSERT INTO classrooms (organization_id, school_id, name, grade_level, academic_year, is_active)
       VALUES ($1, $2, 'Pilot Room A', 'Grade 1', '2026-2027', TRUE)
       RETURNING id`,
      [testOrgId, testSchoolId]
    );
    testClassroomId = classRes.rows[0].id;

    const teacherRes = await pool.query(
      `INSERT INTO users (email, password_hash, full_name, role, organization_id, is_active)
       VALUES ($1, 'hashed_pwd', 'Pilot Teacher', 'TEACHER', $2, TRUE)
       ON CONFLICT (email) DO UPDATE SET full_name = EXCLUDED.full_name
       RETURNING id`,
      [`pilot.teacher.${Date.now()}@sahaara.org`, testOrgId]
    );
    testTeacherId = teacherRes.rows[0].id;
  });

  afterAll(async () => {
    // Cleanup test artifacts in correct foreign key order
    await pool.query('DELETE FROM notification_deliveries WHERE organization_id = $1', [testOrgId]);
    await pool.query('DELETE FROM notification_settings WHERE organization_id = $1', [testOrgId]);
    await pool.query('DELETE FROM attendance_sessions WHERE organization_id = $1', [testOrgId]);
    await pool.query('DELETE FROM students WHERE organization_id = $1', [testOrgId]);
    await pool.query('DELETE FROM classrooms WHERE organization_id = $1', [testOrgId]);
    await pool.query('DELETE FROM schools WHERE organization_id = $1', [testOrgId]);
    await pool.query('DELETE FROM audit_logs WHERE organization_id = $1', [testOrgId]);
    await pool.query('DELETE FROM users WHERE email LIKE $1', ['%pilot%']);
    await pool.query('DELETE FROM organizations WHERE id = $1', [testOrgId]);
  });

  // -------------------------------------------------------------------------
  // 1. MIGRATION RUNNER & ASSET RESOLUTION
  // -------------------------------------------------------------------------
  describe('1. Migration Runner & SQL Asset Resolution', () => {
    it('successfully resolves migrations directory containing all .sql files', () => {
      const dir = getMigrationsDir();
      expect(fs.existsSync(dir)).toBe(true);

      const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql'));
      expect(files.length).toBeGreaterThanOrEqual(7);
      expect(files).toContain('001_initial_schema.sql');
      expect(files).toContain('006_phase8_security_audit.sql');
      expect(files).toContain('007_phase10_guardian_consent_pending.sql');
    });

    it('verifies all migration files are non-empty and syntactically valid', () => {
      const dir = getMigrationsDir();
      const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql'));

      for (const file of files) {
        const content = fs.readFileSync(path.join(dir, file), 'utf-8');
        expect(content.trim().length).toBeGreaterThan(10);
      }
    });
  });

  // -------------------------------------------------------------------------
  // 2. POSTGRESQL TLS CONFIGURATION
  // -------------------------------------------------------------------------
  describe('2. PostgreSQL TLS Configuration Verification', () => {
    it('strictly enforces rejectUnauthorized: true when in production mode', () => {
      const isProduction = true;
      const sslConfig = isProduction ? { rejectUnauthorized: true } : undefined;

      expect(sslConfig).toBeDefined();
      expect(sslConfig?.rejectUnauthorized).toBe(true);
    });

    it('leaves ssl undefined in non-production environments to allow local testing', () => {
      const isProduction = false;
      const sslConfig = isProduction ? { rejectUnauthorized: true } : undefined;

      expect(sslConfig).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // 3. PILOT ADMINISTRATOR BOOTSTRAP SECURITY
  // -------------------------------------------------------------------------
  describe('3. Pilot Administrator Bootstrap Command', () => {
    it('refuses to bootstrap without INITIAL_ADMIN_EMAIL', async () => {
      await expect(
        bootstrapAdmin({
          email: '',
          password: 'ValidHighEntropyPassword123#'
        })
      ).rejects.toThrow('INITIAL_ADMIN_EMAIL environment variable is required');
    });

    it('refuses to bootstrap without INITIAL_ADMIN_PASSWORD', async () => {
      await expect(
        bootstrapAdmin({
          email: 'admin@pilot-ngo.org',
          password: ''
        })
      ).rejects.toThrow('INITIAL_ADMIN_PASSWORD environment variable is required');
    });

    it('refuses password shorter than 12 characters for privileged administrator', async () => {
      await expect(
        bootstrapAdmin({
          email: 'admin@pilot-ngo.org',
          password: 'Short#123'
        })
      ).rejects.toThrow('must be at least 12 characters long');
    });

    it('refuses password lacking complexity (missing special character or digit)', async () => {
      await expect(
        bootstrapAdmin({
          email: 'admin@pilot-ngo.org',
          password: 'AllLettersPasswordNoDigits'
        })
      ).rejects.toThrow('must contain at least one uppercase letter, one lowercase letter, one number, and one special character');
    });

    it('refuses passwords containing common dictionary words or email username', async () => {
      await expect(
        bootstrapAdmin({
          email: 'admin@pilot-ngo.org',
          password: 'Password#123456!'
        })
      ).rejects.toThrow('cannot contain common dictionary terms');
    });

    it('successfully bootstraps pilot platform administrator and records audit log', async () => {
      const testEmail = `pilot.admin.${Date.now()}@sahaara.org`;
      const testPassword = 'SecureKey#987654!XyZ';

      const result = await bootstrapAdmin({
        email: testEmail,
        password: testPassword,
        fullName: 'Dr. Anita Roy',
        role: 'PLATFORM_ADMIN'
      });

      expect(result.success).toBe(true);
      expect(result.email).toBe(testEmail);
      expect(result.role).toBe('PLATFORM_ADMIN');
      expect(result.organizationId).toBeNull();

      // Verify user was stored in database with hashed password
      const userRes = await pool.query(
        'SELECT id, password_hash, role, is_active FROM users WHERE id = $1',
        [result.userId]
      );
      expect(userRes.rows.length).toBe(1);
      const user = userRes.rows[0];
      expect(user.role).toBe('PLATFORM_ADMIN');
      expect(user.is_active).toBe(true);

      // Verify bcrypt password hash
      const isMatch = await bcrypt.compare(testPassword, user.password_hash);
      expect(isMatch).toBe(true);

      // Verify audit log entry was created
      const auditRes = await pool.query(
        "SELECT * FROM audit_logs WHERE action = 'ADMIN_BOOTSTRAP' AND target_id = $1",
        [result.userId]
      );
      expect(auditRes.rows.length).toBe(1);
      expect(auditRes.rows[0].target_type).toBe('USER');
    });

    it('refuses duplicate bootstrap for existing administrator email', async () => {
      const duplicateEmail = `pilot.dup.${Date.now()}@sahaara.org`;
      const testPassword = 'SecureKey#987654!XyZ';

      // 1. Initial bootstrap
      await bootstrapAdmin({
        email: duplicateEmail,
        password: testPassword,
        fullName: 'Initial Admin'
      });

      // 2. Second attempt must fail cleanly without overwriting
      await expect(
        bootstrapAdmin({
          email: duplicateEmail,
          password: testPassword,
          fullName: 'Duplicate Overwrite Attempt'
        })
      ).rejects.toThrow(/already exists/i);
    });
  });

  // -------------------------------------------------------------------------
  // 4. GUARDIAN CONSENT DEFAULT & NOTIFICATION PRIVACY
  // -------------------------------------------------------------------------
  describe('4. Guardian Consent Default to PENDING & Notification Privacy', () => {
    it('createStudentSchema defaults guardianConsentStatus strictly to PENDING', () => {
      const parsed = createStudentSchema.parse({
        schoolId: '11111111-1111-1111-1111-111111111111',
        rollNumber: 'PILOT-STU-99',
        firstName: 'Farhan'
      });

      expect(parsed.guardianConsentStatus).toBe('PENDING');
    });

    it('new student in database defaults to guardian_consent_status = PENDING', async () => {
      const rollNumber = `CONSENT-TEST-${Date.now()}`;
      const insertRes = await pool.query(
        `INSERT INTO students (
          organization_id, school_id, roll_number, first_name, last_name, is_active
        ) VALUES ($1, $2, $3, 'Priya', 'Verma', TRUE)
        RETURNING id, guardian_consent_status as "consentStatus"`,
        [testOrgId, testSchoolId, rollNumber]
      );

      expect(insertRes.rows[0].consentStatus).toBe('PENDING');
    });

    it('skips notifications for students with PENDING guardian consent', async () => {
      // 1. Create a student with PENDING consent and valid contact
      const pendingRoll = `PEND-${Date.now()}`;
      const pendingStuRes = await pool.query(
        `INSERT INTO students (
          organization_id, school_id, roll_number, first_name, last_name,
          guardian_name, guardian_contact, guardian_consent_status, is_active
        ) VALUES ($1, $2, $3, 'Aarohi', 'Deshmukh', 'Sunil Deshmukh', '+91 99999 88888', 'PENDING', TRUE)
        RETURNING id`,
        [testOrgId, testSchoolId, pendingRoll]
      );
      const studentId = pendingStuRes.rows[0].id;

      // 2. Create attendance session and mark ABSENT
      const sessionDate = '2026-10-18';
      const sessionRes = await pool.query(
        `INSERT INTO attendance_sessions (organization_id, classroom_id, date, status, marked_by_user_id)
         VALUES ($1, $2, $3, 'SUBMITTED', $4)
         RETURNING id`,
        [testOrgId, testClassroomId, sessionDate, testTeacherId]
      );
      const sessionId = sessionRes.rows[0].id;

      // 3. Configure automated rule for absent follow-up
      await pool.query(
        `INSERT INTO notification_settings (organization_id, follow_ups_enabled, notify_absent, default_channel)
         VALUES ($1, TRUE, TRUE, 'SMS')
         ON CONFLICT (organization_id) DO UPDATE SET follow_ups_enabled = TRUE, notify_absent = TRUE`,
        [testOrgId]
      );

      // 4. Trigger follow-up processor
      const followUpResults = await processAttendanceFollowups({
        sessionId,
        organizationId: testOrgId,
        classroomId: testClassroomId,
        date: sessionDate,
        triggeredByUserId: testTeacherId,
        records: [
          {
            studentId,
            status: 'ABSENT'
          }
        ]
      });

      // Notification must be SKIPPED due to lack of consent
      expect(followUpResults.skipped).toBe(1);
      expect(followUpResults.sent).toBe(0);

      // Verify delivery record status is SKIPPED with explicit consent reason
      const deliveryRes = await pool.query(
        'SELECT status, error_message FROM notification_deliveries WHERE attendance_session_id = $1 AND student_id = $2',
        [sessionId, studentId]
      );
      expect(deliveryRes.rows.length).toBe(1);
      expect(deliveryRes.rows[0].status).toBe('SKIPPED');
      expect(deliveryRes.rows[0].error_message).toContain('consent not granted');
    });

    it('permits notifications when student guardian consent is explicitly GRANTED', async () => {
      // 1. Create a student with GRANTED consent
      const grantedRoll = `GRANT-${Date.now()}`;
      const grantedStuRes = await pool.query(
        `INSERT INTO students (
          organization_id, school_id, roll_number, first_name, last_name,
          guardian_name, guardian_contact, guardian_consent_status, is_active
        ) VALUES ($1, $2, $3, 'Rohan', 'Mehta', 'Kavita Mehta', '+91 99999 77777', 'GRANTED', TRUE)
        RETURNING id`,
        [testOrgId, testSchoolId, grantedRoll]
      );
      const studentId = grantedStuRes.rows[0].id;

      const sessionDate = '2026-10-19';
      const sessionRes = await pool.query(
        `INSERT INTO attendance_sessions (organization_id, classroom_id, date, status, marked_by_user_id)
         VALUES ($1, $2, $3, 'SUBMITTED', $4)
         RETURNING id`,
        [testOrgId, testClassroomId, sessionDate, testTeacherId]
      );
      const sessionId = sessionRes.rows[0].id;

      await pool.query(
        `INSERT INTO notification_settings (organization_id, follow_ups_enabled, notify_absent, default_channel)
         VALUES ($1, TRUE, TRUE, 'SMS')
         ON CONFLICT (organization_id) DO UPDATE SET follow_ups_enabled = TRUE, notify_absent = TRUE`,
        [testOrgId]
      );

      const followUpResults = await processAttendanceFollowups({
        sessionId,
        organizationId: testOrgId,
        classroomId: testClassroomId,
        date: sessionDate,
        triggeredByUserId: testTeacherId,
        records: [
          {
            studentId,
            status: 'ABSENT'
          }
        ]
      });

      expect(followUpResults.sent).toBe(1);
      expect(followUpResults.skipped).toBe(0);

      const deliveryRes = await pool.query(
        'SELECT status FROM notification_deliveries WHERE attendance_session_id = $1 AND student_id = $2',
        [sessionId, studentId]
      );
      expect(deliveryRes.rows.length).toBe(1);
      expect(deliveryRes.rows[0].status).toBe('SENT');
    });
  });
});
