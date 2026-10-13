import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../src/app';
import { pool } from '../src/config/db';
import { env } from '../src/config/env';
import { sanitizeCsvField } from '../src/controllers/report.controller';

describe('Phase 5: Attendance Reports, Analytics & Exports Suite', () => {
  const secret = env.JWT_SECRET;

  const org1Id = '11111111-1111-1111-1111-111111111111';
  const org2Id = '22222222-2222-2222-2222-222222222222';
  const school1Org1Id = '33333333-3333-3333-3333-333333333333';
  const class1Org1Id = '55555555-5555-5555-5555-555555555555';
  const student1Org1Id = '88888888-8888-8888-8888-888888888888';

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

  describe('1. Dashboard Analytics & Formula Precision', () => {
    it('Calculates overall percentage strictly as (present + late) / total marked records * 100', async () => {
      // 1. Total students query
      jest.spyOn(pool, 'query')
        .mockResolvedValueOnce({
          rows: [{ totalActiveStudents: '25' }]
        } as any)
        // 2. Overall metrics query
        .mockResolvedValueOnce({
          rows: [
            {
              totalSessions: '10',
              submittedSessions: '8',
              openSessions: '2',
              presentCount: '150',
              lateCount: '25',
              absentCount: '25'
            }
          ]
        } as any)
        // 3. Trends query
        .mockResolvedValueOnce({
          rows: [
            {
              date: '2026-10-10',
              totalSessions: 1,
              submittedSessions: 1,
              openSessions: 0,
              presentCount: '18',
              lateCount: '2',
              absentCount: '0'
            }
          ]
        } as any)
        // 4. School comparison query
        .mockResolvedValueOnce({
          rows: [
            {
              schoolId: school1Org1Id,
              schoolName: 'Dharavi Centre',
              schoolCode: 'DCL-01',
              classroomCount: '2',
              totalSessions: '10',
              submittedSessions: '8',
              presentCount: '150',
              lateCount: '25',
              absentCount: '25'
            }
          ]
        } as any)
        // 5. Classroom summary query
        .mockResolvedValueOnce({
          rows: [
            {
              classroomId: class1Org1Id,
              classroomName: 'Grade 1 - Sunflowers',
              gradeLevel: 'Grade 1',
              schoolId: school1Org1Id,
              schoolName: 'Dharavi Centre',
              schoolCode: 'DCL-01',
              totalEnrolled: '15',
              totalSessions: '5',
              submittedSessions: '4',
              openSessions: '1',
              presentCount: '75',
              lateCount: '15',
              absentCount: '10'
            }
          ]
        } as any);

      const res = await request(app)
        .get('/api/reports/dashboard?startDate=2026-10-01&endDate=2026-10-13')
        .set('Authorization', `Bearer ${orgAdmin1Token}`);

      expect(res.status).toBe(200);
      expect(res.body.summary.totalActiveStudents).toBe(25);
      expect(res.body.summary.totalSessions).toBe(10);
      expect(res.body.summary.submittedSessions).toBe(8);
      expect(res.body.summary.openSessions).toBe(2);
      expect(res.body.summary.presentCount).toBe(150);
      expect(res.body.summary.lateCount).toBe(25);
      expect(res.body.summary.absentCount).toBe(25);
      expect(res.body.summary.totalMarkedRecords).toBe(200);

      // Formula: (150 + 25) / 200 * 100 = 87.5%
      expect(res.body.summary.overallPercentage).toBe(87.5);

      // Trend day calculation: (18 + 2) / 20 * 100 = 100%
      expect(res.body.dailyTrends[0].attendancePercentage).toBe(100);

      // Classroom calculation: (75 + 15) / 100 * 100 = 90%
      expect(res.body.classroomSummary[0].attendancePercentage).toBe(90);
    });

    it('Safely handles zero denominator when no records exist', async () => {
      jest.spyOn(pool, 'query')
        .mockResolvedValueOnce({ rows: [{ totalActiveStudents: '0' }] } as any)
        .mockResolvedValueOnce({
          rows: [
            {
              totalSessions: '0',
              submittedSessions: '0',
              openSessions: '0',
              presentCount: '0',
              lateCount: '0',
              absentCount: '0'
            }
          ]
        } as any)
        .mockResolvedValueOnce({ rows: [] } as any)
        .mockResolvedValueOnce({ rows: [] } as any)
        .mockResolvedValueOnce({ rows: [] } as any);

      const res = await request(app)
        .get('/api/reports/dashboard?startDate=2026-10-01&endDate=2026-10-13')
        .set('Authorization', `Bearer ${orgAdmin1Token}`);

      expect(res.status).toBe(200);
      expect(res.body.summary.totalMarkedRecords).toBe(0);
      expect(res.body.summary.overallPercentage).toBe(0);
    });
  });

  describe('2. Student-Wise Attendance Report', () => {
    it('Returns student aggregated records with attendance rate', async () => {
      jest.spyOn(pool, 'query').mockResolvedValueOnce({
        rows: [
          {
            studentId: student1Org1Id,
            rollNumber: 'STU-001',
            firstName: 'Aarav',
            lastName: 'Kumar',
            gender: 'MALE',
            schoolId: school1Org1Id,
            schoolName: 'Dharavi Centre',
            schoolCode: 'DCL-01',
            classroomId: class1Org1Id,
            classroomName: 'Grade 1 - Sunflowers',
            gradeLevel: 'Grade 1',
            daysRecorded: '10',
            presentCount: '8',
            lateCount: '1',
            absentCount: '1'
          }
        ]
      } as any);

      const res = await request(app)
        .get('/api/reports/students?startDate=2026-10-01&endDate=2026-10-13')
        .set('Authorization', `Bearer ${orgAdmin1Token}`);

      expect(res.status).toBe(200);
      expect(res.body.totalStudents).toBe(1);
      const student = res.body.students[0];
      expect(student.rollNumber).toBe('STU-001');
      expect(student.daysRecorded).toBe(10);
      expect(student.totalMarked).toBe(10);
      // (8 + 1) / 10 * 100 = 90%
      expect(student.attendancePercentage).toBe(90);
    });
  });

  describe('3. CSV Export & Formula Injection Prevention', () => {
    it('Prevents CSV formula injection by sanitizing leading characters', () => {
      expect(sanitizeCsvField('=SUM(A1:A10)')).toBe("'=SUM(A1:A10)");
      expect(sanitizeCsvField('+12345')).toBe("'+12345");
      expect(sanitizeCsvField('-500')).toBe("'-500");
      expect(sanitizeCsvField('@admin')).toBe("'@admin");
      expect(sanitizeCsvField('Normal Name')).toBe('Normal Name');
      expect(sanitizeCsvField('Name, with comma')).toBe('"Name, with comma"');
    });

    it('Exports classroom summary CSV with metadata headers and download headers', async () => {
      // 1. Org query for metadata
      jest.spyOn(pool, 'query')
        .mockResolvedValueOnce({
          rows: [{ name: 'Hope Community Education Centre' }]
        } as any)
        // 2. Classrooms query
        .mockResolvedValueOnce({
          rows: [
            {
              schoolName: 'Dharavi Centre',
              schoolCode: 'DCL-01',
              classroomName: 'Grade 1 - Sunflowers',
              gradeLevel: 'Grade 1',
              totalEnrolled: '20',
              totalSessions: '5',
              submittedSessions: '5',
              openSessions: '0',
              presentCount: '90',
              lateCount: '5',
              absentCount: '5'
            }
          ]
        } as any);

      const res = await request(app)
        .get('/api/reports/export/csv?type=classrooms&startDate=2026-10-01&endDate=2026-10-13')
        .set('Authorization', `Bearer ${orgAdmin1Token}`);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/csv');
      expect(res.headers['content-disposition']).toContain('attachment; filename=');
      expect(res.text).toContain('# Sahaara Attendance Management Platform');
      expect(res.text).toContain('# Organization: Hope Community Education Centre');
      expect(res.text).toContain('School / Centre,School Code,Classroom');
      expect(res.text).toContain('Dharavi Centre,DCL-01,Grade 1 - Sunflowers');
    });
  });

  describe('4. Student History Date Range Filtering', () => {
    it('Filters attendance records by date range in student history', async () => {
      // 1. Student lookup query
      jest.spyOn(pool, 'query')
        .mockResolvedValueOnce({
          rows: [
            {
              id: student1Org1Id,
              rollNumber: 'STU-001',
              firstName: 'Aarav',
              lastName: 'Kumar',
              organizationId: org1Id
            }
          ]
        } as any)
        // 2. History records query
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'rec-1',
              status: 'PRESENT',
              remarks: 'Good participation',
              markedAt: '2026-10-12T08:00:00Z',
              date: '2026-10-12',
              sessionStatus: 'SUBMITTED',
              classroomName: 'Grade 1 - Sunflowers',
              schoolName: 'Dharavi Centre',
              markedByName: 'Teacher Anita'
            }
          ]
        } as any);

      const res = await request(app)
        .get(`/api/attendance/students/${student1Org1Id}?startDate=2026-10-10&endDate=2026-10-13`)
        .set('Authorization', `Bearer ${orgAdmin1Token}`);

      expect(res.status).toBe(200);
      expect(res.body.student.rollNumber).toBe('STU-001');
      expect(res.body.stats.totalDays).toBe(1);
      expect(res.body.stats.presentCount).toBe(1);
      expect(res.body.stats.attendancePercentage).toBe(100);
      expect(res.body.history[0].date).toBe('2026-10-12');
    });

    it('Cross-tenant violation: Org Admin 2 cannot access student belonging to Org 1', async () => {
      jest.spyOn(pool, 'query').mockResolvedValueOnce({
        rows: [
          {
            id: student1Org1Id,
            organizationId: org1Id // Belongs to Org 1
          }
        ]
      } as any);

      const res = await request(app)
        .get(`/api/attendance/students/${student1Org1Id}`)
        .set('Authorization', `Bearer ${orgAdmin2Token}`); // Org 2 admin

      expect(res.status).toBe(403);
      expect(res.body.error).toContain('Access denied');
    });
  });
});
