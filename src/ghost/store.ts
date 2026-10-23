import { createStore, get, getMany, keys, set, setMany } from 'idb-keyval';
import type { CapturedClaim, GhostTrade, TradeEvent } from '../shared/ghost-types';
import { LEDGER_SCHEMA_VERSION } from './constants';
import { GhostError } from './errors';

const store = createStore('strike-everywhere-ledger', 'records');
const META_KEY = 'meta';
const PENDING_KEY = 'claim:pending';
const claimKey = (id: string): string => `claim:${id}`;
const tradeKey = (id: string): string => `trade:${id}`;
const eventsKey = (id: string): string => `events:${id}`;
const createRequestKey = (id: string): string => `request:create:${id}`;
const closeRequestKey = (id: string): string => `request:close:${id}`;

interface LedgerMeta {
  schemaVersion: number;
}

let ready: Promise<void> | null = null;

async function ensureSchema(): Promise<void> {
  const meta = await get<LedgerMeta>(META_KEY, store);
  if (!meta) {
    await set(META_KEY, { schemaVersion: LEDGER_SCHEMA_VERSION } satisfies LedgerMeta, store);
    return;
  }
  if (!Number.isSafeInteger(meta.schemaVersion) || meta.schemaVersion > LEDGER_SCHEMA_VERSION) {
    throw new GhostError('UNKNOWN_SCHEMA', 'This ledger was written by a newer version. It is read-only to avoid data loss.');
  }
}

function readyLedger(): Promise<void> {
  ready ??= ensureSchema().catch((error: unknown) => {
    ready = null;
    throw error;
  });
  return ready;
}

let writeQueue: Promise<unknown> = Promise.resolve();

/** Serializes ledger mutations so refresh/close cannot overwrite each other. */
export function withLedgerLock<T>(work: () => Promise<T>): Promise<T> {
  const run = writeQueue.then(work, work);
  writeQueue = run.then(() => undefined, () => undefined);
  return run;
}

export async function saveClaim(claim: CapturedClaim): Promise<boolean> {
  await readyLedger();
  return withLedgerLock(async () => {
    const pendingId = await get<string>(PENDING_KEY, store);
    const current = pendingId ? await get<CapturedClaim>(claimKey(pendingId), store) : undefined;
    const latest = !current || claim.captureSequence >= (current.captureSequence ?? 0);
    const entries: Array<[string, unknown]> = [[claimKey(claim.id), claim]];
    if (latest) entries.push([PENDING_KEY, claim.id]);
    await setMany(entries, store);
    return latest;
  });
}

export async function updateClaim(claim: CapturedClaim): Promise<void> {
  await readyLedger();
  await set(claimKey(claim.id), claim, store);
}

export async function getClaim(id: string): Promise<CapturedClaim | undefined> {
  await readyLedger();
  return get<CapturedClaim>(claimKey(id), store);
}

export async function getPendingClaim(): Promise<CapturedClaim | undefined> {
  await readyLedger();
  const id = await get<string>(PENDING_KEY, store);
  return id ? getClaim(id) : undefined;
}

export interface TradeRecord {
  trade: GhostTrade;
  events: TradeEvent[];
}

export async function getTradeRecord(id: string): Promise<TradeRecord | undefined> {
  await readyLedger();
  const [trade, events] = await getMany<GhostTrade | TradeEvent[] | undefined>([tradeKey(id), eventsKey(id)], store);
  if (!trade || Array.isArray(trade)) return undefined;
  return { trade, events: Array.isArray(events) ? events : [] };
}

export async function listTradeRecords(): Promise<TradeRecord[]> {
  await readyLedger();
  const allKeys = await keys<string>(store);
  const ids = allKeys.filter((key) => key.startsWith('trade:')).map((key) => key.slice('trade:'.length));
  if (ids.length === 0) return [];
  const pairs = await getMany<GhostTrade | TradeEvent[] | undefined>(
    ids.flatMap((id) => [tradeKey(id), eventsKey(id)]),
    store,
  );
  const records: TradeRecord[] = [];
  for (let index = 0; index < ids.length; index += 1) {
    const trade = pairs[index * 2];
    const events = pairs[index * 2 + 1];
    if (trade && !Array.isArray(trade)) records.push({ trade, events: Array.isArray(events) ? events : [] });
  }
  return records.sort((a, b) => b.trade.createdAt - a.trade.createdAt);
}

export async function findCreateRequest(requestId: string): Promise<string | undefined> {
  await readyLedger();
  return get<string>(createRequestKey(requestId), store);
}

export async function findCloseRequest(requestId: string): Promise<string | undefined> {
  await readyLedger();
  return get<string>(closeRequestKey(requestId), store);
}

export async function saveNewTrade(record: TradeRecord): Promise<void> {
  await readyLedger();
  await setMany([
    [tradeKey(record.trade.id), record.trade],
    [eventsKey(record.trade.id), record.events],
    [createRequestKey(record.trade.creationRequestId), record.trade.id],
  ], store);
}

export async function saveTradeUpdate(
  record: TradeRecord,
  request?: { closeRequestId: string },
): Promise<void> {
  await readyLedger();
  const entries: Array<[string, unknown]> = [
    [tradeKey(record.trade.id), record.trade],
    [eventsKey(record.trade.id), record.events],
  ];
  if (request) entries.push([closeRequestKey(request.closeRequestId), record.trade.id]);
  await setMany(entries as Array<[IDBValidKey, unknown]>, store);
}
