// Regenerates src/data/symbols.generated.json from Strike exchangeInfo.
// Run: npm run gen:symbols
import { writeFile } from 'node:fs/promises';

const API = 'https://api.strikefinance.org';

// Uppercase tokens that are unambiguous enough to highlight without a "$" prefix.
const HIGH_CONFIDENCE = new Set([
  'TSLA', 'NVDA', 'GOOGL', 'AAOI', 'CRCL', 'SNDK', 'SKHYNIX', 'CXMT', 'ZHIPU',
  'UNITREE', 'MINIMAX', 'SPCX', 'DRAM', 'BTC', 'ETH', 'XRP', 'BNB', 'ZEC',
  'SOL', 'ADA', 'SP500', 'NAS100', 'XAU', 'XAG', 'WTI',
]);

const res = await fetch(`${API}/price/v2/exchangeInfo`);
if (!res.ok) throw new Error(`exchangeInfo ${res.status}`);
const body = await res.json();

const symbols = body.symbols
  .filter((s) => s.status === 'trading')
  .map((s) => ({
    baseAsset: s.baseAsset,
    symbol: s.symbol,
    quotePrecision: s.quotePrecision,
    highConfidence: HIGH_CONFIDENCE.has(s.baseAsset),
  }))
  .sort((a, b) => a.baseAsset.localeCompare(b.baseAsset));

await writeFile(
  new URL('../src/data/symbols.generated.json', import.meta.url),
  JSON.stringify({ generatedAt: new Date().toISOString(), source: `${API}/price/v2/exchangeInfo`, symbols }, null, 2) + '\n',
);
console.log(`wrote ${symbols.length} symbols`);
