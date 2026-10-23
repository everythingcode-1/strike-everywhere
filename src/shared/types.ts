export type Side = 'long' | 'short';

export type CardState = 'loading' | 'ready' | 'not-tradable' | 'offline-cached' | 'error';

export interface SymbolEntry {
  baseAsset: string;
  symbol: string;
  quotePrecision: number;
  highConfidence: boolean;
}

export interface SymbolRegistry {
  generatedAt: string;
  source: string;
  symbols: SymbolEntry[];
}

/** All monetary fields stay strings until they become Decimals. */
export interface Tier {
  maxNotional: string;
  mmr: string;
  maintenanceAmount: string;
  maxLeverage: number;
}

export interface MarketSnapshot {
  symbol: string;
  baseAsset: string;
  markPrice: string;
  changePercent: string;
  fundingRate: string;
  nextFundingTime: number;
  openInterest: string;
  quoteVolume: string;
  tiers: Tier[];
  quotePrecision: number;
  fetchedAt: number;
  tiersApproximate?: boolean;
}

export interface MarketResult {
  state: CardState;
  snapshot?: MarketSnapshot;
  cachedAt?: number;
  message?: string;
}

export interface Settings {
  enabled: boolean;
  allSites: boolean;
  sites: Record<string, boolean>;
}

export interface ReplayEvent {
  time: number;
  price: string;
  marginRatio: string;
  reduced: string;
  remaining: string;
}

export interface ReplayResult {
  status: 'survived' | 'liquidated';
  events: ReplayEvent[];
  firstLiquidationAt: number | null;
  worstDrawdownPct: string;
  remainingSize: string;
  candles: number;
}

export type Message =
  | { type: 'market:get'; symbol: string }
  | { type: 'replay:run'; symbol: string; sizeUsd: string; leverage: string; side: Side }
  | { type: 'registry:get' }
  | { type: 'settings:get' }
  | { type: 'settings:set'; settings: Settings }
  | { type: 'open:market'; symbol: string };
