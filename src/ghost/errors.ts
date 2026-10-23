import type { GhostErrorCode } from '../shared/ghost-types';

export class GhostError extends Error {  constructor(
    readonly code: GhostErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'GhostError';
  }
}

export function toGhostError(error: unknown): GhostError {
  if (error instanceof GhostError) return error;
  return new GhostError('INTERNAL', error instanceof Error ? error.message : 'Request failed');
}
