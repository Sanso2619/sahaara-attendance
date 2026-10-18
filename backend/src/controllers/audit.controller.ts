import { Request, Response } from 'express';
import { listAuditLogs } from '../services/audit.service';

/**
 * Lists audit logs with strict role and tenant boundaries
 */
export async function listAuditLogsHandler(req: Request, res: Response) {
  const role = req.user?.role;
  const userOrgId = req.user?.organizationId || null;

  if (role !== 'PLATFORM_ADMIN' && role !== 'ORG_ADMIN') {
    return res.status(403).json({ error: 'Forbidden: You do not have permission to inspect system audit logs.' });
  }

  const action = typeof req.query.action === 'string' ? req.query.action.trim() : undefined;
  const targetType = typeof req.query.targetType === 'string' ? req.query.targetType.trim() : undefined;
  const startDate = typeof req.query.startDate === 'string' ? req.query.startDate : undefined;
  const endDate = typeof req.query.endDate === 'string' ? req.query.endDate : undefined;
  const targetOrgId = typeof req.query.organizationId === 'string' ? req.query.organizationId : undefined;

  const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string, 10) || 20));

  try {
    const result = await listAuditLogs({
      role,
      userOrgId,
      targetOrgId,
      action,
      targetType,
      startDate,
      endDate,
      page,
      limit
    });

    return res.status(200).json(result);
  } catch (error) {
    console.error('Error listing audit logs:', error);
    return res.status(500).json({ error: 'Failed to retrieve system audit logs.' });
  }
}
