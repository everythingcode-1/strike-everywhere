import { describe, expect, it } from 'vitest';
import type { SymbolEntry } from '../src/shared/types';
import { findTickerMatches } from '../src/lib/detect';

const entry = (baseAsset: string, highConfidence: boolean): SymbolEntry => ({
  baseAsset,
  symbol: `${baseAsset}-USD`,
  quotePrecision: 8,
  highConfidence,
});

const registry = new Map([
  ['TSLA', entry('TSLA', true)],
  ['BTC', entry('BTC', true)],
  ['NEAR', entry('NEAR', false)],
  ['ZHIPU', entry('ZHIPU', true)],
  ['UNITREE', entry('UNITREE', true)],
  ['MINIMAX', entry('MINIMAX', true)],
  ['NAS100', entry('NAS100', true)],
]);

describe('findTickerMatches', () => {
  it('finds high-confidence tickers and dollar-prefixed tickers', () => {
    const matches = findTickerMatches('TSLA rallied while $NEAR and BTC held.', registry);
    expect(matches.map((m) => m.entry.baseAsset)).toEqual(['TSLA', 'NEAR', 'BTC']);
  });

  it('ignores ambiguous tokens without a dollar prefix', () => {
    expect(findTickerMatches('The near term outlook', registry)).toHaveLength(0);
  });

  it('enforces word boundaries and uppercase', () => {
    expect(findTickerMatches('XTSLA TSLA5 tsla', registry)).toHaveLength(0);
    expect(findTickerMatches('(TSLA)', registry)).toHaveLength(1);
  });

  it('keeps the dollar sign inside the matched range', () => {
    const [match] = findTickerMatches('buy $BTC now', registry);
    expect(match.index).toBe(4);
    expect(match.length).toBe(4);
  });

  it('finds base assets longer than 5 characters or containing digits', () => {
    expect(findTickerMatches('UNITREE and MINIMAX', registry).map((m) => m.entry.baseAsset)).toEqual(['UNITREE', 'MINIMAX']);
    expect(findTickerMatches('NAS100 rallied', registry).map((m) => m.entry.baseAsset)).toEqual(['NAS100']);
  });

  it('rejects unknown long tokens', () => {
    expect(findTickerMatches('SKHYNIX and NOTREAL', registry)).toHaveLength(0);
  });
});
