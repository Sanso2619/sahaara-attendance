import { Router } from 'express';
import { listAuditLogsHandler } from '../controllers/audit.controller';
import { authMiddleware } from '../middleware/auth';
import { tenantMiddleware } from '../middleware/tenant';
import { requireRole } from '../middleware/rbac';

const router = Router();

router.use(authMiddleware);
router.use(tenantMiddleware);

// Only Platform Admin and Organization Admin can view audit logs
router.get(
  '/',
  requireRole('PLATFORM_ADMIN', 'ORG_ADMIN'),
  listAuditLogsHandler
);

export default router;
