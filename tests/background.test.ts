import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const now = Date.UTC(2026, 9, 22, 12);
const start = now - 43_200 * 60_000;
const candles = Array.from({ length: 43_200 }, (_, i) => ({ time: start + i * 60_000, open: '100', high: '100', low: i === 1 ? '92' : '100', close: '100' }));
const tiers = [{ maxNotional: '1000000', mmr: '0.01', maintenanceAmount: '0', maxLeverage: 20 }];

vi.mock('../src/lib/cache', () => ({ readCache: vi.fn(async () => undefined), writeCache: vi.fn(async () => undefined) }));
vi.mock('../src/lib/symbols', () => ({
  loadRegistry: vi.fn(async () => ({ symbols: [{ baseAsset: 'BTC', symbol: 'BTC-USD', quotePrecision: 8, highConfidence: false }] })),
  registryIndex: (registry: { symbols: { baseAsset: string }[] }) => new Map(registry.symbols.map((symbol) => [symbol.baseAsset, symbol])),
}));
vi.mock('../src/lib/api', async (original) => ({
  ...await original<typeof import('../src/lib/api')>(),
  fetchMarkets: vi.fn(async () => ({ 'BTC-USD': { baseAsset: 'BTC', quotePrecision: 8, tiers } })),
  fetchTicker: vi.fn(async () => ({ changePercent: '0', quoteVolume: '1000' })),
  fetchPremiumIndex: vi.fn(async () => ({ markPrice: '100', indexPrice: '100', fundingRate: '0', nextFundingTime: now + 3_600_000 })),
  fetchOpenInterest: vi.fn(async () => '10'),
  fetchDepth: vi.fn(async () => ({ bids: [['99', '100']], asks: [['105', '100']], time: now })),
  fetchReplayCandles: vi.fn(async () => candles),
  fetchBookTicker: vi.fn(async () => { throw new Error('Optional extras unavailable'); }),
  fetchKlines1h: vi.fn(async () => []),
}));

let listener: (message: unknown, sender: unknown, callback: (value: unknown) => void) => void;
beforeAll(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(now);
  vi.stubGlobal('chrome', {
    runtime: { onMessage: { addListener: (handler: typeof listener) => { listener = handler; } }, onInstalled: { addListener: vi.fn() } },
    storage: { local: { get: vi.fn(async () => ({})), set: vi.fn(async () => undefined) } },
  });
  await import('../src/background/index');
});
afterAll(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

function dispatch(message: unknown): Promise<unknown> {
  return new Promise((resolve) => listener(message, {}, resolve));
}

describe('simulation message integration', () => {
  it('returns default settings without overwriting a concurrent user preference', async () => {
    const set = chrome.storage.local.set;
    vi.mocked(set).mockClear();
    expect(await dispatch({ type: 'settings:get' })).toMatchObject({ enabled: true, allSites: false });
    expect(set).not.toHaveBeenCalled();
  });

  it('preserves entry slippage against a mark-anchored historical path', async () => {
    const response = await dispatch({ type: 'replay:run', symbol: 'BTC-USD', sizeUsd: '1000', leverage: '10', side: 'long' });
    expect(response).toMatchObject({ status: 'liquidated', entryPrice: '105', firstLiquidationAt: start + 60_000 });
  });

  it('keeps the core simulation available when optional market extras fail', async () => {
    const response = await dispatch({ type: 'simulate:run', symbol: 'BTC-USD', sizeUsd: '1000', leverage: '10', side: 'long', marginMode: 'cross' });
    expect(response).toMatchObject({ approximate: true, replay: { status: 'liquidated' }, extras: { spread: null } });
  });

  it('refuses to label cross-margin math as an isolated simulation', async () => {
    expect(await dispatch({ type: 'simulate:run', symbol: 'BTC-USD', sizeUsd: '1000', leverage: '10', side: 'long', marginMode: 'isolated' })).toMatchObject({ error: expect.stringContaining('Isolated margin is not supported') });
  });

  it('blocks privileged ledger messages from a non-extension sender', async () => {
    expect(await dispatch({ type: 'ghost:list' })).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } });
    expect(await dispatch({ type: 'jev:key-status' })).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } });
  });
});
