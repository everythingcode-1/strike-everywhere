import { describe, expect, it } from 'vitest';
import { parseGhostMessage } from '../src/ghost/messages';
import { sanitizeSource } from '../src/ghost/service';

describe('privileged message validation', () => {
  it('accepts a valid create payload', () => {
    expect(parseGhostMessage({
      type: 'ghost:create',
      requestId: 'req_12345678',
      claimId: 'claim_1',
      symbol: 'BTC-USD',
      side: 'long',
      inputMode: 'collateral',
      amount: '100',
      leverage: 10,
      feeRate: '0.0005',
    })).toMatchObject({ type: 'ghost:create', symbol: 'BTC-USD', leverage: 10 });
  });

  it('rejects unknown actions, oversized fields and missing consent', () => {
    expect(parseGhostMessage({ type: 'ghost:execute-anything' })).toBeNull();
    expect(parseGhostMessage({ type: 'jev:analyze', claimId: 'x'.repeat(101), consent: true })).toBeNull();
    expect(parseGhostMessage({ type: 'jev:analyze', claimId: 'claim_1' })).toBeNull();
    expect(parseGhostMessage({ type: 'jev:key-save', provider: 'openrouter', key: 'sk-or-v1-test-key', model: 'openai/gpt-4o-mini' })).toMatchObject({ provider: 'openrouter', model: 'openai/gpt-4o-mini' });
    expect(parseGhostMessage({ type: 'jev:key-save', provider: 'nope', key: 'sk-or-v1-test-key' })).toBeNull();
    expect(parseGhostMessage({ type: 'jev:key-save', provider: 'openrouter', key: 'sk-or-v1-test-key', model: 42 })).toBeNull();
    expect(parseGhostMessage({ type: 'ghost:preview', symbol: 'BTC-USD', side: 'long', inputMode: 'collateral', amount: '100', leverage: 0, feeRate: '0.0005' })).toBeNull();
  });
});

describe('source sanitation', () => {
  it('strips credentials, query and fragment from http(s) URLs', () => {
    expect(sanitizeSource('https://user:pass@www.coindesk.com/markets/btc?utm=1#top')).toEqual({
      sourceDomain: 'coindesk.com',
      sourceUrl: 'https://www.coindesk.com/markets/btc',
    });
  });

  it('rejects non-web URLs', () => {
    expect(() => sanitizeSource('javascript:alert(1)')).toThrow();
    expect(() => sanitizeSource('chrome://extensions')).toThrow();
    expect(() => sanitizeSource('not a url')).toThrow();
  });
});
