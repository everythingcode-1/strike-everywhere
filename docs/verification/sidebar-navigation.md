# Sidebar navigation and empty error — 23 October 2026

The owner requested a fix for the empty red outlined notification and asked to move Settings/Receipts behind a gear beside the product identity.

The empty-error path was reproduced before editing: a Ghost response containing `error.message: ''` becomes an empty Error, `messageOf()` returns the empty string, and `showBanner()` makes the error outline visible. The new browser regression failed with `actual: ''` against the expected readable fallback. This reproduces the UI failure mode; it does not identify which original service response caused the owner's screenshot.

Changed the existing popup HTML/CSS and Ghost UI navigation only. The header now contains a native details disclosure with a gear and two page buttons, Settings and Receipts. Discover, Markets and Ghost Trades remain the three primary tabs. Selecting a utility closes the disclosure and focuses its visible gear, rather than focusing a hidden page button. Escape closes/restores focus, outside pointer interaction closes, and native Enter/Space can toggle it. Existing programmatic receipt navigation remains available.

Empty/whitespace error messages get `Request failed. Please try again.`; blank status content does not produce an outline. Real errors retain visible text and error styling. No market, accounting, storage, provider, permissions or risk logic changed.

Verification:

- `npm run typecheck`: exit 0.
- `npm run test`: exit 0; 135 tests across 20 files.
- `npm run build`: exit 0; 46 modules.
- `scripts/verify-browser.mjs`: exit 0, including red→green empty-error regression, three-layout card checks, all card states, settings persistence, keyboard focus, utility navigation and 320px overflow. Its API responses are synthetic. [Report](browser-checks.json).
- `scripts/verify-ghost.mjs`: exit 0 with production dist and public mainnet; virtual create/close/receipt export/reload remain functional. Its Settings navigation now opens the gear first. Live authenticated Jev and native context-menu verification remain outside this UI change.
- Actual unpacked extension navigation check: header images load; three primary tabs; Settings/Receipts accessible; Enter toggles; selection/outside click close; visible focus restored; empty red status hidden; 320px header/nav/popover fit without horizontal overflow. [Report](sidebar-navigation-checks.json).
- Screenshots inspected: [normal sidebar](sidebar-navigation.png), [gear open](sidebar-menu-open.png), [320px gear menu](sidebar-menu-320.png).

Gear uses the existing muted/text/accent palette with explicit accessible name `Settings and receipts`; no external icon library, asset request or dependency was added. The owner-selected Strike styling and existing logo are retained. Reload the extension in Chrome and refresh its side panel after rebuilding.
