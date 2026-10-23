import { describe, expect, it } from 'vitest';
import { assertFreshBook, assertFreshSource, parseVerifiedRules } from '../src/ghost/market';

const raw = {
  symbol: 'BTC-USD',
  pair: 'BTC-USD',
  contractType: 'PERPETUAL',
  status: 'trading',
  baseAsset: 'BTC',
  quoteAsset: 'USDT',
  marginAsset: 'USDT',
  quotePrecision: 8,
  orderType: ['LIMIT', 'MARKET'],
  filters: [
    { filterType: 'PRICE_FILTER', minPrice: '10', maxPrice: '100000', tickSize: '1' },
    { filterType: 'LOT_SIZE', minQty: '0.00001', maxQty: '1000', stepSize: '0.00001' },
    { filterType: 'MARKET_LOT_SIZE', minQty: '0.00001', maxQty: '120', stepSize: '0.00001' },
    { filterType: 'MIN_NOTIONAL', notional: '10' },
  ],
};

describe('verified market rules', () => {
  it('reads the trading filters from exchange info', () => {
    const rules = parseVerifiedRules(raw, 'BTC-USD', 123);
    expect(rules).toMatchObject({
      symbol: 'BTC-USD',
      baseAsset: 'BTC',
      quoteAsset: 'USDT',
      tickSize: '1',
      quantityStep: '0.00001',
      minQuantity: '0.00001',
      maxQuantity: '120',
      minNotional: '10',
      receivedAt: 123,
    });
  });

  it('rejects symbols whose metadata cannot support a linear market order', () => {
    expect(() => parseVerifiedRules({ ...raw, marginAsset: 'BTC' }, 'BTC-USD', 0)).toThrow(/linear/i);
    expect(() => parseVerifiedRules({ ...raw, orderType: ['LIMIT'] }, 'BTC-USD', 0)).toThrow(/market orders/i);
    expect(() => parseVerifiedRules({ ...raw, filters: [] }, 'BTC-USD', 0)).toThrow(/filter/i);
    expect(() => parseVerifiedRules({ ...raw, symbol: 'ETH-USD' }, 'BTC-USD', 0)).toThrow(/another symbol/i);
  });

  it('blocks stale, future and untimestamped sources', () => {
    const now = 1_000_000;
    expect(assertFreshSource(now - 15_000, now)).toBe(now - 15_000);
    expect(() => assertFreshSource(now - 15_001, now)).toThrow(/stale/i);
    expect(() => assertFreshSource(now + 5_001, now)).toThrow(/future/i);
    expect(() => assertFreshSource(null, now)).toThrow(/timestamp/i);
    expect(() => assertFreshBook(null, now)).toThrow(/timestamp/i);
  });
});
