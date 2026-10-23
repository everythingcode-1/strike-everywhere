# Strike Everywhere V2 — design

Date: 2026-10-21
Status: draft for review

## Intent

Turn the extension from a passive ticker card into a two-mode pre-trade risk tool:

1. **Inline ticker card** on news sites (existing behaviour).
2. **Pre-trade simulator** on `app.strikefinance.org`: the extension reads the order ticket the user is already filling in, runs the 30-day mark-price replay, and shows whether that position would have survived. Execution stays on Strike.

The second mode is the differentiator. The Strike app already shows estimated entry, slippage, estimated liquidation price, margin, and fees. It does **not** show whether the position would have survived the last 30 days. The extension adds that answer without taking custody or placing orders.

## Why now

The product currently answers "what is the market?" while the user is reading. The missing question is "would this position survive?" — asked at the moment the user is about to submit an order. The Strike app is the right place to answer it. A side panel also removes the settings popup from the critical path and gives the product room to show a watchlist.

## Goals

- Replace the action popup with a Chrome **side panel** that hosts settings and a market watchlist.
- Add a dedicated content-script mode for Strike trading pages that does not run the news ticker scanner.
- **Auto-read** the order ticket on demand: symbol from the URL, size from the size/qty inputs, leverage from the leverage control, side from the active Long/Short tab.
- Inject a **Simulate** affordance and a slide-over result panel on Strike pages. Read values on click; offer a refresh.
- Add **slippage estimate** from order-book depth and best bid/ask; use the slipped entry price in the replay and label it.
- Add **spread** and **mark-vs-index basis** to the inline card.
- Add **volatility/ATR and a sparkline** from 1-hour klines.
- Add a **watchlist / top movers** view to the side panel using all-symbol tickers.
- Keep the existing privacy posture: no order submission, no wallet connection, no account data, no telemetry.

## Non-goals

- Placing, cancelling, or modifying orders.
- Connecting wallets, depositing, withdrawing, or reading account balances.
- Portfolio management, position management, or copy trading.
- Chrome Web Store publication.
- Real-time WebSocket streaming in this version (polling and short caches only). WebSocket is a possible later stretch.
- Testnet support in this version. The app host is mainnet; switching API bases per host is a separate change.

## Anti-goals

- Breaking or intercepting the Strike trading UI.
- Reading sensitive account data or form values without an explicit user action.
- Sending page text, URLs, or form values to any server other than the documented Strike API hosts.
- Duplicating metrics the Strike app already shows. The extension should add the 30-day replay, not a second static calculator.

## Constraints

- `src/shared/types.ts` is marked HUMAN-OWNED and agents must not edit it. New message and result types should live in a separate file unless the owner approves an edit.
- The general content script matches all `http(s)` pages. On Strike hosts it must not wrap tickers in the trading UI; use a hostname branch.
- Replay currently uses 1-minute mark candles and can take about 10 seconds on the first run. The simulator should not block the order form.
- Chrome side panel requires Manifest V3 and the `sidePanel` permission. It is available in current Chrome.
- Order-ticket selectors observed on 2026-10-21:
  - Symbol: URL path `/trade/<symbol>` (for example `/trade/btc`).
  - Size: `input#collateral-amount[aria-label="Size"]`.
  - Quantity: `input[aria-label="Market order quantity"]`.
  - Leverage: `button[data-tutorial="leverage"]`, text like `10x`.
  - Margin mode: `button[data-tutorial="margin-mode"]`, text `Cross`.
  - Side tabs: buttons with text `Long/Buy` and `Short/Sell`; the active tab carries `bg-primary-muted text-primary`.
  - Submit buttons: `button[aria-label="Submit market Long order"]` and `button[aria-label="Submit market Short order"]`.
  These are brittle and must be treated as hints with fallbacks.

## Architecture

### Manifest and service worker
- Add `"sidePanel"` to `permissions`.
- Add `"side_panel": { "default_path": "src/popup/index.html" }`.
- Remove `action.default_popup` so the toolbar icon opens the side panel.
- In the service worker, call `chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })`.

### Content script split
- `src/content/index.ts` keeps the news scanner. At boot, if the hostname is a Strike app host, delegate to the simulator module and return without scanning.
- New `src/content/simulator.ts` mounts a closed Shadow DOM slide-over and a small floating "Simulate" button. It reads the order ticket only when the user clicks Simulate or Refresh. It never calls submit buttons.
- New CSS for the simulator panel, kept inside the shadow root.

### Data layer
New API wrappers in `src/lib/api.ts`:
- `fetchDepth(symbol, limit)` → `GET /price/v2/depth`.
- `fetchBookTicker(symbol)` → `GET /price/v2/ticker/bookTicker`.
- `fetchKlines(symbol, interval, limit)` → `GET /price/v2/klines` (used for 1h volatility/sparkline).
- `fetchAllTickers()` → `GET /price/v2/ticker/24hr` without `symbol`.
- `fetchAllPremium()` → `GET /price/v2/premiumIndex` without `symbol`.

New background handlers:
- `market:get` extended to include spread, basis, volatility, sparkline, and slippage for a requested size. Or a separate `market:extra` message to keep the existing payload stable.
- `simulate:run` for the Strike page: accepts symbol, sizeUsd, leverage, side, optional slippage, and returns the replay plus the entry price used.
- `watchlist:get` for the side panel.

Caching:
- depth/bookTicker: 5 seconds.
- klines 1h: 5 minutes.
- all-symbol tickers/premium: 30 seconds.
- replay candles: existing until-next-UTC-day cache.

### Slippage
- For a long, consume asks from the depth snapshot until the requested notional is filled; for a short, consume bids.
- Compute VWAP and slippage in basis points versus mark.
- If depth is insufficient to fill the size, mark the estimate as partial and say so.
- Use the VWAP as the replay entry when available; otherwise use mark and label the replay `mark entry`.
- The replay result should expose `entryPrice` and `entrySource` so the card can show what was used.

### Inline card additions
- Spread: ask − bid, in dollars and basis points.
- Basis: (mark − index) / index, percent.
- Volatility: average daily range over 30 days from 1h candles, or ATR; label the method.
- Sparkline: downsample 30 days of 1h closes to about 60 points; render as inline SVG.
- Replay label: `Entry: $X (mark)` or `Entry: $X (slipped)`.

### Side panel
- Reuse the existing popup HTML and CSS, widened for the side panel.
- Sections: extension enabled, detect on all sites, per-site toggle, current-site status, watchlist.
- Watchlist: top movers by 24h change and top funding extremes. One refresh action; cache 30 seconds.
- Empty/error states must render text, not blank space.

### Strike simulator flow
1. User opens `/trade/<symbol>` on `app.strikefinance.org`.
2. The extension injects a floating "Simulate" button near the order ticket. It does not alter the ticket.
3. On click, read symbol, size, leverage, side. If a field cannot be read, show the panel with that field empty and ask the user to fill it.
4. The panel shows: symbol, mark/index, spread, slippage estimate, estimated entry, liq price, initial margin, taker fee, funding/day, and a "Run 30-day replay" action.
5. Replay runs through the existing background engine and returns survived/liquidated, first liquidation time, worst drawdown, events, and candles used.
6. The panel includes "Execution stays on Strike" and a deep link to the market. It never submits an order.
7. A "Refresh from form" button re-reads the ticket. A close button removes the panel.

## Security and privacy

- The simulator reads only the order-ticket fields on explicit click. It does not read cookies, local storage, account data, or page text.
- No new host permissions are needed for the app page because the content script already matches `http(s)`.
- API calls remain limited to the two documented Strike hosts.
- No telemetry, analytics, remote fonts, or remote code.
- The extension never clicks the submit buttons and never uses authenticated order endpoints.

## Risks

- Strike DOM changes can break auto-read. Mitigation: prefer `aria-label`, `id`, and `data-tutorial`; always allow manual entry; show a clear fallback message.
- Wallet-gated order tickets may be disabled or empty before connection. Mitigation: read what exists; if size is empty, ask the user to enter it in the panel.
- Slippage estimates are noisy on thin markets and depth is cached for 5 seconds. Label them as estimates and show the snapshot time.
- Using a slipped entry changes replay outcomes versus the current mark-entry model. Label the entry source and keep mark-entry as a fallback.
- The side panel changes the action-click behaviour. Users who expect a popup may be surprised; the README must be updated.
- Adding many API calls on hover could slow the card. Mitigation: short caches and lazy loading; fetch extra data only after the base card renders.

## Decisions after builder check

These are my calls; the owner can override any of them.

1. **Replay entry time basis.** Normalise the 30-day candle path to the intended entry price before replaying: multiply each candle's open/high/low/close by `entry / firstCandleOpen`. The position starts at the user's entry (slipped VWAP or mark) and experiences the same percentage path as the last 30 days. Label the result "If the last 30 days repeated from this entry" and keep the existing mark-entry path as a fallback. Without normalisation the replay mixes a 30-day-old price path with today's entry and can show false liquidations. This changes the replay engine's input preparation, not its margin math: notional stays `sizeUsd`, so tier selection and margin remain consistent.
2. **Order-ticket size field.** Read all three sources and pick the first that parses: the "Order Size" display (USD notional), `#collateral-amount` with its suffix (`BTC` means base size; multiply by mark for notional), then `input[aria-label="Market order quantity"]` × mark. Always allow manual override in the panel. This avoids guessing whether "Size" means collateral or notional.
3. **Margin mode.** V2 assumes cross margin, matching the current engine. Read the margin-mode control; when it says isolated, show "Simulator assumes cross margin; isolated results may differ" and mark the replay approximate. Isolated modelling is a stretch goal.
4. **Panel metrics.** The panel shows the replay result plus only the inputs used by the replay: entry price and source, liquidation price, initial margin, taker fee, funding/day. Label them "computed by extension". Do not reproduce the app's whole calculator; the app already shows its own estimates.

## Open question for the owner

1. **Replay semantics.** My call is to normalise the historical path to the user's entry and label it "If the last 30 days repeated". The alternative is to replay the actual historical path with the mark from 30 days ago as entry, which answers "if you had entered 30 days ago". The first fits "before trading"; the second is a truer backtest but less relevant to a position being opened now. Confirm the first, or choose the second.

Settled without asking:

- Auto-run replay only when the day's candles are already cached; otherwise wait for a click.
- Auto-read on Simulate/Refresh only, not continuously.
- New message and result types go in a separate file; `src/shared/types.ts` stays untouched.
- Side panel includes a compact watchlist.
- Mainnet only in this version.
