import { Router } from 'express';
import { loginHandler, logoutHandler, getCurrentUserHandler, loginSchema } from '../controllers/auth.controller';
import { validateBody } from '../middleware/validate';
import { authMiddleware } from '../middleware/auth';

const router = Router();

router.post('/login', validateBody(loginSchema), loginHandler);
router.post('/logout', authMiddleware, logoutHandler);
router.get('/me', authMiddleware, getCurrentUserHandler);

export default router;
