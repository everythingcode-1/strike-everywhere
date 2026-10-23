# Strike Everywhere V2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a side-panel watchlist and a pre-trade simulator on `app.strikefinance.org` that reads the order ticket and runs a 30-day replay without placing orders.

**Architecture:** Keep the existing content-script ticker scanner for news pages. Branch by hostname on Strike app pages and mount a separate simulator module. Add pure helpers for slippage, market extras, watchlist ranking, and candle normalisation. The background worker owns all API calls and caches. The popup HTML becomes the side panel.

**Tech Stack:** TypeScript, Vite + CRXJS, Chrome MV3, decimal.js, idb-keyval, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-21-strike-everywhere-v2-design.md`

## Global Constraints

- `src/shared/types.ts` is HUMAN-OWNED. Do not edit it. New types go in `src/shared/v2-types.ts`.
- Every monetary value stays a string until it becomes a `Decimal`. No `Number()` or `parseFloat` on money.
- No order submission, wallet connection, account data, telemetry, remote fonts, or remote code.
- API calls stay limited to `https://api.strikefinance.org` and `https://api-v2-testnet.strikefinance.org`.
- The simulator must never click, disable, or intercept the Strike submit buttons.
- The Strike app mode must not run the news ticker scanner.
- Run `npm run typecheck`, `npm run test`, and `npm run build` before claiming a task done.

## Review Focus

These are the inputs and conditions most likely to break a real user; each gets a test in the task that owns the code.

1. Depth too thin to fill the requested size — the simulator must mark the estimate partial, not silently fill at mark.
2. Empty or zero-price order-book levels — slippage must return null or skip the level, never NaN or Infinity.
3. Historical candle open equal to zero or negative — normalisation must return the original candles, not divide by zero.
4. Order ticket fields empty or missing on a wallet-gated page — auto-read must return nulls and the panel must ask the user to fill them.
5. Isolated margin selected on the app — the simulator must warn that results assume cross margin and label them approximate.

---

### Task 1: V2 types, constants, manifest, and side-panel shell

**Files:**
- Create: `src/shared/v2-types.ts`
- Modify: `src/shared/constants.ts`
- Modify: `manifest.json`
- Modify: `src/background/index.ts`
- Modify: `src/popup/index.html`
- Modify: `src/popup/index.ts`
- Modify: `src/popup/popup.css`

**Interfaces:**
- Produces: `SlippageEstimate`, `MarketExtras`, `MarketResultV2`, `ReplayResultV2`, `SimulatorResult`, `SimulatorMessage`, `ExtensionMessage`, `WatchlistRow`, `WatchlistResult`.
- Produces: `STRIKE_APP_HOSTS`, `DEPTH_TTL_MS`, `KLINES_1H_TTL_MS`, `WATCHLIST_TTL_MS`, `DEFAULT_DEPTH_LIMIT`, `SPARKLINE_POINTS`.

- [ ] **Step 1: Create `src/shared/v2-types.ts`**

```ts
import type { MarketResult, Message, ReplayResult, Side } from './types';
import type { RiskSummary } from '../risk/types';

export interface SlippageEstimate {
  vwap: string;
  slippageBps: string;
  filledUsd: string;
  partial: boolean;
  snapshotAt: number;
}

export interface MarketExtras {
  spread: string;
  spreadBps: string;
  basisPct: string | null;
  volatilityPct: string | null;
  sparkline: number[];
  fetchedAt: number;
}

export interface MarketResultV2 extends MarketResult {
  extras?: MarketExtras;
}

export interface ReplayResultV2 extends ReplayResult {
  entryPrice: string;
  entrySource: 'slipped' | 'mark';
  slippage: SlippageEstimate | null;
}

export interface SimulatorResult {
  replay: ReplayResultV2;
  summary: RiskSummary;
  marginMode: 'cross' | 'isolated';
  approximate: boolean;
}

export type SimulatorMessage =
  | { type: 'market:extras'; symbol: string }
  | { type: 'simulate:run'; symbol: string; sizeUsd: string; leverage: string; side: Side; marginMode?: 'cross' | 'isolated'; allowFetch?: boolean }
  | { type: 'watchlist:get' };

export type ExtensionMessage = Message | SimulatorMessage;

export interface WatchlistRow {
  symbol: string;
  baseAsset: string;
  lastPrice: string;
  changePercent: string;
  fundingRate: string;
  quoteVolume: string;
}

export interface WatchlistResult {
  movers: WatchlistRow[];
  funding: WatchlistRow[];
  fetchedAt: number;
}
```

- [ ] **Step 2: Add constants**

In `src/shared/constants.ts`, add:

```ts
export const STRIKE_APP_HOSTS = ['app.strikefinance.org'];
export const DEPTH_TTL_MS = 5_000;
export const KLINES_1H_TTL_MS = 5 * 60_000;
export const WATCHLIST_TTL_MS = 30_000;
export const DEFAULT_DEPTH_LIMIT = 100;
export const SPARKLINE_POINTS = 60;
```

- [ ] **Step 3: Update `manifest.json`**

Add `"sidePanel"` to `permissions`. Remove `action.default_popup`. Add:

```json
"side_panel": { "default_path": "src/popup/index.html" },
"minimum_chrome_version": "114"
```

Keep `default_title` and the content script match. Do not add host permissions.

- [ ] **Step 4: Enable the side panel in the background**

At the bottom of `src/background/index.ts`, add a helper and call it. Use a cast so older `@types/chrome` still typechecks:

```ts
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
```

- [ ] **Step 5: Add a watchlist section to the popup HTML**

In `src/popup/index.html`, after the settings rows and before the hint, add:

```html
<section class="watchlist" id="watchlist" hidden>
  <div class="watchlist-head">
    <h2>Watchlist</h2>
    <button id="watchlist-refresh" type="button">Refresh</button>
  </div>
  <div id="watchlist-body">Loading…</div>
</section>
```

- [ ] **Step 6: Render the watchlist in `src/popup/index.ts`**

Add a `loadWatchlist()` function that sends `{ type: 'watchlist:get' }`, handles `{ error }`, and renders two lists (`movers`, `funding`) into `#watchlist-body`. Add a refresh listener. Call it on boot. For Task 1, the background handler does not exist yet, so the function should render "Watchlist unavailable" on error and keep the panel usable. This keeps Task 1 shippable; Task 3 wires the data.

- [ ] **Step 7: Verify**

Run: `npm run typecheck && npm run test && npm run build`
Expected: PASS. Load `dist/` unpacked; clicking the toolbar icon opens the side panel with settings and an empty watchlist. The news-page ticker scanner still works.

- [ ] **Step 8: Commit**

```bash
git add manifest.json src/shared/constants.ts src/shared/v2-types.ts src/background/index.ts src/popup/index.html src/popup/index.ts src/popup/popup.css
git commit -m "feat: add v2 types, constants, and side panel shell"
```

---

### Task 2: API wrappers and pure helpers

**Files:**
- Modify: `src/lib/api.ts`
- Create: `src/lib/slippage.ts`
- Create: `src/lib/market-extras.ts`
- Create: `src/lib/watchlist.ts`
- Modify: `src/risk/replay.ts`
- Test: `tests/slippage.test.ts`
- Test: `tests/market-extras.test.ts`
- Test: `tests/watchlist.test.ts`
- Test: `tests/replay.test.ts`

**Interfaces:**
- Produces: `fetchDepth(symbol, limit?)`, `fetchBookTicker(symbol)`, `fetchKlines1h(symbol, limit?)`, `fetchAllTickers()`, `fetchAllPremium()`.
- Produces: `estimateSlippage(markPrice, sizeUsd, side, depth, snapshotAt)`.
- Produces: `computeSpread(bid, ask)`, `computeBasis(mark, index)`, `computeVolatility(candles)`, `downsampleSparkline(candles, points)`.
- Produces: `buildWatchlist(tickers, premiums, registry, limit?)`.
- Produces: `normalizeCandles(candles, entryPrice)`.

- [ ] **Step 1: Add API wrappers**

In `src/lib/api.ts`, extend `PremiumIndex` with `indexPrice: string` and add:

```ts
export interface DepthSnapshot {
  bids: [string, string][];
  asks: [string, string][];
  time: number;
}

export async function fetchDepth(symbol: string, limit = 100): Promise<DepthSnapshot> {
  const query = new URLSearchParams({ symbol, limit: String(limit) });
  const body = await fetchJson(`/price/v2/depth?${query.toString()}`);
  if (!isRecord(body)) throw new ApiError('Malformed depth');
  const bids = Array.isArray(body.bids) ? body.bids : [];
  const asks = Array.isArray(body.asks) ? body.asks : [];
  const time = typeof body.E === 'number' ? body.E : Date.now();
  return { bids: bids as [string, string][], asks: asks as [string, string][], time };
}

export async function fetchBookTicker(symbol: string): Promise<{ bidPrice: string; askPrice: string; time: number }> {
  const body = await fetchJson(`/price/v2/ticker/bookTicker?symbol=${encodeURIComponent(symbol)}`);
  if (!isRecord(body)) throw new ApiError('Malformed bookTicker');
  return { bidPrice: str(body, 'bidPrice'), askPrice: str(body, 'askPrice'), time: num(body, 'time') };
}

export async function fetchKlines1h(symbol: string, limit = 720): Promise<Candle[]> {
  const query = new URLSearchParams({ symbol, interval: '1h', limit: String(limit), priceType: 'mark' });
  const body = await fetchJson(`/price/v2/klines?${query.toString()}`);
  if (!Array.isArray(body)) throw new ApiError('Malformed klines');
  return body.map((row) => {
    if (!Array.isArray(row) || row.length < 5) throw new ApiError('Malformed candle');
    const [time, open, high, low, close] = row;
    if (typeof time !== 'number') throw new ApiError('Malformed candle time');
    return { time, open: String(open), high: String(high), low: String(low), close: String(close) };
  });
}

export async function fetchAllTickers(): Promise<Array<{ symbol: string; lastPrice: string; priceChangePercent: string; quoteVolume: string }>> {
  const body = await fetchJson('/price/v2/ticker/24hr');
  if (!Array.isArray(body)) throw new ApiError('Malformed tickers');
  return body.map((raw) => {
    if (!isRecord(raw)) throw new ApiError('Malformed ticker');
    return { symbol: str(raw, 'symbol'), lastPrice: str(raw, 'lastPrice'), priceChangePercent: str(raw, 'priceChangePercent'), quoteVolume: str(raw, 'quoteVolume') };
  });
}

export async function fetchAllPremium(): Promise<Array<{ symbol: string; markPrice: string; fundingRate: string; nextFundingTime: number }>> {
  const body = await fetchJson('/price/v2/premiumIndex');
  if (!Array.isArray(body)) throw new ApiError('Malformed premiumIndex');
  return body.map((raw) => {
    if (!isRecord(raw)) throw new ApiError('Malformed premium');
    return { symbol: str(raw, 'symbol'), markPrice: str(raw, 'markPrice'), fundingRate: str(raw, 'fundingRate'), nextFundingTime: num(raw, 'nextFundingTime') };
  });
}
```

Update `fetchPremiumIndex` to include `indexPrice: str(body, 'indexPrice')`.

- [ ] **Step 2: Write `src/lib/slippage.ts`**

```ts
import Decimal from 'decimal.js';
import type { Side } from '../shared/types';
import type { SlippageEstimate } from '../shared/v2-types';
import type { DepthSnapshot } from './api';

export function estimateSlippage(
  markPrice: string,
  sizeUsd: string,
  side: Side,
  depth: DepthSnapshot,
  snapshotAt: number,
): SlippageEstimate | null {
  const mark = new Decimal(markPrice);
  const target = new Decimal(sizeUsd);
  if (!mark.isFinite() || mark.lte(0) || !target.isFinite() || target.lte(0)) return null;
  const levels = side === 'long' ? depth.asks : depth.bids;
  let usd = new Decimal(0);
  let base = new Decimal(0);
  for (const [priceRaw, qtyRaw] of levels) {
    if (usd.gte(target)) break;
    const price = new Decimal(priceRaw);
    const qty = new Decimal(qtyRaw);
    if (!price.isFinite() || price.lte(0) || !qty.isFinite() || qty.lte(0)) continue;
    const levelUsd = price.mul(qty);
    const take = Decimal.min(levelUsd, target.minus(usd));
    if (take.lte(0)) continue;
    usd = usd.plus(take);
    base = base.plus(take.div(price));
  }
  if (base.lte(0)) return null;
  const vwap = usd.div(base);
  const slippageBps = side === 'long'
    ? vwap.minus(mark).div(mark).mul(10000)
    : mark.minus(vwap).div(mark).mul(10000);
  return {
    vwap: vwap.toString(),
    slippageBps: slippageBps.toString(),
    filledUsd: usd.toString(),
    partial: usd.lt(target),
    snapshotAt,
  };
}
```

- [ ] **Step 3: Write `src/lib/market-extras.ts`**

```ts
import Decimal from 'decimal.js';
import type { Candle } from '../risk/types';

export function computeSpread(bid: string, ask: string): { spread: string; spreadBps: string } | null {
  const b = new Decimal(bid);
  const a = new Decimal(ask);
  if (!b.isFinite() || !a.isFinite() || b.lte(0) || a.lte(0) || a.lt(b)) return null;
  const spread = a.minus(b);
  const mid = a.plus(b).div(2);
  return { spread: spread.toString(), spreadBps: spread.div(mid).mul(10000).toString() };
}

export function computeBasis(mark: string, index: string): string | null {
  const m = new Decimal(mark);
  const i = new Decimal(index);
  if (!m.isFinite() || !i.isFinite() || i.lte(0)) return null;
  return m.minus(i).div(i).mul(100).toString();
}

export function computeVolatility(candles: Candle[]): { volatilityPct: string | null; sparkline: number[] } {
  if (candles.length === 0) return { volatilityPct: null, sparkline: [] };
  let sum = new Decimal(0);
  let count = 0;
  for (const candle of candles) {
    const open = new Decimal(candle.open);
    const high = new Decimal(candle.high);
    const low = new Decimal(candle.low);
    if (!open.isFinite() || open.lte(0) || !high.isFinite() || !low.isFinite()) continue;
    sum = sum.plus(high.minus(low).div(open).mul(100));
    count += 1;
  }
  return {
    volatilityPct: count > 0 ? sum.div(count).toString() : null,
    sparkline: downsampleSparkline(candles, 60),
  };
}

export function downsampleSparkline(candles: Candle[], points: number): number[] {
  const closes = candles.map((c) => new Decimal(c.close).toNumber()).filter((n) => Number.isFinite(n));
  if (closes.length <= points) return closes;
  const out: number[] = [];
  for (let i = 0; i < points; i += 1) {
    const idx = Math.round((i * (closes.length - 1)) / (points - 1));
    out.push(closes[idx]);
  }
  return out;
}
```

- [ ] **Step 4: Write `src/lib/watchlist.ts`**

```ts
import type { SymbolRegistry } from '../shared/types';
import type { WatchlistRow } from '../shared/v2-types';

export interface TickerRow { symbol: string; lastPrice: string; priceChangePercent: string; quoteVolume: string; }
export interface PremiumRow { symbol: string; markPrice: string; fundingRate: string; nextFundingTime: number; }

export function buildWatchlist(
  tickers: TickerRow[],
  premiums: PremiumRow[],
  registry: SymbolRegistry,
  limit = 5,
): { movers: WatchlistRow[]; funding: WatchlistRow[] } {
  const known = new Map(registry.symbols.map((entry) => [entry.symbol, entry]));
  const premiumBySymbol = new Map(premiums.map((row) => [row.symbol, row]));
  const rows: WatchlistRow[] = [];
  for (const ticker of tickers) {
    const entry = known.get(ticker.symbol);
    if (!entry) continue;
    const premium = premiumBySymbol.get(ticker.symbol);
    rows.push({
      symbol: ticker.symbol,
      baseAsset: entry.baseAsset,
      lastPrice: ticker.lastPrice,
      changePercent: ticker.priceChangePercent,
      fundingRate: premium?.fundingRate ?? '0',
      quoteVolume: ticker.quoteVolume,
    });
  }
  const movers = [...rows].sort((a, b) => Math.abs(Number(b.changePercent)) - Math.abs(Number(a.changePercent))).slice(0, limit);
  const funding = [...rows].sort((a, b) => Math.abs(Number(b.fundingRate)) - Math.abs(Number(a.fundingRate))).slice(0, limit);
  return { movers, funding };
}
```

- [ ] **Step 5: Add `normalizeCandles` to `src/risk/replay.ts`**

```ts
export function normalizeCandles(candles: Candle[], entryPrice: string): Candle[] {
  if (candles.length === 0) return candles;
  const firstOpen = dec(candles[0].open);
  const entry = dec(entryPrice);
  if (firstOpen.lte(0) || !entry.isFinite() || entry.lte(0)) return candles;
  const factor = entry.div(firstOpen);
  return candles.map((candle) => ({
    time: candle.time,
    open: dec(candle.open).mul(factor).toString(),
    high: dec(candle.high).mul(factor).toString(),
    low: dec(candle.low).mul(factor).toString(),
    close: dec(candle.close).mul(factor).toString(),
  }));
}
```

Import `Candle` from `./types`.

- [ ] **Step 6: Write tests**

`tests/slippage.test.ts`:
- Long fill across two ask levels; assert `partial === false`, `filledUsd` equals size, `slippageBps > 0`.
- Short fill across two bid levels; assert `slippageBps > 0`.
- Thin depth: request $10k with $1k depth; assert `partial === true`, `filledUsd === '1000'`.
- Empty levels: returns null.
- Zero size: returns null.
- Zero/negative price level is skipped.

`tests/market-extras.test.ts`:
- Spread 100/101 → spread 1, bps ~99.0.
- ask < bid → null.
- Basis mark 101, index 100 → 1.
- Volatility average of two candles.
- Downsample returns requested length.

`tests/watchlist.test.ts`:
- Joins registry and premiums, filters unknown.
- Movers sorted by absolute change.
- Funding sorted by absolute funding rate.
- Missing premium defaults to '0'.

`tests/replay.test.ts` add:
- `normalizeCandles` first open equals entry.
- Relative move preserved: high/open ratio same before and after.
- Empty array and zero first open return original.

- [ ] **Step 7: Verify**

Run: `npm run typecheck && npm run test`
Expected: PASS with the new tests.

- [ ] **Step 8: Commit**

```bash
git add src/lib/api.ts src/lib/slippage.ts src/lib/market-extras.ts src/lib/watchlist.ts src/risk/replay.ts tests/slippage.test.ts tests/market-extras.test.ts tests/watchlist.test.ts tests/replay.test.ts
git commit -m "feat: add slippage, market extras, watchlist, and candle normalisation"
```

---

### Task 3: Background handlers and caching

**Files:**
- Modify: `src/background/index.ts`
- Test: `tests/background-handlers.test.ts` (new; optional if the existing setup allows mocking)

**Interfaces:**
- Consumes: all Task 2 helpers and API wrappers.
- Produces: handlers for `market:extras`, `simulate:run`, `watchlist:get`.
- Produces: `getReplayCandles(symbol, now, allowFetch)` returning `Candle[] | null`.

- [ ] **Step 1: Add caches and helpers**

In `src/background/index.ts`, add:

```ts
const DEPTH_KEY = (symbol: string) => `depth:${symbol}`;
const BOOK_KEY = (symbol: string) => `book:${symbol}`;
const KLINES_1H_KEY = (symbol: string) => `klines1h:${symbol}`;
const TICKERS_ALL_KEY = 'tickers:all';
const PREMIUM_ALL_KEY = 'premium:all';

async function getDepth(symbol: string): Promise<DepthSnapshot> {
  const cached = await readCache<DepthSnapshot>(DEPTH_KEY(symbol));
  if (cached && Date.now() - cached.savedAt < DEPTH_TTL_MS) return cached.value;
  const depth = await fetchDepth(symbol, DEFAULT_DEPTH_LIMIT);
  await writeCache(DEPTH_KEY(symbol), depth);
  return depth;
}
```

Add similar `getBookTicker`, `getKlines1h`, `getAllTickers`, `getAllPremium`. Use the TTLs from constants.

- [ ] **Step 2: Implement `getMarketExtras(symbol)`**

```ts
async function getMarketExtras(symbol: string): Promise<MarketExtras> {
  const [depth, book, candles, premium] = await Promise.all([
    getDepth(symbol),
    getBookTicker(symbol),
    getKlines1h(symbol),
    fetchPremiumIndex(symbol),
  ]);
  const spread = computeSpread(book.bidPrice, book.askPrice);
  const basis = computeBasis(premium.markPrice, premium.indexPrice);
  const vol = computeVolatility(candles);
  return {
    spread: spread?.spread ?? '0',
    spreadBps: spread?.spreadBps ?? '0',
    basisPct: basis,
    volatilityPct: vol.volatilityPct,
    sparkline: vol.sparkline,
    fetchedAt: Date.now(),
  };
}
```

- [ ] **Step 3: Extend `getReplayCandles`**

Change the signature to `getReplayCandles(symbol: string, now: number, allowFetch = true): Promise<Candle[] | null>`. Return the cached array if present. If `allowFetch` is false and there is no cache, return null. Otherwise fetch and cache.

- [ ] **Step 4: Extend `runReplay`**

Accept an options object:

```ts
async function runReplay(
  message: Extract<Message, { type: 'replay:run' }>,
  options: { allowFetch?: boolean; marginMode?: 'cross' | 'isolated' } = {},
): Promise<ReplayResultV2 | { needsFetch: true }> {
  const market = await getMarket(message.symbol);
  if (!market.snapshot) throw new Error(market.message ?? 'Market data unavailable');
  const candles = await getReplayCandles(message.symbol, Date.now(), options.allowFetch ?? true);
  if (!candles) return { needsFetch: true };
  if (candles.length === 0) throw new Error('No mark-price candles returned');
  const depth = await getDepth(message.symbol).catch(() => null);
  const slippage = depth ? estimateSlippage(market.snapshot.markPrice, message.sizeUsd, message.side, depth, depth.time) : null;
  const entryPrice = slippage?.vwap ?? market.snapshot.markPrice;
  const normalized = normalizeCandles(candles, entryPrice);
  const replay = replayPosition({
    entryPrice,
    sizeUsd: message.sizeUsd,
    leverage: message.leverage,
    side: message.side,
    tiers: market.snapshot.tiers,
    candles: normalized,
    takerFeeRate: TAKER_FEE_RATE,
  });
  return { ...replay, entryPrice, entrySource: slippage ? 'slipped' : 'mark', slippage };
}
```

For the simulator, add a separate `runSimulator` that also computes `summary` and returns `SimulatorResult`. Reuse `runReplay` and `summarize`.

- [ ] **Step 5: Add handlers**

In `handle`, add:

```ts
case 'market:extras':
  return getMarketExtras(message.symbol);
case 'simulate:run': {
  const replay = await runReplay(
    { type: 'replay:run', symbol: message.symbol, sizeUsd: message.sizeUsd, leverage: message.leverage, side: message.side },
    { allowFetch: message.allowFetch ?? true, marginMode: message.marginMode },
  );
  if ('needsFetch' in replay) return replay;
  const market = await getMarket(message.symbol);
  const summary = market.snapshot ? summarize({ entryPrice: replay.entryPrice, sizeUsd: message.sizeUsd, leverage: message.leverage, side: message.side, tiers: market.snapshot.tiers, fundingRate: market.snapshot.fundingRate, takerFeeRate: TAKER_FEE_RATE }) : null;
  if (!summary) throw new Error('Market data unavailable');
  return { replay, summary, marginMode: message.marginMode ?? 'cross', approximate: message.marginMode === 'isolated' };
}
case 'watchlist:get': {
  const [registry, tickers, premiums] = await Promise.all([loadRegistry(), getAllTickers(), getAllPremium()]);
  const { movers, funding } = buildWatchlist(tickers, premiums, registry);
  return { movers, funding, fetchedAt: Date.now() } satisfies WatchlistResult;
}
```

Change the listener type to `ExtensionMessage`.

- [ ] **Step 6: Verify**

Run: `npm run typecheck && npm run test && npm run build`
Expected: PASS. Use the extension on a news page to confirm `market:get` still works. The new handlers are exercised by the simulator and side panel in later tasks.

- [ ] **Step 7: Commit**

```bash
git add src/background/index.ts tests/background-handlers.test.ts
git commit -m "feat: add background handlers for extras, simulator, and watchlist"
```

---

### Task 4: Inline card extras and replay label

**Files:**
- Modify: `src/content/index.ts`
- Modify: `src/content/card.ts`
- Modify: `src/content/card.css`

**Interfaces:**
- Consumes: `MarketResultV2`, `MarketExtras`, `ReplayResultV2`.
- Produces: `StrikeCard.setExtras(extras: MarketExtras | null)`.

- [ ] **Step 1: Fetch extras after the base card**

In `src/content/index.ts`, change the `market:get` call to `MarketResultV2`. When the result is `ready` or `offline-cached`, send `{ type: 'market:extras', symbol: entry.symbol }` and call `target.setExtras(extras)` if the card is still current. Handle `{ error }` by passing null.

- [ ] **Step 2: Add `setExtras` to the card**

In `src/content/card.ts`, add a private `extras: MarketExtras | null` field and a public `setExtras(extras)` method. It stores the value and calls `renderExtras()`.

`renderExtras()` inserts a `<dl class="extras">` after the `.stats` block with:

```html
<dt>Spread</dt><dd>…</dd>
<dt>Basis</dt><dd>…</dd>
<dt>30-day range</dt><dd>…</dd>
```

Use `money()` for spread, `signedPercent()` for basis, and `toFixed(2)%` for volatility. Render the sparkline as an inline SVG with `viewBox="0 0 120 32"` and a polyline. If extras are null or fields are null, render `—`.

- [ ] **Step 3: Show the replay entry and slippage**

Change `setReplay` to accept `ReplayResultV2`. When `result.entrySource` is present, prepend:

```html
<div class="note">Entry: $… (slipped|mark) · Slippage: … bps</div>
```

If `result.slippage?.partial`, add "Partial fill — depth was thinner than the requested size."

- [ ] **Step 4: Update the replay copy**

Change the idle replay text to "If the last 30 days repeated from this entry, would this position survive?" Keep the existing verdict text. Add a note "Historical stress test, not a forecast."

- [ ] **Step 5: Add CSS**

In `src/content/card.css`, add styles for `.extras`, `.sparkline`, and `.note` if missing. Keep the card width at 320 px.

- [ ] **Step 6: Verify**

Run: `npm run typecheck && npm run test && npm run build`
Expected: PASS. Open `npm run demo`, hover a ticker, confirm spread, basis, range, sparkline, and the replay entry label. Confirm the news-page scanner still highlights tickers.

- [ ] **Step 7: Commit**

```bash
git add src/content/index.ts src/content/card.ts src/content/card.css
git commit -m "feat: show spread, basis, volatility, sparkline, and replay entry in the inline card"
```

---

### Task 5: Strike app simulator

**Files:**
- Create: `src/lib/ticket-reader.ts`
- Create: `src/content/simulator.ts`
- Modify: `src/content/index.ts`
- Modify: `src/shared/constants.ts`
- Test: `tests/ticket-reader.test.ts`

**Interfaces:**
- Produces: `parseTradeSymbol(pathname: string): string | null`, `parseLeverage(text: string): string | null`, `parseSide(longClass: string, shortClass: string): Side | null`, `parseSize(value: string, suffix: string, markPrice: string): string | null`.
- Produces: `mountSimulator(): void`.

- [ ] **Step 1: Write `src/lib/ticket-reader.ts`**

```ts
import Decimal from 'decimal.js';
import type { Side } from '../shared/types';

export function parseTradeSymbol(pathname: string): string | null {
  const match = pathname.match(/\/trade\/([^/?#]+)/i);
  if (!match) return null;
  const base = match[1].replace(/-USD$/i, '').toUpperCase();
  return base.length > 0 ? `${base}-USD` : null;
}

export function parseLeverage(text: string): string | null {
  const match = text.match(/(\d+(?:\.\d+)?)\s*x/i);
  if (!match) return null;
  const value = new Decimal(match[1]);
  return value.gt(0) ? value.toString() : null;
}

export function parseSide(longClass: string, shortClass: string): Side | null {
  const longActive = /text-primary|bg-primary-muted/.test(longClass);
  const shortActive = /text-primary|bg-primary-muted/.test(shortClass);
  if (longActive && !shortActive) return 'long';
  if (shortActive && !longActive) return 'short';
  return null;
}

export function parseSize(value: string, suffix: string, markPrice: string): string | null {
  const amount = new Decimal(value.replace(/,/g, '').trim());
  if (!amount.isFinite() || amount.lte(0)) return null;
  if (suffix.toUpperCase() === 'USD') return amount.toString();
  const mark = new Decimal(markPrice);
  if (!mark.isFinite() || mark.lte(0)) return null;
  return amount.mul(mark).toString();
}
```

- [ ] **Step 2: Write tests**

`tests/ticket-reader.test.ts`:
- `parseTradeSymbol('/trade/btc')` → `'BTC-USD'`; `/trade/eth-usd` → `'ETH-USD'`; `/portfolio` → null.
- `parseLeverage('10x')` → `'10'`; `'Cross 10x'` → `'10'`; `'x'` → null.
- `parseSide` with active long, active short, both active, neither.
- `parseSize('0.5', 'BTC', '83000')` → `'41500'`; `'5000', 'USD'` → `'5000'`; empty → null.

- [ ] **Step 3: Write `src/content/simulator.ts`**

Create a module that:
- Creates a host element with a closed shadow root and fixed positioning.
- Adds a floating "Simulate" button. On click, calls `readTicket()` and opens the panel.
- The panel has a header (symbol, close), a form (size, leverage, side, margin mode), a "Refresh from form" button, a "Run 30-day replay" button, a result area, and the disclaimer.
- `readTicket()` reads:
  - symbol from `location.pathname` via `parseTradeSymbol`.
  - size from `#collateral-amount`, its parent text as suffix; fallback to the "Order Size" display; fallback to `input[aria-label="Market order quantity"]` × mark.
  - leverage from `button[data-tutorial="leverage"]` text via `parseLeverage`.
  - side from the active Long/Buy or Short/Sell button classes via `parseSide`.
  - margin mode from `button[data-tutorial="margin-mode"]` text; `isolated` if it contains "isolated".
- On "Simulate", read the ticket, fill the form, show the panel, and call `simulate:run` with `allowFetch: false`. If the response is `{ needsFetch: true }`, show "First run needs 30 days of candles" and enable the Run button. Otherwise render.
- On "Run", call `simulate:run` with `allowFetch: true`, show loading, then render.
- Render: verdict, first liquidation time, worst drawdown, events, remaining size, entry/source, slippage, summary (liq price, IM, fee, funding/day), margin mode warning if isolated. Include "Execution stays on Strike" and a link to `https://app.strikefinance.org/trade/<base>`.
- Use `event.stopPropagation()` on panel clicks. Escape closes the panel. Do not touch submit buttons.
- All text is created with `textContent` or escaped HTML; no page text is read or sent.

- [ ] **Step 4: Branch in the content script**

In `src/content/index.ts`, after `settings` is loaded:

```ts
if (!settings?.enabled) return;
if (STRIKE_APP_HOSTS.includes(hostname())) {
  mountSimulator();
  return;
}
if (!siteEnabled()) return;
```

Import `STRIKE_APP_HOSTS` and `mountSimulator`.

- [ ] **Step 5: Verify**

Run: `npm run typecheck && npm run test && npm run build`
Expected: PASS. Load `dist/` unpacked and open `https://app.strikefinance.org/trade/btc`. The floating Simulate button appears; clicking it opens the panel. With no wallet, size/leverage may be empty; the panel asks for manual input. The news-page scanner still works on other sites.

- [ ] **Step 6: Commit**

```bash
git add src/lib/ticket-reader.ts src/content/simulator.ts src/content/index.ts src/shared/constants.ts tests/ticket-reader.test.ts
git commit -m "feat: add Strike app order-ticket simulator"
```

---

### Task 6: Side-panel watchlist UI

**Files:**
- Modify: `src/popup/index.html`
- Modify: `src/popup/index.ts`
- Modify: `src/popup/popup.css`

**Interfaces:**
- Consumes: `watchlist:get`, `WatchlistResult`, `WatchlistRow`.

- [ ] **Step 1: Implement the watchlist renderer**

Replace the Task 1 placeholder `loadWatchlist()` with a real renderer. Send `{ type: 'watchlist:get' }`. On success, render two `<ul>` lists: "Top movers" and "Funding extremes". Each row shows base asset, last price, change percent, and funding rate. Use `textContent`, not `innerHTML` with API strings. On error, show "Watchlist unavailable" and keep the refresh button enabled.

- [ ] **Step 2: Style the watchlist**

In `src/popup/popup.css`, add `.watchlist`, `.watchlist-head`, `.watchlist ul`, and `.watchlist li` styles. Keep the panel usable at 320 px wide. Use a two-column row for symbol and change.

- [ ] **Step 3: Verify**

Run: `npm run typecheck && npm run test && npm run build`
Expected: PASS. Open the side panel; the watchlist loads top movers and funding extremes. Click Refresh; the list updates. Disconnect the network; the list shows the error state without blank space.

- [ ] **Step 4: Commit**

```bash
git add src/popup/index.html src/popup/index.ts src/popup/popup.css
git commit -m "feat: add watchlist to the side panel"
```

---

### Task 7: Documentation and final verification

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Update the README**

Add:
- A "Side panel" quick-start note: the toolbar icon opens the side panel, not a popup.
- A "Strike app simulator" section: open `/trade/<symbol>`, click Simulate, review the replay; execution stays on Strike.
- New endpoint rows: `depth`, `bookTicker`, `trades`, `klines 1h`, all-symbol tickers/premium.
- New limitations: slippage is an estimate from a 5-second depth cache; replay normalises the last 30 days to the entry price; isolated margin is approximated with cross-margin math; auto-read selectors are brittle.
- A note that the extension never submits orders.

- [ ] **Step 2: Final verification**

Run:

```bash
npm run typecheck
npm run test
npm run build
```

Expected: all pass. Then load `dist/` unpacked and check:
- News page: tickers highlight, card shows spread/basis/volatility/sparkline, replay shows entry/source.
- Strike app: floating Simulate button, auto-read fills fields when available, replay runs, no order is submitted.
- Side panel: settings and watchlist work.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: describe side panel and Strike app simulator"
```

---

## Self-review notes

- Spec coverage: side panel (Task 1/6), simulator (Task 5), slippage (Task 2/3), spread/basis/volatility/sparkline (Task 2/4), watchlist (Task 2/6), replay normalisation (Task 2/3), README (Task 7).
- Type consistency: `MarketResultV2`, `ReplayResultV2`, `SimulatorResult`, and `ExtensionMessage` are defined in Task 1 and used in Tasks 3–5.
- Review Focus: each of the five items has a test in Task 2 or Task 5.
- The plan leaves the exact CSS to the implementer; the card and panel layouts are described by the existing structure.
