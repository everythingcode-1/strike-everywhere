import bundledJson from '../data/symbols.generated.json';
import { REGISTRY_TTL_MS } from '../shared/constants';
import type { SymbolEntry, SymbolRegistry } from '../shared/types';
import { fetchRegistry } from './api';
import { readCache, writeCache } from './cache';

const REGISTRY_KEY = 'registry';
const bundled = bundledJson as unknown as SymbolRegistry;

const confidence = new Map(bundled.symbols.map((entry) => [entry.baseAsset, entry.highConfidence]));

export function bundledRegistry(): SymbolRegistry {
  return bundled;
}

export function registryIndex(registry: SymbolRegistry): Map<string, SymbolEntry> {
  return new Map(registry.symbols.map((entry) => [entry.baseAsset, entry]));
}

export async function loadRegistry(now = Date.now()): Promise<SymbolRegistry> {
  const cached = await readCache<SymbolRegistry>(REGISTRY_KEY);
  if (cached && now - cached.savedAt < REGISTRY_TTL_MS && cached.value.symbols.length > 0) {
    return cached.value;
  }
  try {
    const fresh = await fetchRegistry();
    const merged: SymbolRegistry = {
      ...fresh,
      symbols: fresh.symbols.map((entry) => ({
        ...entry,
        highConfidence: confidence.get(entry.baseAsset) ?? false,
      })),
    };
    await writeCache(REGISTRY_KEY, merged);
    return merged;
  } catch {
    return cached?.value ?? bundled;
  }
}
