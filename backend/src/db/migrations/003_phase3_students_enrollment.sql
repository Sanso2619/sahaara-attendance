-- Migration 003: Student Management and Classroom Enrollment History

-- 1. Add school_id and guardian_name to students
ALTER TABLE students
  ADD COLUMN IF NOT EXISTS school_id UUID REFERENCES schools(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS guardian_name VARCHAR(150);

CREATE INDEX IF NOT EXISTS idx_students_school_id ON students(school_id);
CREATE INDEX IF NOT EXISTS idx_students_org_school_active ON students(organization_id, school_id, is_active);

-- 2. Add ended_at column to enrollments for historical tracking
ALTER TABLE enrollments
  ADD COLUMN IF NOT EXISTS ended_at TIMESTAMP WITH TIME ZONE;

-- Drop old constraint that prevented re-enrolment history
ALTER TABLE enrollments
  DROP CONSTRAINT IF EXISTS unique_student_active_enrollment;

-- Ensure only one active classroom enrollment exists per student at any given time
CREATE UNIQUE INDEX IF NOT EXISTS idx_one_active_enrollment_per_student 
  ON enrollments (student_id) 
  WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_enrollments_classroom_active 
  ON enrollments (classroom_id, is_active);
