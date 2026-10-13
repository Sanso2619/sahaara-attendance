import { Request, Response, NextFunction } from 'express';

export function requireRole(...allowedRoles: ('PLATFORM_ADMIN' | 'ORG_ADMIN' | 'TEACHER')[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthenticated user context.' });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        error: `Forbidden: User role '${req.user.role}' is not authorized to access this resource.`
      });
    }

    next();
  };
}
