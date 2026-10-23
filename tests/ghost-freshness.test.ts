import { describe, expect, it } from 'vitest';
import { freshnessLabel } from '../src/ghost/freshness';

const base = { status: 'open' as const, observedAt: 1_000_000, now: 1_000_000 };

describe('freshness label', () => {
  it('prefers source time over receive time', () => {
    expect(freshnessLabel({ ...base, sourceTime: 1_000_000 - 16_000 }).stale).toBe(true);
    expect(freshnessLabel({ ...base, sourceTime: 1_000_000 - 10_000 }).stale).toBe(false);
  });

  it('labels a receive-time fallback instead of pretending it is source time', () => {
    const label = freshnessLabel({ ...base, sourceTime: null });
    expect(label.basis).toBe('receive');
    expect(label.text).toContain('Receive time only');
  });

  it('keeps closed records labelled closed', () => {
    expect(freshnessLabel({ ...base, status: 'closed', sourceTime: null }).text).toBe('Closed record');
  });

  it('does not report a negative age when the source clock is ahead', () => {
    const label = freshnessLabel({ ...base, sourceTime: 1_000_003 });
    expect(label.stale).toBe(false);
    expect(label.text).toContain('0s old');
  });
});
