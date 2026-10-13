import { Request, Response } from 'express';
import { pool } from '../config/db';

/**
 * Helper to safely sanitize fields against CSV Formula Injection (CWE-1236)
 * and properly quote per RFC 4180
 */
export function sanitizeCsvField(val: any): string {
  if (val === null || val === undefined) return '';
  let str = String(val).trim();

  // Prevent formula injection: prefix with single quote if starting with =, +, -, @, |, \t, \r
  if (/^[=+@|\-\t\r]/.test(str)) {
    str = `'${str}`;
  }

  // Quote if contains commas, double quotes, or newlines
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    str = `"${str.replace(/"/g, '""')}"`;
  }

  return str;
}

/**
 * 1. Organization Attendance Dashboard & Analytics
 * Aggregates attendance statistics, daily trends, school comparison, and classroom summaries over a date range.
 */
export async function getDashboardAnalyticsHandler(req: Request, res: Response) {
  const role = req.user?.role;
  let targetOrgId = req.user?.organizationId;

  if (role === 'PLATFORM_ADMIN' && typeof req.query.organizationId === 'string') {
    targetOrgId = req.query.organizationId;
  }

  // Date range (defaults to last 30 days up to today)
  const today = new Date().toISOString().split('T')[0];
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  const startDate = typeof req.query.startDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.startDate)
    ? req.query.startDate
    : thirtyDaysAgo;

  const endDate = typeof req.query.endDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.endDate)
    ? req.query.endDate
    : today;

  const schoolId = typeof req.query.schoolId === 'string' ? req.query.schoolId : '';
  const classroomId = typeof req.query.classroomId === 'string' ? req.query.classroomId : '';

  try {
    // A. Total Active Students in filtered scope
    let studentCountQuery = `
      SELECT COUNT(DISTINCT s.id) as "totalActiveStudents"
      FROM students s
      JOIN classrooms c ON c.id = s.school_id OR EXISTS (
        SELECT 1 FROM enrollments e WHERE e.student_id = s.id AND e.is_active = TRUE
      )
      WHERE s.is_active = TRUE
    `;
    const studentCountConditions: string[] = ['s.is_active = TRUE'];
    const studentCountValues: any[] = [];

    if (targetOrgId) {
      studentCountValues.push(targetOrgId);
      studentCountConditions.push(`s.organization_id = $${studentCountValues.length}`);
    }
    if (schoolId) {
      studentCountValues.push(schoolId);
      studentCountConditions.push(`s.school_id = $${studentCountValues.length}`);
    }
    if (classroomId) {
      studentCountValues.push(classroomId);
      studentCountConditions.push(`EXISTS (
        SELECT 1 FROM enrollments e WHERE e.student_id = s.id AND e.classroom_id = $${studentCountValues.length} AND e.is_active = TRUE
      )`);
    }

    const studentRes = await pool.query(
      `SELECT COUNT(DISTINCT s.id) as "totalActiveStudents"
       FROM students s
       WHERE ${studentCountConditions.join(' AND ')}`,
      studentCountValues
    );
    const totalActiveStudents = parseInt(studentRes.rows[0]?.totalActiveStudents, 10) || 0;

    // B. Overall Session & Record Counts
    let baseWhere = `sess.date >= $1 AND sess.date <= $2`;
    const baseValues: any[] = [startDate, endDate];

    if (targetOrgId) {
      baseValues.push(targetOrgId);
      baseWhere += ` AND sess.organization_id = $${baseValues.length}`;
    }
    if (schoolId) {
      baseValues.push(schoolId);
      baseWhere += ` AND c.school_id = $${baseValues.length}`;
    }
    if (classroomId) {
      baseValues.push(classroomId);
      baseWhere += ` AND sess.classroom_id = $${baseValues.length}`;
    }

    const overallMetricsRes = await pool.query(
      `SELECT 
         COUNT(DISTINCT sess.id) as "totalSessions",
         COUNT(DISTINCT CASE WHEN sess.status = 'SUBMITTED' THEN sess.id END) as "submittedSessions",
         COUNT(DISTINCT CASE WHEN sess.status = 'OPEN' THEN sess.id END) as "openSessions",
         COUNT(DISTINCT CASE WHEN ar.status = 'PRESENT' THEN ar.id END) as "presentCount",
         COUNT(DISTINCT CASE WHEN ar.status = 'LATE' THEN ar.id END) as "lateCount",
         COUNT(DISTINCT CASE WHEN ar.status = 'ABSENT' THEN ar.id END) as "absentCount"
       FROM attendance_sessions sess
       JOIN classrooms c ON c.id = sess.classroom_id
       LEFT JOIN attendance_records ar ON ar.session_id = sess.id
       WHERE ${baseWhere}`,
      baseValues
    );

    const m = overallMetricsRes.rows[0];
    const totalSessions = parseInt(m.totalSessions, 10) || 0;
    const submittedSessions = parseInt(m.submittedSessions, 10) || 0;
    const openSessions = parseInt(m.openSessions, 10) || 0;
    const presentCount = parseInt(m.presentCount, 10) || 0;
    const lateCount = parseInt(m.lateCount, 10) || 0;
    const absentCount = parseInt(m.absentCount, 10) || 0;
    const totalMarkedRecords = presentCount + lateCount + absentCount;

    // Formula: (present + late) / total marked attendance records * 100
    const overallPercentage = totalMarkedRecords > 0
      ? Math.round(((presentCount + lateCount) / totalMarkedRecords) * 1000) / 10
      : 0;

    // C. Daily Attendance Trends
    const trendsRes = await pool.query(
      `SELECT 
         TO_CHAR(sess.date, 'YYYY-MM-DD') as "date",
         COUNT(DISTINCT sess.id) as "totalSessions",
         COUNT(DISTINCT CASE WHEN sess.status = 'SUBMITTED' THEN sess.id END) as "submittedSessions",
         COUNT(DISTINCT CASE WHEN sess.status = 'OPEN' THEN sess.id END) as "openSessions",
         COUNT(DISTINCT CASE WHEN ar.status = 'PRESENT' THEN ar.id END) as "presentCount",
         COUNT(DISTINCT CASE WHEN ar.status = 'LATE' THEN ar.id END) as "lateCount",
         COUNT(DISTINCT CASE WHEN ar.status = 'ABSENT' THEN ar.id END) as "absentCount"
       FROM attendance_sessions sess
       JOIN classrooms c ON c.id = sess.classroom_id
       LEFT JOIN attendance_records ar ON ar.session_id = sess.id
       WHERE ${baseWhere}
       GROUP BY TO_CHAR(sess.date, 'YYYY-MM-DD')
       ORDER BY "date" ASC`,
      baseValues
    );

    const dailyTrends = trendsRes.rows.map(row => {
      const p = parseInt(row.presentCount, 10) || 0;
      const l = parseInt(row.lateCount, 10) || 0;
      const a = parseInt(row.absentCount, 10) || 0;
      const marked = p + l + a;
      const pct = marked > 0 ? Math.round(((p + l) / marked) * 1000) / 10 : 0;
      return {
        date: row.date,
        totalSessions: parseInt(row.totalSessions, 10) || 0,
        submittedSessions: parseInt(row.submittedSessions, 10) || 0,
        openSessions: parseInt(row.openSessions, 10) || 0,
        presentCount: p,
        lateCount: l,
        absentCount: a,
        totalMarked: marked,
        attendancePercentage: pct
      };
    });

    // D. School/Centre Comparison
    const schoolCompValues: any[] = [startDate, endDate];
    const schoolConditions: string[] = ['s.is_active = TRUE'];
    if (targetOrgId) {
      schoolCompValues.push(targetOrgId);
      schoolConditions.push(`s.organization_id = $${schoolCompValues.length}`);
    }

    const schoolComparisonRes = await pool.query(
      `SELECT 
         s.id as "schoolId",
         s.name as "schoolName",
         s.code as "schoolCode",
         COUNT(DISTINCT c.id) as "classroomCount",
         COUNT(DISTINCT sess.id) as "totalSessions",
         COUNT(DISTINCT CASE WHEN sess.status = 'SUBMITTED' THEN sess.id END) as "submittedSessions",
         COUNT(DISTINCT CASE WHEN ar.status = 'PRESENT' THEN ar.id END) as "presentCount",
         COUNT(DISTINCT CASE WHEN ar.status = 'LATE' THEN ar.id END) as "lateCount",
         COUNT(DISTINCT CASE WHEN ar.status = 'ABSENT' THEN ar.id END) as "absentCount"
       FROM schools s
       LEFT JOIN classrooms c ON c.school_id = s.id AND c.is_active = TRUE
       LEFT JOIN attendance_sessions sess ON sess.classroom_id = c.id AND sess.date >= $1 AND sess.date <= $2
       LEFT JOIN attendance_records ar ON ar.session_id = sess.id
       WHERE ${schoolConditions.join(' AND ')}
       GROUP BY s.id, s.name, s.code
       ORDER BY s.name ASC`,
      schoolCompValues
    );

    const schoolComparison = schoolComparisonRes.rows.map(row => {
      const p = parseInt(row.presentCount, 10) || 0;
      const l = parseInt(row.lateCount, 10) || 0;
      const a = parseInt(row.absentCount, 10) || 0;
      const marked = p + l + a;
      const pct = marked > 0 ? Math.round(((p + l) / marked) * 1000) / 10 : 0;
      return {
        schoolId: row.schoolId,
        schoolName: row.schoolName,
        schoolCode: row.schoolCode,
        classroomCount: parseInt(row.classroomCount, 10) || 0,
        totalSessions: parseInt(row.totalSessions, 10) || 0,
        submittedSessions: parseInt(row.submittedSessions, 10) || 0,
        presentCount: p,
        lateCount: l,
        absentCount: a,
        totalMarked: marked,
        attendancePercentage: pct
      };
    });

    // E. Classroom-wise Attendance Summary
    const classValues: any[] = [startDate, endDate];
    const classConditions: string[] = ['c.is_active = TRUE'];

    if (targetOrgId) {
      classValues.push(targetOrgId);
      classConditions.push(`c.organization_id = $${classValues.length}`);
    }
    if (schoolId) {
      classValues.push(schoolId);
      classConditions.push(`c.school_id = $${classValues.length}`);
    }
    if (classroomId) {
      classValues.push(classroomId);
      classConditions.push(`c.id = $${classValues.length}`);
    }

    const classroomSummaryRes = await pool.query(
      `SELECT 
         c.id as "classroomId",
         c.name as "classroomName",
         c.grade_level as "gradeLevel",
         s.id as "schoolId",
         s.name as "schoolName",
         s.code as "schoolCode",
         COUNT(DISTINCT e.student_id) as "totalEnrolled",
         COUNT(DISTINCT sess.id) as "totalSessions",
         COUNT(DISTINCT CASE WHEN sess.status = 'SUBMITTED' THEN sess.id END) as "submittedSessions",
         COUNT(DISTINCT CASE WHEN sess.status = 'OPEN' THEN sess.id END) as "openSessions",
         COUNT(DISTINCT CASE WHEN ar.status = 'PRESENT' THEN ar.id END) as "presentCount",
         COUNT(DISTINCT CASE WHEN ar.status = 'LATE' THEN ar.id END) as "lateCount",
         COUNT(DISTINCT CASE WHEN ar.status = 'ABSENT' THEN ar.id END) as "absentCount"
       FROM classrooms c
       JOIN schools s ON s.id = c.school_id
       LEFT JOIN enrollments e ON e.classroom_id = c.id AND e.is_active = TRUE
       LEFT JOIN attendance_sessions sess ON sess.classroom_id = c.id AND sess.date >= $1 AND sess.date <= $2
       LEFT JOIN attendance_records ar ON ar.session_id = sess.id
       WHERE ${classConditions.join(' AND ')}
       GROUP BY c.id, c.name, c.grade_level, s.id, s.name, s.code
       ORDER BY s.name ASC, c.name ASC`,
      classValues
    );

    const classroomSummary = classroomSummaryRes.rows.map(row => {
      const p = parseInt(row.presentCount, 10) || 0;
      const l = parseInt(row.lateCount, 10) || 0;
      const a = parseInt(row.absentCount, 10) || 0;
      const marked = p + l + a;
      const pct = marked > 0 ? Math.round(((p + l) / marked) * 1000) / 10 : 0;
      return {
        classroomId: row.classroomId,
        classroomName: row.classroomName,
        gradeLevel: row.gradeLevel,
        schoolId: row.schoolId,
        schoolName: row.schoolName,
        schoolCode: row.schoolCode,
        totalEnrolled: parseInt(row.totalEnrolled, 10) || 0,
        totalSessions: parseInt(row.totalSessions, 10) || 0,
        submittedSessions: parseInt(row.submittedSessions, 10) || 0,
        openSessions: parseInt(row.openSessions, 10) || 0,
        presentCount: p,
        lateCount: l,
        absentCount: a,
        totalMarked: marked,
        attendancePercentage: pct
      };
    });

    return res.status(200).json({
      filters: {
        startDate,
        endDate,
        schoolId: schoolId || null,
        classroomId: classroomId || null,
        organizationId: targetOrgId || null
      },
      summary: {
        totalActiveStudents,
        totalSessions,
        submittedSessions,
        openSessions,
        presentCount,
        lateCount,
        absentCount,
        totalMarkedRecords,
        overallPercentage
      },
      dailyTrends,
      schoolComparison,
      classroomSummary
    });
  } catch (err) {
    console.error('Get dashboard analytics error:', err);
    return res.status(500).json({ error: 'Failed to retrieve attendance dashboard analytics' });
  }
}

/**
 * 2. Student-Wise Attendance Report
 * Renders individual student attendance metrics within the selected date range.
 */
export async function getStudentsReportHandler(req: Request, res: Response) {
  const role = req.user?.role;
  let targetOrgId = req.user?.organizationId;

  if (role === 'PLATFORM_ADMIN' && typeof req.query.organizationId === 'string') {
    targetOrgId = req.query.organizationId;
  }

  const today = new Date().toISOString().split('T')[0];
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  const startDate = typeof req.query.startDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.startDate)
    ? req.query.startDate
    : thirtyDaysAgo;

  const endDate = typeof req.query.endDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.endDate)
    ? req.query.endDate
    : today;

  const schoolId = typeof req.query.schoolId === 'string' ? req.query.schoolId : '';
  const classroomId = typeof req.query.classroomId === 'string' ? req.query.classroomId : '';
  const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';

  try {
    let query = `
      SELECT 
        s.id as "studentId",
        s.roll_number as "rollNumber",
        s.first_name as "firstName",
        s.last_name as "lastName",
        s.gender,
        sch.id as "schoolId",
        sch.name as "schoolName",
        sch.code as "schoolCode",
        c.id as "classroomId",
        c.name as "classroomName",
        c.grade_level as "gradeLevel",
        COUNT(DISTINCT ar.id) as "daysRecorded",
        COUNT(DISTINCT CASE WHEN ar.status = 'PRESENT' THEN ar.id END) as "presentCount",
        COUNT(DISTINCT CASE WHEN ar.status = 'LATE' THEN ar.id END) as "lateCount",
        COUNT(DISTINCT CASE WHEN ar.status = 'ABSENT' THEN ar.id END) as "absentCount"
      FROM students s
      JOIN schools sch ON sch.id = s.school_id
      LEFT JOIN enrollments e ON e.student_id = s.id AND e.is_active = TRUE
      LEFT JOIN classrooms c ON c.id = e.classroom_id
      LEFT JOIN attendance_records ar ON ar.student_id = s.id 
        AND ar.created_at >= $1::date AND ar.created_at <= ($2::date + interval '1 day')
      WHERE s.is_active = TRUE
    `;

    const conditions: string[] = ['s.is_active = TRUE'];
    const values: any[] = [startDate, endDate];

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
        s.roll_number ILIKE $${values.length}
      )`);
    }

    query += ` AND ${conditions.join(' AND ')}`;
    query += ` GROUP BY s.id, s.roll_number, s.first_name, s.last_name, s.gender, sch.id, sch.name, sch.code, c.id, c.name, c.grade_level`;
    query += ` ORDER BY sch.name ASC, c.name ASC, s.roll_number ASC, s.first_name ASC`;

    const result = await pool.query(query, values);

    const students = result.rows.map(row => {
      const p = parseInt(row.presentCount, 10) || 0;
      const l = parseInt(row.lateCount, 10) || 0;
      const a = parseInt(row.absentCount, 10) || 0;
      const totalMarked = p + l + a;
      const attendancePercentage = totalMarked > 0
        ? Math.round(((p + l) / totalMarked) * 1000) / 10
        : 0;

      return {
        ...row,
        daysRecorded: parseInt(row.daysRecorded, 10) || 0,
        presentCount: p,
        lateCount: l,
        absentCount: a,
        totalMarked,
        attendancePercentage
      };
    });

    return res.status(200).json({
      filters: { startDate, endDate, schoolId: schoolId || null, classroomId: classroomId || null },
      totalStudents: students.length,
      students
    });
  } catch (err) {
    console.error('Get students report error:', err);
    return res.status(500).json({ error: 'Failed to retrieve students attendance report' });
  }
}

/**
 * 3. Export Attendance CSV
 * Provides downloadable CSV with RFC 4180 compliance and Formula Injection prevention.
 */
export async function exportAttendanceCsvHandler(req: Request, res: Response) {
  const role = req.user?.role;
  let targetOrgId = req.user?.organizationId;

  if (role === 'PLATFORM_ADMIN' && typeof req.query.organizationId === 'string') {
    targetOrgId = req.query.organizationId;
  }

  const exportType = (req.query.type as string) || 'summary'; // 'summary' | 'classrooms' | 'students' | 'daily'
  const today = new Date().toISOString().split('T')[0];
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  const startDate = typeof req.query.startDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.startDate)
    ? req.query.startDate
    : thirtyDaysAgo;

  const endDate = typeof req.query.endDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.endDate)
    ? req.query.endDate
    : today;

  const schoolId = typeof req.query.schoolId === 'string' ? req.query.schoolId : '';
  const classroomId = typeof req.query.classroomId === 'string' ? req.query.classroomId : '';

  try {
    // Fetch Organization Name for Metadata Header
    let orgName = 'All Organizations';
    if (targetOrgId) {
      const orgRes = await pool.query('SELECT name FROM organizations WHERE id = $1', [targetOrgId]);
      if (orgRes.rows.length > 0) {
        orgName = orgRes.rows[0].name;
      }
    }

    const generatedTimestamp = new Date().toISOString();
    const metaHeader = [
      `# Sahaara Attendance Management Platform`,
      `# Report Type: ${exportType.toUpperCase()}`,
      `# Organization: ${orgName}`,
      `# Date Range: ${startDate} to ${endDate}`,
      `# Generated At: ${generatedTimestamp}`,
      `# Formula Injection Protection: Active`,
      ``
    ].join('\n');

    let csvContent = '';

    if (exportType === 'students') {
      // Student-Wise CSV
      const baseValues: any[] = [startDate, endDate];
      const conditions: string[] = ['s.is_active = TRUE'];

      if (targetOrgId) {
        baseValues.push(targetOrgId);
        conditions.push(`s.organization_id = $${baseValues.length}`);
      }
      if (schoolId) {
        baseValues.push(schoolId);
        conditions.push(`s.school_id = $${baseValues.length}`);
      }
      if (classroomId) {
        baseValues.push(classroomId);
        conditions.push(`e.classroom_id = $${baseValues.length}`);
      }

      const q = `
        SELECT 
          s.roll_number as "rollNumber",
          s.first_name as "firstName",
          s.last_name as "lastName",
          s.gender,
          sch.name as "schoolName",
          sch.code as "schoolCode",
          COALESCE(c.name, 'Unassigned') as "classroomName",
          COUNT(DISTINCT ar.id) as "daysRecorded",
          COUNT(DISTINCT CASE WHEN ar.status = 'PRESENT' THEN ar.id END) as "presentCount",
          COUNT(DISTINCT CASE WHEN ar.status = 'LATE' THEN ar.id END) as "lateCount",
          COUNT(DISTINCT CASE WHEN ar.status = 'ABSENT' THEN ar.id END) as "absentCount"
        FROM students s
        JOIN schools sch ON sch.id = s.school_id
        LEFT JOIN enrollments e ON e.student_id = s.id AND e.is_active = TRUE
        LEFT JOIN classrooms c ON c.id = e.classroom_id
        LEFT JOIN attendance_records ar ON ar.student_id = s.id 
          AND ar.created_at >= $1::date AND ar.created_at <= ($2::date + interval '1 day')
        WHERE ${conditions.join(' AND ')}
        GROUP BY s.id, s.roll_number, s.first_name, s.last_name, s.gender, sch.name, sch.code, c.name
        ORDER BY sch.name ASC, c.name ASC, s.roll_number ASC
      `;

      const result = await pool.query(q, baseValues);

      const headers = [
        'Roll Number',
        'First Name',
        'Last Name',
        'Gender',
        'School / Centre',
        'School Code',
        'Classroom',
        'Days Recorded',
        'Present',
        'Late',
        'Absent',
        'Total Marked',
        'Attendance Rate (%)'
      ];

      const rows = result.rows.map(r => {
        const p = parseInt(r.presentCount, 10) || 0;
        const l = parseInt(r.lateCount, 10) || 0;
        const a = parseInt(r.absentCount, 10) || 0;
        const total = p + l + a;
        const pct = total > 0 ? ((p + l) / total * 100).toFixed(1) : '0.0';

        return [
          sanitizeCsvField(r.rollNumber),
          sanitizeCsvField(r.firstName),
          sanitizeCsvField(r.lastName),
          sanitizeCsvField(r.gender || ''),
          sanitizeCsvField(r.schoolName),
          sanitizeCsvField(r.schoolCode),
          sanitizeCsvField(r.classroomName),
          sanitizeCsvField(r.daysRecorded),
          sanitizeCsvField(p),
          sanitizeCsvField(l),
          sanitizeCsvField(a),
          sanitizeCsvField(total),
          sanitizeCsvField(pct)
        ].join(',');
      });

      csvContent = metaHeader + headers.join(',') + '\n' + rows.join('\n');
    } else if (exportType === 'daily') {
      // Daily Session-by-Session CSV
      const baseValues: any[] = [startDate, endDate];
      let where = `sess.date >= $1 AND sess.date <= $2`;

      if (targetOrgId) {
        baseValues.push(targetOrgId);
        where += ` AND sess.organization_id = $${baseValues.length}`;
      }
      if (schoolId) {
        baseValues.push(schoolId);
        where += ` AND c.school_id = $${baseValues.length}`;
      }
      if (classroomId) {
        baseValues.push(classroomId);
        where += ` AND sess.classroom_id = $${baseValues.length}`;
      }

      const q = `
        SELECT 
          TO_CHAR(sess.date, 'YYYY-MM-DD') as "date",
          sch.name as "schoolName",
          sch.code as "schoolCode",
          c.name as "classroomName",
          c.grade_level as "gradeLevel",
          sess.status as "sessionStatus",
          sess.notes,
          marker.full_name as "markedByName",
          COUNT(DISTINCT CASE WHEN ar.status = 'PRESENT' THEN ar.id END) as "presentCount",
          COUNT(DISTINCT CASE WHEN ar.status = 'LATE' THEN ar.id END) as "lateCount",
          COUNT(DISTINCT CASE WHEN ar.status = 'ABSENT' THEN ar.id END) as "absentCount"
        FROM attendance_sessions sess
        JOIN classrooms c ON c.id = sess.classroom_id
        JOIN schools sch ON sch.id = c.school_id
        LEFT JOIN users marker ON marker.id = sess.marked_by_user_id
        LEFT JOIN attendance_records ar ON ar.session_id = sess.id
        WHERE ${where}
        GROUP BY sess.id, sess.date, sch.name, sch.code, c.name, c.grade_level, sess.status, sess.notes, marker.full_name
        ORDER BY sess.date DESC, sch.name ASC, c.name ASC
      `;

      const result = await pool.query(q, baseValues);

      const headers = [
        'Date',
        'School / Centre',
        'School Code',
        'Classroom',
        'Grade Level',
        'Session Status',
        'Marked By',
        'Present',
        'Late',
        'Absent',
        'Total Marked',
        'Attendance Rate (%)',
        'Notes'
      ];

      const rows = result.rows.map(r => {
        const p = parseInt(r.presentCount, 10) || 0;
        const l = parseInt(r.lateCount, 10) || 0;
        const a = parseInt(r.absentCount, 10) || 0;
        const total = p + l + a;
        const pct = total > 0 ? ((p + l) / total * 100).toFixed(1) : '0.0';

        return [
          sanitizeCsvField(r.date),
          sanitizeCsvField(r.schoolName),
          sanitizeCsvField(r.schoolCode),
          sanitizeCsvField(r.classroomName),
          sanitizeCsvField(r.gradeLevel || ''),
          sanitizeCsvField(r.sessionStatus),
          sanitizeCsvField(r.markedByName || ''),
          sanitizeCsvField(p),
          sanitizeCsvField(l),
          sanitizeCsvField(a),
          sanitizeCsvField(total),
          sanitizeCsvField(pct),
          sanitizeCsvField(r.notes || '')
        ].join(',');
      });

      csvContent = metaHeader + headers.join(',') + '\n' + rows.join('\n');
    } else {
      // Default: Classroom Summary CSV
      const baseValues: any[] = [startDate, endDate];
      let where = `sess.date >= $1 AND sess.date <= $2`;

      if (targetOrgId) {
        baseValues.push(targetOrgId);
        where += ` AND sess.organization_id = $${baseValues.length}`;
      }
      if (schoolId) {
        baseValues.push(schoolId);
        where += ` AND c.school_id = $${baseValues.length}`;
      }
      if (classroomId) {
        baseValues.push(classroomId);
        where += ` AND sess.classroom_id = $${baseValues.length}`;
      }

      const q = `
        SELECT 
          sch.name as "schoolName",
          sch.code as "schoolCode",
          c.name as "classroomName",
          c.grade_level as "gradeLevel",
          COUNT(DISTINCT e.student_id) as "totalEnrolled",
          COUNT(DISTINCT sess.id) as "totalSessions",
          COUNT(DISTINCT CASE WHEN sess.status = 'SUBMITTED' THEN sess.id END) as "submittedSessions",
          COUNT(DISTINCT CASE WHEN sess.status = 'OPEN' THEN sess.id END) as "openSessions",
          COUNT(DISTINCT CASE WHEN ar.status = 'PRESENT' THEN ar.id END) as "presentCount",
          COUNT(DISTINCT CASE WHEN ar.status = 'LATE' THEN ar.id END) as "lateCount",
          COUNT(DISTINCT CASE WHEN ar.status = 'ABSENT' THEN ar.id END) as "absentCount"
        FROM classrooms c
        JOIN schools sch ON sch.id = c.school_id
        LEFT JOIN enrollments e ON e.classroom_id = c.id AND e.is_active = TRUE
        LEFT JOIN attendance_sessions sess ON sess.classroom_id = c.id AND sess.date >= $1 AND sess.date <= $2
        LEFT JOIN attendance_records ar ON ar.session_id = sess.id
        WHERE ${where} AND c.is_active = TRUE
        GROUP BY c.id, c.name, c.grade_level, sch.name, sch.code
        ORDER BY sch.name ASC, c.name ASC
      `;

      const result = await pool.query(q, baseValues);

      const headers = [
        'School / Centre',
        'School Code',
        'Classroom',
        'Grade Level',
        'Enrolled Students',
        'Total Sessions',
        'Submitted Sessions',
        'Open Sessions',
        'Present Count',
        'Late Count',
        'Absent Count',
        'Total Marked Records',
        'Attendance Rate (%)'
      ];

      const rows = result.rows.map(r => {
        const p = parseInt(r.presentCount, 10) || 0;
        const l = parseInt(r.lateCount, 10) || 0;
        const a = parseInt(r.absentCount, 10) || 0;
        const total = p + l + a;
        const pct = total > 0 ? ((p + l) / total * 100).toFixed(1) : '0.0';

        return [
          sanitizeCsvField(r.schoolName),
          sanitizeCsvField(r.schoolCode),
          sanitizeCsvField(r.classroomName),
          sanitizeCsvField(r.gradeLevel || ''),
          sanitizeCsvField(r.totalEnrolled),
          sanitizeCsvField(r.totalSessions),
          sanitizeCsvField(r.submittedSessions),
          sanitizeCsvField(r.openSessions),
          sanitizeCsvField(p),
          sanitizeCsvField(l),
          sanitizeCsvField(a),
          sanitizeCsvField(total),
          sanitizeCsvField(pct)
        ].join(',');
      });

      csvContent = metaHeader + headers.join(',') + '\n' + rows.join('\n');
    }

    const filename = `sahaara-attendance-${exportType}-${startDate}-to-${endDate}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.status(200).send(csvContent);
  } catch (err) {
    console.error('Export attendance CSV error:', err);
    return res.status(500).json({ error: 'Failed to export attendance CSV' });
  }
}
