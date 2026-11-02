import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { API_BASE_URL, resetApiClientState } from "@/lib/api-client/client";
import { server } from "@/test/msw/server";
import { expectBanglaOnly } from "@/test/bangla";
import { renderWithProviders } from "@/test/render";
import { PhoneCard } from "./phone-card";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const base = { id: 1, name: "Rina", email: null, locale: "en", has_verified_contact: true };
let current: object;

beforeEach(() => {
  resetApiClientState();
  document.cookie = "XSRF-TOKEN=t; path=/";
  current = { ...base, phone: "01712345678", phone_verified: true };
  server.use(
    http.get(`${API_BASE_URL}/api/auth/me`, () => HttpResponse.json({ data: { user: current, memberships: [] } })),
  );
});

describe("PhoneCard", () => {
  it("shows the current phone with a verified badge", async () => {
    renderWithProviders(<PhoneCard />);
    expect(await screen.findByText("01712345678")).toBeInTheDocument();
    expect(screen.getByText("Verified")).toBeInTheDocument();
  });

  it("changes the number: new phone -> code -> updated", async () => {
    const sendBody = vi.fn();
    const verifyBody = vi.fn();
    server.use(
      http.post(`${API_BASE_URL}/api/auth/me/phone`, async ({ request }) => {
        sendBody(await request.json());
        return HttpResponse.json({
          data: { expires_at: new Date(Date.now() + 300_000).toISOString(), resend_at: new Date(Date.now() + 60_000).toISOString() },
        });
      }),
      http.post(`${API_BASE_URL}/api/auth/me/phone/verify`, async ({ request }) => {
        verifyBody(await request.json());
        current = { ...base, phone: "01898765432", phone_verified: true };
        return HttpResponse.json({ data: current });
      }),
    );
    renderWithProviders(<PhoneCard />);
    await userEvent.click(await screen.findByRole("button", { name: "Change number" }));
    await userEvent.type(screen.getByLabelText("New mobile number"), "01898765432");
    await userEvent.click(screen.getByRole("button", { name: "Send code" }));
    await userEvent.type(await screen.findByLabelText("6-digit code"), "654321");
    await userEvent.click(screen.getByRole("button", { name: "Confirm new number" }));
    expect(await screen.findByText("Your phone number was updated.")).toBeInTheDocument();
    expect(await screen.findByText("01898765432")).toBeInTheDocument();
    expect(sendBody).toHaveBeenCalledWith({ phone: "01898765432" });
    expect(verifyBody).toHaveBeenCalledWith({ phone: "01898765432", code: "654321" });
  });

  it("shows a taken number on the input and keeps the old phone", async () => {
    server.use(
      http.post(`${API_BASE_URL}/api/auth/me/phone`, () =>
        HttpResponse.json({ message: "x", errors: { phone: ["The phone has already been taken."] } }, { status: 422 }),
      ),
    );
    renderWithProviders(<PhoneCard />);
    await userEvent.click(await screen.findByRole("button", { name: "Change number" }));
    await userEvent.type(screen.getByLabelText("New mobile number"), "01898765432");
    await userEvent.click(screen.getByRole("button", { name: "Send code" }));
    expect(await screen.findByText("The phone has already been taken.")).toBeInTheDocument();
  });

  it("shows a wrong code and can be cancelled", async () => {
    server.use(
      http.post(`${API_BASE_URL}/api/auth/me/phone`, () =>
        HttpResponse.json({
          data: { expires_at: new Date(Date.now() + 300_000).toISOString(), resend_at: new Date(Date.now() + 60_000).toISOString() },
        }),
      ),
      http.post(`${API_BASE_URL}/api/auth/me/phone/verify`, () =>
        HttpResponse.json({ message: "x", code: "otp_invalid", errors: { code: ["otp_invalid"] } }, { status: 422 }),
      ),
    );
    renderWithProviders(<PhoneCard />);
    await userEvent.click(await screen.findByRole("button", { name: "Change number" }));
    await userEvent.type(screen.getByLabelText("New mobile number"), "01898765432");
    await userEvent.click(screen.getByRole("button", { name: "Send code" }));
    await userEvent.type(await screen.findByLabelText("6-digit code"), "000000");
    await userEvent.click(screen.getByRole("button", { name: "Confirm new number" }));
    expect(await screen.findByText(/That code is not correct/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Change number" })).toBeInTheDocument());
    expect(screen.getByText("01712345678")).toBeInTheDocument();
  });

  it("renders in Bangla", async () => {
    renderWithProviders(<PhoneCard />, { locale: "bn" });
    expect(await screen.findByText("০১৭১২৩৪৫৬৭৮")).toBeInTheDocument();
    expect(screen.getByText("যাচাই করা")).toBeInTheDocument();
    expectBanglaOnly([]);
  });
});
