import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseOpenRouterResult } from '../src/jev/questions';
import { analyzeClaim } from '../src/jev/client';
import type { CapturedClaim } from '../src/shared/ghost-types';

const candidates = ['BTC-USD', 'ETH-USD'];

afterEach(() => vi.unstubAllGlobals());

const claim: CapturedClaim = {
  schemaVersion: 1, id: 'claim-fixture', text: 'Bitcoin will rise over the next seven days.',
  sourceDomain: 'example.com', sourceUrl: 'https://example.com/claim', capturedAt: 1,
  captureSequence: 1, candidateSymbols: candidates, selectedSymbol: null, analysisVersion: null,
  analysis: { status: 'not_requested', direction: null, testability: null, suggestedSymbols: [], summary: null, errorCode: null, analyzedAt: null, provider: 'openrouter', model: null },
};
const fakeKey = 'sk-or-v1-fixture-not-a-real-key';

describe('OpenRouter transport', () => {
  it.each([null, 'jev-latest', 'typesafe/jev-1.14', '~typesafe/jev-latest'])('routes Jev %s through System One', async (model) => {
    const request = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({
      model: 'typesafe/jev-1.14-20261014',
      answers: {
        direction: { type: 'choice', choice: 'bullish', confidence: 0.98 },
        testability: { type: 'choice', choice: 'testable', confidence: 0.9 },
        asset_0: { type: 'noul', noul: 0.99 },
        asset_1: { type: 'noul', noul: 0.01 },
      },
      usage: { input_tokens: 100, output_tokens: 20 },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', request);
    const result = await analyzeClaim({ provider: 'openrouter', key: fakeKey, model }, claim, candidates);
    expect(result).toMatchObject({ status: 'ready', direction: 'bullish', suggestedSymbols: ['BTC-USD'], model: 'typesafe/jev-1.14-20261014' });
    const [url, init] = request.mock.calls[0];
    expect(String(url)).toBe('https://openrouter.ai/api/v1/systemone');
    const body = JSON.parse(String(init?.body));
    expect(body.state).toEqual({ selectedClaim: claim.text, verifiedCandidateSymbols: 'BTC-USD, ETH-USD' });
    expect(body.questions.direction.type).toBe('choice');
    expect(body.messages).toBeUndefined();
    expect(init?.credentials).toBe('omit');
    expect(init?.redirect).toBe('error');
  });

  it('keeps explicitly selected chat models on the chat endpoint', async () => {
    const request = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({ choices: [{ message: { content: '{"direction":"bullish","testability":"testable","markets":["BTC-USD"]}' } }] }), { status: 200 }));
    vi.stubGlobal('fetch', request);
    expect(await analyzeClaim({ provider: 'openrouter', key: fakeKey, model: 'openai/gpt-4o-mini' }, claim, candidates)).toMatchObject({ status: 'ready' });
    expect(String(request.mock.calls[0]?.[0])).toBe('https://openrouter.ai/api/v1/chat/completions');
  });
});

describe('OpenRouter structured result', () => {
  it('accepts fenced JSON and keeps only verified candidates', () => {
    const parsed = parseOpenRouterResult(
      '```json\n{"direction":"Bullish","testability":"testable","markets":["BTC","ETH-USD","DOGE-USD"]}\n```',
      candidates,
      'openai/gpt-4o-mini',
    );
    expect(parsed).toMatchObject({
      direction: 'bullish',
      testability: 'testable',
      suggestedSymbols: ['BTC-USD', 'ETH-USD'],
      model: 'openai/gpt-4o-mini',
    });
    expect(parsed.summary).toContain('argues the asset should rise');
  });

  it('rejects unknown enums, malformed JSON and provider HTML', () => {
    expect(() => parseOpenRouterResult('{"direction":"buy","testability":"testable"}', candidates, 'x')).toThrow();
    expect(() => parseOpenRouterResult('{"direction":"bullish","testability":"maybe"}', candidates, 'x')).toThrow();
    expect(() => parseOpenRouterResult('not json', candidates, 'x')).toThrow();
    expect(() => parseOpenRouterResult('<img src=x onerror=alert(1)>', candidates, 'x')).toThrow();
    expect(() => parseOpenRouterResult('{"direction":"bullish","testability":"testable","markets":[1]}', candidates, 'x')).toThrow();
  });

  it('never repeats provider text in the summary', () => {
    const parsed = parseOpenRouterResult(
      JSON.stringify({
        direction: 'bearish',
        testability: 'partially_specified',
        markets: ['BTC-USD'],
        injected: '<img src=x onerror=alert(1)>',
      }),
      candidates,
      'x',
    );
    expect(parsed.summary).not.toContain('<img');
    expect(parsed.summary).toContain('partly specified');
  });
});
