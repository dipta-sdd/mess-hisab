import type { QueryClient } from "@tanstack/react-query";
import type { Expense, ItemResponse } from "@/lib/api/contract";
import { apiClient } from "@/lib/api-client";
import { isApiError } from "@/lib/api-client/errors";
import { invalidateMoney } from "@/lib/api/query-keys";
import { listQueued, removeQueued, updateQueued } from "./queue";

/** True when the failure means "no connection", not "the server said no". */
export function isNetworkError(error: unknown): boolean {
  return !isApiError(error) && error instanceof TypeError;
}

let running: Promise<SyncOutcome> | null = null;

export type SyncOutcome = "done" | "login_needed" | "retry_later";

/**
 * Send queued expenses one at a time. One run at a time (online event, app start and login can all
 * fire together). 401 keeps the queue and asks for a login, a connection or 5xx failure retries later,
 * and any other 4xx parks the item as "needs attention" with the server's reason.
 */
export function syncQueued(client: QueryClient, messId: number, memberId: number): Promise<SyncOutcome> {
  if (running) return running;
  running = (async (): Promise<SyncOutcome> => {
    const items = (await listQueued(messId, memberId)).filter((i) => i.status === "queued");
    let sent = false;
    try {
      for (const item of items) {
        try {
          await apiClient.post<ItemResponse<{ expense: Expense }>>(`/api/messes/${messId}/expenses`, { ...item.payload, client_uuid: item.id }, { skipUnauthorized: true });
          await removeQueued(item.id);
          sent = true;
        } catch (error) {
          if (isApiError(error)) {
            if (error.status === 401 || error.status === 419) return "login_needed";
            if (error.status >= 500) return "retry_later";
            const reason = Object.values(error.fieldErrors)[0]?.[0] ?? error.message;
            await updateQueued(item.id, { status: "needs_attention", reason });
            continue;
          }
          return "retry_later";
        }
      }
      return "done";
    } finally {
      if (sent) invalidateMoney(client, messId);
    }
  })().finally(() => {
    running = null;
  });
  return running;
}
