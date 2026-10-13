import bcrypt from 'bcryptjs';
import { pool } from '../config/db';
import { env } from '../config/env';

export async function seedDemoData() {
  if (env.NODE_ENV === 'production') {
    console.error('❌ SEEDING BLOCKED: Automatic seeding is forbidden in production environment.');
    return;
  }

  console.log('🌱 Seeding anonymized development data...');
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Create Demo Organization 1
    const org1Res = await client.query(
      `INSERT INTO organizations (name, slug, code, contact_email, contact_phone, is_active)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (slug) DO UPDATE 
       SET name = EXCLUDED.name, code = EXCLUDED.code, contact_phone = EXCLUDED.contact_phone, is_active = EXCLUDED.is_active
       RETURNING id;`,
      ['Hope Community Education Centre', 'hope-community', 'HOPE_EDU', 'contact@hope-edu.org', '+91 98765 43210', true]
    );
    const org1Id = org1Res.rows[0].id;

    // 2. Create Demo Organization 2 (for tenant isolation tests)
    const org2Res = await client.query(
      `INSERT INTO organizations (name, slug, code, contact_email, contact_phone, is_active)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (slug) DO UPDATE 
       SET name = EXCLUDED.name, code = EXCLUDED.code, contact_phone = EXCLUDED.contact_phone, is_active = EXCLUDED.is_active
       RETURNING id;`,
      ['Bright Future NGO', 'bright-future', 'BRIGHT_NGO', 'info@brightfuture.org', '+91 91234 56789', true]
    );
    const org2Id = org2Res.rows[0].id;

    // Common Hashed Password for Dev Seed Users: "Password123!"
    const passwordHash = await bcrypt.hash('Password123!', 10);

    // 3. Platform Admin (Global, no org_id)
    await client.query(
      `INSERT INTO users (email, password_hash, full_name, role, organization_id)
       VALUES ($1, $2, $3, $4, NULL)
       ON CONFLICT (email) DO NOTHING;`,
      ['platform.admin@sahaara.org', passwordHash, 'Platform System Admin', 'PLATFORM_ADMIN']
    );

    // 4. Org 1 Admin & Teacher
    await client.query(
      `INSERT INTO users (email, password_hash, full_name, role, organization_id)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (email) DO NOTHING
       RETURNING id;`,
      ['admin@hope-edu.org', passwordHash, 'Hope Org Administrator', 'ORG_ADMIN', org1Id]
    );

    const org1TeacherRes = await client.query(
      `INSERT INTO users (email, password_hash, full_name, role, organization_id)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (email) DO UPDATE SET full_name = EXCLUDED.full_name
       RETURNING id;`,
      ['teacher@hope-edu.org', passwordHash, 'Hope Primary Teacher', 'TEACHER', org1Id]
    );
    const teacher1Id = org1TeacherRes.rows[0].id;

    // 5. Org 2 Admin & Teacher
    await client.query(
      `INSERT INTO users (email, password_hash, full_name, role, organization_id)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (email) DO NOTHING;`,
      ['admin@brightfuture.org', passwordHash, 'Bright Admin', 'ORG_ADMIN', org2Id]
    );

    const org2TeacherRes = await client.query(
      `INSERT INTO users (email, password_hash, full_name, role, organization_id)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (email) DO UPDATE SET full_name = EXCLUDED.full_name
       RETURNING id;`,
      ['teacher@brightfuture.org', passwordHash, 'Bright Teacher', 'TEACHER', org2Id]
    );
    const teacher2Id = org2TeacherRes.rows[0].id;

    // 6. Schools for Org 1
    const school1Res = await client.query(
      `INSERT INTO schools (organization_id, name, code, address, is_active)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (organization_id, code) DO UPDATE SET name = EXCLUDED.name, address = EXCLUDED.address
       RETURNING id;`,
      [org1Id, 'Dharavi Community Learning Centre', 'DCL-01', 'Sector 5, Transit Camp, Dharavi, Mumbai', true]
    );
    const school1Id = school1Res.rows[0].id;

    const school2Res = await client.query(
      `INSERT INTO schools (organization_id, name, code, address, is_active)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (organization_id, code) DO UPDATE SET name = EXCLUDED.name, address = EXCLUDED.address
       RETURNING id;`,
      [org1Id, 'Chembur Children Resource Hub', 'CCR-02', 'Vashi Naka, Chembur East, Mumbai', true]
    );
    const school2Id = school2Res.rows[0].id;

    // 7. Schools for Org 2 (Bright Future NGO)
    const org2SchoolRes = await client.query(
      `INSERT INTO schools (organization_id, name, code, address, is_active)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (organization_id, code) DO UPDATE SET name = EXCLUDED.name, address = EXCLUDED.address
       RETURNING id;`,
      [org2Id, 'Govandi Youth & Child Center', 'GYC-01', 'Govandi West, Mumbai', true]
    );
    const org2SchoolId = org2SchoolRes.rows[0].id;

    // 8. Classrooms for Org 1 - School 1
    const class1Res = await client.query(
      `INSERT INTO classrooms (organization_id, school_id, name, grade_level, academic_year, is_active)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id;`,
      [org1Id, school1Id, 'Grade 1 - Sunflowers', 'Grade 1', '2026-2027', true]
    );
    const class1Id = class1Res.rows[0].id;

    await client.query(
      `INSERT INTO classrooms (organization_id, school_id, name, grade_level, academic_year, is_active)
       VALUES ($1, $2, $3, $4, $5, $6);`,
      [org1Id, school1Id, 'Grade 2 - Bluebells', 'Grade 2', '2026-2027', true]
    );

    // Classroom for Org 1 - School 2
    await client.query(
      `INSERT INTO classrooms (organization_id, school_id, name, grade_level, academic_year, is_active)
       VALUES ($1, $2, $3, $4, $5, $6);`,
      [org1Id, school2Id, 'Remedial Literacy Batch A', 'Level 1', '2026-2027', true]
    );

    // Classroom for Org 2
    const org2ClassRes = await client.query(
      `INSERT INTO classrooms (organization_id, school_id, name, grade_level, academic_year, is_active)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id;`,
      [org2Id, org2SchoolId, 'Bright Scholars Primary', 'Grade 1', '2026-2027', true]
    );
    const org2ClassId = org2ClassRes.rows[0].id;

    // 9. Assign Teachers to Classrooms
    await client.query(
      `INSERT INTO classroom_teachers (organization_id, classroom_id, teacher_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (classroom_id, teacher_id) DO NOTHING;`,
      [org1Id, class1Id, teacher1Id]
    );

    await client.query(
      `INSERT INTO classroom_teachers (organization_id, classroom_id, teacher_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (classroom_id, teacher_id) DO NOTHING;`,
      [org2Id, org2ClassId, teacher2Id]
    );

    await client.query('COMMIT');
    console.log('✅ Development seeding finished successfully.');
    console.log(' Credentials:');
    console.log('   - Platform Admin: platform.admin@sahaara.org / Password123!');
    console.log('   - Hope Org Admin: admin@hope-edu.org / Password123!');
    console.log('   - Hope Teacher: teacher@hope-edu.org / Password123!');
    console.log('   - Bright Org Admin: admin@brightfuture.org / Password123!');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Seeding failed:', err);
    throw err;
  } finally {
    client.release();
  }
}

if (require.main === module) {
  seedDemoData()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
