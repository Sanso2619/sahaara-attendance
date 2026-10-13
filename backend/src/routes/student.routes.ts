import { Router } from 'express';
import {
  listStudentsHandler,
  getStudentByIdHandler,
  createStudentHandler,
  updateStudentHandler,
  deactivateStudentHandler,
  enrollStudentHandler,
  createStudentSchema,
  updateStudentSchema,
  enrollStudentSchema
} from '../controllers/student.controller';
import { authMiddleware } from '../middleware/auth';
import { tenantMiddleware } from '../middleware/tenant';
import { requireRole } from '../middleware/rbac';
import { validateBody } from '../middleware/validate';

const router = Router();

router.use(authMiddleware);
router.use(tenantMiddleware);

// List students in organization
router.get('/', listStudentsHandler);

// Register a new student
router.post(
  '/',
  requireRole('PLATFORM_ADMIN', 'ORG_ADMIN'),
  validateBody(createStudentSchema),
  createStudentHandler
);

// Get student details and enrollment history
router.get('/:id', getStudentByIdHandler);

// Update student record
router.patch(
  '/:id',
  requireRole('PLATFORM_ADMIN', 'ORG_ADMIN'),
  validateBody(updateStudentSchema),
  updateStudentHandler
);

// Toggle active status (deactivate/reactivate)
router.patch(
  '/:id/deactivate',
  requireRole('PLATFORM_ADMIN', 'ORG_ADMIN'),
  deactivateStudentHandler
);

// Enroll or transfer student to a classroom
router.post(
  '/:id/enroll',
  requireRole('PLATFORM_ADMIN', 'ORG_ADMIN'),
  validateBody(enrollStudentSchema),
  enrollStudentHandler
);

export default router;
