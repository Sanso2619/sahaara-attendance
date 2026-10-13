import { Router } from 'express';
import {
  getDashboardAnalyticsHandler,
  getStudentsReportHandler,
  exportAttendanceCsvHandler
} from '../controllers/report.controller';
import { authMiddleware } from '../middleware/auth';
import { tenantMiddleware } from '../middleware/tenant';

const router = Router();

router.use(authMiddleware);
router.use(tenantMiddleware);

// 1. Organization attendance dashboard analytics & trends
router.get('/dashboard', getDashboardAnalyticsHandler);

// 2. Student-wise aggregated attendance report
router.get('/students', getStudentsReportHandler);

// 3. Export CSV report (with formula injection protection)
router.get('/export/csv', exportAttendanceCsvHandler);

export default router;
