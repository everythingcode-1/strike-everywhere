import Decimal from 'decimal.js';
import { API_BASE, CANDLE_LIMIT, DAY_MS, REPLAY_DAYS } from '../shared/constants';
import type { SymbolRegistry, Tier } from '../shared/types';
import type { Candle } from '../risk/types';

const REQUEST_TIMEOUT_MS = 10_000;
const RETRIES = 2;

export class ApiError extends Error {}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function str(source: Record<string, unknown>, key: string): string {
  const value = source[key];
  if (typeof value !== 'string') throw new ApiError(`Missing string field: ${key}`);
  return value;
}

function decimalString(source: Record<string, unknown>, key: string, minimum?: 'positive' | 'nonnegative'): string {
  const value = str(source, key);
  try {
    const decimal = new Decimal(value);
    if (value.trim() && decimal.isFinite() && (minimum !== 'positive' || decimal.gt(0)) && (minimum !== 'nonnegative' || decimal.gte(0))) return value;
  } catch { /* Reject malformed API values before rendering them. */ }
  throw new ApiError(`Invalid decimal field: ${key}`);
}

function num(source: Record<string, unknown>, key: string): number {
  const value = source[key];
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) throw new ApiError(`Invalid integer field: ${key}`);
  return value;
}

async function fetchJson(path: string): Promise<unknown> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= RETRIES; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(`${API_BASE}${path}`, { signal: controller.signal, credentials: 'omit', redirect: 'error' });
      if (!response.ok) throw new ApiError(`${path} returned ${response.status}`);
      return await response.json();
    } catch (error) {
      lastError = error;
      if (attempt < RETRIES) await new Promise((resolve) => setTimeout(resolve, 300 * (attempt + 1)));
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError instanceof Error ? lastError : new ApiError(`${path} failed`);
}

export interface MarketTicker {
  lastPrice: string;
  changePercent: string;
  quoteVolume: string;
}

export interface PremiumIndex {
  markPrice: string;
  indexPrice: string;
  fundingRate: string;
  nextFundingTime: number;
  sourceTime: number | null;
}

export interface RawMarket {
  baseAsset: string;
  quotePrecision: number;
  tiers: Tier[];
}

export async function fetchTicker(symbol: string): Promise<MarketTicker> {
  const body = await fetchJson(`/price/v2/ticker/24hr?symbol=${encodeURIComponent(symbol)}`);
  if (!isRecord(body)) throw new ApiError('Malformed ticker');
  return {
    lastPrice: decimalString(body, 'lastPrice', 'positive'),
    changePercent: decimalString(body, 'priceChangePercent'),
    quoteVolume: decimalString(body, 'quoteVolume', 'nonnegative'),
  };
}

export async function fetchPremiumIndex(symbol: string): Promise<PremiumIndex> {
  const body = await fetchJson(`/price/v2/premiumIndex?symbol=${encodeURIComponent(symbol)}`);
  if (!isRecord(body)) throw new ApiError('Malformed premiumIndex');
  return {
    markPrice: decimalString(body, 'markPrice', 'positive'),
    indexPrice: decimalString(body, 'indexPrice', 'positive'),
    fundingRate: decimalString(body, 'fundingRate'),
    nextFundingTime: num(body, 'nextFundingTime'),
    sourceTime: typeof body.time === 'number' && Number.isSafeInteger(body.time) ? body.time : null,
  };
}

export async function fetchOpenInterest(symbol: string): Promise<string> {
  const body = await fetchJson(`/price/v2/openInterest?symbol=${encodeURIComponent(symbol)}`);
  if (!isRecord(body)) throw new ApiError('Malformed openInterest');
  return decimalString(body, 'openInterest', 'nonnegative');
}

export async function fetchMarkets(): Promise<Record<string, RawMarket>> {
  const body = await fetchJson('/v2/markets');
  if (!isRecord(body) || !isRecord(body.markets)) throw new ApiError('Malformed markets');
  const result: Record<string, RawMarket> = {};
  for (const [symbol, raw] of Object.entries(body.markets)) {
    if (!isRecord(raw)) continue;
    const rawTiers = raw.margin_tiers;
    if (!Array.isArray(rawTiers) || rawTiers.length === 0) continue;
    const tiers: Tier[] = rawTiers.map((item) => {
      if (!isRecord(item)) throw new ApiError(`Malformed tier for ${symbol}`);
      return {
        maxNotional: decimalString(item, 'max_notional', 'positive'),
        mmr: decimalString(item, 'maintenance_margin_rate', 'nonnegative'),
        maintenanceAmount: decimalString(item, 'maintenance_amount', 'nonnegative'),
        maxLeverage: num(item, 'max_leverage'),
      };
    });
    if (tiers.some((tier, index) => tier.maxLeverage < 1 || new Decimal(tier.mmr).gte(1) || (index > 0 && new Decimal(tier.maxNotional).lte(tiers[index - 1].maxNotional)))) throw new ApiError(`Invalid margin tiers for ${symbol}`);
    if (num(raw, 'quote_prec') > 18) throw new ApiError('Unsupported market precision');
    result[symbol] = {
      baseAsset: str(raw, 'base_asset'),
      quotePrecision: num(raw, 'quote_prec'),
      tiers,
    };
  }
  return result;
}

/** Raw symbol entries, including filters, for Ghost Trade rule verification. */
export async function fetchExchangeInfo(): Promise<unknown[]> {
  const body = await fetchJson('/price/v2/exchangeInfo');
  if (!isRecord(body) || !Array.isArray(body.symbols)) throw new ApiError('Malformed exchangeInfo');
  return body.symbols;
}

export async function fetchRegistry(): Promise<SymbolRegistry> {
  const body = await fetchJson('/price/v2/exchangeInfo');
  if (!isRecord(body) || !Array.isArray(body.symbols)) throw new ApiError('Malformed exchangeInfo');
  const symbols = body.symbols.flatMap((raw) => {
    if (!isRecord(raw) || raw.status !== 'trading') return [];
    return [{
      baseAsset: str(raw, 'baseAsset'),
      symbol: str(raw, 'symbol'),
      quotePrecision: num(raw, 'quotePrecision'),
      highConfidence: false,
    }];
  });
  return { generatedAt: new Date().toISOString(), source: `${API_BASE}/price/v2/exchangeInfo`, symbols };
}

export async function fetchKlinesPage(symbol: string, startTime: number, endTime: number): Promise<Candle[]> {
  const query = new URLSearchParams({
    symbol,
    interval: '1m',
    limit: String(CANDLE_LIMIT),
    startTime: String(startTime),
    endTime: String(endTime),
    priceType: 'mark',
  });
  const body = await fetchJson(`/price/v2/klines?${query.toString()}`);
  return parseCandles(body);
}

function parseCandles(body: unknown): Candle[] {
  if (!Array.isArray(body)) throw new ApiError('Malformed klines');
  return body.map((row: unknown) => {
    if (!Array.isArray(row) || row.length < 5) throw new ApiError('Malformed candle');
    const [time, open, high, low, close] = row;
    const prices = { open, high, low, close };
    const candle = { time: num({ time }, 'time'), open: decimalString(prices, 'open'), high: decimalString(prices, 'high'), low: decimalString(prices, 'low'), close: decimalString(prices, 'close') };
    const bottom = new Decimal(candle.low);
    const top = new Decimal(candle.high);
    if (bottom.lte(0) || top.lt(bottom) || [candle.open, candle.close].some((price) => new Decimal(price).lt(bottom) || new Decimal(price).gt(top))) throw new ApiError('Invalid candle price range');
    return candle;
  });
}

/** 30 days of 1m mark candles, oldest first, paginated at the server's 1500 limit. */
export async function fetchReplayCandles(symbol: string, now: number): Promise<Candle[]> {
  const end = Math.floor(now / 60_000) * 60_000;
  const start = end - REPLAY_DAYS * DAY_MS;
  const pageMs = CANDLE_LIMIT * 60_000;
  const starts: number[] = [];
  for (let cursor = start; cursor < end; cursor += pageMs) starts.push(cursor);

  const byTime = new Map<number, Candle>();
  for (let index = 0; index < starts.length; index += 6) {
    const batch = starts.slice(index, index + 6);
    const pages = await Promise.all(batch.map((cursor) => fetchKlinesPage(symbol, cursor, Math.min(cursor + pageMs, end) - 1)));
    for (const page of pages) {
      for (const candle of page) {
        if (candle.time >= start && candle.time < end) byTime.set(candle.time, candle);
      }
    }
  }
  return [...byTime.values()].sort((a, b) => a.time - b.time);
}

export interface DepthSnapshot {
  bids: [string, string][];
  asks: [string, string][];
  time: number;
  sourceTime?: number | null;
}

function isLevel(value: unknown): value is [string, string] {
  return Array.isArray(value) && value.length >= 2 && typeof value[0] === 'string' && typeof value[1] === 'string';
}

export async function fetchDepth(symbol: string, limit = 100): Promise<DepthSnapshot> {
  const query = new URLSearchParams({ symbol, limit: String(limit) });
  const body = await fetchJson(`/price/v2/depth?${query.toString()}`);
  if (!isRecord(body) || !Array.isArray(body.bids) || !Array.isArray(body.asks)) throw new ApiError('Malformed depth');
  if (!body.bids.every(isLevel) || !body.asks.every(isLevel)) throw new ApiError('Malformed depth levels');
  const bids = body.bids;
  const asks = body.asks;
  const sourceTime = typeof body.E === 'number' && Number.isSafeInteger(body.E) ? body.E : null;
  return { bids, asks, time: sourceTime ?? Date.now(), sourceTime };
}

export async function fetchBookTicker(symbol: string): Promise<{ bidPrice: string; askPrice: string; time: number }> {
  const body = await fetchJson(`/price/v2/ticker/bookTicker?symbol=${encodeURIComponent(symbol)}`);
  if (!isRecord(body)) throw new ApiError('Malformed bookTicker');
  return { bidPrice: decimalString(body, 'bidPrice'), askPrice: decimalString(body, 'askPrice'), time: num(body, 'time') };
}

export async function fetchKlines1h(symbol: string, limit = 720): Promise<Candle[]> {
  const query = new URLSearchParams({ symbol, interval: '1h', limit: String(limit), priceType: 'mark' });
  const body = await fetchJson(`/price/v2/klines?${query.toString()}`);
  return parseCandles(body);
}

export async function fetchAllTickers(): Promise<Array<{ symbol: string; lastPrice: string; priceChangePercent: string; quoteVolume: string }>> {
  const body = await fetchJson('/price/v2/ticker/24hr');
  if (!Array.isArray(body)) throw new ApiError('Malformed tickers');
  return body.map((raw) => {
    if (!isRecord(raw)) throw new ApiError('Malformed ticker');
    return {
      symbol: str(raw, 'symbol'),
      lastPrice: decimalString(raw, 'lastPrice'),
      priceChangePercent: decimalString(raw, 'priceChangePercent'),
      quoteVolume: decimalString(raw, 'quoteVolume'),
    };
  });
}

export async function fetchAllPremium(): Promise<Array<{ symbol: string; markPrice: string; fundingRate: string; nextFundingTime: number }>> {
  const body = await fetchJson('/price/v2/premiumIndex');
  if (!Array.isArray(body)) throw new ApiError('Malformed premiumIndex');
  return body.map((raw) => {
    if (!isRecord(raw)) throw new ApiError('Malformed premium');
    return {
      symbol: str(raw, 'symbol'),
      markPrice: decimalString(raw, 'markPrice'),
      fundingRate: decimalString(raw, 'fundingRate'),
      nextFundingTime: num(raw, 'nextFundingTime'),
    };
  });
}
