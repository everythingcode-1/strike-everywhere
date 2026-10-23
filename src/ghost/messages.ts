import type { GhostMessage } from '../shared/ghost-types';

const TYPES = new Set([
  'claim:get-pending',
  'claim:resolve',
  'jev:key-status',
  'jev:key-save',
  'jev:key-clear',
  'jev:analyze',
  'ghost:preview',
  'ghost:create',
  'ghost:list',
  'ghost:detail',
  'ghost:refresh',
  'ghost:close-preview',
  'ghost:close',
  'receipt:get',
  'receipt:list',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function str(source: Record<string, unknown>, key: string, max: number): string | null {
  const value = source[key];
  return typeof value === 'string' && value.length > 0 && value.length <= max ? value : null;
}

function optionalStr(source: Record<string, unknown>, key: string, max: number): string | null | undefined {
  const value = source[key];
  if (value === undefined) return undefined;
  return str(source, key, max);
}

function int(source: Record<string, unknown>, key: string): number | null {
  const value = source[key];
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : null;
}

function side(source: Record<string, unknown>): 'long' | 'short' | null {
  return source.side === 'long' || source.side === 'short' ? source.side : null;
}

function inputMode(source: Record<string, unknown>): 'collateral' | 'notional' | null {
  return source.inputMode === 'collateral' || source.inputMode === 'notional' ? source.inputMode : null;
}

export function isGhostMessageType(value: unknown): boolean {
  return typeof value === 'string' && TYPES.has(value);
}

/** Validates the whole payload before a privileged handler sees it. */
export function parseGhostMessage(message: unknown): GhostMessage | null {
  if (!isRecord(message) || !isGhostMessageType(message.type)) return null;
  const type = message.type as GhostMessage['type'];
  switch (type) {
    case 'claim:get-pending':
    case 'jev:key-status':
    case 'jev:key-clear':
    case 'ghost:list':
    case 'receipt:list':
      return { type };
    case 'claim:resolve': {
      const claimId = str(message, 'claimId', 100);
      return claimId ? { type, claimId } : null;
    }
    case 'jev:key-save': {
      const key = str(message, 'key', 300);
      const provider = message.provider;
      if (!key || (provider !== 'typesafe' && provider !== 'openrouter')) return null;
      const model = optionalStr(message, 'model', 120);
      if (message.model !== undefined && model === null) return null;
      return { type, provider, key, ...(model ? { model } : {}) };
    }
    case 'jev:analyze': {
      const claimId = str(message, 'claimId', 100);
      if (!claimId || message.consent !== true) return null;
      return { type, claimId, consent: true };
    }
    case 'ghost:preview':
    case 'ghost:create': {
      const symbol = str(message, 'symbol', 30);
      const choice = side(message);
      const mode = inputMode(message);
      const amount = str(message, 'amount', 40);
      const leverage = int(message, 'leverage');
      const feeRate = str(message, 'feeRate', 20);
      if (!symbol || !choice || !mode || !amount || !leverage || !feeRate) return null;
      if (type === 'ghost:preview') {
        return { type, symbol, side: choice, inputMode: mode, amount, leverage, feeRate };
      }
      const requestId = str(message, 'requestId', 100);
      const claimId = optionalStr(message, 'claimId', 100);
      if (!requestId) return null;
      if (message.claimId !== undefined && claimId === null) return null;
      return { type, requestId, claimId: claimId ?? undefined, symbol, side: choice, inputMode: mode, amount, leverage, feeRate };
    }
    case 'ghost:detail':
    case 'ghost:refresh':
    case 'ghost:close-preview':
    case 'receipt:get': {
      const tradeId = str(message, 'tradeId', 100);
      return tradeId ? { type, tradeId } : null;
    }
    case 'ghost:close': {
      const tradeId = str(message, 'tradeId', 100);
      const requestId = str(message, 'requestId', 100);
      return tradeId && requestId ? { type, tradeId, requestId } : null;
    }
    default:
      return null;
  }
}
