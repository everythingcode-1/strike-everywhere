import Decimal from 'decimal.js';
import type { Candle } from '../risk/types';

export function computeSpread(bid: string, ask: string): { spread: string; spreadBps: string } | null {
  const b = new Decimal(bid);
  const a = new Decimal(ask);
  if (!b.isFinite() || !a.isFinite() || b.lte(0) || a.lte(0) || a.lt(b)) return null;
  const spread = a.minus(b);
  const mid = a.plus(b).div(2);
  return { spread: spread.toString(), spreadBps: spread.div(mid).mul(10000).toString() };
}

export function computeBasis(mark: string, index: string): string | null {
  const m = new Decimal(mark);
  const i = new Decimal(index);
  if (!m.isFinite() || !i.isFinite() || i.lte(0)) return null;
  return m.minus(i).div(i).mul(100).toString();
}

export function computeVolatility(candles: Candle[]): { volatilityPct: string | null; sparkline: number[] } {
  if (candles.length === 0) return { volatilityPct: null, sparkline: [] };
  const days = new Map<number, { open: Decimal; high: Decimal; low: Decimal }>();
  for (const candle of candles) {
    const open = new Decimal(candle.open);
    const high = new Decimal(candle.high);
    const low = new Decimal(candle.low);
    if (!open.isFinite() || open.lte(0) || !high.isFinite() || !low.isFinite()) continue;
    const day = Math.floor(candle.time / 86_400_000);
    const existing = days.get(day);
    if (!existing) {
      days.set(day, { open, high, low });
    } else {
      days.set(day, {
        open: existing.open,
        high: Decimal.max(existing.high, high),
        low: Decimal.min(existing.low, low),
      });
    }
  }
  if (days.size === 0) return { volatilityPct: null, sparkline: downsampleSparkline(candles, 60) };
  let sum = new Decimal(0);
  for (const day of days.values()) {
    sum = sum.plus(day.high.minus(day.low).div(day.open).mul(100));
  }
  return {
    volatilityPct: sum.div(days.size).toString(),
    sparkline: downsampleSparkline(candles, 60),
  };
}

export function downsampleSparkline(candles: Candle[], points: number): number[] {
  const closes = candles.map((c) => new Decimal(c.close).toNumber()).filter((n) => Number.isFinite(n));
  if (closes.length <= points) return closes;
  const out: number[] = [];
  for (let i = 0; i < points; i += 1) {
    const idx = Math.round((i * (closes.length - 1)) / (points - 1));
    out.push(closes[idx]);
  }
  return out;
}
