export const API_BASE_MAINNET = 'https://api.strikefinance.org';
export const API_BASE_TESTNET = 'https://api-v2-testnet.strikefinance.org';

// Equities only exist on mainnet, so that is the default. Testnet stays available for crypto.
export const API_BASE = API_BASE_MAINNET;
export const APP_BASE = 'https://app.strikefinance.org';

export const MARKET_TTL_MS = 30_000;
export const REGISTRY_TTL_MS = 24 * 60 * 60 * 1000;
export const CANDLE_LIMIT = 1500;
export const REPLAY_DAYS = 30;
export const REPLAY_CANDLES = 43_200;
export const DAY_MS = 24 * 60 * 60 * 1000;

// Strike's published taker fee for the demo tier; displayed as an estimate.
export const TAKER_FEE_RATE = '0.0005';
export const DEFAULT_SIZE_USD = '5000';
export const DEFAULT_LEVERAGE = '10';

export const STRIKE_APP_HOSTS = ['app.strikefinance.org'];
export const DEPTH_TTL_MS = 5_000;
export const KLINES_1H_TTL_MS = 5 * 60_000;
export const WATCHLIST_TTL_MS = 30_000;
export const DEFAULT_DEPTH_LIMIT = 100;
export const SPARKLINE_POINTS = 60;

export const MAX_HIGHLIGHTS = 40;
export const HOVER_OPEN_MS = 150;
export const HOVER_CLOSE_MS = 200;
export const MUTATION_DEBOUNCE_MS = 300;

export const DISCLAIMER = 'Data from Strike. Not financial advice.';

export const DEFAULT_ALLOWLIST = [
  'finance.yahoo.com',
  'bloomberg.com',
  'reuters.com',
  'coindesk.com',
  'theblock.co',
  'decrypt.co',
  'cointelegraph.com',
  'coingecko.com',
  'x.com',
  'substack.com',
  'medium.com',
];

export const DEFAULT_SETTINGS = {
  enabled: true,
  allSites: false,
  sites: {} as Record<string, boolean>,
};
