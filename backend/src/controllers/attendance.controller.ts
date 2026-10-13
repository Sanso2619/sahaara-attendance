import { Request, Response } from 'express';
import { z } from 'zod';
import { pool } from '../config/db';
import { processAttendanceFollowups } from '../services/notification.service';

export const saveAttendanceSchema = z.object({
  classroomId: z.string().uuid('Valid classroom ID required'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be formatted as YYYY-MM-DD'),
  notes: z.string().optional().nullable(),
  records: z.array(
    z.object({
      studentId: z.string().uuid('Valid student ID required'),
      status: z.enum(['PRESENT', 'ABSENT', 'LATE']),
      remarks: z.string().optional().nullable()
    })
  )
});

export const submitAttendanceSchema = z.object({
  classroomId: z.string().uuid('Valid classroom ID required'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be formatted as YYYY-MM-DD'),
  notes: z.string().optional().nullable(),
  records: z.array(
    z.object({
      studentId: z.string().uuid('Valid student ID required'),
      status: z.enum(['PRESENT', 'ABSENT', 'LATE']),
      remarks: z.string().optional().nullable()
    })
  ).min(1, 'At least one student record is required')
});

/**
 * 1. List classrooms accessible to the current user for attendance
 * - TEACHER: only assigned classrooms
 * - ORG_ADMIN: all active classrooms in their organization
 * - PLATFORM_ADMIN: all active classrooms (or filtered by org)
 */
export async function listAssignedClassroomsHandler(req: Request, res: Response) {
  const role = req.user?.role;
  const userId = req.user?.userId;
  let targetOrgId = req.user?.organizationId;

  if (role === 'PLATFORM_ADMIN' && typeof req.query.organizationId === 'string') {
    targetOrgId = req.query.organizationId;
  }

  try {
    let query = `
      SELECT c.id, c.name, c.grade_level as "gradeLevel", c.academic_year as "academicYear",
             c.organization_id as "organizationId", o.name as "organizationName",
             s.id as "schoolId", s.name as "schoolName", s.code as "schoolCode",
             COUNT(DISTINCT e.student_id) as "studentCount"
      FROM classrooms c
      JOIN schools s ON s.id = c.school_id
      JOIN organizations o ON o.id = c.organization_id
      LEFT JOIN enrollments e ON e.classroom_id = c.id AND e.is_active = TRUE
    `;
    const conditions: string[] = ['c.is_active = TRUE'];
    const values: any[] = [];

    if (role === 'TEACHER') {
      values.push(userId);
      conditions.push(`EXISTS (
        SELECT 1 FROM classroom_teachers ct 
        WHERE ct.classroom_id = c.id AND ct.teacher_id = $${values.length}
      )`);
      if (targetOrgId) {
        values.push(targetOrgId);
        conditions.push(`c.organization_id = $${values.length}`);
      }
    } else if (targetOrgId) {
      values.push(targetOrgId);
      conditions.push(`c.organization_id = $${values.length}`);
    }

    query += ` WHERE ${conditions.join(' AND ')}`;
    query += ` GROUP BY c.id, s.id, o.id ORDER BY s.name ASC, c.name ASC`;

    const result = await pool.query(query, values);
    return res.status(200).json({ classrooms: result.rows });
  } catch (err) {
    console.error('List assigned classrooms error:', err);
    return res.status(500).json({ error: 'Failed to retrieve assigned classrooms' });
  }
}

/**
 * 2. Load attendance session and roster for a classroom and date
 */
export async function getClassroomAttendanceSessionHandler(req: Request, res: Response) {
  const { classroomId, date } = req.query;
  const role = req.user?.role;
  const userId = req.user?.userId;
  const userOrgId = req.user?.organizationId;

  if (typeof classroomId !== 'string' || typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: 'classroomId (UUID) and date (YYYY-MM-DD) are required query parameters' });
  }

  try {
    // 1. Verify classroom existence and ownership
    const classRes = await pool.query(
      `SELECT c.id, c.name, c.grade_level as "gradeLevel", c.academic_year as "academicYear",
              c.organization_id as "organizationId", c.is_active as "isActive",
              s.id as "schoolId", s.name as "schoolName", s.code as "schoolCode"
       FROM classrooms c
       JOIN schools s ON s.id = c.school_id
       WHERE c.id = $1`,
      [classroomId]
    );

    if (classRes.rows.length === 0) {
      return res.status(404).json({ error: 'Classroom not found' });
    }

    const classroom = classRes.rows[0];

    // Authorization checks
    if (role !== 'PLATFORM_ADMIN' && classroom.organizationId !== userOrgId) {
      return res.status(403).json({ error: 'Forbidden: You cannot access classrooms outside your organization.' });
    }

    if (role === 'TEACHER') {
      const teacherCheck = await pool.query(
        `SELECT 1 FROM classroom_teachers WHERE classroom_id = $1 AND teacher_id = $2`,
        [classroomId, userId]
      );
      if (teacherCheck.rows.length === 0) {
        return res.status(403).json({ error: 'Forbidden: You are not assigned to take attendance for this classroom.' });
      }
    }

    // 2. Load active student roster
    const rosterRes = await pool.query(
      `SELECT s.id, s.roll_number as "rollNumber", s.first_name as "firstName", s.last_name as "lastName",
              s.gender, s.date_of_birth as "dateOfBirth", s.guardian_name as "guardianName",
              s.guardian_contact as "guardianContact"
       FROM enrollments e
       JOIN students s ON s.id = e.student_id
       WHERE e.classroom_id = $1 AND e.is_active = TRUE AND s.is_active = TRUE
       ORDER BY s.roll_number ASC, s.first_name ASC`,
      [classroomId]
    );

    // 3. Load existing session for this date
    const sessionRes = await pool.query(
      `SELECT sess.id, sess.status, sess.date, sess.notes, sess.created_at as "createdAt",
              sess.updated_at as "updatedAt", sess.submitted_at as "submittedAt",
              sess.marked_by_user_id as "markedByUserId", u.full_name as "markedByName",
              sub.full_name as "submittedByName"
       FROM attendance_sessions sess
       LEFT JOIN users u ON u.id = sess.marked_by_user_id
       LEFT JOIN users sub ON sub.id = sess.submitted_by_user_id
       WHERE sess.classroom_id = $1 AND sess.date = $2`,
      [classroomId, date]
    );

    let session = sessionRes.rows.length > 0 ? sessionRes.rows[0] : null;
    let recordsMap: Record<string, { status: string; remarks?: string; updatedAt?: string }> = {};

    if (session) {
      const recordsRes = await pool.query(
        `SELECT student_id as "studentId", status, remarks, updated_at as "updatedAt"
         FROM attendance_records
         WHERE session_id = $1`,
        [session.id]
      );
      for (const rec of recordsRes.rows) {
        recordsMap[rec.studentId] = {
          status: rec.status,
          remarks: rec.remarks || '',
          updatedAt: rec.updatedAt
        };
      }
    }

    const students = rosterRes.rows.map(st => ({
      ...st,
      attendance: recordsMap[st.id] || null
    }));

    return res.status(200).json({
      classroom,
      date,
      session,
      students
    });
  } catch (err) {
    console.error('Get classroom attendance session error:', err);
    return res.status(500).json({ error: 'Failed to load classroom attendance session' });
  }
}

/**
 * 3. Save progress (Draft) while session is OPEN
 */
export async function saveAttendanceDraftHandler(req: Request, res: Response) {
  const { classroomId, date, notes, records } = req.body;
  const role = req.user?.role;
  const userId = req.user?.userId;
  const userOrgId = req.user?.organizationId;

  const client = await pool.connect();
  try {
    // 1. Verify classroom
    const classRes = await client.query(
      `SELECT id, organization_id as "organizationId", is_active as "isActive"
       FROM classrooms WHERE id = $1`,
      [classroomId]
    );

    if (classRes.rows.length === 0) {
      return res.status(404).json({ error: 'Classroom not found' });
    }

    const classroom = classRes.rows[0];
    const targetOrgId = classroom.organizationId;

    if (role !== 'PLATFORM_ADMIN' && targetOrgId !== userOrgId) {
      return res.status(403).json({ error: 'Forbidden: Access denied to classroom outside your organization.' });
    }

    if (role === 'TEACHER') {
      const teacherCheck = await client.query(
        `SELECT 1 FROM classroom_teachers WHERE classroom_id = $1 AND teacher_id = $2`,
        [classroomId, userId]
      );
      if (teacherCheck.rows.length === 0) {
        return res.status(403).json({ error: 'Forbidden: You are not assigned to this classroom.' });
      }
    }

    await client.query('BEGIN');

    // 2. Check if session already exists
    const existingSessionRes = await client.query(
      `SELECT id, status FROM attendance_sessions WHERE classroom_id = $1 AND date = $2 FOR UPDATE`,
      [classroomId, date]
    );

    if (existingSessionRes.rows.length > 0 && existingSessionRes.rows[0].status === 'SUBMITTED') {
      await client.query('ROLLBACK');
      return res.status(409).json({
        error: 'Submitted session protection: This attendance register has already been finalized and submitted. It cannot be overwritten.'
      });
    }

    let sessionId: string;
    if (existingSessionRes.rows.length === 0) {
      const newSessionRes = await client.query(
        `INSERT INTO attendance_sessions (organization_id, classroom_id, date, marked_by_user_id, notes, status)
         VALUES ($1, $2, $3, $4, $5, 'OPEN')
         RETURNING id, status`,
        [targetOrgId, classroomId, date, userId, notes || null]
      );
      sessionId = newSessionRes.rows[0].id;
    } else {
      sessionId = existingSessionRes.rows[0].id;
      await client.query(
        `UPDATE attendance_sessions 
         SET notes = $1, updated_at = CURRENT_TIMESTAMP, marked_by_user_id = $2
         WHERE id = $3`,
        [notes || null, userId, sessionId]
      );
    }

    // 3. Validate enrolled students
    if (records && records.length > 0) {
      const enrolledRes = await client.query(
        `SELECT student_id as "studentId" 
         FROM enrollments 
         WHERE classroom_id = $1 AND is_active = TRUE`,
        [classroomId]
      );
      const enrolledSet = new Set(enrolledRes.rows.map(r => r.studentId));

      for (const rec of records) {
        if (!enrolledSet.has(rec.studentId)) {
          await client.query('ROLLBACK');
          return res.status(400).json({
            error: `Validation error: Student '${rec.studentId}' is not actively enrolled in this classroom.`
          });
        }

        await client.query(
          `INSERT INTO attendance_records (organization_id, session_id, student_id, status, remarks, updated_at)
           VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
           ON CONFLICT (session_id, student_id)
           DO UPDATE SET status = EXCLUDED.status, remarks = EXCLUDED.remarks, updated_at = CURRENT_TIMESTAMP`,
          [targetOrgId, sessionId, rec.studentId, rec.status, rec.remarks || null]
        );
      }
    }

    await client.query('COMMIT');
    return res.status(200).json({
      message: 'Attendance progress saved as draft.',
      session: {
        id: sessionId,
        classroomId,
        date,
        status: 'OPEN'
      },
      recordsSaved: records?.length || 0
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Save attendance draft error:', err);
    return res.status(500).json({ error: 'Failed to save attendance progress' });
  } finally {
    client.release();
  }
}

/**
 * 4. Submit and finalize attendance register
 */
export async function submitAttendanceHandler(req: Request, res: Response) {
  const { classroomId, date, notes, records } = req.body;
  const role = req.user?.role;
  const userId = req.user?.userId;
  const userOrgId = req.user?.organizationId;

  const client = await pool.connect();
  try {
    // 1. Verify classroom
    const classRes = await client.query(
      `SELECT id, organization_id as "organizationId", is_active as "isActive"
       FROM classrooms WHERE id = $1`,
      [classroomId]
    );

    if (classRes.rows.length === 0) {
      return res.status(404).json({ error: 'Classroom not found' });
    }

    const classroom = classRes.rows[0];
    const targetOrgId = classroom.organizationId;

    if (role !== 'PLATFORM_ADMIN' && targetOrgId !== userOrgId) {
      return res.status(403).json({ error: 'Forbidden: Access denied to classroom outside your organization.' });
    }

    if (role === 'TEACHER') {
      const teacherCheck = await client.query(
        `SELECT 1 FROM classroom_teachers WHERE classroom_id = $1 AND teacher_id = $2`,
        [classroomId, userId]
      );
      if (teacherCheck.rows.length === 0) {
        return res.status(403).json({ error: 'Forbidden: You are not assigned to this classroom.' });
      }
    }

    // 2. Validate complete submission (no unmarked students allowed)
    const enrolledRes = await client.query(
      `SELECT s.id, s.first_name, s.last_name, s.roll_number
       FROM enrollments e
       JOIN students s ON s.id = e.student_id
       WHERE e.classroom_id = $1 AND e.is_active = TRUE AND s.is_active = TRUE`,
      [classroomId]
    );

    const enrolledStudents = enrolledRes.rows;
    if (enrolledStudents.length === 0) {
      return res.status(400).json({
        error: 'Cannot submit attendance for an empty classroom with no active enrolled students.'
      });
    }

    const submittedStudentIds = new Set(records.map((r: any) => r.studentId));
    const missingStudents = enrolledStudents.filter(st => !submittedStudentIds.has(st.id));

    if (missingStudents.length > 0) {
      return res.status(400).json({
        error: `Incomplete submission: ${missingStudents.length} student(s) remain unmarked. Every enrolled student must be marked PRESENT, ABSENT, or LATE before finalizing.`,
        missingStudentIds: missingStudents.map(m => m.id)
      });
    }

    await client.query('BEGIN');

    // 3. Lock session row and check submitted protection
    const existingSessionRes = await client.query(
      `SELECT id, status FROM attendance_sessions WHERE classroom_id = $1 AND date = $2 FOR UPDATE`,
      [classroomId, date]
    );

    if (existingSessionRes.rows.length > 0 && existingSessionRes.rows[0].status === 'SUBMITTED') {
      await client.query('ROLLBACK');
      return res.status(409).json({
        error: 'Submitted register protection: Attendance for this date has already been submitted and finalized.'
      });
    }

    let sessionId: string;
    if (existingSessionRes.rows.length === 0) {
      const newSessionRes = await client.query(
        `INSERT INTO attendance_sessions (organization_id, classroom_id, date, marked_by_user_id, submitted_by_user_id, submitted_at, notes, status)
         VALUES ($1, $2, $3, $4, $4, CURRENT_TIMESTAMP, $5, 'SUBMITTED')
         RETURNING id, status, submitted_at as "submittedAt"`,
        [targetOrgId, classroomId, date, userId, notes || null]
      );
      sessionId = newSessionRes.rows[0].id;
    } else {
      sessionId = existingSessionRes.rows[0].id;
      await client.query(
        `UPDATE attendance_sessions 
         SET status = 'SUBMITTED', submitted_at = CURRENT_TIMESTAMP, submitted_by_user_id = $1,
             notes = $2, updated_at = CURRENT_TIMESTAMP, marked_by_user_id = $1
         WHERE id = $3`,
        [userId, notes || null, sessionId]
      );
    }

    // 4. Save all records
    for (const rec of records) {
      await client.query(
        `INSERT INTO attendance_records (organization_id, session_id, student_id, status, remarks, updated_at)
         VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
         ON CONFLICT (session_id, student_id)
         DO UPDATE SET status = EXCLUDED.status, remarks = EXCLUDED.remarks, updated_at = CURRENT_TIMESTAMP`,
        [targetOrgId, sessionId, rec.studentId, rec.status, rec.remarks || null]
      );
    }

    await client.query('COMMIT');

    // 5. Trigger automated guardian notifications (safe follow-up processor)
    let notifications = { totalTriggered: 0, sent: 0, failed: 0, skipped: 0 };
    try {
      notifications = await processAttendanceFollowups({
        sessionId,
        organizationId: targetOrgId,
        classroomId,
        date,
        triggeredByUserId: userId!,
        records
      });
    } catch (notifErr) {
      console.error('Failed to trigger attendance follow-up notifications:', notifErr);
    }

    return res.status(200).json({
      message: 'Attendance register submitted and finalized successfully.',
      session: {
        id: sessionId,
        classroomId,
        date,
        status: 'SUBMITTED'
      },
      recordsCount: records.length,
      notifications
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Submit attendance error:', err);
    return res.status(500).json({ error: 'Failed to submit attendance register' });
  } finally {
    client.release();
  }
}

/**
 * 5. Administrator Overview / Summaries
 */
export async function getAttendanceOverviewHandler(req: Request, res: Response) {
  const role = req.user?.role;
  let targetOrgId = req.user?.organizationId;
  const date = typeof req.query.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.date)
    ? req.query.date
    : new Date().toISOString().split('T')[0];

  if (role === 'PLATFORM_ADMIN' && typeof req.query.organizationId === 'string') {
    targetOrgId = req.query.organizationId;
  }

  const schoolId = typeof req.query.schoolId === 'string' ? req.query.schoolId : '';
  const classroomId = typeof req.query.classroomId === 'string' ? req.query.classroomId : '';

  try {
    let query = `
      SELECT 
        c.id as "classroomId",
        c.name as "classroomName",
        c.grade_level as "gradeLevel",
        c.academic_year as "academicYear",
        s.id as "schoolId",
        s.name as "schoolName",
        s.code as "schoolCode",
        o.id as "organizationId",
        o.name as "organizationName",
        sess.id as "sessionId",
        COALESCE(sess.status, 'NOT_STARTED') as "sessionStatus",
        sess.submitted_at as "submittedAt",
        sess.notes,
        marker.full_name as "markedByName",
        sub.full_name as "submittedByName",
        COUNT(DISTINCT e.student_id) as "totalStudents",
        COUNT(DISTINCT CASE WHEN ar.status = 'PRESENT' THEN ar.student_id END) as "presentCount",
        COUNT(DISTINCT CASE WHEN ar.status = 'LATE' THEN ar.student_id END) as "lateCount",
        COUNT(DISTINCT CASE WHEN ar.status = 'ABSENT' THEN ar.student_id END) as "absentCount"
      FROM classrooms c
      JOIN schools s ON s.id = c.school_id
      JOIN organizations o ON o.id = c.organization_id
      LEFT JOIN enrollments e ON e.classroom_id = c.id AND e.is_active = TRUE
      LEFT JOIN attendance_sessions sess ON sess.classroom_id = c.id AND sess.date = $1
      LEFT JOIN users marker ON marker.id = sess.marked_by_user_id
      LEFT JOIN users sub ON sub.id = sess.submitted_by_user_id
      LEFT JOIN attendance_records ar ON ar.session_id = sess.id
    `;

    const conditions: string[] = ['c.is_active = TRUE'];
    const values: any[] = [date];

    if (targetOrgId) {
      values.push(targetOrgId);
      conditions.push(`c.organization_id = $${values.length}`);
    }

    if (schoolId) {
      values.push(schoolId);
      conditions.push(`s.id = $${values.length}`);
    }

    if (classroomId) {
      values.push(classroomId);
      conditions.push(`c.id = $${values.length}`);
    }

    query += ` WHERE ${conditions.join(' AND ')}`;
    query += ` GROUP BY c.id, s.id, o.id, sess.id, sess.status, sess.submitted_at, sess.notes, marker.full_name, sub.full_name`;
    query += ` ORDER BY s.name ASC, c.name ASC`;

    const result = await pool.query(query, values);

    let totalStudentsSum = 0;
    let presentSum = 0;
    let lateSum = 0;
    let absentSum = 0;
    let submittedCount = 0;
    let openCount = 0;
    let notStartedCount = 0;

    const classrooms = result.rows.map(row => {
      const total = parseInt(row.totalStudents, 10) || 0;
      const present = parseInt(row.presentCount, 10) || 0;
      const late = parseInt(row.lateCount, 10) || 0;
      const absent = parseInt(row.absentCount, 10) || 0;
      const marked = present + late + absent;
      const unmarked = Math.max(0, total - marked);

      // Percentage formula: (present + late) / total students * 100
      const attendancePercentage = total > 0
        ? Math.round(((present + late) / total) * 1000) / 10
        : 0;

      totalStudentsSum += total;
      presentSum += present;
      lateSum += late;
      absentSum += absent;

      if (row.sessionStatus === 'SUBMITTED') submittedCount++;
      else if (row.sessionStatus === 'OPEN') openCount++;
      else notStartedCount++;

      return {
        ...row,
        totalStudents: total,
        presentCount: present,
        lateCount: late,
        absentCount: absent,
        unmarkedCount: unmarked,
        attendancePercentage
      };
    });

    const overallPercentage = totalStudentsSum > 0
      ? Math.round(((presentSum + lateSum) / totalStudentsSum) * 1000) / 10
      : 0;

    return res.status(200).json({
      date,
      summary: {
        totalClassrooms: classrooms.length,
        submittedCount,
        openCount,
        notStartedCount,
        totalStudents: totalStudentsSum,
        totalPresent: presentSum,
        totalLate: lateSum,
        totalAbsent: absentSum,
        overallPercentage
      },
      classrooms
    });
  } catch (err) {
    console.error('Get attendance overview error:', err);
    return res.status(500).json({ error: 'Failed to retrieve attendance overview' });
  }
}

/**
 * 6. Student Attendance History
 */
export async function getStudentAttendanceHistoryHandler(req: Request, res: Response) {
  const { studentId } = req.params;
  const role = req.user?.role;
  const userOrgId = req.user?.organizationId;

  try {
    // 1. Fetch student
    const stuRes = await pool.query(
      `SELECT s.id, s.roll_number as "rollNumber", s.first_name as "firstName", s.last_name as "lastName",
              s.gender, s.date_of_birth as "dateOfBirth", s.organization_id as "organizationId",
              sch.name as "schoolName", sch.code as "schoolCode",
              c.id as "classroomId", c.name as "classroomName"
       FROM students s
       LEFT JOIN schools sch ON sch.id = s.school_id
       LEFT JOIN enrollments e ON e.student_id = s.id AND e.is_active = TRUE
       LEFT JOIN classrooms c ON c.id = e.classroom_id
       WHERE s.id = $1`,
      [studentId]
    );

    if (stuRes.rows.length === 0) {
      return res.status(404).json({ error: 'Student not found' });
    }

    const student = stuRes.rows[0];

    if (role !== 'PLATFORM_ADMIN' && student.organizationId !== userOrgId) {
      return res.status(403).json({ error: 'Forbidden: Access denied to student outside your organization.' });
    }

    // 2. Fetch history records with optional date range
    const startDate = typeof req.query.startDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.startDate)
      ? req.query.startDate
      : null;
    const endDate = typeof req.query.endDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.endDate)
      ? req.query.endDate
      : null;

    let historyQuery = `
      SELECT ar.id, ar.status, ar.remarks, ar.created_at as "markedAt",
             TO_CHAR(sess.date, 'YYYY-MM-DD') as "date", 
             sess.status as "sessionStatus",
             c.name as "classroomName",
             sch.name as "schoolName",
             u.full_name as "markedByName"
      FROM attendance_records ar
      JOIN attendance_sessions sess ON sess.id = ar.session_id
      JOIN classrooms c ON c.id = sess.classroom_id
      JOIN schools sch ON sch.id = c.school_id
      LEFT JOIN users u ON u.id = sess.marked_by_user_id
      WHERE ar.student_id = $1
    `;
    const historyValues: any[] = [studentId];

    if (startDate) {
      historyValues.push(startDate);
      historyQuery += ` AND sess.date >= $${historyValues.length}`;
    }
    if (endDate) {
      historyValues.push(endDate);
      historyQuery += ` AND sess.date <= $${historyValues.length}`;
    }

    historyQuery += ` ORDER BY sess.date DESC LIMIT 100`;

    const historyRes = await pool.query(historyQuery, historyValues);

    const records = historyRes.rows;
    let presentCount = 0;
    let lateCount = 0;
    let absentCount = 0;

    for (const r of records) {
      if (r.status === 'PRESENT') presentCount++;
      else if (r.status === 'LATE') lateCount++;
      else if (r.status === 'ABSENT') absentCount++;
    }

    const totalDays = records.length;
    const attendancePercentage = totalDays > 0
      ? Math.round(((presentCount + lateCount) / totalDays) * 1000) / 10
      : 0;

    return res.status(200).json({
      student,
      stats: {
        totalDays,
        presentCount,
        lateCount,
        absentCount,
        attendancePercentage
      },
      history: records
    });
  } catch (err) {
    console.error('Get student attendance history error:', err);
    return res.status(500).json({ error: 'Failed to retrieve student attendance history' });
  }
}
