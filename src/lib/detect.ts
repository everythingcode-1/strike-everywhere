import type { SymbolEntry } from '../shared/types';

export interface Match {
  index: number;
  length: number;
  entry: SymbolEntry;
}

const TOKEN = /(?<![A-Za-z0-9])\$?([A-Z][A-Z0-9]{1,11})(?![A-Za-z0-9])/g;

/**
 * Pure text matcher. Uppercase 2-12 char tokens (letters first, digits allowed);
 * ambiguous tokens need a "$". DOM traversal and skip rules live in the content script.
 */
export function findTickerMatches(text: string, registry: Map<string, SymbolEntry>): Match[] {
  const matches: Match[] = [];
  for (const match of text.matchAll(TOKEN)) {
    const entry = registry.get(match[1]);
    if (!entry) continue;
    const prefixed = match[0].startsWith('$');
    if (!prefixed && !entry.highConfidence) continue;
    matches.push({ index: match.index, length: match[0].length, entry });
  }
  return matches;
}
