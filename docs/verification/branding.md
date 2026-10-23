# Approved logo integration — 23 October 2026

The owner approved `assets/branding/strike-everywhere-mark-2026-10-23.png` and requested its use as the extension icon and inside the extension. Resized the approved raster into 16/32/48/128px PNG assets without changing the design. The logo retains its near-black background.

Integration: manifest icons (16/32/48/128), toolbar action icons (16/32), side-panel header and favicon, ticker-card header, and simulator header. Content-script headers embed the small PNG as a bundled data URI, avoiding third-party image requests and new web-accessible permissions. Images alongside the visible product name have empty alt text to avoid duplicate announcements; explicit dimensions reserve their space.

The existing context-menu permissions, TypeSafe optional host, SDK and Ghost UI were already present from the other implementer's work and were preserved. This pass changes branding only, without touching its domain logic or claiming verification of those features.

Verification:

- `npm run typecheck`: exit 0.
- `npm run test`: exit 0; 121 tests across 16 files passed at the time of the run.
- `npm run build`: exit 0; 45 modules, all four manifest icon files included in dist.
- Actual unpacked Chromium: all manifest icons decoded at their declared dimensions; sidebar image loaded and fit 320px without horizontal overflow; ticker card and simulator decoded their 48px embedded images; install warnings, manifest errors, and runtime errors were empty. [Report](brand-checks.json).
- Screenshots inspected: [sidebar](brand-sidebar.png), [ticker card](brand-card.png), [simulator](brand-simulator.png). Simulator branding was exercised on a local document fixture at the Strike app route; it is not evidence of a logged-in account or real ticket integration.

Reload the extension from `dist/` in `chrome://extensions`, then refresh existing article/Strike tabs. Chrome may retain the old toolbar icon until extension reload. No project dependency or additional permission was added for branding.
