import { pool } from '../config/db';

export interface AuditEventParams {
  organizationId?: string | null;
  actorUserId?: string | null;
  actorRole?: string | null;
  action: string;
  targetType: string;
  targetId?: string | null;
  ipAddress?: string | null;
  metadata?: Record<string, any>;
}

export interface AuditLogRecord {
  id: string;
  organizationId: string | null;
  actorUserId: string | null;
  actorRole: string | null;
  actorName?: string | null;
  actorEmail?: string | null;
  action: string;
  targetType: string;
  targetId: string | null;
  ipAddress: string | null;
  metadata: Record<string, any> | null;
  createdAt: string;
}

const REDACTED_KEYS = new Set([
  'password',
  'password_hash',
  'token',
  'jwt',
  'authorization',
  'cookie',
  'secret',
  'guardian_contact',
  'records'
]);

/**
 * Sanitizes metadata to prevent secrets, tokens, rosters, or PII from being logged
 */
export function sanitizeAuditMetadata(metadata?: Record<string, any>): Record<string, any> | null {
  if (!metadata || typeof metadata !== 'object') {
    return null;
  }

  const sanitized: Record<string, any> = {};

  for (const [key, value] of Object.entries(metadata)) {
    const lowerKey = key.toLowerCase();
    if (REDACTED_KEYS.has(lowerKey)) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      sanitized[key] = sanitizeAuditMetadata(value);
    } else if (Array.isArray(value)) {
      sanitized[key] = `[Array length: ${value.length}]`;
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

/**
 * Records an immutable audit log entry.
 * Designed to never throw or break primary business operations if logging encounters an issue.
 */
export async function recordAuditEvent(params: AuditEventParams): Promise<AuditLogRecord | null> {
  try {
    const {
      organizationId = null,
      actorUserId = null,
      actorRole = null,
      action,
      targetType,
      targetId = null,
      ipAddress = null,
      metadata
    } = params;

    const safeMetadata = sanitizeAuditMetadata(metadata);
    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const validActorUserId = actorUserId && UUID_REGEX.test(actorUserId) ? actorUserId : null;

    const res = await pool.query(
      `INSERT INTO audit_logs (
         organization_id, actor_user_id, actor_role, action,
         target_type, target_id, ip_address, metadata, created_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP)
       RETURNING id, organization_id as "organizationId", actor_user_id as "actorUserId",
                 actor_role as "actorRole", action, target_type as "targetType",
                 target_id as "targetId", ip_address as "ipAddress", metadata,
                 created_at as "createdAt"`,
      [
        organizationId,
        validActorUserId,
        actorRole,
        action,
        targetType,
        targetId,
        ipAddress,
        safeMetadata ? JSON.stringify(safeMetadata) : null
      ]
    );

    return res.rows[0] || null;
  } catch (error) {
    // Log error locally without failing the requesting operation
    console.error('Audit log recording failed:', error);
    return null;
  }
}

/**
 * Queries audit logs with strict tenant isolation and role restrictions
 */
export async function listAuditLogs(params: {
  role: 'PLATFORM_ADMIN' | 'ORG_ADMIN' | 'TEACHER';
  userOrgId: string | null;
  targetOrgId?: string | null;
  action?: string;
  targetType?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  limit?: number;
}): Promise<{ logs: AuditLogRecord[]; total: number; page: number; totalPages: number }> {
  const {
    role,
    userOrgId,
    targetOrgId: requestedTargetOrgId,
    action,
    targetType,
    startDate,
    endDate,
    page = 1,
    limit = 20
  } = params;

  // Derive tenant identity strictly on server
  let effectiveOrgId: string | null = userOrgId;
  if (role === 'PLATFORM_ADMIN') {
    effectiveOrgId = requestedTargetOrgId || null;
  }

  const whereClauses: string[] = [];
  const queryParams: any[] = [];
  let pIdx = 1;

  if (effectiveOrgId) {
    whereClauses.push(`a.organization_id = $${pIdx++}`);
    queryParams.push(effectiveOrgId);
  }

  if (action) {
    whereClauses.push(`a.action = $${pIdx++}`);
    queryParams.push(action);
  }

  if (targetType) {
    whereClauses.push(`a.target_type = $${pIdx++}`);
    queryParams.push(targetType);
  }

  if (startDate) {
    whereClauses.push(`a.created_at >= $${pIdx++}`);
    queryParams.push(startDate);
  }

  if (endDate) {
    whereClauses.push(`a.created_at <= $${pIdx++}`);
    queryParams.push(endDate);
  }

  const whereStr = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';
  const offset = (Math.max(1, page) - 1) * limit;

  // 1. Total count
  const countRes = await pool.query(
    `SELECT COUNT(*) as total FROM audit_logs a ${whereStr}`,
    queryParams
  );
  const total = parseInt(countRes.rows[0].total, 10);

  // 2. Paginated rows with actor user info
  const listQuery = `
    SELECT a.id, a.organization_id as "organizationId",
           a.actor_user_id as "actorUserId", a.actor_role as "actorRole",
           u.full_name as "actorName", u.email as "actorEmail",
           a.action, a.target_type as "targetType", a.target_id as "targetId",
           a.ip_address as "ipAddress", a.metadata, a.created_at as "createdAt"
    FROM audit_logs a
    LEFT JOIN users u ON u.id = a.actor_user_id
    ${whereStr}
    ORDER BY a.created_at DESC
    LIMIT $${pIdx++} OFFSET $${pIdx++}
  `;

  const rowsRes = await pool.query(listQuery, [...queryParams, limit, offset]);

  return {
    logs: rowsRes.rows,
    total,
    page,
    totalPages: Math.ceil(total / limit)
  };
}
