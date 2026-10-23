import { describe, expect, it } from 'vitest';
import Decimal from 'decimal.js';
import { estimateSlippage, replaySizeFor } from '../src/lib/slippage';

const depth = {
  bids: [['100', '10'], ['99', '10']] as [string, string][],
  asks: [['100', '10'], ['101', '10']] as [string, string][],
  time: 1,
};

describe('estimateSlippage', () => {
  it('fills a long across two ask levels and reports positive slippage', () => {
    const result = estimateSlippage('100', '1500', 'long', depth, 1);
    expect(result).not.toBeNull();
    expect(result?.partial).toBe(false);
    expect(result?.filledUsd).toBe('1500');
    expect(new Decimal(result!.slippageBps).toNumber()).toBeCloseTo(33.11, 1);
  });

  it('fills a short across two bid levels and reports positive slippage', () => {
    const result = estimateSlippage('100', '1500', 'short', depth, 1);
    expect(result).not.toBeNull();
    expect(result?.partial).toBe(false);
    expect(new Decimal(result!.slippageBps).toNumber()).toBeCloseTo(33.55, 1);
  });

  it('marks a partial fill when depth is thinner than the requested size', () => {
    const thin = { bids: [['100', '5']] as [string, string][], asks: [['100', '5']] as [string, string][], time: 1 };
    const result = estimateSlippage('100', '1000', 'long', thin, 1);
    expect(result?.partial).toBe(true);
    expect(result?.filledUsd).toBe('500');
    expect(result?.vwap).toBe('100');
  });

  it('returns null for empty depth', () => {
    expect(estimateSlippage('100', '1000', 'long', { bids: [], asks: [], time: 1 }, 1)).toBeNull();
  });

  it('returns null for zero size', () => {
    expect(estimateSlippage('100', '0', 'long', depth, 1)).toBeNull();
  });

  it('skips zero and negative price levels', () => {
    const dirty = { bids: [['0', '10'], ['-1', '10'], ['100', '10']] as [string, string][], asks: [['0', '10'], ['-1', '10'], ['100', '10']] as [string, string][], time: 1 };
    const result = estimateSlippage('100', '500', 'long', dirty, 1);
    expect(result?.filledUsd).toBe('500');
    expect(result?.vwap).toBe('100');
  });

  it('skips malformed or empty levels', () => {
    const dirty = {
      bids: [['', '10'], ['100', '10']] as [string, string][],
      asks: [['', '10'], ['100', '10']] as [string, string][],
      time: 1,
    };
    const result = estimateSlippage('100', '500', 'long', dirty, 1);
    expect(result?.filledUsd).toBe('500');
    expect(result?.vwap).toBe('100');
  });

  it('uses the filled size when depth is partial', () => {
    const thin = { bids: [['100', '5']] as [string, string][], asks: [['100', '5']] as [string, string][], time: 1 };
    const result = estimateSlippage('100', '1000', 'long', thin, 1);
    expect(replaySizeFor('1000', result)).toBe('500');
    expect(replaySizeFor('1000', null)).toBe('1000');
  });
});
