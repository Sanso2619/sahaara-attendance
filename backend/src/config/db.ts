import { Pool, PoolConfig } from 'pg';
import { env } from './env';

const isProduction = env.NODE_ENV === 'production';

// Strict TLS with certificate verification in production (compatible with Neon and managed cloud PostgreSQL)
const sslConfig = isProduction ? { rejectUnauthorized: true } : undefined;

export const poolConfig: PoolConfig = env.DATABASE_URL
  ? {
      connectionString: env.DATABASE_URL,
      ssl: sslConfig,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000
    }
  : {
      host: env.DB_HOST,
      port: env.DB_PORT,
      database: env.DB_NAME,
      user: env.DB_USER,
      password: env.DB_PASSWORD,
      ssl: sslConfig,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000
    };

export const pool = new Pool(poolConfig);

// Graceful pool shutdown on app exit
process.on('beforeExit', () => {
  pool.end();
});
