import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { API_BASE_URL, resetApiClientState } from "@/lib/api-client/client";
import { server } from "@/test/msw/server";
import { expectBanglaOnly } from "@/test/bangla";
import { renderWithProviders } from "@/test/render";
import { stashResendAt } from "../otp";
import { VerifyPhoneForm } from "./verify-phone-form";

const replace = vi.fn();
let search = new URLSearchParams();
vi.mock("@/lib/nav", async (orig) => ({ ...(await orig<object>()), useRouter: () => ({ replace, refresh: vi.fn(), push: vi.fn() }) }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, refresh: vi.fn(), push: vi.fn() }),
  useSearchParams: () => search,
}));

const locked = {
  id: 1, name: "Rina", email: null, phone: "01712345678", phone_verified: false, has_verified_contact: false, locale: "en",
};
const verified = { ...locked, phone_verified: true, has_verified_contact: true };

function serveMe(user: object) {
  server.use(http.get(`${API_BASE_URL}/api/auth/me`, () => HttpResponse.json({ data: { user, memberships: [] } })));
}

const iso = (ms: number) => new Date(Date.now() + ms).toISOString();

beforeEach(() => {
  replace.mockClear();
  search = new URLSearchParams();
  resetApiClientState();
  document.cookie = "XSRF-TOKEN=t; path=/";
  window.sessionStorage.clear();
});
afterEach(() => vi.useRealTimers());

describe("VerifyPhoneForm", () => {
  it("verifies the code and goes to the landing route", async () => {
    stashResendAt(Date.now() + 60_000);
    serveMe(locked);
    const body = vi.fn();
    server.use(
      http.post(`${API_BASE_URL}/api/auth/phone/verify`, async ({ request }) => {
        body(await request.json());
        return HttpResponse.json({ data: verified });
      }),
    );
    renderWithProviders(<VerifyPhoneForm />);
    const input = await screen.findByLabelText("6-digit code");
    expect(input).toHaveAttribute("inputmode", "numeric");
    expect(input).toHaveAttribute("autocomplete", "one-time-code");
    await userEvent.type(input, "123456");
    await userEvent.click(screen.getByRole("button", { name: "Verify" }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/"));
    expect(body).toHaveBeenCalledWith({ code: "123456" });
  });

  it("follows ?next after verifying", async () => {
    search = new URLSearchParams("next=/invite/abc");
    stashResendAt(Date.now() + 60_000);
    serveMe(locked);
    server.use(http.post(`${API_BASE_URL}/api/auth/phone/verify`, () => HttpResponse.json({ data: verified })));
    renderWithProviders(<VerifyPhoneForm />);
    await userEvent.type(await screen.findByLabelText("6-digit code"), "123456");
    await userEvent.click(screen.getByRole("button", { name: "Verify" }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/invite/abc"));
  });

  it.each([
    ["otp_invalid", /That code is not correct/],
    ["otp_expired", /has expired/],
    ["otp_too_many", /Too many wrong tries/],
    ["sms_failed", /could not send the SMS/],
  ])("shows the %s message", async (code, message) => {
    stashResendAt(Date.now() + 60_000);
    serveMe(locked);
    server.use(
      http.post(`${API_BASE_URL}/api/auth/phone/verify`, () =>
        HttpResponse.json({ message: "x", code, errors: { code: [code] } }, { status: code === "sms_failed" ? 503 : 422 }),
      ),
    );
    renderWithProviders(<VerifyPhoneForm />);
    await userEvent.type(await screen.findByLabelText("6-digit code"), "123456");
    await userEvent.click(screen.getByRole("button", { name: "Verify" }));
    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  it("validates the code length before calling the API", async () => {
    stashResendAt(Date.now() + 60_000);
    serveMe(locked);
    renderWithProviders(<VerifyPhoneForm />);
    await userEvent.type(await screen.findByLabelText("6-digit code"), "12");
    await userEvent.click(screen.getByRole("button", { name: "Verify" }));
    expect(await screen.findByText("Enter the 6-digit code.")).toBeInTheDocument();
  });

  it("disables resend with a live countdown, then enables it", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    stashResendAt(Date.now() + 3_000);
    serveMe(locked);
    renderWithProviders(<VerifyPhoneForm />);
    const button = await screen.findByRole("button", { name: /Resend code in 0:0[1-3]/ });
    expect(button).toBeDisabled();
    await act(async () => {
      vi.advanceTimersByTime(4_000);
    });
    await waitFor(() => expect(screen.getByRole("button", { name: "Resend code" })).toBeEnabled());
  });

  it("resends and restarts the countdown from resend_at", async () => {
    serveMe(locked);
    const send = vi.fn();
    server.use(
      http.post(`${API_BASE_URL}/api/auth/phone/send`, () => {
        send();
        return HttpResponse.json({ data: { expires_at: iso(300_000), resend_at: iso(60_000) } });
      }),
    );
    // No stash: the page asks for a code itself (a locked account that just logged in).
    renderWithProviders(<VerifyPhoneForm />);
    expect(await screen.findByRole("button", { name: /Resend code in/ })).toBeDisabled();
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("handles 429 otp_resend_wait by showing the wait", async () => {
    stashResendAt(Date.now() - 1_000);
    serveMe(locked);
    server.use(
      http.post(`${API_BASE_URL}/api/auth/phone/send`, () =>
        HttpResponse.json({ message: "wait", code: "otp_resend_wait", retry_after: 42 }, { status: 429 }),
      ),
    );
    renderWithProviders(<VerifyPhoneForm />);
    await userEvent.click(await screen.findByRole("button", { name: "Resend code" }));
    expect(await screen.findByText(/Please wait before asking/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Resend code in 0:4[12]/ })).toBeDisabled();
  });

  it("leaves for the landing route when already verified", async () => {
    serveMe(verified);
    renderWithProviders(<VerifyPhoneForm />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/"));
  });

  it("lets the user sign out", async () => {
    stashResendAt(Date.now() + 60_000);
    serveMe(locked);
    const logout = vi.fn();
    server.use(
      http.post(`${API_BASE_URL}/api/auth/logout`, () => {
        logout();
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderWithProviders(<VerifyPhoneForm />);
    await userEvent.click(await screen.findByRole("button", { name: "Sign out" }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/login"));
    expect(logout).toHaveBeenCalled();
  });

  it("renders in Bangla with Bangla digits", async () => {
    stashResendAt(Date.now() + 60_000);
    serveMe(locked);
    renderWithProviders(<VerifyPhoneForm />, { locale: "bn" });
    expect(await screen.findByLabelText("৬ সংখ্যার কোড")).toBeInTheDocument();
    expect(screen.getByText(/০১৭১২৩৪৫৬৭৮/)).toBeInTheDocument();
    expectBanglaOnly([]);
  });
});
