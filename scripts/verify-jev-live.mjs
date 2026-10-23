import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

if (!process.argv[2] || !process.argv[3]) throw new Error('Usage: node scripts/verify-jev-live.mjs <playwright> <chromium> [key-file]');
const { chromium } = await import(pathToFileURL(resolve(process.argv[2])).href);
const key = (await readFile(process.argv[4] ?? '.env.txt', 'utf8')).match(/sk-or-[A-Za-z0-9_-]+/)?.[0];
if (!key) throw new Error('No OpenRouter key found in the supplied file.');
const tempRoot = resolve(tmpdir());
const scratch = await mkdtemp(join(tempRoot, 'strike-jev-live-'));
const extension = join(scratch, 'extension');
let context;
try {
  await cp(resolve('dist'), extension, { recursive: true });
  const manifestPath = join(extension, 'manifest.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  manifest.host_permissions.push('https://openrouter.ai/*');
  manifest.optional_host_permissions = manifest.optional_host_permissions.filter(origin => origin !== 'https://openrouter.ai/*');
  await writeFile(manifestPath, JSON.stringify(manifest));
  console.log('Prepared isolated extension with OpenRouter access.');
  context = await chromium.launchPersistentContext(join(scratch, 'profile'), {
    headless: true, executablePath: process.argv[3], viewport: { width: 400, height: 900 },
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`, '--disable-background-networking'],
  });
  console.log('Browser launched.');
  context.setDefaultTimeout(15000);
  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker', { timeout: 15000 });
  const id = new URL(worker.url()).host;
  const panel = await context.newPage();
  const errors = [];
  panel.on('pageerror', error => errors.push(error.message.replaceAll(key, '[redacted]')));
  await panel.goto(`chrome-extension://${id}/src/popup/index.html`);
  console.log('Extension panel loaded.');
  await panel.locator('#utility-menu summary').click();
  await panel.locator('#utility-menu [data-tab="settings"]').click();
  await panel.locator('#ai-provider').selectOption('openrouter');
  assert.equal(await panel.locator('#ai-model').inputValue(), 'jev-latest');
  if (process.argv[5]) await panel.locator('#ai-model').fill(process.argv[5]);
  await panel.locator('#jev-key').fill(key);
  await panel.locator('#jev-key-save').click();
  await panel.waitForFunction(() => document.querySelector('#jev-key-status')?.textContent.includes('OpenRouter key saved'));
  console.log('OpenRouter key configured in isolated profile.');
  assert.equal(await panel.locator('#jev-key').inputValue(), '');
  const cases = [
    { text: 'Bitcoin will rise over the next seven days.', direction: 'bullish', testability: 'testable' },
    { text: 'Prakiraan Mingguan Bitcoin: BTC Memperpanjang Pullback saat Arus Masuk ETF Bertabrakan dengan Sentimen Risk-Off', direction: 'bearish', testability: 'partially_specified' },
    { text: 'Bitcoin', direction: 'non_trading', testability: 'not_testable' },
  ];
  const results = [];
  for (const sample of cases) {
    const claim = {
    schemaVersion: 1, id: 'claim_jev_live', text: 'Bitcoin will rise over the next seven days.',
    sourceDomain: 'example.com', sourceUrl: 'https://example.com/claim', capturedAt: Date.now(), captureSequence: Date.now()*1000,
    candidateSymbols: ['BTC-USD'], selectedSymbol: 'BTC-USD', analysisVersion: null,
    analysis: { status: 'not_requested', direction: null, testability: null, suggestedSymbols: [], summary: null, errorCode: null, analyzedAt: null, provider: null, model: null },
  };
  claim.text = sample.text;
  await panel.evaluate(claim => new Promise((resolve, reject) => {
    const request = indexedDB.open('strike-everywhere-ledger');
    request.onerror = () => reject(new Error('Could not open fixture database'));
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains('records')) request.result.createObjectStore('records');
    };
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction('records', 'readwrite');
      tx.objectStore('records').put(claim, `claim:${claim.id}`);
      tx.objectStore('records').put(claim.id, 'claim:pending');
      tx.oncomplete = () => {db.close();resolve();};
      tx.onerror = () => reject(new Error('Could not save fixture claim'));
    };
  }), claim);
  console.log('Synthetic claim stored.');
  await panel.reload();
  await panel.locator('#jev-consent').check();
  await panel.locator('#jev-analyze').click();
  console.log('Submitted synthetic claim through Analyze button.');
  await panel.waitForFunction(() => document.querySelector('#jev-result')?.textContent.includes('typesafe/jev-'), { timeout: 30000 });
  const analysis = await panel.evaluate(async claimId => {
    const response = await chrome.runtime.sendMessage({ type: 'claim:get-pending' });
    if (!response.ok || response.value?.id !== claimId) throw new Error('Claim unavailable');
    return response.value.analysis;
  }, claim.id);
  assert.equal(analysis.status, 'ready');
  assert.equal(analysis.direction, sample.direction);
  assert.equal(analysis.testability, sample.testability);
  assert.ok(analysis.suggestedSymbols.includes('BTC-USD'));
  assert.match(analysis.model, /^typesafe\/jev-/);
  const resultText = await panel.locator('#jev-result').innerText();
  assert.doesNotMatch(resultText, /No verified Strike market matched/);
  results.push({ input: sample.text, analysis, resultText });
  if (sample.direction === 'bearish') await panel.screenshot({ path: 'docs/verification/jev-headline-result.png', fullPage: true });
  if (sample.direction === 'non_trading') {
    assert.match(resultText, /RELATED MARKET/i);
    await worker.evaluate(async claim => {
      try { await chrome.runtime.sendMessage({ type: 'claim:captured', claim }); } catch {}
    }, { ...claim, analysis: { ...analysis, suggestedSymbols: [] } });
    await panel.waitForFunction(() => document.querySelector('#jev-result')?.textContent.includes('Detected market: BTC'));
    assert.match(await panel.locator('#claim-candidates').innerText(), /BTC/);
    assert.doesNotMatch(await panel.locator('#jev-result').innerText(), /No verified Strike market matched/);
  }
  }
  assert.deepEqual(errors, []);
  const cleared = await panel.evaluate(async () => {
    await chrome.runtime.sendMessage({ type: 'jev:key-clear' });
    const storage = await chrome.storage.local.get(['jev:config', 'jev:api-key']);
    return Object.keys(storage).length === 0;
  });
  assert.equal(cleared, true);
  const report = { testedAt: new Date().toISOString(), transport: 'OpenRouter System One', permissionTest: 'Host pregranted in isolated test manifest; native optional-permission dialog not exercised', detectedMarketFallback: 'Passed: BTC remains available when AI returns no symbols', results, keyCleared: cleared, pageErrors: errors };
  await writeFile('docs/verification/jev-openrouter-live.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally {
  if (context) {
    for (const page of context.pages()) {
      if (page.url().startsWith('chrome-extension://')) {
        await page.evaluate(() => chrome.storage.local.remove(['jev:config','jev:api-key'])).catch(() => {});
      }
    }
    await context.close();
  }
  const verified = resolve(scratch);
  if (verified.startsWith(tempRoot + sep) && verified.split(sep).at(-1).startsWith('strike-jev-live-')) {
    await rm(verified, { recursive: true, force: true });
  }
}
