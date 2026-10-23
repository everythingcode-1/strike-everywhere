import Decimal from 'decimal.js';
import { API_BASE, DEFAULT_ALLOWLIST, DEFAULT_SETTINGS } from '../shared/constants';
import type { Settings } from '../shared/types';
import type { WatchlistResult, WatchlistRow } from '../shared/v2-types';
import { mountGhostUi } from './ghost-ui';
import './popup.css';

const SETTINGS_KEY = 'settings';

function el<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing element #${id}`);
  return element as T;
}

const enabled = el<HTMLInputElement>('enabled');
const allSites = el<HTMLInputElement>('all-sites');
const siteRow = el<HTMLDivElement>('site-row');
const siteName = el<HTMLSpanElement>('site-name');
const siteToggle = el<HTMLInputElement>('site-toggle');
const hint = el<HTMLParagraphElement>('hint');
const watchlist = el<HTMLElement>('watchlist');
const watchlistBody = el<HTMLDivElement>('watchlist-body');
const watchlistRefresh = el<HTMLButtonElement>('watchlist-refresh');
el<HTMLElement>('data-source').textContent = API_BASE.includes('testnet') ? 'Testnet' : 'Mainnet';

let settings: Settings = { ...DEFAULT_SETTINGS, sites: {} };
let host = '';
let loadingWatchlist = false;
let marketView: 'movers' | 'funding' = 'movers';
let latestWatchlist: WatchlistResult | null = null;

function currentSiteEnabled(): boolean {
  if (host in settings.sites) return settings.sites[host];
  if (settings.allSites) return true;
  return DEFAULT_ALLOWLIST.some((domain) => host === domain || host.endsWith(`.${domain}`));
}

function render(): void {
  enabled.checked = settings.enabled;
  allSites.checked = settings.allSites;
  if (!host) {
    siteRow.hidden = true;
  } else {
    siteRow.hidden = false;
    siteName.textContent = host;
    siteToggle.checked = currentSiteEnabled();
    siteToggle.disabled = !settings.enabled;
  }
  hint.textContent = settings.allSites
    ? 'Detection runs on every http(s) page. Use the site switch to silence noisy sites.'
    : 'Detection is off outside the default finance allowlist. Turn on “Detect on all sites” or enable this site.';
}

async function save(): Promise<void> {
  await chrome.storage.local.set({ [SETTINGS_KEY]: settings });
  render();
}

function renderWatchlistRow(row: WatchlistRow, kind: 'movers' | 'funding'): HTMLLIElement {
  const li = document.createElement('li');
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'market-row';
  button.setAttribute('aria-label', `Open ${row.baseAsset} market on Strike (mainnet)`);
  button.addEventListener('click', () => {
    void chrome.runtime.sendMessage({ type: 'open:market', symbol: row.symbol }).catch(() => showMessage('Market link unavailable', 'Please open the market directly on Strike.'));
  });
  const symbol = document.createElement('span');
  symbol.className = 'watchlist-symbol';
  symbol.textContent = row.baseAsset;
  const price = document.createElement('span');
  price.className = 'watchlist-price';
  try {
    const value = new Decimal(row.lastPrice);
    const decimals = value.abs().gte(1) ? 2 : 6;
    if (!value.isFinite()) throw new Error('Invalid market price');
    const [whole, fraction] = value.toFixed(decimals).split('.');
    price.textContent = `$${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${fraction}`;
  } catch {
    price.textContent = 'Unavailable';
  }
  const metric = document.createElement('span');
  let value: Decimal;
  try {
    value = kind === 'funding' ? new Decimal(row.fundingRate).mul(100) : new Decimal(row.changePercent);
  } catch {
    value = new Decimal(0);
  }
  metric.className = value.isNegative() ? 'watchlist-change down' : value.gt(0) ? 'watchlist-change up' : 'watchlist-change';
  metric.textContent = kind === 'funding'
    ? `${value.gte(0) ? '+' : ''}${value.toFixed(4)}%/h`
    : `${value.gte(0) ? '+' : ''}${value.toFixed(2)}%`;
  button.setAttribute('aria-label', `Open ${row.baseAsset} market on Strike (mainnet), price ${price.textContent}, ${kind === 'funding' ? 'funding' : '24 hour change'} ${metric.textContent}`);
  button.append(symbol, price, metric);
  li.append(button);
  return li;
}

function renderWatchlistList(title: string, rows: WatchlistRow[], kind: 'movers' | 'funding'): HTMLElement {
  const section = document.createElement('div');
  const heading = document.createElement('h3');
  heading.textContent = title;
  const list = document.createElement('ul');
  for (const row of rows) list.append(renderWatchlistRow(row, kind));
  if (rows.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'message';
    empty.textContent = 'No markets to display on this network.';
    list.append(empty);
  }
  section.append(heading, list);
  return section;
}

function showMessage(title: string, description: string): void {
  const box = document.createElement('div');
  box.className = 'message';
  const heading = document.createElement('strong');
  heading.textContent = title;
  const text = document.createElement('p');
  text.textContent = description;
  box.append(heading, text);
  watchlistBody.replaceChildren(box);
}

function renderMarketView(): void {
  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-view]')) {
    button.setAttribute('aria-pressed', String(button.dataset.view === marketView));
  }
  if (!latestWatchlist) return;
  watchlistBody.replaceChildren(renderWatchlistList(
    marketView === 'movers' ? 'Top movers' : 'Funding extremes',
    latestWatchlist[marketView], marketView,
  ));
}

async function loadWatchlist(): Promise<void> {
  if (loadingWatchlist) return;
  loadingWatchlist = true;
  watchlistRefresh.disabled = true;
  watchlist.hidden = false;
  watchlistBody.setAttribute('aria-busy', 'true');
  if (!latestWatchlist) showMessage('Loading markets', 'Fetching public prices and funding from Strike.');
  try {
    const result = await chrome.runtime.sendMessage({ type: 'watchlist:get' }) as WatchlistResult | { error: string };
    if ('error' in result) {
      latestWatchlist = null;
      showMessage('Market data unavailable', 'Check your connection, then refresh to try again.');
      return;
    }
    latestWatchlist = result;
    renderMarketView();
  } catch {
    latestWatchlist = null;
    showMessage('Market data unavailable', 'Check your connection, then refresh to try again.');
  } finally {
    loadingWatchlist = false;
    watchlistRefresh.disabled = false;
    watchlistBody.setAttribute('aria-busy', 'false');
  }
}

async function refreshHost(): Promise<void> {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.url) {
      const url = new URL(tab.url);
      host = url.protocol === 'http:' || url.protocol === 'https:' ? url.hostname.replace(/^www\./, '') : '';
    } else {
      host = '';
    }
  } catch {
    host = '';
  }
}

async function boot(): Promise<void> {
  const stored = await chrome.storage.local.get(SETTINGS_KEY);
  const saved = stored[SETTINGS_KEY] as Settings | undefined;
  settings = { ...DEFAULT_SETTINGS, ...saved, sites: saved?.sites ?? {} };

  await refreshHost();
  chrome.tabs.onActivated.addListener(() => { void refreshHost().then(render); });
  chrome.tabs.onUpdated.addListener((_tabId, info) => {
    if (info.status === 'complete' || info.url) void refreshHost().then(render);
  });

  enabled.addEventListener('change', () => {
    settings.enabled = enabled.checked;
    void save();
  });
  allSites.addEventListener('change', () => {
    settings.allSites = allSites.checked;
    void save();
  });
  siteToggle.addEventListener('change', () => {
    if (!host) return;
    settings.sites[host] = siteToggle.checked;
    void save();
  });
  watchlistRefresh.addEventListener('click', () => void loadWatchlist());
  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-view]')) {
    button.addEventListener('click', () => {
      marketView = button.dataset.view === 'funding' ? 'funding' : 'movers';
      renderMarketView();
    });
  }
  render();
  void loadWatchlist();
  mountGhostUi();
  window.setInterval(() => void loadWatchlist(), 30_000);
}

void boot();
