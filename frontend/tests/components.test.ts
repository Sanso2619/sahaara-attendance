import { describe, it, expect } from 'vitest';
import { cn } from '../src/components/ui/components';

describe('UI Foundation & Classnames utility', () => {
  it('should merge classes properly without duplicates', () => {
    const result = cn('px-2 py-1', 'px-4');
    expect(result).toBe('py-1 px-4');
  });

  it('should handle conditional classnames', () => {
    const isPrimary = true;
    const isDanger = false;
    const result = cn(
      'btn-base',
      isPrimary && 'btn-primary',
      isDanger && 'btn-danger'
    );
    expect(result).toBe('btn-base btn-primary');
  });

  it('should handle undefined or null inputs safely', () => {
    const result = cn('text-sm', undefined, null, false);
    expect(result).toBe('text-sm');
  });
});
