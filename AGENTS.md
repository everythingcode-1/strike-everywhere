# AGENTS.md — Operating Manual for AI Coding Agents

This file is the contract between the human owner and every AI agent working in this repository.
Read it fully before writing code. If something here conflicts with a user instruction given in chat,
the chat instruction wins for that turn — but raise the conflict instead of silently breaking a rule.

---

## 1. What we are building

A Chrome Manifest V3 extension that detects asset tickers on web pages and shows a live Strike
market card with a 30-day position simulator.

Read `SPEC.md`. It is the source of truth for behaviour. This file is the source of truth for
*how* we work.

**Hard deadline:** Friday 22:00 WIB. Submit by 18:00 WIB.

---

## 2. Non-negotiable rules

These are not preferences. Breaking any of them is a failed task, even if the code works.

### 2.1 Never

- Place, modify, or cancel orders. Not in v1. Not "just for testing" on mainnet.
- Add wallet connection, seed phrases, private keys, or signing code.
- Send data to any server other than `api.strikefinance.org` / `api-v2-testnet.strikefinance.org`.
- Add analytics, telemetry, crash reporting, or remote logging.
- Load remote code, remote fonts, or remote CSS. Chrome MV3 forbids it; so do we.
- Commit secrets, API keys, `.env` files, or fixture data containing real account identifiers.
- Use `eval`, `new Function`, or dynamic `import()` of remote URLs.
- Touch files outside your assigned module (see §6).
- Claim something works without running the verification in §8.

### 2.2 Always

- Use the **testnet** base URL during development.
- Parse monetary values from API strings with a decimal library.
- Handle every card state: `loading`, `ready`, `not-tradable`, `offline-cached`, `error`.
- Keep the risk engine free of DOM and browser APIs.
- Write a test for any non-trivial calculation.
- State limitations in the README and in the UI where the user sees the number.

---

## 3. Stack

| Layer | Choice | Reason |
|---|---|---|
| Language | TypeScript, `strict: true` | Type errors are cheaper than runtime errors |
| Build | Vite + `@crxjs/vite-plugin` | MV3 HMR without custom plumbing |
| UI | Vanilla DOM + closed Shadow DOM | One 320px card does not need a framework |
| Decimal math | `decimal.js` | Never use floats for money |
| Storage | IndexedDB (`idb-keyval`) | Simple async key-value, no schema churn |
| Tests | Vitest | Fast, no browser needed |
| Lint | ESLint + Prettier (defaults) | Consistency, not debate |

Do not add a dependency for something the platform already provides. Do not add React, Redux,
Tailwind, or a UI kit. If you believe a dependency is required, stop and ask.

---

## 4. Commands

```bash
npm install          # install
npm run dev          # build in watch mode + load unpacked from dist/
npm run build        # production build → dist/
npm run test         # vitest run
npm run test:watch   # vitest
npm run typecheck    # tsc --noEmit
```

A task is not complete until `npm run typecheck` and `npm run test` both pass with no output
errors. Paste the command output when reporting completion.

---

## 5. Repository map and module ownership

Every agent owns exactly one module. Do not edit another module's files.

| Module | Files | Owner |
|---|---|---|
| **M0 — Shared contract** | `src/shared/types.ts`, `src/shared/constants.ts` | **HUMAN ONLY.** Agents request changes; they do not edit. |
| **M1 — Data layer** | `src/lib/api.ts`, `src/lib/cache.ts`, `src/data/symbols.generated.json` | Agent A |
| **M2 — Detector** | `src/lib/detect.ts`, `src/lib/symbols.ts` | Agent B |
| **M3 — Risk engine** | `src/risk/*`, `tests/margin.test.ts`, `tests/replay.test.ts` | Agent C |
| **M4 — UI card** | `src/content/card.ts`, `src/content/card.css`, `src/content/index.ts` | Agent D |
| **M5 — Shell** | `manifest.json`, `vite.config.ts`, `src/background/index.ts`, `src/popup/*` | Agent E |
| **M6 — Reviewer** | none (read-only) | Agent F |

If a change is needed in M0, describe the change in a message and wait. Do not patch around a
missing type by casting to `any`.

---

## 6. Parallel work protocol

1. Work in your own git worktree or branch: `agent/<module>-<short-task>`.
2. Never rebase or force-push a branch you do not own.
3. Import only from `src/shared/types.ts` when crossing module boundaries.
4. If you need a new field, propose the exact TypeScript addition in your report.
5. Do not install dependencies without approval.
6. Do not reformat files you do not own.

---

## 7. Domain invariants

These are the rules that, if broken, produce plausible-looking wrong numbers.

### 7.1 Numbers

- Every numeric field from the API is a **string**. Keep it a string until you construct a `Decimal`.
- Never `Number(x)` or `parseFloat(x)` on prices, sizes, balances, or ratios.
- Round only at the display boundary, using the market's `quotePrecision`.
- Percentages are displayed with fixed decimals; do not round twice.

### 7.2 Liquidation

- Strike liquidates on **mark price**. Replay must use `priceType=mark` candles.
- `MM = notional × MMR − maintenanceAmount`. The maintenance amount is mandatory; omitting it
  breaks tier continuity and produces wrong liquidation prices at tier boundaries.
- For longs check `low`; for shorts check `high`.
- Liquidation is **staged** (up to 5 attempts), not binary. See SPEC §9.5.

### 7.3 Time

- All API timestamps are Unix **milliseconds**.
- Funding settles hourly on the hour, UTC.
- "30 days" means 43,200 one-minute candles, not 30 × 24 requests of arbitrary ranges.

### 7.4 API behaviour

- Base URLs come from `src/shared/constants.ts`. Never hardcode a host in a module.
- Server caches klines for 5 s. Do not poll faster.
- Klines `limit` is clamped to 1500. Paginate with `startTime`/`endTime`.
- Public endpoints must be called **without** auth headers. There is no auth in v1.
- Treat every response as untrusted input: validate the shape before use.

---

## 8. Verification protocol

### 8.1 Before claiming any task is done

```bash
npm run typecheck
npm run test
```

Then exercise the actual behaviour, not the unit test only:

- For M1: print a real response and confirm the fields exist.
- For M2: open a local HTML fixture and confirm exactly N highlights, no false positives.
- For M3: run the ground-truth check (§8.2).
- For M4: open the card on 3 different pages; confirm no layout shift and no CSS leakage.
- For M5: load unpacked, confirm no manifest warnings and no console errors.

### 8.2 Ground truth check (M3, mandatory)

1. Fetch 3 real positions:
   `GET /v2/positions?blockchain_address=<addr>`
2. Recompute `liquidation_price` and `maintenance_margin` from the returned fields.
3. Compare to the API values.
4. Store the three cases in `tests/fixtures/positions.json` with a comment recording the date and
   symbol.

Acceptance: equality within the market's `quotePrecision`.

If they do not match: **do not continue to UI work.** Report the discrepancy with both numbers,
the tier used, and the formula applied.

### 8.3 What "passes" means

- A command that exits 0.
- A number printed and compared.
- A screenshot or DOM assertion.
- Never: "should work", "looks correct", "I believe".

---

## 9. Task workflow

For each task:

1. **Restate** the task in one sentence, plus what is out of scope.
2. **List** the files you will touch.
3. **Check** whether the required API fields actually exist (one `curl`, not an assumption).
4. **Implement** the smallest complete version.
5. **Test** the calculation or behaviour.
6. **Report**: what changed, what you verified, what you did not verify, what is still risky.

Keep the report under 15 lines. The human is reading five of these per hour.

---

## 10. Code conventions

- Named exports only. No default exports.
- Pure functions in `src/risk/` and `src/lib/detect.ts`. No side effects at import time.
- Errors: throw typed errors in libraries; catch at the boundary (content script, message router).
  Never let an exception blank the card.
- Logging: `console.debug` only, never in production paths that run on every keystroke.
- Naming: `camelCase` for values, `SCREAMING_SNAKE` for constants, `PascalCase` for types.
- Comments explain **why**, never **what**. One line maximum.
- No `any`. If you need an escape hatch, use `unknown` plus a narrow type guard.
- Keep functions under ~40 lines. If longer, split.

---

## 11. UI contract

- The card lives in a **closed** Shadow DOM root.
- No global selectors. No `!important`. No styles outside the shadow root.
- The ticker span must not change the line box: `display: inline`, no padding, no border that
  shifts layout. Use `text-decoration` or `box-shadow` for the underline.
- Hover intent: 150 ms open delay, 200 ms close grace.
- Position with collision detection against the viewport.
- Keyboard: `Enter`/`Space` opens, `Esc` closes, focus visible.
- Contrast ≥ 4.5:1. Verify with a contrast checker, not by eye.
- Every state renders content. An empty card is a bug.
- Disclaimer text is mandatory in the `ready` state.

---

## 12. Security and privacy

- Content scripts run on third-party pages. Never read or transmit page content beyond the ticker
  match. Never read cookies, localStorage, or form values.
- No `tabs` permission unless required. Request the narrowest `host_permissions` needed.
- All network calls go to the Strike API hosts only. No CDN, no proxy, no image hosts.
- Never log page URLs or any page text to the console in production.
- No data leaves the browser. This is a feature; do not trade it away for convenience.

---

## 13. Anti-patterns (reject these on sight)

| Anti-pattern | Why it is wrong here |
|---|---|
| Building a dashboard or chart | Out of scope; the card is the product |
| WebSocket / streaming | Unnecessary latency and MV3 complexity |
| Reading Strike's app DOM | Fragile, and explicitly out of v1 |
| `parseFloat` on API strings | Silent precision loss in money math |
| Recomputing the whole page on mutation | Kills performance on news sites |
| Adding React "for structure" | One card, no need |
| Generating a demo video before the math passes | Demo hides bugs; tests do not |
| "Temporary" mainnet order placement | Violates §2.1 |
| Casting to `any` to unblock | Hides the real contract mismatch |

---

## 14. Escalation

Stop and ask the human when:

- An endpoint in SPEC §8 does not exist or returns a different shape.
- The ground-truth check fails and you cannot explain why within 30 minutes.
- A task requires editing `src/shared/types.ts`.
- A dependency seems necessary.
- The scope starts expanding into stretch goals (S1–S5) before F1–F9 are verified.

When asking, include: what you expected, what you observed, the exact command, and one proposed
next step. Do not ask open-ended questions.

---

## 15. Definition of done (per task)

- [ ] Typecheck passes
- [ ] Tests pass
- [ ] Behaviour verified manually (describe how)
- [ ] No new dependency without approval
- [ ] No file outside the owned module touched
- [ ] Report written in the §9 format
- [ ] Known limitations stated, not hidden
