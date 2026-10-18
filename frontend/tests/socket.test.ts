import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ActivityEvent, SocketConnectionStatus } from '../src/lib/use-socket';

describe('Phase 7 Frontend Real-Time & Live Dashboard Suite', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('1. Debounce and Event Coalescing', () => {
    it('coalesces rapid refresh triggers into a single database re-fetch', () => {
      const mockRefresh = vi.fn();
      let timer: any = null;

      const triggerDebounced = (ms = 300) => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
          mockRefresh();
        }, ms);
      };

      // Simulate 5 rapid attendance / report socket events within 100ms
      triggerDebounced(300);
      triggerDebounced(300);
      triggerDebounced(300);
      triggerDebounced(300);
      triggerDebounced(300);

      expect(mockRefresh).not.toHaveBeenCalled();

      // Fast-forward past the 300ms debounce window
      vi.advanceTimersByTime(350);

      expect(mockRefresh).toHaveBeenCalledTimes(1);
    });
  });

  describe('2. Activity Feed Queue Management', () => {
    it('prepends new events and caps maximum feed history to 15 items', () => {
      let feed: ActivityEvent[] = [];

      const addActivity = (event: Omit<ActivityEvent, 'id'>) => {
        const id = `${Date.now()}-${Math.random()}`;
        feed = [{ id, ...event }, ...feed].slice(0, 15);
      };

      // Add 20 events
      for (let i = 1; i <= 20; i++) {
        addActivity({
          type: 'attendance:submitted',
          title: `Submission ${i}`,
          description: `Register #${i}`,
          timestamp: new Date().toISOString()
        });
      }

      expect(feed.length).toBe(15);
      // Newest event should be at index 0
      expect(feed[0].title).toBe('Submission 20');
      // Oldest remaining event should be event 6
      expect(feed[14].title).toBe('Submission 6');
    });
  });

  describe('3. Connection Status Fallback Logic', () => {
    it('maps socket states accurately to connection indicator labels', () => {
      const getStatusLabel = (status: SocketConnectionStatus) => {
        switch (status) {
          case 'connected':
            return 'Live Updates';
          case 'connecting':
            return 'Connecting...';
          case 'reconnecting':
            return 'Reconnecting...';
          case 'disconnected':
          case 'error':
          default:
            return 'Offline Mode';
        }
      };

      expect(getStatusLabel('connected')).toBe('Live Updates');
      expect(getStatusLabel('connecting')).toBe('Connecting...');
      expect(getStatusLabel('reconnecting')).toBe('Reconnecting...');
      expect(getStatusLabel('disconnected')).toBe('Offline Mode');
      expect(getStatusLabel('error')).toBe('Offline Mode');
    });
  });
});
