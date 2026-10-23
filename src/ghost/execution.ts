import Decimal from 'decimal.js';
import type { Side } from '../shared/types';
import type { BookLevel } from '../shared/ghost-types';
import { decimalString, parsePositive } from './decimal';
import { GhostError } from './errors';

export interface ValidatedBook {
  bids: BookLevel[];
  asks: BookLevel[];
  bestBid: string;
  bestAsk: string;
}

export interface FillResult {
  quantity: string;
  notional: string;
  vwap: string;
  impactPct: string;
  levels: BookLevel[];
}

export interface ExecutionLimits {
  quantityStep: string;
  minQuantity: string;
  maxQuantity: string;
  minNotional: string;
}

function parseLevels(raw: [string, string][], label: string, descending: boolean): BookLevel[] {
  const levels: BookLevel[] = [];
  let previous: Decimal | null = null;
  for (const [priceRaw, quantityRaw] of raw) {
    const price = parsePositive(priceRaw, `${label} price`);
    const quantity = parsePositive(quantityRaw, `${label} quantity`);
    if (previous && (descending ? price.gt(previous) : price.lt(previous))) {
      throw new GhostError('INVALID_BOOK', `${label} levels are out of order.`);
    }
    previous = price;
    levels.push({ price: decimalString(price), quantity: decimalString(quantity) });
  }
  if (levels.length === 0) throw new GhostError('INVALID_BOOK', `${label} book is empty.`);
  return levels;
}

export function validateBook(bidsRaw: [string, string][], asksRaw: [string, string][]): ValidatedBook {
  const bids = parseLevels(bidsRaw, 'Bid', true);
  const asks = parseLevels(asksRaw, 'Ask', false);
  const bestBid = parsePositive(bids[0].price, 'Best bid');
  const bestAsk = parsePositive(asks[0].price, 'Best ask');
  if (bestBid.gte(bestAsk)) throw new GhostError('INVALID_BOOK', 'Market is crossed: best bid is not below best ask.');
  return { bids, asks, bestBid: bids[0].price, bestAsk: asks[0].price };
}

function consumeLevels(
  levels: BookLevel[],
  targetQuote: Decimal | null,
  targetQuantity: Decimal | null,
): { quantity: Decimal; notional: Decimal; used: BookLevel[]; complete: boolean } {
  let quantity = new Decimal(0);
  let notional = new Decimal(0);
  let quoteLeft = targetQuote;
  let quantityLeft = targetQuantity;
  const used: BookLevel[] = [];
  for (const level of levels) {
    if (quoteLeft !== null && quoteLeft.lte(0)) break;
    if (quantityLeft !== null && quantityLeft.lte(0)) break;
    const price = parsePositive(level.price, 'Level price');
    const available = parsePositive(level.quantity, 'Level quantity');
    let take: Decimal;
    if (quoteLeft !== null) {
      take = Decimal.min(available, quoteLeft.div(price));
      quoteLeft = quoteLeft.minus(take.mul(price));
    } else {
      take = Decimal.min(available, quantityLeft ?? 0);
      quantityLeft = (quantityLeft ?? new Decimal(0)).minus(take);
    }
    if (take.lte(0)) continue;
    quantity = quantity.plus(take);
    notional = notional.plus(take.mul(price));
    used.push({ price: level.price, quantity: decimalString(take) });
  }
  const complete = quoteLeft !== null ? quoteLeft.lte(new Decimal('1e-12')) : (quantityLeft ?? new Decimal(0)).lte(new Decimal('1e-12'));
  return { quantity, notional, used, complete };
}

function floorToStep(value: Decimal, stepRaw: string): Decimal {
  const step = parsePositive(stepRaw, 'Quantity step');
  return value.div(step).floor().mul(step);
}

function assertLimits(quantity: Decimal, notional: Decimal, limits: ExecutionLimits, enforceMinimums = true): void {
  const maxQuantity = parsePositive(limits.maxQuantity, 'Maximum quantity');
  if (enforceMinimums) {
    const minQuantity = parsePositive(limits.minQuantity, 'Minimum quantity');
    const minNotional = parsePositive(limits.minNotional, 'Minimum notional');
    if (quantity.lt(minQuantity)) throw new GhostError('MIN_QUANTITY', `Below the minimum quantity of ${limits.minQuantity}.`);
    if (notional.lt(minNotional)) throw new GhostError('MIN_NOTIONAL', `Below the minimum notional of ${limits.minNotional}.`);
  }
  if (quantity.gt(maxQuantity)) throw new GhostError('MAX_QUANTITY', `Above the maximum quantity of ${limits.maxQuantity}.`);
}

function quoteImpact(book: ValidatedBook, fillSide: 'asks' | 'bids', vwap: Decimal): Decimal {
  if (fillSide === 'asks') {
    const bestAsk = parsePositive(book.bestAsk, 'Best ask');
    return vwap.minus(bestAsk).div(bestAsk).mul(100);
  }
  const bestBid = parsePositive(book.bestBid, 'Best bid');
  return bestBid.minus(vwap).div(bestBid).mul(100);
}

/** Long entry consumes asks; short entry consumes bids. Full fill only. */
export function executeEntry(
  side: Side,
  book: ValidatedBook,
  targetNotional: string,
  limits: ExecutionLimits,
): FillResult {
  const target = parsePositive(targetNotional, 'Target notional');
  const levels = side === 'long' ? book.asks : book.bids;
  const walked = consumeLevels(levels, target, null);
  if (!walked.complete) throw new GhostError('INSUFFICIENT_DEPTH', 'Not enough book depth for a full fill. Reduce the size.');
  const quantity = floorToStep(walked.quantity, limits.quantityStep);
  if (quantity.lte(0)) throw new GhostError('MIN_QUANTITY', 'Size is below one quantity step.');
  const usedLevels = trimLevels(walked.used, quantity);
  const notional = usedLevels.reduce(
    (sum, level) => sum.plus(new Decimal(level.price).mul(level.quantity)),
    new Decimal(0),
  );
  const vwap = notional.div(quantity);
  assertLimits(quantity, notional, limits);
  return {
    quantity: decimalString(quantity),
    notional: decimalString(notional),
    vwap: decimalString(vwap),
    impactPct: decimalString(quoteImpact(book, side === 'long' ? 'asks' : 'bids', vwap)),
    levels: usedLevels,
  };
}

/** Keep the snapshot levels consistent with the rounded fill quantity. */
function trimLevels(levels: BookLevel[], quantity: Decimal): BookLevel[] {
  let excess = levels.reduce((sum, level) => sum.plus(level.quantity), new Decimal(0)).minus(quantity);
  const trimmed = [...levels];
  for (let index = trimmed.length - 1; index >= 0 && excess.gt(0); index -= 1) {
    const levelQuantity = new Decimal(trimmed[index].quantity);
    const cut = Decimal.min(levelQuantity, excess);
    const left = levelQuantity.minus(cut);
    excess = excess.minus(cut);
    if (left.lte(0)) trimmed.splice(index, 1);
    else trimmed[index] = { ...trimmed[index], quantity: decimalString(left.toDecimalPlaces(18, Decimal.ROUND_DOWN)) };
  }
  return trimmed;
}

/** A long closes into bids; a short closes into asks. Full fill only. */
export function executeExit(
  side: Side,
  book: ValidatedBook,
  quantityRaw: string,
  limits: ExecutionLimits,
): FillResult {
  const target = parsePositive(quantityRaw, 'Position quantity');
  const maxQuantity = parsePositive(limits.maxQuantity, 'Maximum quantity');
  if (target.gt(maxQuantity)) {
    throw new GhostError('MAX_QUANTITY', `Position exceeds the current per-order maximum of ${limits.maxQuantity}; split close is not supported.`);
  }
  const levels = side === 'long' ? book.bids : book.asks;
  const walked = consumeLevels(levels, null, target);
  if (!walked.complete) throw new GhostError('INSUFFICIENT_DEPTH', 'Not enough book depth to close the full position. Try again.');
  if (walked.quantity.lt(target)) throw new GhostError('INSUFFICIENT_DEPTH', 'Book depth did not cover the full position.');
  const vwap = walked.notional.div(walked.quantity);
  return {
    quantity: decimalString(walked.quantity),
    notional: decimalString(walked.notional),
    vwap: decimalString(vwap),
    impactPct: decimalString(quoteImpact(book, side === 'long' ? 'bids' : 'asks', vwap)),
    levels: walked.used,
  };
}
