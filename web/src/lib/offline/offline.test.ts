import { QueryClient } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { server } from "@/test/msw/server";
import { API_BASE_URL } from "@/lib/api-client/client";
import type { QueuedExpense } from "./queue";

const store = new Map<string, QueuedExpense>();
vi.mock("./queue", () => ({
  listQueued: async () => [...store.values()],
  removeQueued: async (id: string) => void store.delete(id),
  updateQueued: async (id: string, patch: Partial<QueuedExpense>) => void store.set(id, { ...store.get(id)!, ...patch }),
}));

import { withOfflineCopy } from "./cached";
import { isNetworkError, syncQueued } from "./sync";

const item = (id: string): QueuedExpense => ({
  id, messId: 1, memberId: 5, status: "queued", reason: null, createdAt: 1,
  payload: { category_id: 3, amount_paisa: 1000, spent_on: "2026-11-03", note: null, paid_by: "member", paid_by_member_id: 5 },
});
const url = `${API_BASE_URL}/api/messes/1/expenses`;

beforeEach(() => {
  store.clear();
  localStorage.clear();
  document.cookie = "XSRF-TOKEN=t";
  server.use(http.get(`${API_BASE_URL}/sanctum/csrf-cookie`, () => new HttpResponse(null, { status: 204 })));
});

describe("syncQueued", () => {
  it("sends each item with its id as client_uuid and clears it", async () => {
    store.set("a", item("a"));
    let body: unknown;
    server.use(http.post(url, async ({ request }) => { body = await request.json(); return HttpResponse.json({ data: { expense: {}, warnings: [] } }, { status: 201 }); }));

    expect(await syncQueued(new QueryClient(), 1, 5)).toBe("done");
    expect(body).toMatchObject({ client_uuid: "a", amount_paisa: 1000 });
    expect(store.size).toBe(0);
  });

  it("parks a rejected item as needs attention with the server's reason", async () => {
    store.set("a", item("a"));
    server.use(http.post(url, () => HttpResponse.json({ message: "x", errors: { spent_on: ["That month is closed."] } }, { status: 422 })));

    expect(await syncQueued(new QueryClient(), 1, 5)).toBe("done");
    expect(store.get("a")).toMatchObject({ status: "needs_attention", reason: "That month is closed." });
  });

  it("keeps the queue and asks for a login on 401", async () => {
    store.set("a", item("a"));
    server.use(http.post(url, () => HttpResponse.json({ message: "no" }, { status: 401 })));

    expect(await syncQueued(new QueryClient(), 1, 5)).toBe("login_needed");
    expect(store.get("a")?.status).toBe("queued");
  });

  it("keeps the queue to retry later on a server error", async () => {
    store.set("a", item("a"));
    server.use(http.post(url, () => HttpResponse.json({ message: "down" }, { status: 503 })));

    expect(await syncQueued(new QueryClient(), 1, 5)).toBe("retry_later");
    expect(store.get("a")?.status).toBe("queued");
  });
});

describe("withOfflineCopy", () => {
  it("returns the last copy when the network is down, but not on a server answer", async () => {
    await withOfflineCopy("k", async () => ({ n: 1 }));
    expect(await withOfflineCopy("k", async () => { throw new TypeError("Failed to fetch"); })).toEqual({ n: 1 });
    expect(isNetworkError(new TypeError("x"))).toBe(true);
  });
});
