import Decimal from 'decimal.js';
import { APP_BASE, DISCLAIMER } from '../shared/constants';
import type { Side } from '../shared/types';
import type {
  ExtensionMessage,
  MarketResultV2,
  SimulatorResult,
} from '../shared/v2-types';
import { parseLeverage, parseSide, parseSize, parseTradeSymbol } from '../lib/ticket-reader';
import { DATA_LABEL, formatMarketMoney, MODEL_NOTE, REPLAY_NOTE, replayPresentation } from './presentation';
import simulatorCss from './simulator.css?inline';
import { brandMarkup } from './brand';

interface RawTicket {
  symbol: string | null;
  sizeValue: string;
  sizeUnit: 'USD' | 'BASE' | 'UNKNOWN';
  qtyValue: string;
  leverage: string | null;
  side: Side | null;
  marginMode: 'cross' | 'isolated' | null;
}

let mounted = false;
let hostEl: HTMLElement | null = null;

function send<T>(message: ExtensionMessage): Promise<T> {
  return chrome.runtime.sendMessage(message) as unknown as Promise<T>;
}

function money(value: string): string {
  return formatMarketMoney(value, 8);
}

function pct(value: string): string {
  try {
    const decimal = new Decimal(value);
    if (!decimal.isFinite()) return 'Unavailable';
    return `${decimal.gte(0) ? '+' : ''}${decimal.toFixed(2)}%`;
  } catch {
    return 'Unavailable';
  }
}

function formatTime(timestamp: number | null): string {
  if (!timestamp) return 'unknown';
  return new Date(timestamp).toLocaleString(undefined, {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
    timeZone: 'UTC', timeZoneName: 'short',
  });
}

function isPositive(value: string): boolean {
  try {
    const decimal = new Decimal(value);
    return decimal.isFinite() && decimal.gt(0);
  } catch {
    return false;
  }
}

function readOrderSizeDisplay(): string {
  const labels = document.querySelectorAll<HTMLElement>('div, span, p, dt, dd');
  for (const label of labels) {
    if (label.children.length > 0) continue;
    if (!/^Order Size$/i.test((label.textContent ?? '').trim())) continue;
    const sibling = label.nextElementSibling?.textContent?.trim();
    if (sibling && sibling !== '-') return sibling;
    const parentNext = label.parentElement?.nextElementSibling?.textContent?.trim();
    if (parentNext && parentNext !== '-') return parentNext;
  }
  return '';
}

function readTicket(): RawTicket {
  const symbol = parseTradeSymbol(location.pathname);
  const base = symbol?.replace(/-USD$/, '') ?? '';
  const sizeElement = document.querySelector('#collateral-amount, input[aria-label="Size"]');
  const sizeInput = sizeElement instanceof HTMLInputElement ? sizeElement : null;
  const sizeFromInput = sizeInput?.value.trim() ?? '';
  const sizeFromDisplay = readOrderSizeDisplay();
  const sizeValue = sizeFromInput || sizeFromDisplay;
  const suffix = (sizeInput?.parentElement?.textContent ?? '').toUpperCase();
  const sizeUnit: RawTicket['sizeUnit'] = sizeFromInput
    ? suffix.includes('USD')
      ? 'USD'
      : base && suffix.includes(base)
        ? 'BASE'
        : 'UNKNOWN'
    : sizeFromDisplay
      ? 'USD'
      : 'UNKNOWN';
  const qtyValue = document.querySelector<HTMLInputElement>('input[aria-label="Market order quantity"]')?.value.trim() ?? '';
  const leverageElement = document.querySelector<HTMLElement>('[data-tutorial="leverage"]');
  const leverageText = leverageElement?.textContent ?? '';
  const ticketRoot = leverageElement?.closest<HTMLElement>('.space-y-3') ?? document;
  const longButton = [...ticketRoot.querySelectorAll<HTMLButtonElement>('button')]
    .find((button) => /Long\/Buy/i.test(button.textContent ?? ''));
  const shortButton = [...ticketRoot.querySelectorAll<HTMLButtonElement>('button')]
    .find((button) => /Short\/Sell/i.test(button.textContent ?? ''));
  const side = longButton && shortButton ? parseSide(longButton.className, shortButton.className) : null;
  const marginText = (document.querySelector<HTMLElement>('[data-tutorial="margin-mode"]')?.textContent ?? '').toLowerCase();
  const marginMode = marginText.includes('isolated') ? 'isolated' : marginText.includes('cross') ? 'cross' : null;
  return { symbol, sizeValue, sizeUnit, qtyValue, leverage: parseLeverage(leverageText), side, marginMode };
}

function row(label: string, value: string): HTMLDivElement {
  const element = document.createElement('div');
  element.className = 'row';
  const key = document.createElement('span');
  key.textContent = label;
  const val = document.createElement('strong');
  val.textContent = value;
  element.append(key, val);
  return element;
}

export function mountSimulator(): void {
  if (mounted) return;
  mounted = true;

  const host = document.createElement('div');
  host.dataset.strikeSimulator = 'true';
  host.style.cssText = 'position:fixed;inset:0;z-index:2147483647;pointer-events:none;';
  const root = host.attachShadow({ mode: 'closed' });
  const style = document.createElement('style');
  style.textContent = simulatorCss;
  root.append(style);

  const wrap = document.createElement('div');
  wrap.className = 'host';
  wrap.innerHTML = `
    <button class="fab" type="button" data-fab aria-expanded="false" aria-controls="risk-panel">Test position risk</button>
    <section class="panel" id="risk-panel" data-panel role="dialog" aria-label="Strike stress test" hidden>
      <header>
        ${brandMarkup()}
        <button class="close" type="button" data-close aria-label="Close">×</button>
      </header>
      <div class="panel-body">
      <div class="market-heading"><div><span class="symbol" data-symbol>Strike</span><div class="market-type">USD perpetual</div></div><span class="source">${DATA_LABEL}</span></div>
      <h2>Position stress test</h2>
      <p class="intro">A historical scenario for the position you're considering.</p>
      <p class="assumptions">Public market data; estimated fills can differ from execution.</p>
      <div class="status" data-status role="status" aria-live="polite"></div>
      <div class="form-heading"><h3>Your position</h3><button class="quiet" type="button" data-refresh>Read from form ↻</button></div>
      <div class="form">
        <label>Size (USD)<input data-size inputmode="decimal" placeholder="5000" /></label>
        <label>Leverage<input data-leverage inputmode="decimal" placeholder="10" /></label>
        <label>Side<select data-side><option value="long">Long</option><option value="short">Short</option></select></label>
        <label>Margin<select data-margin><option value="cross">Cross</option><option value="isolated">Isolated</option></select></label>
      </div>
      <button class="primary" type="button" data-run>Run 30-day replay</button>
      <div class="result" data-result aria-live="polite"></div>
      <p class="estimate">${MODEL_NOTE}</p>
      <details class="model-assumptions"><summary>Model assumptions</summary><p class="note">${REPLAY_NOTE} Results describe one cross-margin position.</p></details>
      </div>
      <footer>Execution stays on Strike. ${DISCLAIMER}</footer>
    </section>
  `;
  root.append(wrap);

  const q = <T extends Element>(selector: string): T => {
    const element = wrap.querySelector<T>(selector);
    if (!element) throw new Error(`Missing simulator element: ${selector}`);
    return element;
  };

  const fab = q<HTMLButtonElement>('[data-fab]');
  const panel = q<HTMLElement>('[data-panel]');
  const symbolEl = q<HTMLElement>('[data-symbol]');
  const statusEl = q<HTMLElement>('[data-status]');
  const sizeInput = q<HTMLInputElement>('[data-size]');
  const leverageInput = q<HTMLInputElement>('[data-leverage]');
  const sideSelect = q<HTMLSelectElement>('[data-side]');
  const marginSelect = q<HTMLSelectElement>('[data-margin]');
  const runButton = q<HTMLButtonElement>('[data-run]');
  const refreshButton = q<HTMLButtonElement>('[data-refresh]');
  const resultEl = q<HTMLElement>('[data-result]');
  const closeButton = q<HTMLButtonElement>('[data-close]');

  let currentSymbol: string | null = null;
  let revision = 0;
  const isCurrent = (seq: number): boolean => seq === revision && host.isConnected && !panel.hidden;

  const setStatus = (text: string, isError = false): void => {
    statusEl.textContent = text;
    statusEl.className = isError ? 'status error' : 'status';
  };

  const openPanel = (): void => {
    panel.hidden = false;
    fab.setAttribute('aria-expanded', 'true');
    requestAnimationFrame(() => panel.classList.add('open'));
    closeButton.focus();
  };

  const closePanel = (): void => {
    panel.classList.remove('open');
    panel.hidden = true;
    revision += 1;
    runButton.disabled = false;
    fab.setAttribute('aria-expanded', 'false');
    fab.focus();
  };

  const renderResult = (result: SimulatorResult, symbol: string): void => {
    resultEl.replaceChildren();
    const heading = document.createElement('div');
    heading.className = 'result-top';
    const kind = document.createElement('span');
    kind.textContent = 'Experimental replay';
    const duration = document.createElement('span');
    duration.textContent = '30 days';
    heading.append(kind, duration);
    const verdict = document.createElement('div');
    verdict.className = `verdict ${result.replay.status === 'survived' ? 'good' : 'bad'}`;
    const presentation = replayPresentation(result.replay);
    verdict.textContent = presentation.headline;
    const qualification = document.createElement('p');
    qualification.className = 'result-qualification';
    qualification.textContent = 'Not validated against live positions.';
    resultEl.append(heading, verdict, qualification);
    if (result.replay.candles !== 43_200) return;
    const impact = row('Worst adverse move', pct(result.replay.worstDrawdownPct));
    impact.classList.add('impact-row');
    resultEl.append(impact);
    const execution = document.createElement('details');
    execution.className = 'execution-details';
    const executionLabel = document.createElement('summary');
    executionLabel.textContent = 'Execution & market details';
    execution.append(executionLabel);
    execution.append(row('History', '43,200 completed mark minutes'));
    if (result.replay.firstLiquidationAt !== null) resultEl.append(row('Scenario event', formatTime(result.replay.firstLiquidationAt)));
    execution.append(row('Mark', money(result.markPrice)));
    execution.append(row('Entry', `${money(result.replay.entryPrice)} (${result.replay.entrySource})`));
    if (result.replay.slippage) {
      execution.append(row('Slippage', `${new Decimal(result.replay.slippage.slippageBps).toFixed(1)} bps`));
    }
    if (result.replay.replaySizeUsd !== result.replay.requestedSizeUsd) {
      const fill = document.createElement('p');
      fill.className = 'fill-note';
      fill.textContent = `Partial fill: ${money(result.replay.replaySizeUsd)} of ${money(result.replay.requestedSizeUsd)} tested.`;
      resultEl.append(fill);
    }
    const extras = result.extras;
    if (extras && extras.spread !== null && extras.spreadBps !== null) {
      execution.append(row('Spread', `${money(extras.spread)} (${new Decimal(extras.spreadBps).toFixed(1)} bps)`));
    }
    if (extras && extras.basisPct !== null) {
      execution.append(row('Basis', pct(extras.basisPct)));
    }
    if (extras && extras.volatilityPct !== null) {
      execution.append(row('Avg daily range', pct(extras.volatilityPct)));
    }
    resultEl.append(row('Est. liquidation', result.summary.liquidationPrice ? money(result.summary.liquidationPrice) : 'No positive threshold in model'));
    resultEl.append(row('Initial margin', money(result.summary.initialMargin)));
    resultEl.append(row('Fee (taker)', money(result.summary.fee)));
    const funding = new Decimal(result.summary.fundingPerDay);
    resultEl.append(row('Funding / day', `${money(funding.abs().toString())} ${funding.isNegative() ? 'paid' : 'received'}`));
    execution.append(row('Events', String(result.replay.events.length)));
    const baseAsset = symbol.replace(/-USD$/, '');
    execution.append(row('Remaining size', `${result.replay.remainingSize}${baseAsset ? ` ${baseAsset}` : ''}`));
    if (result.marginMode === 'isolated') {
      const note = document.createElement('div');
      note.className = 'note';
      note.textContent = 'Simulator assumes cross margin; isolated results may differ.';
      resultEl.append(note);
    }
    if (result.tiersApproximate) {
      const note = document.createElement('div');
      note.className = 'note';
      note.textContent = 'Margin tiers are approximate.';
      resultEl.append(note);
    }
    if (result.summary.leverageClamped) {
      const note = document.createElement('div');
      note.className = 'note';
      note.textContent = `Leverage capped at ${result.summary.maxLeverage}x for this size.`;
      resultEl.append(note);
    }
    if (extras) {
      const provenance = document.createElement('div');
      provenance.className = 'note';
      provenance.textContent = `Snapshot · ${new Date(extras.fetchedAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`;
      execution.append(provenance);
    }
    resultEl.append(execution);
    const link = document.createElement('a');
    link.className = 'link';
    link.href = `${APP_BASE}/trade/${baseAsset.toLowerCase()}`;
    link.target = '_blank';
    link.rel = 'noreferrer';
    link.textContent = 'Open mainnet market on Strike ↗';
    resultEl.append(link);
  };

  const run = async (allowFetch: boolean): Promise<void> => {
    const seq = ++revision;
    if (!currentSymbol) {
      setStatus('Open a Strike market first.', true);
      return;
    }
    const symbol = currentSymbol;
    const sizeUsd = sizeInput.value.trim();
    const leverage = leverageInput.value.trim();
    if (!isPositive(sizeUsd) || !isPositive(leverage)) {
      setStatus('Enter a positive size and leverage.', true);
      return;
    }
    const side: Side = sideSelect.value === 'short' ? 'short' : 'long';
    const marginMode = marginSelect.value === 'isolated' ? 'isolated' : 'cross';
    resultEl.replaceChildren();
    setStatus(allowFetch ? 'Running 30-day replay…' : 'Checking cache…');
    runButton.disabled = true;
    resultEl.setAttribute('aria-busy', 'true');
    try {
      const result = await send<SimulatorResult | { needsFetch: true } | { error: string }>({
        type: 'simulate:run',
        symbol,
        sizeUsd,
        leverage,
        side,
        marginMode,
        allowFetch,
      });
      if (!isCurrent(seq) || parseTradeSymbol(location.pathname) !== symbol) return;
      if ('needsFetch' in result) {
        setStatus('First run needs 30 days of candles. Click Run 30-day replay.');
        return;
      }
      if ('error' in result) {
        setStatus(result.error, true);
        return;
      }
      renderResult(result, symbol);
      setStatus('');
    } catch (error) {
      if (isCurrent(seq) && currentSymbol === symbol) {
        setStatus(error instanceof Error ? error.message : 'Simulation failed', true);
      }
    } finally {
      if (seq === revision) {
        runButton.disabled = false;
        resultEl.setAttribute('aria-busy', 'false');
      }
    }
  };

  const syncFromForm = async (): Promise<void> => {
    const seq = ++revision;
    runButton.disabled = false;
    resultEl.replaceChildren();
    sizeInput.value = '';
    leverageInput.value = '';
    sideSelect.value = 'long';
    marginSelect.value = 'cross';
    const ticket = readTicket();
    if (!ticket.symbol) {
      currentSymbol = null;
      symbolEl.textContent = 'No market';
      openPanel();
      setStatus('Open a Strike market first.', true);
      return;
    }
    currentSymbol = ticket.symbol;
    symbolEl.textContent = ticket.symbol;
    openPanel();
    setStatus('Reading the order ticket…');
    let markPrice = '';
    try {
      const market = await send<MarketResultV2>({ type: 'market:get', symbol: ticket.symbol });
      markPrice = market.snapshot?.markPrice ?? '';
    } catch {
      markPrice = '';
    }
    if (!isCurrent(seq)) return;
    if (ticket.sizeValue && ticket.sizeUnit !== 'UNKNOWN') {
      const usd = parseSize(ticket.sizeValue, ticket.sizeUnit === 'BASE' ? 'BASE' : 'USD', markPrice);
      if (usd) sizeInput.value = new Decimal(usd).toFixed(2, Decimal.ROUND_HALF_UP);
    } else if (ticket.qtyValue && markPrice) {
      const usd = parseSize(ticket.qtyValue, 'BASE', markPrice);
      if (usd) sizeInput.value = new Decimal(usd).toFixed(2, Decimal.ROUND_HALF_UP);
    }
    if (ticket.leverage) leverageInput.value = ticket.leverage;
    if (ticket.side) sideSelect.value = ticket.side;
    if (ticket.marginMode) marginSelect.value = ticket.marginMode;
    if (isPositive(sizeInput.value) && isPositive(leverageInput.value)) {
      await run(false);
    } else {
      setStatus('Enter a positive size and leverage.', true);
    }
  };

  fab.addEventListener('click', () => void syncFromForm());
  refreshButton.addEventListener('click', () => void syncFromForm());
  runButton.addEventListener('click', () => void run(true));
  for (const input of [sizeInput, leverageInput, sideSelect, marginSelect]) {
    input.addEventListener('input', () => {
      revision += 1;
      resultEl.replaceChildren();
      resultEl.setAttribute('aria-busy', 'false');
      runButton.disabled = false;
      setStatus('Inputs changed. Run the scenario again.');
    });
  }
  closeButton.addEventListener('click', closePanel);
  host.addEventListener('click', (event) => event.stopPropagation());
  host.addEventListener('keydown', (event: KeyboardEvent) => {
    if (event.key === 'Escape') closePanel();
    event.stopPropagation();
  });

  hostEl = host;
  document.documentElement.append(host);
}

export function unmountSimulator(): void {
  hostEl?.remove();
  hostEl = null;
  mounted = false;
}
