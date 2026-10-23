import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { createServer } from 'vite';

const playwrightPath = process.argv[2];
if (!playwrightPath) throw new Error('Usage: node scripts/verify-browser.mjs <installed-playwright/index.mjs> [chromium.exe]');
const { chromium } = await import(pathToFileURL(resolve(playwrightPath)).href);
const output = resolve('docs/verification');
await mkdir(output, { recursive: true });
function serveFixture(request, response, next) {
  if (!request.url?.startsWith('/__verify/') && !request.url?.startsWith('/trade/')) return next();
  const simulator = request.url.startsWith('/trade/');
  const variants = { news: 'Georgia,serif', forum: 'Arial,sans-serif', research: 'system-ui,sans-serif' };
  const kind = request.url.split('/').at(-1);
  response.setHeader('Content-Type', 'text/html');
  response.end(`<!doctype html><html lang="en"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Synthetic browser verification fixture</title>
  <style>body{margin:0;background:#f5f3ed;color:#222;font:18px/1.6 ${variants[kind] ?? 'system-ui'};}main{max-width:640px;margin:36px auto;padding:16px}button{background:pink;color:red}h2{font-size:64px}input{font-size:16px}p{margin:24px 0}</style>
  <main><h1>Browser test fixture: $BTC</h1><p id="copy">Read about $BTC and $ETH before testing a position.</p><pre>Skipped $BTC</pre><input value="$ETH" aria-label="Fixture input"><a href="https://example.invalid/BTC">https://example.invalid/BTC</a>
  ${simulator ? '<label>USD <input id="collateral-amount" aria-label="Size" value="1000"></label><button data-tutorial="leverage">10x</button><button data-tutorial="margin-mode">Cross</button><button class="text-primary">Long/Buy</button><button>Short/Sell</button>' : ''}</main>
  <script>window.__before = document.querySelector('#copy').getBoundingClientRect().toJSON();</script>
  <script type="module">${simulator ? "import {mountSimulator} from '/src/content/simulator.ts'; mountSimulator();" : "import '/src/content/index.ts';"}</script></html>`);
}
const server = await createServer({ configFile: false, root: process.cwd(), plugins: [{ name: 'verification-fixtures', configureServer(server) { server.middlewares.use(serveFixture); } }], server: { host: '127.0.0.1', port: 4187, strictPort: true, watch: { ignored: ['**/.superpowers/**', '**/docs/verification/**'] } } });
await server.listen();
const browser = await chromium.launch({ headless: true, executablePath: process.argv[3], args: ['--disable-background-networking'] });
const context = await browser.newContext({ viewport: { width: 1100, height: 900 } });
const checks = [];
const errors = [];
context.on('page', (page) => page.on('pageerror', (error) => errors.push(error.message)));
await context.route('**/*', (route) => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
await context.addInitScript(() => {
  const snapshot = { symbol: 'BTC-USD', baseAsset: 'BTC', markPrice: '100', changePercent: '2.5', fundingRate: '0.0000125', nextFundingTime: Date.now() + 3_600_000, openInterest: '500', quoteVolume: '100000', quotePrecision: 8, fetchedAt: Date.now(), tiers: [{ maxNotional: '1000000', mmr: '0.01', maintenanceAmount: '0', maxLeverage: 20 }] };
  const replay = { status: 'survived', events: [], firstLiquidationAt: null, worstDrawdownPct: '-5.00', remainingSize: '5', candles: 43200, entryPrice: '100', entrySource: 'slipped', slippage: { vwap: '100', slippageBps: '0', partial: true, filledUsd: '500', snapshotAt: Date.now() }, requestedSizeUsd: '1000', replaySizeUsd: '500' };
  const summary = { notional: '500', initialMargin: '50', maintenanceMargin: '5', liquidationPrice: '90.95454545', fee: '0.25', fundingPerDay: '-0.15', maxLeverage: 20, leverageClamped: false };
  window.__fixture = { snapshot, replay, summary };
  window.__marketState = 'ready';
  window.__pending = [];
  window.__opened = [];
  window.__saved = [];
  window.__marketCalls = 0;
  const market = () => ({ state: window.__marketState, snapshot: ['ready', 'offline-cached'].includes(window.__marketState) ? snapshot : undefined, cachedAt: Date.now(), message: 'Fixture connection error' });
  window.chrome = {
    runtime: { sendMessage: async (message) => {
      if (message.type === 'claim:get-pending') return window.__blankGhostError ? { ok: false, error: { code: 'INVALID_INPUT', message: '' } } : { ok: true, value: null };
      if (message.type === 'jev:key-status') return { ok: true, value: { configured: false } };
      if (message.type === 'ghost:list' || message.type === 'receipt:list') return { ok: true, value: [] };
      if (message.type === 'settings:get') return { enabled: window.__initialEnabled ?? true, allSites: true, sites: {} };
      if (message.type === 'registry:get') return { generatedAt: '', source: '', symbols: ['BTC', 'ETH'].map((symbol) => ({ baseAsset: symbol, symbol: `${symbol}-USD`, quotePrecision: 8, highConfidence: false })) };
      if (message.type === 'market:get') { window.__marketCalls += 1; return market(); }
      if (message.type === 'market:extras') return { error: 'Optional fixture data unavailable' };
      if (message.type === 'open:market') { window.__opened.push(message.symbol); return { ok: true }; }
      if (message.type === 'watchlist:get') {
        const rows = [{ baseAsset: 'BTC', symbol: 'BTC-USD', lastPrice: '100', changePercent: '2.50', fundingRate: '0.000125' }, { baseAsset: 'ETH', symbol: 'ETH-USD', lastPrice: '50', changePercent: '-1.20', fundingRate: '-0.00002' }];
        return window.__watchlistError ? { error: 'Offline fixture' } : { movers: rows, funding: rows, fetchedAt: Date.now() };
      }
      if (message.type === 'replay:run' || message.type === 'simulate:run') {
        const scenario = { ...replay, requestedSizeUsd: message.sizeUsd };
        const response = window.__replayError ? { error: 'Incomplete fixture history' } : message.marginMode === 'isolated' ? { error: 'Isolated margin is not supported' } : message.type === 'simulate:run' ? { replay: scenario, summary, markPrice: '100', marginMode: 'cross', approximate: true, tiersApproximate: false, extras: null } : scenario;
        if (window.__holdReplay) return new Promise((resolve) => window.__pending.push(() => resolve(response)));
        return response;
      }
      return {};
    }, onMessage: { addListener() {} } },
    storage: { local: { get: async () => ({}), set: async (value) => window.__saved.push(value) }, onChanged: { addListener: (callback) => { window.__settingsChanged = callback; } } },
    tabs: { query: async () => [{ url: 'http://127.0.0.1:4187/' }], onActivated: { addListener() {} }, onUpdated: { addListener() {} } },
  };
});

async function shadow(page) {
  const client = await context.newCDPSession(page);
  const { root } = await client.send('DOM.getDocument', { depth: -1, pierce: true });
  function find(node) {
    if (node.shadowRoots?.some((root) => root.shadowRootType === 'closed')) return node.shadowRoots.find((root) => root.shadowRootType === 'closed');
    for (const child of node.children ?? []) { const found = find(child); if (found) return found; }
    return null;
  }
  const closed = find(root);
  assert.ok(closed, 'The product uses a closed shadow root');
  const { object } = await client.send('DOM.resolveNode', { backendNodeId: closed.backendNodeId });
  return async (fn, ...args) => {
    const response = await client.send('Runtime.callFunctionOn', { objectId: object.objectId, functionDeclaration: fn.toString(), arguments: args.map((value) => ({ value })), returnByValue: true, awaitPromise: true });
    if (response.exceptionDetails) throw new Error(response.exceptionDetails.text);
    return response.result.value;
  };
}

async function click(page, root, selector) {
  await root(async function () { await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))); await Promise.all([...this.querySelectorAll('*')].flatMap((el) => el.getAnimations()).map((animation) => animation.finished.catch(() => undefined))); });
  const box = await root(function (selector) { const el = this.querySelector(selector); el.scrollIntoView({ block: 'nearest' }); const rect = el.getBoundingClientRect(); return { x: rect.x, y: rect.y, width: rect.width, height: rect.height }; }, selector);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}

async function waitRoot(root, predicate, message) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (await root(predicate)) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`${message}: ${await root(function () { return this.textContent.slice(-1600); })}`);
}

try {
  const disabledPage = await context.newPage();
  await disabledPage.addInitScript(() => { window.__initialEnabled = false; });
  await disabledPage.goto('http://127.0.0.1:4187/__verify/news');
  await disabledPage.waitForFunction(() => typeof window.__settingsChanged === 'function');
  assert.equal(await disabledPage.locator('[data-strike-ticker]').count(), 0);
  await disabledPage.evaluate(() => window.__settingsChanged({ settings: { newValue: { enabled: true, allSites: true, sites: {} } } }, 'local'));
  await disabledPage.waitForFunction(() => document.querySelectorAll('[data-strike-ticker]').length === 2, undefined, { timeout: 3000 });
  checks.push('Enabling after a disabled page load starts detection without reloading');
  await disabledPage.locator('[data-strike-ticker]').first().hover();
  await disabledPage.evaluate(() => window.__settingsChanged({ settings: { newValue: { enabled: false, allSites: true, sites: {} } } }, 'local'));
  await disabledPage.waitForTimeout(250);
  assert.equal(await disabledPage.evaluate(() => window.__marketCalls), 0, 'Disabling cancels pending hover work');
  checks.push('Disabling during hover intent cancels the pending card and market request');
  await disabledPage.close();
  for (const kind of ['news', 'forum', 'research']) {
    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:4187/__verify/${kind}`);
    await page.waitForFunction(() => document.querySelectorAll('[data-strike-ticker]').length === 2);
    assert.deepEqual(await page.evaluate(() => document.querySelector('#copy').getBoundingClientRect().toJSON()), await page.evaluate(() => window.__before), 'Highlights must not shift article layout');
    await page.locator('[data-strike-ticker]').first().focus();
    await page.keyboard.press('Enter');
    const root = await shadow(page);
    await waitRoot(root, function () { return this.querySelector('[data-price]').textContent === '$100'; }, 'Ready market card did not render');
    assert.equal(await root(function () { return this.host.shadowRoot; }), null);
    assert.notEqual(await root(function () { return getComputedStyle(this.querySelector('h2')).fontSize; }), '64px', 'Host h2 CSS must not leak');
    assert.match(await root(function () { return getComputedStyle(this.querySelector('.primary')).fontFamily; }), /system-ui/, 'Controls must use the product font');
    assert.match(await root(function () { return this.textContent; }), /Mainnet market data/);
    await click(page, root, '[data-preview]');
    await waitRoot(root, function () { return this.querySelector('[data-replay]').textContent.includes('No liquidation in this replay'); }, 'Replay result did not render');
    assert.match(await root(function () { return this.querySelector('.result-qualification').textContent; }), /Not validated/);
    assert.match(await root(function () { return this.querySelector('.metrics').textContent; }), /\$50/);
    await click(page, root, '[data-preview]');
    await click(page, root, '[data-preview]');
    assert.equal(await root(function () { return this.querySelector('.metrics dd:nth-of-type(2)').textContent; }), '$50', 'Reopening must preserve filled-size replay metrics');
    assert.match(await root(function () { return this.querySelector('.estimate').textContent; }), /Not validated/);
    if (kind === 'news') {
      await page.setViewportSize({ width: 320, height: 700 });
      await page.evaluate(() => window.dispatchEvent(new Event('resize')));
      const fits = await root(function () { const card = this.querySelector('.card'); const rect = card.getBoundingClientRect(); return rect.left >= 0 && rect.right <= innerWidth && card.scrollWidth <= card.clientWidth; });
      assert.ok(fits, 'Card must fit a 320px viewport');
      await page.screenshot({ path: `${output}/card-narrow.png` });
      await click(page, root, '.assumption-details summary');
      assert.equal(await root(function () { return this.querySelector('.assumption-details').open; }), true);
      await click(page, root, '.assumption-details summary');
      await page.setViewportSize({ width: 1100, height: 900 });
      await page.evaluate(() => { window.__holdReplay = true; });
      await click(page, root, '[data-run]');
      await root(function () { const input = this.querySelector('[data-size]'); input.value = '2000'; input.dispatchEvent(new Event('input', { bubbles: true })); });
      await page.evaluate(() => window.__pending.splice(0).forEach((resolve) => resolve()));
      assert.match(await root(function () { return this.querySelector('[data-replay]').textContent; }), /Inputs changed/);
      await root(function () { const input = this.querySelector('[data-size]'); input.value = 'Infinity'; input.dispatchEvent(new Event('input', { bubbles: true })); });
      await click(page, root, '[data-run]');
      assert.match(await root(function () { return this.querySelector('[data-replay]').textContent; }), /positive size/);
      await click(page, root, '[data-handoff]');
      assert.deepEqual(await page.evaluate(() => window.__opened), ['BTC-USD']);
      await page.screenshot({ path: `${output}/card-validation.png` });
    }
    await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(() => document.activeElement?.hasAttribute('data-strike-ticker')), true, 'Escape returns focus to the ticker');
    for (const state of ['loading', 'error', 'not-tradable', 'offline-cached']) {
      await page.evaluate((state) => { window.__marketState = state; }, state);
      await page.keyboard.press('Enter');
      const stateRoot = await shadow(page);
      await waitRoot(stateRoot, function () { return this.querySelector('[data-banner]').textContent.length > 0; }, 'Every state needs visible content');
      assert.equal(await stateRoot(function () { return this.querySelector('[data-preview]').disabled; }), true);
      await page.keyboard.press('Escape');
    }
    checks.push(`${kind}: two highlights; no layout shift; CSS isolation; closed shadow; keyboard; all card states`);
    await page.close();
  }

  const page = await context.newPage();
  await page.goto('http://127.0.0.1:4187/trade/btc');
  await page.waitForSelector('[data-strike-simulator]');
  const root = await shadow(page);
  await click(page, root, '[data-fab]');
  await waitRoot(root, function () { return this.querySelector('[data-result]').textContent.includes('No liquidation'); }, 'Simulator did not render');
  assert.match(await root(function () { return this.querySelector('.assumptions').textContent; }), /estimated fills can differ from execution/);
  await page.evaluate(() => { window.__holdReplay = true; });
  await click(page, root, '[data-run]');
  await root(function () { const input = this.querySelector('[data-leverage]'); input.value = '5'; input.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.evaluate(() => window.__pending.splice(0).forEach((resolve) => resolve()));
  assert.equal(await root(function () { return this.querySelector('[data-result]').textContent; }), '');
  assert.match(await root(function () { return this.querySelector('[data-status]').textContent; }), /Inputs changed/);
  await page.evaluate(() => { window.__holdReplay = false; });
  await click(page, root, '[data-refresh]');
  await waitRoot(root, function () { return this.querySelector('[data-result]').textContent.includes('No liquidation'); }, 'Form refresh failed');
  await page.screenshot({ path: `${output}/simulator.png` });
  const panelBox = await root(function () { const r = this.querySelector('.panel').getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; });
  await page.screenshot({ path: `${output}/simulator-panel.png`, clip: panelBox });
  await page.setViewportSize({ width: 320, height: 700 });
  assert.ok(await root(function () { const panel = this.querySelector('.panel'); return panel.scrollWidth <= panel.clientWidth; }), 'Simulator must fit at 320px');
  await click(page, root, '.model-assumptions summary');
  assert.equal(await root(function () { return this.querySelector('.model-assumptions').open; }), true);
  await click(page, root, '.model-assumptions summary');
  await page.keyboard.press('Escape');
  assert.equal(await root(function () { return this.querySelector('[data-panel]').hidden; }), true);
  checks.push('Simulator: explicit assumptions, form refresh, stale-response rejection, Escape');
  const blankErrorPage = await context.newPage();
  await blankErrorPage.addInitScript(() => { window.__blankGhostError = true; });
  await blankErrorPage.goto('http://127.0.0.1:4187/src/popup/index.html');
  await blankErrorPage.locator('#claim-status:not([hidden])').waitFor();
  assert.match(await blankErrorPage.locator('#claim-status').textContent(), /Request failed/, 'An empty error must have a readable fallback');
  await blankErrorPage.evaluate(() => { const banner = document.getElementById('claim-status'); banner.textContent = ''; banner.hidden = false; });
  assert.equal(await blankErrorPage.locator('#claim-status').isVisible(), false, 'An empty status must not render a red outline');
  await blankErrorPage.close();
  checks.push('Blank error gets readable fallback; empty status has no visible outline');
  await page.goto('http://127.0.0.1:4187/src/popup/index.html');
  assert.equal(await page.locator('.app-nav [data-tab]').count(), 3, 'Primary navigation contains only the three daily workflows');
  const utilities = page.getByLabel('Settings and receipts', { exact: true });
  await utilities.click();
  await page.getByRole('button', { name: 'Receipts', exact: true }).click();
  await page.getByRole('heading', { name: 'Receipts', exact: true }).waitFor();
  assert.equal(await page.locator('#utility-menu').getAttribute('open'), null, 'Selecting a utility closes its disclosure');
  await utilities.click();
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#utility-menu').getAttribute('open'), null);
  assert.equal(await utilities.evaluate((element) => element === document.activeElement), true, 'Escape returns focus to the gear');
  checks.push('Header gear opens Receipts and Settings; selection and Escape close the disclosure');
  await page.getByRole('button', { name: 'Markets', exact: true }).click();
  await page.getByRole('heading', { name: 'Market discovery' }).waitFor();
  await page.getByRole('button', { name: 'Funding', exact: true }).click();
  await page.getByRole('heading', { name: 'Funding extremes' }).waitFor();
  assert.equal(await page.getByRole('heading', { name: 'Top movers' }).count(), 0, 'Only the selected market view is rendered');
  await page.getByRole('button', { name: 'Open BTC market on Strike (mainnet)' }).click();
  assert.deepEqual(await page.evaluate(() => window.__opened), ['BTC-USD']);
  await page.setViewportSize({ width: 320, height: 800 });
  await page.screenshot({ path: `${output}/side-panel.png` });
  await utilities.click();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByLabel('Extension enabled').waitFor();
  await page.getByLabel('Extension enabled').uncheck();
  await page.getByLabel('Detect on all sites').check();
  assert.equal(await page.evaluate(() => window.__saved.length), 2);
  await page.getByRole('button', { name: 'Markets', exact: true }).click();
  await page.evaluate(() => { window.__watchlistError = true; });
  await page.getByRole('button', { name: 'Refresh market data' }).click();
  await page.getByText('Market data unavailable', { exact: true }).waitFor();
  await page.setViewportSize({ width: 320, height: 700 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.screenshot({ path: `${output}/side-panel-error.png` });
  checks.push('Side panel: market view switching, market links, settings disclosure/persistence, refresh error state, 320px layout');
  assert.deepEqual(errors, [], 'Browser console must contain no uncaught errors');
  const report = { fixture: 'Synthetic responses for deterministic UI behavior; not a Strike ground-truth test.', checks, uncaughtErrors: errors };
  await writeFile(`${output}/browser-checks.json`, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
} finally {
  await context.close();
  await browser.close();
  await server.close();
}
