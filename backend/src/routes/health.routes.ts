import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { tenantMiddleware } from '../middleware/tenant';
import { pool } from '../config/db';

const router = Router();

router.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Protected route to test tenant isolation context
router.get('/tenant-test', authMiddleware, tenantMiddleware, async (req, res) => {
  const orgId = req.user?.organizationId;
  const role = req.user?.role;

  try {
    let result;
    if (role === 'PLATFORM_ADMIN') {
      result = await pool.query('SELECT id, name, slug FROM organizations');
    } else {
      result = await pool.query('SELECT id, name, slug FROM organizations WHERE id = $1', [orgId]);
    }

    res.status(200).json({
      userRole: role,
      userOrgId: orgId,
      accessibleOrganizations: result.rows
    });
  } catch (err) {
    res.status(500).json({ error: 'Tenant query failure' });
  }
});

export default router;
