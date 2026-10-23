import { beforeEach, describe, expect, it, vi } from 'vitest';

const memory = vi.hoisted(() => new Map<string, unknown>());
const clock = vi.hoisted(() => ({ now: Date.UTC(2026, 9, 20) }));

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
    markPrice: '100',
    indexPrice: '100',
    fundingRate: '0',
    nextFundingTime: clock.now + 3_600_000,
    sourceTime: clock.now,
  }),
  fetchDepth: async () => ({ bids: [['99', '1000']], asks: [['101', '1000']], sourceTime: clock.now, time: clock.now }),
}));

import { buildReceipt, closeTrade, createTrade, refreshTrade } from '../src/ghost/service';

const DAY = 24 * 60 * 60 * 1000;

beforeEach(() => {
  memory.clear();
  clock.now = Date.UTC(2026, 9, 20);
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(clock.now);
});

async function makeTrade(requestId: string): Promise<string> {
  const created = await createTrade({
    requestId,
    symbol: 'BTC-USD',
    side: 'long',
    inputMode: 'collateral',
    amount: '100',
    leverage: 1,
    feeRate: '0.0005',
  });
  return created.trade.id;
}

describe('direct virtual close records monitoring gaps', () => {
  it('records one gap when a trade is closed after a day without observations', async () => {
    const tradeId = await makeTrade('gap-create-0001');
    clock.now += DAY;
    vi.setSystemTime(clock.now);
    await closeTrade(tradeId, 'gap-close-0001');
    const receipt = await buildReceipt(tradeId);
    expect(receipt.dataQuality.gaps).toBe(1);
    expect(receipt.events.map((event) => event.eventType)).toEqual([
      'created',
      'monitoring_gap',
      'close_requested',
      'closed_virtual',
    ]);
    await closeTrade(tradeId, 'gap-close-0002');
    expect((await buildReceipt(tradeId)).dataQuality.gaps).toBe(1);
  });

  it('does not record a gap before the threshold', async () => {
    const tradeId = await makeTrade('gap-create-0002');
    clock.now += 5 * 60_000;
    vi.setSystemTime(clock.now);
    await closeTrade(tradeId, 'gap-close-0003');
    expect((await buildReceipt(tradeId)).dataQuality.gaps).toBe(0);
  });

  it('does not duplicate a gap already recorded by refresh', async () => {
    const tradeId = await makeTrade('gap-create-0003');
    clock.now += DAY;
    vi.setSystemTime(clock.now);
    await refreshTrade(tradeId);
    await closeTrade(tradeId, 'gap-close-0004');
    const receipt = await buildReceipt(tradeId);
    expect(receipt.dataQuality.gaps).toBe(1);
    expect(receipt.events.filter((event) => event.eventType === 'monitoring_gap')).toHaveLength(1);
  });
});
