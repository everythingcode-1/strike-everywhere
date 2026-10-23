import Decimal from 'decimal.js';
import { API_BASE, REPLAY_CANDLES } from '../shared/constants';
import type { ReplayResult } from '../shared/types';

export const DATA_LABEL = API_BASE.includes('testnet') ? 'Testnet market data' : 'Mainnet market data';
export const MODEL_NOTE = 'Experimental estimate. Not validated against live Strike positions.';
export const REPLAY_NOTE = 'Historical scenario, not a forecast. One cross-margin position; current funding held constant, entry and reduction fees included. Gap-filled candles can understate risk.';

export function formatMarketMoney(value: string, precision: number): string {
  try {
    const number = new Decimal(value);
    if (!number.isFinite() || !Number.isInteger(precision) || precision < 0 || precision > 18) return 'Unavailable';
    let text = number.toFixed(precision, Decimal.ROUND_HALF_UP);
    if (text.includes('.')) text = text.replace(/0+$/, '').replace(/\.$/, '');
    const [integer, fraction] = text.split('.');
    return `$${integer.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}${fraction ? `.${fraction}` : ''}`;
  } catch {
    return 'Unavailable';
  }
}

export function replayPresentation(result: ReplayResult): { headline: string; detail: string } {
  if (result.candles !== REPLAY_CANDLES) return { headline: 'Replay unavailable', detail: 'Incomplete history. A 30-day verdict needs 43,200 consecutive completed minutes.' };
  const headline = result.status === 'survived' ? 'No liquidation in this replay'
    : new Decimal(result.remainingSize).gt(0) ? 'Partial liquidation triggered' : 'Liquidation triggered';
  return { headline, detail: '30-day scenario · 43,200 completed mark-price minutes' };
}
