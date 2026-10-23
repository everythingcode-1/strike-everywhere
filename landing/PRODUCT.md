# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Next.js 16 App Router with static export, Tailwind CSS 4, shadcn/ui components, and one Cult UI text animation. The marketing site lives in `landing/` and does not alter the Chrome extension build.

## Users

Retail traders and research readers who already use, or are curious about, Strike. They meet the product while reading a news article or research note and want market context without opening another tab.

## Product Purpose

Strike Everywhere is a Chrome extension that detects listed tickers on the page being read, opens a Strike market card, and tests a hypothetical position against 30 days of mark-price history. It also turns a selected claim into a locally stored virtual Ghost Trade with a receipt.

## Positioning

The product lives at the moment of context: the sentence on the page. It combines Strike market discovery, a fill estimate, a historical risk scenario, and local evidence. No wallet, no account, no order endpoint.

## Operating Context

The extension is loaded unpacked from `dist/`. It uses public Strike API data. The default build runs on mainnet. The local demo article is served by `npm run demo`. Ghost Trades are stored in the browser, not on a server.

## Capabilities and Constraints

- Detects uppercase tickers from the Strike registry; ambiguous tokens need a `$` prefix.
- Card states: loading, ready, offline-cached, not-tradable, error.
- 30-day replay uses exactly 43,200 completed one-minute mark-price candles.
- The risk model is experimental and has not been validated against three real Strike positions.
- Funding is not reconstructed. Ghost net PnL excludes unknown funding.
- No order endpoint, wallet connection, telemetry, analytics, or remote logging.
- Jev is optional, BYOK, session-only, and consent-gated.
- Chrome Web Store listing is not published.

## Brand Commitments

The approved mark is a mint geometric S on near-black. The interface uses near-black, ivory, graphite, and mint. The extension calls itself Strike Everywhere and uses the line "Markets, in context."

## Evidence on Hand

Real extension captures live in `public/shots/` and `docs/screenshots/`. Product facts come from the extension README, SPEC, and verification reports. No testimonials, customer counts, uptime, or conversion claims are available, so none are shown.

## Product Principles

- Put the market where the reading happens.
- Show the assumption next to the number.
- Keep evidence local and inspectable.
- Refuse a verdict when the data is incomplete.
- Never turn a simulation into an order.

## Accessibility & Inclusion

Target WCAG 2.2 AA. Keyboard access, visible focus, 44 px minimum controls, reduced-motion support, text contrast checked with a contrast script, and no horizontal overflow at 320 px.
