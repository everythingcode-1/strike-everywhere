import { describe, expect, it } from 'vitest';
import { parseLeverage, parseSide, parseSize, parseTradeSymbol } from '../src/lib/ticket-reader';

describe('ticket reader', () => {
  it('parses the symbol from the trade URL', () => {
    expect(parseTradeSymbol('/trade/btc')).toBe('BTC-USD');
    expect(parseTradeSymbol('/trade/eth-usd')).toBe('ETH-USD');
    expect(parseTradeSymbol('/portfolio')).toBeNull();
  });

  it('parses the leverage label', () => {
    expect(parseLeverage('10x')).toBe('10');
    expect(parseLeverage('Cross 10x')).toBe('10');
    expect(parseLeverage('x')).toBeNull();
  });

  it('parses the active side from the tab classes', () => {
    expect(parseSide('bg-primary-muted text-primary', 'text-theme')).toBe('long');
    expect(parseSide('text-theme', 'bg-primary-muted text-primary')).toBe('short');
    expect(parseSide('bg-primary-muted text-primary', 'bg-primary-muted text-primary')).toBeNull();
    expect(parseSide('', '')).toBeNull();
    expect(parseSide('hover:text-primary', 'text-theme')).toBeNull();
  });

  it('parses base-asset size into USD notional', () => {
    expect(parseSize('0.5', 'BTC', '83000')).toBe('41500');
    expect(parseSize('5000', 'USD', '83000')).toBe('5000');
    expect(parseSize('$5,000', 'USD', '83000')).toBe('5000');
    expect(parseSize('', 'USD', '83000')).toBeNull();
  });
});
