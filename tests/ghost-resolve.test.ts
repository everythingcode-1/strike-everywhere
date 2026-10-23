import { describe, expect, it } from 'vitest';
import type { SymbolEntry } from '../src/shared/types';
import { resolveCandidates } from '../src/ghost/resolve';
import { assertTransition, shouldRecordGap } from '../src/ghost/lifecycle';

const entry = (baseAsset: string, highConfidence = true): SymbolEntry => ({
  baseAsset,
  symbol: `${baseAsset}-USD`,
  quotePrecision: 8,
  highConfidence,
});

const entries = [
  entry('BTC'), entry('ETH'), entry('TSLA'), entry('NVDA'), entry('NEAR', false),
  entry('COIN', false), entry('SOL'), entry('GOOGL'), entry('AAPL', true),
];

describe('claim asset resolution', () => {
  it('resolves curated names against real Strike markets', () => {
    expect(resolveCandidates('Bitcoin and Ethereum rallied while Tesla lagged', entries).map((item) => item.baseAsset))
      .toEqual(['BTC', 'ETH', 'TSLA']);
  });

  it('deduplicates Bitcoin with an explicit BTC ticker', () => {
    expect(resolveCandidates('Bitcoin (BTC) is up', entries).map((item) => item.baseAsset)).toEqual(['BTC']);
  });

  it('keeps ambiguous tokens behind a dollar prefix', () => {
    expect(resolveCandidates('NEAR and COIN rallied', entries)).toHaveLength(0);
    expect(resolveCandidates('$NEAR and $COIN rallied', entries).map((item) => item.baseAsset))
      .toEqual(['NEAR', 'COIN']);
  });

  it('does not guess Apple, Meta, Near or Strike from ordinary words', () => {
    expect(resolveCandidates('Apple, Meta, Near and Strike made news', entries)).toHaveLength(0);
  });

  it('ignores aliases whose market is absent and preserves non-English prose', () => {
    expect(resolveCandidates('Nvidia dan Bitcoin naik', entries).map((item) => item.baseAsset)).toEqual(['BTC', 'NVDA']);
    expect(resolveCandidates('Dogecoin naik', entries)).toHaveLength(0);
  });
});

describe('ghost lifecycle', () => {
  it('allows the documented transitions and never reopens a closed trade', () => {
    expect(() => assertTransition('open', 'pending_exit')).not.toThrow();
    expect(() => assertTransition('pending_exit', 'closed')).not.toThrow();
    expect(() => assertTransition('unresolved', 'open')).not.toThrow();
    expect(() => assertTransition('closed', 'open')).toThrow();
  });

  it('records a gap only after monitoring stopped for longer than the threshold', () => {
    expect(shouldRecordGap(null, 100_000, 1_000)).toBe(false);
    expect(shouldRecordGap(1_000, 1_500, 1_000)).toBe(false);
    expect(shouldRecordGap(1_000, 2_001, 1_000)).toBe(true);
  });
});
