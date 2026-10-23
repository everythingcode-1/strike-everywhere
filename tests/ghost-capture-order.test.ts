import { beforeEach, describe, expect, it, vi } from 'vitest';

const memory = vi.hoisted(() => ({
  claims: new Map<string, unknown>(),
  pending: undefined as string | undefined,
  registryCalls: [] as Array<() => void>,
  defer: false,
}));

vi.mock('idb-keyval', () => ({
  createStore: () => ({}),
  get: async (key: string) => {
    if (key === 'claim:pending') return memory.pending;
    return memory.claims.get(key);
  },
  set: async (key: string, value: unknown) => {
    if (key === 'claim:pending') memory.pending = value as string;
    else memory.claims.set(key, structuredClone(value));
  },
  setMany: async (entries: Array<[string, unknown]>) => {
    for (const [key, value] of entries) {
      if (key === 'claim:pending') memory.pending = value as string;
      else memory.claims.set(key, structuredClone(value));
    }
  },
  getMany: async (keys: string[]) => keys.map((key) => (key === 'claim:pending' ? memory.pending : memory.claims.get(key))),
  keys: async () => [...memory.claims.keys()],
}));
vi.mock('../src/lib/cache', () => ({ readCache: async () => undefined, writeCache: async () => undefined }));
vi.mock('../src/lib/symbols', () => ({
  loadRegistry: async () => {
    if (memory.defer) await new Promise<void>((resolve) => memory.registryCalls.push(resolve));
    return { symbols: [{ symbol: 'BTC-USD', baseAsset: 'BTC', quotePrecision: 8, highConfidence: true }] };
  },
}));
vi.mock('../src/lib/api', () => ({}));

import { captureClaim, pendingClaim } from '../src/ghost/service';
import { getClaim } from '../src/ghost/store';

beforeEach(() => {
  memory.claims.clear();
  memory.pending = undefined;
  memory.registryCalls = [];
  memory.defer = false;
});

describe('capture ordering', () => {
  it('keeps the newer claim pending when an older capture finishes last', async () => {
    memory.defer = true;
    const first = captureClaim('Bitcoin FIRST claim', 'https://example.com/first', 1_000);
    const second = captureClaim('Bitcoin SECOND claim', 'https://example.com/second', 2_000);
    expect(memory.registryCalls).toHaveLength(2);
    memory.registryCalls[1]();
    const secondResult = await second;
    expect(secondResult.latest).toBe(true);
    expect((await pendingClaim())?.text).toContain('SECOND');
    memory.registryCalls[0]();
    const firstResult = await first;
    expect(firstResult.latest).toBe(false);
    expect((await pendingClaim())?.text).toContain('SECOND');
    expect(await getClaim(firstResult.claim.id)).toBeDefined();
  });

  it('orders two captures in the same millisecond', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(1_000_000);
    const first = await captureClaim('Bitcoin first same-ms', 'https://example.com/a', 10);
    const second = await captureClaim('Bitcoin second same-ms', 'https://example.com/b', 11);
    expect(first.latest).toBe(true);
    expect(second.latest).toBe(true);
    expect((await pendingClaim())?.text).toContain('second same-ms');
  });
});
