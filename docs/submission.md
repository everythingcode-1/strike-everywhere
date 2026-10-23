# Strike Everywhere

Read the market. Test the risk. Keep the evidence.

## Project description

Strike Everywhere is a Chrome extension that adds a Strike market card to supported asset tickers on the page a reader is already using, then turns a selected claim into a local **Ghost Trade** — a virtual perpetual with estimated entry, fees, observed marks, virtual close and an exportable receipt.

The core interaction is short: select a sentence, right-click **Analyze with Strike Everywhere**, verify the Strike market, choose Jev or manual direction, review the book fill, and create a virtual trade. The card still offers price, funding, liquidity, and a 30-day historical risk scenario. The extension checks for liquidation using 43,200 completed one-minute mark candles. It shows liquidation events, partial reductions, and the worst adverse price move through the first event. The user can open the market on Strike when ready.

The current build uses public mainnet market data. Results are experimental estimates, not forecasts or a validation of an actual account. Ghost Trades are virtual and local: the extension does not connect a wallet, take custody, or submit an order. Jev is optional BYOK; its key is saved locally on this device and can be cleared in Settings. Selected text is sent only after consent.

## Why this belongs in the Strike ecosystem

Trading ideas often arise while reading an article or research post. Strike Everywhere places Strike's market information at that moment, with a simulated position and a receipt that records the claim, the market evidence and the unknowns. It offers a potential discovery surface outside the exchange and a reusable risk/fill engine inside the extension.

That acquisition benefit is a product hypothesis. We have not measured conversion, retention, or loss reduction and make no claims about them.

## Integration and execution

The extension uses Strike's public exchange information, verified market filters, margin tiers, mark/index prices, funding rate, volume, open interest, order-book depth, best quotes, and mark-price klines. The symbol registry comes from Strike rather than an unrelated price provider. All product network requests go to the permitted Strike API hosts; TypeSafe is an optional host requested only for Jev.

Risk math uses decimal arithmetic. Long and short liquidation thresholds solve equity against maintenance margin in the tier at the candidate mark, including the maintenance amount. Replay includes entry and reduction taker fees and hourly funding under an explicit constant-current-rate assumption. Execution entry can use order-book VWAP; the historical mark path remains anchored to the current mark so slippage affects risk. Thin depth replays only the filled amount.

Ghost entry and close walk the live book, floor quantity to the exchange step, recompute notional/fees/VWAP from the rounded fill, reject stale or crossed data, and write the trade plus event atomically to IndexedDB. Funding is never fabricated: unknown funding is `null` and every net is labelled `netExcludingUnknownFunding`. Liquidation is explicitly unavailable for Ghost trades rather than borrowed from the unvalidated cross-margin model.

The interface uses a closed Shadow DOM for the page card, a keyboard-accessible side panel with Discover/Markets/Ghost/Receipts/Settings views, a per-site switch, cached market quotes, and visible loading/empty/error/stale states. Incomplete history cannot produce a 30-day verdict. Only a hypothetical single cross-margin position is supported by the old replay; isolated simulation is refused with an explanation.

## Evidence for the judging criteria

| Criterion | Demonstration |
|---|---|
| Innovation | A contextual claim-to-market flow joining verified Strike discovery, a virtual position, and a portable receipt on an existing page. |
| Strike integration | Registry, exchange filters, risk tiers, funding, liquidity, and mark history from Strike drive the actual results; no real order endpoint exists. |
| Utility | Test a claim while the asset is in context, inspect the fill and assumptions, then keep or export the evidence. No unmeasured impact claims. |
| Technical execution | Decimal accounting, independent invariants for long/short, constant-notional leverage, fills, stale books, depth, idempotent create/close, atomic ledger writes, privileged-message origin checks, Jev response validation, deterministic browser checks, and an unpacked-extension mainnet test. |
| Future potential | Position-level validation, historical funding reconstruction, background monitoring, SL/TP with tested ambiguity policy, and user research are concrete next steps. |

## Limitations to disclose in the demo

The engine has not been compared with three real Strike positions. A structurally complete candle history can include server-filled intervals. Replay funding is held constant, each minute permits at most one reduction, and exchange liquidation penalties are omitted. Account balances and other positions are not read. Market snapshots and estimated fills can differ from execution.

Ghost funding is not reconstructed, liquidation is unavailable, and monitoring occurs only when the panel refreshes. A real authenticated Jev call was not verified because no owner key was available; the missing-key/manual fallback and the parser boundary are tested. A native right-click was not automated in headless Chrome; the menu permission, capture path and claim UI were verified separately.

## Submission handoff

Provide the actual source repository URL and recorded/live demonstration through the organiser's submission form. Those assets are not yet published. Include installation steps from the README and the verification reports. Preserve an honest change history showing which functionality was substantially advanced during the hackathon; do not describe pre-existing work as newly built.
