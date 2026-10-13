import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../src/app';
import { pool } from '../src/config/db';
import { env } from '../src/config/env';

describe('Phase 4: Daily Attendance Register & Verification Suite', () => {
  const secret = env.JWT_SECRET;

  const org1Id = '11111111-1111-1111-1111-111111111111';
  const org2Id = '22222222-2222-2222-2222-222222222222';
  const teacher1Id = '33333333-3333-3333-3333-333333333333';
  const teacher2Id = '44444444-4444-4444-4444-444444444444';
  const class1Org1Id = '55555555-5555-5555-5555-555555555555';
  const class2Org1Id = '66666666-6666-6666-6666-666666666666';
  const classOrg2Id = '77777777-7777-7777-7777-777777777777';
  const student1Id = '88888888-8888-8888-8888-888888888888';
  const student2Id = '99999999-9999-9999-9999-999999999999';

  const teacher1Token = jwt.sign(
    { userId: teacher1Id, email: 'teacher1@hope.org', role: 'TEACHER', organizationId: org1Id },
    secret
  );

  const orgAdmin1Token = jwt.sign(
    { userId: 'admin-1', email: 'admin@hope.org', role: 'ORG_ADMIN', organizationId: org1Id },
    secret
  );

  const orgAdmin2Token = jwt.sign(
    { userId: 'admin-2', email: 'admin@bright.org', role: 'ORG_ADMIN', organizationId: org2Id },
    secret
  );

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('1. Classroom Authorization & Cross-Organization Isolation', () => {
    it('Teacher cannot access session for a classroom they are not assigned to', async () => {
      // Mock classroom query returning Org 1 classroom
      jest.spyOn(pool, 'query')
        .mockResolvedValueOnce({
          rows: [{ id: class2Org1Id, name: 'Grade 2', organizationId: org1Id, is_active: true }]
        } as any)
        // Mock teacher assignment check returning empty
        .mockResolvedValueOnce({
          rows: []
        } as any);

      const res = await request(app)
        .get(`/api/attendance/session?classroomId=${class2Org1Id}&date=2026-10-13`)
        .set('Authorization', `Bearer ${teacher1Token}`);

      expect(res.status).toBe(403);
      expect(res.body.error).toContain('not assigned to take attendance');
    });

    it('Org Admin cannot access attendance session for classroom in another organization', async () => {
      // Mock classroom query returning Org 2 classroom
      jest.spyOn(pool, 'query').mockResolvedValueOnce({
        rows: [{ id: classOrg2Id, name: 'Grade 1', organizationId: org2Id, is_active: true }]
      } as any);

      const res = await request(app)
        .get(`/api/attendance/session?classroomId=${classOrg2Id}&date=2026-10-13`)
        .set('Authorization', `Bearer ${orgAdmin1Token}`);

      expect(res.status).toBe(403);
      expect(res.body.error).toContain('outside your organization');
    });
  });

  describe('2. Incomplete Submission Protection', () => {
    it('Blocks submit when enrolled students remain unmarked', async () => {
      const mockClient = {
        query: jest.fn(),
        release: jest.fn()
      };
      jest.spyOn(pool, 'connect').mockResolvedValue(mockClient as any);

      // 1. Classroom exists in Org 1
      mockClient.query
        .mockResolvedValueOnce({
          rows: [{ id: class1Org1Id, organizationId: org1Id, is_active: true }]
        })
        // 2. Teacher assigned
        .mockResolvedValueOnce({
          rows: [{ id: 'assignment-1' }]
        })
        // 3. Enrolled students query: returns 2 active students
        .mockResolvedValueOnce({
          rows: [
            { id: student1Id, first_name: 'Aarav', last_name: 'Kumar', roll_number: 'STU-01' },
            { id: student2Id, first_name: 'Diya', last_name: 'Sharma', roll_number: 'STU-02' }
          ]
        });

      // Submit only 1 student record (student2Id is missing)
      const res = await request(app)
        .post('/api/attendance/submit')
        .set('Authorization', `Bearer ${teacher1Token}`)
        .send({
          classroomId: class1Org1Id,
          date: '2026-10-13',
          records: [
            { studentId: student1Id, status: 'PRESENT' }
          ]
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Incomplete submission');
      expect(res.body.error).toContain('remain unmarked');
    });
  });

  describe('3. Submitted Session Protection', () => {
    it('Prevents saving draft progress when session is already SUBMITTED', async () => {
      const mockClient = {
        query: jest.fn(),
        release: jest.fn()
      };
      jest.spyOn(pool, 'connect').mockResolvedValue(mockClient as any);

      mockClient.query
        // 1. Classroom exists in Org 1
        .mockResolvedValueOnce({
          rows: [{ id: class1Org1Id, organizationId: org1Id, is_active: true }]
        })
        // 2. Teacher assigned
        .mockResolvedValueOnce({
          rows: [{ id: 'assignment-1' }]
        })
        // BEGIN
        .mockResolvedValueOnce({})
        // 3. Existing session with status SUBMITTED
        .mockResolvedValueOnce({
          rows: [{ id: 'sess-already-submitted', status: 'SUBMITTED' }]
        })
        // ROLLBACK
        .mockResolvedValueOnce({});

      const res = await request(app)
        .post('/api/attendance/save')
        .set('Authorization', `Bearer ${teacher1Token}`)
        .send({
          classroomId: class1Org1Id,
          date: '2026-10-13',
          records: [
            { studentId: student1Id, status: 'PRESENT' }
          ]
        });

      expect(res.status).toBe(409);
      expect(res.body.error).toContain('already been finalized and submitted');
    });

    it('Prevents overwriting when submitting to an already SUBMITTED session', async () => {
      const mockClient = {
        query: jest.fn(),
        release: jest.fn()
      };
      jest.spyOn(pool, 'connect').mockResolvedValue(mockClient as any);

      mockClient.query
        // 1. Classroom check
        .mockResolvedValueOnce({
          rows: [{ id: class1Org1Id, organizationId: org1Id, is_active: true }]
        })
        // 2. Teacher assignment check
        .mockResolvedValueOnce({
          rows: [{ id: 'assignment-1' }]
        })
        // 3. Enrolled students check (1 student)
        .mockResolvedValueOnce({
          rows: [{ id: student1Id, first_name: 'Aarav', last_name: 'Kumar' }]
        })
        // BEGIN
        .mockResolvedValueOnce({})
        // 4. Session already SUBMITTED
        .mockResolvedValueOnce({
          rows: [{ id: 'sess-submitted-id', status: 'SUBMITTED' }]
        })
        // ROLLBACK
        .mockResolvedValueOnce({});

      const res = await request(app)
        .post('/api/attendance/submit')
        .set('Authorization', `Bearer ${teacher1Token}`)
        .send({
          classroomId: class1Org1Id,
          date: '2026-10-13',
          records: [
            { studentId: student1Id, status: 'PRESENT' }
          ]
        });

      expect(res.status).toBe(409);
      expect(res.body.error).toContain('already been submitted and finalized');
    });
  });

  describe('4. Successful Complete Attendance Workflow', () => {
    it('Successfully finalizes full attendance register', async () => {
      const mockClient = {
        query: jest.fn(),
        release: jest.fn()
      };
      jest.spyOn(pool, 'connect').mockResolvedValue(mockClient as any);

      mockClient.query
        // 1. Classroom check
        .mockResolvedValueOnce({
          rows: [{ id: class1Org1Id, organizationId: org1Id, is_active: true }]
        })
        // 2. Teacher assignment check
        .mockResolvedValueOnce({
          rows: [{ id: 'assignment-1' }]
        })
        // 3. Enrolled students check (2 students)
        .mockResolvedValueOnce({
          rows: [
            { id: student1Id, first_name: 'Aarav', last_name: 'Kumar' },
            { id: student2Id, first_name: 'Diya', last_name: 'Sharma' }
          ]
        })
        // BEGIN
        .mockResolvedValueOnce({})
        // 4. Existing session check (not found)
        .mockResolvedValueOnce({ rows: [] })
        // 5. Insert session returning id
        .mockResolvedValueOnce({
          rows: [{ id: 'new-session-id', status: 'SUBMITTED', submittedAt: '2026-10-13T13:00:00Z' }]
        })
        // 6. Upsert record 1
        .mockResolvedValueOnce({})
        // 7. Upsert record 2
        .mockResolvedValueOnce({})
        // COMMIT
        .mockResolvedValueOnce({});

      const res = await request(app)
        .post('/api/attendance/submit')
        .set('Authorization', `Bearer ${teacher1Token}`)
        .send({
          classroomId: class1Org1Id,
          date: '2026-10-13',
          records: [
            { studentId: student1Id, status: 'PRESENT' },
            { studentId: student2Id, status: 'LATE', remarks: 'Bus delay' }
          ]
        });

      expect(res.status).toBe(200);
      expect(res.body.message).toContain('submitted and finalized successfully');
      expect(res.body.session.status).toBe('SUBMITTED');
    });
  });

  describe('5. Administrator Attendance Overview & Percentage Formula', () => {
    it('Calculates attendance percentage strictly as (present + late) / total * 100', async () => {
      jest.spyOn(pool, 'query').mockResolvedValueOnce({
        rows: [
          {
            classroomId: class1Org1Id,
            classroomName: 'Grade 1 - Sunflowers',
            schoolId: 'school-1',
            schoolName: 'Dharavi Centre',
            organizationId: org1Id,
            sessionId: 'sess-1',
            sessionStatus: 'SUBMITTED',
            totalStudents: '10',
            presentCount: '7',
            lateCount: '1',
            absentCount: '2'
          }
        ]
      } as any);

      const res = await request(app)
        .get('/api/attendance/overview?date=2026-10-13')
        .set('Authorization', `Bearer ${orgAdmin1Token}`);

      expect(res.status).toBe(200);
      const classroom = res.body.classrooms[0];
      // Formula: (7 + 1) / 10 * 100 = 80%
      expect(classroom.attendancePercentage).toBe(80);
      expect(res.body.summary.overallPercentage).toBe(80);
      expect(res.body.summary.submittedCount).toBe(1);
    });
  });
});
