import {describe,it,expect,vi} from 'vitest';
import {writeFileSync} from 'node:fs';
const memory=vi.hoisted(()=>new Map());
const now=Date.now();
const raw={symbol:'BTC-USD',baseAsset:'BTC',quoteAsset:'USDT',marginAsset:'USDT',contractType:'PERPETUAL',status:'trading',quotePrecision:8,orderType:['MARKET'],filters:[{filterType:'PRICE_FILTER',tickSize:'1'},{filterType:'LOT_SIZE',stepSize:'0.01',minQty:'0.01',maxQty:'1000'},{filterType:'MIN_NOTIONAL',notional:'1'}]};
vi.mock('idb-keyval',()=>({createStore:()=>({}),get:async(k)=>memory.get(k),set:async(k,v)=>memory.set(k,structuredClone(v)),setMany:async(entries)=>{for(const[k,v]of entries)memory.set(k,structuredClone(v))},getMany:async(keys)=>keys.map(k=>memory.get(k)),keys:async()=>[...memory.keys()]}));
vi.mock('../../../src/lib/cache',()=>({readCache:async()=>undefined,writeCache:async()=>{}}));
vi.mock('../../../src/lib/symbols',()=>({loadRegistry:async()=>({symbols:[{symbol:'BTC-USD',baseAsset:'BTC',quotePrecision:8,highConfidence:true}]})}));
vi.mock('../../../src/lib/api',()=>({fetchExchangeInfo:async()=>[raw],fetchPremiumIndex:async()=>({markPrice:'100',indexPrice:'100',fundingRate:'0',nextFundingTime:now+3600000,sourceTime:Date.now()}),fetchDepth:async()=>({bids:[['95','100']],asks:[['105','100']],sourceTime:Date.now(),time:Date.now()})}));
import {previewTrade,createTrade} from '../../../src/ghost/service';
import {validateBook,executeExit} from '../../../src/ghost/execution';
describe('read-only audit probes (fixed expectations)',()=>{
 it('preview and immediate mark-based summary agree',async()=>{
  const input={symbol:'BTC-USD',side:'long' as const,inputMode:'notional' as const,amount:'105',leverage:5,feeRate:'0.0005'};
  const preview=await previewTrade(input);const detail=await createTrade({...input,requestId:'audit-entry-fixed-0001'});
  const report={synthetic:true,mark:'100',bestBid:'95',bestAsk:'105',quantity:detail.trade.quantity,entryPrice:preview.entryPrice,previewNetAtEntry:preview.netAtEntry,immediateGross:detail.summary.grossPnl,immediateNet:detail.summary.netExcludingUnknownFunding,entryFee:preview.entryFee,previewExitFee:preview.estimatedExitFee,summaryExitFee:detail.summary.exitFee};
  writeFileSync('docs/verification/audit-2026-10-23-preview-fixed.json',JSON.stringify(report,null,2)+'\n');
  expect(preview.netAtEntry).toBe('-5.1025');
  expect(preview.grossPnlAtMark).toBe('-5');
  expect(detail.summary.netExcludingUnknownFunding).toBe(preview.netAtEntry);
 });
 it('exit refuses a single fill above the current per-order maximum',()=>{
  const book=validateBook([['100','100']],[['101','100']]);
  expect(()=>executeExit('long',book,'2',{quantityStep:'0.01',minQuantity:'0.01',maxQuantity:'1',minNotional:'1'})).toThrow(/per-order maximum/i);
  const small=executeExit('long',book,'0.5',{quantityStep:'0.01',minQuantity:'0.01',maxQuantity:'1',minNotional:'1000'});
  writeFileSync('docs/verification/audit-2026-10-23-exit-limit-fixed.json',JSON.stringify({synthetic:true,maxQuantity:'1',rejectedQuantity:'2',smallCloseQuantity:small.quantity,smallCloseStillAllowedBelowMinNotional:true},null,2)+'\n');
  expect(small.quantity).toBe('0.5');
 });
});
