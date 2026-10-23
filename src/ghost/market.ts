import Decimal from 'decimal.js';
import type { VerifiedMarketRules } from '../shared/ghost-types';
import { GHOST_RULES_VERSION, GHOST_SCHEMA_VERSION, MARKET_SOURCE_MAX_AGE_MS, MARKET_SOURCE_MAX_FUTURE_MS } from './constants';
import { parsePositive } from './decimal';
import { GhostError } from './errors';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function text(source: Record<string, unknown>, key: string): string {
  const value = source[key];
  if (typeof value !== 'string' || value.length === 0) {
    throw new GhostError('UNSUPPORTED_CONTRACT', `Market metadata is missing ${key}.`);
  }
  return value;
}

function integer(source: Record<string, unknown>, key: string): number {
  const value = source[key];
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new GhostError('UNSUPPORTED_CONTRACT', `Market metadata has an invalid ${key}.`);
  }
  return value;
}

function decimal(source: Record<string, unknown>, key: string): string {
  const value = source[key];
  if (typeof value !== 'string') {
    throw new GhostError('UNSUPPORTED_CONTRACT', `Market metadata is missing ${key}.`);
  }
  parsePositive(value, key);
  return value;
}

function filter(filters: unknown[], type: string): Record<string, unknown> {
  const found = filters.find((item) => isRecord(item) && item.filterType === type);
  if (!isRecord(found)) {
    throw new GhostError('UNSUPPORTED_CONTRACT', `Market is missing the ${type} filter.`);
  }
  return found;
}

export function parseVerifiedRules(raw: unknown, expectedSymbol: string, receivedAt: number): VerifiedMarketRules {
  if (!isRecord(raw)) throw new GhostError('UNSUPPORTED_CONTRACT', 'Malformed exchange info.');
  const symbol = text(raw, 'symbol');
  if (symbol !== expectedSymbol) throw new GhostError('UNSUPPORTED_CONTRACT', 'Exchange info returned another symbol.');
  if (text(raw, 'contractType') !== 'PERPETUAL') {
    throw new GhostError('UNSUPPORTED_CONTRACT', 'Only perpetual contracts are supported.');
  }
  if (text(raw, 'status') !== 'trading') {
    throw new GhostError('UNSUPPORTED_CONTRACT', 'Market is not trading.');
  }
  const quoteAsset = text(raw, 'quoteAsset');
  if (text(raw, 'marginAsset') !== quoteAsset) {
    throw new GhostError('UNSUPPORTED_CONTRACT', 'Only linear contracts settled in the quote asset are supported.');
  }
  const orderTypes = raw.orderType;
  if (!Array.isArray(orderTypes) || !orderTypes.every((item) => typeof item === 'string') || !orderTypes.includes('MARKET')) {
    throw new GhostError('UNSUPPORTED_CONTRACT', 'Market orders are not enabled for this market.');
  }
  if (!Array.isArray(raw.filters)) throw new GhostError('UNSUPPORTED_CONTRACT', 'Market filters are missing.');
  const priceFilter = filter(raw.filters, 'PRICE_FILTER');
  const lot = raw.filters.find((item) => isRecord(item) && item.filterType === 'MARKET_LOT_SIZE') ?? filter(raw.filters, 'LOT_SIZE');
  if (!isRecord(lot)) throw new GhostError('UNSUPPORTED_CONTRACT', 'Market lot filter is missing.');
  const notionalFilter = filter(raw.filters, 'MIN_NOTIONAL');
  const tickSize = decimal(priceFilter, 'tickSize');
  const quantityStep = decimal(lot, 'stepSize');
  const minQuantity = decimal(lot, 'minQty');
  const maxQuantity = decimal(lot, 'maxQty');
  const minNotional = decimal(notionalFilter, 'notional');
  if (new Decimal(minQuantity).gt(maxQuantity)) {
    throw new GhostError('UNSUPPORTED_CONTRACT', 'Market lot bounds are inconsistent.');
  }
  const quotePrecision = integer(raw, 'quotePrecision');
  if (quotePrecision > 18) throw new GhostError('UNSUPPORTED_CONTRACT', 'Unsupported quote precision.');
  return {
    schemaVersion: GHOST_SCHEMA_VERSION,
    symbol,
    baseAsset: text(raw, 'baseAsset'),
    quoteAsset,
    contractType: 'PERPETUAL',
    status: 'trading',
    quotePrecision,
    tickSize,
    quantityStep,
    minQuantity,
    maxQuantity,
    minNotional,
    allowedOrderTypes: orderTypes,
    source: GHOST_RULES_VERSION,
    receivedAt,
  };
}

/** Entry and close require a trustworthy source timestamp inside the freshness window. */
export function assertFreshSource(sourceTime: number | null, now: number): number {
  if (sourceTime === null) {
    throw new GhostError('STALE_MARKET', 'Market data has no trustworthy source timestamp. Refresh before creating a trade.');
  }
  if (sourceTime > now + MARKET_SOURCE_MAX_FUTURE_MS) {
    throw new GhostError('STALE_MARKET', 'Market source timestamp is in the future.');
  }
  if (now - sourceTime > MARKET_SOURCE_MAX_AGE_MS) {
    throw new GhostError('STALE_MARKET', 'Market data is stale. Refresh before creating a trade.');
  }
  return sourceTime;
}

export function assertFreshBook(sourceTime: number | null, now: number): number {
  if (sourceTime === null) {
    throw new GhostError('STALE_MARKET', 'Order book has no trustworthy source timestamp.');
  }
  return assertFreshSource(sourceTime, now);
}
