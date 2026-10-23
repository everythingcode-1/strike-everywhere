import Image from "next/image";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TextAnimate } from "@/components/ui/text-animate";
import { CopyCommand } from "@/components/copy-command";
import { SiteHeader } from "@/components/site-header";
import { faqItems, navLinks, npmBuildCommand, siteConfig } from "@/lib/site";

const tickerExamples = ["$BTC", "TSLA", "$ETH", "NVDA", "CRCL", "GOOGL", "XRP", "AAOI"];

const softwareSchema = {
  "@type": "SoftwareApplication",
  "@id": `${siteConfig.url}/#software`,
  name: siteConfig.name,
  applicationCategory: "FinanceApplication",
  applicationSubCategory: "Market data and risk simulation",
  operatingSystem: "Chrome 116 or newer",
  browserRequirements: "Requires Chrome 116 or newer.",
  description: siteConfig.description,
  url: siteConfig.url,
  image: `${siteConfig.url}/og.png`,
  screenshot: `${siteConfig.url}/shots/article-card.png`,
  softwareVersion: "0.1.0",
  isAccessibleForFree: true,
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "USD",
  },
  featureList: [
    "Listed ticker detection on web pages",
    "Strike market card with price, funding, open interest, and volume",
    "30-day, 43,200-candle mark-price replay",
    "Locally stored virtual Ghost Trades",
    "Local JSON receipt export",
    "Optional consent-gated Jev analysis with a user-supplied key",
  ],
};

const websiteSchema = {
  "@type": "WebSite",
  "@id": `${siteConfig.url}/#website`,
  url: siteConfig.url,
  name: siteConfig.name,
  description: siteConfig.description,
  inLanguage: "en",
};

const faqSchema = {
  "@type": "FAQPage",
  "@id": `${siteConfig.url}/#faq`,
  mainEntity: faqItems.map((item) => ({
    "@type": "Question",
    name: item.question,
    acceptedAnswer: {
      "@type": "Answer",
      text: item.answer,
    },
  })),
};

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [softwareSchema, websiteSchema, faqSchema],
};

function MarketPreview() {
  return (
    <figure className="relative mx-auto w-full max-w-[570px] pb-24 sm:pb-32 lg:pb-28">
      <div className="paper-shadow relative overflow-hidden rounded-[20px] border border-black/10 bg-paper p-2.5 text-paper-foreground sm:p-4">
        <div className="flex items-center justify-between border-b border-paper-border px-2 pb-3 font-mono text-[10px] text-paper-muted">
          <span>Sample reading view</span>
          <span>20 Oct 2026</span>
        </div>
        <div className="px-4 pb-14 pt-6 sm:px-6 sm:pb-24">
          <p className="font-serif text-xs text-paper-muted">Markets desk</p>
          <h2 className="mt-2 max-w-[17ch] font-serif text-[clamp(1.7rem,3vw,2.55rem)] leading-[1.04] tracking-[-0.035em]">
            TSLA lifts guidance as traders rotate back into risk
          </h2>
          <p className="mt-5 max-w-[42ch] font-serif text-[15px] leading-7 text-paper-muted sm:text-base">
            <span className="ticker-underline text-paper-foreground">TSLA</span> shares rose in
            early trading after the company raised its delivery outlook. <span className="ticker-underline text-paper-foreground">$BTC</span>{" "}
            traded near its weekly high as high-beta names followed the bid.
          </p>
          <p className="mt-3 max-w-[39ch] font-serif text-[15px] leading-7 text-paper-muted">
            Hover a ticker. The market card opens in place.
          </p>
        </div>
      </div>

      <div className="absolute bottom-7 right-2 w-[238px] sm:bottom-5 sm:right-[-14px] sm:w-[286px] lg:right-[-24px]">
        <Image
          src="/shots/market-card.png"
          alt="Strike Everywhere market card showing TSLA-USD mark price, funding, open interest, and 24-hour volume."
          width={320}
          height={506}
          priority
          className="soft-shadow h-auto w-full rounded-xl border border-white/10"
        />
        <figcaption className="mt-2 text-right font-mono text-[10px] leading-4 text-muted-foreground">
          Actual extension capture, 23 Oct 2026
        </figcaption>
      </div>
    </figure>
  );
}

function FlowStep({
  index,
  title,
  children,
}: {
  index: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <li className="flow-step">
      <span className="flow-index">{index}</span>
      <h3 className="text-base font-semibold text-foreground">{title}</h3>
      <p className="mt-1.5 text-sm leading-6 text-muted-foreground">{children}</p>
    </li>
  );
}

export default function Home() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />
      <SiteHeader />
      <main id="main">
        <section className="border-b border-white/10">
          <div className="container-page grid gap-14 pb-16 pt-14 sm:pt-20 lg:grid-cols-[1.03fr_0.97fr] lg:items-center lg:gap-16 lg:pb-24 lg:pt-24">
            <div>
              <p className="section-kicker">Chrome extension for the Strike ecosystem</p>
              <TextAnimate
                as="h1"
                text="The market card that lives in the sentence."
                type="rollIn"
                className="mt-5 max-w-[12ch] text-[clamp(2.9rem,7.4vw,5.5rem)] font-semibold leading-[0.94] tracking-[-0.065em] text-foreground"
              />
              <p className="mt-6 max-w-[53ch] text-base leading-7 text-muted-foreground sm:text-lg sm:leading-8">
                Strike Everywhere finds listed tickers on the page you are reading and opens live
                Strike market data in place. Test a position against 30 days of mark prices.
                No orders are sent. No wallet is connected.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Button
                  asChild
                  className="h-11 rounded-lg bg-primary px-5 text-primary-foreground hover:bg-primary/90"
                >
                  <a href="#install">Install from source</a>
                </Button>
                <Button
                  asChild
                  variant="outline"
                  className="h-11 rounded-lg border-white/40 px-5 text-foreground hover:bg-white/5"
                >
                  <a href="#risk">See the 30-day replay</a>
                </Button>
              </div>
              <p className="mt-4 max-w-[48ch] text-sm leading-6 text-muted-foreground">
                Chrome Web Store listing is not published. The build loads from source with
                Developer mode.
              </p>

              <dl className="mt-10 grid max-w-xl grid-cols-3 gap-5 border-t border-white/10 pt-5">
                <div>
                  <dt className="font-mono text-xl text-foreground sm:text-2xl">43,200</dt>
                  <dd className="mt-1 text-xs leading-5 text-muted-foreground">
                    one-minute mark candles per replay
                  </dd>
                </div>
                <div>
                  <dt className="font-mono text-xl text-foreground sm:text-2xl">Public</dt>
                  <dd className="mt-1 text-xs leading-5 text-muted-foreground">
                    mainnet market data
                  </dd>
                </div>
                <div>
                  <dt className="font-mono text-xl text-foreground sm:text-2xl">Local</dt>
                  <dd className="mt-1 text-xs leading-5 text-muted-foreground">
                    virtual trades and receipts
                  </dd>
                </div>
              </dl>
            </div>

            <MarketPreview />
          </div>
        </section>

        <section
          aria-label="Example listed markets"
          className="border-b border-white/10 bg-[#0d0d0c]"
        >
          <div className="container-page flex flex-wrap items-center gap-x-3 gap-y-2 py-4 font-mono text-[11px] text-muted-foreground">
            <span className="mr-2 text-foreground/80">Detects listed markets only</span>
            {tickerExamples.map((ticker, index) => (
              <span key={ticker} className="flex items-center gap-3">
                {index > 0 ? <span aria-hidden="true" className="text-white/20">/</span> : null}
                <span className="ticker-underline text-foreground/75">{ticker}</span>
              </span>
            ))}
          </div>
        </section>

        <section id="market-card" className="paper-section">
          <div className="container-page section-pad grid gap-14 lg:grid-cols-[0.84fr_1.16fr] lg:items-center lg:gap-20">
            <div>
              <p className="section-kicker">The reading surface</p>
              <h2 className="mt-4 max-w-[14ch] text-4xl font-semibold leading-[1.02] tracking-[-0.045em] sm:text-5xl">
                A card, not a takeover.
              </h2>
              <p className="mt-5 max-w-[48ch] text-base leading-7 text-paper-muted">
                The page stays a page. A listed ticker gets a dotted underline, then a compact
                card opens over the article with the market data you would otherwise open a new
                tab to find.
              </p>

              <ul className="mt-9 space-y-6">
                <li>
                  <h3 className="text-sm font-semibold">Open on intent</h3>
                  <p className="mt-1.5 max-w-[48ch] text-sm leading-6 text-paper-muted">
                    Hover for 150 ms or press Enter. The card gives you 200 ms of grace before it
                    closes, so you can move into it.
                  </p>
                </li>
                <li>
                  <h3 className="text-sm font-semibold">Market data in place</h3>
                  <p className="mt-1.5 max-w-[48ch] text-sm leading-6 text-paper-muted">
                    Mark price, 24-hour change, hourly funding, open interest, and volume come
                    from Strike. The 320 px card checks the viewport before it positions itself.
                  </p>
                </li>
                <li>
                  <h3 className="text-sm font-semibold">Leaves the line box alone</h3>
                  <p className="mt-1.5 max-w-[48ch] text-sm leading-6 text-paper-muted">
                    The underline uses text decoration, not a border. The article does not shift
                    when the extension detects a ticker.
                  </p>
                </li>
              </ul>

              <p className="mt-9 max-w-[50ch] border-l-2 border-[#157b58]/50 pl-4 text-sm leading-6 text-paper-muted">
                Keyboard users get the same card: Tab to a ticker, Enter to open, Esc to close.
                The card lives in a closed Shadow DOM, so page styles stay on the page.
              </p>
            </div>

            <figure>
              <div className="overflow-hidden rounded-2xl border border-paper-border bg-[#0b0b0a] p-2 sm:p-3">
                <Image
                  src="/shots/article-card.png"
                  alt="The Strike Everywhere card open over a sample TSLA article, with the ticker underlined in the article text."
                  width={1280}
                  height={900}
                  loading="eager"
                  className="h-auto w-full rounded-lg"
                />
              </div>
              <figcaption className="mt-3 font-mono text-[11px] leading-5 text-paper-muted">
                Actual unpacked-extension capture on the local demo article.
              </figcaption>
            </figure>
          </div>
        </section>

        <section id="claim-to-receipt" className="border-b border-white/10">
          <div className="container-page section-pad grid gap-14 lg:grid-cols-[0.96fr_1.04fr] lg:items-start lg:gap-20">
            <div>
              <p className="section-kicker">Ghost Trades</p>
              <h2 className="mt-4 max-w-[14ch] text-4xl font-semibold leading-[1.02] tracking-[-0.045em] sm:text-5xl">
                From a sentence to a receipt.
              </h2>
              <p className="mt-5 max-w-[50ch] text-base leading-7 text-muted-foreground">
                Select a claim, verify the Strike market, review the book fill, and keep a local
                record of what you tested. A <dfn className="text-foreground">Ghost Trade</dfn> is
                a virtual perpetual, not an exchange position.
              </p>

              <ol className="mt-9 list-none p-0">
                <FlowStep index="01" title="Select a claim">
                  Select text and choose Analyze with Strike Everywhere from the context menu.
                  Form fields are refused, and the claim stays local until you ask for analysis.
                </FlowStep>
                <FlowStep index="02" title="Verify the market">
                  The extension resolves only markets in the Strike registry. Jev is optional,
                  bring-your-own-key, and consent-gated. Manual direction always works.
                </FlowStep>
                <FlowStep index="03" title="Review the fill">
                  Longs consume asks; shorts consume bids. Quantity is floored to the market step,
                  then notional, VWAP, and fees are recomputed from the rounded fill.
                </FlowStep>
                <FlowStep index="04" title="Keep the evidence">
                  Create a virtual trade, close it virtually, and export a local JSON receipt. Entry
                  and claim snapshots are immutable.
                </FlowStep>
              </ol>

              <p className="mt-9 border border-primary/25 bg-mint-soft/45 px-4 py-3 text-sm leading-6 text-foreground">
                There is no order endpoint in this build. No wallet is connected, and no order is
                placed by the card, the panel, or the receipt.
              </p>
            </div>

            <div>
              <div className="grid gap-3 sm:grid-cols-2">
                <figure>
                  <div className="overflow-hidden rounded-xl border border-white/10 bg-[#0f0f0e] p-2">
                    <Image
                      src="/shots/ghost-trade.png"
                      alt="Ghost Trade detail showing a closed bitcoin virtual trade, fees, mark freshness, and an open receipt button."
                      width={400}
                      height={900}
                      loading="eager"
                      className="h-auto w-full rounded-lg"
                    />
                  </div>
                  <figcaption className="mt-2 font-mono text-[11px] leading-5 text-muted-foreground">
                    Closed virtual trade
                  </figcaption>
                </figure>
                <figure className="hidden sm:block">
                  <div className="overflow-hidden rounded-xl border border-white/10 bg-[#0f0f0e] p-2">
                    <Image
                      src="/shots/receipt.png"
                      alt="Receipt view showing a local BTC virtual outcome and an Export JSON button."
                      width={400}
                      height={900}
                      loading="eager"
                      className="h-auto w-full rounded-lg"
                    />
                  </div>
                  <figcaption className="mt-2 font-mono text-[11px] leading-5 text-muted-foreground">
                    Local JSON receipt
                  </figcaption>
                </figure>
              </div>
              <p className="mt-4 font-mono text-[11px] leading-5 text-muted-foreground">
                Captured from the 23 Oct 2026 build. Funding is not reconstructed, so net PnL is
                labelled as excluding unknown funding.
              </p>
            </div>
          </div>
        </section>

        <section id="risk" className="paper-section">
          <div className="container-page section-pad grid gap-14 lg:grid-cols-[1.08fr_0.92fr] lg:items-center lg:gap-20">
            <div>
              <p className="section-kicker">Risk replay</p>
              <h2 className="mt-4 max-w-[15ch] text-4xl font-semibold leading-[1.02] tracking-[-0.045em] sm:text-5xl">
                Thirty days of history. Not a forecast.
              </h2>

              <div className="mt-8 flex flex-wrap items-end gap-x-5 gap-y-2">
                <span className="font-mono text-[clamp(4rem,10vw,7rem)] leading-[0.8] tracking-[-0.09em] text-paper-foreground">
                  43,200
                </span>
                <span className="max-w-[15rem] pb-1 text-sm leading-6 text-paper-muted">
                  completed one-minute mark-price candles in every replay
                </span>
              </div>

              <p className="mt-7 max-w-[52ch] text-base leading-7 text-paper-muted">
                The replay checks the adverse extreme for the direction, applies staged
                reductions, and charges entry and reduction taker fees. Longs use the candle low;
                shorts use the high. Incomplete history returns an error instead of a verdict.
              </p>

              <ul className="mt-6 grid gap-3 text-sm leading-6 text-paper-muted sm:grid-cols-2">
                <li className="border-t border-paper-border pt-3">
                  Entry can use order-book VWAP. Thin depth replays only the filled amount and
                  says so.
                </li>
                <li className="border-t border-paper-border pt-3">
                  Funding is held at the current hourly rate. Historical funding is not
                  reconstructed.
                </li>
                <li className="border-t border-paper-border pt-3">
                  One reduction attempt per minute. Exchange liquidation penalties are not
                  modelled.
                </li>
                <li className="border-t border-paper-border pt-3">
                  A historical replay preserves percentage moves. It is not a record of an actual
                  account.
                </li>
              </ul>

              <div id="limits" className="mt-7 max-w-[58ch] border border-[#9b7b2f]/30 bg-[#f3e8c8]/45 px-4 py-3">
                <p className="text-sm font-semibold text-paper-foreground">Experimental estimate.</p>
                <p className="mt-1 text-sm leading-6 text-paper-muted">
                  The risk model has not been validated against three real Strike positions. A
                  replay is historical scenario evidence, not a forecast or a safety
                  recommendation.
                </p>
              </div>
            </div>

            <figure>
              <div className="mx-auto max-w-[400px] overflow-hidden rounded-2xl border border-black/15 bg-[#0b0b0a] p-2.5">
                <Image
                  src="/shots/risk-replay.png"
                  alt="Position stress-test panel with a 30-day replay result, worst adverse move, estimated liquidation, initial margin, and fee."
                  width={400}
                  height={900}
                  loading="eager"
                  className="h-auto w-full rounded-xl"
                />
              </div>
              <figcaption className="mx-auto mt-3 max-w-[400px] font-mono text-[11px] leading-5 text-paper-muted">
                Interface capture with synthetic demo responses. Not a live market call.
              </figcaption>
            </figure>
          </div>
        </section>

        <section id="privacy" className="border-y border-white/10">
          <div className="container-page section-pad grid gap-12 lg:grid-cols-[0.82fr_1.18fr] lg:items-start lg:gap-20">
            <div>
              <p className="section-kicker">Privacy boundary</p>
              <h2 className="mt-4 max-w-[13ch] text-4xl font-semibold leading-[1.02] tracking-[-0.045em] sm:text-5xl">
                No wallet. No orders. No telemetry.
              </h2>
              <p className="mt-5 max-w-[47ch] text-base leading-7 text-muted-foreground">
                Passive ticker detection reads only the page text it scans for listed symbols.
                Text you select for Ghost or Jev is used only after you act. Market snapshots and
                virtual trades stay in your browser.
              </p>
              <p className="mt-6 max-w-[47ch] font-mono text-[11px] leading-5 text-muted-foreground">
                The build has no analytics, crash reporting, or remote logging. Every card ends
                with the same line: Data from Strike. Not financial advice.
              </p>
            </div>

            <Card className="rounded-2xl border-white/10 bg-card p-1 ring-white/10">
              <CardHeader className="px-5 pt-5">
                <CardTitle className="font-sans text-lg">Data boundary</CardTitle>
              </CardHeader>
              <CardContent className="px-5 pb-5">
                <dl className="divide-y divide-white/10">
                  <div className="grid gap-1 py-4 sm:grid-cols-[8.5rem_1fr] sm:gap-5">
                    <dt className="font-mono text-[11px] text-muted-foreground">Network</dt>
                    <dd className="text-sm leading-6 text-foreground/90">
                      Public GETs to{" "}
                      <code className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[11px] text-foreground break-all">
                        api.strikefinance.org
                      </code>{" "}
                      and{" "}
                      <code className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[11px] text-foreground break-all">
                        api-v2-testnet.strikefinance.org
                      </code>
                      . No auth header. Jev is an optional TypeSafe host requested only when you
                      save a key.
                    </dd>
                  </div>
                  <div className="grid gap-1 py-4 sm:grid-cols-[8.5rem_1fr] sm:gap-5">
                    <dt className="font-mono text-[11px] text-muted-foreground">Stored locally</dt>
                    <dd className="text-sm leading-6 text-foreground/90">
                      Settings, market snapshots, Ghost Trades, and receipts in IndexedDB or
                      extension storage. A Jev key is session-only and disappears when the
                      browser session ends.
                    </dd>
                  </div>
                  <div className="grid gap-1 py-4 sm:grid-cols-[8.5rem_1fr] sm:gap-5">
                    <dt className="font-mono text-[11px] text-muted-foreground">Never read</dt>
                    <dd className="text-sm leading-6 text-foreground/90">
                      Cookies, localStorage, form values, or account data. Ticker detection scans
                      text nodes for listed symbols; text you select for Ghost or Jev is handled
                      only after you act. Content scripts are limited to http and https pages.
                    </dd>
                  </div>
                  <div className="grid gap-1 py-4 sm:grid-cols-[8.5rem_1fr] sm:gap-5">
                    <dt className="font-mono text-[11px] text-muted-foreground">
                      Jev analysis
                    </dt>
                    <dd className="flex flex-wrap items-center gap-2 text-sm leading-6 text-foreground/90">
                      <Badge
                        variant="outline"
                        className="h-5 border-primary/30 bg-mint-soft/40 px-1.5 text-[10px] text-primary"
                      >
                        Optional
                      </Badge>
                      Selected text leaves the browser only after you tick the disclosure and
                      press Analyze with Jev. The claim is sent with verified market names, not
                      your URL, balances, or receipts.
                    </dd>
                  </div>
                </dl>
              </CardContent>
            </Card>
          </div>
        </section>

        <section id="install">
          <div className="container-page section-pad grid gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:items-start lg:gap-20">
            <div>
              <p className="section-kicker">Install from source</p>
              <h2 className="mt-4 max-w-[14ch] text-4xl font-semibold leading-[1.02] tracking-[-0.045em] sm:text-5xl">
                The build is inspectable.
              </h2>
              <p className="mt-5 max-w-[48ch] text-base leading-7 text-muted-foreground">
                This is not a Chrome Web Store release yet. Build the extension, load the unpacked
                output, and read the code before it reads a page.
              </p>
              <div className="mt-7 max-w-[48ch] border border-white/10 bg-card px-4 py-3">
                <p className="text-sm leading-6 text-muted-foreground">
                  <span className="text-foreground">Not a trading terminal.</span> The extension
                  opens Strike market pages; it never sends an order. Ghost Trades are virtual
                  ledger records with no real funds.
                </p>
              </div>
            </div>

            <div>
              <div className="flex flex-wrap gap-3">
                <Button
                  asChild
                  className="h-11 rounded-lg bg-primary px-5 text-primary-foreground hover:bg-primary/90"
                >
                  <a href={siteConfig.sourceArchive} download>
                    Download source ZIP
                  </a>
                </Button>
                <Button
                  asChild
                  variant="outline"
                  className="h-11 rounded-lg border-white/40 px-5 text-foreground hover:bg-white/5"
                >
                  <a href={siteConfig.extensionArchive} download>
                    Download built extension ZIP
                  </a>
                </Button>
              </div>
              <p className="mt-3 max-w-[48ch] text-xs leading-5 text-muted-foreground">
                {siteConfig.sourceNote} The built ZIP is the current{" "}
                <code className="rounded bg-white/5 px-1.5 py-0.5 font-mono text-[11px] text-foreground">
                  dist/
                </code>{" "}
                output; unzip it and load the folder unpacked.
              </p>

              <CopyCommand command={npmBuildCommand} label="Build from source" />

              <ol className="mt-6 space-y-4 text-sm leading-6 text-muted-foreground">
                <li className="grid grid-cols-[2rem_1fr] gap-3">
                  <span className="font-mono text-[11px] text-primary">01</span>
                  <span>
                    Download the source ZIP above and extract it to a folder. Open a terminal in
                    that folder.
                  </span>
                </li>
                <li className="grid grid-cols-[2rem_1fr] gap-3">
                  <span className="font-mono text-[11px] text-primary">02</span>
                  <span>
                    Run the command above, then open{" "}
                    <code className="rounded bg-white/5 px-1.5 py-0.5 font-mono text-xs text-foreground">
                      chrome://extensions
                    </code>
                    .
                  </span>
                </li>
                <li className="grid grid-cols-[2rem_1fr] gap-3">
                  <span className="font-mono text-[11px] text-primary">03</span>
                  <span>
                    Enable Developer mode, choose Load unpacked, and select the{" "}
                    <code className="rounded bg-white/5 px-1.5 py-0.5 font-mono text-xs text-foreground">
                      dist/
                    </code>{" "}
                    folder.
                  </span>
                </li>
                <li className="grid grid-cols-[2rem_1fr] gap-3">
                  <span className="font-mono text-[11px] text-primary">04</span>
                  <span>
                    Run{" "}
                    <code className="rounded bg-white/5 px-1.5 py-0.5 font-mono text-xs text-foreground">
                      npm run demo
                    </code>
                    , open{" "}
                    <code className="rounded bg-white/5 px-1.5 py-0.5 font-mono text-xs text-foreground">
                      localhost:4173/article.html
                    </code>
                    , and enable localhost in the side panel.
                  </span>
                </li>
              </ol>

              <div className="mt-7 flex flex-wrap items-center gap-3">
                <Button
                  asChild
                  variant="outline"
                  className="h-11 rounded-lg border-white/40 px-5 text-foreground hover:bg-white/5"
                >
                  <a href="#faq">Read the limitations</a>
                </Button>
                <span className="font-mono text-[11px] text-muted-foreground">
                  MIT licensed source
                </span>
              </div>
            </div>
          </div>
        </section>

        <section id="faq" className="paper-section">
          <div className="container-page section-pad grid gap-12 lg:grid-cols-[0.78fr_1.22fr] lg:items-start lg:gap-20">
            <div>
              <p className="section-kicker">Questions</p>
              <h2 className="mt-4 max-w-[13ch] text-4xl font-semibold leading-[1.02] tracking-[-0.045em] sm:text-5xl">
                What this build does, and what it does not.
              </h2>
              <p className="mt-5 max-w-[43ch] text-base leading-7 text-paper-muted">
                The answers use the product&apos;s actual constraints. If a feature is not in the
                build, it is not in the answer.
              </p>
            </div>

            <div>
              {faqItems.map((item) => (
                <details key={item.question} className="faq-item">
                  <summary>{item.question}</summary>
                  <p>{item.answer}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="border-t border-white/10">
          <div className="container-page flex flex-col gap-7 py-14 sm:flex-row sm:items-end sm:justify-between sm:py-16">
            <div>
              <p className="section-kicker">Keep the context</p>
              <h2 className="mt-3 max-w-[19ch] text-3xl font-semibold leading-[1.03] tracking-[-0.045em] sm:text-4xl">
                Read the market where the idea starts.
              </h2>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button
                asChild
                className="h-11 rounded-lg bg-primary px-5 text-primary-foreground hover:bg-primary/90"
              >
                <a href="#install">Install from source</a>
              </Button>
              <Button
                asChild
                variant="outline"
                className="h-11 rounded-lg border-white/40 px-5 text-foreground hover:bg-white/5"
              >
                <a href="#faq">Read the limits</a>
              </Button>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-white/10">
        <div className="container-page py-10">
          <div className="flex flex-col gap-8 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="flex items-center gap-2.5">
                <Image
                  src="/brand/mark-48.png"
                  alt=""
                  width={28}
                  height={28}
                  className="rounded-sm"
                />
                <span className="text-sm font-semibold">
                  Strike <span className="font-normal text-muted-foreground">Everywhere</span>
                </span>
              </div>
              <p className="mt-3 max-w-[34ch] text-sm leading-6 text-muted-foreground">
                {siteConfig.tagline} A Chrome extension for market data, virtual trades, and local
                evidence.
              </p>
            </div>

            <nav aria-label="Footer">
              <ul className="m-0 grid list-none grid-cols-2 gap-x-10 gap-y-2 p-0 text-sm">
                {navLinks.map((link) => (
                  <li key={link.href}>
                    <a
                      href={link.href}
                      className="inline-flex min-h-8 items-center text-muted-foreground hover:text-foreground focus-visible:outline-offset-4"
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          </div>

          <div className="mt-8 flex flex-col gap-3 border-t border-white/10 pt-6 text-[11px] leading-5 text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
            <p>
              Data from Strike. Not financial advice. Ghost Trades are virtual and local.
            </p>
            <p>
              {siteConfig.repoNote} Built with{" "}
              <a
                href="https://ui.shadcn.com"
                target="_blank"
                rel="noreferrer"
                className="text-foreground/80 underline decoration-white/20 underline-offset-4 hover:text-foreground"
              >
                shadcn/ui
              </a>{" "}
              and{" "}
              <a
                href="https://www.cult-ui.com"
                target="_blank"
                rel="noreferrer"
                className="text-foreground/80 underline decoration-white/20 underline-offset-4 hover:text-foreground"
              >
                Cult UI
              </a>
              .
            </p>
          </div>
        </div>
      </footer>
    </>
  );
}
