import type { TradeStatus } from '../shared/ghost-types';
import { GhostError } from './errors';

const ALLOWED: Record<TradeStatus, TradeStatus[]> = {
  open: ['pending_exit', 'closed', 'unresolved'],
  pending_exit: ['closed', 'open', 'unresolved'],
  unresolved: ['open', 'pending_exit', 'closed'],
  closed: [],
};

export function assertTransition(from: TradeStatus, to: TradeStatus): void {
  if (from === to) return;
  if (!ALLOWED[from].includes(to)) {
    throw new GhostError('NOT_OPEN', `Trade cannot move from ${from} to ${to}.`);
  }
}

export function shouldRecordGap(lastObservedAt: number | null, now: number, gapMs: number): boolean {
  return lastObservedAt !== null && now - lastObservedAt > gapMs;
}
