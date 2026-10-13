import { Router } from 'express';
import {
  listAssignedClassroomsHandler,
  getClassroomAttendanceSessionHandler,
  saveAttendanceDraftHandler,
  submitAttendanceHandler,
  getAttendanceOverviewHandler,
  getStudentAttendanceHistoryHandler,
  saveAttendanceSchema,
  submitAttendanceSchema
} from '../controllers/attendance.controller';
import { authMiddleware } from '../middleware/auth';
import { tenantMiddleware } from '../middleware/tenant';
import { validateBody } from '../middleware/validate';

const router = Router();

router.use(authMiddleware);
router.use(tenantMiddleware);

// 1. List assigned classrooms
router.get('/classrooms', listAssignedClassroomsHandler);

// 2. Load attendance session and roster for classroom & date
router.get('/session', getClassroomAttendanceSessionHandler);

// 3. Save draft progress (status: OPEN)
router.post('/save', validateBody(saveAttendanceSchema), saveAttendanceDraftHandler);

// 4. Submit & finalize register (status: SUBMITTED)
router.post('/submit', validateBody(submitAttendanceSchema), submitAttendanceHandler);

// 5. Overview & summaries
router.get('/overview', getAttendanceOverviewHandler);

// 6. Student attendance history
router.get('/students/:studentId', getStudentAttendanceHistoryHandler);

export default router;
