import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../src/app';
import { pool } from '../src/config/db';
import { env } from '../src/config/env';

describe('Phase 2: Organization, School & Classroom CRUD and Tenant Isolation', () => {
  const secret = env.JWT_SECRET;

  const org1Id = '11111111-1111-1111-1111-111111111111';
  const org2Id = '22222222-2222-2222-2222-222222222222';
  const school1Org1Id = '33333333-3333-3333-3333-333333333333';
  const school2Org2Id = '44444444-4444-4444-4444-444444444444';
  const teacher1Org1Id = '55555555-5555-5555-5555-555555555555';
  const teacher2Org2Id = '66666666-6666-6666-6666-666666666666';

  const orgAdmin1Token = jwt.sign(
    { userId: 'admin-1', email: 'admin@org1.com', role: 'ORG_ADMIN', organizationId: org1Id },
    secret
  );

  const orgAdmin2Token = jwt.sign(
    { userId: 'admin-2', email: 'admin@org2.com', role: 'ORG_ADMIN', organizationId: org2Id },
    secret
  );

  const teacher1Token = jwt.sign(
    { userId: teacher1Org1Id, email: 'teacher@org1.com', role: 'TEACHER', organizationId: org1Id },
    secret
  );

  const platformAdminToken = jwt.sign(
    { userId: 'super-admin', email: 'super@sahaara.org', role: 'PLATFORM_ADMIN', organizationId: null },
    secret
  );

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Organization Management & RBAC', () => {
    it('1. Only Platform Admin can create organizations (Org Admin forbidden)', async () => {
      const res = await request(app)
        .post('/api/organizations')
        .set('Authorization', `Bearer ${orgAdmin1Token}`)
        .send({ name: 'New NGO', code: 'NEW_NGO' });

      expect(res.status).toBe(403);
      expect(res.body.error).toContain('Forbidden');
    });

    it('2. Platform Admin can create an organization with valid payload', async () => {
      jest.spyOn(pool, 'query')
        .mockResolvedValueOnce({ rows: [] } as any) // code check
        .mockResolvedValueOnce({ rows: [] } as any) // slug check
        .mockResolvedValueOnce({
          rows: [{
            id: '77777777-7777-7777-7777-777777777777',
            name: 'Kalyan Literacy Project',
            slug: 'kalyan-literacy',
            code: 'KLP',
            contactEmail: 'contact@klp.org',
            contactPhone: '+91 99999 88888',
            isActive: true
          }]
        } as any);

      const res = await request(app)
        .post('/api/organizations')
        .set('Authorization', `Bearer ${platformAdminToken}`)
        .send({
          name: 'Kalyan Literacy Project',
          code: 'KLP',
          contactEmail: 'contact@klp.org',
          contactPhone: '+91 99999 88888'
        });

      expect(res.status).toBe(201);
      expect(res.body.organization.code).toBe('KLP');
      expect(res.body.organization.name).toBe('Kalyan Literacy Project');
    });

    it('3. Org Admin cannot view details of a foreign organization', async () => {
      const res = await request(app)
        .get(`/api/organizations/${org2Id}`)
        .set('Authorization', `Bearer ${orgAdmin1Token}`);

      expect(res.status).toBe(403);
      expect(res.body.error).toContain('Forbidden');
    });
  });

  describe('School Management & Tenant Isolation', () => {
    it('4. Teacher cannot create schools (only Admin roles)', async () => {
      const res = await request(app)
        .post('/api/schools')
        .set('Authorization', `Bearer ${teacher1Token}`)
        .send({ name: 'New School', code: 'SCH-01' });

      expect(res.status).toBe(403);
    });

    it('5. Org Admin 1 cannot access school belonging to Org 2', async () => {
      jest.spyOn(pool, 'query').mockResolvedValueOnce({
        rows: [{
          id: school2Org2Id,
          name: 'Bright School',
          code: 'BRT-01',
          organizationId: org2Id, // Belongs to Org 2
          isActive: true
        }]
      } as any);

      const res = await request(app)
        .get(`/api/schools/${school2Org2Id}`)
        .set('Authorization', `Bearer ${orgAdmin1Token}`);

      expect(res.status).toBe(403);
      expect(res.body.error).toContain('outside your organization');
    });

    it('6. Org Admin can successfully create school in their own organization', async () => {
      jest.spyOn(pool, 'query')
        .mockResolvedValueOnce({ rows: [] } as any) // code check
        .mockResolvedValueOnce({
          rows: [{
            id: 'school-new-1',
            organizationId: org1Id,
            name: 'Wadala Learning Centre',
            code: 'WLC-01',
            address: 'Wadala East',
            isActive: true
          }]
        } as any);

      const res = await request(app)
        .post('/api/schools')
        .set('Authorization', `Bearer ${orgAdmin1Token}`)
        .send({
          name: 'Wadala Learning Centre',
          code: 'WLC-01',
          address: 'Wadala East'
        });

      expect(res.status).toBe(201);
      expect(res.body.school.name).toBe('Wadala Learning Centre');
      expect(res.body.school.organizationId).toBe(org1Id);
    });
  });

  describe('Classroom Management & Cross-Tenant Validation', () => {
    it('7. Cannot create classroom under a school belonging to another organization', async () => {
      // Mock school lookup returning Org 2 ownership
      jest.spyOn(pool, 'query').mockResolvedValueOnce({
        rows: [{ organization_id: org2Id, is_active: true }]
      } as any);

      const res = await request(app)
        .post('/api/classrooms')
        .set('Authorization', `Bearer ${orgAdmin1Token}`) // Org 1 Admin
        .send({
          schoolId: school2Org2Id,
          name: 'Grade 1 - Jasmine'
        });

      expect(res.status).toBe(403);
      expect(res.body.error).toContain('Tenant isolation violation');
    });

    it('8. Cannot assign a teacher belonging to another organization', async () => {
      // Mock school lookup returning Org 1 ownership
      jest.spyOn(pool, 'query')
        .mockResolvedValueOnce({
          rows: [{ organization_id: org1Id, is_active: true }]
        } as any)
        // Mock teacher query returning empty (teacher2Org2Id not in org1Id)
        .mockResolvedValueOnce({
          rows: []
        } as any);

      const res = await request(app)
        .post('/api/classrooms')
        .set('Authorization', `Bearer ${orgAdmin1Token}`)
        .send({
          schoolId: school1Org1Id,
          name: 'Grade 1 - Jasmine',
          teacherId: teacher2Org2Id // Foreign Org 2 teacher
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Assigned teacher does not exist in this organization');
    });

    it('9. Successfully creates classroom and assigns teacher within tenant scope', async () => {
      // Mock school check
      const clientMock = {
        query: jest.fn()
          .mockResolvedValueOnce({}) // BEGIN
          .mockResolvedValueOnce({
            rows: [{
              id: 'class-new-1',
              organizationId: org1Id,
              schoolId: school1Org1Id,
              name: 'Grade 1 - Jasmine',
              gradeLevel: 'Grade 1',
              academicYear: '2026-2027',
              isActive: true
            }]
          }) // INSERT classroom
          .mockResolvedValueOnce({}) // INSERT classroom_teachers
          .mockResolvedValueOnce({}), // COMMIT
        release: jest.fn()
      };

      jest.spyOn(pool, 'query')
        .mockResolvedValueOnce({
          rows: [{ organization_id: org1Id, is_active: true }]
        } as any)
        .mockResolvedValueOnce({
          rows: [{ id: teacher1Org1Id }]
        } as any);

      jest.spyOn(pool, 'connect').mockResolvedValueOnce(clientMock as any);

      const res = await request(app)
        .post('/api/classrooms')
        .set('Authorization', `Bearer ${orgAdmin1Token}`)
        .send({
          schoolId: school1Org1Id,
          name: 'Grade 1 - Jasmine',
          gradeLevel: 'Grade 1',
          academicYear: '2026-2027',
          teacherId: teacher1Org1Id
        });

      expect(res.status).toBe(201);
      expect(res.body.classroom.name).toBe('Grade 1 - Jasmine');
      expect(res.body.classroom.teacherId).toBe(teacher1Org1Id);
    });
  });
});
