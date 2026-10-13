import { Router } from 'express';
import {
  getNotificationSettingsHandler,
  updateNotificationSettingsHandler,
  listNotificationDeliveriesHandler,
  getNotificationDeliveryByIdHandler,
  retryNotificationDeliveryHandler,
  previewNotificationMessageHandler
} from '../controllers/notification.controller';
import { authMiddleware } from '../middleware/auth';
import { tenantMiddleware } from '../middleware/tenant';
import { requireRole } from '../middleware/rbac';

const router = Router();

// Tenant and auth verification on all routes
router.use(authMiddleware);
router.use(tenantMiddleware);

// 1. Notification Settings & Message Templates (Admins only)
router.get(
  '/settings',
  requireRole('PLATFORM_ADMIN', 'ORG_ADMIN'),
  getNotificationSettingsHandler
);

router.put(
  '/settings',
  requireRole('PLATFORM_ADMIN', 'ORG_ADMIN'),
  updateNotificationSettingsHandler
);

router.patch(
  '/settings',
  requireRole('PLATFORM_ADMIN', 'ORG_ADMIN'),
  updateNotificationSettingsHandler
);

// 2. Deliveries Audit Log
router.get(
  '/deliveries',
  requireRole('PLATFORM_ADMIN', 'ORG_ADMIN', 'TEACHER'),
  listNotificationDeliveriesHandler
);

router.get(
  '/deliveries/:id',
  requireRole('PLATFORM_ADMIN', 'ORG_ADMIN', 'TEACHER'),
  getNotificationDeliveryByIdHandler
);

// 3. Manual Bounded Retry (Admins only)
router.post(
  '/deliveries/:id/retry',
  requireRole('PLATFORM_ADMIN', 'ORG_ADMIN'),
  retryNotificationDeliveryHandler
);

// 4. Live Message Template Preview (Admins only)
router.post(
  '/preview',
  requireRole('PLATFORM_ADMIN', 'ORG_ADMIN'),
  previewNotificationMessageHandler
);

export default router;
