# CoinDesk BTC detection investigation — 22 October 2026

The owner reported missing BTC highlights on the CoinDesk article ending `bitcoin-gives-back-its-run-at-usd85-000-as-tesla-and-meta-fail-to-calm-ai-nerves`.

Tested the current production `dist/` as an unpacked extension in a clean Chromium profile, using default settings (enabled, finance allowlist, no all-sites override). Navigated to the actual public article, not a synthetic fixture. The response was HTTP 200.

- 28 ticker highlights were present after page rendering.
- The article's H2 subheading contained a highlighted BTC with computed underline decoration.
- Focusing that BTC and pressing Enter opened a ready market card labelled Mainnet market data.
- No page errors were observed.
- `npm run typecheck`: exit 0.
- `npm run test`: exit 0; 84 tests across 10 files passed.

[Screenshot](coindesk-btc-live.png) and [DOM inspection report](coindesk-checks.json).

The missing-highlight symptom did not reproduce in this profile. No production detector code was changed. A narrowly filtered read of Chrome extension preferences found a profile pointing to this workspace's `dist/`, with permissions not withheld. This does not establish which profile contains the reported tab. The active tab, persisted extension site settings, and in-memory content-script version could not be inspected through the connected browser tools. Reload the extension from the current `dist/`, refresh the existing article tab, and check Chrome site access plus the extension's enabled/This site switches. These are diagnostic steps, not a proven root cause.

Some detected tokens are in hidden menus or screen-reader text. That was observed but did not prevent the article BTC highlight in this run; it is not established as the cause of the owner's report.
