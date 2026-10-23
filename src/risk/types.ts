import type { Side, Tier } from '../shared/types';

export interface PositionInput {
  entryPrice: string;
  /** Signed base units: positive = long, negative = short. */
  size: string;
  leverage: string;
  walletBalance?: string;
  tiers: Tier[];
}

export interface SummaryInput {
  entryPrice: string;
  sizeUsd: string;
  leverage: string;
  side: Side;
  tiers: Tier[];
  fundingRate: string;
  takerFeeRate: string;
}

export interface RiskSummary {
  notional: string;
  initialMargin: string;
  maintenanceMargin: string;
  liquidationPrice: string | null;
  fee: string;
  fundingPerDay: string;
  maxLeverage: number;
  leverageClamped: boolean;
}

export interface Candle {
  time: number;
  open: string;
  high: string;
  low: string;
  close: string;
}

export interface ReplayInput {
  entryPrice: string;
  sizeUsd: string;
  leverage: string;
  side: Side;
  tiers: Tier[];
  candles: Candle[];
  takerFeeRate: string;
  fundingRate?: string;
}
