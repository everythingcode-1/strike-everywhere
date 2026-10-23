import Decimal from 'decimal.js';
import type { SymbolRegistry } from '../shared/types';
import type { WatchlistRow } from '../shared/v2-types';

export interface TickerRow {
  symbol: string;
  lastPrice: string;
  priceChangePercent: string;
  quoteVolume: string;
}

export interface PremiumRow {
  symbol: string;
  markPrice: string;
  fundingRate: string;
  nextFundingTime: number;
}

export function buildWatchlist(
  tickers: TickerRow[],
  premiums: PremiumRow[],
  registry: SymbolRegistry,
  limit = 5,
): { movers: WatchlistRow[]; funding: WatchlistRow[] } {
  const known = new Map(registry.symbols.map((entry) => [entry.symbol, entry]));
  const premiumBySymbol = new Map(premiums.map((row) => [row.symbol, row]));
  const rows: WatchlistRow[] = [];
  for (const ticker of tickers) {
    const entry = known.get(ticker.symbol);
    if (!entry) continue;
    const premium = premiumBySymbol.get(ticker.symbol);
    rows.push({
      symbol: ticker.symbol,
      baseAsset: entry.baseAsset,
      lastPrice: ticker.lastPrice,
      changePercent: ticker.priceChangePercent,
      fundingRate: premium?.fundingRate ?? '0',
      quoteVolume: ticker.quoteVolume,
    });
  }
  const movers = [...rows]
    .sort((a, b) => new Decimal(b.changePercent).abs().comparedTo(new Decimal(a.changePercent).abs()))
    .slice(0, limit);
  const funding = [...rows]
    .sort((a, b) => new Decimal(b.fundingRate).abs().comparedTo(new Decimal(a.fundingRate).abs()))
    .slice(0, limit);
  return { movers, funding };
}
