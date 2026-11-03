import type { ExpenseInput } from "@/lib/api/contract";

/**
 * Expenses written while offline, kept in IndexedDB until they sync. Each item's id doubles as the
 * `client_uuid` sent to the API, so a retried sync can never record the same expense twice.
 */
export type QueuedStatus = "queued" | "needs_attention";

export interface QueuedExpense {
  id: string;
  messId: number;
  memberId: number;
  payload: ExpenseInput;
  status: QueuedStatus;
  /** Why it needs attention (the server's message). */
  reason: string | null;
  createdAt: number;
}

const DB_NAME = "meser-hisab-offline";
const STORE = "expenses";
const listeners = new Set<() => void>();

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "id" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const req = fn(db.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

const notify = () => listeners.forEach((l) => l());

/** Call `fn` whenever the queue changes in this tab. */
export function subscribeQueue(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function offlineSupported(): boolean {
  return typeof indexedDB !== "undefined";
}

export async function listQueued(messId: number, memberId: number): Promise<QueuedExpense[]> {
  if (!offlineSupported()) return [];
  const all = await run("readonly", (s) => s.getAll() as IDBRequest<QueuedExpense[]>);
  return all.filter((i) => i.messId === messId && i.memberId === memberId).sort((a, b) => a.createdAt - b.createdAt);
}

export async function enqueueExpense(messId: number, memberId: number, payload: ExpenseInput, id: string = crypto.randomUUID()): Promise<QueuedExpense> {
  const item: QueuedExpense = { id, messId, memberId, payload, status: "queued", reason: null, createdAt: Date.now() };
  await run("readwrite", (s) => s.put(item));
  notify();
  return item;
}

export async function updateQueued(id: string, patch: Partial<Pick<QueuedExpense, "payload" | "status" | "reason">>): Promise<void> {
  const current = await run("readonly", (s) => s.get(id) as IDBRequest<QueuedExpense | undefined>);
  if (!current) return;
  await run("readwrite", (s) => s.put({ ...current, ...patch }));
  notify();
}

export async function removeQueued(id: string): Promise<void> {
  await run("readwrite", (s) => s.delete(id));
  notify();
}

/** How many expenses on this device are still waiting to reach the server, for anyone who used it. */
export async function countQueued(): Promise<number> {
  if (!offlineSupported()) return 0;
  try {
    return await run("readonly", (s) => s.count());
  } catch {
    return 0;
  }
}
