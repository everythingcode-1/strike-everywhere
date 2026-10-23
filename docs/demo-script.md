# Demo script

Target length: about 90 seconds. Record the actual extension and current mainnet data. Read the numbers on screen; do not edit a result to fit this script.

| Time | Screen | Voiceover |
|---|---|---|
| 0:00–0:10 | A news article containing Bitcoin/BTC. | “A trading idea starts while you are reading. Strike Everywhere brings the market to that sentence.” |
| 0:10–0:22 | Select one claim, right-click, choose **Analyze with Strike Everywhere**. Side panel opens on Discover. | “The selected claim stays local until I ask for an analysis. The extension resolves only markets that Strike actually lists.” |
| 0:22–0:35 | Show the claim, source/date and verified BTC chip. Leave Jev off; choose Long manually. | “No key is required. Bitcoin maps to a verified Strike market, but the market suggestion is not a trade instruction.” |
| 0:35–0:52 | Enter virtual collateral and leverage, press **Review simulation**, show VWAP, fees, timestamps and limitations. | “This is a full-fill market entry from the current book. Quantity is rounded to the market step, and fees are assumptions, not my account fee.” |
| 0:52–1:05 | Press **Create virtual trade**; show the open record and the **Live virtual trade — no real funds** badge. | “The entry and claim are now immutable local evidence. No wallet was connected and no order was sent.” |
| 1:05–1:18 | Press **Review virtual close**, show the exit fill, then **Confirm virtual close**. | “The close walks the opposite side of the book. Funding is not reconstructed, so net PnL is explicitly labelled as excluding unknown funding.” |
| 1:18–1:32 | Open Receipts, show claim → decision → entry fill → costs → assumptions/events, press **Export JSON**. | “The receipt records what was tested, when, with which market data and assumptions, and what remains unknown. Export is a local file.” |
| 1:32–1:40 | Return to the article and hover `$BTC` on the existing market card. | “The original live market card and 30-day risk scenario still work. This build is a virtual research tool, not a trading terminal.” |

## Recording checks

- Build and load the current `dist/`. Use a listed mainnet asset such as BTC or TSLA.
- Use a clean browser profile. Keep unrelated account information and browsing out of the recording.
- Show the claim source/date, verified market, full-fill and freshness limitations, unknown funding, and unavailable liquidation label. Do not hide them in a footer.
- If Jev is shown, show the disclosure and the explicit **Analyze with Jev** press. A missing key must fall back to the manual flow; do not show a fake AI result.
- If the API or order book is unavailable, show the error and retry honestly. Do not substitute a synthetic fixture without labelling it.
- Stop before any order confirmation. The extension only opens the mainnet market; it does not transfer a position or place an order.
- Add the real source and video links to the submission form. No video or public repository has been created by this script document.
