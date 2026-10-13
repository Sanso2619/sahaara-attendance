import { Request, Response } from 'express';
import { pool } from '../config/db';

export async function listTeachersHandler(req: Request, res: Response) {
  const role = req.user?.role;
  let targetOrgId = req.user?.organizationId;

  if (role === 'PLATFORM_ADMIN' && typeof req.query.organizationId === 'string') {
    targetOrgId = req.query.organizationId;
  }

  if (!targetOrgId) {
    return res.status(200).json({ teachers: [] });
  }

  try {
    const result = await pool.query(
      `SELECT id, full_name as "fullName", email, is_active as "isActive"
       FROM users
       WHERE organization_id = $1 AND role = 'TEACHER' AND is_active = TRUE
       ORDER BY full_name ASC`,
      [targetOrgId]
    );

    return res.status(200).json({ teachers: result.rows });
  } catch (err) {
    console.error('List teachers error:', err);
    return res.status(500).json({ error: 'Failed to retrieve teachers' });
  }
}
