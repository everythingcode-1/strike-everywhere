import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchDepth, fetchKlinesPage, fetchMarkets, fetchPremiumIndex, fetchReplayCandles, fetchTicker } from '../src/lib/api';
import { API_BASE_MAINNET } from '../src/shared/constants';

afterEach(() => vi.unstubAllGlobals());

function respond(body: unknown) {
  return vi.fn().mockResolvedValue({ ok: true, json: async () => body });
}

describe('public market data boundary', () => {
  it('uses mainnet without credentials or redirects', async () => {
    const fetcher = respond({ lastPrice: '100', priceChangePercent: '2', quoteVolume: '5000' });
    vi.stubGlobal('fetch', fetcher);
    await fetchTicker('BTC-USD');
    expect(fetcher.mock.calls[0][0]).toMatch(new RegExp(`^${API_BASE_MAINNET}`));
    expect(fetcher.mock.calls[0][1]).toMatchObject({ credentials: 'omit', redirect: 'error' });
    expect(fetcher.mock.calls[0][1].headers).toBeUndefined();
  });

  it('rejects non-finite numeric strings before they reach the UI', async () => {
    vi.stubGlobal('fetch', respond({ lastPrice: 'NaN', priceChangePercent: '2', quoteVolume: '5000' }));
    await expect(fetchTicker('BTC-USD')).rejects.toThrow();
  });

  it('rejects numeric coercion and malformed candle prices', async () => {
    vi.stubGlobal('fetch', respond([[0, 100, '101', '99', '100']]));
    await expect(fetchKlinesPage('BTC-USD', 0, 60_000)).rejects.toThrow();
    vi.stubGlobal('fetch', respond([[0, '100', '99', '101', '100']]));
    await expect(fetchKlinesPage('BTC-USD', 0, 60_000)).rejects.toThrow();
  });

  it('does not interpret a malformed order book as an empty book', async () => {
    vi.stubGlobal('fetch', respond({ bids: 'broken', asks: [] }));
    await expect(fetchDepth('BTC-USD')).rejects.toThrow();
  });

  it('rejects non-positive mark prices and invalid margin tiers', async () => {
    vi.stubGlobal('fetch', respond({ markPrice: '-1', indexPrice: '100', fundingRate: '0', nextFundingTime: 0 }));
    await expect(fetchPremiumIndex('BTC-USD')).rejects.toThrow();
    vi.stubGlobal('fetch', respond({ markets: { 'BTC-USD': { base_asset: 'BTC', quote_prec: 8, margin_tiers: [{ max_notional: '1000', maintenance_margin_rate: '1.1', maintenance_amount: '0', max_leverage: 0 }] } } }));
    await expect(fetchMarkets()).rejects.toThrow();
  });

  it('requests exactly 30 days of completed minutes in 29 bounded pages', async () => {
    const now = 43_200 * 60_000 + 45_000;
    const fetcher = vi.fn(async (url: string) => {
      const query = new URL(url).searchParams;
      const start = Number(query.get('startTime'));
      const end = Number(query.get('endTime'));
      const count = Math.floor((end - start) / 60_000) + 1;
      expect(query.get('priceType')).toBe('mark');
      expect(count).toBeLessThanOrEqual(1500);
      expect(start % 60_000).toBe(0);
      expect(end).toBeLessThan(Math.floor(now / 60_000) * 60_000);
      return { ok: true, json: async () => Array.from({ length: count }, (_, i) => [start + i * 60_000, '100', '101', '99', '100']) };
    });
    vi.stubGlobal('fetch', fetcher);
    const candles = await fetchReplayCandles('BTC-USD', now);
    expect(fetcher).toHaveBeenCalledTimes(29);
    expect(candles).toHaveLength(43_200);
    expect(candles[0].time).toBe(0);
    expect(candles.at(-1)?.time).toBe((43_200 - 1) * 60_000);
  });
});
