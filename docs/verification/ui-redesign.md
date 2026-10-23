# UI redesign verification

Historical record of the UI pass on testnet. The build now uses mainnet at the owner's request; current network results and the `*-live.png` captures linked below are superseded by [mainnet verification](mainnet.md). Testnet descriptions here record the earlier run, not the current contents of those captures.

The owner rejected the previous visual quality and approved a graphite, ivory, and mint redesign without further confirmation questions. Antislop mode remains `during`, as selected earlier. This pass changes the existing interface and its browser checks; it does not alter risk calculations, API contracts, or protected shared files.

## What changed

- One palette and typography system in `src/content/tokens.css` connects the ticker card, Strike app simulator, and side panel. System fonts and local CSS are used throughout; no dependency or remote visual asset was added.
- The 320px market card separates market identity, mark price, hourly funding, open interest, and volume. Integer and fractional price digits use different visual weights while retaining market precision and an accessible full-price label.
- The expanded card focuses on position inputs and replay evidence. Exact entry, event timing, and execution metadata remain in a native Replay details disclosure. Model assumptions have a separate disclosure. Experimental/unvalidated status is beside the verdict, not only below the fold.
- The simulator uses the same controls, colours, result hierarchy, and assumptions pattern, with a 400px maximum width. Its close button and read-from-form action retain keyboard access.
- Market discovery leads the side panel. Movers and funding switch between views of existing data. Market rows open the corresponding mainnet market through the existing background message. Their accessible names include the displayed financial values. Detection controls and privacy/model notes have native disclosures; native checkboxes are styled as switches.

Files changed: `src/content/card.ts`, `card.css`, `simulator.ts`, new `simulator.css` and `tokens.css`; `src/popup/index.html`, `index.ts`, `popup.css`; browser verification scripts and documentation. `.gitignore` excludes local before-edit backups. Original UI screenshots are preserved as `before-ui-*.png`.

## Evidence

| Check | Result |
|---|---|
| Typecheck | PASS, exit 0: [output](ui-typecheck.txt). |
| Unit/message tests | PASS, 84 tests across 10 files, exit 0: [output](ui-tests.txt). |
| Production build | PASS, 27 transformed modules, exit 0: [output](ui-build.txt). |
| Controlled browser checks | PASS: three page layouts, all five card states, closed shadow roots, unchanged article rectangles, keyboard focus, pending-response invalidation, partial-fill metrics after reopen, view switching, market links, disclosures, settings, and narrow layouts. [Report](browser-checks.json). |
| Actual unpacked extension | PASS against public testnet market data: 43,200-minute replay, no install warnings, manifest errors, runtime errors, or browser errors. [Report](unpacked-checks.json). |
| Text contrast | PASS: all 11 measured palette combinations exceed 4.5:1; lowest is 6.60:1. [Ratios](contrast-ui-redesign.json). |
| Input/control edges | PASS: 3.99:1 against the surface and 3.39:1 against the selected surface. |

The controlled browser fixture contains synthetic responses for repeatable interaction checks. The unpacked extension uses actual public testnet responses. Neither replaces comparison with real Strike account positions.

## Visual evidence

- [Market card, current mainnet capture](card-overview-live.png)
- [Expanded stress test, current mainnet capture](card-stress-live.png)
- [Market discovery, current mainnet capture](side-panel-live.png)
- [Simulator panel, controlled UI fixture](simulator-panel.png)
- [Card at a 320px viewport](card-narrow.png)

Screenshots were inspected after rendering. The compact market view keeps the price prominent; the risk view gives its verdict and adverse excursion distinct hierarchy. Long explanations are available through disclosures. A tall stress test intentionally scrolls vertically rather than shrinking controls or clipping financial values.

## Antislop delivery gate

- Hard gate PASS for this UI pass: no invented user/adoption claims, fake testimonials, remote assets, or decorative nonfunctional controls were added. Browser checks cover actions, states, keyboard, CSS isolation, and narrow overflow; contrast is measured. Mainnet links and testnet data are distinguished.
- Purpose gate PASS: a compact dark surface keeps the extension visually consistent with a trading task; mint marks the primary action and focus; green/red state colours accompany explicit verdict text. Shadow separates the overlay from the article. Refresh, back, and external-link arrows indicate those actual actions. The identity is the product wordmark and the ticker-to-risk flow, not an invented logo. No gradient, glow, or stock icon pack was added.
- Liveliness PASS: price leads the market card; scenario evidence leads the expanded view; market discovery leads the side panel. Spacing separates controls, evidence, and assumptions. Visual direction: energy 1, rhythm 2, motion 1. Motion remains limited to the simulator transition and respects reduced motion.
- Craftsmanship PASS for exercised flows: native disclosures and inputs remain operable; API-derived numbers retain decimal arithmetic and existing risk behavior; error states have recovery text; experimental qualification is adjacent to the result. The screen captures and browser assertions above support these checks, not a claim that every real website or assistive technology has been tested.

## Limits

The Chrome Web Store package has not been submitted. Mainnet account-level validation and a logged-in Strike ticket test are still outstanding. These UI changes do not remove the experimental status of the risk engine. The source folder still has no Git metadata; before-edit source backups live under the ignored `.superpowers/ui-redesign-baseline-2026-10-22/` directory.
