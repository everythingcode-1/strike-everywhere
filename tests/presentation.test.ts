import { describe, expect, it } from 'vitest';
import { formatMarketMoney, replayPresentation } from '../src/content/presentation';
import type { ReplayResult } from '../src/shared/types';

const result: ReplayResult = { status: 'survived', events: [], firstLiquidationAt: null, worstDrawdownPct: '-5.00', remainingSize: '1', candles: 43_200 };

describe('risk presentation', () => {
  it('rounds only at market precision without stripping integer zeros', () => {
    expect(formatMarketMoney('50000', 0)).toBe('$50,000');
    expect(formatMarketMoney('0.000123456', 8)).toBe('$0.00012346');
    expect(formatMarketMoney('100.500', 3)).toBe('$100.5');
  });

  it('does not display invalid prices as real numbers', () => {
    expect(formatMarketMoney('NaN', 2)).toBe('Unavailable');
    expect(formatMarketMoney('bad', 2)).toBe('Unavailable');
  });

  it('describes replay evidence without promising safety', () => {
    expect(replayPresentation(result).headline).toBe('No liquidation in this replay');
    expect(replayPresentation(result).detail).toContain('43,200');
  });

  it('distinguishes partial reductions from a fully closed position', () => {
    expect(replayPresentation({ ...result, status: 'liquidated', remainingSize: '0.2' }).headline).toBe('Partial liquidation triggered');
    expect(replayPresentation({ ...result, status: 'liquidated', remainingSize: '0' }).headline).toBe('Liquidation triggered');
  });

  it('withholds a 30-day verdict if history is incomplete', () => {
    expect(replayPresentation({ ...result, candles: 100 }).headline).toBe('Replay unavailable');
    expect(replayPresentation({ ...result, candles: 100 }).detail).toContain('Incomplete');
  });
});
