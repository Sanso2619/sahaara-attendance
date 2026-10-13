-- Migration 002: Add Phase 2 columns for Organization, School, and Classroom management

-- 1. Organizations: Add code, contact_phone, and is_active
ALTER TABLE organizations 
  ADD COLUMN IF NOT EXISTS code VARCHAR(50),
  ADD COLUMN IF NOT EXISTS contact_phone VARCHAR(50),
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE NOT NULL;

-- Backfill code from uppercase slug if null, then enforce uniqueness
UPDATE organizations 
  SET code = UPPER(REPLACE(slug, '-', '_')) 
  WHERE code IS NULL;

ALTER TABLE organizations 
  ALTER COLUMN code SET NOT NULL;

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'unique_org_code'
  ) THEN
    ALTER TABLE organizations ADD CONSTRAINT unique_org_code UNIQUE (code);
  END IF;
END $$;

-- 2. Schools: Add is_active flag
ALTER TABLE schools 
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE NOT NULL;

CREATE INDEX IF NOT EXISTS idx_schools_org_active ON schools(organization_id, is_active);

-- 3. Classrooms: Add is_active flag
ALTER TABLE classrooms 
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE NOT NULL;

CREATE INDEX IF NOT EXISTS idx_classrooms_org_active ON classrooms(organization_id, is_active);
CREATE INDEX IF NOT EXISTS idx_classrooms_school_active ON classrooms(school_id, is_active);
