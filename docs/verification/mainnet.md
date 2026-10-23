# Mainnet data verification — 22 October 2026

The owner explicitly requested mainnet. This overrides the development-testnet rule and authorizes the one-line protected `API_BASE` change. Scope: network configuration, network labels, associated tests, browser checks, and documentation. No risk formula or new feature was added.

- `npm run typecheck`: exit 0 (`tsc --noEmit`).
- `npm run test`: exit 0; 10 test files, 84 tests passed.
- `npm run build`: exit 0; 27 modules transformed; output in `dist/`.
- The API security regression failed on the previous testnet configuration, then passed with mainnet. Requests still omit credentials, reject redirects, and send no auth headers.
- Controlled browser checks passed on three page layouts, including five card states, closed shadow roots, CSS isolation, unchanged layout, keyboard controls, settings, and narrow views. [Report](browser-checks.json).
- Actual unpacked Chrome extension: mainnet registry contains 32 symbols including BTC, TSLA, and NVDA. BTC and TSLA snapshots are ready with 14 and 12 margin tiers respectively. The TSLA article ticker opens a card labelled “Mainnet market data”. TSLA spread, basis, and hourly data are present. Movers and funding each return five rows. [Report](unpacked-checks.json).
- BTC replay completed with 43,200 candles and a depth-based entry. Extension install warnings, manifest errors, runtime errors, and browser errors were all empty.
- TSLA replay renders `Replay failed: Invalid candle price range`. A direct public API request confirms a candle with open `380.11238859` above high `380.10360909`. Data validation stays intact; the extension does not fabricate a verdict. [API evidence](mainnet-invalid-candle.json).

Current screenshots: [TSLA market card](card-overview-live.png), [TSLA stress test and explicit history error](card-stress-live.png), [mainnet market discovery](side-panel-live.png). These replace the earlier testnet screenshots at those filenames. UI redesign notes describe the earlier design pass; the mainnet report here is the current network evidence.

No real account positions or orders were queried. The model remains experimental and has not been validated against three real Strike positions. Mainnet data availability does not unlock account actions or guarantee every market has valid replay history. Reload the extension in `chrome://extensions`, then refresh existing article tabs to activate the rebuilt content scripts. No dependency was added.
