import { describe, expect, it } from 'vitest';
import Decimal from 'decimal.js';
import { computeBasis, computeSpread, computeVolatility, downsampleSparkline } from '../src/lib/market-extras';

describe('market extras', () => {
  it('computes spread and basis points', () => {
    const spread = computeSpread('100', '101');
    expect(spread?.spread).toBe('1');
    expect(new Decimal(spread!.spreadBps).toNumber()).toBeCloseTo(99.5, 1);
  });

  it('returns null when the ask is below the bid', () => {
    expect(computeSpread('101', '100')).toBeNull();
  });

  it('computes mark-versus-index basis in percent', () => {
    expect(computeBasis('101', '100')).toBe('1');
  });

  it('returns null when the index price is zero', () => {
    expect(computeBasis('101', '0')).toBeNull();
  });

  it('averages the high-low range over the candles', () => {
    const candles = [
      { time: 1, open: '100', high: '102', low: '98', close: '100' },
      { time: 2, open: '100', high: '102', low: '98', close: '100' },
    ];
    const result = computeVolatility(candles);
    expect(new Decimal(result.volatilityPct!).toNumber()).toBeCloseTo(4, 6);
    expect(result.sparkline).toHaveLength(2);
  });

  it('averages daily ranges, not hourly ranges', () => {
    const candles = [
      { time: 0, open: '100', high: '104', low: '98', close: '100' },
      { time: 3_600_000, open: '100', high: '103', low: '99', close: '100' },
      { time: 86_400_000, open: '100', high: '102', low: '99', close: '100' },
    ];
    const result = computeVolatility(candles);
    expect(new Decimal(result.volatilityPct!).toNumber()).toBeCloseTo(4.5, 6);
  });

  it('returns null volatility and an empty sparkline for no candles', () => {
    expect(computeVolatility([])).toEqual({ volatilityPct: null, sparkline: [] });
  });

  it('downsamples closes to the requested number of points', () => {
    const candles = Array.from({ length: 120 }, (_, i) => ({ time: i, open: '1', high: '2', low: '1', close: String(i + 1) }));
    const points = downsampleSparkline(candles, 60);
    expect(points).toHaveLength(60);
    expect(points[0]).toBe(1);
    expect(points[59]).toBe(120);
  });
});
