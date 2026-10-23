import Decimal from 'decimal.js';
import type { SymbolEntry, SymbolRegistry } from '../shared/types';
import type {
  AiProvider,
  CapturedClaim,
  ClaimAnalysis,
  ClaimDirection,
  ClaimTestability,
  ClosePreview,
  GhostMessage,
  GhostResult,
  GhostRuntimeEvent,
  KeyStatus,
  PreviewResult,
  PreviewTradeInput,
  TradeDetail,
  TradeEvent,
  TradeListItem,
  TradeReceipt,
} from '../shared/ghost-types';
import { freshnessLabel } from '../ghost/freshness';

type Tab = 'discover' | 'markets' | 'trades' | 'receipts' | 'settings';

const byId = <T extends HTMLElement>(id: string): T => {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing #${id}`);
  return element as T;
};

function node<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function clear(element: HTMLElement): void {
  element.replaceChildren();
}

function formatDecimal(value: string, digits: number): string {
  try {
    const decimal = new Decimal(value);
    if (!decimal.isFinite()) return 'Unavailable';
    return decimal.toFixed(digits);
  } catch {
    return 'Unavailable';
  }
}

function usd(value: string, digits = 2): string {
  const text = formatDecimal(value, digits);
  if (text === 'Unavailable') return text;
  const negative = text.startsWith('-');
  const [whole, fraction] = (negative ? text.slice(1) : text).split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${negative ? '-' : ''}$${grouped}${fraction ? `.${fraction}` : ''}`;
}

function price(value: string): string {
  let digits = 2;
  try {
    const decimal = new Decimal(value).abs();
    if (decimal.lt(1)) digits = decimal.lt('0.01') ? 8 : 6;
    else if (decimal.lt(1000)) digits = 4;
  } catch {
    return 'Unavailable';
  }
  return usd(value, digits);
}

function quantity(value: string): string {
  return formatDecimal(value, 8).replace(/\.?0+$/, '') || '0';
}

function signedUsd(value: string, digits = 2): string {
  let positive = false;
  try {
    positive = new Decimal(value).gt(0);
  } catch {
    return 'Unavailable';
  }
  return `${positive ? '+' : ''}${usd(value, digits)}`;
}

function percentFromRate(rate: string): string {
  try {
    return `${new Decimal(rate).mul(100).toFixed(2)}%`;
  } catch {
    return 'Unavailable';
  }
}

function time(ms: number | null): string {
  return typeof ms === 'number' ? new Date(ms).toLocaleString() : 'Unavailable';
}

function timeShort(ms: number | null): string {
  return typeof ms === 'number' ? new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—';
}

function baseAsset(symbol: string): string {
  return symbol.replace(/-USD$/, '');
}

const PROVIDER_LABEL: Record<AiProvider, string> = {
  typesafe: 'Jev',
  openrouter: 'OpenRouter',
};

const PROVIDER_PERMISSION: Record<AiProvider, string> = {
  typesafe: 'https://api.typesafe.ai/*',
  openrouter: 'https://openrouter.ai/*',
};

const DIRECTION_BADGE: Record<ClaimDirection, string> = {
  bullish: 'Bullish',
  bearish: 'Bearish',
  neutral: 'Neutral',
  ambiguous: 'Ambiguous',
  non_trading: 'Not a market claim',
};

const TESTABILITY_BADGE: Record<ClaimTestability, string> = {
  testable: 'Testable',
  partially_specified: 'Partly specified',
  not_testable: 'Not testable',
};

function providerLabel(provider: AiProvider | null): string {
  return provider ? PROVIDER_LABEL[provider] : 'AI';
}

function messageOf(error: unknown): string {
  return error instanceof Error && error.message.trim() ? error.message : 'Request failed. Please try again.';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isRuntimeEvent(value: unknown): value is GhostRuntimeEvent {
  return isRecord(value) && (value.type === 'claim:captured' || value.type === 'claim:error');
}

async function sendGhost<T>(message: GhostMessage): Promise<T> {
  const response = await chrome.runtime.sendMessage(message) as GhostResult<T> | undefined;
  if (!response) throw new Error('The extension worker did not respond. Reload the extension.');
  if (!response.ok) throw new Error(response.error.message);
  return response.value;
}

const claimCard = byId<HTMLElement>('claim-card');
const claimTitle = byId<HTMLHeadingElement>('claim-title');
const claimStatus = byId<HTMLParagraphElement>('claim-status');
const utilityMenu = byId<HTMLDetailsElement>('utility-menu');
const utilityToggle = utilityMenu.querySelector('summary');
const claimSource = byId<HTMLSpanElement>('claim-source');
const claimTime = byId<HTMLTimeElement>('claim-time');
const claimText = byId<HTMLElement>('claim-text');
const claimCandidates = byId<HTMLDivElement>('claim-candidates');
const jevStatus = byId<HTMLParagraphElement>('jev-status');
const jevResult = byId<HTMLDivElement>('jev-result');
const jevConsent = byId<HTMLInputElement>('jev-consent');
const jevAnalyze = byId<HTMLButtonElement>('jev-analyze');
const form = byId<HTMLFormElement>('ghost-form');
const marketSelect = byId<HTMLSelectElement>('market-select');
const inputMode = byId<HTMLSelectElement>('input-mode');
const amount = byId<HTMLInputElement>('amount');
const amountLabel = byId<HTMLLabelElement>('amount-label');
const leverage = byId<HTMLInputElement>('leverage');
const fee = byId<HTMLInputElement>('fee');
const previewButton = byId<HTMLButtonElement>('preview');
const previewResult = byId<HTMLDivElement>('preview-result');
const createButton = byId<HTMLButtonElement>('create-trade');
const formError = byId<HTMLParagraphElement>('form-error');
const tradeList = byId<HTMLDivElement>('trade-list');
const tradeDetail = byId<HTMLDivElement>('trade-detail');
const receiptList = byId<HTMLDivElement>('receipt-list');
const receiptDetail = byId<HTMLDivElement>('receipt-detail');
const tradesRefresh = byId<HTMLButtonElement>('trades-refresh');
const keyStatus = byId<HTMLParagraphElement>('jev-key-status');
const keyInput = byId<HTMLInputElement>('jev-key');
const keySave = byId<HTMLButtonElement>('jev-key-save');
const keyClear = byId<HTMLButtonElement>('jev-key-clear');
const keyError = byId<HTMLParagraphElement>('key-error');
const aiProvider = byId<HTMLSelectElement>('ai-provider');
const aiModel = byId<HTMLInputElement>('ai-model');
const aiModelField = byId<HTMLDivElement>('ai-model-field');
const aiKeyHint = byId<HTMLParagraphElement>('ai-key-hint');

let claim: CapturedClaim | null = null;
let entries: SymbolEntry[] = [];
let preview: PreviewResult | null = null;
let previewRequest: PreviewTradeInput | null = null;
let previewClaimId: string | null = null;
let previewToken = 0;
let createRequestId: string | null = null;
let keyConfigured = false;
let keyProvider: AiProvider = 'typesafe';
let busy = false;
let jevPending = false;
let claimToken = 0;
let activeTrade: TradeDetail | null = null;
let closePreview: ClosePreview | null = null;
let freshnessTimer: number | undefined;

function selectedProvider(): AiProvider {
  return aiProvider.value === 'openrouter' ? 'openrouter' : 'typesafe';
}

function syncProviderFields(): void {
  const provider = selectedProvider();
  aiModelField.hidden = provider !== 'openrouter';
  aiKeyHint.textContent = provider === 'openrouter'
    ? 'Use jev-latest for Jev decisions through OpenRouter. Chat model IDs use JSON classification instead. The key goes only to openrouter.ai.'
    : 'Jev uses TypeSafe\'s fixed structured classifier. The key goes only to api.typesafe.ai.';
}

function providerReady(): boolean {
  return keyConfigured && keyProvider === selectedProvider();
}

function showBanner(text: string, tone: 'info' | 'error' = 'info'): void {
  const message = text.trim();
  claimStatus.hidden = !message;
  claimStatus.textContent = message;
  claimStatus.className = `banner ${tone}`;
}

function showTab(tab: Tab, focusTab = true): void {
  utilityMenu.open = false;
  for (const section of document.querySelectorAll<HTMLElement>('.view')) {
    section.hidden = section.id !== `view-${tab}`;
  }
  let active: HTMLButtonElement | null = null;
  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-tab]')) {
    if (button.dataset.tab === tab) {
      button.setAttribute('aria-current', 'page');
      active = button;
    } else {
      button.removeAttribute('aria-current');
    }
  }
  const focusTarget = active?.closest('.utility-menu') ? utilityToggle : active;
  if (focusTab && focusTarget && document.activeElement !== focusTarget) focusTarget.focus();
  if (tab === 'trades') {
    if (activeTrade) startFreshnessTimer(activeTrade.trade);
    void loadTrades();
  } else {
    stopFreshnessTimer();
  }
  if (tab === 'receipts') void loadReceipts();
}

function candidateChip(entry: SymbolEntry): HTMLButtonElement {
  const chip = node('button', 'chip', entry.baseAsset);
  chip.type = 'button';
  chip.setAttribute('aria-pressed', String(marketSelect.value === entry.symbol));
  chip.addEventListener('click', () => {
    marketSelect.value = entry.symbol;
    invalidatePreview();
    renderCandidates();
  });
  return chip;
}

function renderCandidates(): void {
  if (!claim) {
    clear(claimCandidates);
    return;
  }
  const mapped = claim.candidateSymbols
    .map((symbol) => entries.find((entry) => entry.symbol === symbol))
    .filter((entry): entry is SymbolEntry => Boolean(entry));
  clear(claimCandidates);
  if (mapped.length === 0) {
    const note = node('p', 'hint', 'No verified market was detected. Choose one manually below.');
    claimCandidates.append(note);
    return;
  }
  for (const entry of mapped) claimCandidates.append(candidateChip(entry));
}

function setSuggestedSetup(symbol: string, direction: ClaimDirection | null): void {
  marketSelect.value = symbol;
  const side = direction === 'bullish' ? 'long' : direction === 'bearish' ? 'short' : null;
  if (side) {
    const input = form.querySelector<HTMLInputElement>(`input[name="side"][value="${side}"]`);
    if (input) input.checked = true;
  }
  invalidatePreview();
  renderCandidates();
  marketSelect.focus();
}

function renderAnalysis(analysis: ClaimAnalysis): void {
  clear(jevResult);
  jevResult.hidden = false;
  if (analysis.status === 'ready') {
    const head = node('div', 'jev-verdict');
    if (analysis.direction) head.append(node('span', `jev-badge ${analysis.direction}`, DIRECTION_BADGE[analysis.direction]));
    if (analysis.testability) head.append(node('span', `jev-badge ${analysis.testability}`, TESTABILITY_BADGE[analysis.testability]));
    jevResult.append(head, node('p', 'jev-summary', analysis.summary ?? 'Structured AI result.'));
    if (analysis.suggestedSymbols.length > 0) {
      const action = analysis.direction === 'bullish' ? 'Long' : analysis.direction === 'bearish' ? 'Short' : 'Use';
      const chips = node('div', 'chips');
      for (const symbol of analysis.suggestedSymbols) {
        const chip = node('button', 'chip', `${action} ${baseAsset(symbol)}`);
        chip.type = 'button';
        chip.title = action === 'Use' ? `Select ${symbol}` : `Select ${symbol} and ${action}`;
        chip.addEventListener('click', () => setSuggestedSetup(symbol, analysis.direction));
        chips.append(chip);
      }
      jevResult.append(node('p', 'jev-label', action === 'Use' ? 'Related market' : 'Suggested setup'), chips);
    } else {
      const detected = (claim?.candidateSymbols ?? []).filter((symbol) => entries.some((entry) => entry.symbol === symbol));
      if (detected.length > 0) {
        jevResult.append(node('p', 'hint', `Detected market: ${detected.map(baseAsset).join(', ')}. The AI did not select a market; the verified candidates remain available above.`));
      } else {
        jevResult.append(node('p', 'hint', 'No market candidate was detected in the selected text. Choose a market manually below.'));
      }
    }
    if (analysis.direction === 'non_trading') {
      jevResult.append(node('p', 'hint', 'Select a complete sentence expressing a market view; an asset name alone is not a prediction.'));
    } else if (analysis.testability === 'partially_specified') {
      jevResult.append(node('p', 'hint', 'Choose a time window and an observable price outcome before treating this as a testable prediction.'));
    }
    const source = `${providerLabel(analysis.provider)}${analysis.model ? ` · ${analysis.model}` : ''}`;
    jevResult.append(node('p', 'jev-meta', `${source}${analysis.analyzedAt ? ` · ${timeShort(analysis.analyzedAt)}` : ''}`));
    return;
  }
  if (analysis.status === 'failed') {
    const copy = analysis.errorCode === 'KEY_MISSING'
      ? 'The provider rejected the saved key. Clear it in Settings and save a valid key.'
      : analysis.errorCode === 'PERMISSION_DENIED'
        ? 'The provider denied the request. Check provider access, or continue manually.'
        : 'AI analysis is unavailable. Choose the market and direction manually.';
    jevResult.append(node('p', 'error', copy));
  }
}

function updateJevUi(): void {
  const provider = selectedProvider();
  const ready = providerReady();
  keyStatus.textContent = keyConfigured
    ? keyProvider === provider
      ? `${PROVIDER_LABEL[keyProvider]} key saved on this device. It is never shown again.`
      : `Saved key is for ${PROVIDER_LABEL[keyProvider]}, not ${PROVIDER_LABEL[provider]}. Save a ${PROVIDER_LABEL[provider]} key below.`
    : `No ${PROVIDER_LABEL[provider]} key configured. Manual trades work without it.`;
  jevAnalyze.disabled = busy || jevPending || !claim || !ready || !jevConsent.checked;
  jevAnalyze.textContent = jevPending
    ? 'Analyzing…'
    : claim?.analysis?.status === 'ready'
      ? `Re-analyze with ${PROVIDER_LABEL[provider]}`
      : `Analyze with ${PROVIDER_LABEL[provider]}`;
  jevAnalyze.setAttribute('aria-busy', String(jevPending));
  if (jevPending) {
    jevStatus.textContent = `Analyzing with ${PROVIDER_LABEL[provider]}…`;
    jevResult.hidden = true;
    return;
  }
  if (!claim) {
    jevStatus.textContent = `Capture a claim to enable ${PROVIDER_LABEL[provider]} analysis. Manual trades work without it.`;
    jevResult.hidden = true;
    return;
  }
  if (!ready) {
    jevStatus.textContent = keyConfigured
      ? `The saved key is for ${PROVIDER_LABEL[keyProvider]}. Save a ${PROVIDER_LABEL[provider]} key in Settings, or continue manually.`
      : `No ${PROVIDER_LABEL[provider]} key is configured. Add one in Settings, or continue manually.`;
    jevResult.hidden = true;
    return;
  }
  const analysis = claim.analysis;
  if (analysis.status === 'pending') {
    jevStatus.textContent = `Analyzing with ${PROVIDER_LABEL[provider]}…`;
    jevResult.hidden = true;
    return;
  }
  if (analysis.status === 'ready' && analysis.provider === provider) {
    jevStatus.textContent = 'AI result ready. It is a suggestion, not a trade instruction.';
    renderAnalysis(analysis);
    return;
  }
  if (analysis.status === 'ready') {
    jevStatus.textContent = `This result came from ${providerLabel(analysis.provider)}. Re-analyze with ${PROVIDER_LABEL[provider]} or switch provider.`;
    jevResult.hidden = true;
    return;
  }
  if (analysis.status === 'missing_key') {
    jevStatus.textContent = 'A key is configured now. Press Analyze to classify this claim.';
    jevResult.hidden = true;
    return;
  }
  if (analysis.status === 'failed' && analysis.errorCode === 'KEY_MISSING') {
    jevStatus.textContent = 'A key is configured now. Press Analyze to retry this claim.';
    jevResult.hidden = true;
    return;
  }
  if (analysis.status === 'failed') {
    jevStatus.textContent = 'AI analysis could not classify this claim. The manual flow is still available.';
    renderAnalysis(analysis);
    return;
  }
  jevStatus.textContent = jevConsent.checked
    ? `Ready. ${PROVIDER_LABEL[provider]} will classify the claim and match a verified Strike market.`
    : 'Tick the consent box to enable AI analysis.';
  jevResult.hidden = true;
}

function showClaim(next: CapturedClaim, focus = false): void {
  claim = next;
  invalidatePreview();
  claimCard.hidden = false;
  claimSource.textContent = next.sourceDomain;
  claimTime.textContent = time(next.capturedAt);
  claimTime.dateTime = new Date(next.capturedAt).toISOString();
  claimText.textContent = next.text;
  if (next.candidateSymbols[0]) marketSelect.value = next.candidateSymbols[0];
  renderCandidates();
  updateJevUi();
  if (focus) {
    showTab('discover', false);
    claimTitle.focus();
  }
}

function invalidatePreview(): void {
  previewToken += 1;
  preview = null;
  previewRequest = null;
  previewClaimId = null;
  createRequestId = null;
  previewResult.hidden = true;
  clear(previewResult);
  createButton.hidden = true;
  createButton.disabled = false;
  formError.hidden = true;
}

function readForm(): GhostMessage {
  const selectedSide = document.querySelector<HTMLInputElement>('input[name="side"]:checked')?.value;
  if (selectedSide !== 'long' && selectedSide !== 'short') throw new Error('Choose Long or Short.');
  const feePercent = new Decimal(fee.value.trim() || '0');
  if (!feePercent.isFinite() || feePercent.lt(0) || feePercent.gt(1)) {
    throw new Error('Fee assumption must be between 0% and 1% per side.');
  }
  const leverageValue = Number(leverage.value);
  if (!Number.isSafeInteger(leverageValue) || leverageValue < 1 || leverageValue > 100) {
    throw new Error('Leverage must be a whole number from 1 to 100.');
  }
  const normalizedAmount = amount.value.replace(/,/g, '').trim();
  if (!normalizedAmount) throw new Error('Enter an amount.');
  return {
    type: 'ghost:preview',
    symbol: marketSelect.value,
    side: selectedSide,
    inputMode: inputMode.value === 'notional' ? 'notional' : 'collateral',
    amount: normalizedAmount,
    leverage: leverageValue,
    feeRate: feePercent.div(100).toString(),
  };
}

function kvRow(term: string, value: string, tone = '', freshness = false): HTMLElement {
  const row = node('div', `kv-row ${tone}`.trim());
  const detail = node('dd', undefined, value);
  if (freshness) detail.dataset.freshness = 'true';
  row.append(node('dt', undefined, term), detail);
  return row;
}

function renderPreview(result: PreviewResult): void {
  clear(previewResult);
  previewResult.hidden = false;
  const list = node('dl', 'kv');
  list.append(
    kvRow('Market', `${baseAsset(result.symbol)} · ${result.quoteAsset}`),
    kvRow('Entry VWAP', price(result.entryPrice)),
    kvRow('Quantity', quantity(result.quantity)),
    kvRow('Filled notional', usd(result.filledNotional)),
    kvRow('Best bid / ask', `${price(result.bestBid)} / ${price(result.bestAsk)}`),
    kvRow('Quote impact', `${formatDecimal(result.impactPct, 4)}%`),
    kvRow('Allocated collateral', usd(result.allocatedCollateral)),
    kvRow('Entry fee', usd(result.entryFee)),
    kvRow('Estimated exit fee at mark', usd(result.estimatedExitFee)),
    kvRow('Gross PnL at mark', signedUsd(result.grossPnlAtMark, 4), new Decimal(result.grossPnlAtMark).gte(0) ? 'up' : 'down'),
    kvRow('Estimated net at mark (before funding)', signedUsd(result.netAtEntry), new Decimal(result.netAtEntry).gte(0) ? 'up' : 'down'),
  );
  const times = node('p', 'hint', `Mark source: ${time(result.markSourceTime)} · Book source: ${time(result.bookSourceTime)} · Valuation basis: current mark, not an executable close.`);
  const limits = node('ul', 'limits');
  for (const limitation of result.limitations) limits.append(node('li', undefined, limitation));
  previewResult.append(node('h3', undefined, 'Fill preview'), list, times, limits);
  createButton.hidden = false;
  createButton.disabled = false;
}

async function runPreview(): Promise<void> {
  if (busy) return;
  invalidatePreview();
  const token = previewToken;
  busy = true;
  previewButton.disabled = true;
  previewButton.textContent = 'Reviewing…';
  try {
    const message = readForm();
    if (message.type !== 'ghost:preview') return;
    const result = await sendGhost<PreviewResult>(message);
    if (token !== previewToken) return;
    preview = result;
    previewRequest = {
      symbol: message.symbol,
      side: message.side,
      inputMode: message.inputMode,
      amount: message.amount,
      leverage: message.leverage,
      feeRate: message.feeRate,
    };
    previewClaimId = claim?.id ?? null;
    createRequestId = crypto.randomUUID();
    renderPreview(preview);
  } catch (error) {
    formError.hidden = false;
    formError.textContent = messageOf(error);
  } finally {
    busy = false;
    previewButton.disabled = false;
    previewButton.textContent = 'Review simulation';
    updateJevUi();
  }
}

async function createTrade(): Promise<void> {
  if (busy || !preview || !previewRequest || !createRequestId) return;
  busy = true;
  createButton.disabled = true;
  createButton.textContent = 'Creating…';
  try {
    const detail = await sendGhost<TradeDetail>({
      ...previewRequest,
      type: 'ghost:create',
      requestId: createRequestId,
      claimId: previewClaimId ?? undefined,
    });
    showTab('trades');
    renderTradeDetail(detail);
    showBanner('Virtual trade created locally. No real order was placed.', 'info');
    invalidatePreview();
  } catch (error) {
    formError.hidden = false;
    formError.textContent = messageOf(error);
  } finally {
    busy = false;
    createButton.disabled = false;
    createButton.textContent = 'Create virtual trade';
    updateJevUi();
  }
}

function statusLabel(status: TradeDetail['trade']['status']): string {
  if (status === 'closed') return 'Closed';
  if (status === 'pending_exit') return 'Closing';
  if (status === 'unresolved') return 'Unresolved';
  return 'Open';
}

function freshnessText(trade: TradeDetail['trade']): string {
  return freshnessLabel({
    status: trade.status,
    sourceTime: trade.latestObservation?.sourceTime ?? null,
    observedAt: trade.latestObservation?.observedAt ?? trade.entryAt,
    now: Date.now(),
  }).text;
}

function updateFreshness(): void {
  if (!activeTrade) return;
  const detail = tradeDetail.querySelector<HTMLElement>('[data-freshness]');
  if (!detail) return;
  const label = freshnessLabel({
    status: activeTrade.trade.status,
    sourceTime: activeTrade.trade.latestObservation?.sourceTime ?? null,
    observedAt: activeTrade.trade.latestObservation?.observedAt ?? activeTrade.trade.entryAt,
    now: Date.now(),
  });
  detail.textContent = label.text;
  detail.dataset.stale = String(label.stale);
}

function stopFreshnessTimer(): void {
  if (freshnessTimer !== undefined) window.clearInterval(freshnessTimer);
  freshnessTimer = undefined;
}

function startFreshnessTimer(trade: TradeDetail['trade']): void {
  stopFreshnessTimer();
  if (trade.status === 'closed') return;
  updateFreshness();
  freshnessTimer = window.setInterval(updateFreshness, 1_000);
}

function renderSummary(detail: TradeDetail): HTMLElement {
  const trade = detail.trade;
  const summary = detail.summary;
  const list = node('dl', 'kv');
  list.append(
    kvRow('Entry price', price(trade.entryPrice)),
    kvRow('Quantity', quantity(trade.quantity)),
    kvRow('Filled notional', usd(trade.filledNotional)),
    kvRow('Allocated collateral', usd(trade.allocatedCollateral)),
    kvRow('Leverage', `${trade.leverage}×`),
    kvRow('Entry time', time(trade.entryAt)),
    kvRow('Price used', `${price(summary.priceUsed)} (${time(summary.sourceTime)})`),
    kvRow('Gross PnL', signedUsd(summary.grossPnl, 4), new Decimal(summary.grossPnl).gte(0) ? 'up' : 'down'),
    kvRow('Entry fee', usd(summary.entryFee)),
    kvRow(trade.status === 'closed' ? 'Exit fee' : 'Estimated exit fee', usd(summary.exitFee)),
    kvRow(trade.status === 'closed' ? 'Net excluding unknown funding' : 'Estimated net excluding unknown funding', signedUsd(summary.netExcludingUnknownFunding), new Decimal(summary.netExcludingUnknownFunding).gte(0) ? 'up' : 'down'),
    kvRow('ROE on allocated collateral', `${formatDecimal(summary.roePct, 2)}%`),
    kvRow('Funding', summary.fundingStatus === 'not_reconstructed' ? 'Funding not reconstructed' : usd(summary.fundingCashFlow ?? '0')),
    kvRow('Liquidation', 'Estimate unavailable — risk scenario only'),
    kvRow('Last mark observed', time(trade.latestObservation?.observedAt ?? trade.entryAt)),
    kvRow('Mark freshness', freshnessText(trade), '', true),
    kvRow('Monitoring gaps', String(detail.monitoringGaps)),
  );
  return list;
}

function eventRow(event: TradeEvent): HTMLElement {
  const row = node('li', 'event-row');
  row.append(
    node('span', 'event-type', event.eventType.replace(/_/g, ' ')),
    node('span', 'event-price', event.price ? price(event.price) : '—'),
    node('span', 'event-time', time(event.sourceTime ?? event.observedAt)),
  );
  return row;
}

function renderTradeDetail(detail: TradeDetail, keepClosePreview = false): void {
  stopFreshnessTimer();
  activeTrade = detail;
  if (!keepClosePreview) closePreview = null;
  tradeDetail.hidden = false;
  clear(tradeDetail);
  const trade = detail.trade;
  const head = node('div', 'record-head');
  const title = node('h3', undefined, baseAsset(trade.symbol));
  const badge = node('span', `status ${trade.status}`, statusLabel(trade.status));
  head.append(title, badge);
  const disclaimer = node('p', 'badge-virtual', trade.status === 'closed'
    ? 'Virtual trade closed — no real funds.'
    : 'Live virtual trade — no real funds.');
  const side = node('p', 'hint', `${trade.side === 'long' ? 'Long' : 'Short'} · ${trade.quoteAsset} · ${trade.inputMode === 'collateral' ? 'virtual collateral' : 'position notional'} · Created ${time(trade.createdAt)}`);
  const actions = node('div', 'actions');
  if (trade.status === 'open' || trade.status === 'unresolved') {
    const refresh = node('button', 'btn btn-secondary', 'Refresh mark');
    refresh.type = 'button';
    refresh.addEventListener('click', () => void refreshTrade(trade.id, refresh));
    actions.append(refresh);
  }
  if (trade.status !== 'closed') {
    const closeReview = node('button', 'btn btn-secondary', 'Review virtual close');
    closeReview.type = 'button';
    closeReview.addEventListener('click', () => void reviewClose(trade.id, closeReview));
    actions.append(closeReview);
  }
  const receipt = node('button', 'btn btn-secondary', 'Open receipt');
  receipt.type = 'button';
  receipt.addEventListener('click', () => {
    showTab('receipts');
    void openReceipt(trade.id);
  });
  actions.append(receipt);
  tradeDetail.append(head, disclaimer, side, renderSummary(detail), actions);
  renderClosePreview(trade.id);
  const events = node('section', 'record-section');
  events.append(node('h4', undefined, `Event history (${detail.events.length})`));
  const list = node('ul', 'event-list');
  for (const event of [...detail.events].reverse()) list.append(eventRow(event));
  events.append(list);
  tradeDetail.append(events);
  startFreshnessTimer(trade);
}

function renderClosePreview(tradeId: string): void {
  const existing = tradeDetail.querySelector('.close-preview');
  existing?.remove();
  if (!closePreview || closePreview.tradeId !== tradeId) return;
  const box = node('section', 'close-preview');
  const list = node('dl', 'kv');
  list.append(
    kvRow('Exit VWAP', price(closePreview.exitPrice)),
    kvRow('Exit fee', usd(closePreview.exitFee)),
    kvRow('Gross PnL', signedUsd(closePreview.grossPnl)),
    kvRow('Net excluding unknown funding', signedUsd(closePreview.netExcludingUnknownFunding)),
    kvRow('ROE', `${formatDecimal(closePreview.roePct, 2)}%`),
    kvRow('Quote impact', `${formatDecimal(closePreview.impactPct, 4)}%`),
    kvRow('Book source', time(closePreview.bookSourceTime)),
  );
  const limits = node('ul', 'limits');
  for (const limitation of closePreview.limitations) limits.append(node('li', undefined, limitation));
  const confirm = node('button', 'btn btn-primary', 'Confirm virtual close');
  confirm.type = 'button';
  confirm.addEventListener('click', () => void confirmClose(tradeId, confirm));
  box.append(node('h4', undefined, 'Virtual close preview'), list, limits, confirm);
  tradeDetail.append(box);
}

async function refreshTrade(tradeId: string, button: HTMLButtonElement): Promise<void> {
  button.disabled = true;
  button.textContent = 'Refreshing…';
  try {
    renderTradeDetail(await sendGhost<TradeDetail>({ type: 'ghost:refresh', tradeId }));
    await loadTrades();
  } catch (error) {
    showBanner(messageOf(error), 'error');
  } finally {
    button.disabled = false;
    button.textContent = 'Refresh mark';
  }
}

async function reviewClose(tradeId: string, button: HTMLButtonElement): Promise<void> {
  button.disabled = true;
  button.textContent = 'Reviewing…';
  try {
    closePreview = await sendGhost<ClosePreview>({ type: 'ghost:close-preview', tradeId });
    if (activeTrade) renderTradeDetail(activeTrade, true);
  } catch (error) {
    showBanner(messageOf(error), 'error');
  } finally {
    button.disabled = false;
    button.textContent = 'Review virtual close';
  }
}

async function confirmClose(tradeId: string, button: HTMLButtonElement): Promise<void> {
  button.disabled = true;
  button.textContent = 'Closing…';
  try {
    renderTradeDetail(await sendGhost<TradeDetail>({ type: 'ghost:close', tradeId, requestId: crypto.randomUUID() }));
    await loadTrades();
    await loadReceipts();
  } catch (error) {
    showBanner(messageOf(error), 'error');
    button.disabled = false;
    button.textContent = 'Confirm virtual close';
  }
}

function tradeRow(item: TradeListItem, action: 'trade' | 'receipt'): HTMLElement {
  const button = node('button', 'record-row');
  button.type = 'button';
  const left = node('span', 'record-main');
  left.append(
    node('strong', undefined, baseAsset(item.symbol)),
    node('small', undefined, `${item.quoteAsset} · ${item.side === 'long' ? 'Long' : 'Short'} · ${item.leverage}× · ${statusLabel(item.status)}`),
  );
  const right = node('span', 'record-side');
  right.append(
    node('span', undefined, item.markPrice ? price(item.markPrice) : '—'),
    node('small', undefined, `${usd(item.allocatedCollateral)} · ${timeShort(item.markObservedAt)}`),
  );
  button.append(left, right);
  button.addEventListener('click', () => {
    if (action === 'trade') {
      void openTrade(item.id);
    } else {
      void openReceipt(item.id);
    }
  });
  return button;
}

function emptyRecord(text: string): HTMLElement {
  return node('p', 'message', text);
}

async function loadTrades(): Promise<void> {
  tradeList.setAttribute('aria-busy', 'true');
  if (!tradeList.querySelector('.record-row')) {
    clear(tradeList);
    tradeList.append(emptyRecord('Loading virtual trades…'));
  }
  try {
    const items = await sendGhost<TradeListItem[]>({ type: 'ghost:list' });
    clear(tradeList);
    if (items.length === 0) tradeList.append(emptyRecord('No virtual trades yet. Create one from Discover.'));
    for (const item of items) tradeList.append(tradeRow(item, 'trade'));
  } catch (error) {
    clear(tradeList);
    tradeList.append(node('p', 'error', messageOf(error)));
  } finally {
    tradeList.setAttribute('aria-busy', 'false');
  }
}

async function openTrade(id: string): Promise<void> {
  stopFreshnessTimer();
  tradeDetail.hidden = false;
  tradeDetail.setAttribute('aria-busy', 'true');
  clear(tradeDetail);
  tradeDetail.append(emptyRecord('Loading virtual trade…'));
  try {
    renderTradeDetail(await sendGhost<TradeDetail>({ type: 'ghost:detail', tradeId: id }));
  } catch (error) {
    showBanner(messageOf(error), 'error');
  } finally {
    tradeDetail.setAttribute('aria-busy', 'false');
  }
}

async function loadReceipts(): Promise<void> {
  receiptList.setAttribute('aria-busy', 'true');
  if (!receiptList.querySelector('.record-row')) {
    clear(receiptList);
    receiptList.append(emptyRecord('Loading receipts…'));
  }
  try {
    const items = await sendGhost<TradeListItem[]>({ type: 'receipt:list' });
    clear(receiptList);
    if (items.length === 0) receiptList.append(emptyRecord('No receipts yet. A receipt is available after a virtual trade is created.'));
    for (const item of items) receiptList.append(tradeRow(item, 'receipt'));
  } catch (error) {
    clear(receiptList);
    receiptList.append(node('p', 'error', messageOf(error)));
  } finally {
    receiptList.setAttribute('aria-busy', 'false');
  }
}

function receiptSection(title: string, body: HTMLElement): HTMLElement {
  const section = node('section', 'record-section');
  section.append(node('h4', undefined, title), body);
  return section;
}

function renderReceipt(receipt: TradeReceipt): void {
  receiptDetail.hidden = false;
  clear(receiptDetail);
  const head = node('div', 'record-head');
  head.append(
    node('h3', undefined, `${baseAsset(receipt.originalDecision.symbol)} receipt`),
    node('span', 'status closed', receipt.outcome.closed ? 'Virtual outcome' : 'Observation snapshot'),
  );
  const disclaimer = node('p', 'badge-virtual', receipt.qualification.disclaimer);
  const claimBlock = node('div');
  if (receipt.claimSnapshot) {
    const quote = node('blockquote', 'claim-quote', receipt.claimSnapshot.text);
    claimBlock.append(
      quote,
      node('p', 'hint', `${receipt.claimSnapshot.sourceDomain} · ${time(receipt.claimSnapshot.capturedAt)}`),
    );
  } else {
    claimBlock.append(node('p', 'hint', 'Created manually. No captured claim is attached.'));
  }
  const decision = node('dl', 'kv');
  decision.append(
    kvRow('Market', receipt.originalDecision.symbol),
    kvRow('Quote / settlement', receipt.originalDecision.quoteAsset),
    kvRow('Side', receipt.originalDecision.side === 'long' ? 'Long' : 'Short'),
    kvRow('Input mode', receipt.originalDecision.inputMode),
    kvRow('Allocated collateral', usd(receipt.originalDecision.allocatedCollateral)),
    kvRow('Requested notional', usd(receipt.originalDecision.requestedNotional)),
    kvRow('Leverage', `${receipt.originalDecision.leverage}×`),
  );
  const evidence = node('dl', 'kv');
  evidence.append(
    kvRow('Entry mark', price(receipt.entryEvidence.markPrice)),
    kvRow('Best bid / ask', `${price(receipt.entryEvidence.bestBid)} / ${price(receipt.entryEvidence.bestAsk)}`),
    kvRow('Mark source', time(receipt.entryEvidence.markSourceTime)),
    kvRow('Book source', time(receipt.entryEvidence.bookSourceTime)),
    kvRow('Rules', receipt.entryEvidence.rulesVersion),
    kvRow('Tick size', receipt.entryEvidence.rules.tickSize),
    kvRow('Quantity step / bounds', `${receipt.entryEvidence.rules.quantityStep} / ${receipt.entryEvidence.rules.minQuantity}–${receipt.entryEvidence.rules.maxQuantity}`),
    kvRow('Minimum notional', receipt.entryEvidence.rules.minNotional),
    kvRow('Fill levels', String(receipt.entryEvidence.levels.length)),
  );
  const fill = node('dl', 'kv');
  fill.append(
    kvRow('Fill price (VWAP)', price(receipt.entryFill.price)),
    kvRow('Quantity', quantity(receipt.entryFill.quantity)),
    kvRow('Filled notional', usd(receipt.entryFill.notional)),
    kvRow('Filled at', time(receipt.entryFill.at)),
    kvRow('Entry fee', usd(receipt.entryFill.entryFee)),
  );
  const exitBlock = node('div');
  if (receipt.exitFill && receipt.exitEvidence) {
    const exit = node('dl', 'kv');
    exit.append(
      kvRow('Exit price (VWAP)', price(receipt.exitFill.price)),
      kvRow('Exit quantity', quantity(receipt.exitFill.quantity)),
      kvRow('Exit notional', usd(receipt.exitFill.notional)),
      kvRow('Exited at', time(receipt.exitFill.at)),
      kvRow('Exit fee', usd(receipt.exitFill.exitFee)),
      kvRow('Exit book source', time(receipt.exitEvidence.bookSourceTime)),
      kvRow('Exit best bid / ask', `${price(receipt.exitEvidence.bestBid)} / ${price(receipt.exitEvidence.bestAsk)}`),
      kvRow('Exit levels', String(receipt.exitEvidence.levels.length)),
    );
    exitBlock.append(exit);
  } else {
    exitBlock.append(node('p', 'hint', 'This trade is still open. Exit fee and net are estimates, not realized costs.'));
  }
  const outcome = node('dl', 'kv');
  outcome.append(
    kvRow('Status', statusLabel(receipt.outcome.status)),
    kvRow('Price used', price(receipt.outcome.summary.priceUsed)),
    kvRow('Gross PnL', signedUsd(receipt.outcome.summary.grossPnl, 4)),
    kvRow('Entry fee', usd(receipt.costs.entryFee)),
    kvRow(receipt.outcome.closed ? 'Exit fee' : 'Estimated exit fee', usd(receipt.costs.exitFee)),
    kvRow('Funding', receipt.costs.fundingCashFlow === null ? 'Funding not reconstructed' : usd(receipt.costs.fundingCashFlow)),
    kvRow(receipt.outcome.closed ? 'Net excluding unknown funding' : 'Estimated net excluding unknown funding', signedUsd(receipt.costs.netExcludingUnknownFunding)),
    kvRow('ROE', `${formatDecimal(receipt.outcome.summary.roePct, 2)}%`),
    kvRow('Cost basis', receipt.costs.basis.replace(/_/g, ' ')),
  );
  const assumptions = node('ul', 'limits');
  assumptions.append(
    node('li', undefined, `Fee assumption: ${percentFromRate(receipt.assumptions.feePolicy.entryRate)} entry, ${percentFromRate(receipt.assumptions.feePolicy.exitRate)} exit.`),
    node('li', undefined, `Funding policy: ${receipt.assumptions.fundingPolicy.mode.replace(/_/g, ' ')}.`),
    node('li', undefined, `Fill policy: ${receipt.assumptions.fillPolicy.replace(/_/g, ' ')}.`),
    node('li', undefined, receipt.assumptions.exitPolicy),
    node('li', undefined, receipt.assumptions.liquidation),
    node('li', undefined, receipt.assumptions.monitoring),
    node('li', undefined, receipt.assumptions.privacy),
    node('li', undefined, `Data quality: entry ${receipt.dataQuality.entry}; latest ${receipt.dataQuality.latest ?? 'none'}; ${receipt.dataQuality.gaps} monitoring gap(s).`),
    node('li', undefined, `Calculation version: ${receipt.calculationVersion}.`),
  );
  const events = node('ul', 'event-list');
  for (const event of [...receipt.events].reverse()) events.append(eventRow(event));
  const actions = node('div', 'actions');
  const exportButton = node('button', 'btn btn-primary', 'Export JSON');
  exportButton.type = 'button';
  exportButton.addEventListener('click', () => exportReceipt(receipt));
  actions.append(exportButton);
  receiptDetail.append(
    head,
    disclaimer,
    actions,
    receiptSection('Claim source', claimBlock),
    receiptSection('Original decision', decision),
    receiptSection('Entry fill', fill),
    receiptSection('Entry evidence', evidence),
    receiptSection('Exit evidence', exitBlock),
    receiptSection('Outcome and costs', outcome),
    receiptSection('Assumptions and unknowns', assumptions),
    receiptSection(`Event history (${receipt.events.length})`, events),
  );
}

async function openReceipt(id: string): Promise<void> {
  receiptDetail.hidden = false;
  receiptDetail.setAttribute('aria-busy', 'true');
  clear(receiptDetail);
  receiptDetail.append(emptyRecord('Loading receipt…'));
  try {
    renderReceipt(await sendGhost<TradeReceipt>({ type: 'receipt:get', tradeId: id }));
  } catch (error) {
    showBanner(messageOf(error), 'error');
  } finally {
    receiptDetail.setAttribute('aria-busy', 'false');
  }
}

function exportReceipt(receipt: TradeReceipt): void {
  const blob = new Blob([JSON.stringify(receipt, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `strike-receipt-${receipt.tradeId}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

async function refreshKeyStatus(): Promise<void> {
  const current = selectedProvider();
  try {
    const status = await sendGhost<KeyStatus>({ type: 'jev:key-status' });
    keyConfigured = status.configured;
    keyProvider = status.configured ? status.provider : current;
    if (status.configured) aiProvider.value = status.provider;
    if (status.model) aiModel.value = status.model;
  } catch {
    keyConfigured = false;
    keyProvider = current;
  }
  syncProviderFields();
  updateJevUi();
}

async function saveKey(): Promise<void> {
  keyError.hidden = true;
  const provider = selectedProvider();
  const key = keyInput.value;
  if (!key) {
    keyError.hidden = false;
    keyError.textContent = 'Enter an API key first.';
    return;
  }
  if (provider === 'openrouter' && !aiModel.value.trim()) {
    keyError.hidden = false;
    keyError.textContent = 'Enter an OpenRouter model ID.';
    return;
  }
  keySave.disabled = true;
  try {
    const granted = await chrome.permissions.request({ origins: [PROVIDER_PERMISSION[provider]] });
    if (!granted) {
      keyError.hidden = false;
      keyError.textContent = `${PROVIDER_LABEL[provider]} access was not granted. AI stays off; manual trades still work.`;
      return;
    }
    const message: GhostMessage = provider === 'openrouter'
      ? { type: 'jev:key-save', provider, key, model: aiModel.value.trim() }
      : { type: 'jev:key-save', provider, key };
    await sendGhost<KeyStatus>(message);
    keyInput.value = '';
    await refreshKeyStatus();
    keyError.hidden = true;
  } catch (error) {
    keyError.hidden = false;
    keyError.textContent = messageOf(error);
  } finally {
    keySave.disabled = false;
  }
}

async function clearKey(): Promise<void> {
  keyError.hidden = true;
  keyClear.disabled = true;
  try {
    await sendGhost<KeyStatus>({ type: 'jev:key-clear' });
    keyInput.value = '';
    await refreshKeyStatus();
  } catch (error) {
    keyError.hidden = false;
    keyError.textContent = messageOf(error);
  } finally {
    keyClear.disabled = false;
  }
}

function populateMarkets(registry: SymbolRegistry): void {
  entries = [...registry.symbols].sort((a, b) => a.baseAsset.localeCompare(b.baseAsset));
  clear(marketSelect);
  for (const entry of entries) {
    const option = document.createElement('option');
    option.value = entry.symbol;
    option.textContent = `${entry.baseAsset} · ${entry.symbol}`;
    marketSelect.append(option);
  }
  const preferred = claim?.candidateSymbols[0];
  if (preferred && entries.some((entry) => entry.symbol === preferred)) marketSelect.value = preferred;
  else if (entries.some((entry) => entry.symbol === 'BTC-USD')) marketSelect.value = 'BTC-USD';
  renderCandidates();
}

async function boot(): Promise<void> {
  document.addEventListener('pointerdown', (event) => {
    if (event.target instanceof Node && !utilityMenu.contains(event.target)) utilityMenu.open = false;
  });
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || !utilityMenu.open) return;
    event.preventDefault();
    utilityMenu.open = false;
    utilityToggle?.focus();
  });
  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-tab]')) {
    button.addEventListener('click', () => showTab(button.dataset.tab as Tab));
  }
  chrome.runtime.onMessage.addListener((event: unknown) => {
    if (!isRuntimeEvent(event)) return;
    if (event.type === 'claim:captured') {
      claimToken += 1;
      showClaim(event.claim, true);
      showBanner('Claim captured. Review the market and simulation before creating a trade.');
    } else {
      showBanner(event.error.message, 'error');
    }
  });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) updateFreshness();
  });
  const bootToken = ++claimToken;
  aiProvider.addEventListener('change', () => {
    syncProviderFields();
    updateJevUi();
  });
  jevConsent.addEventListener('change', updateJevUi);
  jevAnalyze.addEventListener('click', () => {
    if (!claim || !jevConsent.checked || jevPending || !providerReady()) return;
    const targetClaimId = claim.id;
    jevPending = true;
    updateJevUi();
    void sendGhost<ClaimAnalysis>({ type: 'jev:analyze', claimId: targetClaimId, consent: true })
      .then((analysis) => {
        if (!claim || claim.id !== targetClaimId) return;
        claim = { ...claim, analysis };
      })
      .catch((error: unknown) => {
        showBanner(messageOf(error), 'error');
      })
      .finally(() => {
        jevPending = false;
        updateJevUi();
      });
  });
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    void runPreview();
  });
  form.addEventListener('input', invalidatePreview);
  inputMode.addEventListener('change', () => {
    amountLabel.textContent = inputMode.value === 'notional'
      ? 'Position notional (USDT)'
      : 'Virtual collateral (USDT)';
  });
  createButton.addEventListener('click', () => void createTrade());
  marketSelect.addEventListener('change', renderCandidates);
  tradesRefresh.addEventListener('click', () => void loadTrades());
  keySave.addEventListener('click', () => void saveKey());
  keyClear.addEventListener('click', () => void clearKey());

  try {
    const registry = await chrome.runtime.sendMessage({ type: 'registry:get' }) as SymbolRegistry;
    populateMarkets(registry);
  } catch {
    marketSelect.append(node('option', undefined, 'Markets unavailable'));
  }
  await refreshKeyStatus();
  try {
    const pending = await sendGhost<CapturedClaim | null>({ type: 'claim:get-pending' });
    if (bootToken === claimToken) {
      if (pending) showClaim(pending);
      else showBanner('Select text on a page, then right-click and choose “Analyze with Strike Everywhere”. Manual trades work without a claim.');
    }
  } catch (error) {
    if (bootToken === claimToken) showBanner(messageOf(error), 'error');
  }
  await loadTrades();
  await loadReceipts();
}

export function mountGhostUi(): void {
  void boot();
}
