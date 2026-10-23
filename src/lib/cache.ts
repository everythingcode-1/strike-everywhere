import { get, set } from 'idb-keyval';
import { API_BASE } from '../shared/constants';

export interface Cached<T> {
  value: T;
  savedAt: number;
}

export async function readCache<T>(key: string): Promise<Cached<T> | undefined> {
  const cached = await get<Cached<T>>(`risk-v2:${API_BASE}:${key}`);
  return cached && typeof cached.savedAt === 'number' ? cached : undefined;
}

export async function writeCache<T>(key: string, value: T): Promise<void> {
  await set(`risk-v2:${API_BASE}:${key}`, { value, savedAt: Date.now() } satisfies Cached<T>);
}
