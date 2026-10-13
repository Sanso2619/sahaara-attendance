import { Router } from 'express';
import { listTeachersHandler } from '../controllers/teacher.controller';
import { authMiddleware } from '../middleware/auth';
import { tenantMiddleware } from '../middleware/tenant';

const router = Router();

router.use(authMiddleware);
router.use(tenantMiddleware);

router.get('/', listTeachersHandler);

export default router;
