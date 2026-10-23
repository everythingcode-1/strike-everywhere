import { describe, expect, it } from 'vitest';
import { executeEntry, executeExit, validateBook } from '../src/ghost/execution';

const limits = { quantityStep: '0.001', minQuantity: '0.001', maxQuantity: '100', minNotional: '10' };
const book = validateBook(
  [['100', '1'], ['99', '1'], ['98', '10']],
  [['101', '1'], ['102', '1'], ['103', '10']],
);

describe('ghost market fills', () => {
  it('walks asks for a long and bids for a short', () => {
    expect(executeEntry('long', book, '150', limits).vwap).toBe('101.32432432432432432');
    expect(executeEntry('short', book, '150', limits).vwap).toBe('99.664451827242524917');
  });

  it('rounds quantity down to the step and rebuilds notional from the rounded fill', () => {
    const fill = executeEntry('long', book, '150', limits);
    expect(fill.quantity).toBe('1.48');
    expect(fill.notional).toBe('149.96');
    expect(fill.levels).toEqual([
      { price: '101', quantity: '1' },
      { price: '102', quantity: '0.48' },
    ]);
  });

  it('reports quote impact separately, not as a second cost', () => {
    const fill = executeEntry('long', book, '150', limits);
    expect(Number(fill.impactPct)).toBeGreaterThan(0);
    expect(fill.impactPct).toBe('0.32111319240032110891');
  });

  it('rejects insufficient depth instead of partially filling', () => {
    expect(() => executeEntry('long', book, '5000', limits)).toThrow(/depth/i);
  });

  it('accepts an exact-depth full fill without rejecting decimal dust', () => {
    const thin = validateBook([['2.9', '1']], [['3', '1000']]);
    const fill = executeEntry('long', thin, '100', { ...limits, minNotional: '1' });
    expect(Number(fill.notional)).toBeGreaterThan(99);
  });

  it('rejects crossed, empty and unordered books', () => {
    expect(() => validateBook([], [['101', '1']])).toThrow(/empty/i);
    expect(() => validateBook([['101', '1']], [['101', '1']])).toThrow(/crossed/i);
    expect(() => validateBook([['99', '1'], ['100', '1']], [['101', '1']])).toThrow(/order/i);
    expect(() => validateBook([['100', '-1']], [['101', '1']])).toThrow(/greater than zero/i);
  });

  it('enforces minimum notional and quantity bounds', () => {
    expect(() => executeEntry('long', book, '5', { ...limits, minNotional: '10' })).toThrow(/minimum notional/i);
    expect(() => executeEntry('long', book, '150', { ...limits, minQuantity: '2' })).toThrow(/minimum quantity/i);
    expect(() => executeEntry('long', book, '150', { ...limits, maxQuantity: '1' })).toThrow(/maximum quantity/i);
  });

  it('closes a long into bids and a short into asks', () => {
    const longExit = executeExit('long', book, '1.5', limits);
    expect(longExit.notional).toBe('149.5');
    expect(longExit.vwap).toBe('99.666666666666666667');
    const shortExit = executeExit('short', book, '1.5', limits);
    expect(shortExit.notional).toBe('152');
    expect(shortExit.vwap).toBe('101.33333333333333333');
  });

  it('refuses an exit that the book cannot fill completely', () => {
    expect(() => executeExit('long', book, '20', limits)).toThrow(/depth/i);
  });

  it('allows closing below the entry minimum notional', () => {
    const lowBook = validateBook([['9', '1']], [['11', '1']]);
    const fill = executeExit('long', lowBook, '1', { ...limits, minNotional: '10', minQuantity: '2', maxQuantity: '2' });
    expect(fill.notional).toBe('9');
  });

  it('refuses a single close above the current per-order maximum', () => {
    expect(() => executeExit('long', book, '2', { ...limits, maxQuantity: '1' })).toThrow(/per-order maximum/i);
  });

  it('reports exit impact against the executable side with a positive cost', () => {
    expect(Number(executeExit('long', book, '1.5', limits).impactPct)).toBeGreaterThan(0);
    expect(Number(executeExit('short', book, '1.5', limits).impactPct)).toBeGreaterThan(0);
  });
});
