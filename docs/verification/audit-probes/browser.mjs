import assert from 'node:assert/strict';
import {chromium} from 'file:///C:/Users/HP/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import {mkdtemp,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const profile=await mkdtemp(resolve('.superpowers/unpacked-profile-audit-ui-'));
const dist=resolve('dist');const context=await chromium.launchPersistentContext(profile,{headless:true,executablePath:'C:/Users/HP/AppData/Local/ms-playwright/chromium-1248/chrome-win64/chrome.exe',viewport:{width:400,height:900},args:[`--disable-extensions-except=${dist}`,`--load-extension=${dist}`,'--disable-background-networking']});
const claim={schemaVersion:1,id:'audit-ui-capture-001',text:'BTC synthetic audit capture',sourceDomain:'example.invalid',sourceUrl:'https://example.invalid/audit',capturedAt:Date.now(),candidateSymbols:['BTC-USD'],selectedSymbol:'BTC-USD',analysis:{status:'not_requested',direction:null,testability:null,suggestedSymbols:[],summary:null,errorCode:null,analyzedAt:null,provider:null,model:null},analysisVersion:null};
try{
 const worker=context.serviceWorkers()[0]??await context.waitForEvent('serviceworker');const id=new URL(worker.url()).hostname;
 const panel=await context.newPage();await panel.goto(`chrome-extension://${id}/src/popup/index.html`);
 await panel.locator('#market-select option[value="BTC-USD"]').waitFor({state:'attached'});
 await panel.waitForFunction(()=>!document.querySelector('#claim-status').hidden);
 await panel.locator('[data-tab="settings"]').click();
 await worker.evaluate(async claim=>{try{await chrome.runtime.sendMessage({type:'claim:captured',claim})}catch{}},claim);
 await panel.waitForFunction(()=>document.querySelector('#claim-text').textContent==='BTC synthetic audit capture');
 const result=await panel.evaluate(()=>({syntheticCapture:true,activeTab:document.querySelector('[data-tab][aria-current="page"]').getAttribute('data-tab'),discoverHidden:document.querySelector('#view-discover').hidden,claimRendered:document.querySelector('#claim-text').textContent==='BTC synthetic audit capture',focusedId:document.activeElement?.id,banner:document.querySelector('#claim-status').textContent}));
 assert.equal(result.activeTab,'discover');assert.equal(result.discoverHidden,false);assert.equal(result.focusedId,'claim-title');
 await panel.screenshot({path:'docs/verification/audit-2026-10-23-capture-settings-fixed.png'});
 await writeFile('docs/verification/audit-2026-10-23-capture-settings-fixed.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
 await panel.reload();await panel.locator('#market-select option[value="BTC-USD"]').waitFor({state:'attached'});await panel.waitForFunction(()=>!document.querySelector('#claim-status').hidden);
 await panel.locator('#amount').fill('20');await panel.locator('#leverage').fill('2');
 await panel.getByRole('button',{name:'Review simulation'}).click();
 await panel.locator('#preview-result').waitFor({state:'visible',timeout:20000});
 await panel.getByRole('button',{name:'Create virtual trade',exact:true}).click();
 await panel.locator('#trade-detail .status.open').waitFor({timeout:20000});
 const freshness=()=>panel.locator('#trade-detail .kv-row').filter({hasText:'Mark freshness'}).locator('dd').textContent();
 const before=await freshness();await panel.clock.install({time:new Date()});await panel.clock.fastForward(20000);await panel.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));const after=await freshness();
 assert.match(before,/Within 15 seconds/);assert.match(after,/Stale/);
 const freshReport={realMainnetTradeInCleanProfile:true,pageClockAdvancedMs:20000,before,after,note:'No network refresh performed; the freshness label uses source time and ages with the page clock.'};
 await writeFile('docs/verification/audit-2026-10-23-freshness-fixed.json',JSON.stringify(freshReport,null,2)+'\n');
 await panel.screenshot({path:'docs/verification/audit-2026-10-23-freshness-fixed.png'});console.log(JSON.stringify(freshReport,null,2));

}finally{await context.close()}
