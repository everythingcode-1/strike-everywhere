import Decimal from 'decimal.js';
import type { ReplayEvent, ReplayResult } from '../shared/types';
import { REPLAY_CANDLES } from '../shared/constants';
import { commission, dec, initialMargin, maintenanceMargin, RiskInputError, selectTier, signedSize, ZERO } from './margin';
import type { Candle, ReplayInput } from './types';

const MAX_ATTEMPTS = 5;
const BASE_REDUCTION_USD = 5000;

/**
 * Staged liquidation: each 1m candle can trigger at most one reduction attempt.
 * Attempts 1-4 reduce part of the position, attempt 5 closes the remainder.
 */
export function replayPosition(input: ReplayInput): ReplayResult {
  const entry = dec(input.entryPrice);
  const sizeAbs = signedSize(input.entryPrice, input.sizeUsd, 'long');
  const dir = input.side === 'long' ? 1 : -1;
  let remaining = dir === 1 ? sizeAbs : sizeAbs.neg();
  const notional = entry.mul(sizeAbs);
  const tier = selectTier(notional, input.tiers);
  const leverage = Decimal.min(dec(input.leverage), tier.maxLeverage);
  let wallet = initialMargin(notional, leverage).minus(commission(notional, input.takerFeeRate));
  const feeRate = dec(input.takerFeeRate);
  const fundingRate = dec(input.fundingRate ?? '0');

  const events: ReplayEvent[] = [];
  let attempts = 0;
  let worstReturn = ZERO;
  let firstLiquidationAt: number | null = null;

  for (const candle of input.candles) {
    if (remaining.isZero()) break;
    if (candle.time > input.candles[0].time && candle.time % 3_600_000 === 0) {
      wallet = wallet.minus(remaining.mul(dec(candle.open)).mul(fundingRate));
    }
    const adverse = dec(dir === 1 ? candle.low : candle.high);
    const adverseReturn = dir === 1
      ? adverse.minus(entry).div(entry)
      : entry.minus(adverse).div(entry);
    if (firstLiquidationAt === null && adverseReturn.lt(worstReturn)) worstReturn = adverseReturn;

    const mark = adverse;
    const absRemaining = remaining.abs();
    const equity = wallet.plus(mark.minus(entry).mul(remaining));
    const mm = maintenanceMargin(mark.mul(absRemaining), input.tiers);
    if (equity.gt(mm)) continue;
    attempts += 1;
    const ratio = mm.div(Decimal.max(equity, new Decimal('0.00000001')));
    const progress = Decimal.min(Decimal.max(ratio.minus(1), ZERO), 1);
    const fraction = dec('0.2').plus(dec('0.8').mul(progress));
    const baseSize = dec(BASE_REDUCTION_USD).div(mark);
    const reduce = attempts >= MAX_ATTEMPTS
      ? absRemaining
      : Decimal.min(absRemaining, baseSize.plus(absRemaining.mul(fraction)));
    const reduced = dir === 1 ? reduce : reduce.neg();

    wallet = wallet.plus(mark.minus(entry).mul(reduced));
    wallet = wallet.minus(reduce.mul(mark).mul(feeRate));
    remaining = remaining.minus(reduced);

    if (firstLiquidationAt === null) firstLiquidationAt = candle.time;
    events.push({
      time: candle.time,
      price: mark.toString(),
      marginRatio: ratio.toString(),
      reduced: reduce.toString(),
      remaining: remaining.abs().toString(),
    });

    if (remaining.abs().lt(new Decimal('1e-12'))) {
      remaining = ZERO;
      break;
    }
  }

  return {
    status: events.length > 0 ? 'liquidated' : 'survived',
    events,
    firstLiquidationAt,
    worstDrawdownPct: worstReturn.mul(100).toString(),
    remainingSize: remaining.abs().toString(),
    candles: input.candles.length,
  };
}

export function normalizeCandles(candles: Candle[], entryPrice: string): Candle[] {
  if (candles.length === 0) return candles;
  const firstOpen = dec(candles[0].open);
  const entry = dec(entryPrice);
  if (firstOpen.lte(0) || !entry.isFinite() || entry.lte(0)) return candles;
  const factor = entry.div(firstOpen);
  return candles.map((candle) => ({
    time: candle.time,
    open: dec(candle.open).mul(factor).toString(),
    high: dec(candle.high).mul(factor).toString(),
    low: dec(candle.low).mul(factor).toString(),
    close: dec(candle.close).mul(factor).toString(),
  }));
}

export function isUsableCandleSeries(candles: Candle[]): boolean {
  if (candles.length === 0) return false;
  try {
    return candles.every((candle) => {
      const [open, high, low, close] = [candle.open, candle.high, candle.low, candle.close].map(dec);
      return Number.isSafeInteger(candle.time) && candle.time >= 0 && low.gt(0)
        && high.gte(low) && open.gte(low) && open.lte(high) && close.gte(low) && close.lte(high);
    });
  } catch {
    return false;
  }
}

export function assertReplayWindow(candles: Candle[], endTime: number): void {
  if (candles.length !== REPLAY_CANDLES) throw new RiskInputError('A 30-day replay needs exactly 43,200 completed mark candles. Retry when data is available.');
  if (!isUsableCandleSeries(candles)) throw new RiskInputError('Invalid mark candles; no replay verdict is available.');
  const start = endTime - REPLAY_CANDLES * 60_000;
  if (candles.some((candle, index) => candle.time !== start + index * 60_000)) {
    throw new RiskInputError('Mark history has gaps, duplicates, or stale timestamps; no 30-day verdict is available.');
  }
}
