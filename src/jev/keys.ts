import type { AiProvider, KeyStatus } from '../shared/ghost-types';
import { OPENROUTER_MODEL } from '../ghost/constants';
import { GhostError } from '../ghost/errors';

const CONFIG = 'jev:config';
const LEGACY_KEY = 'jev:api-key';
const TRUSTED = 'TRUSTED_CONTEXTS' as const;
const PROVIDERS: readonly AiProvider[] = ['typesafe', 'openrouter'];
const KEY_PATTERN = /^[\x21-\x7E]+$/;
const MODEL_PATTERN = /^~?[A-Za-z0-9._:/-]+$/;

export interface AiConfig {
  provider: AiProvider;
  key: string;
  model: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isProvider(value: unknown): value is AiProvider {
  return typeof value === 'string' && PROVIDERS.includes(value as AiProvider);
}

function isKey(value: unknown): value is string {
  return typeof value === 'string'
    && value === value.trim()
    && value.length >= 20
    && value.length <= 300
    && KEY_PATTERN.test(value);
}

function isModel(value: unknown): value is string {
  return typeof value === 'string'
    && value.length > 0
    && value.length <= 120
    && MODEL_PATTERN.test(value);
}

function readStoredConfig(value: unknown): AiConfig | null {
  if (!isRecord(value) || !isProvider(value.provider) || !isKey(value.key)) return null;
  if (value.model !== null && !isModel(value.model)) return null;
  return {
    provider: value.provider,
    key: value.key,
    model: value.model ?? (value.provider === 'openrouter' ? OPENROUTER_MODEL : null),
  };
}

async function restrictStorage(): Promise<void> {
  try {
    await chrome.storage.local.setAccessLevel({ accessLevel: TRUSTED });
  } catch {
    // Older Chrome builds do not expose access levels; the key stays in extension storage.
  }
}

async function readConfig(): Promise<AiConfig | null> {
  const stored = await chrome.storage.local.get([CONFIG, LEGACY_KEY]);
  const config = readStoredConfig(stored[CONFIG]);
  if (config) return config;
  const legacy = stored[LEGACY_KEY];
  if (!isKey(legacy)) return null;
  const migrated: AiConfig = legacy.startsWith('sk-or-')
    ? { provider: 'openrouter', key: legacy, model: OPENROUTER_MODEL }
    : { provider: 'typesafe', key: legacy, model: null };
  await chrome.storage.local.set({ [CONFIG]: migrated });
  return migrated;
}

export async function saveKey(provider: AiProvider, key: string, model?: string): Promise<KeyStatus> {
  if (!isProvider(provider)) throw new GhostError('INVALID_INPUT', 'Choose a supported AI provider.');
  if (!isKey(key)) throw new GhostError('INVALID_INPUT', 'Enter a valid API key.');
  let normalizedModel: string | null = null;
  if (provider === 'openrouter') {
    normalizedModel = typeof model === 'string' && model.trim() ? model.trim() : OPENROUTER_MODEL;
    if (!isModel(normalizedModel)) throw new GhostError('INVALID_INPUT', 'Enter a valid model ID.');
  }
  await restrictStorage();
  await chrome.storage.local.set({ [CONFIG]: { provider, key, model: normalizedModel } });
  await chrome.storage.local.remove(LEGACY_KEY);
  return { configured: true, provider, model: normalizedModel };
}

export async function keyStatus(): Promise<KeyStatus> {
  const config = await readConfig();
  return config
    ? { configured: true, provider: config.provider, model: config.model }
    : { configured: false, provider: 'typesafe', model: null };
}

export async function getConfig(): Promise<AiConfig | null> {
  return readConfig();
}

export async function clearKey(): Promise<KeyStatus> {
  await chrome.storage.local.remove([CONFIG, LEGACY_KEY]);
  return { configured: false, provider: 'typesafe', model: null };
}
