import { Router } from 'express';
import {
  listOrganizationsHandler,
  getOrganizationByIdHandler,
  createOrganizationHandler,
  updateOrganizationHandler,
  createOrganizationSchema,
  updateOrganizationSchema
} from '../controllers/organization.controller';
import { authMiddleware } from '../middleware/auth';
import { tenantMiddleware } from '../middleware/tenant';
import { requireRole } from '../middleware/rbac';
import { validateBody } from '../middleware/validate';

const router = Router();

router.use(authMiddleware);
router.use(tenantMiddleware);

// List organizations (Platform Admin sees all; others see only their own)
router.get('/', listOrganizationsHandler);

// Create new organization (Platform Admin only)
router.post(
  '/',
  requireRole('PLATFORM_ADMIN'),
  validateBody(createOrganizationSchema),
  createOrganizationHandler
);

// View specific organization
router.get('/:id', getOrganizationByIdHandler);

// Update organization (Platform Admin full edit; Org Admin contact details edit)
router.patch(
  '/:id',
  requireRole('PLATFORM_ADMIN', 'ORG_ADMIN'),
  validateBody(updateOrganizationSchema),
  updateOrganizationHandler
);

export default router;
