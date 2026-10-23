import type { SymbolEntry } from '../shared/types';
import { MAX_CLAIM_CANDIDATES } from './constants';
import { findTickerMatches } from '../lib/detect';

const ALIASES: ReadonlyArray<readonly [RegExp, string]> = [
  [/\bbitcoin\b/gi, 'BTC'],
  [/\bethereum\b/gi, 'ETH'],
  [/\bsolana\b/gi, 'SOL'],
  [/\bdogecoin\b/gi, 'DOGE'],
  [/\bripple\b/gi, 'XRP'],
  [/\bcardano\b/gi, 'ADA'],
  [/\bbinance coin\b/gi, 'BNB'],
  [/\btesla\b/gi, 'TSLA'],
  [/\bnvidia\b/gi, 'NVDA'],
];

/**
 * Pure resolver: explicit tickers follow the detector's ambiguity rules; curated names are added
 * only when the live Strike registry lists the market. Apple/Meta/Near/Strike are deliberately
 * absent — they must be picked manually.
 */
export function resolveCandidates(text: string, entries: SymbolEntry[]): SymbolEntry[] {
  const byAsset = new Map(entries.map((entry) => [entry.baseAsset, entry]));
  const found = new Map<string, SymbolEntry>();
  for (const match of findTickerMatches(text, byAsset)) {
    found.set(match.entry.baseAsset, match.entry);
  }
  for (const [pattern, baseAsset] of ALIASES) {
    const entry = byAsset.get(baseAsset);
    if (entry && pattern.test(text)) found.set(entry.baseAsset, entry);
    pattern.lastIndex = 0;
  }
  return [...found.values()].slice(0, MAX_CLAIM_CANDIDATES);
}
