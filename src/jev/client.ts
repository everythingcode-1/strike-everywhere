import { APIError, AuthenticationError, PermissionDeniedError, TypeSafeClient, type Fetch } from '@typesafe-ai/sdk';
import type { AiProvider, CapturedClaim, ClaimAnalysis } from '../shared/ghost-types';
import { GhostError } from '../ghost/errors';
import { JEV_MODEL, JEV_TIMEOUT_MS, TYPESAFE_ORIGIN } from '../ghost/constants';
import type { AiConfig } from './keys';
import { analyzeWithOpenRouter } from './openrouter';
import { buildQuestions, parseJevResult, type ParsedAnalysis } from './questions';

const restrictedFetch: Fetch = (input, init) => {
  const url = new URL(input);
  if (url.protocol !== 'https:' || url.origin !== TYPESAFE_ORIGIN) {
    throw new Error('Blocked provider origin.');
  }
  return fetch(input, { ...init, credentials: 'omit', redirect: 'error' });
};

function failure(provider: AiProvider, error: unknown): ClaimAnalysis {
  let errorCode = 'AI_UNAVAILABLE';
  if (error instanceof GhostError) {
    errorCode = error.code;
  } else if (error instanceof AuthenticationError || (error instanceof APIError && error.status === 401)) {
    errorCode = 'KEY_MISSING';
  } else if (error instanceof PermissionDeniedError || (error instanceof APIError && error.status === 403)) {
    errorCode = 'PERMISSION_DENIED';
  }
  return {
    status: 'failed',
    direction: null,
    testability: null,
    suggestedSymbols: [],
    summary: null,
    errorCode,
    analyzedAt: Date.now(),
    provider,
    model: null,
  };
}

async function analyzeWithTypeSafe(
  config: AiConfig,
  claim: CapturedClaim,
  candidateSymbols: string[],
): Promise<ParsedAnalysis> {
  const client = new TypeSafeClient({
    apiKey: config.key,
    baseURL: TYPESAFE_ORIGIN,
    defaultModel: JEV_MODEL,
    dangerouslyAllowBrowser: true,
    compression: false,
    timeout: JEV_TIMEOUT_MS,
    logLevel: 'off',
    retry: { maxRetries: 0 },
    fetch: restrictedFetch,
  });
  const result = await client.systemOne({
    state: {
      selectedClaim: claim.text,
      verifiedCandidateSymbols: candidateSymbols.join(', '),
    },
    questions: buildQuestions(candidateSymbols),
  });
  return parseJevResult(result, candidateSymbols);
}

/** Only this module sees the key. Errors are mapped without provider bodies or headers. */
export async function analyzeClaim(
  config: AiConfig,
  claim: CapturedClaim,
  candidateSymbols: string[],
): Promise<ClaimAnalysis> {
  try {
    const parsed = config.provider === 'openrouter'
      ? await analyzeWithOpenRouter(config, claim, candidateSymbols)
      : await analyzeWithTypeSafe(config, claim, candidateSymbols);
    return {
      status: 'ready',
      direction: parsed.direction,
      testability: parsed.testability,
      suggestedSymbols: parsed.suggestedSymbols,
      summary: parsed.summary,
      errorCode: null,
      analyzedAt: Date.now(),
      provider: config.provider,
      model: parsed.model,
    };
  } catch (error) {
    return failure(config.provider, error);
  }
}
