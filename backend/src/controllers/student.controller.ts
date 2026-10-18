import { Request, Response } from 'express';
import { z } from 'zod';
import { pool } from '../config/db';
import { recordAuditEvent } from '../services/audit.service';
import { maskContact } from '../services/notification.service';

export const createStudentSchema = z.object({
  schoolId: z.string().uuid('Valid school ID required'),
  rollNumber: z.string().min(1, 'Student roll number or admission ID is required'),
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().default(''),
  dateOfBirth: z.string().optional().nullable(),
  gender: z.enum(['MALE', 'FEMALE', 'OTHER']).optional().nullable(),
  guardianName: z.string().optional().nullable(),
  guardianContact: z.string().optional().nullable(),
  guardianConsentStatus: z.enum(['GRANTED', 'WITHDRAWN', 'PENDING']).default('GRANTED'),
  classroomId: z.string().uuid().optional().nullable()
});

export const updateStudentSchema = z.object({
  schoolId: z.string().uuid().optional(),
  rollNumber: z.string().min(1).optional(),
  firstName: z.string().min(1).optional(),
  lastName: z.string().optional(),
  dateOfBirth: z.string().optional().nullable(),
  gender: z.enum(['MALE', 'FEMALE', 'OTHER']).optional().nullable(),
  guardianName: z.string().optional().nullable(),
  guardianContact: z.string().optional().nullable(),
  guardianConsentStatus: z.enum(['GRANTED', 'WITHDRAWN', 'PENDING']).optional(),
  isActive: z.boolean().optional()
});

export const enrollStudentSchema = z.object({
  classroomId: z.string().uuid('Valid classroom ID required')
});

export async function listStudentsHandler(req: Request, res: Response) {
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
  const classroomId = typeof req.query.classroomId === 'string' ? req.query.classroomId : '';
  const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
  const statusFilter = req.query.status as string; // 'active', 'inactive', 'all'

  try {
    let query = `
      SELECT s.id, s.roll_number as "rollNumber", s.first_name as "firstName", s.last_name as "lastName",
             s.date_of_birth as "dateOfBirth", s.gender, s.guardian_name as "guardianName",
             s.guardian_contact as "guardianContact", s.guardian_consent_status as "guardianConsentStatus",
             s.guardian_consent_updated_at as "guardianConsentUpdatedAt",
             s.is_active as "isActive", s.created_at as "createdAt",
             s.organization_id as "organizationId", o.name as "organizationName",
             s.school_id as "schoolId", sch.name as "schoolName", sch.code as "schoolCode",
             c.id as "classroomId", c.name as "classroomName", c.grade_level as "gradeLevel",
             e.enrolled_at as "enrolledAt"
      FROM students s
      JOIN organizations o ON o.id = s.organization_id
      LEFT JOIN schools sch ON sch.id = s.school_id
      LEFT JOIN enrollments e ON e.student_id = s.id AND e.is_active = TRUE
      LEFT JOIN classrooms c ON c.id = e.classroom_id
    `;
    const conditions: string[] = [];
    const values: any[] = [];

    if (targetOrgId) {
      values.push(targetOrgId);
      conditions.push(`s.organization_id = $${values.length}`);
    }

    if (schoolId) {
      values.push(schoolId);
      conditions.push(`s.school_id = $${values.length}`);
    }

    if (classroomId) {
      values.push(classroomId);
      conditions.push(`e.classroom_id = $${values.length}`);
    }

    if (search) {
      values.push(`%${search}%`);
      conditions.push(`(
        s.first_name ILIKE $${values.length} OR 
        s.last_name ILIKE $${values.length} OR 
        s.roll_number ILIKE $${values.length} OR 
        s.guardian_name ILIKE $${values.length}
      )`);
    }

    if (statusFilter === 'active') {
      conditions.push('s.is_active = TRUE');
    } else if (statusFilter === 'inactive') {
      conditions.push('s.is_active = FALSE');
    }

    if (conditions.length > 0) {
      query += ` WHERE ${conditions.join(' AND ')}`;
    }

    query += ` ORDER BY s.roll_number ASC, s.first_name ASC`;

    const result = await pool.query(query, values);
    const students = result.rows.map(s => ({
      ...s,
      guardianContact: role === 'TEACHER' && s.guardianContact ? maskContact(s.guardianContact) : s.guardianContact
    }));
    return res.status(200).json({ students });
  } catch (err) {
    console.error('List students error:', err);
    return res.status(500).json({ error: 'Failed to retrieve students' });
  }
}

export async function getStudentByIdHandler(req: Request, res: Response) {
  const { id } = req.params;
  const role = req.user?.role;
  const userOrgId = req.user?.organizationId;

  try {
    const studentRes = await pool.query(
      `SELECT s.id, s.roll_number as "rollNumber", s.first_name as "firstName", s.last_name as "lastName",
              s.date_of_birth as "dateOfBirth", s.gender, s.guardian_name as "guardianName",
              s.guardian_contact as "guardianContact", s.guardian_consent_status as "guardianConsentStatus",
              s.guardian_consent_updated_at as "guardianConsentUpdatedAt",
              s.is_active as "isActive", s.created_at as "createdAt",
              s.organization_id as "organizationId", o.name as "organizationName",
              s.school_id as "schoolId", sch.name as "schoolName", sch.code as "schoolCode",
              c.id as "classroomId", c.name as "classroomName", c.grade_level as "gradeLevel"
       FROM students s
       JOIN organizations o ON o.id = s.organization_id
       LEFT JOIN schools sch ON sch.id = s.school_id
       LEFT JOIN enrollments e ON e.student_id = s.id AND e.is_active = TRUE
       LEFT JOIN classrooms c ON c.id = e.classroom_id
       WHERE s.id = $1`,
      [id]
    );

    if (studentRes.rows.length === 0) {
      return res.status(404).json({ error: 'Student not found' });
    }

    const student = studentRes.rows[0];

    // Enforce tenant isolation
    if (role !== 'PLATFORM_ADMIN' && student.organizationId !== userOrgId) {
      return res.status(403).json({ error: 'Forbidden: You cannot access students outside your organization.' });
    }

    if (role === 'TEACHER' && student.guardianContact) {
      student.guardianContact = maskContact(student.guardianContact);
    }

    // Fetch enrollment history timeline
    const historyRes = await pool.query(
      `SELECT e.id, e.classroom_id as "classroomId", c.name as "classroomName", c.grade_level as "gradeLevel",
              e.enrolled_at as "enrolledAt", e.ended_at as "endedAt", e.is_active as "isActive",
              sch.name as "schoolName"
       FROM enrollments e
       JOIN classrooms c ON c.id = e.classroom_id
       JOIN schools sch ON sch.id = c.school_id
       WHERE e.student_id = $1
       ORDER BY e.enrolled_at DESC`,
      [id]
    );

    return res.status(200).json({
      student,
      enrollmentHistory: historyRes.rows
    });
  } catch (err) {
    console.error('Get student error:', err);
    return res.status(500).json({ error: 'Failed to retrieve student' });
  }
}

export async function createStudentHandler(req: Request, res: Response) {
  const role = req.user?.role;
  const userOrgId = req.user?.organizationId;
  const { schoolId, rollNumber, firstName, lastName, dateOfBirth, gender, guardianName, guardianContact, guardianConsentStatus, classroomId } = req.body;

  try {
    // 1. Verify school exists and belongs to user's organization
    const schoolRes = await pool.query('SELECT organization_id, is_active FROM schools WHERE id = $1', [schoolId]);
    if (schoolRes.rows.length === 0) {
      return res.status(404).json({ error: 'School not found' });
    }

    const targetOrgId = schoolRes.rows[0].organization_id;
    if (role !== 'PLATFORM_ADMIN' && targetOrgId !== userOrgId) {
      return res.status(403).json({ error: 'Tenant isolation violation: Target school belongs to another organization.' });
    }

    // 2. If classroomId provided, verify classroom belongs to this school & organization
    if (classroomId) {
      const classRes = await pool.query(
        'SELECT organization_id, school_id FROM classrooms WHERE id = $1',
        [classroomId]
      );
      if (classRes.rows.length === 0) {
        return res.status(404).json({ error: 'Classroom not found' });
      }
      if (classRes.rows[0].organization_id !== targetOrgId || classRes.rows[0].school_id !== schoolId) {
        return res.status(400).json({ error: 'Classroom does not belong to the selected school and organization.' });
      }
    }

    // 3. Verify rollNumber uniqueness within organization
    const rollCheck = await pool.query(
      'SELECT id FROM students WHERE organization_id = $1 AND roll_number = $2',
      [targetOrgId, rollNumber.trim()]
    );
    if (rollCheck.rows.length > 0) {
      return res.status(409).json({ error: `A student with roll/admission ID '${rollNumber}' already exists in this organization.` });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const insertRes = await client.query(
        `INSERT INTO students (
          organization_id, school_id, roll_number, first_name, last_name,
          date_of_birth, gender, guardian_name, guardian_contact, guardian_consent_status, is_active
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, TRUE)
        RETURNING id, organization_id as "organizationId", school_id as "schoolId",
                  roll_number as "rollNumber", first_name as "firstName", last_name as "lastName",
                  date_of_birth as "dateOfBirth", gender, guardian_name as "guardianName",
                  guardian_contact as "guardianContact", guardian_consent_status as "guardianConsentStatus",
                  guardian_consent_updated_at as "guardianConsentUpdatedAt",
                  is_active as "isActive", created_at as "createdAt"`,
        [
          targetOrgId,
          schoolId,
          rollNumber.trim(),
          firstName.trim(),
          lastName?.trim() || '',
          dateOfBirth || null,
          gender || null,
          guardianName?.trim() || null,
          guardianContact?.trim() || null,
          guardianConsentStatus || 'GRANTED'
        ]
      );

      const newStudent = insertRes.rows[0];

      // 4. Enroll in classroom if specified
      if (classroomId) {
        await client.query(
          `INSERT INTO enrollments (organization_id, classroom_id, student_id, enrolled_at, is_active)
           VALUES ($1, $2, $3, CURRENT_TIMESTAMP, TRUE)`,
          [targetOrgId, classroomId, newStudent.id]
        );
      }

      await client.query('COMMIT');

      await recordAuditEvent({
        organizationId: targetOrgId,
        actorUserId: req.user?.userId || null,
        actorRole: req.user?.role || 'SYSTEM',
        action: 'STUDENT_CREATE',
        targetType: 'STUDENT',
        targetId: newStudent.id,
        ipAddress: req.ip,
        metadata: {
          rollNumber: newStudent.rollNumber,
          firstName: newStudent.firstName,
          schoolId,
          classroomId: classroomId || null,
          guardianConsentStatus: newStudent.guardianConsentStatus
        }
      });

      return res.status(201).json({
        message: 'Student registered successfully',
        student: {
          ...newStudent,
          classroomId: classroomId || null
        }
      });
    } catch (txErr) {
      await client.query('ROLLBACK');
      throw txErr;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Create student error:', err);
    return res.status(500).json({ error: 'Failed to register student' });
  }
}

export async function updateStudentHandler(req: Request, res: Response) {
  const { id } = req.params;
  const role = req.user?.role;
  const userOrgId = req.user?.organizationId;
  const { schoolId, rollNumber, firstName, lastName, dateOfBirth, gender, guardianName, guardianContact, guardianConsentStatus, isActive } = req.body;

  try {
    const existing = await pool.query('SELECT organization_id, school_id FROM students WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Student not found' });
    }

    const studentOrgId = existing.rows[0].organization_id;
    if (role !== 'PLATFORM_ADMIN' && studentOrgId !== userOrgId) {
      return res.status(403).json({ error: 'Forbidden: You cannot modify students outside your organization.' });
    }

    if (schoolId) {
      const schoolCheck = await pool.query('SELECT organization_id FROM schools WHERE id = $1', [schoolId]);
      if (schoolCheck.rows.length === 0 || schoolCheck.rows[0].organization_id !== studentOrgId) {
        return res.status(400).json({ error: 'Target school does not belong to this organization.' });
      }
    }

    if (rollNumber) {
      const rollCheck = await pool.query(
        'SELECT id FROM students WHERE organization_id = $1 AND roll_number = $2 AND id != $3',
        [studentOrgId, rollNumber.trim(), id]
      );
      if (rollCheck.rows.length > 0) {
        return res.status(409).json({ error: `Roll number '${rollNumber}' is already used by another student in this organization.` });
      }
    }

    const updates: string[] = ['updated_at = CURRENT_TIMESTAMP'];
    const values: any[] = [id];

    if (schoolId !== undefined) {
      values.push(schoolId);
      updates.push(`school_id = $${values.length}`);
    }
    if (rollNumber !== undefined) {
      values.push(rollNumber.trim());
      updates.push(`roll_number = $${values.length}`);
    }
    if (firstName !== undefined) {
      values.push(firstName.trim());
      updates.push(`first_name = $${values.length}`);
    }
    if (lastName !== undefined) {
      values.push(lastName.trim());
      updates.push(`last_name = $${values.length}`);
    }
    if (dateOfBirth !== undefined) {
      values.push(dateOfBirth || null);
      updates.push(`date_of_birth = $${values.length}`);
    }
    if (gender !== undefined) {
      values.push(gender || null);
      updates.push(`gender = $${values.length}`);
    }
    if (guardianName !== undefined) {
      values.push(guardianName?.trim() || null);
      updates.push(`guardian_name = $${values.length}`);
    }
    if (guardianContact !== undefined) {
      values.push(guardianContact?.trim() || null);
      updates.push(`guardian_contact = $${values.length}`);
    }
    if (guardianConsentStatus !== undefined) {
      values.push(guardianConsentStatus);
      updates.push(`guardian_consent_status = $${values.length}`);
      updates.push(`guardian_consent_updated_at = CURRENT_TIMESTAMP`);
    }
    if (isActive !== undefined) {
      values.push(isActive);
      updates.push(`is_active = $${values.length}`);
    }

    const result = await pool.query(
      `UPDATE students
       SET ${updates.join(', ')}
       WHERE id = $1
       RETURNING id, organization_id as "organizationId", school_id as "schoolId",
                 roll_number as "rollNumber", first_name as "firstName", last_name as "lastName",
                 date_of_birth as "dateOfBirth", gender, guardian_name as "guardianName",
                 guardian_contact as "guardianContact", guardian_consent_status as "guardianConsentStatus",
                 guardian_consent_updated_at as "guardianConsentUpdatedAt",
                 is_active as "isActive", updated_at as "updatedAt"`,
      values
    );

    await recordAuditEvent({
      organizationId: studentOrgId,
      actorUserId: req.user?.userId || null,
      actorRole: req.user?.role || 'SYSTEM',
      action: 'STUDENT_UPDATE',
      targetType: 'STUDENT',
      targetId: id,
      ipAddress: req.ip,
      metadata: {
        updates: Object.keys(req.body)
      }
    });

    return res.status(200).json({
      message: 'Student record updated successfully',
      student: result.rows[0]
    });
  } catch (err) {
    console.error('Update student error:', err);
    return res.status(500).json({ error: 'Failed to update student record' });
  }
}

export async function deactivateStudentHandler(req: Request, res: Response) {
  const { id } = req.params;
  const role = req.user?.role;
  const userOrgId = req.user?.organizationId;

  try {
    const existing = await pool.query('SELECT organization_id, is_active FROM students WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Student not found' });
    }

    if (role !== 'PLATFORM_ADMIN' && existing.rows[0].organization_id !== userOrgId) {
      return res.status(403).json({ error: 'Forbidden: You cannot modify students outside your organization.' });
    }

    const newStatus = !existing.rows[0].is_active;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const updateRes = await client.query(
        `UPDATE students
         SET is_active = $2, updated_at = CURRENT_TIMESTAMP
         WHERE id = $1
         RETURNING id, roll_number as "rollNumber", first_name as "firstName", is_active as "isActive"`,
        [id, newStatus]
      );

      // If deactivating, end active classroom enrollment
      if (!newStatus) {
        await client.query(
          `UPDATE enrollments
           SET is_active = FALSE, ended_at = CURRENT_TIMESTAMP
           WHERE student_id = $1 AND is_active = TRUE`,
          [id]
        );
      }

      await client.query('COMMIT');

      await recordAuditEvent({
        organizationId: existing.rows[0].organization_id,
        actorUserId: req.user?.userId || null,
        actorRole: req.user?.role || 'SYSTEM',
        action: newStatus ? 'STUDENT_REACTIVATE' : 'STUDENT_DEACTIVATE',
        targetType: 'STUDENT',
        targetId: id,
        ipAddress: req.ip,
        metadata: { isActive: newStatus }
      });

      return res.status(200).json({
        message: newStatus ? 'Student reactivated successfully' : 'Student deactivated successfully',
        student: updateRes.rows[0]
      });
    } catch (txErr) {
      await client.query('ROLLBACK');
      throw txErr;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Deactivate student error:', err);
    return res.status(500).json({ error: 'Failed to update student status' });
  }
}

export async function enrollStudentHandler(req: Request, res: Response) {
  const { id: studentId } = req.params;
  const { classroomId } = req.body;
  const role = req.user?.role;
  const userOrgId = req.user?.organizationId;

  try {
    // 1. Verify student exists and tenant ownership
    const studentRes = await pool.query('SELECT organization_id, school_id, is_active FROM students WHERE id = $1', [studentId]);
    if (studentRes.rows.length === 0) {
      return res.status(404).json({ error: 'Student not found' });
    }

    const studentOrgId = studentRes.rows[0].organization_id;
    if (role !== 'PLATFORM_ADMIN' && studentOrgId !== userOrgId) {
      return res.status(403).json({ error: 'Tenant isolation violation: Student belongs to another organization.' });
    }

    // 2. Verify target classroom exists and belongs to same organization
    const classRes = await pool.query(
      'SELECT organization_id, school_id, name, is_active FROM classrooms WHERE id = $1',
      [classroomId]
    );
    if (classRes.rows.length === 0) {
      return res.status(404).json({ error: 'Classroom not found' });
    }

    if (classRes.rows[0].organization_id !== studentOrgId) {
      return res.status(403).json({ error: 'Tenant isolation violation: Target classroom belongs to another organization.' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // End previous active enrollment for student
      await client.query(
        `UPDATE enrollments
         SET is_active = FALSE, ended_at = CURRENT_TIMESTAMP
         WHERE student_id = $1 AND is_active = TRUE`,
        [studentId]
      );

      // Create new active enrollment
      const enrollRes = await client.query(
        `INSERT INTO enrollments (organization_id, classroom_id, student_id, enrolled_at, is_active)
         VALUES ($1, $2, $3, CURRENT_TIMESTAMP, TRUE)
         RETURNING id, classroom_id as "classroomId", student_id as "studentId", enrolled_at as "enrolledAt", is_active as "isActive"`,
        [studentOrgId, classroomId, studentId]
      );

      await client.query('COMMIT');

      await recordAuditEvent({
        organizationId: studentOrgId,
        actorUserId: req.user?.userId || null,
        actorRole: req.user?.role || 'SYSTEM',
        action: 'STUDENT_ENROLL',
        targetType: 'ENROLLMENT',
        targetId: enrollRes.rows[0].id,
        ipAddress: req.ip,
        metadata: {
          studentId,
          classroomId,
          classroomName: classRes.rows[0].name
        }
      });

      return res.status(200).json({
        message: `Student successfully enrolled in classroom '${classRes.rows[0].name}'`,
        enrollment: enrollRes.rows[0]
      });
    } catch (txErr) {
      await client.query('ROLLBACK');
      throw txErr;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Enroll student error:', err);
    return res.status(500).json({ error: 'Failed to update student classroom enrollment' });
  }
}

export async function getClassroomRosterHandler(req: Request, res: Response) {
  const { id: classroomId } = req.params;
  const role = req.user?.role;
  const userOrgId = req.user?.organizationId;

  try {
    const classRes = await pool.query(
      `SELECT c.id, c.name, c.grade_level as "gradeLevel", c.academic_year as "academicYear",
              c.organization_id as "organizationId", s.name as "schoolName", s.code as "schoolCode",
              u.full_name as "teacherName"
       FROM classrooms c
       JOIN schools s ON s.id = c.school_id
       LEFT JOIN classroom_teachers ct ON ct.classroom_id = c.id
       LEFT JOIN users u ON u.id = ct.teacher_id
       WHERE c.id = $1`,
      [classroomId]
    );

    if (classRes.rows.length === 0) {
      return res.status(404).json({ error: 'Classroom not found' });
    }

    const classroom = classRes.rows[0];

    if (role !== 'PLATFORM_ADMIN' && classroom.organizationId !== userOrgId) {
      return res.status(403).json({ error: 'Forbidden: You cannot access rosters outside your organization.' });
    }

    const studentsRes = await pool.query(
      `SELECT s.id, s.roll_number as "rollNumber", s.first_name as "firstName", s.last_name as "lastName",
              s.gender, s.date_of_birth as "dateOfBirth", s.guardian_name as "guardianName",
              s.guardian_contact as "guardianContact", s.guardian_consent_status as "guardianConsentStatus",
              s.is_active as "isActive",
              e.enrolled_at as "enrolledAt"
       FROM enrollments e
       JOIN students s ON s.id = e.student_id
       WHERE e.classroom_id = $1 AND e.is_active = TRUE
       ORDER BY s.roll_number ASC, s.first_name ASC`,
      [classroomId]
    );

    const roster = studentsRes.rows.map(s => ({
      ...s,
      guardianContact: role === 'TEACHER' && s.guardianContact ? maskContact(s.guardianContact) : s.guardianContact
    }));

    return res.status(200).json({
      classroom,
      roster
    });
  } catch (err) {
    console.error('Get classroom roster error:', err);
    return res.status(500).json({ error: 'Failed to retrieve classroom roster' });
  }
}
