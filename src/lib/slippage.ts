import Decimal from 'decimal.js';
import type { Side } from '../shared/types';
import type { SlippageEstimate } from '../shared/v2-types';
import type { DepthSnapshot } from './api';

export function estimateSlippage(
  markPrice: string,
  sizeUsd: string,
  side: Side,
  depth: DepthSnapshot,
  snapshotAt: number,
): SlippageEstimate | null {
  const mark = new Decimal(markPrice);
  const target = new Decimal(sizeUsd);
  if (!mark.isFinite() || mark.lte(0) || !target.isFinite() || target.lte(0)) return null;
  const levels = side === 'long' ? depth.asks : depth.bids;
  let usd = new Decimal(0);
  let base = new Decimal(0);
  for (const [priceRaw, qtyRaw] of levels) {
    if (usd.gte(target)) break;
    let price: Decimal;
    let qty: Decimal;
    try {
      price = new Decimal(priceRaw);
      qty = new Decimal(qtyRaw);
    } catch {
      continue;
    }
    if (!price.isFinite() || price.lte(0) || !qty.isFinite() || qty.lte(0)) continue;
    const levelUsd = price.mul(qty);
    const take = Decimal.min(levelUsd, target.minus(usd));
    if (take.lte(0)) continue;
    usd = usd.plus(take);
    base = base.plus(take.div(price));
  }
  if (base.lte(0)) return null;
  const vwap = usd.div(base);
  const slippageBps = side === 'long'
    ? vwap.minus(mark).div(mark).mul(10000)
    : mark.minus(vwap).div(mark).mul(10000);
  return {
    vwap: vwap.toString(),
    slippageBps: slippageBps.toString(),
    filledUsd: usd.toString(),
    partial: usd.lt(target),
    snapshotAt,
  };
}

export function replaySizeFor(requestedUsd: string, slippage: SlippageEstimate | null): string {
  return slippage?.partial ? slippage.filledUsd : requestedUsd;
}
