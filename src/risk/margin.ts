import Decimal from 'decimal.js';
import type { Tier } from '../shared/types';
import type { PositionInput, RiskSummary, SummaryInput } from './types';

export const ZERO = new Decimal(0);

export class RiskInputError extends Error {
  readonly name = 'RiskInputError';
}

export function dec(value: string | number): Decimal {
  try {
    const result = new Decimal(value);
    if (result.isFinite()) return result;
  } catch { /* Keep malformed decimal failures typed at the library boundary. */ }
  throw new RiskInputError('Risk inputs must be finite decimals');
}

function positive(value: string, label: string): Decimal {
  const result = dec(value);
  if (result.lte(0)) throw new RiskInputError(`${label} must be positive`);
  return result;
}

export function signedSize(price: string, sizeUsd: string, side: 'long' | 'short'): Decimal {
  const size = positive(sizeUsd, 'Size').div(positive(price, 'Price'));
  return side === 'long' ? size : size.neg();
}

export function selectTier(notional: Decimal, tiers: Tier[]): Tier {
  if (!notional.isFinite() || notional.lt(0)) throw new RiskInputError('Invalid notional');
  if (tiers.length === 0) throw new RiskInputError('No margin tiers configured');
  for (const tier of tiers) {
    if (notional.lte(dec(tier.maxNotional))) return tier;
  }
  return tiers[tiers.length - 1];
}

export function initialMargin(notional: Decimal, leverage: Decimal): Decimal {
  if (!leverage.isFinite() || leverage.lte(0)) throw new RiskInputError('Leverage must be positive');
  return notional.div(leverage);
}

export function maintenanceMargin(notional: Decimal, tiers: Tier[]): Decimal {
  const tier = selectTier(notional, tiers);
  const mm = notional.mul(dec(tier.mmr)).minus(dec(tier.maintenanceAmount));
  return Decimal.max(mm, ZERO);
}

// Solve equity = maintenance in the tier at the liquidation mark, not the entry mark.
export function liquidationPrice(input: PositionInput): Decimal | null {
  const entry = positive(input.entryPrice, 'Entry');
  const size = dec(input.size);
  if (size.isZero()) return null;
  const absSize = size.abs();
  const notional = entry.mul(absSize);
  const wallet = input.walletBalance === undefined ? initialMargin(notional, positive(input.leverage, 'Leverage')) : dec(input.walletBalance);
  selectTier(notional, input.tiers);
  for (const tier of input.tiers) {
    const denominator = size.minus(absSize.mul(dec(tier.mmr)));
    if (denominator.isZero()) continue;
    const price = entry.mul(size).minus(wallet).minus(dec(tier.maintenanceAmount)).div(denominator);
    if (price.lte(0) || selectTier(price.mul(absSize), input.tiers) !== tier) continue;
    if (price.mul(absSize).mul(dec(tier.mmr)).minus(dec(tier.maintenanceAmount)).lt(0)) continue;
    return price;
  }
  return null;
}

export function marginRatio(input: PositionInput, markPrice: string): Decimal {
  const mark = dec(markPrice);
  const size = dec(input.size);
  const entry = dec(input.entryPrice);
  const notional = mark.mul(size.abs());
  const wallet = input.walletBalance === undefined ? initialMargin(entry.mul(size.abs()), dec(input.leverage)) : dec(input.walletBalance);
  const balance = wallet.plus(mark.minus(entry).mul(size));
  if (balance.lte(0)) return new Decimal(Infinity);
  return maintenanceMargin(notional, input.tiers).div(balance);
}

export function commission(notional: Decimal, rate: string): Decimal {
  const feeRate = dec(rate);
  if (feeRate.lt(0)) throw new RiskInputError('Fee rate must not be negative');
  return notional.mul(feeRate);
}

export function fundingPerDay(size: Decimal, price: string, hourlyRate: string): Decimal {
  return size.mul(dec(price)).mul(dec(hourlyRate)).mul(24).neg();
}

export function summarize(input: SummaryInput): RiskSummary {
  const price = positive(input.entryPrice, 'Entry');
  const size = signedSize(input.entryPrice, input.sizeUsd, input.side);
  const notional = price.mul(size.abs());
  const tier = selectTier(notional, input.tiers);
  const requested = positive(input.leverage, 'Leverage');
  const effective = Decimal.min(requested, tier.maxLeverage);
  const fee = commission(notional, input.takerFeeRate);
  const position: PositionInput = {
    entryPrice: input.entryPrice,
    size: size.toString(),
    leverage: effective.toString(),
    tiers: input.tiers,
    walletBalance: initialMargin(notional, effective).minus(fee).toString(),
  };
  const lp = liquidationPrice(position);
  return {
    notional: notional.toString(),
    initialMargin: initialMargin(notional, effective).toString(),
    maintenanceMargin: maintenanceMargin(notional, input.tiers).toString(),
    liquidationPrice: lp ? lp.toString() : null,
    fee: fee.toString(),
    fundingPerDay: fundingPerDay(size, input.entryPrice, input.fundingRate).toString(),
    maxLeverage: tier.maxLeverage,
    leverageClamped: requested.gt(tier.maxLeverage),
  };
}
