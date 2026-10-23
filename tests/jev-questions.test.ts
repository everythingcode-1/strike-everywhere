import { describe, expect, it } from 'vitest';
import { buildQuestions, parseJevResult } from '../src/jev/questions';

const valid = {
  model: 'jev-latest',
  answers: {
    direction: { type: 'choice', choice: 'bearish', confidence: 0.8, probabilities: {} },
    testability: { type: 'choice', choice: 'testable', confidence: 0.7, probabilities: {} },
    asset_0: { type: 'noul', noul: 0.91 },
    asset_1: { type: 'noul', noul: 0.2 },
  },
};

describe('Jev structured answers', () => {
  it('requires explicit future test conditions before calling a headline fully testable', () => {
    const parsed = parseJevResult({ ...valid, answers: {
      ...valid.answers, has_test_conditions: { type: 'noul', noul: 0.05 },
    } }, ['BTC-USD']);
    expect(parsed.testability).toBe('partially_specified');
    expect(parsed.summary).toContain('choose a time window');
    expect(parsed.summary).not.toContain('testability 70%');
  });

  it('keeps fully specified predictions testable and explains confidence', () => {
    const parsed = parseJevResult({ ...valid, answers: {
      ...valid.answers, has_test_conditions: { type: 'noul', noul: 0.99 },
    } }, ['BTC-USD']);
    expect(parsed.testability).toBe('testable');
    expect(parsed.summary).toContain('not the probability of a profitable trade');
  });

  it('asks asset relevance from the selected text rather than exchange listing knowledge', () => {
    const questions = buildQuestions(['BTC-USD']);
    expect(questions.asset_0.instructions).toContain('already verified');
    expect(questions.testability.instructions).toContain('time window');
    expect(questions.has_test_conditions.type).toBe('noul');
  });

  it('accepts only enumerable, validated fields', () => {
    const parsed = parseJevResult(valid, ['BTC-USD', 'ETH-USD']);
    expect(parsed).toMatchObject({
      direction: 'bearish',
      testability: 'testable',
      suggestedSymbols: ['BTC-USD'],
      model: 'jev-latest',
    });
    expect(parsed.summary).toContain('argues the asset should fall');
    expect(parsed.summary).toContain('clear outcome');
    expect(parsed.summary).toContain('Model confidence');
  });

  it('rejects malformed bodies and unknown choices', () => {
    expect(() => parseJevResult(null, [])).toThrow();
    expect(() => parseJevResult({ model: 'x', answers: { ...valid.answers, direction: { type: 'choice', choice: 'buy' } } }, [])).toThrow();
    expect(() => parseJevResult({ model: 'x', answers: { ...valid.answers, asset_0: { type: 'noul', noul: 2 } } }, ['BTC-USD'])).toThrow();
  });

  it('treats provider text as data and never renders it as HTML', () => {
    const parsed = parseJevResult({
      ...valid,
      answers: {
        ...valid.answers,
        direction: { type: 'choice', choice: 'bullish' },
        injected: { type: 'choice', choice: '<img src=x onerror=alert(1)>' },
      },
    }, ['BTC-USD']);
    expect(parsed.summary).not.toContain('<img');
    expect(parsed.direction).toBe('bullish');
  });
});
