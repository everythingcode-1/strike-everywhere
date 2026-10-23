# Jev via OpenRouter — fix and live verification

23 October 2026. Owner authorized use of the OpenRouter key in `.env.txt` for testing. The file is ignored; no real key was put into source, reports, fixtures, commands, or build configuration.

## Cause and change

- Entry/routing: `src/jev/client.ts` → `src/jev/openrouter.ts`.
- Old adapter always called `/api/v1/chat/completions`, defaulting to GPT-4o mini. This did not call Jev. Selecting `typesafe/jev-1.14` returned HTTP 400: it is a decisions model and cannot use chat/completions.
- Jev model IDs now use the existing TypeSafe SDK against `https://openrouter.ai/api`, producing `/api/v1/systemone` requests with state and typed questions. Fixed-origin fetch, omitted credentials, redirect refusal, timeout, retries disabled, and strict answer validation remain in place.
- Default configuration and Settings now use `jev-latest`. Validation also accepts the official `~typesafe/jev-latest` alias. Explicitly selected chat models retain their existing transport; saved choices are not silently overwritten.
- No dependency added; no protected `src/shared/types.ts` or `src/shared/constants.ts` edited. Existing owner authorization overrides the old Strike-only network rule for this optional AI test.

Official protocol: [TypeSafe SDK through OpenRouter](https://openrouter.ai/docs/guides/community/typesafe-sdk), [Jev model and API surfaces](https://openrouter.ai/docs/guides/community/jev).

## Verification

Regression tests first reproduced six failures for Jev routing/default and alias validation, then passed after the fix. Full suite: **147 tests across 22 files passed**; typecheck and production build exited 0.

Live comparison using the supplied key: old Jev chat request HTTP 400; correct System One request HTTP 200; installed SDK request also succeeded. GPT-4o mini chat separately returned HTTP 200, confirming the key itself was valid.

`scripts/verify-jev-live.mjs` loads the production build into an isolated Chromium profile, selects OpenRouter in Settings, saves the supplied key, seeds one synthetic claim into the local ledger, ticks consent, clicks Analyze, and asserts the stored analysis. It clears the saved key and deletes its temporary profile/build in cleanup. Host permission is pregranted through the temporary test manifest; the native optional-permission prompt is not covered.

Observed analysis: `ready`, `bullish`, `testable`, suggested `BTC-USD`, model `typesafe/jev-1.14-20261014`; page errors empty. Evidence: `docs/verification/jev-openrouter-live.json`.

Re-run from the repository root with installed browser paths:

```powershell
node scripts/verify-jev-live.mjs '<playwright/index.mjs>' '<chromium.exe>' '.env.txt'
```

## Using the updated extension

Reload the extension from `chrome://extensions`, reopen its panel, then Settings → Provider: OpenRouter → Model: `jev-latest` → Save key. Capture a claim, tick consent and press Analyze. The repository `.env.txt` is a test input only; the extension does not bundle or auto-import it. Existing explicit chat-model settings remain unchanged until the user saves a different model.

## Follow-up: asset relevance and incomplete claims

The old relevance question asked whether a claim concerned a market “listed on Strike”, mixing textual relevance with external exchange knowledge. It now explicitly states that candidates are already verified and asks only about the asset mentioned in the original language. AI non-selection no longer makes the UI claim that Strike has no matching market: existing verified candidates remain available. Non-directional results use the label Related market rather than Suggested setup.

Testability questions now distinguish prospective predictions from descriptions of current/past action. A separate typed check asks whether both a future outcome and evaluation window are explicit. If a `testable` answer conflicts with a negative conditions check, the application downgrades it to Partly specified, explains missing conditions, and omits the original testability confidence. Reported confidence is explicitly classification confidence, not a profitable-trade probability.

Fresh full verification: **150 tests, 22 files passed**, typecheck/build exit 0. Three claims were tested through the Analyze button with both actual Jev 1.14 and 1.13 responses:

| Selected text | Direction | Testability | Asset |
|---|---|---|---|
| Bitcoin | non_trading | not_testable | BTC-USD |
| Prakiraan Mingguan Bitcoin: BTC Memperpanjang Pullback saat Arus Masuk ETF Bertabrakan dengan Sentimen Risk-Off | bearish | partially_specified | BTC-USD |
| Bitcoin will rise over the next seven days. | bullish | testable | BTC-USD |

The browser also injects an empty AI symbol selection after the bare-name case and asserts that the Detected market: BTC message and verified BTC chip remain visible. This fallback is an explicit UI policy, not a fabricated AI selection. No page errors; keys cleared and isolated profiles removed. Evidence: `jev-openrouter-live.json` (1.13), `jev-openrouter-1.14-live.json`, `jev-headline-result.png`. Model outputs remain probabilistic; these cases are observations, not a guarantee for all claims. Previously stored analyses require Re-analyze after reloading the updated extension.
