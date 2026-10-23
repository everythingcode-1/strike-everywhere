import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';

if (!process.argv[2]) throw new Error('Usage: node scripts/verify-unpacked.mjs <installed-playwright/index.mjs> [chromium.exe]');
const { chromium } = await import(pathToFileURL(resolve(process.argv[2])).href);
const extensionPath = resolve('dist');
await mkdir('.superpowers', { recursive: true });
await mkdir('docs/verification', { recursive: true });
const profile = await mkdtemp(join(resolve('.superpowers'), 'unpacked-profile-'));
const article = await readFile('demo/article.html');
const server = createServer((_request, response) => { response.setHeader('Content-Type', 'text/html'); response.end(article); });
await new Promise((resolve) => server.listen(4188, '127.0.0.1', resolve));
const context = await chromium.launchPersistentContext(profile, { headless: true, executablePath: process.argv[3], viewport: { width: 1280, height: 900 }, args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`, '--disable-background-networking'] });
const errors = [];
context.on('page', (page) => page.on('pageerror', (error) => errors.push(error.message)));
context.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
try {
  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
  const id = new URL(worker.url()).hostname;
  await worker.evaluate(() => chrome.storage.local.set({ settings: { enabled: true, allSites: true, sites: {} } }));
  const panel = await context.newPage();
  await panel.goto(`chrome-extension://${id}/src/popup/index.html`);
  const market = await panel.evaluate(() => chrome.runtime.sendMessage({ type: 'market:get', symbol: 'BTC-USD' }));
  assert.equal(market.state, 'ready', JSON.stringify(market));
  assert.ok(market.snapshot.tiers.length);
  assert.equal(typeof market.snapshot.markPrice, 'string');
  const registry = await panel.evaluate(() => chrome.runtime.sendMessage({ type: 'registry:get' }));
  assert.equal(new URL(registry.source).hostname, 'api.strikefinance.org');
  for (const symbol of ['BTC-USD', 'TSLA-USD', 'NVDA-USD']) assert.ok(registry.symbols.some((entry) => entry.symbol === symbol), `${symbol} must be listed`);
  const equity = await panel.evaluate(() => chrome.runtime.sendMessage({ type: 'market:get', symbol: 'TSLA-USD' }));
  assert.equal(equity.state, 'ready', JSON.stringify(equity));
  assert.ok(equity.snapshot.tiers.length);
  const extras = await panel.evaluate(() => chrome.runtime.sendMessage({ type: 'market:extras', symbol: 'TSLA-USD' }));
  assert.equal(typeof extras.basisPct, 'string', JSON.stringify(extras));
  assert.equal(typeof extras.spreadBps, 'string', JSON.stringify(extras));
  const watchlist = await panel.evaluate(() => chrome.runtime.sendMessage({ type: 'watchlist:get' }));
  assert.ok(watchlist.movers.length && watchlist.funding.length, JSON.stringify(watchlist));
  assert.equal(await panel.locator('#data-source').textContent(), 'Mainnet');
  const page = await context.newPage();
  await page.goto('http://127.0.0.1:4188/article.html');
  await page.waitForSelector('[data-strike-ticker="BTC"]', { timeout: 20_000 }).catch(async (error) => {
    console.log(JSON.stringify({ errors, storage: await worker.evaluate(() => chrome.storage.local.get('settings')), highlights: await page.locator('[data-strike-ticker]').count(), body: await page.locator('body').innerText() }));
    throw error;
  });
  await page.waitForSelector('[data-strike-ticker="TSLA"]');
  const ticker = page.locator('[data-strike-ticker="TSLA"]').first();
  await ticker.hover();
  await page.waitForTimeout(180);
  const client = await context.newCDPSession(page);
  const { root: dom } = await client.send('DOM.getDocument', { depth: -1, pierce: true });
  function closedRoot(node) {
    const closed = node.shadowRoots?.find((root) => root.shadowRootType === 'closed');
    if (closed) return closed;
    for (const child of node.children ?? []) { const found = closedRoot(child); if (found) return found; }
    return null;
  }
  const shadow = closedRoot(dom);
  assert.ok(shadow);
  const { object } = await client.send('DOM.resolveNode', { backendNodeId: shadow.backendNodeId });
  const read = async (fn) => {
    const result = await client.send('Runtime.callFunctionOn', { objectId: object.objectId, functionDeclaration: fn.toString(), returnByValue: true });
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  for (let i = 0; i < 200; i++) {
    if (await read(function () { return !this.querySelector('[data-preview]').disabled; })) break;
    await page.waitForTimeout(50);
  }
  assert.equal(await read(function () { return this.querySelector('[data-preview]').disabled; }), false, 'The live card must be ready');
  assert.match(await read(function () { return this.textContent; }), /Mainnet market data/);
  await page.screenshot({ path: 'docs/verification/unpacked-card.png' });
  const cardBox = await read(function () { const r = this.querySelector('.card').getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; });
  await page.screenshot({ path: 'docs/verification/card-overview-live.png', clip: cardBox });
  const replay = await panel.evaluate(() => chrome.runtime.sendMessage({ type: 'replay:run', symbol: 'BTC-USD', sizeUsd: '1000', leverage: '5', side: 'long' }));
  assert.ok('error' in replay || (replay.candles === 43_200 && ['survived', 'liquidated'].includes(replay.status)));
  const previewBox = await read(function () { const r = this.querySelector('[data-preview]').getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; });
  await page.mouse.click(previewBox.x + previewBox.width / 2, previewBox.y + previewBox.height / 2);
  for (let i = 0; i < 500; i++) {
    if (await read(function () { return this.querySelector('[data-replay]').getAttribute('aria-busy') !== 'true'; })) break;
    await page.waitForTimeout(50);
  }
  await page.keyboard.press('Tab');
  const equityReplayUi = await read(function () { return this.querySelector('[data-replay]').textContent.trim(); });
  assert.ok(equityReplayUi.length, 'An equity replay must render a result or an explicit failure');
  const expandedBox = await read(function () { const r = this.querySelector('.card').getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; });
  await page.screenshot({ path: 'docs/verification/card-stress-live.png', clip: expandedBox });
  await panel.setViewportSize({ width: 360, height: 900 });
  await panel.screenshot({ path: 'docs/verification/side-panel-live.png' });
  const extensions = await context.newPage();
  await extensions.goto('chrome://extensions/');
  await extensions.locator('extensions-item').first().waitFor();
  const warnings = await extensions.evaluate((id) => {
    const manager = document.querySelector('extensions-manager');
    const items = manager?.shadowRoot?.querySelector('extensions-item-list')?.shadowRoot?.querySelectorAll('extensions-item') ?? [];
    const item = [...items].find((item) => item.id === id);
    const data = item?.data;
    return data ? { installWarnings: data.installWarnings ?? [], manifestErrors: data.manifestErrors ?? [], runtimeErrors: data.runtimeErrors ?? [] } : null;
  }, id);
  assert.ok(warnings, 'Extension diagnostics must be available');
  assert.deepEqual(warnings.installWarnings, []);
  assert.deepEqual(warnings.manifestErrors, []);
  assert.deepEqual(warnings.runtimeErrors, []);
  assert.deepEqual(errors, []);
  const report = { network: 'mainnet', registry: { source: registry.source, count: registry.symbols.length }, market: { symbol: market.snapshot.symbol, markPrice: market.snapshot.markPrice, quotePrecision: market.snapshot.quotePrecision, tiers: market.snapshot.tiers.length }, equity: { symbol: equity.snapshot.symbol, markPrice: equity.snapshot.markPrice, tiers: equity.snapshot.tiers.length, extras, replayUi: equityReplayUi }, watchlist: { movers: watchlist.movers.length, funding: watchlist.funding.length }, replay, warnings, browserErrors: errors, note: 'Live public market-data integration only. No real account positions were queried.' };
  await writeFile('docs/verification/unpacked-checks.json', `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
} finally {
  await context.close();
  await new Promise((resolve) => server.close(resolve));
}
