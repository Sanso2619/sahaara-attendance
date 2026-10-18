import dotenv from 'dotenv';
import path from 'path';
import { z } from 'zod';

// Load .env from root or backend directory
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().default('4000').transform(Number),
  DB_HOST: z.string().default('localhost'),
  DB_PORT: z.string().default('5432').transform(Number),
  DB_NAME: z.string().default('sahaara_db'),
  DB_USER: z.string().default('sahaara_user'),
  DB_PASSWORD: z.string().default('sahaara_secure_password'),
  DATABASE_URL: z.string().optional(),
  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 characters long').default('super_secret_sahaara_dev_jwt_key_32_chars'),
  COOKIE_SECRET: z.string().min(16, 'COOKIE_SECRET must be at least 16 characters long').default('super_secret_sahaara_dev_cookie_key_32'),
  FRONTEND_URL: z.string().default('http://localhost:3000')
}).superRefine((data, ctx) => {
  if (data.NODE_ENV === 'production') {
    const rawJwt = process.env.JWT_SECRET;
    if (!rawJwt || rawJwt.length < 32 || rawJwt.includes('dev_jwt_key')) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['JWT_SECRET'],
        message: 'In production, JWT_SECRET must be explicitly set, at least 32 characters long, and cannot use dev default secrets.'
      });
    }

    const rawCookie = process.env.COOKIE_SECRET;
    if (!rawCookie || rawCookie.length < 32 || rawCookie.includes('dev_cookie_key')) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['COOKIE_SECRET'],
        message: 'In production, COOKIE_SECRET must be explicitly set, at least 32 characters long, and cannot use dev default secrets.'
      });
    }

    if (process.env.DB_PASSWORD === 'sahaara_secure_password') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['DB_PASSWORD'],
        message: 'In production, default database password is strictly forbidden.'
      });
    }
  }
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment variables:', parsed.error.format());
  throw new Error('Invalid environment variables');
}

export const env = parsed.data;
export { envSchema };
