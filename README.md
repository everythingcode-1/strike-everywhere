# Strike Everywhere

A Chrome MV3 extension that brings Strike market data to the page you are reading, turns a selected claim into a locally stored **virtual** trade, and lets you test a hypothetical position against a 30-day historical price scenario. No real orders, no wallet, no account.

Listed tickers such as `$BTC` get a dotted underline. Hover (150 ms) or press `Enter` for price, funding, open interest, volume, and a stress test. Select a sentence, right-click **Analyze with Strike Everywhere**, and the side panel opens a Discover flow: verified Strike market, optional Jev (BYOK) classification, manual Long/Short entry, virtual close, and an exportable receipt.

**This build uses public mainnet market data. Ghost Trades are virtual ledger records, not exchange positions. Risk numbers are experimental estimates and have not been validated against three real Strike positions. A replay is historical scenario evidence, not a forecast or a safety recommendation.**

No wallet. No orders. No account data. No telemetry.

## Quick start

```bash
npm install
npm run build
npm run demo        # serves demo/article.html on http://localhost:4173
```

1. Open `chrome://extensions`, enable **Developer mode**, click **Load unpacked**, choose `dist/`.
2. Open <http://localhost:4173/article.html>.
3. `localhost` is not on the default allowlist. Open the **side panel** (toolbar icon) and either enable **Detect on all sites** or toggle **localhost** for this site.
4. Hover `$BTC`, `$ETH`, or a listed equity ticker such as TSLA.
5. Select a sentence in the article, right-click, and choose **Analyze with Strike Everywhere**. Review the claim and use **Review simulation** → **Create virtual trade**.
6. Open **Ghost Trades** to refresh the mark or close virtually. **Receipts** exports the local record as JSON.

Jev is optional. In **Settings**, choose TypeSafe or OpenRouter and save the matching API key. OpenRouter defaults to `jev-latest`, using its System One endpoint through the bundled TypeSafe SDK. Existing users with an explicitly saved chat model can change the model ID to `jev-latest` and save again to use Jev. The key is saved locally on this device and can be cleared in Settings. Selected text is sent only after you tick the disclosure and press Analyze. Manual trades work without a key.

Development: `npm run dev`, then load `dist/` unpacked. Rebuild output is written by Vite.

## What it does

| Feature | Implementation |
|---|---|
| Symbol registry | `src/data/symbols.generated.json`, regenerated from `exchangeInfo`; refreshed in the worker every 24 h |
| Detection | Uppercase 2–12 char base assets (letters first, digits allowed), word-bounded; ambiguous tokens need `$`; skips code, inputs, URLs, first `h1`; debounced mutation scan; 40-highlight cap |
| Hover card | Closed Shadow DOM, 320 px, collision-checked, keyboard accessible (`Enter`/`Space`/`Esc`), 150 ms open / 200 ms close grace |
| Card states | `loading`, `ready`, `offline-cached`, `not-tradable`, `error` — every state renders content |
| Simulator | Liquidation price, initial margin, taker fee, funding/day, leverage capped to the market tier |
| 30-day replay | Exactly 43,200 consecutive completed 1m **mark-price** candles; entry fees, constant-rate hourly funding, staged reductions, adverse price excursion through the first liquidation |
| Offline | Last market snapshot served from IndexedDB when the network fails |
| Side panel | Discover, Markets, Ghost Trades, Receipts and Settings; the toolbar icon opens the panel |
| Market extras | Spread, mark-vs-index basis, average daily range from hourly candles, hourly-price sparkline |
| Slippage | Depth-based VWAP for the entered size; partial-fill warning; slipped entry used in replay |
| Strike app simulator | Reads ticket values only on Simulate/Refresh, supports a hypothetical single cross-margin position; labels the data network and execution-estimate limitations; rejects isolated margin |
| Watchlist | Top movers by 24h change and funding extremes from all-symbol tickers |
| Per-site toggle | Global switch, all-sites switch, per-domain override persisted in `chrome.storage.local` |
| Context capture | Selection-only context menu; sanitized http(s) source; 4,000-character claim limit; form-field selections refused; side panel opened on the user gesture |
| Ghost Trades | Locally stored virtual perpetual: fresh mark/book rules, full-fill market entry, stepped quantity, entry/exit fees, virtual close, immutable entry and claim snapshot |
| Ghost accounting | Decimal gross/net PnL, ROE on allocated collateral, explicit unknown funding, liquidation marked unavailable; no real order path exists |
| Jev BYOK | Official `@typesafe-ai/sdk` 0.7.0, TypeSafe or OpenRouter System One, locally saved key in `chrome.storage.local` with trusted-context access, consent-gated, structured enum answers, manual fallback |
| Receipts | Local viewer and JSON download with claim, original decision, entry fill/evidence, costs, policies, unknowns, events and monitoring gaps |

## Data sources

Strike market requests are public GETs. No API key, no auth header. Jev is a separate, optional POST to the selected TypeSafe or OpenRouter host with the user's saved key and only after explicit consent. OpenRouter Jev requests use `/api/v1/systemone`; explicitly selected chat models use `/api/v1/chat/completions` and are not Jev.

| Purpose | Endpoint | Cache |
|---|---|---|
| Symbols | `/price/v2/exchangeInfo` | 24 h |
| 24h stats | `/price/v2/ticker/24hr?symbol=` | 30 s |
| Mark / funding | `/price/v2/premiumIndex?symbol=` | 30 s |
| Open interest | `/price/v2/openInterest?symbol=` | bundled with snapshot, 30 s |
| Mark candles | `/price/v2/klines?interval=1m&priceType=mark` | reuse for the same completed minute, 1,500 per page |
| Order book | `/price/v2/depth?symbol=&limit=100` | 5 s |
| Best bid/ask | `/price/v2/ticker/bookTicker?symbol=` | 5 s |
| Volatility candles | `/price/v2/klines?interval=1h&priceType=mark` | 5 min |
| All-symbol tickers | `/price/v2/ticker/24hr` (no symbol) | 30 s |
| All-symbol funding | `/price/v2/premiumIndex` (no symbol) | 30 s |
| Margin tiers | `/v2/markets` | 24 h; stale cached tiers labelled, missing market tiers refuse the simulation |
| Verified market rules | `/price/v2/exchangeInfo` filters (`PRICE_FILTER`, `MARKET_LOT_SIZE`, `MIN_NOTIONAL`) | 24 h per symbol; unsupported/linear-settlement mismatch refuses Ghost entry |
| Jev analysis | `https://api.typesafe.ai` via the official SDK | Only after explicit consent and a button press; optional host permission; no automatic request |

The default base URL is **mainnet** (`https://api.strikefinance.org`), selected in `src/shared/constants.ts` at the owner's request. The registry refresh enables listed crypto and equity markets; availability still depends on each market's public data and margin tiers. Market snapshots and estimated fills are not execution guarantees. Market links open the mainnet Strike app; they do not transfer a quote or place an order. Caches are namespaced by API host and model version.

Mainnet verification found 32 listed symbols and confirmed BTC and TSLA market cards. BTC completed a 43,200-candle replay. TSLA's replay was refused because an API candle had an open above its high; listing availability does not guarantee usable replay history. See [mainnet verification](docs/verification/mainnet.md).

Deep link: `https://app.strikefinance.org/trade/<SYMBOL>`.

## Risk model

- Every API number stays a string until it becomes a `Decimal`. No `Number()`/`parseFloat` on money.
- Notional = mark × |size|; IM = notional / leverage; MM = notional × MMR − maintenance amount.
- Liquidation solves `wallet + signedSize × (mark − entry) = max(0, |signedSize| × mark × MMR − maintenanceAmount)` in the tier at the candidate liquidation mark. Long and short use the signed size. Initial margin is the initial cash budget; the entry fee is deducted from that budget.
- Slippage: consume `depth` asks for longs or bids for shorts until the requested notional is filled; use the VWAP as the entry price. If depth is too thin, mark the estimate partial and say so.
- Replay scales the historical mark path so its first open equals the current **mark**, while the position enters at depth VWAP when available. Keeping those separate preserves the effect of slippage. A partial book fill replays only the filled notional and labels the amount.
- Funding settles on each UTC hour after the opening instant, using that candle's open, the remaining signed quantity, and the current hourly rate held constant. Historical funding is not reconstructed.
- Only a hypothetical single cross-margin position is supported. Isolated margin is rejected rather than calculated with a different margin model.
- Replay checks `low` for longs and `high` for shorts, then applies the staged model: `fraction = 0.20 + 0.80 × clamp(R − 1, 0, 1)`, `reduce = min(remaining, 5000/price + remaining × fraction)`. Attempt 5 closes the remainder. One attempt per candle; a taker fee is charged on each reduction.
- Taker fee is `0.0005` (5 bps), defined in `src/shared/constants.ts`.

## Ghost Trade model

- A Ghost Trade is a **live virtual trade — no real funds**. It is created only by an explicit button press after a fresh quote; there is no order endpoint in the codebase.
- Entry uses the current book: long consumes asks, short consumes bids. Quantity is floored to `MARKET_LOT_SIZE.stepSize`, then notional, VWAP and fees are recomputed from the rounded quantity. Insufficient depth, stale mark/book source times (>15 s), crossed/unordered books, min/max quantity and min notional reject the trade. The review preview and the accepted fill are separate fresh quotes, so they can differ.
- The preview and the immediate open-position summary share one **mark-based** calculation: gross at mark, entry fee on the fill, estimated exit fee on mark notional. The preview says “valuation basis: current mark, not an executable close”.
- Virtual close is one full-fill market order. Entry minimums do not block a small close; the current per-order maximum does, and split closes are not supported (a clear error is returned instead of a silent oversized fill).
- Collateral mode fixes virtual collateral and sets `target notional = collateral × leverage`; notional mode fixes exposure and sets `allocated initial margin = notional ÷ leverage`. Changing leverage in notional mode leaves gross dollar PnL unchanged; the cases are tested separately.
- Long gross PnL = `Q × (exit − entry)`; short = `Q × (entry − exit)`. Entry and exit fees are charged separately from collateral. Open PnL estimates the close fee from the current mark.
- Funding is **not reconstructed**. Net values are exported as `netExcludingUnknownFunding`, never as a definitive net. The latest funding rate is not treated as historical settlement.
- Liquidation is shown as **unavailable — risk scenario only**. The old cross-margin replay is kept as a separate 30-day scenario and is not relabelled as a Ghost trade.
- Observations are written when the panel boots or the user presses Refresh. A gap longer than ten minutes records a `monitoring_gap`; browser closure is not claimed as continuous monitoring.
- Entry, claim snapshot, allocated collateral and the creation request are immutable. `creationRequestId` and `closeRequestId` make duplicate submits idempotent; trade and entry event are written in one IndexedDB transaction.
- Receipts are built from stored evidence, not recomputed from current prices. JSON export is a local Blob download with no credentials.

## Verification

```bash
npm run typecheck   # tsc --noEmit
npm run test        # unit and message-integration tests
npm run build       # dist/ + manifest
```

Tests include independent equity-vs-maintenance checks, signed liquidation, tier crossing, entry fees, UTC funding, slippage affecting the actual replay verdict, history completeness, malformed API data, settings initialisation, presentation, detector false positives, Ghost accounting/fill/resolve/lifecycle rules, preview-vs-summary parity, capture ordering, freshness labels, monitoring-gap close, privileged-message validation, and Jev response parsing. The current suite is 135 tests across 20 files. Formula fixtures are regression examples, not API ground truth.

The Ghost browser check loads the production `dist/` in a clean profile, creates a real-data virtual trade, checks that the freshness label ages to stale under a page clock without polling, refreshes/closes it, exports and parses the receipt, reloads to confirm the entry is unchanged, seeds and verifies a claim snapshot, rejects insufficient depth, and verifies a runtime capture opens/focuses Discover from Settings. See [Ghost verification](docs/verification/ghost-trading.md).

Current browser verification and its limitations are recorded in [docs/verification/2026-10-22.md](docs/verification/2026-10-22.md). Deterministic UI checks and actual unpacked-extension checks are separate. The reproducible scripts use an existing Playwright installation; no dependency was added to this project.

The current graphite/ivory/mint interface, progressive risk details, market-view controls, and live screenshots are documented in [the UI redesign report](docs/verification/ui-redesign.md).

Historical V1 check on 2026-10-20 (mainnet build before the fixes below; not evidence for the current build):

- 10 highlights on the fixture; none in the `h1`, `<pre>`, the input, or the URL link; `$NEAR` matched, bare `near` did not.
- Hover showed TSLA-USD mark price, +2.73% 24h, funding, open interest and volume from mainnet.
- Simulator at $5,000 / 10x: liquidation $336.54 (−8.16%), initial margin $500, fee $2.50, then `Survived 30 days`, worst drawdown −5.51%, 43,200 mark candles.
- `Esc` removed the card; the closed shadow root stayed closed.
- Network disabled after cache expiry rendered `Offline — cached data from …`.
- Setting `allSites=false` removed all 10 highlights, re-enabling restored them, and `enabled=false` removed them again.

Historical V2 check on 2026-10-21 (mainnet build before the fixes below; not evidence for the current build):

- Side panel: toolbar icon opens the panel; settings and a 10-row watchlist render. Top movers showed SPCX, ZEC, TSLA, NEAR, GOOGL; funding extremes showed SKHYNIX, NIGHT, ADA, ZEC, PUMP with `%/h` values.
- Strike app `app.strikefinance.org/trade/btc`: floating **Simulate** button appeared; auto-read picked up 10x leverage, Long, Cross; size was empty without a wallet so it was entered manually. The replay rendered `Survived 30 days`, entry `$83,705.3 (slipped)`, slippage `-3.4 bps`, liquidation `$75,637.32`, initial margin `$500`. No order was submitted.
- The news-page scanner still highlighted `BTC`, `ETH`, `XRP`, `SOL`, `ZEC`, `BNB`, and `CRCL` on a real CoinDesk article.

## Known limitations

- **No position-level API ground truth.** A request to `/v2/positions` without an account selector returned 401 with `authentication required or provide vault_id, account_id, or blockchain_address`. This does not prove selected public-address queries require authentication. Three real positions have not been compared; `tests/fixtures/positions.json` contains algebraic regression cases, including a corrected short case. The owner allowed UI work to continue with the experimental label; the ground-truth acceptance gate remains unmet.
- The server gap-fills missing candles with the previous close and zero volume, which **understates volatility**. The card says so.
- Funding during replay uses the current hourly rate, not historical funding (stretch S4).
- Equity symbols are mainnet-only. Base assets longer than 12 characters are never detected; the current registry's longest is 7 (`SKHYNIX`, `UNITREE`).
- Replay uses the current mark notional's tier and charges entry and reduction taker fees. It can attempt only one reduction per minute, at that candle's adverse extreme. Intraminute ordering, liquidation penalties, fee discounts, and other positions in a cross-margin wallet are not modelled.
- An uncached replay fetches 29 pages in batches of six. The same completed-minute window is reusable; a newer minute requires a fresh window. Incomplete, stale, or malformed history produces an error with no verdict. A flat or server-gap-filled history may still be structurally complete; continuity validation does not establish data quality.
- Content scripts match `http(s)` only. Opening `demo/article.html` from `file://` requires enabling file access and adding `file:///*` to the manifest; use `npm run demo` instead.
- `not-tradable` is only reachable if the registry and the markets endpoint disagree; every symbol in the bundled registry is currently tradable.
- Slippage estimates use a 5-second depth cache and can be noisy on thin markets. Partial fills are labelled.
- Auto-read on the Strike app is selector-based and can break when the app's DOM changes. If size, leverage, or side cannot be read, the panel asks for manual input; it reads on Simulate/Refresh only, not continuously.
- Isolated margin is unsupported and rejected with an explanation.
- Replay preserves historical percentage moves from today's mark and a separate execution entry; it does not reproduce an actual historical account.
- The side panel watchlist refreshes every 30 seconds or on Refresh.
- Ghost Trades are virtual and local. Funding is unknown and excluded from net; liquidation is unavailable; SL/TP, limit and partial-fill Ghost orders are not implemented. Monitoring happens on panel boot and manual Refresh only; a direct virtual close records an unobserved gap when the threshold is exceeded.
- A position larger than the market's current per-order maximum cannot be closed as a single virtual market order; the close is refused with a clear error rather than split silently.
- A real authenticated Jev call has not been verified because no owner key was available. Missing/invalid key, timeout, rate limit and malformed response fall back to the manual flow; the SDK boundary and structured parser are unit-tested.
- The context-menu capture path is covered by permission checks, URL sanitation tests and a seeded claim in the extension UI. A real native right-click was not automated in headless Chrome; verify it manually in a clean profile.
- The stored claim keeps the page path but strips query, fragment and credentials. The panel and receipt display the source domain, not the full path.
- Receipts are export-only. Import, sharing and backend sync are not implemented.
- TypeSafe is an optional host permission. Saving a key requests it from the Settings button; if permission is denied, Jev stays off and manual Ghost Trades still work.

## Submission materials

- [Project description and judging narrative](docs/submission.md)
- [90-second demo script and recording checklist](docs/demo-script.md)
- [Verification evidence and remaining release gates](docs/verification/2026-10-22.md)

The source folder currently has no Git metadata. Publish the source repository and provide a real demonstration link before submitting. Existing work is eligible only with meaningful advancement during the hackathon; document those changes honestly. No repository or video has been published by these edits.

## Privacy and safety

- News-page content scripts read only text nodes they scan. The Strike app simulator reads order-ticket values (size, leverage, side, margin mode) only when the user clicks Simulate or Refresh; it never reads cookies, `localStorage`, or account data, and never logs page text or URLs.
- The selection context menu is created for `selection` only and refuses editable form fields. The claim text leaves the browser only after the user ticks the TypeSafe disclosure and presses **Analyze with Jev**. Source URL, query, fragment, account data, balances and receipts are not sent.
- The Jev key is held in `chrome.storage.local` with trusted-context access. It is never returned to the panel, written to the ledger/receipt, or logged; it stays on this device until you clear it.
- Content scripts cannot call privileged claim/Ghost/Jev messages: the worker checks the sender's extension origin, and the key messages are restricted to trusted extension pages.
- Network access is limited to the two Strike API hosts in `host_permissions` plus the optional `https://api.typesafe.ai/*` host requested only for Jev.
- No remote code, fonts, analytics, crash reporting, or order endpoints.
- Every card ends with: *Data from Strike. Not financial advice.*

## Layout

```
src/shared/      types + constants + v2 message/result types + Ghost contracts
src/lib/         api, cache, symbols, detector, slippage, market extras, watchlist, ticket reader
src/risk/        pure margin + replay engine
src/ghost/       pure accounting/fills/rules/resolver/lifecycle + ledger store + orchestration
src/jev/         TypeSafe client, structured questions/parser, session key boundary
src/content/     detector wiring, hover card, Strike app simulator, shadow-DOM UI
src/background/  message router, context menu, caching, replay + Ghost orchestration
src/popup/       side-panel Discover/Markets/Ghost/Receipts/Settings views
tests/           margin, replay, detector, slippage, market extras, watchlist, ticket reader, Ghost, Jev, fixtures
demo/            local article fixture + static server
```

## License

MIT. See `LICENSE`.
