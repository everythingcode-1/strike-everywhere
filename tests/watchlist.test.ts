import { describe, expect, it } from 'vitest';
import { buildWatchlist } from '../src/lib/watchlist';
import type { SymbolRegistry } from '../src/shared/types';

const registry: SymbolRegistry = {
  generatedAt: '2026-10-21T00:00:00.000Z',
  source: 'test',
  symbols: [
    { baseAsset: 'BTC', symbol: 'BTC-USD', quotePrecision: 2, highConfidence: true },
    { baseAsset: 'ETH', symbol: 'ETH-USD', quotePrecision: 2, highConfidence: true },
    { baseAsset: 'ADA', symbol: 'ADA-USD', quotePrecision: 2, highConfidence: true },
  ],
};

const tickers = [
  { symbol: 'BTC-USD', lastPrice: '100', priceChangePercent: '5', quoteVolume: '1000' },
  { symbol: 'ETH-USD', lastPrice: '200', priceChangePercent: '-10', quoteVolume: '2000' },
  { symbol: 'ADA-USD', lastPrice: '1', priceChangePercent: '1', quoteVolume: '3000' },
  { symbol: 'UNKNOWN-USD', lastPrice: '1', priceChangePercent: '20', quoteVolume: '4000' },
];

const premiums = [
  { symbol: 'BTC-USD', markPrice: '100', fundingRate: '0.0001', nextFundingTime: 1 },
  { symbol: 'ETH-USD', markPrice: '200', fundingRate: '-0.0002', nextFundingTime: 1 },
];

describe('buildWatchlist', () => {
  it('filters to registry symbols and joins premiums', () => {
    const result = buildWatchlist(tickers, premiums, registry, 2);
    expect(result.movers).toHaveLength(2);
    expect(result.movers[0].symbol).toBe('ETH-USD');
    expect(result.movers[1].symbol).toBe('BTC-USD');
    expect(result.movers.every((row) => row.symbol !== 'UNKNOWN-USD')).toBe(true);
  });

  it('sorts funding by absolute rate', () => {
    const result = buildWatchlist(tickers, premiums, registry, 2);
    expect(result.funding[0].symbol).toBe('ETH-USD');
    expect(result.funding[1].symbol).toBe('BTC-USD');
  });

  it('defaults missing premium funding to zero', () => {
    const result = buildWatchlist(tickers, premiums, registry, 3);
    const ada = result.movers.find((row) => row.symbol === 'ADA-USD');
    expect(ada?.fundingRate).toBe('0');
  });
});
