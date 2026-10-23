import { beforeEach, describe, expect, it, vi } from 'vitest';

const memory = vi.hoisted(() => new Map<string, unknown>());
const market = vi.hoisted(() => ({
  mark: '100',
  bids: [['95', '100']] as [string, string][],
  asks: [['105', '100']] as [string, string][],
}));

vi.mock('idb-keyval', () => ({
  createStore: () => ({}),
  get: async (key: string) => memory.get(key),
  set: async (key: string, value: unknown) => { memory.set(key, structuredClone(value)); },
  setMany: async (entries: Array<[string, unknown]>) => {
    for (const [key, value] of entries) memory.set(key, structuredClone(value));
  },
  getMany: async (keys: string[]) => keys.map((key) => memory.get(key)),
  keys: async () => [...memory.keys()],
}));
vi.mock('../src/lib/cache', () => ({ readCache: async () => undefined, writeCache: async () => undefined }));
vi.mock('../src/lib/symbols', () => ({
  loadRegistry: async () => ({
    symbols: [{ symbol: 'BTC-USD', baseAsset: 'BTC', quotePrecision: 8, highConfidence: true }],
  }),
}));
vi.mock('../src/lib/api', () => ({
  fetchExchangeInfo: async () => [{
    symbol: 'BTC-USD',
    baseAsset: 'BTC',
    quoteAsset: 'USDT',
    marginAsset: 'USDT',
    contractType: 'PERPETUAL',
    status: 'trading',
    quotePrecision: 8,
    orderType: ['MARKET'],
    filters: [
      { filterType: 'PRICE_FILTER', tickSize: '1' },
      { filterType: 'LOT_SIZE', stepSize: '0.01', minQty: '0.01', maxQty: '1000' },
      { filterType: 'MIN_NOTIONAL', notional: '1' },
    ],
  }],
  fetchPremiumIndex: async () => ({
    markPrice: market.mark,
    indexPrice: market.mark,
    fundingRate: '0',
    nextFundingTime: Date.now() + 3_600_000,
    sourceTime: Date.now(),
  }),
  fetchDepth: async () => ({ bids: market.bids, asks: market.asks, sourceTime: Date.now(), time: Date.now() }),
}));

import { previewTrade, createTrade } from '../src/ghost/service';

const input = {
  symbol: 'BTC-USD',
  side: 'long' as const,
  inputMode: 'notional' as const,
  amount: '105',
  leverage: 5,
  feeRate: '0.0005',
};

beforeEach(() => {
  memory.clear();
  market.mark = '100';
  market.bids = [['95', '100']];
  market.asks = [['105', '100']];
});

describe('preview and immediate open summary share one mark-based basis', () => {
  it('matches the audit regression: long entry above mark', async () => {
    const preview = await previewTrade(input);
    const detail = await createTrade({ ...input, requestId: 'preview-long-0001' });
    expect(preview.entryPrice).toBe('105');
    expect(preview.grossPnlAtMark).toBe('-5');
    expect(preview.entryFee).toBe('0.0525');
    expect(preview.estimatedExitFee).toBe('0.05');
    expect(preview.netAtEntry).toBe('-5.1025');
    expect(detail.summary.grossPnl).toBe('-5');
    expect(detail.summary.exitFee).toBe('0.05');
    expect(detail.summary.netExcludingUnknownFunding).toBe(preview.netAtEntry);
  });

  it('matches for a short entry below mark', async () => {
    market.bids = [['95', '100']];
    const short = { ...input, side: 'short' as const, amount: '95' };
    const preview = await previewTrade(short);
    const detail = await createTrade({ ...short, requestId: 'preview-short-0001' });
    expect(preview.entryPrice).toBe('95');
    expect(preview.grossPnlAtMark).toBe('-5');
    expect(preview.netAtEntry).toBe(detail.summary.netExcludingUnknownFunding);
  });

  it('matches when mark equals the entry price', async () => {
    market.mark = '105';
    market.asks = [['105', '100']];
    const preview = await previewTrade(input);
    const detail = await createTrade({ ...input, requestId: 'preview-flat-0001' });
    expect(preview.grossPnlAtMark).toBe('0');
    expect(preview.netAtEntry).toBe(detail.summary.netExcludingUnknownFunding);
    expect(preview.netAtEntry).toBe('-0.105');
  });

  it('matches after a multi-level entry', async () => {
    market.asks = [['105', '0.5'], ['106', '0.5']];
    const preview = await previewTrade({ ...input, amount: '105.5' });
    const detail = await createTrade({ ...input, amount: '105.5', requestId: 'preview-multi-0001' });
    expect(preview.entryPrice).toBe('105.5');
    expect(preview.grossPnlAtMark).toBe('-5.5');
    expect(preview.netAtEntry).toBe(detail.summary.netExcludingUnknownFunding);
  });
});
