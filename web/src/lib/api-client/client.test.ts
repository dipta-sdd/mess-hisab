import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { server } from "@/test/msw/server";
import { API_BASE_URL, apiClient, resetApiClientState, setUnauthorizedHandler } from "./client";
import { ApiError } from "./errors";

async function fail(p: Promise<unknown>): Promise<ApiError> {
  try {
    await p;
  } catch (e) {
    return e as ApiError;
  }
  throw new Error("expected rejection");
}

const url = (p: string) => `${API_BASE_URL}${p}`;

function clearCookies() {
  document.cookie = "XSRF-TOKEN=; max-age=0; path=/";
}

beforeEach(() => {
  clearCookies();
  resetApiClientState();
});
afterEach(() => {
  clearCookies();
  resetApiClientState();
});

describe("apiClient", () => {
  it("GET returns JSON and does not fetch the CSRF cookie", async () => {
    const csrf = vi.fn();
    server.use(
      http.get(url("/sanctum/csrf-cookie"), () => {
        csrf();
        return new HttpResponse(null, { status: 204 });
      }),
      http.get(url("/api/things"), ({ request }) => {
        expect(new URL(request.url).searchParams.get("page")).toBe("2");
        expect(new URL(request.url).searchParams.has("skip")).toBe(false);
        return HttpResponse.json({ data: [1, 2] });
      }),
    );
    const res = await apiClient.get<{ data: number[] }>("/api/things", { query: { page: 2, skip: undefined } });
    expect(res.data).toEqual([1, 2]);
    expect(csrf).not.toHaveBeenCalled();
  });

  it("fetches the CSRF cookie once before the first mutation and sends X-XSRF-TOKEN decoded", async () => {
    const csrf = vi.fn();
    server.use(
      http.get(url("/sanctum/csrf-cookie"), () => {
        csrf();
        document.cookie = `XSRF-TOKEN=${encodeURIComponent("abc=def")}; path=/`;
        return new HttpResponse(null, { status: 204 });
      }),
      http.post(url("/api/things"), async ({ request }) => {
        expect(request.headers.get("x-xsrf-token")).toBe("abc=def");
        expect(request.headers.get("content-type")).toContain("application/json");
        expect(await request.json()).toEqual({ a: 1 });
        return HttpResponse.json({ data: { id: 1 } }, { status: 201 });
      }),
    );
    await apiClient.post("/api/things", { a: 1 });
    await apiClient.post("/api/things", { a: 1 });
    expect(csrf).toHaveBeenCalledTimes(1);
  });

  it("returns null for 204", async () => {
    document.cookie = "XSRF-TOKEN=t; path=/";
    server.use(http.delete(url("/api/things/1"), () => new HttpResponse(null, { status: 204 })));
    expect(await apiClient.delete("/api/things/1")).toBeNull();
  });

  it("maps 422 to field errors", async () => {
    document.cookie = "XSRF-TOKEN=t; path=/";
    server.use(
      http.post(url("/api/things"), () =>
        HttpResponse.json({ message: "Invalid", errors: { email: ["Taken", "Bad"], name: ["Required"] } }, { status: 422 }),
      ),
    );
    const err = await fail(apiClient.post("/api/things", {}));
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(422);
    expect(err.isValidation).toBe(true);
    expect(err.message).toBe("Invalid");
    expect(err.fieldErrors).toEqual({ email: ["Taken", "Bad"], name: ["Required"] });
    expect(err.fieldError("email")).toBe("Taken");
  });

  it("maps 409 to code, 403 and 404", async () => {
    server.use(
      http.get(url("/api/a"), () => HttpResponse.json({ message: "Nope", code: "is_admin_or_manager" }, { status: 409 })),
      http.get(url("/api/b"), () => HttpResponse.json({ message: "Forbidden" }, { status: 403 })),
      http.get(url("/api/c"), () => HttpResponse.json({ message: "Not found" }, { status: 404 })),
    );
    const a = await fail(apiClient.get("/api/a"));
    expect(a.code).toBe("is_admin_or_manager");
    expect(a.isConflict).toBe(true);
    const b = await fail(apiClient.get("/api/b"));
    expect(b.isForbidden).toBe(true);
    const c = await fail(apiClient.get("/api/c"));
    expect(c.isNotFound).toBe(true);
    expect(c.code).toBeNull();
  });

  it("calls the unauthorized handler on 401 unless skipped", async () => {
    const handler = vi.fn();
    setUnauthorizedHandler(handler);
    server.use(http.get(url("/api/me"), () => HttpResponse.json({ message: "Unauthenticated." }, { status: 401 })));
    const err = await fail(apiClient.get("/api/me"));
    expect(err.isUnauthorized).toBe(true);
    expect(handler).toHaveBeenCalledTimes(1);
    await apiClient.get("/api/me", { skipUnauthorized: true }).catch(() => {});
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("refreshes the CSRF cookie and retries once on 419", async () => {
    document.cookie = "XSRF-TOKEN=old; path=/";
    let calls = 0;
    server.use(
      http.get(url("/sanctum/csrf-cookie"), () => {
        document.cookie = "XSRF-TOKEN=fresh; path=/";
        return new HttpResponse(null, { status: 204 });
      }),
      http.post(url("/api/things"), ({ request }) => {
        calls += 1;
        if (request.headers.get("x-xsrf-token") !== "fresh") return HttpResponse.json({ message: "expired" }, { status: 419 });
        return HttpResponse.json({ ok: true });
      }),
    );
    expect(await apiClient.post("/api/things", {})).toEqual({ ok: true });
    expect(calls).toBe(2);
  });
});
