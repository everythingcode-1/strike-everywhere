import Decimal from 'decimal.js';
import { GhostError } from './errors';

export function parseDecimal(value: string, label: string): Decimal {
  let decimal: Decimal;
  try {
    decimal = new Decimal(value);
  } catch {
    throw new GhostError('INVALID_INPUT', `${label} is not a valid decimal.`);
  }
  if (!decimal.isFinite()) throw new GhostError('INVALID_INPUT', `${label} must be finite.`);
  return decimal;
}

export function parsePositive(value: string, label: string): Decimal {
  const decimal = parseDecimal(value, label);
  if (decimal.lte(0)) throw new GhostError('INVALID_INPUT', `${label} must be greater than zero.`);
  return decimal;
}

export function decimalString(value: Decimal): string {
  return value.toString();
}
