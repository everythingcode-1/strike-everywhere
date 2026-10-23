# Ghost Trading verification — 22 October 2026

## Scope and authorisation

Implemented the four deliverables in [the owner handoff](../GHOST_TRADING_IMPLEMENTATION_HANDOFF.md): selection context menu, local Ghost Trades, Jev BYOK, and receipt viewer/export. The handoff explicitly authorises the TypeSafe SDK/host, `contextMenus`, and the new Ghost contracts; the user instructed the agent to continue without further design questions.

The referenced plan `docs/superpowers/plans/2026-10-22-ghost-trading.md` was not present on disk. The handoff document was used as the binding plan. The workspace still has no `.git` metadata, so no branch, commit, or worktree was created. No real order, wallet, signing, telemetry, backend, or remote code path was added. `src/shared/types.ts` and `src/shared/constants.ts` were not modified; new contracts live in `src/shared/ghost-types.ts`.

## Baseline

Before changes: `npm run typecheck` exit 0 and 84 tests in 10 files passing. The last pre-change browser baseline was the existing unpacked-extension check in [unpacked-checks.json](unpacked-checks.json).

## What was added

| Area | Files |
|---|---|
| Contracts | `src/shared/ghost-types.ts`, `src/ghost/constants.ts` |
| Pure engine | `src/ghost/accounting.ts`, `execution.ts`, `market.ts`, `resolve.ts`, `lifecycle.ts`, `decimal.ts`, `errors.ts` |
| Persistence/orchestration | `src/ghost/store.ts`, `src/ghost/service.ts`, `src/ghost/messages.ts` |
| Jev | `src/jev/client.ts`, `questions.ts`, `keys.ts` |
| Shell | `src/background/index.ts`, `manifest.json` (`contextMenus`, optional TypeSafe host) |
| UI | `src/popup/index.html`, `index.ts`, `ghost-ui.ts`, `popup.css` |
| Tests | `tests/ghost-accounting.test.ts`, `ghost-execution.test.ts`, `ghost-market.test.ts`, `ghost-resolve.test.ts`, `jev-questions.test.ts`, `ghost-messages.test.ts`; background forbidden-sender test |
| Evidence | `scripts/verify-ghost.mjs`, screenshots and `ghost-checks.json` in this folder |

## Accounting and execution policies

- All money, quantity, ratio and price fields are decimal strings until wrapped in `decimal.js`.
- Collateral mode: `requested notional = collateral × leverage`; notional mode: `allocated collateral = notional ÷ leverage`. The two modes are separate values, not aliases.
- Long gross PnL = `Q × (exit − entry)`; short = `Q × (entry − exit)`.
- Entry and exit fees are `notional × assumed rate` (0.05% per side default, 0–1% accepted). Fees are a separate virtual cost, not deducted from allocated collateral.
- Closed net = gross − entry fee − exit fee + known funding. Open net and the review preview use the same **mark-based** calculation: gross at mark, entry fee on the fill, estimated exit fee on mark notional. The UI labels this “estimated net at mark”, not an executable close.
- Funding is not reconstructed. `fundingCashFlow` is `null`, `fundingStatus` is `not_reconstructed`, and every exported net is named `netExcludingUnknownFunding`.
- Entry consumes asks for long and bids for short; exit consumes the opposite side. Quantity is floored to the exchange `MARKET_LOT_SIZE.stepSize`; notional/VWAP/fees are recomputed from the rounded fill. Insufficient depth is a hard failure (full-fill model), not a silent partial.
- Virtual close is one full-fill market order. Entry minimum quantity/notional do not block a small close; the current per-order maximum does, and split closes are not supported (clear `MAX_QUANTITY` error, no silent oversized fill).
- Books must be non-empty, positive, ordered, and uncrossed. Source timestamps must be ≤15 s old and not >5 s in the future. Missing source timestamps block entry/close.
- Liquidation is not modelled for Ghost trades: `Liquidation estimate unavailable — risk scenario only`.
- `creationRequestId` and `closeRequestId` make duplicate requests idempotent. Trade and entry event are written in one IndexedDB transaction. Capture ordering uses a timestamp+counter token assigned before the registry await; the pending pointer only moves forward, and an older completion cannot overwrite a newer claim. Ledger schema is versioned; an unknown future version is read-only/error, not reset.
- The 30-day replay remains separate and is still labelled a hypothetical cross-margin scenario, not a Ghost trade.

## Test matrix coverage

| Group | Evidence |
|---|---|
| PnL | Long/short profit/loss, zero move, zero and nonzero fees, tiny/large decimals, unknown funding, synthetic handoff case (net $9.445 after explicit funding), constant-notional leverage invariant, preview/immediate-summary parity on mark basis (`-5.1025` regression), multi-level and mark-equals-entry cases |
| Fill | Asks/bids, multi-level VWAP, step rounding, empty/crossed/unordered/negative books, insufficient depth, min notional, min/max quantity, exact-depth dust tolerance, exit side, small close below entry minimums, close above current per-order maximum |
| Rules/time | `exchangeInfo` filter parsing, linear settlement check, stale/future/missing source timestamps, source-time freshness labels |
| Resolver | Bitcoin/BTC dedup, curated aliases, ambiguous `NEAR`/`COIN`, Apple/Meta/Near/Strike non-guessing, non-English prose |
| Lifecycle | Allowed transitions, closed cannot reopen, monitoring-gap threshold, direct close after a day records one gap, refresh-then-close does not duplicate it |
| Capture | Slow older capture cannot replace newer pending; same-millisecond ordering; stale failure does not overwrite newer status |
| Messaging | Unknown actions, oversized fields, missing consent, invalid leverage, invalid key length, source URL sanitation |
| Jev | Valid mocked choices, malformed body/choice/probability, injected provider text ignored, summary contains no provider HTML |
| Storage | Reload restores entry and closed record; duplicate create reuses the same trade; concurrent refresh + close produces one close event; receipt survives reload; unknown funding and monitoring gaps preserved; unknown future schema throws `UNKNOWN_SCHEMA` in code but was not exercised in the browser run |
| Security | Privileged messages from a non-extension sender are rejected; key status/save/clear never echoes the key; claim URLs strip credentials/query/fragment; editable-field capture is refused in code |

## Commands and results

```text
npm run typecheck   # exit 0
npm run test        # 135 tests, 20 files, all passing
npm run build       # exit 0, dist/manifest written
```

Saved outputs: [typecheck.txt](typecheck.txt), [tests.txt](tests.txt), [build.txt](build.txt).

Audit-fix reruns: [Ghost flow](audit-2026-10-23-ghost-fixed.txt), [unpacked extension](audit-2026-10-23-unpacked-fixed.txt), [old browser regression](audit-2026-10-23-browser-fixed.txt), [unit probes](audit-2026-10-23-probes-fixed.txt), [UI probes](audit-2026-10-23-ui-probes-fixed.txt).

## Browser evidence

Production `dist/` loaded in Chrome for Testing with a clean temporary profile. Real public mainnet data was used. No account positions were queried.

- [ghost-checks.json](ghost-checks.json) records the run.
- [ghost-discover.png](ghost-discover.png): manual Discover view with verified BTC market.
- [ghost-discover-claim.png](ghost-discover-claim.png): seeded claim with BTC/TSLA candidates and missing-key fallback.
- [ghost-discover-320.png](ghost-discover-320.png): 320 px layout, `scrollWidth = 320`.
- [ghost-trade-closed.png](ghost-trade-closed.png): closed virtual trade with immutable entry, unknown funding and unavailable liquidation.
- [ghost-receipt.png](ghost-receipt.png): receipt viewer and Export JSON.
- [ghost-receipt.example.json](ghost-receipt.example.json): parsed export from a real-data closed virtual trade. It contains `quoteAsset`, full entry/exit rules and fill levels, `exitEvidence`, `qualification.realFunds: false`, `costs.basis: realized_virtual_closed`, null funding, and no key material.

The automated flow created a real-data BTC virtual trade (collateral $20, 2×), reviewed the fill, closed it, exported the JSON, parsed it, reloaded the panel and confirmed the entry price was unchanged. It also verified:

- claim text/candidates render; duplicate create reuses one trade ID;
- concurrent refresh + close produces one `closed_virtual` event;
- missing key produces `missing_key` and leaves manual flow usable;
- key save/status/clear works, status response never echoes the key;
- insufficient depth returns `INSUFFICIENT_DEPTH`;
- invalid leverage returns `INVALID_INPUT`;
- receipt contains `entryFill`, `exitFill`, `exitEvidence`, `qualification`, `costs.basis`, `calculationVersion: ghost-1`, `fundingCashFlow: null`, and no `apiKey` field;
- the exit fee appears once on `closed_virtual`, not on `close_requested`;
- the UI shows the last mark time and a stale warning after 15 seconds;
- reviewing a trade and then creating it re-quotes from a fresh book; the preview limitation says the accepted fill may differ;
- no page or worker console errors.

The existing unpacked check also passed after the rebuild: BTC and TSLA live market data, registry, watchlist, 43,200-candle BTC replay, no install warnings, manifest errors, runtime errors or browser errors. See [unpacked-checks.json](unpacked-checks.json). The TSLA replay still reports an explicit `Invalid candle price range` because its API history is malformed; this is the pre-existing validator behaviour and is not presented as a success.

Contrast checks (antislop-human): muted `#AAAAAA` on `#1B1B1B` = 7.41:1; mint `#36F5AE` on `#18382C` = 9.04:1; danger `#FF5475` on `#1B1B1B` = 5.56:1; text `#F5F5F5` on `#0B0B0B` = 18.05:1. Control border `#707070` on `#0B0B0B` = 3.97:1, above the 3:1 boundary target.

## Final review fixes

A fresh-context review found six Important issues and five Minor issues. The Important issues were fixed in one pass:

1. Preview responses carry a token and the create request uses the exact previewed input snapshot, so editing the form during an in-flight preview cannot create an unreviewed size/market.
2. Jev results are applied only if their originating claim ID is still displayed; a new capture cannot inherit the previous claim's analysis.
3. Virtual close bypasses entry-only minimum quantity/notional filters, so a small position can always be closed; the current per-order maximum is enforced with a clear error, and split close is not silently pretended.
4. Exit price impact is measured against the executable side (bids for a long close, asks for a short close) and is positive in both cases.
5. The status banner is global instead of living in a hidden Discover view; programmatic tab changes move focus to the active tab.
6. Receipts now include quote/settlement asset, full verified rules, exit fill and exit evidence, a cost basis (`estimated_open` vs `realized_virtual_closed`), a no-real-funds qualification, and the sanitized source URL disclosure. Closed summaries use the exit book source time. The exit fee is recorded once, on `closed_virtual`, not duplicated on `close_requested`.

Two Minor issues were also corrected while touching the same code because they affected correctness: exact-depth fills use a dust tolerance, and Ghost rules are cached for five minutes instead of 24 hours while the full rules snapshot is stored in the receipt. Remaining Minor items (list-level stale badge granularity, additional privacy copy) are covered by the observations/last-mark time and the Settings disclosure. No high-severity reviewer finding was declined.

## Audit fixes A01–A07 (23 October 2026)

The owner's audit in [GHOST_TRADING_AUDIT_FIXES_2026-10-23.md](../GHOST_TRADING_AUDIT_FIXES_2026-10-23.md) was reproduced and patched:

| ID | Fix | Evidence |
|---|---|---|
| A01 | Preview and immediate open summary now share `openSummary()`: mark-based gross, entry fee on the fill, estimated exit fee on mark notional. The audit regression yields preview net `-5.1025`, equal to the created position. UI label is “Estimated net at mark (before funding)” with an explicit valuation-basis note. | `tests/ghost-preview.test.ts` long/short/flat/multi-level; [fixed probe](audit-2026-10-23-preview-fixed.json) |
| A02 | Freshness is computed from `latestObservation.sourceTime` (receive time only when source time is absent, explicitly labelled) by a pure helper. A one-second local timer updates an open detail without fetching; a closed record stays “Closed record”; timer stops on view change. | `tests/ghost-freshness.test.ts`; browser check: 0s → “Stale — 16s old” after page-clock advance, no network refresh |
| A03 | Gap construction is shared by refresh and close. A direct close after a day records one `monitoring_gap` atomically with close events; repeated close and refresh-then-close do not duplicate it. | `tests/ghost-close-gap.test.ts` (3 cases); fixed security probe |
| A04 | Capture sequence is assigned before the registry await; the store moves the pending pointer only forward. Slow older completion is stored but cannot replace the newer claim; stale failure messages are suppressed. Worker restart uses timestamp×1000+counter (documented clock-rollback limitation). | `tests/ghost-capture-order.test.ts`; fixed security probe |
| A05 | `claim:captured` switches to Discover and focuses the claim heading. Errors use the global banner from any view. Boot `claim:get-pending` is token-guarded against a newer runtime event. | browser check: Settings → synthetic capture → `activeTab=discover`, `focusedId=claim-title`, no synthetic context-menu claim |
| A06 | Exit policy is explicit: entry minimums are bypassed for a small close, but a position above the current per-order maximum is rejected with `MAX_QUANTITY`; no silent split. Receipt assumptions record the policy. | `tests/ghost-execution.test.ts`; [fixed probe](audit-2026-10-23-exit-limit-fixed.json) |
| A07 | Old browser regression now navigates Markets/Settings tabs and mocks Ghost `GhostResult` boot messages. The complete `verify-browser.mjs` run exits 0 with all old checks. | [browser-checks.json](browser-checks.json), [browser report](audit-2026-10-23-browser-fixed.txt) |

New page-clock and capture-navigation evidence: [capture fix](audit-2026-10-23-capture-settings-fixed.json), [freshness fix](audit-2026-10-23-freshness-fixed.json), [screenshot](audit-2026-10-23-freshness-fixed.png). The four audit probes now assert the corrected behavior; the original audit JSON files remain as historical bug evidence and are not overwritten.

Still not verified: live authenticated Jev (no key), native right-click end-to-end, cross-domain iframe attribution, full browser/worker restart during a write, receipt import, and a controlled boot `claim:get-pending` response racing a newer runtime capture. The boot token guard is implemented; the race itself has not been reproduced in a browser probe.

## Permission and security summary

- Added `contextMenus`; no `tabs` permission. Selection handler rejects editable fields and opens the side panel synchronously on the user gesture.
- Source URL is sanitized to http(s), credentials/query/fragment stripped; claim text is capped at 4,000 characters and rendered with `textContent`.
- Added optional `https://api.typesafe.ai/*`; the SDK is bundled locally, version pinned to `@typesafe-ai/sdk@0.7.0`, compression off, retries off, 20 s timeout, logging off, fixed-origin restricted fetch with cookies omitted and redirects rejected.
- Jev key is stored only in `chrome.storage.session` with `TRUSTED_CONTEXTS`; status exposes only `{configured}`; the key input is cleared after save; Clear is available.
- Privileged claim/Ghost/Jev messages require the sender's extension origin. Content scripts share the extension ID but have a page origin, so they are rejected. Legacy content-card messages (`market:get`, `replay:run`, `settings:*`, `registry:get`) remain allowed.
- No real order/wallet/signing path exists. No credentials, selected text, or provider body is logged.
- Receipts contain the claim text and public market evidence; export is a local Blob download with no upload.

## Not verified / known limitations

1. **Jev live call:** no owner API key was available. The SDK boundary, request construction, response validation, missing-key fallback, error mapping and key lifecycle are implemented/tested; an authenticated live classification was not run.
2. **Native right-click:** headless Chrome cannot automate the native context menu. Permission declaration, menu creation code, editable-field rejection, source sanitation, and the full claim UI (with a seeded record) were verified. Perform one manual right-click in a clean profile before claiming the gesture works end to end.
3. **Funding:** Ghost funding history is not reconstructed. Net is labelled accordingly; no zero is fabricated.
4. **Liquidation:** no validated Ghost liquidation model; UI says unavailable.
5. **Monitoring:** observations happen on panel boot/manual Refresh, not a background timer. Browser closure creates a visible gap only when the next refresh detects it.
6. **Order types:** market full-fill only. No limit, SL/TP, partial fill, or queue model. No UI control pretends otherwise.
7. **Receipt import/sharing:** not implemented.
8. **Mainnet/public data only:** snapshots and fills can differ from execution; no account connection.
9. The workspace still lacks `.git` metadata, so no reproducible commit hash or public source URL is included.
10. Existing 30-day replay/ground-truth limitation remains: three real Strike positions have not been compared; the old cross-margin estimate keeps its experimental label.
11. Capture ordering uses a local timestamp×1000 + counter assigned at the gesture. Two captures in the same millisecond are ordered; a system clock moved backwards can delay a new pending claim until the clock catches up. Claims are still stored; the pending pointer only moves forward.

## Reproduce

```powershell
npm install
npm run typecheck
npm run test
npm run build

node scripts/verify-ghost.mjs `
  "C:\Users\HP\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules\playwright\index.mjs" `
  "C:\Users\HP\AppData\Local\ms-playwright\chromium-1248\chrome-win64\chrome.exe"

node scripts/verify-unpacked.mjs `
  "C:\Users\HP\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules\playwright\index.mjs" `
  "C:\Users\HP\AppData\Local\ms-playwright\chromium-1248\chrome-win64\chrome.exe"
```

Both scripts launch their own temporary profile, use the production `dist/`, and close their browsers. The Ghost script writes only to `docs/verification/` and the ignored `.superpowers/` profile directories.

## Next blockers

1. Run one authenticated Jev classification with the owner's key and record sanitized status metadata only.
2. Perform one real right-click capture on a supported article in a clean profile and confirm the side-panel handoff race in both orders (panel already open, panel closed).
3. Decide whether funding reconstruction/background monitoring belongs in the submission scope; without it, keep the current honest labels.
4. Publish source/video links and record the demo; no publication is claimed here.
