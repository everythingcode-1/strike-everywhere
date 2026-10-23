import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearKey, getConfig, keyStatus, saveKey } from '../src/jev/keys';

const store = new Map<string, unknown>();

function sessionGet(keys: string | string[]): Promise<Record<string, unknown>> {
  const list = Array.isArray(keys) ? keys : [keys];
  const result: Record<string, unknown> = {};
  for (const key of list) if (store.has(key)) result[key] = store.get(key);
  return Promise.resolve(result);
}

function sessionSet(items: Record<string, unknown>): Promise<void> {
  for (const [key, value] of Object.entries(items)) store.set(key, value);
  return Promise.resolve();
}

function sessionRemove(keys: string | string[]): Promise<void> {
  for (const key of Array.isArray(keys) ? keys : [keys]) store.delete(key);
  return Promise.resolve();
}

beforeEach(() => {
  store.clear();
  vi.stubGlobal('chrome', {
    storage: {
      local: {
        get: vi.fn(sessionGet),
        set: vi.fn(sessionSet),
        remove: vi.fn(sessionRemove),
        setAccessLevel: vi.fn(async () => undefined),
      },
    },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('AI provider key config', () => {
  it('stores the selected provider and model', async () => {
    const status = await saveKey('openrouter', `sk-or-v1-${'a'.repeat(60)}`, 'openai/gpt-4o-mini');
    expect(status).toEqual({ configured: true, provider: 'openrouter', model: 'openai/gpt-4o-mini' });
    expect(await keyStatus()).toEqual(status);
    expect(await getConfig()).toMatchObject({ provider: 'openrouter', model: 'openai/gpt-4o-mini' });
  });

  it('migrates legacy TypeSafe and OpenRouter keys', async () => {
    store.set('jev:api-key', `ts-${'b'.repeat(30)}`);
    expect(await keyStatus()).toEqual({ configured: true, provider: 'typesafe', model: null });
    store.clear();
    store.set('jev:api-key', `sk-or-v1-${'b'.repeat(30)}`);
    expect(await keyStatus()).toMatchObject({ configured: true, provider: 'openrouter', model: 'jev-latest' });
  });

  it('accepts the official OpenRouter Jev alias', async () => {
    await expect(saveKey('openrouter', `sk-or-v1-${'a'.repeat(60)}`, '~typesafe/jev-latest')).resolves.toMatchObject({ model: '~typesafe/jev-latest' });
  });

  it('clears the config and rejects invalid input', async () => {
    await saveKey('typesafe', `ts-${'c'.repeat(30)}`);
    expect((await clearKey()).configured).toBe(false);
    expect(await getConfig()).toBeNull();
    await expect(saveKey('openrouter', 'short')).rejects.toThrow();
    await expect(saveKey('openrouter', `sk-${'d'.repeat(30)}`, 'bad model!')).rejects.toThrow();
    await expect(saveKey('nope' as never, `sk-${'e'.repeat(30)}`)).rejects.toThrow();
  });
});
