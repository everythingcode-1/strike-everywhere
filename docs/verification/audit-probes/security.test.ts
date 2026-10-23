import { beforeEach, expect, it, vi } from 'vitest';
const memory = vi.hoisted(() => ({ claims: new Map(), pending: undefined, records: new Map(), creates: new Map(), closes: new Map(), registryCalls: [] as Array<() => void>, deferRegistry: false }));
vi.mock('../../../src/ghost/store', () => ({
 withLedgerLock: (work) => work(),
 saveClaim: async (claim) => {
  const current = memory.pending ? memory.claims.get(memory.pending) : undefined;
  const latest = !current || claim.captureSequence >= (current.captureSequence ?? 0);
  memory.claims.set(claim.id, claim);
  if (latest) memory.pending = claim.id;
  return latest;
 },
 updateClaim: async (claim) => memory.claims.set(claim.id, claim),
 getClaim: async (id) => memory.claims.get(id),
 getPendingClaim: async () => memory.claims.get(memory.pending),
 getTradeRecord: async (id) => memory.records.get(id),
 listTradeRecords: async () => [...memory.records.values()],
 findCreateRequest: async (id) => memory.creates.get(id),
 findCloseRequest: async (id) => memory.closes.get(id),
 saveNewTrade: async (record) => {memory.records.set(record.trade.id, record); memory.creates.set(record.trade.creationRequestId, record.trade.id);},
 saveTradeUpdate: async (record, req) => {memory.records.set(record.trade.id, record); if(req) memory.closes.set(req.closeRequestId, record.trade.id);}
}));
vi.mock('../../../src/lib/cache', () => ({readCache: async () => null, writeCache: async () => {}}));
vi.mock('../../../src/lib/symbols', () => ({loadRegistry: async () => {
 if(memory.deferRegistry) await new Promise<void>(resolve => memory.registryCalls.push(resolve));
 return {symbols:[{symbol:'BTC-USD',baseAsset:'BTC',quotePrecision:2}]};
}}));
vi.mock('../../../src/lib/api', () => ({
 fetchExchangeInfo: async () => [{symbol:'BTC-USD',baseAsset:'BTC',quoteAsset:'USD',marginAsset:'USD',contractType:'PERPETUAL',status:'trading',quotePrecision:2,orderType:['MARKET'],filters:[{filterType:'PRICE_FILTER',tickSize:'0.01'},{filterType:'LOT_SIZE',stepSize:'0.0001',minQty:'0.0001',maxQty:'1000'},{filterType:'MIN_NOTIONAL',notional:'1'}]}],
 fetchPremiumIndex: async () => ({markPrice:'100',indexPrice:'100',fundingRate:'0.0001',nextFundingTime:Date.now()+3600000,sourceTime:Date.now()}),
 fetchDepth: async () => ({bids:[['99','1000']], asks:[['101','1000']],sourceTime:Date.now()})
}));
import { captureClaim, pendingClaim, createTrade, closeTrade, buildReceipt, refreshTrade } from '../../../src/ghost/service';
beforeEach(() => {memory.claims.clear(); memory.pending=undefined; memory.records.clear(); memory.creates.clear(); memory.closes.clear(); memory.registryCalls=[]; memory.deferRegistry=false; vi.useRealTimers();});
it('newer capture wins even when an older capture completes last', async () => {
 memory.deferRegistry=true;
 const first = captureClaim('Bitcoin FIRST claim','https://example.com/first');
 const second = captureClaim('Bitcoin SECOND claim','https://example.com/second');
 expect(memory.registryCalls).toHaveLength(2);
 memory.registryCalls[1](); await second;
 expect((await pendingClaim())?.text).toContain('SECOND');
 memory.registryCalls[0](); await first;
 expect((await pendingClaim())?.text).toContain('SECOND');
});
it('direct close after one day records the unobserved monitoring interval', async () => {
 vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-20T00:00:00Z'));
 const created = await createTrade({requestId:'create-request-1',symbol:'BTC-USD',side:'long',inputMode:'collateral',amount:'100',leverage:1,feeRate:'0.0005'});
 vi.setSystemTime(new Date('2026-10-21T00:00:00Z'));
 await closeTrade(created.trade.id, 'close-request-1');
 const receipt = await buildReceipt(created.trade.id);
 expect(receipt.dataQuality.gaps).toBe(1);
 expect(receipt.events.map(e => e.eventType)).toEqual(['created','monitoring_gap','close_requested','closed_virtual']);
 expect((await refreshTrade(created.trade.id)).monitoringGaps).toBe(1);
});
