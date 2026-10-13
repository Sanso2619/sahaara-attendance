import request from 'supertest';
import express from 'express';
import jwt from 'jsonwebtoken';
import { authMiddleware } from '../src/middleware/auth';
import { tenantMiddleware } from '../src/middleware/tenant';
import { requireRole } from '../src/middleware/rbac';
import { env } from '../src/config/env';

const app = express();
app.use(express.json());

// Mock protected tenant routes
app.get('/api/test/tenant', authMiddleware, tenantMiddleware, (req, res) => {
  res.json({
    message: 'Access Granted',
    userId: req.user?.userId,
    orgId: req.user?.organizationId,
    role: req.user?.role
  });
});

app.get('/api/test/admin-only', authMiddleware, tenantMiddleware, requireRole('ORG_ADMIN', 'PLATFORM_ADMIN'), (req, res) => {
  res.json({ message: 'Admin Area Access Granted' });
});

describe('Authentication & Tenant Isolation Middleware Suite', () => {
  const secret = env.JWT_SECRET;

  const validOrg1Token = jwt.sign(
    { userId: 'user-1', email: 'teacher1@org1.com', role: 'TEACHER', organizationId: 'org-uuid-1111' },
    secret
  );

  const validOrg2Token = jwt.sign(
    { userId: 'user-2', email: 'teacher2@org2.com', role: 'TEACHER', organizationId: 'org-uuid-2222' },
    secret
  );

  const platformAdminToken = jwt.sign(
    { userId: 'admin-0', email: 'super@sahaara.org', role: 'PLATFORM_ADMIN', organizationId: null },
    secret
  );

  it('1. Should reject requests without authorization token', async () => {
    const res = await request(app).get('/api/test/tenant');
    expect(res.status).toBe(401);
    expect(res.body.error).toContain('Authentication required');
  });

  it('2. Should reject requests with invalid JWT token', async () => {
    const res = await request(app)
      .get('/api/test/tenant')
      .set('Authorization', 'Bearer invalid_token_str');
    expect(res.status).toBe(401);
  });

  it('3. Should allow valid Org 1 token and extract correct tenant context', async () => {
    const res = await request(app)
      .get('/api/test/tenant')
      .set('Authorization', `Bearer ${validOrg1Token}`);
    expect(res.status).toBe(200);
    expect(res.body.orgId).toBe('org-uuid-1111');
    expect(res.body.role).toBe('TEACHER');
  });

  it('4. Should block cross-tenant override headers attempting access to another Org', async () => {
    const res = await request(app)
      .get('/api/test/tenant')
      .set('Authorization', `Bearer ${validOrg1Token}`)
      .set('X-Organization-ID', 'org-uuid-2222'); // Malicious cross-org attempt

    expect(res.status).toBe(403);
    expect(res.body.error).toContain('Tenant access violation');
  });

  it('5. Should enforce RBAC role access controls (deny Teacher from Admin endpoint)', async () => {
    const res = await request(app)
      .get('/api/test/admin-only')
      .set('Authorization', `Bearer ${validOrg2Token}`); // Teacher role

    expect(res.status).toBe(403);
    expect(res.body.error).toContain('Forbidden: User role \'TEACHER\' is not authorized');
  });

  it('6. Should allow Platform Admin access to global tenant routes', async () => {
    const res = await request(app)
      .get('/api/test/tenant')
      .set('Authorization', `Bearer ${platformAdminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.role).toBe('PLATFORM_ADMIN');
    expect(res.body.orgId).toBeNull();
  });
});
