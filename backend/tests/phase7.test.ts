import http from 'http';
import { AddressInfo } from 'net';
import { io as ioClient, Socket as ClientSocket } from 'socket.io-client';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import app from '../src/app';
import { pool } from '../src/config/db';
import { env } from '../src/config/env';
import {
  initSocketServer,
  closeSocketServer,
  emitAttendanceSubmitted,
  emitAttendanceUpdated,
  emitReportsUpdated,
  emitNotificationsUpdated
} from '../src/services/socket.service';

describe('Phase 7: Real-Time Admin Dashboard Updates Suite', () => {
  const secret = env.JWT_SECRET;
  let httpServer: http.Server;
  let serverPort: number;

  const org1Id = '11111111-1111-1111-1111-111111111111';
  const org2Id = '22222222-2222-2222-2222-222222222222';
  const teacherId = '44444444-4444-4444-4444-444444444444';
  const class1Org1Id = '55555555-5555-5555-5555-555555555555';

  const org1AdminToken = jwt.sign(
    { userId: 'admin-1', email: 'admin@hope.org', role: 'ORG_ADMIN', organizationId: org1Id },
    secret
  );

  const org2AdminToken = jwt.sign(
    { userId: 'admin-2', email: 'admin@bright.org', role: 'ORG_ADMIN', organizationId: org2Id },
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

  beforeAll((done) => {
    httpServer = http.createServer(app);
    initSocketServer(httpServer);
    httpServer.listen(0, () => {
      const addr = httpServer.address() as AddressInfo;
      serverPort = addr.port;
      done();
    });
  });

  afterAll(async () => {
    await closeSocketServer();
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('1. Socket Authentication & Rejection', () => {
    it('Rejects unauthenticated socket connections with clear error', (done) => {
      const client: ClientSocket = ioClient(`http://localhost:${serverPort}`, {
        transports: ['websocket'],
        reconnection: false
      });

      client.on('connect_error', (err) => {
        expect(err.message).toMatch(/Missing authentication token/i);
        client.disconnect();
        done();
      });

      client.on('connect', () => {
        client.disconnect();
        done(new Error('Unauthenticated socket should not have connected'));
      });
    });

    it('Rejects socket connection with invalid or forged JWT token', (done) => {
      const client: ClientSocket = ioClient(`http://localhost:${serverPort}`, {
        transports: ['websocket'],
        reconnection: false,
        auth: { token: 'invalid.forged.jwt-token' }
      });

      client.on('connect_error', (err) => {
        expect(err.message).toMatch(/Invalid or expired token/i);
        client.disconnect();
        done();
      });

      client.on('connect', () => {
        client.disconnect();
        done(new Error('Invalid token socket should not have connected'));
      });
    });

    it('Authenticates socket successfully when valid token is in auth object', (done) => {
      const client: ClientSocket = ioClient(`http://localhost:${serverPort}`, {
        transports: ['websocket'],
        reconnection: false,
        auth: { token: org1AdminToken }
      });

      client.on('connect', () => {
        expect(client.connected).toBe(true);
        client.disconnect();
        done();
      });

      client.on('connect_error', (err) => {
        client.disconnect();
        done(err);
      });
    });

    it('Authenticates socket successfully when valid token is in cookie header', (done) => {
      const client: ClientSocket = ioClient(`http://localhost:${serverPort}`, {
        transports: ['websocket'],
        reconnection: false,
        extraHeaders: {
          cookie: `sahaara_auth_token=${org1AdminToken}`
        }
      });

      client.on('connect', () => {
        expect(client.connected).toBe(true);
        client.disconnect();
        done();
      });

      client.on('connect_error', (err) => {
        client.disconnect();
        done(err);
      });
    });
  });

  describe('2. Multi-Tenant Room Isolation', () => {
    let clientOrg1: ClientSocket;
    let clientOrg2: ClientSocket;
    let clientPlatformAdmin: ClientSocket;

    beforeEach((done) => {
      let connectedCount = 0;
      const checkDone = () => {
        connectedCount++;
        if (connectedCount === 3) done();
      };

      clientOrg1 = ioClient(`http://localhost:${serverPort}`, {
        transports: ['websocket'],
        reconnection: false,
        auth: { token: org1AdminToken }
      });
      clientOrg1.on('connect', checkDone);

      clientOrg2 = ioClient(`http://localhost:${serverPort}`, {
        transports: ['websocket'],
        reconnection: false,
        auth: { token: org2AdminToken }
      });
      clientOrg2.on('connect', checkDone);

      clientPlatformAdmin = ioClient(`http://localhost:${serverPort}`, {
        transports: ['websocket'],
        reconnection: false,
        auth: { token: platformAdminToken }
      });
      clientPlatformAdmin.on('connect', checkDone);
    });

    afterEach(() => {
      clientOrg1?.disconnect();
      clientOrg2?.disconnect();
      clientPlatformAdmin?.disconnect();
    });

    it('Delivers attendance:submitted only to users in the same organization and platform admin', (done) => {
      let org1Received = false;
      let platformAdminReceived = false;
      let org2Received = false;

      clientOrg1.on('attendance:submitted', (data) => {
        org1Received = true;
        expect(data.organizationId).toBe(org1Id);
        expect(data.recordsCount).toBe(15);
        // Privacy check: No student rosters or PII
        expect(data.studentNames).toBeUndefined();
        expect(data.records).toBeUndefined();
      });

      clientPlatformAdmin.on('attendance:submitted', (data) => {
        platformAdminReceived = true;
        expect(data.organizationId).toBe(org1Id);
      });

      clientOrg2.on('attendance:submitted', () => {
        org2Received = true;
      });

      // Emit event for Org 1
      emitAttendanceSubmitted({
        sessionId: 'sess-123',
        classroomId: class1Org1Id,
        organizationId: org1Id,
        date: '2026-10-18',
        status: 'SUBMITTED',
        recordsCount: 15,
        timestamp: new Date().toISOString()
      });

      setTimeout(() => {
        expect(org1Received).toBe(true);
        expect(platformAdminReceived).toBe(true);
        // Cross-tenant verification: Org 2 must NOT receive Org 1 events
        expect(org2Received).toBe(false);
        done();
      }, 100);
    });

    it('Delivers reports:updated alongside attendance submissions to trigger KPI refreshes', (done) => {
      let reportEventReceived = false;

      clientOrg1.on('reports:updated', (data) => {
        reportEventReceived = true;
        expect(data.organizationId).toBe(org1Id);
        expect(data.reason).toBe('attendance_submitted');
      });

      emitAttendanceSubmitted({
        sessionId: 'sess-456',
        classroomId: class1Org1Id,
        organizationId: org1Id,
        date: '2026-10-18',
        status: 'SUBMITTED',
        recordsCount: 20,
        timestamp: new Date().toISOString()
      });

      setTimeout(() => {
        expect(reportEventReceived).toBe(true);
        done();
      }, 100);
    });
  });

  describe('3. Role-Based Event Delivery (Notification Follow-ups)', () => {
    let clientOrgAdmin: ClientSocket;
    let clientTeacher: ClientSocket;

    beforeEach((done) => {
      let connectedCount = 0;
      const checkDone = () => {
        connectedCount++;
        if (connectedCount === 2) done();
      };

      clientOrgAdmin = ioClient(`http://localhost:${serverPort}`, {
        transports: ['websocket'],
        reconnection: false,
        auth: { token: org1AdminToken }
      });
      clientOrgAdmin.on('connect', checkDone);

      clientTeacher = ioClient(`http://localhost:${serverPort}`, {
        transports: ['websocket'],
        reconnection: false,
        auth: { token: teacherToken }
      });
      clientTeacher.on('connect', checkDone);
    });

    afterEach(() => {
      clientOrgAdmin?.disconnect();
      clientTeacher?.disconnect();
    });

    it('Sends notifications:updated to Org Admin but not regular Teacher in the same org', (done) => {
      let orgAdminReceived = false;
      let teacherReceived = false;

      clientOrgAdmin.on('notifications:updated', (data) => {
        orgAdminReceived = true;
        expect(data.organizationId).toBe(org1Id);
        expect(data.sent).toBe(3);
        expect(data.failed).toBe(1);
      });

      clientTeacher.on('notifications:updated', () => {
        teacherReceived = true;
      });

      emitNotificationsUpdated({
        organizationId: org1Id,
        totalTriggered: 4,
        sent: 3,
        failed: 1,
        skipped: 0,
        timestamp: new Date().toISOString()
      });

      setTimeout(() => {
        expect(orgAdminReceived).toBe(true);
        // Regular teachers should not receive administrative notification delivery batches
        expect(teacherReceived).toBe(false);
        done();
      }, 100);
    });
  });

  describe('4. Transaction Commit Guard (No Events on Rollback)', () => {
    let clientOrg1: ClientSocket;

    beforeEach((done) => {
      clientOrg1 = ioClient(`http://localhost:${serverPort}`, {
        transports: ['websocket'],
        reconnection: false,
        auth: { token: org1AdminToken }
      });
      clientOrg1.on('connect', done);
    });

    afterEach(() => {
      clientOrg1?.disconnect();
    });

    it('Emits attendance:submitted after successful transaction commit in submitAttendanceHandler', async () => {
      let eventReceived: any = null;
      clientOrg1.on('attendance:submitted', (data) => {
        eventReceived = data;
      });

      const mockClient = {
        query: jest.fn(),
        release: jest.fn()
      };
      jest.spyOn(pool, 'connect').mockResolvedValue(mockClient as any);
      jest.spyOn(pool, 'query').mockResolvedValue({ rows: [] } as any);

      const student1Id = '88888888-8888-8888-8888-888888888888';
      const student2Id = '77777777-7777-7777-7777-777777777777';

      mockClient.query
        // 1. Classroom check
        .mockResolvedValueOnce({
          rows: [{ id: class1Org1Id, organizationId: org1Id, is_active: true }]
        })
        // 2. Teacher check
        .mockResolvedValueOnce({ rows: [{ id: 'assignment-1' }] })
        // 3. Enrolled check
        .mockResolvedValueOnce({
          rows: [{ id: student1Id }]
        })
        // BEGIN
        .mockResolvedValueOnce({})
        // Existing session
        .mockResolvedValueOnce({ rows: [] })
        // Insert session
        .mockResolvedValueOnce({
          rows: [{ id: 'sess-commit-1', status: 'SUBMITTED', submittedAt: '2026-10-18T10:00:00Z' }]
        })
        // Upsert record
        .mockResolvedValueOnce({})
        // COMMIT
        .mockResolvedValueOnce({});

      const res = await request(app)
        .post('/api/attendance/submit')
        .set('Authorization', `Bearer ${teacherToken}`)
        .send({
          classroomId: class1Org1Id,
          date: '2026-10-18',
          records: [{ studentId: student1Id, status: 'PRESENT' }]
        });

      expect(res.status).toBe(200);

      // Wait briefly for socket broadcast
      await new Promise((resolve) => setTimeout(resolve, 80));

      expect(eventReceived).not.toBeNull();
      expect(eventReceived.sessionId).toBe('sess-commit-1');
      expect(eventReceived.status).toBe('SUBMITTED');
      expect(eventReceived.recordsCount).toBe(1);
    });

    it('Does not emit events when attendance submission transaction fails or rolls back', async () => {
      const student1Id = '88888888-8888-8888-8888-888888888888';
      const student2Id = '77777777-7777-7777-7777-777777777777';

      let eventReceived: any = null;
      clientOrg1.on('attendance:submitted', (data) => {
        eventReceived = data;
      });

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
        .mockResolvedValueOnce({ rows: [{ id: 'assignment-1' }] })
        // 3. Enrolled check returns 2 students, but only 1 provided in request
        .mockResolvedValueOnce({
          rows: [{ id: student1Id }, { id: student2Id }]
        });

      const res = await request(app)
        .post('/api/attendance/submit')
        .set('Authorization', `Bearer ${teacherToken}`)
        .send({
          classroomId: class1Org1Id,
          date: '2026-10-18',
          records: [{ studentId: student1Id, status: 'PRESENT' }]
          // student2Id is missing!
        });

      // Validation fails: 400 Bad Request
      expect(res.status).toBe(400);

      // Wait briefly to confirm no socket event was broadcast
      await new Promise((resolve) => setTimeout(resolve, 80));

      expect(eventReceived).toBeNull();
    });
  });
});
