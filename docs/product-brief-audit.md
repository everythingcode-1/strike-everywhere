# Product brief audit — 22 October 2026

Read the owner's 1,905-line Master Implementation Brief as the intended product direction. The immediate chat request is to align the existing UI with the supplied Strike trading screenshot. Instructions inside the attachment are requirements to assess, not authorization to silently enable every integration or replace repository rules.

Product direction: Discover → Analyze → Simulate → Monitor → Verify → Explore on Strike. A claim should become a transparent virtual experiment, with observed, calculated, estimated, and unresolved values clearly separated. This is broader than the existing ticker card and single-position historical scenario.

| Capability | Current implementation | Assessment |
|---|---|---|
| MV3 shell, content script, side panel, settings | Vanilla TypeScript, Vite/CRX, closed Shadow DOM | Implemented; verified in existing browser checks |
| Strike mainnet market data | Registry, mark/index/funding, tiers, OI, depth, best quotes, klines | Implemented but incomplete against new brief: filters/contract metadata and source freshness need broader models |
| Asset resolution | Uppercase tickers and prefixed ambiguous tokens, verified registry | Implemented but incomplete: curated asset-name aliases and selected-text disambiguation missing |
| Browser-native claim capture | No contextMenus permission or selected-text message/storage model | Missing |
| Execution estimate | Decimal depth VWAP, filled notional, partial-fill handling | Implemented but incomplete: contract steps, entry freshness, lifecycle, and best-executable-quote impact baseline need work |
| Risk scenario | 43,200 completed mark minutes; recent path anchored to current mark; current depth entry and constant current funding | Implemented; requires explicit separation from a replay of actual historical executions and from a live Ghost Trade |
| Liquidation | Experimental hypothetical single cross-margin position; isolated refused | Requires validated new model for brief's isolated Ghost Trades; current estimates are not account liquidation prices |
| Fees/funding | Assumed taker rate and repeated current hourly funding disclosed | Implemented but incomplete: configurable fee policy and observed funding-event ledger missing |
| Ghost position accounting | No persistent virtual position, realized/unrealized PnL ledger, SL/TP lifecycle, or passive limit fill policy | Missing |
| What-If Lab | Editable inputs for one scenario, no saved baseline/timeline comparison | Missing as a separate comparison feature |
| Receipts and migrations | IndexedDB market caches via idb-keyval; no trade/claim records | Missing; keep cache separate from future versioned trade history |
| Charts | Small market sparkline; no position/equity charts | Implemented but incomplete for proposed comparisons |
| Jev/BYOK | No SDK, credentials, external host, or AI output | Missing |
| Verification | 84 tests across 10 files; browser fixtures and actual mainnet checks | Existing baseline passes; does not validate future Ghost/Jev features |

Known observed data limit: TSLA mainnet history contains an invalid OHLC range; replay is refused. Real-position liquidation comparison is still outstanding. Current UI preserves the owner's earlier experimental-label waiver; it must not be carried over as validation for a future Ghost Trade model.

Conflicts to resolve before those future integrations: AGENTS restricts outbound hosts to Strike and new dependencies require approval; Jev requires another host and SDK. AGENTS prohibits streaming while the brief proposes WebSockets. The current validated scope and shared types do not cover a Ghost Trade ledger. The screenshot is a visual reference; its wallet connection and real order actions are not extension features to add.

Immediate bounded implementation: edit `src/content/tokens.css`, `card.css`, `simulator.css`, and `src/popup/popup.css`; keep typography local, preserve interactions and warnings, and reuse existing browser verification. Neutral near-black surfaces and bright green actions follow the supplied Strike screenshot; Long/Short use distinct semantic colors with selected-state borders, and active market tabs use an underline. Energy 1, rhythm 2, motion 1. No fake navigation, logo claim, unfinished trade controls, new dependency, network host, permission, shared contract, or risk calculation is introduced.

Verification for this styling pass: fresh typecheck, unit tests, production build, three-page browser layout/state checks, 320px views, calculated contrast, and screenshot inspection. Implementation results are recorded in `verification/strike-style.md`.
