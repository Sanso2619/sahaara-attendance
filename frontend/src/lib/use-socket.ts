'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuth } from './auth-context';

export type SocketConnectionStatus = 'connected' | 'connecting' | 'reconnecting' | 'disconnected' | 'error';

export interface ActivityEvent {
  id: string;
  type: 'attendance:submitted' | 'attendance:updated' | 'reports:updated' | 'notifications:updated';
  title: string;
  description: string;
  timestamp: string;
}

export interface UseLiveDashboardOptions {
  onDataRefresh?: () => void;
  debounceMs?: number;
}

export function useLiveDashboard(options: UseLiveDashboardOptions = {}) {
  const { onDataRefresh, debounceMs = 300 } = options;
  const { user } = useAuth();

  const [status, setStatus] = useState<SocketConnectionStatus>('connecting');
  const [activityFeed, setActivityFeed] = useState<ActivityEvent[]>([]);
  const socketRef = useRef<Socket | null>(null);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const onDataRefreshRef = useRef(onDataRefresh);

  useEffect(() => {
    onDataRefreshRef.current = onDataRefresh;
  }, [onDataRefresh]);

  // Debounced refresh trigger to prevent thundering herd / rapid refresh loops
  const triggerRefresh = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = setTimeout(() => {
      if (onDataRefreshRef.current) {
        onDataRefreshRef.current();
      }
    }, debounceMs);
  }, [debounceMs]);

  const addActivity = useCallback((event: Omit<ActivityEvent, 'id'>) => {
    const id = `${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    setActivityFeed((prev) => [{ id, ...event }, ...prev].slice(0, 15));
  }, []);

  useEffect(() => {
    if (!user) {
      setStatus('disconnected');
      return;
    }

    // Determine backend socket endpoint
    // In production / browser with Next.js rewrites, connecting to current origin or backend URL
    const socketUrl = process.env.NEXT_PUBLIC_BACKEND_URL || (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:4000');

    setStatus('connecting');

    const socketInstance: Socket = io(socketUrl, {
      path: '/socket.io',
      withCredentials: true,
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 10000,
    });

    socketRef.current = socketInstance;

    // Connection lifecycle
    socketInstance.on('connect', () => {
      setStatus('connected');
    });

    socketInstance.on('disconnect', (reason) => {
      if (reason === 'io client disconnect') {
        setStatus('disconnected');
      } else {
        setStatus('reconnecting');
      }
    });

    socketInstance.on('connect_error', (_err) => {
      setStatus('error');
    });

    socketInstance.io.on('reconnect_attempt', () => {
      setStatus('reconnecting');
    });

    socketInstance.io.on('reconnect', () => {
      setStatus('connected');
      triggerRefresh();
    });

    // Real-time Event Subscriptions
    socketInstance.on('attendance:submitted', (data: any) => {
      addActivity({
        type: 'attendance:submitted',
        title: 'Attendance Register Submitted',
        description: `Finalized register for ${data.date || 'today'} (${data.recordsCount || 0} students marked)`,
        timestamp: data.timestamp || new Date().toISOString(),
      });
      triggerRefresh();
    });

    socketInstance.on('attendance:updated', (data: any) => {
      addActivity({
        type: 'attendance:updated',
        title: 'Attendance Draft Saved',
        description: `Draft progress updated for ${data.date || 'today'}`,
        timestamp: data.timestamp || new Date().toISOString(),
      });
      triggerRefresh();
    });

    socketInstance.on('reports:updated', (data: any) => {
      addActivity({
        type: 'reports:updated',
        title: 'Attendance Reports Updated',
        description: `Statistics and percentages updated (${data.reason?.replace('_', ' ') || 'refresh'})`,
        timestamp: data.timestamp || new Date().toISOString(),
      });
      triggerRefresh();
    });

    socketInstance.on('notifications:updated', (data: any) => {
      const summary = data.sent > 0 ? `${data.sent} sent` : `${data.totalTriggered} processed`;
      addActivity({
        type: 'notifications:updated',
        title: 'Guardian Follow-ups Dispatched',
        description: `Notification batch updated: ${summary}`,
        timestamp: data.timestamp || new Date().toISOString(),
      });
    });

    // Clean up listeners on unmount
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      socketInstance.removeAllListeners();
      socketInstance.disconnect();
      socketRef.current = null;
    };
  }, [user, addActivity, triggerRefresh]);

  return {
    socket: socketRef.current,
    status,
    activityFeed,
    refreshNow: triggerRefresh,
  };
}
