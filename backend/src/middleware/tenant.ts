import { Request, Response, NextFunction } from 'express';

export function tenantMiddleware(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthenticated user context.' });
  }

  // Platform Admins have global access and are not restricted to a single organization tenant
  if (req.user.role === 'PLATFORM_ADMIN') {
    return next();
  }

  if (!req.user.organizationId) {
    return res.status(403).json({ error: 'Tenant isolation error: User is missing an assigned organization.' });
  }

  // Check if header tries to explicitly override organization (e.g. cross-tenant attempt)
  const headerOrgId = req.headers['x-organization-id'];
  if (headerOrgId && headerOrgId !== req.user.organizationId) {
    return res.status(403).json({ error: 'Tenant access violation: Cross-organization header forbidden.' });
  }

  next();
}

/**
 * Validates that a requested target organization ID matches the user's tenant scope
 */
export function validateTenantOwnership(userOrgId: string | null, targetOrgId: string): boolean {
  if (userOrgId === null) return true; // Platform admin override
  return userOrgId === targetOrgId;
}
