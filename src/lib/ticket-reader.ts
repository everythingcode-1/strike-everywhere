import Decimal from 'decimal.js';
import type { Side } from '../shared/types';

export function parseTradeSymbol(pathname: string): string | null {
  const match = pathname.match(/\/trade\/([^/?#]+)/i);
  if (!match) return null;
  const base = match[1].replace(/-USD$/i, '').toUpperCase();
  return base.length > 0 ? `${base}-USD` : null;
}

export function parseLeverage(text: string): string | null {
  const match = text.match(/(\d+(?:\.\d+)?)\s*x/i);
  if (!match) return null;
  try {
    const value = new Decimal(match[1]);
    return value.gt(0) ? value.toString() : null;
  } catch {
    return null;
  }
}

function activeTab(className: string): boolean {
  return className.split(/\s+/).some((token) => token === 'text-primary' || token === 'bg-primary-muted');
}

export function parseSide(longClass: string, shortClass: string): Side | null {
  const longActive = activeTab(longClass);
  const shortActive = activeTab(shortClass);
  if (longActive && !shortActive) return 'long';
  if (shortActive && !longActive) return 'short';
  return null;
}

export function parseSize(value: string, suffix: string, markPrice: string): string | null {
  const trimmed = value.replace(/[$,]/g, '').trim();
  if (!trimmed) return null;
  let amount: Decimal;
  try {
    amount = new Decimal(trimmed);
  } catch {
    return null;
  }
  if (!amount.isFinite() || amount.lte(0)) return null;
  if (suffix.toUpperCase() === 'USD') return amount.toString();
  try {
    const mark = new Decimal(markPrice);
    if (!mark.isFinite() || mark.lte(0)) return null;
    return amount.mul(mark).toString();
  } catch {
    return null;
  }
}
