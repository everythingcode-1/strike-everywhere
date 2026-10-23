import type { MarketResult, Message, ReplayResult, Side } from './types';
import type { RiskSummary } from '../risk/types';

export interface SlippageEstimate {
  vwap: string;
  slippageBps: string;
  filledUsd: string;
  partial: boolean;
  snapshotAt: number;
}

export interface MarketExtras {
  spread: string | null;
  spreadBps: string | null;
  basisPct: string | null;
  volatilityPct: string | null;
  sparkline: number[];
  fetchedAt: number;
}

export interface MarketResultV2 extends MarketResult {
  extras?: MarketExtras;
}

export interface ReplayResultV2 extends ReplayResult {
  entryPrice: string;
  entrySource: 'slipped' | 'mark';
  slippage: SlippageEstimate | null;
  requestedSizeUsd: string;
  replaySizeUsd: string;
}

export interface SimulatorResult {
  replay: ReplayResultV2;
  summary: RiskSummary;
  markPrice: string;
  marginMode: 'cross' | 'isolated';
  approximate: boolean;
  tiersApproximate: boolean;
  extras: MarketExtras;
}

export type SimulatorMessage =
  | { type: 'market:extras'; symbol: string }
  | { type: 'simulate:run'; symbol: string; sizeUsd: string; leverage: string; side: Side; marginMode?: 'cross' | 'isolated'; allowFetch?: boolean }
  | { type: 'watchlist:get' };

export type ExtensionMessage = Message | SimulatorMessage;

export interface WatchlistRow {
  symbol: string;
  baseAsset: string;
  lastPrice: string;
  changePercent: string;
  fundingRate: string;
  quoteVolume: string;
}

export interface WatchlistResult {
  movers: WatchlistRow[];
  funding: WatchlistRow[];
  fetchedAt: number;
}
