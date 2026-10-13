import { Request, Response } from 'express';
import { z } from 'zod';
import { pool } from '../config/db';

export const createClassroomSchema = z.object({
  schoolId: z.string().uuid('Valid school ID required'),
  name: z.string().min(1, 'Classroom name is required'),
  gradeLevel: z.string().optional().or(z.literal('')),
  academicYear: z.string().optional().or(z.literal('')),
  teacherId: z.string().uuid().optional().nullable()
});

export const updateClassroomSchema = z.object({
  name: z.string().min(1).optional(),
  gradeLevel: z.string().optional().or(z.literal('')),
  academicYear: z.string().optional().or(z.literal('')),
  isActive: z.boolean().optional(),
  teacherId: z.string().uuid().optional().nullable()
});

export async function listClassroomsHandler(req: Request, res: Response) {
  const role = req.user?.role;
  let targetOrgId = req.user?.organizationId;

  if (role === 'PLATFORM_ADMIN') {
    if (typeof req.query.organizationId === 'string') {
      targetOrgId = req.query.organizationId;
    } else {
      targetOrgId = null;
    }
  }

  const schoolId = typeof req.query.schoolId === 'string' ? req.query.schoolId : '';
  const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
  const statusFilter = req.query.status as string; // 'active', 'inactive', 'all'

  try {
    let query = `
      SELECT c.id, c.name, c.grade_level as "gradeLevel", c.academic_year as "academicYear",
             c.is_active as "isActive", c.created_at as "createdAt",
             c.organization_id as "organizationId", o.name as "organizationName",
             c.school_id as "schoolId", s.name as "schoolName", s.code as "schoolCode",
             u.id as "teacherId", u.full_name as "teacherName", u.email as "teacherEmail",
             COUNT(DISTINCT e.student_id) as "studentCount"
      FROM classrooms c
      JOIN schools s ON s.id = c.school_id
      JOIN organizations o ON o.id = c.organization_id
      LEFT JOIN classroom_teachers ct ON ct.classroom_id = c.id
      LEFT JOIN users u ON u.id = ct.teacher_id
      LEFT JOIN enrollments e ON e.classroom_id = c.id AND e.is_active = TRUE
    `;
    const conditions: string[] = [];
    const values: any[] = [];

    if (targetOrgId) {
      values.push(targetOrgId);
      conditions.push(`c.organization_id = $${values.length}`);
    }

    if (schoolId) {
      values.push(schoolId);
      conditions.push(`c.school_id = $${values.length}`);
    }

    if (search) {
      values.push(`%${search}%`);
      conditions.push(`(c.name ILIKE $${values.length} OR s.name ILIKE $${values.length} OR u.full_name ILIKE $${values.length})`);
    }

    if (statusFilter === 'active') {
      conditions.push('c.is_active = TRUE');
    } else if (statusFilter === 'inactive') {
      conditions.push('c.is_active = FALSE');
    }

    if (conditions.length > 0) {
      query += ` WHERE ${conditions.join(' AND ')}`;
    }

    query += ` GROUP BY c.id, s.id, o.name, u.id ORDER BY s.name ASC, c.name ASC`;

    const result = await pool.query(query, values);
    return res.status(200).json({ classrooms: result.rows });
  } catch (err) {
    console.error('List classrooms error:', err);
    return res.status(500).json({ error: 'Failed to retrieve classrooms' });
  }
}

export async function getClassroomByIdHandler(req: Request, res: Response) {
  const { id } = req.params;
  const role = req.user?.role;
  const userOrgId = req.user?.organizationId;

  try {
    const result = await pool.query(
      `SELECT c.id, c.name, c.grade_level as "gradeLevel", c.academic_year as "academicYear",
              c.is_active as "isActive", c.created_at as "createdAt",
              c.organization_id as "organizationId", o.name as "organizationName",
              c.school_id as "schoolId", s.name as "schoolName", s.code as "schoolCode",
              u.id as "teacherId", u.full_name as "teacherName", u.email as "teacherEmail"
       FROM classrooms c
       JOIN schools s ON s.id = c.school_id
       JOIN organizations o ON o.id = c.organization_id
       LEFT JOIN classroom_teachers ct ON ct.classroom_id = c.id
       LEFT JOIN users u ON u.id = ct.teacher_id
       WHERE c.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Classroom not found' });
    }

    const classroom = result.rows[0];

    // Enforce tenant isolation
    if (role !== 'PLATFORM_ADMIN' && classroom.organizationId !== userOrgId) {
      return res.status(403).json({ error: 'Forbidden: You cannot access classrooms outside your organization.' });
    }

    return res.status(200).json({ classroom });
  } catch (err) {
    console.error('Get classroom error:', err);
    return res.status(500).json({ error: 'Failed to retrieve classroom' });
  }
}

export async function createClassroomHandler(req: Request, res: Response) {
  const role = req.user?.role;
  const userOrgId = req.user?.organizationId;
  const { schoolId, name, gradeLevel, academicYear, teacherId } = req.body;

  try {
    // 1. Verify school existence & tenant ownership
    const schoolRes = await pool.query('SELECT organization_id, is_active FROM schools WHERE id = $1', [schoolId]);
    if (schoolRes.rows.length === 0) {
      return res.status(404).json({ error: 'School not found' });
    }

    const targetOrgId = schoolRes.rows[0].organization_id;

    if (role !== 'PLATFORM_ADMIN' && targetOrgId !== userOrgId) {
      return res.status(403).json({ error: 'Tenant isolation violation: Target school belongs to another organization.' });
    }

    // 2. If teacherId is provided, verify teacher belongs to the same organization
    if (teacherId) {
      const teacherRes = await pool.query(
        "SELECT id FROM users WHERE id = $1 AND organization_id = $2 AND role = 'TEACHER'",
        [teacherId, targetOrgId]
      );
      if (teacherRes.rows.length === 0) {
        return res.status(400).json({ error: 'Assigned teacher does not exist in this organization or is not a Teacher.' });
      }
    }

    // 3. Create classroom
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const classInsert = await client.query(
        `INSERT INTO classrooms (organization_id, school_id, name, grade_level, academic_year, is_active)
         VALUES ($1, $2, $3, $4, $5, TRUE)
         RETURNING id, organization_id as "organizationId", school_id as "schoolId",
                   name, grade_level as "gradeLevel", academic_year as "academicYear",
                   is_active as "isActive", created_at as "createdAt"`,
        [targetOrgId, schoolId, name, gradeLevel || null, academicYear || null]
      );

      const newClassroom = classInsert.rows[0];

      // 4. Assign teacher if specified
      if (teacherId) {
        await client.query(
          `INSERT INTO classroom_teachers (organization_id, classroom_id, teacher_id)
           VALUES ($1, $2, $3)`,
          [targetOrgId, newClassroom.id, teacherId]
        );
      }

      await client.query('COMMIT');

      return res.status(201).json({
        message: 'Classroom created successfully',
        classroom: {
          ...newClassroom,
          teacherId: teacherId || null
        }
      });
    } catch (txErr) {
      await client.query('ROLLBACK');
      throw txErr;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Create classroom error:', err);
    return res.status(500).json({ error: 'Failed to create classroom' });
  }
}

export async function updateClassroomHandler(req: Request, res: Response) {
  const { id } = req.params;
  const role = req.user?.role;
  const userOrgId = req.user?.organizationId;
  const { name, gradeLevel, academicYear, isActive, teacherId } = req.body;

  try {
    // 1. Verify classroom exists and tenant ownership
    const classRes = await pool.query('SELECT organization_id FROM classrooms WHERE id = $1', [id]);
    if (classRes.rows.length === 0) {
      return res.status(404).json({ error: 'Classroom not found' });
    }

    const classOrgId = classRes.rows[0].organization_id;
    if (role !== 'PLATFORM_ADMIN' && classOrgId !== userOrgId) {
      return res.status(403).json({ error: 'Forbidden: You cannot modify classrooms outside your organization.' });
    }

    // 2. Validate teacher if supplied
    if (teacherId) {
      const teacherRes = await pool.query(
        "SELECT id FROM users WHERE id = $1 AND organization_id = $2 AND role = 'TEACHER'",
        [teacherId, classOrgId]
      );
      if (teacherRes.rows.length === 0) {
        return res.status(400).json({ error: 'Assigned teacher does not exist in this organization or is not a Teacher.' });
      }
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const updates: string[] = ['updated_at = CURRENT_TIMESTAMP'];
      const values: any[] = [id];

      if (name !== undefined) {
        values.push(name);
        updates.push(`name = $${values.length}`);
      }
      if (gradeLevel !== undefined) {
        values.push(gradeLevel || null);
        updates.push(`grade_level = $${values.length}`);
      }
      if (academicYear !== undefined) {
        values.push(academicYear || null);
        updates.push(`academic_year = $${values.length}`);
      }
      if (isActive !== undefined) {
        values.push(isActive);
        updates.push(`is_active = $${values.length}`);
      }

      const updateRes = await client.query(
        `UPDATE classrooms
         SET ${updates.join(', ')}
         WHERE id = $1
         RETURNING id, organization_id as "organizationId", school_id as "schoolId",
                   name, grade_level as "gradeLevel", academic_year as "academicYear",
                   is_active as "isActive", updated_at as "updatedAt"`,
        values
      );

      // Update teacher assignment if explicitly passed (including null to unassign)
      if (teacherId !== undefined) {
        await client.query('DELETE FROM classroom_teachers WHERE classroom_id = $1', [id]);
        if (teacherId) {
          await client.query(
            `INSERT INTO classroom_teachers (organization_id, classroom_id, teacher_id)
             VALUES ($1, $2, $3)`,
            [classOrgId, id, teacherId]
          );
        }
      }

      await client.query('COMMIT');

      return res.status(200).json({
        message: 'Classroom updated successfully',
        classroom: updateRes.rows[0]
      });
    } catch (txErr) {
      await client.query('ROLLBACK');
      throw txErr;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Update classroom error:', err);
    return res.status(500).json({ error: 'Failed to update classroom' });
  }
}

export async function deactivateClassroomHandler(req: Request, res: Response) {
  const { id } = req.params;
  const role = req.user?.role;
  const userOrgId = req.user?.organizationId;

  try {
    const existing = await pool.query('SELECT organization_id, is_active FROM classrooms WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Classroom not found' });
    }

    if (role !== 'PLATFORM_ADMIN' && existing.rows[0].organization_id !== userOrgId) {
      return res.status(403).json({ error: 'Forbidden: You cannot modify classrooms outside your organization.' });
    }

    const newStatus = !existing.rows[0].is_active;

    const result = await pool.query(
      `UPDATE classrooms
       SET is_active = $2, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING id, name, is_active as "isActive"`,
      [id, newStatus]
    );

    return res.status(200).json({
      message: newStatus ? 'Classroom reactivated successfully' : 'Classroom deactivated successfully',
      classroom: result.rows[0]
    });
  } catch (err) {
    console.error('Deactivate classroom error:', err);
    return res.status(500).json({ error: 'Failed to update classroom status' });
  }
}
