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
      `INSERT INTO organizations (name, slug, contact_email)
       VALUES ($1, $2, $3)
       ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
       RETURNING id;`,
      ['Hope Community Education Centre', 'hope-community', 'contact@hope-edu.org']
    );
    const org1Id = org1Res.rows[0].id;

    // 2. Create Demo Organization 2 (for tenant isolation tests)
    const org2Res = await client.query(
      `INSERT INTO organizations (name, slug, contact_email)
       VALUES ($1, $2, $3)
       ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
       RETURNING id;`,
      ['Bright Future NGO', 'bright-future', 'info@brightfuture.org']
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
    const org1AdminRes = await client.query(
      `INSERT INTO users (email, password_hash, full_name, role, organization_id)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (email) DO NOTHING
       RETURNING id;`,
      ['admin@hope-edu.org', passwordHash, 'Hope Org Administrator', 'ORG_ADMIN', org1Id]
    );

    const org1TeacherRes = await client.query(
      `INSERT INTO users (email, password_hash, full_name, role, organization_id)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (email) DO NOTHING
       RETURNING id;`,
      ['teacher@hope-edu.org', passwordHash, 'Hope Primary Teacher', 'TEACHER', org1Id]
    );

    // 5. Org 2 Admin & Teacher
    await client.query(
      `INSERT INTO users (email, password_hash, full_name, role, organization_id)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (email) DO NOTHING;`,
      ['admin@brightfuture.org', passwordHash, 'Bright Admin', 'ORG_ADMIN', org2Id]
    );

    await client.query(
      `INSERT INTO users (email, password_hash, full_name, role, organization_id)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (email) DO NOTHING;`,
      ['teacher@brightfuture.org', passwordHash, 'Bright Teacher', 'TEACHER', org2Id]
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
