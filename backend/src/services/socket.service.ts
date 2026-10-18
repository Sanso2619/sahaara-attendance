import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';

export interface SocketUserPayload {
  userId: string;
  email: string;
  role: 'PLATFORM_ADMIN' | 'ORG_ADMIN' | 'TEACHER';
  organizationId: string | null;
}

export interface AttendanceSubmittedPayload {
  sessionId: string;
  classroomId: string;
  organizationId: string;
  date: string;
  status: 'SUBMITTED';
  recordsCount: number;
  timestamp: string;
}

export interface AttendanceUpdatedPayload {
  sessionId: string;
  classroomId: string;
  organizationId: string;
  date: string;
  status: 'OPEN' | 'SUBMITTED';
  timestamp: string;
}

export interface ReportsUpdatedPayload {
  organizationId: string;
  reason: 'attendance_submitted' | 'attendance_saved' | 'session_updated';
  timestamp: string;
}

export interface NotificationsUpdatedPayload {
  organizationId: string;
  totalTriggered: number;
  sent: number;
  failed: number;
  skipped: number;
  timestamp: string;
}

let io: Server | null = null;

/**
 * Extracts authentication token from socket handshake auth, headers, or cookies
 */
export function extractSocketToken(socket: Socket): string | null {
  // 1. Auth object (client-provided auth.token)
  if (socket.handshake.auth && typeof socket.handshake.auth.token === 'string') {
    return socket.handshake.auth.token.trim();
  }

  // 2. Authorization header (Bearer <token>)
  const authHeader = socket.handshake.headers.authorization;
  if (authHeader && typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    return authHeader.split(' ')[1].trim();
  }

  // 3. Cookie header (sahaara_auth_token)
  const cookieHeader = socket.handshake.headers.cookie;
  if (cookieHeader && typeof cookieHeader === 'string') {
    const cookies = cookieHeader.split(';');
    for (const c of cookies) {
      const trimmed = c.trim();
      if (trimmed.startsWith('sahaara_auth_token=')) {
        return decodeURIComponent(trimmed.substring('sahaara_auth_token='.length));
      }
    }
  }

  return null;
}

/**
 * Initializes Socket.IO server attached to HTTP server
 */
export function initSocketServer(httpServer: HttpServer): Server {
  if (io) {
    return io;
  }

  io = new Server(httpServer, {
    cors: {
      origin: env.FRONTEND_URL || 'http://localhost:3000',
      credentials: true,
      methods: ['GET', 'POST']
    },
    pingTimeout: 20000,
    pingInterval: 25000
  });

  // Authentication Middleware
  io.use((socket, next) => {
    const token = extractSocketToken(socket);
    if (!token) {
      return next(new Error('Authentication error: Missing authentication token.'));
    }

    try {
      const decoded = jwt.verify(token, env.JWT_SECRET) as SocketUserPayload;
      socket.data.user = decoded;
      next();
    } catch (err: any) {
      return next(new Error('Authentication error: Invalid or expired token.'));
    }
  });

  io.on('connection', (socket) => {
    const user: SocketUserPayload | undefined = socket.data.user;
    if (!user) {
      socket.disconnect(true);
      return;
    }

    // 1. Server-controlled room assignment based strictly on verified token claims
    if (user.organizationId) {
      socket.join(`org:${user.organizationId}`);

      if (user.role === 'ORG_ADMIN') {
        socket.join(`org_admin:${user.organizationId}`);
      }
    }

    if (user.role === 'PLATFORM_ADMIN') {
      socket.join('role:platform_admin');
    }

    // Clean disconnect listener
    socket.on('disconnect', (_reason) => {
      // Room memberships are automatically cleaned up by Socket.IO on socket disconnection
    });
  });

  return io;
}

/**
 * Returns active Socket.IO server instance
 */
export function getIO(): Server | null {
  return io;
}

/**
 * Resets / closes the Socket.IO server (useful in tests and server shutdown)
 */
export async function closeSocketServer(): Promise<void> {
  if (io) {
    await new Promise<void>((resolve) => {
      io!.close(() => {
        io = null;
        resolve();
      });
    });
  }
}

/**
 * Emits attendance:submitted event after database transaction has committed.
 * Minimal payload without sensitive student or guardian info.
 */
export function emitAttendanceSubmitted(payload: AttendanceSubmittedPayload): void {
  if (!io) return;

  // Organization-scoped broadcast + platform admin room
  if (payload.organizationId) {
    io.to(`org:${payload.organizationId}`)
      .to('role:platform_admin')
      .emit('attendance:submitted', payload);

    // Also trigger reports:updated event for dashboard counters
    io.to(`org:${payload.organizationId}`)
      .to('role:platform_admin')
      .emit('reports:updated', {
        organizationId: payload.organizationId,
        reason: 'attendance_submitted',
        timestamp: payload.timestamp
      });
  }
}

/**
 * Emits attendance:updated event after draft save or session update commits.
 */
export function emitAttendanceUpdated(payload: AttendanceUpdatedPayload): void {
  if (!io) return;

  if (payload.organizationId) {
    io.to(`org:${payload.organizationId}`)
      .to('role:platform_admin')
      .emit('attendance:updated', payload);

    io.to(`org:${payload.organizationId}`)
      .to('role:platform_admin')
      .emit('reports:updated', {
        organizationId: payload.organizationId,
        reason: 'attendance_saved',
        timestamp: payload.timestamp
      });
  }
}

/**
 * Emits reports:updated event to notify clients to refresh report data.
 */
export function emitReportsUpdated(payload: ReportsUpdatedPayload): void {
  if (!io) return;

  if (payload.organizationId) {
    io.to(`org:${payload.organizationId}`)
      .to('role:platform_admin')
      .emit('reports:updated', payload);
  }
}

/**
 * Emits notifications:updated event to authorized organization administrators.
 */
export function emitNotificationsUpdated(payload: NotificationsUpdatedPayload): void {
  if (!io) return;

  if (payload.organizationId) {
    io.to(`org_admin:${payload.organizationId}`)
      .to('role:platform_admin')
      .emit('notifications:updated', payload);
  }
}
