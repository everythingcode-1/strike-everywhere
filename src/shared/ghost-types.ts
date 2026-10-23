import type { Side } from './types';

/**
 * Contracts for the local Ghost Trade ledger. Money, ratios, quantities and prices are decimal
 * strings; timestamps are Unix milliseconds.
 */

export type ClaimAnalysisStatus = 'not_requested' | 'missing_key' | 'pending' | 'ready' | 'failed';
export type ClaimDirection = 'bullish' | 'bearish' | 'neutral' | 'ambiguous' | 'non_trading';
export type ClaimTestability = 'testable' | 'partially_specified' | 'not_testable';
export type AiProvider = 'typesafe' | 'openrouter';

export interface ClaimAnalysis {
  status: ClaimAnalysisStatus;
  direction: ClaimDirection | null;
  testability: ClaimTestability | null;
  suggestedSymbols: string[];
  summary: string | null;
  errorCode: string | null;
  analyzedAt: number | null;
  provider: AiProvider | null;
  model: string | null;
}

export interface CapturedClaim {
  schemaVersion: number;
  id: string;
  text: string;
  sourceDomain: string;
  sourceUrl: string;
  capturedAt: number;
  captureSequence: number;
  candidateSymbols: string[];
  selectedSymbol: string | null;
  analysis: ClaimAnalysis;
  analysisVersion: string | null;
}

export interface VerifiedMarketRules {
  schemaVersion: number;
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  contractType: string;
  status: string;
  quotePrecision: number;
  tickSize: string;
  quantityStep: string;
  minQuantity: string;
  maxQuantity: string;
  minNotional: string;
  allowedOrderTypes: string[];
  source: string;
  receivedAt: number;
}

export interface BookLevel {
  price: string;
  quantity: string;
}

export type DataQuality = 'source-time' | 'receive-time-only';

export interface EntrySnapshot {
  id: string;
  symbol: string;
  quoteAsset: string;
  markPrice: string;
  indexPrice: string;
  fundingRate: string;
  nextFundingAt: number;
  bestBid: string;
  bestAsk: string;
  bookSourceTime: number | null;
  markSourceTime: number | null;
  receivedAt: number;
  sourceEndpoints: string[];
  dataQuality: DataQuality;
  rulesVersion: string;
  rules: VerifiedMarketRules;
  levels: BookLevel[];
}

export interface ExitSnapshot extends EntrySnapshot {
  exitSide: 'asks' | 'bids';
}

export type InputMode = 'collateral' | 'notional';
export type TradeStatus = 'open' | 'pending_exit' | 'closed' | 'unresolved';
export type FillPolicy = 'market_full_fill';

export interface FeePolicy {
  mode: 'assumed';
  entryRate: string;
  exitRate: string;
}

export interface FundingPolicy {
  mode: 'not_reconstructed';
}

export interface TradeObservation {
  markPrice: string;
  sourceTime: number | null;
  observedAt: number;
  dataQuality: DataQuality;
}

export interface TradeOutcome {
  exitPrice: string;
  exitNotional: string;
  exitAt: number;
  exitSnapshot: ExitSnapshot;
  grossPnl: string;
  entryFee: string;
  exitFee: string;
  fundingCashFlow: string | null;
  netExcludingUnknownFunding: string;
  roePct: string;
}

export interface GhostTrade {
  schemaVersion: number;
  id: string;
  creationRequestId: string;
  mode: 'live_virtual';
  claimSnapshot: CapturedClaim | null;
  symbol: string;
  quoteAsset: string;
  side: Side;
  inputMode: InputMode;
  entryType: 'market';
  marginModel: 'virtual_collateral';
  allocatedCollateral: string;
  requestedNotional: string;
  filledNotional: string;
  quantity: string;
  entryPrice: string;
  entryAt: number;
  entrySnapshot: EntrySnapshot;
  leverage: number;
  feePolicy: FeePolicy;
  fundingPolicy: FundingPolicy;
  fillPolicy: FillPolicy;
  status: TradeStatus;
  latestObservation: TradeObservation | null;
  outcome: TradeOutcome | null;
  createdAt: number;
  updatedAt: number;
  calculationVersion: string;
}

export type TradeEventType =
  | 'created'
  | 'mark_observed'
  | 'funding_observed'
  | 'monitoring_gap'
  | 'close_requested'
  | 'closed_virtual'
  | 'data_unavailable';

export interface TradeEvent {
  id: string;
  tradeId: string;
  eventType: TradeEventType;
  sourceTime: number | null;
  observedAt: number;
  price: string | null;
  quantity: string | null;
  fee: string | null;
  fundingCashFlow: string | null;
  certainty: 'observed' | 'estimated' | 'unknown';
  source: string;
  metadata: Record<string, string>;
  calculationVersion: string;
}

export interface PositionSummary {
  priceUsed: string;
  sourceTime: number | null;
  grossPnl: string;
  entryFee: string;
  exitFee: string;
  fundingCashFlow: string | null;
  fundingStatus: 'not_reconstructed' | 'known';
  netExcludingUnknownFunding: string;
  roePct: string;
}

export interface ReceiptCosts {
  entryFee: string;
  exitFee: string;
  fundingCashFlow: string | null;
  netExcludingUnknownFunding: string;
  basis: 'estimated_open' | 'realized_virtual_closed';
}

export interface TradeReceipt {
  schemaVersion: number;
  receiptId: string;
  tradeId: string;
  exportedAt: number;
  claimSnapshot: CapturedClaim | null;
  originalDecision: {
    symbol: string;
    quoteAsset: string;
    side: Side;
    inputMode: InputMode;
    allocatedCollateral: string;
    requestedNotional: string;
    leverage: number;
  };
  entryEvidence: EntrySnapshot;
  entryFill: {
    price: string;
    quantity: string;
    notional: string;
    at: number;
    entryFee: string;
  };
  exitEvidence: ExitSnapshot | null;
  exitFill: {
    price: string;
    quantity: string;
    notional: string;
    at: number;
    exitFee: string;
  } | null;
  qualification: {
    mode: 'live_virtual';
    realFunds: false;
    disclaimer: string;
  };
  observations: TradeEvent[];
  events: TradeEvent[];
  outcome: {
    status: TradeStatus;
    closed: boolean;
    summary: PositionSummary;
  };
  costs: ReceiptCosts;
  assumptions: {
    feePolicy: FeePolicy;
    fundingPolicy: FundingPolicy;
    fillPolicy: FillPolicy;
    exitPolicy: string;
    liquidation: string;
    monitoring: string;
    privacy: string;
  };
  dataQuality: {
    entry: DataQuality;
    latest: DataQuality | null;
    gaps: number;
  };
  calculationVersion: string;
}

export interface TradeListItem {
  id: string;
  symbol: string;
  quoteAsset: string;
  side: Side;
  status: TradeStatus;
  entryPrice: string;
  quantity: string;
  allocatedCollateral: string;
  leverage: number;
  createdAt: number;
  updatedAt: number;
  markPrice: string | null;
  markObservedAt: number | null;
}

export interface TradeDetail {
  trade: GhostTrade;
  events: TradeEvent[];
  summary: PositionSummary;
  monitoringGaps: number;
}

export interface PreviewResult {
  symbol: string;
  side: Side;
  inputMode: InputMode;
  allocatedCollateral: string;
  requestedNotional: string;
  filledNotional: string;
  quantity: string;
  entryPrice: string;
  bestBid: string;
  bestAsk: string;
  impactPct: string;
  entryFee: string;
  estimatedExitFee: string;
  grossPnlAtMark: string;
  netAtEntry: string;
  netBasis: 'mark';
  leverage: number;
  markPrice: string;
  quoteAsset: string;
  markSourceTime: number | null;
  bookSourceTime: number | null;
  limitations: string[];
}

export interface ClosePreview {
  tradeId: string;
  quantity: string;
  exitPrice: string;
  exitFee: string;
  grossPnl: string;
  netExcludingUnknownFunding: string;
  roePct: string;
  impactPct: string;
  markSourceTime: number | null;
  bookSourceTime: number | null;
  limitations: string[];
}

export interface CreateTradeInput {
  requestId: string;
  claimId?: string;
  symbol: string;
  side: Side;
  inputMode: InputMode;
  amount: string;
  leverage: number;
  feeRate: string;
}

export interface PreviewTradeInput {
  symbol: string;
  side: Side;
  inputMode: InputMode;
  amount: string;
  leverage: number;
  feeRate: string;
}

export type GhostErrorCode =
  | 'INVALID_INPUT'
  | 'INVALID_MENU'
  | 'CLAIM_NOT_FOUND'
  | 'TRADE_NOT_FOUND'
  | 'UNKNOWN_SYMBOL'
  | 'UNSUPPORTED_CONTRACT'
  | 'STALE_MARKET'
  | 'INVALID_BOOK'
  | 'INSUFFICIENT_DEPTH'
  | 'MIN_NOTIONAL'
  | 'MIN_QUANTITY'
  | 'MAX_QUANTITY'
  | 'NOT_OPEN'
  | 'UNKNOWN_SCHEMA'
  | 'STORAGE_FAILED'
  | 'KEY_MISSING'
  | 'CONSENT_REQUIRED'
  | 'AI_UNAVAILABLE'
  | 'PERMISSION_DENIED'
  | 'UNRESOLVED_HISTORY'
  | 'FORBIDDEN'
  | 'INTERNAL';

export interface GhostErrorBody {
  code: GhostErrorCode;
  message: string;
}

export type GhostResult<T> = { ok: true; value: T } | { ok: false; error: GhostErrorBody };

export type GhostMessage =
  | { type: 'claim:get-pending' }
  | { type: 'claim:resolve'; claimId: string }
  | { type: 'jev:key-status' }
  | { type: 'jev:key-save'; provider: AiProvider; key: string; model?: string }
  | { type: 'jev:key-clear' }
  | { type: 'jev:analyze'; claimId: string; consent: true }
  | ({ type: 'ghost:preview' } & PreviewTradeInput)
  | ({ type: 'ghost:create' } & CreateTradeInput)
  | { type: 'ghost:list' }
  | { type: 'ghost:detail'; tradeId: string }
  | { type: 'ghost:refresh'; tradeId: string }
  | { type: 'ghost:close-preview'; tradeId: string }
  | { type: 'ghost:close'; tradeId: string; requestId: string }
  | { type: 'receipt:get'; tradeId: string }
  | { type: 'receipt:list' };

export interface KeyStatus {
  configured: boolean;
  provider: AiProvider;
  model: string | null;
}

export type GhostRuntimeEvent =
  | { type: 'claim:captured'; claim: CapturedClaim }
  | { type: 'claim:error'; error: GhostErrorBody };
