import Decimal from 'decimal.js';
import { DEFAULT_LEVERAGE, DEFAULT_SIZE_USD, DISCLAIMER, TAKER_FEE_RATE } from '../shared/constants';
import type { MarketSnapshot, Side } from '../shared/types';
import type { MarketExtras, MarketResultV2, ReplayResultV2 } from '../shared/v2-types';
import { summarize } from '../risk/margin';
import type { RiskSummary } from '../risk/types';
import cardCss from './card.css?inline';
import { brandMarkup } from './brand';
import { DATA_LABEL, formatMarketMoney, MODEL_NOTE, REPLAY_NOTE, replayPresentation } from './presentation';

export interface CardHandlers {
  onClose(): void;
  onOpenMarket(): void;
  onReplay(input: { sizeUsd: string; leverage: string; side: Side; seq: number }): void;
}

function fmt(value: string, maxDp = 2): string {
  const decimal = new Decimal(value);
  if (!decimal.isFinite()) return 'Unavailable';
  const decimals = decimal.abs().gte(1) ? maxDp : Math.min(8, maxDp + 4);
  let text = decimal.toFixed(decimals, Decimal.ROUND_HALF_UP);
  if (text.includes('.')) text = text.replace(/0+$/, '').replace(/\.$/, '');
  return text;
}

function money(value: string, maxDp = 2): string {
  return `$${fmt(value, maxDp)}`;
}

function compactMoney(value: string): string {
  const decimal = new Decimal(value);
  const abs = decimal.abs();
  if (abs.gte(1_000_000_000)) return `$${fmt(decimal.div(1_000_000_000).toString(), 2)}B`;
  if (abs.gte(1_000_000)) return `$${fmt(decimal.div(1_000_000).toString(), 2)}M`;
  if (abs.gte(1_000)) return `$${fmt(decimal.div(1_000).toString(), 2)}K`;
  return money(value, 2);
}

function signedPercent(value: string): string {
  const decimal = new Decimal(value);
  return `${decimal.isNegative() ? '' : '+'}${decimal.toFixed(2)}%`;
}

function nextFunding(timestamp: number): string {
  const remaining = timestamp - Date.now();
  if (remaining <= 0) return 'now';
  const hours = Math.floor(remaining / 3_600_000);
  const minutes = Math.floor((remaining % 3_600_000) / 60_000);
  return `${hours}h ${minutes}m`;
}

function eventTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString(undefined, {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
    timeZoneName: 'short',
  });
}

export class StrikeCard {
  readonly host: HTMLDivElement;
  private readonly root: ShadowRoot;
  private readonly handlers: CardHandlers;
  private snapshot: MarketSnapshot | null = null;
  private extras: MarketExtras | null = null;
  private symbol = '';
  private side: Side = 'long';
  private sizeUsd = DEFAULT_SIZE_USD;
  private leverage = DEFAULT_LEVERAGE;
  private simOpen = false;
  private replayRequested = false;
  private replaySeq = 0;
  private acceptedReplay: ReplayResultV2 | null = null;
  private rect: DOMRect | null = null;

  private readonly banner: HTMLDivElement;
  private readonly price: HTMLSpanElement;
  private readonly change: HTMLSpanElement;
  private readonly funding: HTMLElement;
  private readonly openInterest: HTMLElement;
  private readonly volume: HTMLElement;
  private readonly extrasEl: HTMLElement;
  private readonly previewButton: HTMLButtonElement;
  private readonly openButton: HTMLButtonElement;
  private readonly sim: HTMLElement;
  private readonly metrics: HTMLElement;
  private readonly replay: HTMLElement;
  private readonly sizeInput: HTMLInputElement;
  private readonly leverageInput: HTMLInputElement;
  private readonly sideButtons: HTMLButtonElement[];

  constructor(handlers: CardHandlers) {
    this.handlers = handlers;
    this.host = document.createElement('div');
    this.host.style.cssText = 'position:fixed;z-index:2147483647;top:0;left:0;';
    this.root = this.host.attachShadow({ mode: 'closed' });
    const style = document.createElement('style');
    style.textContent = cardCss;
    this.root.append(style);

    const card = document.createElement('div');
    card.className = 'card';
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-label', 'Strike market');
    card.innerHTML = `
      <header>
        ${brandMarkup()}
        <button class="close" type="button" aria-label="Close">×</button>
      </header>
      <div class="market-heading">
        <div><span class="symbol" data-symbol>Strike</span><div class="market-type">USD perpetual</div></div>
        <div class="source">${DATA_LABEL}</div>
      </div>
      <div class="banner" data-banner role="status" aria-live="polite" hidden></div>
      <section class="quote-section" aria-label="Market overview">
        <div class="quote-caption"><span>Mark price</span><span class="change" data-change>…</span></div>
        <div class="price-row"><span class="price" data-price>…</span></div>
        <dl class="stats">
          <div class="funding-stat"><dt>Funding / hour</dt><dd data-funding>…</dd></div>
          <div><dt>Open interest</dt><dd data-oi>…</dd></div>
          <div><dt>24h volume</dt><dd data-vol>…</dd></div>
        </dl>
        <div class="extras" data-extras hidden></div>
      </section>
      <div class="actions">
        <button class="primary" type="button" data-preview aria-expanded="false" disabled>Test position risk</button>
        <button class="secondary" type="button" data-open disabled>Open on Strike ↗</button>
      </div>
      <section class="sim" data-sim hidden>
        <h2>Position stress test</h2>
        <p class="intro">Replay 30 days of mark-price movement.</p>
        <div class="side">
          <button type="button" data-side="long" aria-pressed="true">Long</button>
          <button type="button" data-side="short" aria-pressed="false">Short</button>
        </div>
        <div class="inputs">
          <div><label for="size">Position size</label><div class="input-wrap"><input id="size" data-size inputmode="decimal" value="${DEFAULT_SIZE_USD}"><span class="input-unit">USD</span></div></div>
          <div><label for="lev">Leverage</label><div class="input-wrap"><input id="lev" data-lev inputmode="decimal" value="${DEFAULT_LEVERAGE}"><span class="input-unit">×</span></div></div>
        </div>
        <button class="primary" type="button" data-run>Run 30-day replay</button>
        <div class="replay" data-replay role="status" aria-live="polite">Run a scenario to check for liquidation events.</div>
        <dl class="metrics">
          <dt>Est. liquidation</dt><dd data-liq>Unavailable</dd>
          <dt>Initial margin</dt><dd data-im>…</dd>
          <dt>Fee (taker)</dt><dd data-fee>…</dd>
          <dt>Funding / day</dt><dd data-funding-day>…</dd>
        </dl>
        <p class="estimate">${MODEL_NOTE}</p>
        <details class="assumption-details"><summary>Model assumptions</summary><p class="note">${REPLAY_NOTE}</p><p class="note" data-note></p></details>
        <button class="secondary" type="button" data-handoff>Open market on Strike ↗</button>
      </section>
      <footer>${DISCLAIMER}</footer>
    `;
    this.root.append(card);

    const q = <T extends Element>(selector: string): T => {
      const element = card.querySelector<T>(selector);
      if (!element) throw new Error(`Missing card element: ${selector}`);
      return element;
    };

    this.banner = q<HTMLDivElement>('[data-banner]');
    this.price = q<HTMLSpanElement>('[data-price]');
    this.change = q<HTMLSpanElement>('[data-change]');
    this.funding = q<HTMLElement>('[data-funding]');
    this.openInterest = q<HTMLElement>('[data-oi]');
    this.volume = q<HTMLElement>('[data-vol]');
    this.extrasEl = q<HTMLElement>('[data-extras]');
    this.previewButton = q<HTMLButtonElement>('[data-preview]');
    this.openButton = q<HTMLButtonElement>('[data-open]');
    this.sim = q<HTMLElement>('[data-sim]');
    this.metrics = q<HTMLElement>('.metrics');
    this.replay = q<HTMLElement>('[data-replay]');
    this.sizeInput = q<HTMLInputElement>('[data-size]');
    this.leverageInput = q<HTMLInputElement>('[data-lev]');
    this.sideButtons = [...card.querySelectorAll<HTMLButtonElement>('[data-side]')];

    q<HTMLButtonElement>('.close').addEventListener('click', () => this.handlers.onClose());
    this.openButton.addEventListener('click', () => this.handlers.onOpenMarket());
    q<HTMLButtonElement>('[data-handoff]').addEventListener('click', () => this.handlers.onOpenMarket());
    this.previewButton.addEventListener('click', () => this.openSimulator());
    q<HTMLButtonElement>('[data-run]').addEventListener('click', () => this.requestReplay());
    for (const button of this.sideButtons) {
      button.addEventListener('click', () => {
        this.side = button.dataset.side === 'short' ? 'short' : 'long';
        this.syncSide();
        this.markReplayStale();
      });
    }
    this.sizeInput.addEventListener('input', () => {
      this.sizeUsd = this.sizeInput.value.trim();
      this.markReplayStale();
    });
    this.leverageInput.addEventListener('input', () => {
      this.leverage = this.leverageInput.value.trim();
      this.markReplayStale();
    });
    for (const details of card.querySelectorAll('details')) {
      details.addEventListener('toggle', () => this.relayout());
    }
  }

  show(rect: DOMRect): void {
    if (!this.host.isConnected) document.documentElement.append(this.host);
    this.host.style.visibility = 'hidden';
    this.rect = rect;
    this.position(rect);
    this.host.style.visibility = 'visible';
  }

  reposition(rect: DOMRect): void {
    if (!this.host.isConnected) return;
    this.rect = rect;
    this.position(rect);
  }

  focus(): void {
    this.root.querySelector<HTMLButtonElement>('.close')?.focus();
  }

  setLoading(symbol: string): void {
    this.symbol = symbol;
    this.snapshot = null;
    this.setSymbol(symbol);
    this.banner.hidden = false;
    this.banner.textContent = 'Loading market data…';
    this.price.textContent = '…';
    this.change.textContent = '…';
    this.funding.textContent = '…';
    this.openInterest.textContent = '…';
    this.volume.textContent = '…';
    this.previewButton.disabled = true;
    this.openButton.disabled = true;
  }

  setMarket(result: MarketResultV2): void {
    if (result.state === 'loading') { this.setLoading(this.symbol); return; }
    const snapshot = result.snapshot;
    this.snapshot = result.state === 'ready' || result.state === 'offline-cached' ? snapshot ?? null : null;
    this.setSymbol(snapshot?.symbol ?? this.symbol);

    if (result.state === 'error') {
      this.banner.hidden = false;
      this.banner.textContent = result.message ?? 'Could not load market data. Try again.';
      this.previewButton.disabled = true;
      this.openButton.disabled = true;
      return;
    }
    if (result.state === 'not-tradable' || !snapshot) {
      this.banner.hidden = false;
      this.banner.textContent = 'This market is not tradable on Strike.';
      this.previewButton.disabled = true;
      this.openButton.disabled = !snapshot;
      return;
    }

    this.banner.hidden = result.state !== 'offline-cached';
    if (result.state === 'offline-cached') {
      const at = result.cachedAt ? new Date(result.cachedAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : 'earlier';
      this.banner.textContent = `Offline: quote cached at ${at}. Reconnect to run a stress test.`;
    }

    const priceText = formatMarketMoney(snapshot.markPrice, snapshot.quotePrecision);
    const [integer, fraction] = priceText.split('.');
    const major = document.createElement('span');
    major.className = 'price-major';
    major.textContent = integer;
    const minor = document.createElement('span');
    minor.className = 'price-fraction';
    minor.textContent = fraction ? `.${fraction}` : '';
    this.price.replaceChildren(major, minor);
    this.price.setAttribute('aria-label', priceText);
    const change = new Decimal(snapshot.changePercent);
    this.change.textContent = `${signedPercent(snapshot.changePercent)} (24h)`;
    this.change.className = `change ${change.isNegative() ? 'down' : change.isZero() ? '' : 'up'}`;
    const rate = new Decimal(snapshot.fundingRate).mul(100);
    this.funding.textContent = `${rate.isNegative() ? '' : '+'}${rate.toFixed(4)}%`;
    const next = document.createElement('span');
    next.className = 'funding-next';
    next.textContent = `Next in ${nextFunding(snapshot.nextFundingTime)}`;
    this.funding.append(next);
    this.openInterest.textContent = compactMoney(new Decimal(snapshot.openInterest).mul(snapshot.markPrice).toString());
    this.volume.textContent = compactMoney(snapshot.quoteVolume);
    this.previewButton.disabled = result.state === 'offline-cached';
    this.openButton.disabled = false;
    this.updateMetrics();
    this.relayout();
  }

  setExtras(extras: MarketExtras | null): void {
    this.extras = extras;
    this.renderExtras();
    this.relayout();
  }

  private renderExtras(): void {
    const extras = this.extras;
    if (!extras) {
      this.extrasEl.hidden = true;
      this.extrasEl.replaceChildren();
      return;
    }
    this.extrasEl.hidden = false;
    const spread = extras.spread !== null && extras.spreadBps !== null
      ? `${money(extras.spread, 2)} (${new Decimal(extras.spreadBps).toFixed(1)} bps)`
      : 'Unavailable';
    const basis = extras.basisPct === null
      ? 'Unavailable'
      : `${new Decimal(extras.basisPct).gte(0) ? '+' : ''}${new Decimal(extras.basisPct).toFixed(3)}%`;
    const vol = extras.volatilityPct === null
      ? 'Unavailable'
      : `${new Decimal(extras.volatilityPct).toFixed(2)}%`;
    this.extrasEl.replaceChildren();
    const dl = document.createElement('dl');
    const add = (label: string, value: string): void => {
      const dt = document.createElement('dt');
      dt.textContent = label;
      const dd = document.createElement('dd');
      dd.textContent = value;
      dl.append(dt, dd);
    };
    add('Spread', spread);
    add('Basis', basis);
    add('Avg daily range', vol);
    this.extrasEl.append(dl);
    if (extras.sparkline.length > 1) this.extrasEl.append(renderSparkline(extras.sparkline));
  }

  setReplay(state: 'idle' | 'loading' | 'ready' | 'error', result?: ReplayResultV2, message?: string, seq?: number): void {
    if (seq !== undefined && seq !== this.replaySeq) return;
    if (state === 'loading') {
      this.replay.setAttribute('aria-busy', 'true');
      this.replay.innerHTML = '<strong>Checking 43,200 minutes…</strong><br>Fetching completed mark candles. The first run can take a moment.';
      this.relayout();
      return;
    }
    this.replay.setAttribute('aria-busy', 'false');
    if (state === 'error') {
      this.replay.innerHTML = `<span class="error">Replay failed: ${escapeHtml(message ?? 'unknown error')}</span>`;
      return;
    }
    if (state === 'idle' || !result) {
      this.replay.textContent = 'If the last 30 days repeated from this entry, would this position survive?';
      return;
    }
    const drawdownText = `${new Decimal(result.worstDrawdownPct).toFixed(2)}%`;
    const presentation = replayPresentation(result);
    if (result.candles !== 43_200) {
      this.replay.textContent = `${presentation.headline}. ${presentation.detail}`;
      this.relayout();
      return;
    }
    this.acceptedReplay = result;
    const entryText = `Entry ${formatMarketMoney(result.entryPrice, this.snapshot?.quotePrecision ?? 2)} · ${result.entrySource}`;
    const slippageText = result.slippage
      ? `Slippage: ${new Decimal(result.slippage.slippageBps).toFixed(1)} bps${result.slippage.partial ? ' · partial fill' : ''}`
      : 'Slippage: n/a';
    const meta = `<div class="result-meta">${entryText}<br>${slippageText}</div>`;
    const partial = result.replaySizeUsd !== result.requestedSizeUsd
      ? `<div class="fill-note">Partial fill: ${money(result.replaySizeUsd, 2)} of ${money(result.requestedSizeUsd, 2)} tested.</div>`
      : '';
    const evidence = `<div class="result-top"><span>Experimental replay</span><span class="result-duration">30 days</span></div>`;
    const qualification = '<p class="result-qualification">Not validated against live positions.</p>';
    const impact = `<div class="replay-impact"><div><span class="metric-caption">Worst adverse move</span><strong class="impact-value">${drawdownText}</strong></div><span class="sample-count">43,200<br>mark minutes</span></div>`;
    if (result.status === 'survived') {
      this.replay.innerHTML = `${evidence}<strong class="verdict-good">${presentation.headline}</strong>${qualification}${impact}${partial}<details class="replay-details"><summary>Replay details</summary>${meta}</details>`;
    } else {
      const when = result.firstLiquidationAt !== null ? eventTime(result.firstLiquidationAt) : 'unknown';
      this.replay.innerHTML = `${evidence}<strong class="verdict-bad">${presentation.headline}</strong>${qualification}${impact}${partial}<details class="replay-details"><summary>Replay details</summary><div class="result-meta">Scenario event: ${when}<br>${result.events.length} reduction events · ${fmt(result.remainingSize, 6)} remaining</div>${meta}</details>`;
    }
    this.updateMetrics(result.entryPrice, result.replaySizeUsd);
    this.relayout();
  }

  setSymbol(symbol: string): void {
    this.symbol = symbol;
    const label = this.root.querySelector<HTMLElement>('[data-symbol]');
    if (label) label.textContent = symbol;
    this.root.querySelector('.card')?.setAttribute('aria-label', `${symbol} on Strike`);
  }

  private openSimulator(): void {
    this.simOpen = !this.simOpen;
    this.sim.hidden = !this.simOpen;
    this.root.querySelector('.card')?.setAttribute('data-expanded', String(this.simOpen));
    this.previewButton.textContent = this.simOpen ? '←' : 'Test position risk';
    this.previewButton.setAttribute('aria-label', this.simOpen ? 'Return to market overview' : 'Test position risk');
    this.previewButton.setAttribute('aria-expanded', String(this.simOpen));
    this.relayout();
    if (!this.simOpen) return;
    this.updateMetrics();
    if (!this.replayRequested) {
      this.replayRequested = true;
      this.requestReplay();
    }
    this.sizeInput.focus();
    this.relayout();
  }

  private requestReplay(): void {
    if (!this.snapshot) return;
    const sizeUsd = this.sizeUsd;
    const leverage = this.leverage;
    if (!isPositive(sizeUsd) || !isPositive(leverage)) {
      this.setReplay('error', undefined, 'enter a positive size and leverage');
      return;
    }
    const seq = ++this.replaySeq;
    this.setReplay('loading');
    this.handlers.onReplay({ sizeUsd, leverage, side: this.side, seq });
  }

  private markReplayStale(): void {
    this.acceptedReplay = null;
    this.replaySeq += 1;
    this.replay.setAttribute('aria-busy', 'false');
    this.replay.textContent = 'Inputs changed. Run the scenario again.';
    this.updateMetrics();
  }

  private syncSide(): void {
    for (const button of this.sideButtons) {
      button.setAttribute('aria-pressed', String(button.dataset.side === this.side));
    }
  }

  private updateMetrics(entryOverride?: string, sizeOverride?: string): void {
    if (!this.simOpen) return;
    const snapshot = this.snapshot;
    if (!snapshot) {
      this.metrics.innerHTML = '<dt>Position</dt><dd>Market data unavailable</dd>';
      return;
    }
    const entryPrice = entryOverride ?? this.acceptedReplay?.entryPrice ?? snapshot.markPrice;
    if (!isPositive(this.sizeUsd) || !isPositive(this.leverage)) {
      this.metrics.innerHTML = '<dt>Position</dt><dd class="error">Enter a positive size and leverage</dd>';
      return;
    }
    let summary: RiskSummary;
    try {
      summary = summarize({
        entryPrice,
        sizeUsd: sizeOverride ?? this.acceptedReplay?.replaySizeUsd ?? this.sizeUsd,
        leverage: this.leverage,
        side: this.side,
        tiers: snapshot.tiers,
        fundingRate: snapshot.fundingRate,
        takerFeeRate: TAKER_FEE_RATE,
      });
    } catch {
      this.metrics.innerHTML = '<dt>Position</dt><dd class="error">Cannot size this position</dd>';
      return;
    }
    const entry = new Decimal(entryPrice);
    const liq = summary.liquidationPrice ? new Decimal(summary.liquidationPrice) : null;
    const liqText = liq
      ? `${formatMarketMoney(liq.toString(), snapshot.quotePrecision)} (${signedPercent(liq.div(entry).minus(1).mul(100).toString())})`
      : 'No positive threshold in model';
    const funding = new Decimal(summary.fundingPerDay);
    const fundingText = funding.isNegative()
      ? `${money(funding.abs().toString(), 2)} paid`
      : `${money(funding.toString(), 2)} received`;
    this.metrics.innerHTML = `
      <dt>Est. liquidation</dt><dd>${liqText}</dd>
      <dt>Initial margin</dt><dd>${money(summary.initialMargin, 2)}</dd>
      <dt>Fee (taker)</dt><dd>${money(summary.fee, 2)}</dd>
      <dt>Funding / day</dt><dd>${fundingText}</dd>
    `;
    const note = this.metrics.parentElement?.querySelector<HTMLElement>('[data-note]');
    if (note) {
      const parts = ['Entry fee deducted from initial margin. Current funding is held constant.'];
      if (snapshot.tiersApproximate) parts.push('Margin tiers are approximate.');
      if (summary.leverageClamped) parts.push(`Leverage capped at ${summary.maxLeverage}x for this size.`);
      note.textContent = parts.join(' ');
    }
    this.relayout();
  }

  private relayout(): void {
    const rect = this.rect;
    if (!rect) return;
    requestAnimationFrame(() => {
      if (this.rect) this.position(this.rect);
    });
  }

  private position(rect: DOMRect): void {
    const width = Math.min(320, window.innerWidth - 24);
    const margin = 12;
    const height = this.host.getBoundingClientRect().height || 300;
    const maxLeft = Math.max(margin, window.innerWidth - width - margin);
    const left = Math.min(Math.max(rect.left, margin), maxLeft);
    const below = rect.bottom + 8;
    const above = rect.top - height - 8;
    const top = below + height <= window.innerHeight - margin ? below : Math.max(margin, above);
    this.host.style.left = `${left}px`;
    this.host.style.top = `${top}px`;
  }
}

function isPositive(value: string): boolean {
  try {
    const decimal = new Decimal(value);
    return decimal.isFinite() && decimal.gt(0);
  } catch {
    return false;
  }
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
}

function renderSparkline(points: number[]): SVGSVGElement {
  const width = 288;
  const height = 32;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'sparkline');
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('aria-hidden', 'true');
  const polyline = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
  polyline.setAttribute('fill', 'none');
  polyline.setAttribute('stroke', 'currentColor');
  polyline.setAttribute('stroke-width', '1.5');
  polyline.setAttribute('points', points.map((value, index) => {
    const x = (index / (points.length - 1)) * width;
    const y = height - ((value - min) / span) * height;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' '));
  svg.append(polyline);
  return svg;
}
