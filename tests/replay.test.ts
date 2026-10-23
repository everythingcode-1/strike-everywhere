import { describe, expect, it } from 'vitest';
import Decimal from 'decimal.js';
import type { ReplayInput } from '../src/risk/types';
import type { Tier } from '../src/shared/types';
import { assertReplayWindow, isUsableCandleSeries, normalizeCandles, replayPosition } from '../src/risk/replay';

const tiers: Tier[] = [
  { maxNotional: '100000', mmr: '0.01', maintenanceAmount: '0', maxLeverage: 20 },
  { maxNotional: '1000000', mmr: '0.02', maintenanceAmount: '100', maxLeverage: 10 },
];

const base: Omit<ReplayInput, 'side' | 'candles' | 'sizeUsd'> = {
  entryPrice: '100',
  leverage: '10',
  tiers,
  takerFeeRate: '0.0005',
};

function candle(time: number, low: string, high: string, close = '100') {
  return { time, open: '100', high, low, close };
}

describe('replay', () => {
  it('survives a mild drawdown and reports the worst excursion', () => {
    const result = replayPosition({
      ...base,
      side: 'long',
      sizeUsd: '1000',
      candles: [candle(1, '95', '101'), candle(2, '97', '102')],
    });
    expect(result.status).toBe('survived');
    expect(new Decimal(result.worstDrawdownPct).eq('-5')).toBe(true);
    expect(result.remainingSize).toBe('10');
  });

  it('liquidates a long on the candle low', () => {
    const result = replayPosition({
      ...base,
      side: 'long',
      sizeUsd: '1000',
      candles: [candle(5, '99', '100.5'), candle(9, '90.9', '100.2')],
    });
    expect(result.status).toBe('liquidated');
    expect(result.firstLiquidationAt).toBe(9);
    expect(result.events).toHaveLength(1);
    expect(result.remainingSize).toBe('0');
  });

  it('liquidates a short on the candle high, not the low', () => {
    const result = replayPosition({
      ...base,
      side: 'short',
      sizeUsd: '1000',
      candles: [candle(3, '95', '110')],
    });
    expect(result.status).toBe('liquidated');
    expect(result.firstLiquidationAt).toBe(3);
  });

  it('reduces a large position in stages', () => {
    const result = replayPosition({
      ...base,
      side: 'long',
      sizeUsd: '100000',
      candles: [candle(11, '90.9', '100')],
    });
    expect(result.status).toBe('liquidated');
    expect(result.events).toHaveLength(1);
    const reduced = Number(result.events[0].reduced);
    const remaining = Number(result.events[0].remaining);
    expect(reduced).toBeGreaterThan(0);
    expect(reduced).toBeLessThan(1000);
    expect(remaining).toBeGreaterThan(0);
    expect(reduced + remaining).toBeCloseTo(1000, 6);
  });

  it('reports adverse excursion only through the first liquidation event', () => {
    const result = replayPosition({ ...base, side: 'long', sizeUsd: '100000', candles: [candle(0, '90.9', '100'), candle(60_000, '90.85', '100')] });
    expect(new Decimal(result.worstDrawdownPct).eq('-9.1')).toBe(true);
  });

  it('keeps excursion precision until the display boundary', () => {
    const result = replayPosition({ ...base, side: 'long', sizeUsd: '1000', candles: [candle(0, '95.123456789', '100')] });
    expect(result.worstDrawdownPct).toBe('-4.876543211');
  });

  it('normalises the first candle open to the entry price', () => {
    const candles = [
      { time: 1, open: '50', high: '55', low: '45', close: '52' },
      { time: 2, open: '52', high: '60', low: '50', close: '58' },
    ];
    const out = normalizeCandles(candles, '100');
    expect(out[0].open).toBe('100');
    expect(new Decimal(out[1].high).div(out[1].open).toString()).toBe(new Decimal('60').div('52').toString());
  });

  it('returns the original candles when the first open is zero', () => {
    const candles = [{ time: 1, open: '0', high: '1', low: '0', close: '1' }];
    expect(normalizeCandles(candles, '100')).toEqual(candles);
  });

  it('returns an empty array unchanged', () => {
    expect(normalizeCandles([], '100')).toEqual([]);
  });

  it('rejects a candle series whose first open is zero or not finite', () => {
    expect(isUsableCandleSeries([])).toBe(false);
    expect(isUsableCandleSeries([{ time: 1, open: '0', high: '1', low: '0', close: '1' }])).toBe(false);
    expect(isUsableCandleSeries([{ time: 1, open: 'NaN', high: '1', low: '0', close: '1' }])).toBe(false);
    expect(isUsableCandleSeries([{ time: 1, open: '50', high: '1', low: '0', close: '1' }])).toBe(false);
    expect(isUsableCandleSeries([candle(1, '99', '101')])).toBe(true);
  });

  it('does not liquidate a short when the mark is unchanged', () => {
    expect(replayPosition({ ...base, side: 'short', sizeUsd: '1000', candles: [candle(0, '100', '100')] }).status).toBe('survived');
  });

  it('deducts entry fees before checking liquidation', () => {
    const result = replayPosition({ ...base, side: 'long', sizeUsd: '1000', takerFeeRate: '0.005', candles: [candle(0, '91', '100')] });
    expect(result.status).toBe('liquidated');
  });

  it('settles funding at UTC hours, excluding the opening instant', () => {
    const candles = [candle(0, '100', '100'), candle(3_600_000, '100', '100'), candle(7_200_000, '100', '100')];
    const result = replayPosition({ ...base, side: 'long', sizeUsd: '1000', takerFeeRate: '0', fundingRate: '0.05', candles });
    expect(result.firstLiquidationAt).toBe(7_200_000);
    expect(replayPosition({ ...base, side: 'short', sizeUsd: '1000', fundingRate: '0.05', candles }).status).toBe('survived');
  });

  it('rejects malformed later candles, not just the first open', () => {
    expect(isUsableCandleSeries([candle(0, '99', '101'), candle(60_000, 'NaN', '101')])).toBe(false);
    expect(isUsableCandleSeries([candle(0, '101', '99')])).toBe(false);
  });
});

describe('30-day evidence', () => {
  const end = 43_200 * 60_000;
  const full = Array.from({ length: 43_200 }, (_, i) => candle(i * 60_000, '99', '101'));

  it('accepts exactly 43,200 consecutive completed one-minute candles', () => {
    expect(() => assertReplayWindow(full, end)).not.toThrow();
  });

  it('rejects missing, duplicate, stale and malformed candles', () => {
    expect(() => assertReplayWindow(full.slice(1), end)).toThrow(/43,200/);
    expect(() => assertReplayWindow([full[0], ...full.slice(0, -1)], end)).toThrow();
    expect(() => assertReplayWindow(full, end + 60_000)).toThrow();
    expect(() => assertReplayWindow([...full.slice(0, -1), candle(end - 60_000, '0', '101')], end)).toThrow();
  });
});
