import type { TradeStatus } from '../shared/ghost-types';

export type FreshnessBasis = 'source' | 'receive' | 'closed';

export interface FreshnessLabel {
  text: string;
  stale: boolean;
  basis: FreshnessBasis;
}

/** Source time is authoritative; receive time is a labelled fallback only. */
export function freshnessLabel(input: {
  status: TradeStatus;
  sourceTime: number | null;
  observedAt: number;
  now: number;
}): FreshnessLabel {
  if (input.status === 'closed') {
    return { text: 'Closed record', stale: false, basis: 'closed' };
  }
  const basis = input.sourceTime ?? input.observedAt;
  const age = Math.max(0, input.now - basis);
  const seconds = Math.floor(age / 1000);
  const prefix = input.sourceTime === null ? 'Receive time only — ' : '';
  return {
    text: age > 15_000
      ? `${prefix}Stale — ${seconds}s old; refresh before closing`
      : `${prefix}Within 15 seconds (${seconds}s old)`,
    stale: age > 15_000,
    basis: input.sourceTime === null ? 'receive' : 'source',
  };
}
