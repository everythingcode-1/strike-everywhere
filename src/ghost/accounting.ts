import Decimal from 'decimal.js';
import type { Side } from '../shared/types';
import type { PositionSummary } from '../shared/ghost-types';
import { decimalString, parseDecimal, parsePositive } from './decimal';

export interface PositionInput {
  side: Side;
  quantity: string;
  entryPrice: string;
  exitPrice: string;
  entryFee: string;
  exitFee: string;
  allocatedCollateral: string;
  fundingCashFlow?: string | null;
}

export function grossPnl(side: Side, quantity: string, entryPrice: string, exitPrice: string): Decimal {
  const q = parsePositive(quantity, 'Quantity');
  const entry = parsePositive(entryPrice, 'Entry price');
  const exit = parsePositive(exitPrice, 'Exit price');
  return side === 'long' ? q.mul(exit.minus(entry)) : q.mul(entry.minus(exit));
}

import { GhostError } from './errors';

export function feeFor(notional: string, rate: string): Decimal {
  const value = parseDecimal(notional, 'Notional');
  const feeRate = parseDecimal(rate, 'Fee rate');
  if (value.lt(0) || feeRate.lt(0)) throw new GhostError('INVALID_INPUT', 'Fee inputs cannot be negative.');
  return value.mul(feeRate);
}

export interface PositionSizing {
  requestedNotional: string;
  allocatedCollateral: string;
}

/** Collateral mode fixes margin; notional mode fixes exposure. The two fields never alias. */
export function positionSizing(inputMode: 'collateral' | 'notional', amount: string, leverage: number): PositionSizing {
  const value = parsePositive(amount, 'Amount');
  if (!Number.isSafeInteger(leverage) || leverage < 1) {
    throw new GhostError('INVALID_INPUT', 'Leverage must be a positive whole number.');
  }
  return inputMode === 'collateral'
    ? { requestedNotional: value.mul(leverage).toString(), allocatedCollateral: value.toString() }
    : { requestedNotional: value.toString(), allocatedCollateral: value.div(leverage).toString() };
}

/** Funding is only counted when an explicit signed cash flow is supplied; unknown stays null. */
export function signedFundingCashFlow(
  side: Side,
  quantity: string,
  price: string,
  rate: string,
): Decimal {
  const notional = parsePositive(quantity, 'Quantity').mul(parsePositive(price, 'Price'));
  const fundingRate = parseDecimal(rate, 'Funding rate');
  return side === 'long' ? notional.mul(fundingRate).neg() : notional.mul(fundingRate);
}

export function summarizePosition(input: PositionInput): PositionSummary {
  const gross = grossPnl(input.side, input.quantity, input.entryPrice, input.exitPrice);
  const entryFee = parseDecimal(input.entryFee, 'Entry fee');
  const exitFee = parseDecimal(input.exitFee, 'Exit fee');
  const collateral = parsePositive(input.allocatedCollateral, 'Allocated collateral');
  const funding = input.fundingCashFlow === undefined || input.fundingCashFlow === null
    ? null
    : parseDecimal(input.fundingCashFlow, 'Funding cash flow');
  const net = gross.minus(entryFee).minus(exitFee).plus(funding ?? 0);
  return {
    priceUsed: input.exitPrice,
    sourceTime: null,
    grossPnl: decimalString(gross),
    entryFee: decimalString(entryFee),
    exitFee: decimalString(exitFee),
    fundingCashFlow: funding === null ? null : decimalString(funding),
    fundingStatus: funding === null ? 'not_reconstructed' : 'known',
    netExcludingUnknownFunding: decimalString(net),
    roePct: decimalString(net.div(collateral).mul(100)),
  };
}
