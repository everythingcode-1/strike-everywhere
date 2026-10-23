# Strike Everywhere — Product Specification

**Status:** Draft v1 (hackathon build)
**Build window:** Wed 21 Oct 2026 10:00 ET → Fri 23 Oct 2026 10:00 ET
**Local time (WIB, UTC+7):** Wed 21:00 → Fri 22:00
**Deliverable:** working Chrome extension (MV3) + demo video + public repo + documentation

---

## 1. One-line definition

> A Chrome extension that detects asset tickers on any web page — TSLA, BTC, NVDA, CRCL — and turns them into a live Strike market card, with a 30-day position simulator before the user commits capital.

Short name: **Strike Everywhere**.

---

## 2. Problem

Strike has a functioning product and a small user base (TVL ~$2.4M, 30-day perp volume ~$238M). The three projects Strike showcases — Bolt, Strike Copilot, Hizz — are all **retention** tools: they only help people who are already Strike users.

Nothing in the ecosystem is an **acquisition** surface.

At the same time, a trader's decision to enter a position happens away from the exchange: while reading a news article, a tweet, an earnings note, a research post. By the time they open app.strikefinance.org, the context is gone and the impulse has cooled.

There is a second, narrower problem: when they do trade, they pick size and leverage without evidence of survivability. Feedback arrives after the loss, never before.

**Strike Everywhere solves both by moving the market to the moment of context, and attaching a risk check to that same moment.**

---

## 3. Target user and moment

**Primary user:** retail leverage trader, $200–$5,000 account, 2–10x, reads crypto/equity news in a desktop browser, already uses Cardano or EVM wallets.

**The moment:** reading about an asset and forming an opinion. Duration: 10–30 seconds. If the product is not present then, it will not be opened.

**Secondary user:** a Strike-curious reader who has never used the protocol. The card is their first contact with Strike.

---

## 4. User flow

### Step 1 — Detection

Article text:

```
Analysts raised their TSLA price target to $480...
                    ‾‾‾‾
```

The ticker gets a subtle dotted underline. Nothing else changes. No layout shift, no banner, no popup.

### Step 2 — Hover card

```
┌──────────────────────────────────────────┐
│ TSLA-USD · Strike                    [×] │
│                                          │
│ $412.30          +1.82% (24h)            │
│ Funding +0.0040%/h · next in 2h 14m      │
│ Open interest $1.2M · 24h vol $8.4M      │
│                                          │
│ [ Preview position ]   [ Open on Strike ]│
│                                          │
│ Data from Strike · Not financial advice  │
└──────────────────────────────────────────┘
```

### Step 3 — Position simulator

```
Size (USD)  [ 5,000 ]     Leverage  [ 10x ]

Liquidation price     $374.10    (−9.3%)
Initial margin        $500.00
Fee (taker)           $2.50
Funding               $2.40 / day

30-day replay (mark price, 1m candles)

  LIQUIDATED on 11 Oct, 03:14
  Drawdown before liquidation: −11.2% in 40 min

  [ Test a smaller size ]   [ Open on Strike ]
```

### Step 4 — Handoff

"Open on Strike" opens the Strike market page. Order placement inside the extension is a stretch goal, not part of v1.

---

## 5. Why an extension (and not a web app)

Only the extension can do two things:

1. **Exist on a page Strike does not own.** A web app requires the user to come to it; a content script goes to them.
2. **Read intent from the page context** — the ticker the user is currently reading about — without asking them to type anything.

Everything else in this spec could be a web app. These two cannot. If a feature does not need them, it does not belong in v1.

---

## 6. Scope

### 6.1 Must ship (v1)

| # | Feature | Notes |
|---|---|---|
| F1 | Symbol registry built from `exchangeInfo` | Bundled at build time, refreshed every 24h |
| F2 | Ticker detector | Uppercase 2–5 chars, word boundary, skip code/inputs, allowlisted domains first |
| F3 | Hover card | Price, 24h change, funding, OI, volume |
| F4 | Position simulator | Liq price, initial margin, fee, funding/day |
| F5 | 30-day replay | Mark-price candles, liquidation detection, partial-liquidation model |
| F6 | Deep link to Strike market | Exact URL verified in hour 0–2 |
| F7 | Per-site toggle | On/off, persisted |
| F8 | Offline/cached mode | Card renders from IndexedDB if network fails |
| F9 | Disclaimer | One line, visible in every card |

### 6.2 Stretch (only if F1–F9 are done and verified)

- S1 Direct order placement via Builder Codes (`X-Builder-Fee-Bps` 5–10)
- S2 Company-name detection ("Tesla" → TSLA) with a curated alias file
- S3 Slippage estimate from `/price/v2/depth`
- S4 Funding history applied during replay instead of current rate
- S5 Cross/isolated margin modes

### 6.3 Explicit non-goals

- No wallet connection in v1
- No WebSocket / real-time streaming
- No portfolio view, no dashboard, no chart
- No order execution, no leverage setting, no position management
- No Chrome Web Store publication (review takes 1–3 days)
- No telemetry, no analytics, no remote logging
- No account data, no private keys, no seed phrases

---

## 7. Architecture

```
┌─────────────────────────────────────────────────────────────┐
│ Content script (per page)                                   │
│  ├─ Symbol registry lookup                                  │
│  ├─ Text walker → ticker spans                              │
│  └─ Hover card (Shadow DOM)  ─────────────┐                 │
│                                            │                 │
│ Service worker                             │ messages        │
│  ├─ API client (fetch + retry + cache)  ◄──┘                 │
│  ├─ Market data cache (IndexedDB)                            │
│  └─ Risk engine (pure functions, no DOM)                     │
│                                                              │
│ Popup                                                        │
│  ├─ Global on/off                                            │
│  ├─ Per-site allowlist                                       │
│  └─ About / disclaimer                                       │
└─────────────────────────────────────────────────────────────┘
```

**Design rule:** the risk engine is pure TypeScript with zero browser dependencies. It must be testable under Node and reusable by any future client.

### 7.1 Repository layout

```
strike-everywhere/
├── SPEC.md
├── AGENTS.md
├── README.md
├── manifest.json
├── package.json
├── vite.config.ts
├── src/
│   ├── shared/
│   │   ├── types.ts            # HUMAN-OWNED. Agents do not edit.
│   │   └── constants.ts
│   ├── lib/
│   │   ├── api.ts              # fetch wrappers, base URLs, retry
│   │   ├── cache.ts            # IndexedDB helpers
│   │   ├── symbols.ts          # registry load + alias map
│   │   └── detect.ts           # text walking + matching rules
│   ├── risk/
│   │   ├── margin.ts           # IM, MM, liq price, margin ratio
│   │   ├── replay.ts           # 30-day simulation
│   │   └── types.ts
│   ├── content/
│   │   ├── index.ts            # bootstrap, observer, toggles
│   │   ├── card.ts             # hover card UI
│   │   └── card.css
│   ├── background/
│   │   └── index.ts            # service worker, message router
│   ├── popup/
│   │   ├── index.html
│   │   └── index.ts
│   └── data/
│       └── symbols.generated.json
└── tests/
    ├── margin.test.ts
    ├── replay.test.ts
    └── fixtures/
        ├── positions.json
        └── klines.BTC-USD.1m.json
```

---

## 8. Data sources

All endpoints below are **public** unless stated. No API key is required for v1.

| Purpose | Endpoint | Auth | Cache TTL |
|---|---|---|---|
| Symbol list + filters | `GET {API}/price/v2/exchangeInfo` | none | 24 h |
| 24h stats (change, volume) | `GET {API}/price/v2/ticker/24hr?symbol=` | none | 30 s |
| Mark / index / funding | `GET {API}/price/v2/premiumIndex?symbol=` | none | 30 s |
| Mark price snapshot | `GET {API}/price/v2/markPrice?symbol=` | none | 15 s |
| Open interest | `GET {API}/price/v2/openInterest?symbol=` | none | 60 s |
| Candles | `GET {API}/price/v2/klines` | none | until next UTC day |
| Margin tiers | `GET {API}/v2/markets` | none | 24 h |
| Order book depth (stretch) | `GET {API}/price/v2/depth` | none | 5 s |
| Order placement (stretch) | `POST {API}/v2/order` | API wallet | — |

**Base URLs**

- Mainnet `API = https://api.strikefinance.org`
- Testnet `API = https://api-v2-testnet.strikefinance.org`
- App `https://app.strikefinance.org`

**Defaults:** develop and demo against **testnet** unless a mainnet market is required for a specific symbol.

### 8.1 Candles

```
GET /price/v2/klines?symbol=BTC-USD&interval=1m&limit=1500
    &startTime=<ms>&endTime=<ms>&priceType=mark
```

- `limit` max **1500** (clamped by server)
- 30 days at 1m = **43,200 candles → 29 sequential requests**
- Use `priceType=mark`. Strike liquidates on mark price, not last price. Using `last` produces wrong results and is a correctness bug.
- Responses are server-cached for 5 s; do not poll faster.
- Server gap-fills missing candles with the previous close and zero volume. **This understates volatility.** The UI must state this limitation.

### 8.2 Margin tiers

`GET /v2/markets` is documented in the Builder Reference as the source of `margin_tiers` (`max_notional`, `mmr`, `maintenance_amount`, leverage caps). **Verify this in hour 0–2.** If unavailable, fall back to a conservative MMR assumption and label the result `approximate`.

---

## 9. Risk model

All values from the API are **strings**. Parse with a decimal library; never use IEEE-754 floats for money.

### 9.1 Position math

```
notional   = markPrice × |size|
uPnL       = (markPrice − entryPrice) × size        // size signed: + long, − short
IM         = notional / leverage
MM         = notional × MMR − maintenanceAmount     // tier: first where notional ≤ max_notional, else last
marginBal  = walletBalance − Σ(isolated balances) + Σ(cross uPnL)
marginRatio = MM / marginBal                        // liquidation at ≥ 1.00
```

### 9.2 Liquidation price

```
dir = +1 long, −1 short
LP  = (entryPrice − (wallet + totalUPnL − totalMM + MA) / size) / (1 − dir × MMR)
LP ≤ 0 → no liquidation price
```

For the simulator, the position is **hypothetical**: start from the user's entered size and leverage, assume entry at current mark price, assume cross margin and an empty account unless the user provides a balance.

### 9.3 Fees and funding

```
commission = round(notional × takerRate, quotePrecision)
funding    = −size × markPrice × hourlyRate
```

Funding is displayed as a daily cost using the current rate (`lastFundingRate × 24`). It is an estimate and must be labelled as such.

### 9.4 30-day replay

Input: hypothetical position, 30 days of 1m **mark** candles, margin tier table.

```
for each candle:
    adverse = (dir == +1) ? low : high
    if violates liquidation price:
        record event(timestamp, candle, marginRatio)
        apply partial liquidation (9.5)
        if position fully closed → stop
```

Report:
- survived / liquidated
- timestamp of first liquidation event
- worst adverse excursion before that event
- number of liquidation events
- remaining size after staged liquidations

### 9.5 Partial liquidation model

Strike liquidates in up to 5 attempts rather than closing the full position. Documented behaviour:

```
R        = marginRatio                     // 1.00 = 100%
progress = clamp(R − 1, 0, 1)
fraction = 0.20 + 0.80 × progress
baseSize = 5000 / price
reduce   = min(remaining, baseSize + remaining × fraction)
```

Attempts 1–4 reduce by `reduce`; attempt 5 closes the remainder. Model the fee charged on each reduction. If the implementation cannot complete this in time, fall back to "first touch = full close" and **label the result `simplified`**. Never present a simplified model as exact.

### 9.6 Ground truth verification (mandatory)

`GET /v2/positions?blockchain_address=<addr>` returns `liquidation_price`, `maintenance_margin`, `upnl`, `leverage`, `margin_mode`, `entry_price`, `size` and is **public**.

Before any UI work:

1. Pick 3 real positions across 2 symbols and 2 margin modes.
2. Compute liquidation price and maintenance margin with our engine.
3. Compare against the API values.

Acceptance: match to the market's `quotePrecision`. Store the three fixtures in `tests/fixtures/positions.json` and keep the test in CI.

If the values do not match, **stop and fix the math**. Do not build UI on top of an unverified engine.

---

## 10. Ticker detection

### 10.1 Rules

Match a token when **all** are true:

1. Token is 2–5 characters, uppercase, or prefixed with `$`.
2. It maps to a `baseAsset` in the Strike symbol registry.
3. It is bounded by non-alphanumeric characters on both sides.
4. It is not inside `<code>`, `<pre>`, `<input>`, `<textarea>`, `[contenteditable]`, or an anchor whose text is a URL.
5. The page is on an allowlisted domain, **or** the user has enabled all sites.

### 10.2 False-positive control

- Require either a `$` prefix or membership in a curated "high confidence" set (equities and major crypto).
- Cap highlights at 40 per page; deduplicate.
- Never highlight inside the first `<h1>` (avoids mangling headlines).
- Debounce DOM mutations; re-scan only added nodes, never the whole document.

### 10.3 Default allowlist

`finance.yahoo.com`, `bloomberg.com`, `reuters.com`, `coindesk.com`, `theblock.co`, `decrypt.co`, `cointelegraph.com`, `x.com`, `substack.com`, `medium.com`.

User can add domains. Default state on non-allowlisted sites: **off**.

---

## 11. UI requirements

- Rendered in a **closed Shadow DOM** — no global CSS leakage in either direction.
- Card width 320 px; dark theme matching Strike; text contrast ≥ 4.5:1 (WCAG AA).
- Appears after **150 ms hover intent**; disappears on mouse-out with 200 ms grace so the user can move into the card.
- Keyboard: focusable ticker spans, `Enter` opens card, `Esc` closes.
- Positioned with collision detection; never clipped by viewport edges.
- States: `loading`, `ready`, `not-tradable`, `offline-cached`, `error`. Every state must render something; an empty card is a failure.
- Disclaimer on every card: "Data from Strike. Not financial advice."
- No layout shift: the ticker span must not change line height or width.

---

## 12. Demo script (3 minutes)

1. **0:00** — Open a saved Reuters-style article about Tesla in Chrome.
2. **0:10** — Point at `TSLA`. Card appears: live price, funding, OI, from Strike.
3. **0:25** — Click "Preview position", enter $5,000 at 10x.
4. **0:40** — Read the verdict: liquidation price, funding/day, "survived 30 days, worst drawdown −18%".
5. **1:05** — Change leverage to 20x. Verdict flips to "liquidated on 11 Oct, 03:14".
6. **1:25** — Cut to `$BTC` in the same article: card shows BTC-USD.
7. **1:45** — Toggle the extension off for the site; highlights disappear. Toggle on: they return.
8. **2:00** — Open DevTools → Network → **Offline**. Hover again. Card still renders from cache.
9. **2:20** — Click "Open on Strike": market page opens.
10. **2:40** — One slide: "Hizz, Copilot, Bolt are retention. This is acquisition."

Record this as a video **before** the final day. The video is the submission artifact; the live demo is a bonus.

---

## 13. Mapping to judging criteria

| Criterion | How this project answers it |
|---|---|
| **1. Innovation** | No perp venue uses the browser as a distribution surface. Strike lists equities, so this reads as "trade the stock you are reading about", not "another crypto widget". |
| **2. Integration** | Uses four protocol capabilities: `exchangeInfo`, `premiumIndex`/`ticker`, `klines`, margin tiers. Stretch adds Builder Codes. |
| **3. Utility & Impact** | Directly answers "could it attract users": it is the only acquisition surface in the ecosystem. Also improves trading via the risk preview. |
| **4. Technical execution** | No wallet, no WebSocket, no DOM scraping of Strike's app. Deterministic demo, cached data, unit-tested math against Strike's own liquidation prices. |
| **5. Future potential** | Every new listed market adds a surface. Every new financial site adds a channel. Grows without new features. |

---

## 14. 48-hour plan

| Hours (from start) | Work | Gate |
|---|---|---|
| 0–2 | Verify all endpoints with `curl`. Confirm `/v2/markets` margin tiers, `priceType=mark` klines, public positions. Confirm deep-link format. | **G1** — if any is missing, change plan now |
| 2–6 | `lib/api.ts`, `lib/cache.ts`, symbol registry, `risk/margin.ts` | |
| 6–10 | Replay engine + fixtures + tests | **G2** — computed liquidation price matches API on 3 positions |
| 10–16 | Extension shell, manifest, content script, Shadow DOM card | |
| 16–22 | Detector, hover behaviour, positioning, states | **G3** — works on 3 different sites without layout breakage |
| 22–28 | Simulator UI, caching, offline mode, toggle | |
| 28–34 | Polish, error states, accessibility, README | |
| 34–40 | Record demo video, write submission text | **G4** — video complete |
| 40–48 | Buffer, bug fixes, submit | Submit by hour 45 |

**G2 is non-negotiable.** A beautiful UI on wrong math loses the technical-execution criterion and may produce a publicly wrong claim.

---

## 15. Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Deep link cannot prefill order | Medium | Card still opens the market page; demo loses one beat, nothing breaks |
| Margin tiers not exposed at `/v2/markets` | Medium | Conservative MMR fallback, labelled `approximate` |
| Detector creates noise/annoyance | High if unmanaged | Allowlist default, 40-highlight cap, per-site toggle |
| Extension injects into pages with strict CSP | Medium | Shadow DOM + no remote code; all assets bundled |
| Judges read it as an affiliate link | Medium | Lead the pitch with the 30-day replay, not the detection |
| Over-scope into order placement | High | Order placement is explicitly stretch; do not start before G4 |
| Data gap-fill understates volatility | Certain | State it in the card and README |
| Time zone confusion | Low | Deadline is Fri 22:00 WIB; submit by 18:00 WIB |

---

## 16. Ethics and compliance

- Every card carries "Data from Strike. Not financial advice."
- Never say "this will save your account" or "this is safe". Say "this position would have been liquidated on X date".
- Replay is historical simulation, not prediction. Label it `Simulation, 30 days, mark price`.
- Do not display account balances or positions in v1. No personal data leaves the browser.
- No telemetry. No remote logging. No third-party scripts.

---

## 17. Definition of done

The project is complete when all of these are true:

- [ ] Extension loads unpacked in Chrome without warnings
- [ ] Detects `TSLA` and `$BTC` on a test article
- [ ] Card shows live price, 24h change, funding, OI
- [ ] Simulator returns liquidation price that matches Strike's API within quote precision on 3 fixtures
- [ ] 30-day replay completes in < 2 s with warm cache
- [ ] Card renders from cache with the network disabled
- [ ] Per-site toggle persists across reloads
- [ ] Every card state (loading, error, not-tradable) renders something
- [ ] README explains setup, data sources, and limitations
- [ ] Demo video recorded and uploaded
- [ ] Repo is public, MIT licensed, no secrets committed

---

## 18. Open questions (resolve in hour 0–2)

1. Exact deep-link format for a market: `app.strikefinance.org/trade/<SYMBOL>`? Does it accept prefilled size/side?
2. Does `/v2/markets` return `margin_tiers` with `mmr` and `maintenance_amount` for every symbol?
3. Are equity symbols (TSLA, CRCL, AAOI, ZHIPU) available on testnet, or only mainnet?
4. What is the taker fee rate per fee tier, and does it vary by market?
5. Does Strike list `baseAsset` values that collide with common English words? (Filter them out.)
