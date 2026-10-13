import { Request, Response } from 'express';
import { z } from 'zod';
import { pool } from '../config/db';

export const createOrganizationSchema = z.object({
  name: z.string().min(2, 'Organization name must be at least 2 characters'),
  code: z.string().min(2, 'Code must be at least 2 characters').toUpperCase(),
  contactEmail: z.string().email('Valid contact email is required').optional().or(z.literal('')),
  contactPhone: z.string().optional(),
  slug: z.string().optional()
});

export const updateOrganizationSchema = z.object({
  name: z.string().min(2).optional(),
  code: z.string().min(2).toUpperCase().optional(),
  contactEmail: z.string().email().optional().or(z.literal('')),
  contactPhone: z.string().optional(),
  isActive: z.boolean().optional()
});

export async function listOrganizationsHandler(req: Request, res: Response) {
  const role = req.user?.role;
  const userOrgId = req.user?.organizationId;
  const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
  const statusFilter = req.query.status as string; // 'active', 'inactive', 'all'

  try {
    let query = `
      SELECT o.id, o.name, o.slug, o.code, o.contact_email as "contactEmail",
             o.contact_phone as "contactPhone", o.is_active as "isActive",
             o.created_at as "createdAt",
             COUNT(DISTINCT s.id) as "schoolCount",
             COUNT(DISTINCT c.id) as "classroomCount"
      FROM organizations o
      LEFT JOIN schools s ON s.organization_id = o.id
      LEFT JOIN classrooms c ON c.organization_id = o.id
    `;
    const conditions: string[] = [];
    const values: any[] = [];

    // Non-platform admins can only see their own organization
    if (role !== 'PLATFORM_ADMIN') {
      values.push(userOrgId);
      conditions.push(`o.id = $${values.length}`);
    }

    if (search) {
      values.push(`%${search}%`);
      conditions.push(`(o.name ILIKE $${values.length} OR o.code ILIKE $${values.length})`);
    }

    if (statusFilter === 'active') {
      conditions.push('o.is_active = TRUE');
    } else if (statusFilter === 'inactive') {
      conditions.push('o.is_active = FALSE');
    }

    if (conditions.length > 0) {
      query += ` WHERE ${conditions.join(' AND ')}`;
    }

    query += ` GROUP BY o.id ORDER BY o.name ASC`;

    const result = await pool.query(query, values);
    return res.status(200).json({ organizations: result.rows });
  } catch (err) {
    console.error('List organizations error:', err);
    return res.status(500).json({ error: 'Failed to retrieve organizations' });
  }
}

export async function getOrganizationByIdHandler(req: Request, res: Response) {
  const { id } = req.params;
  const role = req.user?.role;
  const userOrgId = req.user?.organizationId;

  // Authorization check
  if (role !== 'PLATFORM_ADMIN' && userOrgId !== id) {
    return res.status(403).json({ error: 'Forbidden: You cannot access another organization.' });
  }

  try {
    const result = await pool.query(
      `SELECT o.id, o.name, o.slug, o.code, o.contact_email as "contactEmail",
              o.contact_phone as "contactPhone", o.is_active as "isActive",
              o.created_at as "createdAt",
              COUNT(DISTINCT s.id) as "schoolCount",
              COUNT(DISTINCT c.id) as "classroomCount"
       FROM organizations o
       LEFT JOIN schools s ON s.organization_id = o.id
       LEFT JOIN classrooms c ON c.organization_id = o.id
       WHERE o.id = $1
       GROUP BY o.id`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Organization not found' });
    }

    return res.status(200).json({ organization: result.rows[0] });
  } catch (err) {
    console.error('Get organization error:', err);
    return res.status(500).json({ error: 'Failed to retrieve organization' });
  }
}

export async function createOrganizationHandler(req: Request, res: Response) {
  const { name, code, contactEmail, contactPhone, slug: customSlug } = req.body;
  const generatedSlug = customSlug || name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');

  try {
    // Check code uniqueness
    const codeCheck = await pool.query('SELECT id FROM organizations WHERE code = $1', [code]);
    if (codeCheck.rows.length > 0) {
      return res.status(409).json({ error: `An organization with code '${code}' already exists.` });
    }

    // Check slug uniqueness
    const slugCheck = await pool.query('SELECT id FROM organizations WHERE slug = $1', [generatedSlug]);
    if (slugCheck.rows.length > 0) {
      return res.status(409).json({ error: `An organization with identifier '${generatedSlug}' already exists.` });
    }

    const insertResult = await pool.query(
      `INSERT INTO organizations (name, slug, code, contact_email, contact_phone, is_active)
       VALUES ($1, $2, $3, $4, $5, TRUE)
       RETURNING id, name, slug, code, contact_email as "contactEmail",
                 contact_phone as "contactPhone", is_active as "isActive", created_at as "createdAt"`,
      [name, generatedSlug, code, contactEmail || null, contactPhone || null]
    );

    return res.status(201).json({
      message: 'Organization created successfully',
      organization: insertResult.rows[0]
    });
  } catch (err) {
    console.error('Create organization error:', err);
    return res.status(500).json({ error: 'Failed to create organization' });
  }
}

export async function updateOrganizationHandler(req: Request, res: Response) {
  const { id } = req.params;
  const role = req.user?.role;
  const userOrgId = req.user?.organizationId;

  // Authorization check
  if (role !== 'PLATFORM_ADMIN' && userOrgId !== id) {
    return res.status(403).json({ error: 'Forbidden: You cannot modify another organization.' });
  }

  const { name, code, contactEmail, contactPhone, isActive } = req.body;

  try {
    // Org Admin can only update contact details, not code, name or isActive
    if (role !== 'PLATFORM_ADMIN' && (code !== undefined || isActive !== undefined)) {
      return res.status(403).json({ error: 'Forbidden: Only Platform Admins can alter organization code or status.' });
    }

    if (code) {
      const codeCheck = await pool.query('SELECT id FROM organizations WHERE code = $1 AND id != $2', [code, id]);
      if (codeCheck.rows.length > 0) {
        return res.status(409).json({ error: `Organization code '${code}' is already in use.` });
      }
    }

    const updates: string[] = ['updated_at = CURRENT_TIMESTAMP'];
    const values: any[] = [id];

    if (name !== undefined) {
      values.push(name);
      updates.push(`name = $${values.length}`);
    }
    if (code !== undefined) {
      values.push(code);
      updates.push(`code = $${values.length}`);
    }
    if (contactEmail !== undefined) {
      values.push(contactEmail || null);
      updates.push(`contact_email = $${values.length}`);
    }
    if (contactPhone !== undefined) {
      values.push(contactPhone || null);
      updates.push(`contact_phone = $${values.length}`);
    }
    if (isActive !== undefined) {
      values.push(isActive);
      updates.push(`is_active = $${values.length}`);
    }

    const result = await pool.query(
      `UPDATE organizations
       SET ${updates.join(', ')}
       WHERE id = $1
       RETURNING id, name, slug, code, contact_email as "contactEmail",
                 contact_phone as "contactPhone", is_active as "isActive", updated_at as "updatedAt"`,
      values
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Organization not found' });
    }

    return res.status(200).json({
      message: 'Organization updated successfully',
      organization: result.rows[0]
    });
  } catch (err) {
    console.error('Update organization error:', err);
    return res.status(500).json({ error: 'Failed to update organization' });
  }
}
