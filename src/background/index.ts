import {
  APP_BASE,
  DEFAULT_DEPTH_LIMIT,
  DEFAULT_SETTINGS,
  DEPTH_TTL_MS,
  KLINES_1H_TTL_MS,
  MARKET_TTL_MS,
  REGISTRY_TTL_MS,
  TAKER_FEE_RATE,
  WATCHLIST_TTL_MS,
} from '../shared/constants';
import type { MarketResult, MarketSnapshot, Message, Settings, Tier } from '../shared/types';
import type {
  ExtensionMessage,
  MarketExtras,
  ReplayResultV2,
  SimulatorResult,
  WatchlistResult,
} from '../shared/v2-types';
import type {
  AiProvider,
  ClaimAnalysis,
  GhostMessage,
  GhostResult,
} from '../shared/ghost-types';
import {
  buildReceipt,
  captureClaim,
  closeTrade,
  createTrade,
  getTradeDetail,
  listTrades,
  pendingClaim,
  previewClose,
  previewTrade,
  refreshTrade,
  resolveClaim,
  setClaimAnalysis,
} from '../ghost/service';
import { getClaim } from '../ghost/store';
import { toGhostError } from '../ghost/errors';
import { isGhostMessageType, parseGhostMessage } from '../ghost/messages';
import { analyzeClaim } from '../jev/client';
import { clearKey, getConfig, keyStatus, saveKey } from '../jev/keys';
import {
  fetchAllPremium,
  fetchAllTickers,
  fetchBookTicker,
  fetchDepth,
  fetchKlines1h,
  fetchMarkets,
  fetchOpenInterest,
  fetchPremiumIndex,
  fetchReplayCandles,
  fetchTicker,
} from '../lib/api';
import type { DepthSnapshot } from '../lib/api';
import { readCache, writeCache } from '../lib/cache';
import { computeBasis, computeSpread, computeVolatility } from '../lib/market-extras';
import { estimateSlippage, replaySizeFor } from '../lib/slippage';
import { loadRegistry, registryIndex } from '../lib/symbols';
import { buildWatchlist } from '../lib/watchlist';
import { summarize } from '../risk/margin';
import { assertReplayWindow, normalizeCandles, replayPosition } from '../risk/replay';
import type { Candle } from '../risk/types';

const SETTINGS_KEY = 'settings';
const MARKETS_KEY = 'markets';

interface CachedMarkets {
  value: Record<string, { baseAsset: string; quotePrecision: number; tiers: Tier[] }>;
  savedAt: number;
}

async function getSettings(): Promise<Settings> {
  const stored = await chrome.storage.local.get(SETTINGS_KEY);
  const saved = stored[SETTINGS_KEY] as Settings | undefined;
  if (!saved) {
    return { ...DEFAULT_SETTINGS, sites: {} };
  }
  return { ...DEFAULT_SETTINGS, ...saved, sites: saved.sites ?? {} };
}

async function getMarkets(): Promise<{ markets: CachedMarkets['value']; stale: boolean }> {
  const cached = await readCache<CachedMarkets['value']>(MARKETS_KEY);
  if (cached && Date.now() - cached.savedAt < REGISTRY_TTL_MS) {
    return { markets: cached.value, stale: false };
  }
  try {
    const markets = await fetchMarkets();
    await writeCache(MARKETS_KEY, markets);
    return { markets, stale: false };
  } catch {
    if (cached) return { markets: cached.value, stale: true };
    throw new Error('Margin tiers unavailable');
  }
}

async function getMarket(symbol: string): Promise<MarketResult> {
  const registry = await loadRegistry();
  const entry = registryIndex(registry).get(symbol.replace(/-USD$/, ''));
  if (!entry) return { state: 'not-tradable', message: `${symbol} is not listed on Strike.` };

  const cacheKey = `market:${symbol}`;
  const cached = await readCache<MarketSnapshot>(cacheKey);
  if (cached && Date.now() - cached.savedAt < MARKET_TTL_MS) {
    return { state: 'ready', snapshot: cached.value };
  }

  try {
    const [{ markets, stale }, ticker, premium, openInterest] = await Promise.all([
      getMarkets(),
      fetchTicker(symbol),
      fetchPremiumIndex(symbol),
      fetchOpenInterest(symbol),
    ]);
    const market = markets[symbol];
    if (!market) return { state: 'not-tradable', message: `${symbol} has no active margin tiers on this network.` };
    const snapshot: MarketSnapshot = {
      symbol,
      baseAsset: market?.baseAsset ?? entry.baseAsset,
      markPrice: premium.markPrice,
      changePercent: ticker.changePercent,
      fundingRate: premium.fundingRate,
      nextFundingTime: premium.nextFundingTime,
      openInterest,
      quoteVolume: ticker.quoteVolume,
      tiers: market.tiers,
      quotePrecision: market?.quotePrecision ?? entry.quotePrecision,
      fetchedAt: Date.now(),
      tiersApproximate: stale,
    };
    await writeCache(cacheKey, snapshot);
    return { state: 'ready', snapshot };
  } catch (error) {
    if (cached) {
      return { state: 'offline-cached', snapshot: cached.value, cachedAt: cached.savedAt };
    }
    return { state: 'error', message: error instanceof Error ? error.message : 'Market data unavailable' };
  }
}

async function getDepth(symbol: string): Promise<DepthSnapshot> {
  const cached = await readCache<DepthSnapshot>(`depth:${symbol}`);
  if (cached && Date.now() - cached.savedAt < DEPTH_TTL_MS) return cached.value;
  const depth = await fetchDepth(symbol, DEFAULT_DEPTH_LIMIT);
  await writeCache(`depth:${symbol}`, depth);
  return depth;
}

async function getBookTicker(symbol: string): Promise<{ bidPrice: string; askPrice: string; time: number }> {
  const cached = await readCache<{ bidPrice: string; askPrice: string; time: number }>(`book:${symbol}`);
  if (cached && Date.now() - cached.savedAt < DEPTH_TTL_MS) return cached.value;
  const book = await fetchBookTicker(symbol);
  await writeCache(`book:${symbol}`, book);
  return book;
}

async function getKlines1h(symbol: string): Promise<Candle[]> {
  const cached = await readCache<Candle[]>(`klines1h:${symbol}`);
  if (cached && Date.now() - cached.savedAt < KLINES_1H_TTL_MS) return cached.value;
  const candles = await fetchKlines1h(symbol);
  await writeCache(`klines1h:${symbol}`, candles);
  return candles;
}

async function getAllTickers(): Promise<Array<{ symbol: string; lastPrice: string; priceChangePercent: string; quoteVolume: string }>> {
  const cached = await readCache<Array<{ symbol: string; lastPrice: string; priceChangePercent: string; quoteVolume: string }>>('tickers:all');
  if (cached && Date.now() - cached.savedAt < WATCHLIST_TTL_MS) return cached.value;
  const tickers = await fetchAllTickers();
  await writeCache('tickers:all', tickers);
  return tickers;
}

async function getAllPremium(): Promise<Array<{ symbol: string; markPrice: string; fundingRate: string; nextFundingTime: number }>> {
  const cached = await readCache<Array<{ symbol: string; markPrice: string; fundingRate: string; nextFundingTime: number }>>('premium:all');
  if (cached && Date.now() - cached.savedAt < WATCHLIST_TTL_MS) return cached.value;
  const premiums = await fetchAllPremium();
  await writeCache('premium:all', premiums);
  return premiums;
}

async function getMarketExtras(symbol: string): Promise<MarketExtras> {
  const [book, candles, premium] = await Promise.all([
    getBookTicker(symbol),
    getKlines1h(symbol),
    fetchPremiumIndex(symbol),
  ]);
  const spread = computeSpread(book.bidPrice, book.askPrice);
  const basis = computeBasis(premium.markPrice, premium.indexPrice);
  const vol = computeVolatility(candles);
  return {
    spread: spread?.spread ?? null,
    spreadBps: spread?.spreadBps ?? null,
    basisPct: basis,
    volatilityPct: vol.volatilityPct,
    sparkline: vol.sparkline,
    fetchedAt: Date.now(),
  };
}

async function getReplayCandles(symbol: string, now: number, allowFetch = true): Promise<Candle[] | null> {
  const endTime = Math.floor(now / 60_000) * 60_000;
  const key = `replay:${symbol}`;
  const cached = await readCache<Candle[]>(key);
  if (cached && cached.value.at(-1)?.time === endTime - 60_000) {
    assertReplayWindow(cached.value, endTime);
    return cached.value;
  }
  if (!allowFetch) return null;
  const candles = await fetchReplayCandles(symbol, now);
  assertReplayWindow(candles, endTime);
  await writeCache(key, candles);
  return candles;
}

async function runReplay(
  message: Extract<Message, { type: 'replay:run' }>,
  options: { allowFetch?: boolean } = {},
): Promise<ReplayResultV2 | { needsFetch: true }> {
  const market = await getMarket(message.symbol);
  if (!market.snapshot) throw new Error(market.message ?? 'Market data unavailable');
  if (market.state !== 'ready') throw new Error('Reconnect for a current stress test. Cached quotes are for reference only.');
  const candles = await getReplayCandles(message.symbol, Date.now(), options.allowFetch ?? true);
  if (!candles) return { needsFetch: true };
  const depth = await getDepth(message.symbol).catch(() => null);
  const slippage = depth
    ? estimateSlippage(market.snapshot.markPrice, message.sizeUsd, message.side, depth, depth.time)
    : null;
  const entryPrice = slippage?.vwap ?? market.snapshot.markPrice;
  const replaySizeUsd = replaySizeFor(message.sizeUsd, slippage);
  const normalized = normalizeCandles(candles, market.snapshot.markPrice);
  const replay = replayPosition({
    entryPrice,
    sizeUsd: replaySizeUsd,
    leverage: message.leverage,
    side: message.side,
    tiers: market.snapshot.tiers,
    candles: normalized,
    takerFeeRate: TAKER_FEE_RATE,
    fundingRate: market.snapshot.fundingRate,
  });
  return {
    ...replay,
    entryPrice,
    entrySource: slippage ? 'slipped' : 'mark',
    slippage,
    requestedSizeUsd: message.sizeUsd,
    replaySizeUsd,
  };
}

async function runSimulator(
  message: Extract<ExtensionMessage, { type: 'simulate:run' }>,
): Promise<SimulatorResult | { needsFetch: true }> {
  if (message.marginMode === 'isolated') throw new Error('Isolated margin is not supported. Select cross for a hypothetical single-position scenario.');
  const replay = await runReplay(
    {
      type: 'replay:run',
      symbol: message.symbol,
      sizeUsd: message.sizeUsd,
      leverage: message.leverage,
      side: message.side,
    },
    { allowFetch: message.allowFetch ?? true },
  );
  if ('needsFetch' in replay) return replay;
  const market = await getMarket(message.symbol);
  if (!market.snapshot) throw new Error('Market data unavailable');
  const summary = summarize({
    entryPrice: replay.entryPrice,
    sizeUsd: replay.replaySizeUsd,
    leverage: message.leverage,
    side: message.side,
    tiers: market.snapshot.tiers,
    fundingRate: market.snapshot.fundingRate,
    takerFeeRate: TAKER_FEE_RATE,
  });
  return {
    replay,
    summary,
    markPrice: market.snapshot.markPrice,
    marginMode: message.marginMode ?? 'cross',
    approximate: true,
    tiersApproximate: Boolean(market.snapshot.tiersApproximate),
    extras: await getMarketExtras(message.symbol).catch(() => ({ spread: null, spreadBps: null, basisPct: null, volatilityPct: null, sparkline: [], fetchedAt: Date.now() })),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function field(source: Record<string, unknown>, key: string, max = 200): string | null {
  const value = source[key];
  return typeof value === 'string' && value.length > 0 && value.length <= max ? value : null;
}

function parseSettings(value: unknown): Settings | null {
  if (!isRecord(value) || typeof value.enabled !== 'boolean' || typeof value.allSites !== 'boolean') return null;
  if (!isRecord(value.sites)) return null;
  const sites: Record<string, boolean> = {};
  for (const [host, enabled] of Object.entries(value.sites)) {
    if (typeof enabled !== 'boolean') return null;
    sites[host] = enabled;
  }
  return { enabled: value.enabled, allSites: value.allSites, sites };
}

async function handleOld(message: unknown): Promise<unknown> {
  if (!isRecord(message)) return { error: 'Unknown message' };
  switch (message.type) {
    case 'market:get': {
      const symbol = field(message, 'symbol');
      return symbol ? getMarket(symbol) : { error: 'Invalid symbol' };
    }
    case 'market:extras': {
      const symbol = field(message, 'symbol');
      return symbol ? getMarketExtras(symbol) : { error: 'Invalid symbol' };
    }
    case 'replay:run': {
      const symbol = field(message, 'symbol');
      const sizeUsd = field(message, 'sizeUsd', 40);
      const leverage = field(message, 'leverage', 20);
      const side = message.side;
      if (!symbol || !sizeUsd || !leverage || (side !== 'long' && side !== 'short')) return { error: 'Invalid replay request' };
      try {
        return await runReplay({ type: 'replay:run', symbol, sizeUsd, leverage, side });
      } catch (error) {
        return { error: error instanceof Error ? error.message : 'Replay failed' };
      }
    }
    case 'simulate:run': {
      const symbol = field(message, 'symbol');
      const sizeUsd = field(message, 'sizeUsd', 40);
      const leverage = field(message, 'leverage', 20);
      const side = message.side;
      const marginMode = message.marginMode === 'isolated' ? 'isolated' : 'cross';
      if (!symbol || !sizeUsd || !leverage || (side !== 'long' && side !== 'short')) return { error: 'Invalid simulation request' };
      try {
        return await runSimulator({
          type: 'simulate:run',
          symbol,
          sizeUsd,
          leverage,
          side,
          marginMode,
          allowFetch: message.allowFetch !== false,
        });
      } catch (error) {
        return { error: error instanceof Error ? error.message : 'Simulation failed' };
      }
    }
    case 'watchlist:get': {
      const [registry, tickers, premiums] = await Promise.all([
        loadRegistry(),
        getAllTickers(),
        getAllPremium(),
      ]);
      const { movers, funding } = buildWatchlist(tickers, premiums, registry);
      return { movers, funding, fetchedAt: Date.now() } satisfies WatchlistResult;
    }
    case 'registry:get':
      return loadRegistry();
    case 'settings:get':
      return getSettings();
    case 'settings:set': {
      const settings = parseSettings(message.settings);
      if (!settings) return { error: 'Invalid settings' };
      await chrome.storage.local.set({ [SETTINGS_KEY]: settings });
      return settings;
    }
    case 'open:market': {
      const symbol = field(message, 'symbol');
      if (!symbol) return { error: 'Invalid symbol' };
      await chrome.tabs.create({ url: `${APP_BASE}/trade/${encodeURIComponent(symbol.replace(/-USD$/, '').toLowerCase())}` });
      return { ok: true };
    }
    default:
      return { error: 'Unknown message' };
  }
}

function analysisStatus(
  status: ClaimAnalysis['status'],
  errorCode: string | null,
  provider: AiProvider = 'typesafe',
  model: string | null = null,
): ClaimAnalysis {
  return {
    status,
    direction: null,
    testability: null,
    suggestedSymbols: [],
    summary: null,
    errorCode,
    analyzedAt: status === 'missing_key' ? null : Date.now(),
    provider,
    model,
  };
}

async function analyzeForClaim(claimId: string): Promise<ClaimAnalysis> {
  const claim = await getClaim(claimId);
  if (!claim) return analysisStatus('failed', 'CLAIM_NOT_FOUND');
  const config = await getConfig();
  if (!config) {
    const status = await keyStatus();
    const missing = analysisStatus('missing_key', 'KEY_MISSING', status.provider, status.model);
    await setClaimAnalysis(claimId, missing);
    return missing;
  }
  await setClaimAnalysis(claimId, analysisStatus('pending', null, config.provider, config.model));
  const analysis = await analyzeClaim(config, claim, claim.candidateSymbols);
  await setClaimAnalysis(claimId, analysis);
  return analysis;
}

function ghostOk<T>(value: T): GhostResult<T> {
  return { ok: true, value };
}

function ghostFail(error: unknown): GhostResult<never> {
  const failure = toGhostError(error);
  return { ok: false, error: { code: failure.code, message: failure.message } };
}

async function handleGhost(message: GhostMessage): Promise<GhostResult<unknown>> {
  try {
    switch (message.type) {
      case 'claim:get-pending':
        return ghostOk(await pendingClaim() ?? null);
      case 'claim:resolve':
        return ghostOk(await resolveClaim(message.claimId));
      case 'jev:key-status':
        return ghostOk(await keyStatus());
      case 'jev:key-save':
        return ghostOk(await saveKey(message.provider, message.key, message.model));
      case 'jev:key-clear':
        return ghostOk(await clearKey());
      case 'jev:analyze':
        return ghostOk(await analyzeForClaim(message.claimId));
      case 'ghost:preview':
        return ghostOk(await previewTrade(message));
      case 'ghost:create':
        return ghostOk(await createTrade(message));
      case 'ghost:list':
        return ghostOk(await listTrades());
      case 'ghost:detail':
        return ghostOk(await getTradeDetail(message.tradeId));
      case 'ghost:refresh':
        return ghostOk(await refreshTrade(message.tradeId));
      case 'ghost:close-preview':
        return ghostOk(await previewClose(message.tradeId));
      case 'ghost:close':
        return ghostOk(await closeTrade(message.tradeId, message.requestId));
      case 'receipt:get':
        return ghostOk(await buildReceipt(message.tradeId));
      case 'receipt:list':
        return ghostOk(await listTrades());
      default:
        return ghostFail({ code: 'INVALID_INPUT', message: 'Unknown message' });
    }
  } catch (error) {
    return ghostFail(error);
  }
}

function isExtensionPage(sender: chrome.runtime.MessageSender): boolean {
  if (sender.id !== chrome.runtime.id) return false;
  const origin = typeof sender.origin === 'string'
    ? sender.origin
    : typeof sender.url === 'string' ? new URL(sender.url).origin : '';
  return origin === `chrome-extension://${chrome.runtime.id}`;
}

chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
  if (isRecord(message) && isGhostMessageType(message.type)) {
    if (!isExtensionPage(sender)) {
      sendResponse({ ok: false, error: { code: 'FORBIDDEN', message: 'This action is only available from the extension panel.' } } satisfies GhostResult<never>);
      return false;
    }
    const parsed = parseGhostMessage(message);
    if (!parsed) {
      sendResponse({ ok: false, error: { code: 'INVALID_INPUT', message: 'Invalid request.' } } satisfies GhostResult<never>);
      return false;
    }
    void handleGhost(parsed).then(sendResponse);
    return true;
  }
  handleOld(message)
    .then(sendResponse)
    .catch((error: unknown) => sendResponse({ error: error instanceof Error ? error.message : 'Request failed' }));
  return true;
});

const CONTEXT_MENU_ID = 'strike-analyze-selection';
let captureAttempt = 0;
let latestCaptureSequence = 0;

function ensureContextMenu(): void {
  if (!chrome.contextMenus) return;
  chrome.contextMenus.create({
    id: CONTEXT_MENU_ID,
    title: 'Analyze with Strike Everywhere',
    contexts: ['selection'],
  }, () => {
    void chrome.runtime.lastError;
  });
}

chrome.runtime.onInstalled.addListener(() => {
  void getSettings();
  ensureContextMenu();
});

if (chrome.contextMenus) {
  chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId !== CONTEXT_MENU_ID) return;
    if (tab?.windowId !== undefined) openSidePanel(tab.windowId);
    if (info.editable) {
      void broadcast({ type: 'claim:error', error: { code: 'INVALID_INPUT', message: 'Select article text, not a form field.' } });
      return;
    }
    captureAttempt = (captureAttempt + 1) % 1000;
    // Timestamp*1000 + same-ms counter keeps gesture order; a backwards clock can delay a new claim until the clock catches up.
    const sequence = Date.now() * 1000 + captureAttempt;
    latestCaptureSequence = sequence;
    void captureSelection(info.selectionText, info.pageUrl ?? tab?.url, sequence);
  });
}

function openSidePanel(windowId: number): void {
  const sidePanel = (chrome as unknown as {
    sidePanel?: { open(opts: { windowId: number }): Promise<void> };
  }).sidePanel;
  if (!sidePanel) return;
  void sidePanel.open({ windowId }).catch(() => undefined);
}

async function broadcast(event: unknown): Promise<void> {
  try {
    await chrome.runtime.sendMessage(event);
  } catch {
    // The panel may not be open yet; it reads the pending claim on boot.
  }
}

async function captureSelection(
  selectionText: string | undefined,
  pageUrl: string | undefined,
  sequence: number,
): Promise<void> {
  try {
    const outcome = await captureClaim(selectionText ?? '', pageUrl ?? '', sequence);
    if (outcome.latest) await broadcast({ type: 'claim:captured', claim: outcome.claim });
  } catch (error) {
    const failure = toGhostError(error);
    if (sequence === latestCaptureSequence) {
      await broadcast({ type: 'claim:error', error: { code: failure.code, message: failure.message } });
    }
  }
}

function enableSidePanel(): void {
  const sidePanel = (chrome as unknown as {
    sidePanel?: {
      setPanelBehavior(opts: { openPanelOnActionClick: boolean }): Promise<void>;
      open(opts: { windowId: number }): Promise<void>;
    };
  }).sidePanel;
  if (!sidePanel) return;
  sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {
    chrome.action.onClicked.addListener((tab) => {
      if (tab.windowId !== undefined) void sidePanel.open({ windowId: tab.windowId });
    });
  });
}
enableSidePanel();
