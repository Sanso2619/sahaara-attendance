import dotenv from 'dotenv';
import path from 'path';
import bcrypt from 'bcryptjs';

// Load environment variables from current working directory, root .env, or default locations
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config();

import { pool } from '../config/db';

export interface BootstrapAdminOptions {
  email?: string;
  password?: string;
  fullName?: string;
  role?: 'PLATFORM_ADMIN' | 'ORG_ADMIN';
  organizationName?: string;
  organizationSlug?: string;
  organizationCode?: string;
}

export interface BootstrapResult {
  success: boolean;
  userId: string;
  email: string;
  role: string;
  fullName: string;
  organizationId: string | null;
  targetDatabase: string;
}

/**
 * Bootstraps the initial administrator account for production / pilot deployment.
 * Strictly enforces:
 * - Explicit INITIAL_ADMIN_EMAIL and INITIAL_ADMIN_PASSWORD (no silent password generation)
 * - Strict password complexity policy for privileged accounts (12+ chars, uppercase, lowercase, number, symbol)
 * - Rejection of common words and credentials matching the email
 * - Safe duplicate prevention (refuses to overwrite existing users)
 * - Strictly transactional execution (atomic user creation + ADMIN_BOOTSTRAP audit log entry)
 * - Never creates demo students, classrooms, or attendance records
 * - Never logs secrets
 */
export async function bootstrapAdmin(options: BootstrapAdminOptions = {}): Promise<BootstrapResult> {
  const email = (options.email || process.env.INITIAL_ADMIN_EMAIL || '').trim().toLowerCase();
  const password = options.password || process.env.INITIAL_ADMIN_PASSWORD || '';
  const fullName = (options.fullName || process.env.INITIAL_ADMIN_NAME || 'Platform Administrator').trim();
  const role = (options.role || (process.env.INITIAL_ADMIN_ROLE?.toUpperCase() as any) || 'PLATFORM_ADMIN');
  const orgName = (options.organizationName || process.env.INITIAL_ORG_NAME || '').trim();
  const orgSlug = (options.organizationSlug || process.env.INITIAL_ORG_SLUG || '').trim();
  const orgCode = (options.organizationCode || process.env.INITIAL_ORG_CODE || '').trim();

  // 1. Validation: Require explicit email
  if (!email) {
    throw new Error('Bootstrap failed: INITIAL_ADMIN_EMAIL environment variable is required.');
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    throw new Error(`Bootstrap failed: '${email}' is not a valid email address.`);
  }

  // 2. Validation: Require explicit strong password for privileged account
  if (!password) {
    throw new Error('Bootstrap failed: INITIAL_ADMIN_PASSWORD environment variable is required.');
  }

  if (password.length < 12) {
    throw new Error('Bootstrap failed: Privileged administrator password must be at least 12 characters long.');
  }

  const hasUpperCase = /[A-Z]/.test(password);
  const hasLowerCase = /[a-z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSpecial = /[^A-Za-z0-9]/.test(password);

  if (!hasUpperCase || !hasLowerCase || !hasNumber || !hasSpecial) {
    throw new Error(
      'Bootstrap failed: Privileged administrator password must contain at least one uppercase letter, one lowercase letter, one number, and one special character.'
    );
  }

  // Reject common/insecure words
  const lowerPwd = password.toLowerCase();
  const emailPrefix = email.split('@')[0].toLowerCase();
  if (
    lowerPwd.includes('password') ||
    lowerPwd.includes('admin123') ||
    lowerPwd.includes('sahaara') ||
    (emailPrefix.length >= 3 && lowerPwd.includes(emailPrefix))
  ) {
    throw new Error(
      'Bootstrap failed: Password cannot contain common dictionary terms or parts of the administrator email.'
    );
  }

  // Determine sanitized target database identifier for verification without logging credentials
  let targetDb = 'PostgreSQL Local Pool';
  const rawDbUrl = process.env.DATABASE_URL;
  if (rawDbUrl) {
    try {
      const parsedUrl = new URL(rawDbUrl);
      targetDb = `${parsedUrl.hostname}${parsedUrl.pathname} (SSL: ${parsedUrl.searchParams.get('sslmode') || 'configured'})`;
    } catch {
      targetDb = 'Cloud PostgreSQL (DATABASE_URL configured)';
    }
  } else if (process.env.DB_NAME) {
    targetDb = `${process.env.DB_HOST || 'localhost'}:${process.env.DB_PORT || '5432'}/${process.env.DB_NAME}`;
  }

  const client = await pool.connect();
  try {
    // 3. Atomicity: Execute duplicate check, user creation, and audit logging within a single transaction
    await client.query('BEGIN');

    // Duplicate Prevention: Check if user already exists
    const existingUserRes = await client.query(
      'SELECT id, email, role, is_active FROM users WHERE email = $1',
      [email]
    );

    if (existingUserRes.rows.length > 0) {
      const existing = existingUserRes.rows[0];
      throw new Error(
        `Bootstrap failed: A user with email '${email}' already exists (ID: ${existing.id}, Role: ${existing.role}). Aborting bootstrap to prevent duplicate creation or unauthorized overwrite.`
      );
    }

    let organizationId: string | null = null;

    // Optional Organization setup if requested
    if (orgName) {
      const slug = orgSlug || orgName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
      const code = orgCode || orgName.substring(0, 8).toUpperCase().replace(/[^A-Z0-9]/g, '');

      const orgRes = await client.query(
        `INSERT INTO organizations (name, slug, code, is_active)
         VALUES ($1, $2, $3, TRUE)
         ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
         RETURNING id`,
        [orgName, slug, code]
      );
      organizationId = orgRes.rows[0].id;
    }

    // Hash password with bcrypt
    const passwordHash = await bcrypt.hash(password, 10);

    // Insert administrator user
    const insertUserRes = await client.query(
      `INSERT INTO users (email, password_hash, full_name, role, organization_id, is_active)
       VALUES ($1, $2, $3, $4, $5, TRUE)
       RETURNING id, email, role, full_name as "fullName", organization_id as "organizationId"`,
      [email, passwordHash, fullName, role, organizationId]
    );

    const newUser = insertUserRes.rows[0];

    // Record immutable system audit log entry within the same transaction
    await client.query(
      `INSERT INTO audit_logs (organization_id, actor_user_id, actor_role, action, target_type, target_id, ip_address, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        organizationId,
        newUser.id,
        newUser.role,
        'ADMIN_BOOTSTRAP',
        'USER',
        newUser.id,
        '127.0.0.1',
        JSON.stringify({
          email: newUser.email,
          role: newUser.role,
          bootstrappedVia: 'CLI',
          organizationProvided: Boolean(orgName)
        })
      ]
    );

    // Commit only when both user and audit log succeed
    await client.query('COMMIT');

    console.log('✅ Pilot administrator bootstrapped successfully:');
    console.log(`   Target Database: ${targetDb}`);
    console.log(`   User ID:         ${newUser.id}`);
    console.log(`   Email:           ${newUser.email}`);
    console.log(`   Role:            ${newUser.role}`);
    console.log(`   Full Name:       ${newUser.fullName}`);
    console.log(`   Organization ID: ${newUser.organizationId || 'None (Global Platform Admin)'}`);

    return {
      success: true,
      userId: newUser.id,
      email: newUser.email,
      role: newUser.role,
      fullName: newUser.fullName,
      organizationId: newUser.organizationId,
      targetDatabase: targetDb
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// Allow direct CLI execution
if (require.main === module) {
  bootstrapAdmin()
    .then(() => {
      process.exit(0);
    })
    .catch((err) => {
      console.error('❌ ' + err.message);
      process.exit(1);
    });
}
