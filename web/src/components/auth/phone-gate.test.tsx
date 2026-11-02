import { screen, waitFor } from "@testing-library/react";
import { useQuery } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { API_BASE_URL, apiClient, resetApiClientState } from "@/lib/api-client";
import { server } from "@/test/msw/server";
import { renderWithProviders } from "@/test/render";
import { PhoneGate } from "./phone-gate";

const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, refresh: vi.fn(), push: vi.fn() }),
}));

const base = { id: 1, name: "Rina", email: null, phone: "01712345678", locale: "en" };

function serveMe(user: object) {
  server.use(http.get(`${API_BASE_URL}/api/auth/me`, () => HttpResponse.json({ data: { user, memberships: [] } })));
}

beforeEach(() => {
  replace.mockClear();
  resetApiClientState();
});

describe("PhoneGate", () => {
  it("redirects a locked user to /verify-phone and hides the children", async () => {
    serveMe({ ...base, phone_verified: false, has_verified_contact: false });
    renderWithProviders(
      <PhoneGate>
        <p>secret app</p>
      </PhoneGate>,
    );
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/verify-phone"));
    expect(screen.queryByText("secret app")).not.toBeInTheDocument();
  });

  it("renders children for a verified user without redirecting", async () => {
    serveMe({ ...base, phone_verified: true, has_verified_contact: true });
    renderWithProviders(
      <PhoneGate>
        <p>secret app</p>
      </PhoneGate>,
    );
    expect(await screen.findByText("secret app")).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  it("redirects when any request answers 403 phone_unverified", async () => {
    serveMe({ ...base, phone_verified: true, has_verified_contact: true });
    server.use(
      http.get(`${API_BASE_URL}/api/messes/1`, () =>
        HttpResponse.json({ message: "locked", code: "phone_unverified" }, { status: 403 }),
      ),
    );
    function Probe() {
      useQuery({ queryKey: ["probe"], queryFn: () => apiClient.get("/api/messes/1"), retry: false });
      return <p>app</p>;
    }
    renderWithProviders(
      <PhoneGate>
        <Probe />
      </PhoneGate>,
    );
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/verify-phone"));
  });
});
