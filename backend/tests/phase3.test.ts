import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../src/app';
import { pool } from '../src/config/db';
import { env } from '../src/config/env';

describe('Phase 3: Student Management, Classroom Enrollment & Tenant Isolation', () => {
  const secret = env.JWT_SECRET;

  const org1Id = '11111111-1111-1111-1111-111111111111';
  const org2Id = '22222222-2222-2222-2222-222222222222';
  const school1Org1Id = '33333333-3333-3333-3333-333333333333';
  const school2Org2Id = '44444444-4444-4444-4444-444444444444';
  const class1Org1Id = '55555555-5555-5555-5555-555555555555';
  const class2Org1Id = '66666666-6666-6666-6666-666666666666';
  const classOrg2Id = '77777777-7777-7777-7777-777777777777';
  const student1Org1Id = '88888888-8888-8888-8888-888888888888';

  const orgAdmin1Token = jwt.sign(
    { userId: 'admin-1', email: 'admin@org1.com', role: 'ORG_ADMIN', organizationId: org1Id },
    secret
  );

  const orgAdmin2Token = jwt.sign(
    { userId: 'admin-2', email: 'admin@org2.com', role: 'ORG_ADMIN', organizationId: org2Id },
    secret
  );

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Student CRUD & Tenant Isolation', () => {
    it('1. Cannot create student under a school belonging to another organization', async () => {
      // Mock school query returning Org 2
      jest.spyOn(pool, 'query').mockResolvedValueOnce({
        rows: [{ organization_id: org2Id, is_active: true }]
      } as any);

      const res = await request(app)
        .post('/api/students')
        .set('Authorization', `Bearer ${orgAdmin1Token}`)
        .send({
          schoolId: school2Org2Id, // Org 2 school
          rollNumber: 'STU-101',
          firstName: 'Rohan',
          lastName: 'Verma'
        });

      expect(res.status).toBe(403);
      expect(res.body.error).toContain('Tenant isolation violation');
    });

    it('2. Enforces unique roll number within organization', async () => {
      // Mock school query returning Org 1
      jest.spyOn(pool, 'query')
        .mockResolvedValueOnce({
          rows: [{ organization_id: org1Id, is_active: true }]
        } as any)
        // Mock roll number check returning existing student
        .mockResolvedValueOnce({
          rows: [{ id: 'existing-stu' }]
        } as any);

      const res = await request(app)
        .post('/api/students')
        .set('Authorization', `Bearer ${orgAdmin1Token}`)
        .send({
          schoolId: school1Org1Id,
          rollNumber: 'STU-DUP',
          firstName: 'Simran',
          lastName: 'Kaur'
        });

      expect(res.status).toBe(409);
      expect(res.body.error).toContain('already exists in this organization');
    });

    it('3. Successfully registers student and enrolls in initial classroom', async () => {
      const clientMock = {
        query: jest.fn()
          .mockResolvedValueOnce({}) // BEGIN
          .mockResolvedValueOnce({
            rows: [{
              id: 'stu-new-1',
              organizationId: org1Id,
              schoolId: school1Org1Id,
              rollNumber: 'STU-105',
              firstName: 'Amit',
              lastName: 'Sharma',
              isActive: true
            }]
          }) // INSERT student
          .mockResolvedValueOnce({}) // INSERT enrollment
          .mockResolvedValueOnce({}), // COMMIT
        release: jest.fn()
      };

      jest.spyOn(pool, 'query')
        .mockResolvedValueOnce({
          rows: [{ organization_id: org1Id, is_active: true }] // school check
        } as any)
        .mockResolvedValueOnce({
          rows: [{ organization_id: org1Id, school_id: school1Org1Id }] // classroom check
        } as any)
        .mockResolvedValueOnce({
          rows: [] // roll number uniqueness check
        } as any);

      jest.spyOn(pool, 'connect').mockResolvedValueOnce(clientMock as any);

      const res = await request(app)
        .post('/api/students')
        .set('Authorization', `Bearer ${orgAdmin1Token}`)
        .send({
          schoolId: school1Org1Id,
          rollNumber: 'STU-105',
          firstName: 'Amit',
          lastName: 'Sharma',
          classroomId: class1Org1Id,
          guardianName: 'Sunil Sharma',
          guardianContact: '+91 99999 11111'
        });

      expect(res.status).toBe(201);
      expect(res.body.student.rollNumber).toBe('STU-105');
      expect(res.body.student.classroomId).toBe(class1Org1Id);
    });

    it('4. Org Admin cannot view student belonging to another organization', async () => {
      jest.spyOn(pool, 'query').mockResolvedValueOnce({
        rows: [{
          id: 'stu-foreign',
          organizationId: org2Id, // Foreign Org
          rollNumber: 'STU-200'
        }]
      } as any);

      const res = await request(app)
        .get('/api/students/stu-foreign')
        .set('Authorization', `Bearer ${orgAdmin1Token}`);

      expect(res.status).toBe(403);
      expect(res.body.error).toContain('outside your organization');
    });
  });

  describe('Classroom Enrollment & Transfers', () => {
    it('5. Cannot enroll student into a classroom belonging to another organization', async () => {
      // Mock student query returning Org 1
      jest.spyOn(pool, 'query')
        .mockResolvedValueOnce({
          rows: [{ organization_id: org1Id, school_id: school1Org1Id, is_active: true }]
        } as any)
        // Mock classroom query returning Org 2
        .mockResolvedValueOnce({
          rows: [{ organization_id: org2Id, school_id: school2Org2Id, name: 'Foreign Class', is_active: true }]
        } as any);

      const res = await request(app)
        .post(`/api/students/${student1Org1Id}/enroll`)
        .set('Authorization', `Bearer ${orgAdmin1Token}`)
        .send({ classroomId: classOrg2Id });

      expect(res.status).toBe(403);
      expect(res.body.error).toContain('Tenant isolation violation');
    });

    it('6. Successfully transfers student to another classroom within organization', async () => {
      const clientMock = {
        query: jest.fn()
          .mockResolvedValueOnce({}) // BEGIN
          .mockResolvedValueOnce({}) // UPDATE previous enrollments
          .mockResolvedValueOnce({
            rows: [{
              id: 'enroll-new',
              classroomId: class2Org1Id,
              studentId: student1Org1Id,
              enrolledAt: new Date().toISOString(),
              isActive: true
            }]
          }) // INSERT new enrollment
          .mockResolvedValueOnce({}), // COMMIT
        release: jest.fn()
      };

      jest.spyOn(pool, 'query')
        .mockResolvedValueOnce({
          rows: [{ organization_id: org1Id, school_id: school1Org1Id, is_active: true }]
        } as any)
        .mockResolvedValueOnce({
          rows: [{ organization_id: org1Id, school_id: school1Org1Id, name: 'Grade 2 - Bluebells', is_active: true }]
        } as any);

      jest.spyOn(pool, 'connect').mockResolvedValueOnce(clientMock as any);

      const res = await request(app)
        .post(`/api/students/${student1Org1Id}/enroll`)
        .set('Authorization', `Bearer ${orgAdmin1Token}`)
        .send({ classroomId: class2Org1Id });

      expect(res.status).toBe(200);
      expect(res.body.message).toContain("Grade 2 - Bluebells");
      expect(res.body.enrollment.classroomId).toBe(class2Org1Id);
    });
  });

  describe('Classroom Roster Access', () => {
    it('7. Cannot view roster for classroom outside organization', async () => {
      jest.spyOn(pool, 'query').mockResolvedValueOnce({
        rows: [{
          id: classOrg2Id,
          name: 'Bright Class',
          organizationId: org2Id // Foreign Org
        }]
      } as any);

      const res = await request(app)
        .get(`/api/classrooms/${classOrg2Id}/roster`)
        .set('Authorization', `Bearer ${orgAdmin1Token}`);

      expect(res.status).toBe(403);
      expect(res.body.error).toContain('outside your organization');
    });

    it('8. Successfully returns roster of students actively enrolled in classroom', async () => {
      jest.spyOn(pool, 'query')
        .mockResolvedValueOnce({
          rows: [{
            id: class1Org1Id,
            name: 'Grade 1 - Sunflowers',
            organizationId: org1Id,
            schoolName: 'Dharavi Centre',
            teacherName: 'Ananya Teacher'
          }]
        } as any)
        .mockResolvedValueOnce({
          rows: [
            { id: 's1', rollNumber: 'STU-001', firstName: 'Aarav', lastName: 'Kumar', isActive: true },
            { id: 's2', rollNumber: 'STU-002', firstName: 'Diya', lastName: 'Sharma', isActive: true }
          ]
        } as any);

      const res = await request(app)
        .get(`/api/classrooms/${class1Org1Id}/roster`)
        .set('Authorization', `Bearer ${orgAdmin1Token}`);

      expect(res.status).toBe(200);
      expect(res.body.classroom.name).toBe('Grade 1 - Sunflowers');
      expect(res.body.roster.length).toBe(2);
      expect(res.body.roster[0].firstName).toBe('Aarav');
    });
  });
});
