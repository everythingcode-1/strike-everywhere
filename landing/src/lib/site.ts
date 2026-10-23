const fallbackSiteUrl = "https://strike-everywhere.example";
const configuredSiteUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
const releaseBuild = process.env.NEXT_PUBLIC_RELEASE === "true";

if (releaseBuild && (!configuredSiteUrl || configuredSiteUrl.endsWith(".example"))) {
  throw new Error(
    "NEXT_PUBLIC_RELEASE=true requires a real NEXT_PUBLIC_SITE_URL. Refusing to build with a placeholder .example domain.",
  );
}

export const siteConfig = {
  name: "Strike Everywhere",
  shortName: "Strike Everywhere",
  url: configuredSiteUrl ?? fallbackSiteUrl,
  title: "Strike Everywhere | Market data in the page you are reading",
  description:
    "A Chrome extension that turns listed tickers into live Strike market cards, then tests a virtual position against 30 days of mark prices. No wallet, no orders, no telemetry.",
  tagline: "Markets, in context.",
  repoNote: "Independent hackathon build for the Strike ecosystem. Not an official Strike product.",
  repositoryUrl: null,
  sourceArchive: "/downloads/strike-everywhere-0.1.0-source.zip",
  extensionArchive: "/downloads/strike-everywhere-0.1.0-extension.zip",
  sourceNote:
    "No public repository URL is published yet. The source archive on this page contains the buildable extension source.",
} as const;

export const navLinks = [
  { href: "#market-card", label: "The card" },
  { href: "#claim-to-receipt", label: "Ghost Trades" },
  { href: "#risk", label: "Risk replay" },
  { href: "#privacy", label: "Privacy" },
  { href: "#faq", label: "FAQ" },
] as const;

export const faqItems = [
  {
    question: "Does Strike Everywhere place orders?",
    answer:
      "No. The build has no order endpoint and never asks for a wallet, seed phrase, or private key. The card can open a market on Strike, but it does not transfer a quote or submit an order.",
  },
  {
    question: "What is a Ghost Trade?",
    answer:
      "A Ghost Trade is a virtual perpetual stored in your browser. The extension estimates an entry from the live order book, records fees and mark observations, and lets you close it virtually. It is a local evidence record, not an exchange position. Funding is treated as unknown rather than invented.",
  },
  {
    question: "Where does the market data come from?",
    answer:
      "Price, funding, open interest, volume, margin tiers, and candles come from Strike's public API. The default build uses mainnet data. Market snapshots and estimated fills are not execution guarantees.",
  },
  {
    question: "Why does the replay cover 30 days?",
    answer:
      "The replay reads 43,200 completed one-minute mark-price candles. It checks the adverse extreme for the position direction, applies staged reductions and fees, and reports the first liquidation event. A replay is historical scenario evidence, not a forecast or a safety recommendation.",
  },
  {
    question: "Has the risk model been validated?",
    answer:
      "No. The liquidation and replay numbers are experimental estimates and have not been compared with three real Strike positions. The UI and README say so. The model rejects incomplete history instead of producing a verdict.",
  },
  {
    question: "Does any page data leave the browser?",
    answer:
      "There is no analytics, telemetry, or remote logging. Content scripts scan text nodes for listed tickers and do not read cookies, localStorage, form values, or account data. Jev is optional and uses your own TypeSafe key. Selected text is sent only after you tick the disclosure and press Analyze with Jev.",
  },
  {
    question: "Does it work offline?",
    answer:
      "If the network fails after a quote has been cached, the card can render the last local market snapshot from IndexedDB. The card labels cached data and its timestamp. A replay needs complete history and will show an error instead of a verdict when history is missing.",
  },
] as const;

export const npmBuildCommand = "npm install && npm run build";

export const npmDemoCommand = "npm run demo";
