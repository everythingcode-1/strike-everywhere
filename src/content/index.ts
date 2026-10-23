import type { Settings, SymbolEntry, SymbolRegistry } from '../shared/types';
import type { ExtensionMessage, MarketExtras, MarketResultV2, ReplayResultV2 } from '../shared/v2-types';
import {
  DEFAULT_ALLOWLIST,
  HOVER_CLOSE_MS,
  HOVER_OPEN_MS,
  MAX_HIGHLIGHTS,
  MUTATION_DEBOUNCE_MS,
  STRIKE_APP_HOSTS,
} from '../shared/constants';
import { findTickerMatches } from '../lib/detect';
import { registryIndex } from '../lib/symbols';
import { StrikeCard } from './card';
import { mountSimulator, unmountSimulator } from './simulator';

const HIGHLIGHT_ATTR = 'data-strike-ticker';
const SKIP_TAGS = new Set(['CODE', 'PRE', 'SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'INPUT', 'SELECT', 'OPTION', 'BUTTON', 'SVG']);
const SPAN_STYLE = 'display:inline;padding:0;margin:0;border:0;background:none;font:inherit;color:inherit;'
  + 'text-decoration:underline dotted;text-underline-offset:2px;cursor:help;';

let settings: Settings | null = null;
let registry = new Map<string, SymbolEntry>();
let card: StrikeCard | null = null;
let activeSpan: HTMLElement | null = null;
let activeEntry: SymbolEntry | null = null;
let openTimer: number | undefined;
let closeTimer: number | undefined;
let highlightCount = 0;
let observer: MutationObserver | null = null;
let scanTimer: number | undefined;
const pending = new Set<Node>();

function hostname(): string {
  return location.hostname.replace(/^www\./, '');
}

function siteEnabled(): boolean {
  if (!settings?.enabled) return false;
  const host = hostname();
  if (host in settings.sites) return settings.sites[host];
  if (settings.allSites) return true;
  return DEFAULT_ALLOWLIST.some((domain) => host === domain || host.endsWith(`.${domain}`));
}

function send<T>(message: ExtensionMessage): Promise<T> {
  return chrome.runtime.sendMessage(message) as unknown as Promise<T>;
}

function skipped(node: Text, firstHeading: Element | null): boolean {
  if (firstHeading?.contains(node)) return true;
  let element: Element | null = node.parentElement;
  while (element) {
    if (SKIP_TAGS.has(element.tagName)) return true;
    if (element instanceof HTMLElement && element.isContentEditable) return true;
    if (element.hasAttribute('contenteditable')) return true;
    if (element.hasAttribute(HIGHLIGHT_ATTR)) return true;
    if (element.tagName === 'A') {
      const text = (element.textContent ?? '').trim();
      const href = element.getAttribute('href') ?? '';
      if (/^https?:\/\//.test(text) || (href.length > 0 && text === href)) return true;
    }
    element = element.parentElement;
  }
  return false;
}

function wrap(node: Text, index: number, length: number, entry: SymbolEntry): void {
  const range = document.createRange();
  range.setStart(node, index);
  range.setEnd(node, index + length);
  const span = document.createElement('span');
  span.setAttribute(HIGHLIGHT_ATTR, entry.baseAsset);
  span.style.cssText = SPAN_STYLE;
  span.tabIndex = 0;
  span.setAttribute('role', 'button');
  span.setAttribute('aria-label', `${entry.baseAsset} on Strike`);
  const text = document.createTextNode(node.nodeValue?.slice(index, index + length) ?? entry.baseAsset);
  span.append(text);
  range.deleteContents();
  range.insertNode(span);
  span.addEventListener('mouseenter', () => scheduleOpen(span, entry));
  span.addEventListener('mouseleave', scheduleClose);
  span.addEventListener('focus', () => { span.style.outline = '2px solid currentColor'; });
  span.addEventListener('blur', () => {
    span.style.outline = '';
  });
  span.addEventListener('click', (event) => {
    event.preventDefault();
    openNow(span, entry);
  });
  span.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openNow(span, entry, true);
    }
    if (event.key === 'Escape') closeCard();
  });
  highlightCount += 1;
}

function scan(root: Node): void {
  if (highlightCount >= MAX_HIGHLIGHTS) return;
  if (root.nodeType === Node.TEXT_NODE) {
    scanText(root as Text, document.querySelector('h1'));
    return;
  }
  if (root.nodeType !== Node.ELEMENT_NODE && root.nodeType !== Node.DOCUMENT_NODE) return;
  const firstHeading = document.querySelector('h1');
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node && highlightCount < MAX_HIGHLIGHTS) {
    const text = node as Text;
    if (text.nodeValue && text.nodeValue.trim().length > 0 && !skipped(text, firstHeading)) {
      scanText(text, firstHeading);
    }
    node = walker.nextNode();
  }
}

function scanText(node: Text, firstHeading: Element | null): void {
  const text = node.nodeValue;
  if (!text || skipped(node, firstHeading)) return;
  const matches = findTickerMatches(text, registry).slice(0, MAX_HIGHLIGHTS - highlightCount);
  for (let i = matches.length - 1; i >= 0; i -= 1) {
    const match = matches[i];
    wrap(node, match.index, match.length, match.entry);
  }
}

function scheduleOpen(span: HTMLElement, entry: SymbolEntry): void {
  window.clearTimeout(closeTimer);
  window.clearTimeout(openTimer);
  openTimer = window.setTimeout(() => openNow(span, entry), HOVER_OPEN_MS);
}

function scheduleClose(): void {
  window.clearTimeout(openTimer);
  window.clearTimeout(closeTimer);
  closeTimer = window.setTimeout(() => {
    if (card?.host.matches(':hover')) return;
    closeCard();
  }, HOVER_CLOSE_MS);
}

function openNow(span: HTMLElement, entry: SymbolEntry, stealFocus = false): void {
  window.clearTimeout(openTimer);
  window.clearTimeout(closeTimer);
  if (!span.isConnected || !settings?.enabled || !siteEnabled()) return;
  if (activeSpan === span && card) return;
  closeCard();
  activeSpan = span;
  activeEntry = entry;
  const current = new StrikeCard({
    onClose: closeCard,
    onOpenMarket: () => {
      if (activeEntry) void send({ type: 'open:market', symbol: activeEntry.symbol });
    },
    onReplay: ({ sizeUsd, leverage, side, seq }) => {
      if (!activeEntry || !card) return;
      const target = card;
      send<ReplayResultV2 | { error: string }>({ type: 'replay:run', symbol: activeEntry.symbol, sizeUsd, leverage, side })
        .then((result) => {
          if (card !== target) return;
          if ('error' in result) target.setReplay('error', undefined, result.error, seq);
          else target.setReplay('ready', result, undefined, seq);
        })
        .catch((error: unknown) => {
          if (card === target) target.setReplay('error', undefined, error instanceof Error ? error.message : 'request failed', seq);
        });
    },
  });
  card = current;
  current.setLoading(entry.symbol);
  current.show(span.getBoundingClientRect());
  if (stealFocus) current.focus();
  current.host.addEventListener('mouseenter', () => window.clearTimeout(closeTimer));
  current.host.addEventListener('mouseleave', scheduleClose);
  document.addEventListener('keydown', onKeyDown, true);
  document.addEventListener('scroll', reposition, true);
  window.addEventListener('resize', reposition);

  const target = current;
  send<MarketResultV2>({ type: 'market:get', symbol: entry.symbol })
    .then((result) => {
      if (card !== target) return;
      target.setMarket(result);
      if (result.state === 'ready' || result.state === 'offline-cached') {
        send<MarketExtras | { error: string }>({ type: 'market:extras', symbol: entry.symbol })
          .then((extras) => {
            if (card === target) target.setExtras('error' in extras ? null : extras);
          })
          .catch(() => {
            if (card === target) target.setExtras(null);
          });
      }
    })
    .catch((error: unknown) => {
      if (card === target) {
        target.setMarket({ state: 'error', message: error instanceof Error ? error.message : 'Could not load market data.' });
      }
    });
}

function onKeyDown(event: KeyboardEvent): void {
  if (event.key === 'Escape') closeCard();
}

function reposition(): void {
  if (card && activeSpan) card.reposition(activeSpan.getBoundingClientRect());
}

function closeCard(): void {
  window.clearTimeout(openTimer);
  window.clearTimeout(closeTimer);
  if (!card) return;
  const restoreFocus = document.activeElement === card.host;
  const trigger = activeSpan;
  card.host.remove();
  card = null;
  activeSpan = null;
  activeEntry = null;
  document.removeEventListener('keydown', onKeyDown, true);
  document.removeEventListener('scroll', reposition, true);
  window.removeEventListener('resize', reposition);
  if (restoreFocus && trigger?.isConnected) trigger.focus();
}

function scheduleScan(nodes: Iterable<Node>): void {
  for (const node of nodes) pending.add(node);
  window.clearTimeout(scanTimer);
  scanTimer = window.setTimeout(() => {
    const batch = [...pending];
    pending.clear();
    for (const node of batch) {
      if (node.isConnected) scan(node);
    }
  }, MUTATION_DEBOUNCE_MS);
}

function startObserver(): void {
  observer?.disconnect();
  observer = new MutationObserver((mutations) => {
    const added: Node[] = [];
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) added.push(node);
    }
    if (added.length > 0) scheduleScan(added);
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

function removeHighlights(): void {
  for (const span of document.querySelectorAll<HTMLElement>(`[${HIGHLIGHT_ATTR}]`)) {
    span.replaceWith(span.textContent ?? '');
  }
  highlightCount = 0;
}

async function applySettings(): Promise<void> {
  closeCard();
  if (STRIKE_APP_HOSTS.includes(hostname())) {
    if (settings?.enabled) mountSimulator();
    else unmountSimulator();
    return;
  }
  if (!settings?.enabled || !siteEnabled()) {
    observer?.disconnect();
    observer = null;
    window.clearTimeout(scanTimer);
    pending.clear();
    removeHighlights();
    return;
  }
  if (registry.size === 0) registry = registryIndex(await send<SymbolRegistry>({ type: 'registry:get' }));
  if (!settings?.enabled || !siteEnabled()) return;
  highlightCount = document.querySelectorAll(`[${HIGHLIGHT_ATTR}]`).length;
  scan(document.body);
  if (!observer) startObserver();
}

async function boot(): Promise<void> {
  try {
    settings = await send<Settings>({ type: 'settings:get' });
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local' || !changes.settings) return;
      settings = changes.settings.newValue as Settings;
      void applySettings().catch(() => closeCard());
    });
    if (!settings?.enabled) return;
    if (STRIKE_APP_HOSTS.includes(hostname())) {
      mountSimulator();
      return;
    }
    await applySettings();
  } catch {
    // Extension reloaded or revoked: leave the page untouched.
  }
}
if (document.body) {
  void boot();
} else {
  window.addEventListener('DOMContentLoaded', () => void boot(), { once: true });
}
