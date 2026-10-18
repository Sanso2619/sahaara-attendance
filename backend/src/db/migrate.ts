import fs from 'fs';
import path from 'path';
import { pool } from '../config/db';

export function getMigrationsDir(): string {
  // 1. Direct subfolder (development tsx or when copied to dist/db/migrations)
  const directPath = path.join(__dirname, 'migrations');
  if (fs.existsSync(directPath)) {
    return directPath;
  }

  // 2. Relative to compiled output (dist/db -> src/db/migrations)
  const srcPath = path.resolve(__dirname, '../../src/db/migrations');
  if (fs.existsSync(srcPath)) {
    return srcPath;
  }

  // 3. Fallback relative to current working directory
  const rootPath = path.resolve(process.cwd(), 'src/db/migrations');
  if (fs.existsSync(rootPath)) {
    return rootPath;
  }

  const backendSrcPath = path.resolve(process.cwd(), 'backend/src/db/migrations');
  if (fs.existsSync(backendSrcPath)) {
    return backendSrcPath;
  }

  throw new Error(`Unable to resolve migrations directory. Checked: ${directPath}, ${srcPath}`);
}

export async function runMigrations() {
  console.log('🔄 Running database migrations...');
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Create tracking table if not exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        executed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    const migrationsDir = getMigrationsDir();
    const files = fs.readdirSync(migrationsDir).sort();

    for (const file of files) {
      if (!file.endsWith('.sql')) continue;

      const { rowCount } = await client.query(
        'SELECT 1 FROM schema_migrations WHERE name = $1',
        [file]
      );

      if (rowCount === 0) {
        console.log(`➡️ Executing migration: ${file}`);
        const filePath = path.join(migrationsDir, file);
        const sql = fs.readFileSync(filePath, 'utf-8');

        await client.query(sql);
        await client.query(
          'INSERT INTO schema_migrations (name) VALUES ($1)',
          [file]
        );
        console.log(`✅ Completed migration: ${file}`);
      } else {
        console.log(`⏩ Skipping already executed migration: ${file}`);
      }
    }

    await client.query('COMMIT');
    console.log('🎉 All migrations completed successfully.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Migration failed:', err);
    throw err;
  } finally {
    client.release();
  }
}

if (require.main === module) {
  runMigrations()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
