import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { pool } from '../config/db';
import { env } from '../config/env';
import { recordAuditEvent } from '../services/audit.service';

export const loginSchema = z.object({
  email: z.string().email('Valid email address required'),
  password: z.string().min(1, 'Password required')
});

export async function loginHandler(req: Request, res: Response) {
  const { email, password } = req.body;

  try {
    const userRes = await pool.query(
      `SELECT u.id, u.email, u.password_hash, u.full_name, u.role, u.organization_id, u.is_active,
              o.name as organization_name, o.slug as organization_slug
       FROM users u
       LEFT JOIN organizations o ON u.organization_id = o.id
       WHERE u.email = $1`,
      [email.toLowerCase().trim()]
    );

    const ipAddress = (req.headers['x-forwarded-for'] as string)?.split(',')[0].trim() || req.ip || req.socket.remoteAddress || null;

    if (userRes.rows.length === 0) {
      await recordAuditEvent({
        action: 'LOGIN_FAILURE',
        targetType: 'USER',
        ipAddress,
        metadata: { attemptedEmail: email.toLowerCase().trim(), reason: 'User not found' }
      });
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const user = userRes.rows[0];

    if (!user.is_active) {
      await recordAuditEvent({
        organizationId: user.organization_id,
        actorUserId: user.id,
        actorRole: user.role,
        action: 'LOGIN_FAILURE',
        targetType: 'USER',
        targetId: user.id,
        ipAddress,
        metadata: { reason: 'Account disabled' }
      });
      return res.status(403).json({ error: 'Account has been disabled. Contact your administrator.' });
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      await recordAuditEvent({
        organizationId: user.organization_id,
        actorUserId: user.id,
        actorRole: user.role,
        action: 'LOGIN_FAILURE',
        targetType: 'USER',
        targetId: user.id,
        ipAddress,
        metadata: { reason: 'Incorrect password' }
      });
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const tokenPayload = {
      userId: user.id,
      email: user.email,
      role: user.role,
      organizationId: user.organization_id
    };

    const token = jwt.sign(tokenPayload, env.JWT_SECRET, { expiresIn: '1d' });

    // Set HTTP-Only Cookie with Secure settings
    res.cookie('sahaara_auth_token', token, {
      httpOnly: true,
      secure: env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000 // 1 day
    });

    await recordAuditEvent({
      organizationId: user.organization_id,
      actorUserId: user.id,
      actorRole: user.role,
      action: 'LOGIN_SUCCESS',
      targetType: 'USER',
      targetId: user.id,
      ipAddress,
      metadata: { email: user.email }
    });

    return res.status(200).json({
      message: 'Login successful',
      token, // Also return token for header-based API clients
      user: {
        id: user.id,
        email: user.email,
        fullName: user.full_name,
        role: user.role,
        organization: user.organization_id
          ? { id: user.organization_id, name: user.organization_name, slug: user.organization_slug }
          : null
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ error: 'Internal server error during authentication.' });
  }
}

export async function logoutHandler(req: Request, res: Response) {
  if (req.user) {
    const ipAddress = (req.headers['x-forwarded-for'] as string)?.split(',')[0].trim() || req.ip || req.socket.remoteAddress || null;
    await recordAuditEvent({
      organizationId: req.user.organizationId,
      actorUserId: req.user.userId,
      actorRole: req.user.role,
      action: 'LOGOUT',
      targetType: 'USER',
      targetId: req.user.userId,
      ipAddress
    });
  }

  res.clearCookie('sahaara_auth_token', {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax'
  });
  return res.status(200).json({ message: 'Logout successful' });
}

export async function getCurrentUserHandler(req: Request, res: Response) {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthenticated' });
  }

  try {
    const userRes = await pool.query(
      `SELECT u.id, u.email, u.full_name, u.role, u.organization_id,
              o.name as organization_name, o.slug as organization_slug
       FROM users u
       LEFT JOIN organizations o ON u.organization_id = o.id
       WHERE u.id = $1`,
      [req.user.userId]
    );

    if (userRes.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = userRes.rows[0];

    return res.status(200).json({
      user: {
        id: user.id,
        email: user.email,
        fullName: user.full_name,
        role: user.role,
        organization: user.organization_id
          ? { id: user.organization_id, name: user.organization_name, slug: user.organization_slug }
          : null
      }
    });
  } catch (err) {
    console.error('Get current user error:', err);
    return res.status(500).json({ error: 'Failed to fetch user session' });
  }
}
