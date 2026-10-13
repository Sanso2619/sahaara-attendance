import { Router } from 'express';
import {
  listSchoolsHandler,
  getSchoolByIdHandler,
  createSchoolHandler,
  updateSchoolHandler,
  deactivateSchoolHandler,
  createSchoolSchema,
  updateSchoolSchema
} from '../controllers/school.controller';
import { authMiddleware } from '../middleware/auth';
import { tenantMiddleware } from '../middleware/tenant';
import { requireRole } from '../middleware/rbac';
import { validateBody } from '../middleware/validate';

const router = Router();

router.use(authMiddleware);
router.use(tenantMiddleware);

// List schools in organization
router.get('/', listSchoolsHandler);

// Create school (Org Admin or Platform Admin)
router.post(
  '/',
  requireRole('PLATFORM_ADMIN', 'ORG_ADMIN'),
  validateBody(createSchoolSchema),
  createSchoolHandler
);

// View single school details
router.get('/:id', getSchoolByIdHandler);

// Update school details
router.patch(
  '/:id',
  requireRole('PLATFORM_ADMIN', 'ORG_ADMIN'),
  validateBody(updateSchoolSchema),
  updateSchoolHandler
);

// Toggle active status (deactivate/reactivate)
router.patch(
  '/:id/deactivate',
  requireRole('PLATFORM_ADMIN', 'ORG_ADMIN'),
  deactivateSchoolHandler
);

export default router;
