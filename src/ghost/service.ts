import Decimal from 'decimal.js';
import {
  fetchDepth,
  fetchExchangeInfo,
  fetchPremiumIndex,
} from '../lib/api';
import { readCache, writeCache } from '../lib/cache';
import { loadRegistry } from '../lib/symbols';
import type { Side } from '../shared/types';
import type {
  CapturedClaim,
  ClaimAnalysis,
  ClosePreview,
  CreateTradeInput,
  EntrySnapshot,
  GhostTrade,
  PositionSummary,
  PreviewResult,
  PreviewTradeInput,
  TradeDetail,
  TradeEvent,
  TradeListItem,
  TradeReceipt,
  VerifiedMarketRules,
} from '../shared/ghost-types';
import { feeFor, grossPnl, positionSizing, summarizePosition } from './accounting';
import {
  DEFAULT_FEE_RATE,
  GHOST_CALC_VERSION,
  GHOST_RULES_TTL_MS,
  GHOST_SCHEMA_VERSION,
  MAX_CLAIM_CHARS,
  MAX_FEE_RATE,
  MAX_LEVERAGE,
  MONITORING_GAP_MS,
} from './constants';
import { decimalString, parseDecimal, parsePositive } from './decimal';
import { GhostError } from './errors';
import { executeEntry, executeExit, validateBook, type FillResult, type ValidatedBook } from './execution';
import { assertTransition, shouldRecordGap } from './lifecycle';
import { assertFreshBook, assertFreshSource, parseVerifiedRules } from './market';
import { resolveCandidates } from './resolve';
import {
  findCloseRequest,
  findCreateRequest,
  getClaim,
  getPendingClaim,
  getTradeRecord,
  listTradeRecords,
  saveClaim,
  saveNewTrade,
  saveTradeUpdate,
  updateClaim,
  withLedgerLock,
  type TradeRecord,
} from './store';

interface MarketQuote {
  rules: VerifiedMarketRules;
  markPrice: string;
  indexPrice: string;
  fundingRate: string;
  nextFundingAt: number;
  markSourceTime: number;
  bookSourceTime: number;
  bestBid: string;
  bestAsk: string;
  book: ValidatedBook;
  receivedAt: number;
}

interface EntryQuote extends MarketQuote {
  input: PreviewTradeInput;
  allocatedCollateral: string;
  requestedNotional: string;
  fill: FillResult;
  entryFee: string;
}

const LIMITATIONS = [
  'Market entry, full fill only. The displayed book is assumed executable.',
  'Creating the trade takes a fresh quote; the accepted fill may differ from this preview.',
  'Fees are assumptions, not your Strike account fee.',
  'Funding not reconstructed; PnL excludes unknown funding.',
  'Liquidation estimate unavailable — risk scenario only.',
];

function emptyAnalysis(): ClaimAnalysis {
  return {
    status: 'not_requested',
    direction: null,
    testability: null,
    suggestedSymbols: [],
    summary: null,
    errorCode: null,
    analyzedAt: null,
    provider: null,
    model: null,
  };
}

export function sanitizeSource(raw: string): { sourceDomain: string; sourceUrl: string } {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new GhostError('INVALID_INPUT', 'The page URL is not valid.');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new GhostError('INVALID_INPUT', 'Only http(s) pages can be captured.');
  }
  url.username = '';
  url.password = '';
  url.search = '';
  url.hash = '';
  return {
    sourceDomain: url.hostname.replace(/^www\./, ''),
    sourceUrl: `${url.origin}${url.pathname}`,
  };
}

export async function captureClaim(
  selection: string,
  pageUrl: string,
  sequence = nextCaptureSequence(),
): Promise<{ claim: CapturedClaim; latest: boolean }> {
  const text = selection.trim();
  if (text.length === 0) throw new GhostError('INVALID_INPUT', 'Select some text first.');
  if (text.length > MAX_CLAIM_CHARS) {
    throw new GhostError('INVALID_INPUT', `Selection is longer than ${MAX_CLAIM_CHARS} characters. Select a shorter claim.`);
  }
  const source = sanitizeSource(pageUrl);
  const capturedAt = Date.now();
  const id = crypto.randomUUID();
  const registry = await loadRegistry();
  const candidates = resolveCandidates(text, registry.symbols);
  const claim: CapturedClaim = {
    schemaVersion: GHOST_SCHEMA_VERSION,
    id,
    text,
    sourceDomain: source.sourceDomain,
    sourceUrl: source.sourceUrl,
    capturedAt,
    captureSequence: sequence,
    candidateSymbols: candidates.map((entry) => entry.symbol),
    selectedSymbol: candidates[0]?.symbol ?? null,
    analysis: emptyAnalysis(),
    analysisVersion: null,
  };
  const latest = await saveClaim(claim);
  return { claim, latest };
}

let captureCounter = 0;

/** Timestamp*1000 plus a same-millisecond counter, assigned before any await. */
function nextCaptureSequence(): number {
  captureCounter = (captureCounter + 1) % 1000;
  return Date.now() * 1000 + captureCounter;
}

export function pendingClaim(): Promise<CapturedClaim | undefined> {
  return getPendingClaim();
}

export async function resolveClaim(claimId: string): Promise<CapturedClaim> {
  const claim = await getClaim(claimId);
  if (!claim) throw new GhostError('CLAIM_NOT_FOUND', 'Captured claim not found.');
  const registry = await loadRegistry();
  const candidates = resolveCandidates(claim.text, registry.symbols).map((entry) => entry.symbol);
  const next: CapturedClaim = {
    ...claim,
    candidateSymbols: candidates,
    selectedSymbol: claim.selectedSymbol && candidates.includes(claim.selectedSymbol) ? claim.selectedSymbol : candidates[0] ?? null,
  };
  await updateClaim(next);
  return next;
}

export async function setClaimAnalysis(claimId: string, analysis: ClaimAnalysis): Promise<CapturedClaim> {
  const claim = await getClaim(claimId);
  if (!claim) throw new GhostError('CLAIM_NOT_FOUND', 'Captured claim not found.');
  const next = { ...claim, analysis, analysisVersion: GHOST_CALC_VERSION };
  await updateClaim(next);
  return next;
}

function entryLimits(rules: VerifiedMarketRules) {
  return {
    quantityStep: rules.quantityStep,
    minQuantity: rules.minQuantity,
    maxQuantity: rules.maxQuantity,
    minNotional: rules.minNotional,
  };
}

async function getRules(symbol: string): Promise<VerifiedMarketRules> {
  const key = `ghost-rules:${symbol}`;
  const cached = await readCache<VerifiedMarketRules>(key);
  if (cached && Date.now() - cached.savedAt < GHOST_RULES_TTL_MS) return cached.value;
  const symbols = await fetchExchangeInfo();
  const raw = symbols.find((item) => typeof item === 'object' && item !== null && (item as Record<string, unknown>).symbol === symbol);
  if (!raw) throw new GhostError('UNKNOWN_SYMBOL', `${symbol} is not listed on Strike.`);
  const rules = parseVerifiedRules(raw, symbol, Date.now());
  await writeCache(key, rules);
  return rules;
}

async function readMarket(symbol: string): Promise<MarketQuote> {
  const [rules, premium, depth] = await Promise.all([
    getRules(symbol),
    fetchPremiumIndex(symbol),
    fetchDepth(symbol, 100),
  ]);
  const receivedAt = Date.now();
  const markSourceTime = assertFreshSource(premium.sourceTime, receivedAt);
  const bookSourceTime = assertFreshBook(depth.sourceTime ?? null, receivedAt);
  const book = validateBook(depth.bids, depth.asks);
  return {
    rules,
    markPrice: premium.markPrice,
    indexPrice: premium.indexPrice,
    fundingRate: premium.fundingRate,
    nextFundingAt: premium.nextFundingTime,
    markSourceTime,
    bookSourceTime,
    bestBid: book.bestBid,
    bestAsk: book.bestAsk,
    book,
    receivedAt,
  };
}

function validateInput(input: PreviewTradeInput): Decimal {
  if (input.side !== 'long' && input.side !== 'short') throw new GhostError('INVALID_INPUT', 'Choose Long or Short.');
  if (input.inputMode !== 'collateral' && input.inputMode !== 'notional') {
    throw new GhostError('INVALID_INPUT', 'Choose virtual collateral or position notional.');
  }
  const amount = parsePositive(input.amount, 'Amount');
  if (amount.gt('1000000000')) throw new GhostError('INVALID_INPUT', 'Amount is above the virtual trade limit.');
  if (!Number.isSafeInteger(input.leverage) || input.leverage < 1 || input.leverage > MAX_LEVERAGE) {
    throw new GhostError('INVALID_INPUT', `Leverage must be a whole number from 1 to ${MAX_LEVERAGE}.`);
  }
  const feeRate = parseDecimal(input.feeRate, 'Fee rate');
  if (feeRate.lt(0) || feeRate.gt(MAX_FEE_RATE)) {
    throw new GhostError('INVALID_INPUT', 'Fee assumption must be between 0% and 1%.');
  }
  return amount;
}

async function quoteEntry(input: PreviewTradeInput): Promise<EntryQuote> {
  const amount = validateInput(input);
  const registry = await loadRegistry();
  if (!registry.symbols.some((entry) => entry.symbol === input.symbol)) {
    throw new GhostError('UNKNOWN_SYMBOL', `${input.symbol} is not listed on Strike.`);
  }
  const market = await readMarket(input.symbol);
  const sizing = positionSizing(input.inputMode, decimalString(amount), input.leverage);
  const fill = executeEntry(input.side, market.book, sizing.requestedNotional, entryLimits(market.rules));
  const entryFee = feeFor(fill.notional, input.feeRate);
  return {
    ...market,
    input,
    allocatedCollateral: sizing.allocatedCollateral,
    requestedNotional: sizing.requestedNotional,
    fill,
    entryFee: decimalString(entryFee),
  };
}

function openSummary(input: {
  side: Side;
  quantity: string;
  entryPrice: string;
  markPrice: string;
  entryFee: string;
  exitFeeRate: string;
  allocatedCollateral: string;
}): PositionSummary {
  const exitNotional = new Decimal(input.quantity).mul(input.markPrice);
  return summarizePosition({
    side: input.side,
    quantity: input.quantity,
    entryPrice: input.entryPrice,
    exitPrice: input.markPrice,
    entryFee: input.entryFee,
    exitFee: feeFor(exitNotional.toString(), input.exitFeeRate).toString(),
    allocatedCollateral: input.allocatedCollateral,
  });
}

export async function previewTrade(input: PreviewTradeInput): Promise<PreviewResult> {
  const quote = await quoteEntry(input);
  const summary = openSummary({
    side: input.side,
    quantity: quote.fill.quantity,
    entryPrice: quote.fill.vwap,
    markPrice: quote.markPrice,
    entryFee: quote.entryFee,
    exitFeeRate: input.feeRate,
    allocatedCollateral: quote.allocatedCollateral,
  });
  return {
    symbol: input.symbol,
    side: input.side,
    inputMode: input.inputMode,
    allocatedCollateral: quote.allocatedCollateral,
    requestedNotional: quote.requestedNotional,
    filledNotional: quote.fill.notional,
    quantity: quote.fill.quantity,
    entryPrice: quote.fill.vwap,
    bestBid: quote.bestBid,
    bestAsk: quote.bestAsk,
    impactPct: quote.fill.impactPct,
    entryFee: quote.entryFee,
    estimatedExitFee: summary.exitFee,
    grossPnlAtMark: summary.grossPnl,
    netAtEntry: summary.netExcludingUnknownFunding,
    netBasis: 'mark',
    leverage: input.leverage,
    markPrice: quote.markPrice,
    quoteAsset: quote.rules.quoteAsset,
    markSourceTime: quote.markSourceTime,
    bookSourceTime: quote.bookSourceTime,
    limitations: LIMITATIONS,
  };
}

function snapshotFor(market: MarketQuote, symbol: string, fill: FillResult, snapshotId: string): EntrySnapshot {
  return {
    id: snapshotId,
    symbol,
    quoteAsset: market.rules.quoteAsset,
    markPrice: market.markPrice,
    indexPrice: market.indexPrice,
    fundingRate: market.fundingRate,
    nextFundingAt: market.nextFundingAt,
    bestBid: market.bestBid,
    bestAsk: market.bestAsk,
    bookSourceTime: market.bookSourceTime,
    markSourceTime: market.markSourceTime,
    receivedAt: market.receivedAt,
    sourceEndpoints: ['/price/v2/premiumIndex', '/price/v2/depth', '/price/v2/exchangeInfo'],
    dataQuality: 'source-time',
    rulesVersion: market.rules.source,
    rules: market.rules,
    levels: fill.levels,
  };
}

function eventId(tradeId: string, type: string, suffix: string): string {
  return `evt_${tradeId}_${type}_${suffix}`;
}

function gapEventIfNeeded(trade: GhostTrade, events: TradeEvent[], now: number): TradeEvent | null {
  const lastObservedAt = trade.latestObservation?.observedAt ?? trade.entryAt;
  if (!shouldRecordGap(lastObservedAt, now, MONITORING_GAP_MS)) return null;
  if (events.some((event) => event.eventType === 'monitoring_gap' && event.metadata.after === String(lastObservedAt))) return null;
  return {
    id: eventId(trade.id, 'gap', String(lastObservedAt)),
    tradeId: trade.id,
    eventType: 'monitoring_gap',
    sourceTime: null,
    observedAt: now,
    price: null,
    quantity: null,
    fee: null,
    fundingCashFlow: null,
    certainty: 'unknown',
    source: 'extension:monitor',
    metadata: { after: String(lastObservedAt), gapMs: String(now - lastObservedAt) },
    calculationVersion: GHOST_CALC_VERSION,
  };
}

export function createTrade(input: CreateTradeInput): Promise<TradeDetail> {
  return withLedgerLock(() => createTradeLocked(input));
}

async function createTradeLocked(input: CreateTradeInput): Promise<TradeDetail> {
  if (typeof input.requestId !== 'string' || input.requestId.length < 8 || input.requestId.length > 100) {
    throw new GhostError('INVALID_INPUT', 'Missing or invalid creation request ID.');
  }
  const existing = await findCreateRequest(input.requestId);
  if (existing) return getTradeDetail(existing);
  const quote = await quoteEntry(input);
  const claim = input.claimId ? await getClaim(input.claimId) : undefined;
  if (input.claimId && !claim) throw new GhostError('CLAIM_NOT_FOUND', 'Captured claim not found.');
  const now = Date.now();
  const tradeId = crypto.randomUUID();
  const snapshot = snapshotFor(quote, input.symbol, quote.fill, crypto.randomUUID());
  const claimSnapshot = claim ? structuredClone(claim) : null;
  if (claimSnapshot) claimSnapshot.selectedSymbol = input.symbol;
  const claimEvent: TradeEvent = {
    id: eventId(tradeId, 'created', String(now)),
    tradeId,
    eventType: 'created',
    sourceTime: quote.markSourceTime,
    observedAt: now,
    price: quote.fill.vwap,
    quantity: quote.fill.quantity,
    fee: quote.entryFee,
    fundingCashFlow: null,
    certainty: 'observed',
    source: 'strike:quote',
    metadata: {
      requestId: input.requestId,
      bookSourceTime: String(quote.bookSourceTime),
      markSourceTime: String(quote.markSourceTime),
      fillPolicy: 'market_full_fill',
    },
    calculationVersion: GHOST_CALC_VERSION,
  };
  const trade: GhostTrade = {
    schemaVersion: GHOST_SCHEMA_VERSION,
    id: tradeId,
    creationRequestId: input.requestId,
    mode: 'live_virtual',
    claimSnapshot,
    symbol: input.symbol,
    quoteAsset: quote.rules.quoteAsset,
    side: input.side,
    inputMode: input.inputMode,
    entryType: 'market',
    marginModel: 'virtual_collateral',
    allocatedCollateral: quote.allocatedCollateral,
    requestedNotional: quote.requestedNotional,
    filledNotional: quote.fill.notional,
    quantity: quote.fill.quantity,
    entryPrice: quote.fill.vwap,
    entryAt: now,
    entrySnapshot: snapshot,
    leverage: input.leverage,
    feePolicy: { mode: 'assumed', entryRate: input.feeRate, exitRate: input.feeRate },
    fundingPolicy: { mode: 'not_reconstructed' },
    fillPolicy: 'market_full_fill',
    status: 'open',
    latestObservation: {
      markPrice: quote.markPrice,
      sourceTime: quote.markSourceTime,
      observedAt: now,
      dataQuality: 'source-time',
    },
    outcome: null,
    createdAt: now,
    updatedAt: now,
    calculationVersion: GHOST_CALC_VERSION,
  };
  await saveNewTrade({ trade, events: [claimEvent] });
  return detailFromRecord({ trade, events: [claimEvent] });
}

function summaryFor(trade: GhostTrade): PositionSummary {
  if (trade.outcome) {
    return {
      priceUsed: trade.outcome.exitPrice,
      sourceTime: trade.outcome.exitSnapshot.bookSourceTime ?? trade.outcome.exitSnapshot.markSourceTime,
      grossPnl: trade.outcome.grossPnl,
      entryFee: trade.outcome.entryFee,
      exitFee: trade.outcome.exitFee,
      fundingCashFlow: null,
      fundingStatus: 'not_reconstructed',
      netExcludingUnknownFunding: trade.outcome.netExcludingUnknownFunding,
      roePct: trade.outcome.roePct,
    };
  }
  const price = trade.latestObservation?.markPrice ?? trade.entrySnapshot.markPrice;
  const summary = openSummary({
    side: trade.side,
    quantity: trade.quantity,
    entryPrice: trade.entryPrice,
    markPrice: price,
    entryFee: tradeEntryFee(trade),
    exitFeeRate: trade.feePolicy.exitRate,
    allocatedCollateral: trade.allocatedCollateral,
  });
  return {
    ...summary,
    sourceTime: trade.latestObservation?.sourceTime ?? trade.entrySnapshot.markSourceTime,
  };
}

function detailFromRecord(record: TradeRecord): TradeDetail {
  return {
    trade: record.trade,
    events: record.events,
    summary: summaryFor(record.trade),
    monitoringGaps: record.events.filter((event) => event.eventType === 'monitoring_gap').length,
  };
}

export async function getTradeDetail(tradeId: string): Promise<TradeDetail> {
  const record = await getTradeRecord(tradeId);
  if (!record) throw new GhostError('TRADE_NOT_FOUND', 'Virtual trade not found.');
  return detailFromRecord(record);
}

function listItem(trade: GhostTrade): TradeListItem {
  return {
    id: trade.id,
    symbol: trade.symbol,
    quoteAsset: trade.quoteAsset,
    side: trade.side,
    status: trade.status,
    entryPrice: trade.entryPrice,
    quantity: trade.quantity,
    allocatedCollateral: trade.allocatedCollateral,
    leverage: trade.leverage,
    createdAt: trade.createdAt,
    updatedAt: trade.updatedAt,
    markPrice: trade.latestObservation?.markPrice ?? trade.entrySnapshot.markPrice,
    markObservedAt: trade.latestObservation?.observedAt ?? trade.entryAt,
  };
}

export async function listTrades(): Promise<TradeListItem[]> {
  return (await listTradeRecords()).map((record) => listItem(record.trade));
}

export async function refreshTrade(tradeId: string): Promise<TradeDetail> {
  return withLedgerLock(async () => {
    const record = await getTradeRecord(tradeId);
    if (!record) throw new GhostError('TRADE_NOT_FOUND', 'Virtual trade not found.');
    if (record.trade.status === 'closed') return detailFromRecord(record);
    const premium = await fetchPremiumIndex(record.trade.symbol);
    const now = Date.now();
    const sourceTime = assertFreshSource(premium.sourceTime, now);
    const lastMark = [...record.events].reverse().find((event) => event.eventType === 'mark_observed');
    if (lastMark?.sourceTime === sourceTime) return detailFromRecord(record);
    const events = [...record.events];
    const gap = gapEventIfNeeded(record.trade, events, now);
    if (gap) events.push(gap);
    events.push({
      id: eventId(tradeId, 'mark', String(sourceTime)),
      tradeId,
      eventType: 'mark_observed',
      sourceTime,
      observedAt: now,
      price: premium.markPrice,
      quantity: null,
      fee: null,
      fundingCashFlow: null,
      certainty: 'observed',
      source: 'strike:premiumIndex',
      metadata: { dataQuality: 'source-time' },
      calculationVersion: GHOST_CALC_VERSION,
    });
    const trade: GhostTrade = {
      ...record.trade,
      latestObservation: { markPrice: premium.markPrice, sourceTime, observedAt: now, dataQuality: 'source-time' },
      updatedAt: now,
    };
    await saveTradeUpdate({ trade, events });
    return detailFromRecord({ trade, events });
  });
}

export async function previewClose(tradeId: string): Promise<ClosePreview> {
  const record = await getTradeRecord(tradeId);
  if (!record) throw new GhostError('TRADE_NOT_FOUND', 'Virtual trade not found.');
  if (record.trade.status === 'closed') throw new GhostError('NOT_OPEN', 'This trade is already closed.');
  const market = await readMarket(record.trade.symbol);
  const fill = executeExit(record.trade.side, market.book, record.trade.quantity, entryLimits(market.rules));
  const exitFee = feeFor(fill.notional, record.trade.feePolicy.exitRate);
  const summary = summarizePosition({
    side: record.trade.side,
    quantity: record.trade.quantity,
    entryPrice: record.trade.entryPrice,
    exitPrice: fill.vwap,
    entryFee: tradeEntryFee(record.trade),
    exitFee: exitFee.toString(),
    allocatedCollateral: record.trade.allocatedCollateral,
  });
  return {
    tradeId,
    quantity: fill.quantity,
    exitPrice: fill.vwap,
    exitFee: decimalString(exitFee),
    grossPnl: summary.grossPnl,
    netExcludingUnknownFunding: summary.netExcludingUnknownFunding,
    roePct: summary.roePct,
    impactPct: fill.impactPct,
    markSourceTime: market.markSourceTime,
    bookSourceTime: market.bookSourceTime,
    limitations: [
      'Exit uses the current book and is not guaranteed to fill at this price.',
      'Confirming takes a fresh quote; the accepted exit may differ from this preview.',
      'Funding not reconstructed; net excludes unknown funding.',
      'Liquidation estimate unavailable — risk scenario only.',
    ],
  };
}

export async function closeTrade(tradeId: string, requestId: string): Promise<TradeDetail> {
  if (typeof requestId !== 'string' || requestId.length < 8 || requestId.length > 100) {
    throw new GhostError('INVALID_INPUT', 'Missing or invalid close request ID.');
  }
  return withLedgerLock(async () => {
    const previousClose = await findCloseRequest(requestId);
    if (previousClose) {
      const previous = await getTradeRecord(previousClose);
      if (previous) return detailFromRecord(previous);
    }
    const record = await getTradeRecord(tradeId);
    if (!record) throw new GhostError('TRADE_NOT_FOUND', 'Virtual trade not found.');
    if (record.trade.status === 'closed') return detailFromRecord(record);
    if (record.trade.status === 'pending_exit') throw new GhostError('NOT_OPEN', 'This trade is already closing.');
    assertTransition(record.trade.status, 'closed');
    const market = await readMarket(record.trade.symbol);
    const fill = executeExit(record.trade.side, market.book, record.trade.quantity, entryLimits(market.rules));
    const exitFee = feeFor(fill.notional, record.trade.feePolicy.exitRate);
    const gross = grossPnl(record.trade.side, record.trade.quantity, record.trade.entryPrice, fill.vwap);
    const now = Date.now();
    const exitSnapshot: EntrySnapshot & { exitSide: 'asks' | 'bids' } = {
      ...snapshotFor(market, record.trade.symbol, fill, crypto.randomUUID()),
      exitSide: record.trade.side === 'long' ? 'bids' : 'asks',
    };
    const summary = summarizePosition({
      side: record.trade.side,
      quantity: record.trade.quantity,
      entryPrice: record.trade.entryPrice,
      exitPrice: fill.vwap,
      entryFee: tradeEntryFee(record.trade),
      exitFee: exitFee.toString(),
      allocatedCollateral: record.trade.allocatedCollateral,
    });
    const requestedEvent: TradeEvent = {
      id: eventId(tradeId, 'close-requested', requestId),
      tradeId,
      eventType: 'close_requested',
      sourceTime: market.bookSourceTime,
      observedAt: now,
      price: fill.vwap,
      quantity: fill.quantity,
      fee: null,
      fundingCashFlow: null,
      certainty: 'observed',
      source: 'strike:depth',
      metadata: { requestId, impactPct: fill.impactPct, exitSide: exitSnapshot.exitSide },
      calculationVersion: GHOST_CALC_VERSION,
    };
    const closedEvent: TradeEvent = {
      ...requestedEvent,
      id: eventId(tradeId, 'closed', requestId),
      eventType: 'closed_virtual',
      fee: decimalString(exitFee),
    };
    const trade: GhostTrade = {
      ...record.trade,
      status: 'closed',
      latestObservation: {
        markPrice: market.markPrice,
        sourceTime: market.markSourceTime,
        observedAt: now,
        dataQuality: 'source-time',
      },
      outcome: {
        exitPrice: fill.vwap,
        exitNotional: fill.notional,
        exitAt: now,
        exitSnapshot,
        grossPnl: decimalString(gross),
        entryFee: tradeEntryFee(record.trade),
        exitFee: decimalString(exitFee),
        fundingCashFlow: null,
        netExcludingUnknownFunding: summary.netExcludingUnknownFunding,
        roePct: summary.roePct,
      },
      updatedAt: now,
    };
    const events = [...record.events];
    const gap = gapEventIfNeeded(record.trade, events, now);
    if (gap) events.push(gap);
    events.push(requestedEvent, closedEvent);
    await saveTradeUpdate({ trade, events }, { closeRequestId: requestId });
    return detailFromRecord({ trade, events });
  });
}

function tradeEntryFee(trade: GhostTrade): string {
  return decimalString(feeFor(trade.filledNotional, trade.feePolicy.entryRate));
}

export async function buildReceipt(tradeId: string): Promise<TradeReceipt> {
  const detail = await getTradeDetail(tradeId);
  const trade = detail.trade;
  const summary = detail.summary;
  return {
    schemaVersion: GHOST_SCHEMA_VERSION,
    receiptId: `receipt_${trade.id}`,
    tradeId: trade.id,
    exportedAt: Date.now(),
    claimSnapshot: trade.claimSnapshot,
    originalDecision: {
      symbol: trade.symbol,
      quoteAsset: trade.quoteAsset,
      side: trade.side,
      inputMode: trade.inputMode,
      allocatedCollateral: trade.allocatedCollateral,
      requestedNotional: trade.requestedNotional,
      leverage: trade.leverage,
    },
    entryEvidence: trade.entrySnapshot,
    entryFill: {
      price: trade.entryPrice,
      quantity: trade.quantity,
      notional: trade.filledNotional,
      at: trade.entryAt,
      entryFee: tradeEntryFee(trade),
    },
    exitEvidence: trade.outcome?.exitSnapshot ?? null,
    exitFill: trade.outcome ? {
      price: trade.outcome.exitPrice,
      quantity: trade.quantity,
      notional: trade.outcome.exitNotional,
      at: trade.outcome.exitAt,
      exitFee: trade.outcome.exitFee,
    } : null,
    qualification: {
      mode: 'live_virtual',
      realFunds: false,
      disclaimer: 'Virtual trade — no real funds. Not a certificate of trading performance.',
    },
    observations: detail.events.filter((event) => event.eventType === 'mark_observed' || event.eventType === 'monitoring_gap' || event.eventType === 'data_unavailable'),
    events: detail.events,
    outcome: { status: trade.status, closed: trade.status === 'closed', summary },
    costs: {
      entryFee: summary.entryFee,
      exitFee: summary.exitFee,
      fundingCashFlow: summary.fundingCashFlow,
      netExcludingUnknownFunding: summary.netExcludingUnknownFunding,
      basis: trade.status === 'closed' ? 'realized_virtual_closed' : 'estimated_open',
    },
    assumptions: {
      feePolicy: trade.feePolicy,
      fundingPolicy: trade.fundingPolicy,
      fillPolicy: trade.fillPolicy,
      exitPolicy: 'Virtual close is one full-fill market order. Entry minimums do not block a small close; the current per-order maximum does, and split closes are not supported.',
      liquidation: 'Liquidation estimate unavailable — risk scenario only.',
      monitoring: 'Observations are written when the panel boots or Refresh is pressed. Browser closure shows up as a gap only when the next refresh detects it; a shutdown shorter than the gap threshold is visible from the event timestamps.',
      privacy: 'A captured claim keeps the page path without query, fragment or credentials. The panel shows only the source domain; the receipt includes the sanitized URL.',
    },
    dataQuality: {
      entry: trade.entrySnapshot.dataQuality,
      latest: trade.latestObservation?.dataQuality ?? null,
      gaps: detail.monitoringGaps,
    },
    calculationVersion: trade.calculationVersion,
  };
}

export const DEFAULT_ASSUMED_FEE_RATE = DEFAULT_FEE_RATE;
