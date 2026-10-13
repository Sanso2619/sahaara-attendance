import { Request, Response } from 'express';
import { z } from 'zod';
import { pool } from '../config/db';

export const createSchoolSchema = z.object({
  name: z.string().min(2, 'School/Centre name must be at least 2 characters'),
  code: z.string().min(1, 'School code is required').toUpperCase(),
  address: z.string().optional().or(z.literal('')),
  organizationId: z.string().uuid().optional() // only for PLATFORM_ADMIN
});

export const updateSchoolSchema = z.object({
  name: z.string().min(2).optional(),
  code: z.string().min(1).toUpperCase().optional(),
  address: z.string().optional(),
  isActive: z.boolean().optional()
});

export async function listSchoolsHandler(req: Request, res: Response) {
  const role = req.user?.role;
  let targetOrgId = req.user?.organizationId;

  // Platform admin can specify ?organizationId=... to filter
  if (role === 'PLATFORM_ADMIN') {
    if (typeof req.query.organizationId === 'string') {
      targetOrgId = req.query.organizationId;
    } else {
      targetOrgId = null; // show all organizations
    }
  }

  const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
  const statusFilter = req.query.status as string; // 'active', 'inactive', 'all'

  try {
    let query = `
      SELECT s.id, s.name, s.code, s.address, s.is_active as "isActive",
             s.organization_id as "organizationId", o.name as "organizationName",
             s.created_at as "createdAt",
             COUNT(DISTINCT c.id) as "classroomCount"
      FROM schools s
      JOIN organizations o ON o.id = s.organization_id
      LEFT JOIN classrooms c ON c.school_id = s.id AND c.is_active = TRUE
    `;
    const conditions: string[] = [];
    const values: any[] = [];

    if (targetOrgId) {
      values.push(targetOrgId);
      conditions.push(`s.organization_id = $${values.length}`);
    }

    if (search) {
      values.push(`%${search}%`);
      conditions.push(`(s.name ILIKE $${values.length} OR s.code ILIKE $${values.length})`);
    }

    if (statusFilter === 'active') {
      conditions.push('s.is_active = TRUE');
    } else if (statusFilter === 'inactive') {
      conditions.push('s.is_active = FALSE');
    }

    if (conditions.length > 0) {
      query += ` WHERE ${conditions.join(' AND ')}`;
    }

    query += ` GROUP BY s.id, o.name ORDER BY s.name ASC`;

    const result = await pool.query(query, values);
    return res.status(200).json({ schools: result.rows });
  } catch (err) {
    console.error('List schools error:', err);
    return res.status(500).json({ error: 'Failed to retrieve schools' });
  }
}

export async function getSchoolByIdHandler(req: Request, res: Response) {
  const { id } = req.params;
  const role = req.user?.role;
  const userOrgId = req.user?.organizationId;

  try {
    const schoolRes = await pool.query(
      `SELECT s.id, s.name, s.code, s.address, s.is_active as "isActive",
              s.organization_id as "organizationId", o.name as "organizationName",
              s.created_at as "createdAt"
       FROM schools s
       JOIN organizations o ON o.id = s.organization_id
       WHERE s.id = $1`,
      [id]
    );

    if (schoolRes.rows.length === 0) {
      return res.status(404).json({ error: 'School not found' });
    }

    const school = schoolRes.rows[0];

    // Enforce tenant isolation
    if (role !== 'PLATFORM_ADMIN' && school.organizationId !== userOrgId) {
      return res.status(403).json({ error: 'Forbidden: You cannot access schools outside your organization.' });
    }

    // Fetch associated classrooms
    const classroomsRes = await pool.query(
      `SELECT c.id, c.name, c.grade_level as "gradeLevel", c.academic_year as "academicYear",
              c.is_active as "isActive",
              u.id as "teacherId", u.full_name as "teacherName"
       FROM classrooms c
       LEFT JOIN classroom_teachers ct ON ct.classroom_id = c.id
       LEFT JOIN users u ON u.id = ct.teacher_id
       WHERE c.school_id = $1
       ORDER BY c.name ASC`,
      [id]
    );

    return res.status(200).json({
      school,
      classrooms: classroomsRes.rows
    });
  } catch (err) {
    console.error('Get school error:', err);
    return res.status(500).json({ error: 'Failed to retrieve school' });
  }
}

export async function createSchoolHandler(req: Request, res: Response) {
  const role = req.user?.role;
  let targetOrgId = req.user?.organizationId;

  if (role === 'PLATFORM_ADMIN') {
    if (!req.body.organizationId) {
      return res.status(400).json({ error: 'Platform admin must supply an organizationId' });
    }
    targetOrgId = req.body.organizationId;
  }

  if (!targetOrgId) {
    return res.status(403).json({ error: 'Missing organization tenant context' });
  }

  const { name, code, address } = req.body;

  try {
    // Check code uniqueness inside organization
    const codeCheck = await pool.query(
      'SELECT id FROM schools WHERE organization_id = $1 AND code = $2',
      [targetOrgId, code]
    );
    if (codeCheck.rows.length > 0) {
      return res.status(409).json({ error: `A school with code '${code}' already exists in this organization.` });
    }

    const insertResult = await pool.query(
      `INSERT INTO schools (organization_id, name, code, address, is_active)
       VALUES ($1, $2, $3, $4, TRUE)
       RETURNING id, organization_id as "organizationId", name, code, address, is_active as "isActive", created_at as "createdAt"`,
      [targetOrgId, name, code, address || null]
    );

    return res.status(201).json({
      message: 'School created successfully',
      school: insertResult.rows[0]
    });
  } catch (err) {
    console.error('Create school error:', err);
    return res.status(500).json({ error: 'Failed to create school' });
  }
}

export async function updateSchoolHandler(req: Request, res: Response) {
  const { id } = req.params;
  const role = req.user?.role;
  const userOrgId = req.user?.organizationId;

  const { name, code, address, isActive } = req.body;

  try {
    // Check school existence and tenant ownership
    const existing = await pool.query('SELECT organization_id FROM schools WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'School not found' });
    }

    const schoolOrgId = existing.rows[0].organization_id;
    if (role !== 'PLATFORM_ADMIN' && schoolOrgId !== userOrgId) {
      return res.status(403).json({ error: 'Forbidden: You cannot modify schools outside your organization.' });
    }

    if (code) {
      const codeCheck = await pool.query(
        'SELECT id FROM schools WHERE organization_id = $1 AND code = $2 AND id != $3',
        [schoolOrgId, code, id]
      );
      if (codeCheck.rows.length > 0) {
        return res.status(409).json({ error: `School code '${code}' is already used by another school in this organization.` });
      }
    }

    const updates: string[] = ['updated_at = CURRENT_TIMESTAMP'];
    const values: any[] = [id];

    if (name !== undefined) {
      values.push(name);
      updates.push(`name = $${values.length}`);
    }
    if (code !== undefined) {
      values.push(code);
      updates.push(`code = $${values.length}`);
    }
    if (address !== undefined) {
      values.push(address);
      updates.push(`address = $${values.length}`);
    }
    if (isActive !== undefined) {
      values.push(isActive);
      updates.push(`is_active = $${values.length}`);
    }

    const result = await pool.query(
      `UPDATE schools
       SET ${updates.join(', ')}
       WHERE id = $1
       RETURNING id, organization_id as "organizationId", name, code, address, is_active as "isActive", updated_at as "updatedAt"`,
      values
    );

    return res.status(200).json({
      message: 'School updated successfully',
      school: result.rows[0]
    });
  } catch (err) {
    console.error('Update school error:', err);
    return res.status(500).json({ error: 'Failed to update school' });
  }
}

export async function deactivateSchoolHandler(req: Request, res: Response) {
  const { id } = req.params;
  const role = req.user?.role;
  const userOrgId = req.user?.organizationId;

  try {
    const existing = await pool.query('SELECT organization_id, is_active FROM schools WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'School not found' });
    }

    if (role !== 'PLATFORM_ADMIN' && existing.rows[0].organization_id !== userOrgId) {
      return res.status(403).json({ error: 'Forbidden: You cannot modify schools outside your organization.' });
    }

    const newStatus = !existing.rows[0].is_active;

    const result = await pool.query(
      `UPDATE schools
       SET is_active = $2, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING id, name, is_active as "isActive"`,
      [id, newStatus]
    );

    return res.status(200).json({
      message: newStatus ? 'School reactivated successfully' : 'School deactivated successfully',
      school: result.rows[0]
    });
  } catch (err) {
    console.error('Deactivate school error:', err);
    return res.status(500).json({ error: 'Failed to update school status' });
  }
}
