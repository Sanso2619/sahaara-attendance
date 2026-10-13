import { Router } from 'express';
import {
  listClassroomsHandler,
  getClassroomByIdHandler,
  createClassroomHandler,
  updateClassroomHandler,
  deactivateClassroomHandler,
  createClassroomSchema,
  updateClassroomSchema
} from '../controllers/classroom.controller';
import { authMiddleware } from '../middleware/auth';
import { tenantMiddleware } from '../middleware/tenant';
import { requireRole } from '../middleware/rbac';
import { validateBody } from '../middleware/validate';

const router = Router();

router.use(authMiddleware);
router.use(tenantMiddleware);

// List classrooms
router.get('/', listClassroomsHandler);

// Create classroom (Org Admin or Platform Admin)
router.post(
  '/',
  requireRole('PLATFORM_ADMIN', 'ORG_ADMIN'),
  validateBody(createClassroomSchema),
  createClassroomHandler
);

// View single classroom
router.get('/:id', getClassroomByIdHandler);

// Update classroom
router.patch(
  '/:id',
  requireRole('PLATFORM_ADMIN', 'ORG_ADMIN'),
  validateBody(updateClassroomSchema),
  updateClassroomHandler
);

// Toggle active status (deactivate/reactivate)
router.patch(
  '/:id/deactivate',
  requireRole('PLATFORM_ADMIN', 'ORG_ADMIN'),
  deactivateClassroomHandler
);

export default router;
