import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { API_BASE_URL, resetApiClientState } from "@/lib/api-client/client";
import { server } from "@/test/msw/server";
import { expectBanglaOnly } from "@/test/bangla";
import { renderWithProviders } from "@/test/render";
import { ProfilePage } from "./profile-page";

const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, refresh: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

let user: { id: number; name: string; email: null; phone: string; phone_verified: boolean; has_verified_contact: boolean; locale: string };

beforeEach(() => {
  resetApiClientState();
  replace.mockReset();
  document.cookie = "XSRF-TOKEN=t; path=/";
  user = { id: 1, name: "Rina", email: null, phone: "01712345678", phone_verified: true, has_verified_contact: true, locale: "en" };
  server.use(http.get(`${API_BASE_URL}/api/auth/me`, () => HttpResponse.json({ data: { user, memberships: [] } })));
});

describe("ProfilePage", () => {
  it("saves a new name", async () => {
    let sent: unknown;
    server.use(
      http.patch(`${API_BASE_URL}/api/auth/me`, async ({ request }) => {
        sent = await request.json();
        user = { ...user, name: "Rina Akter" };
        return HttpResponse.json({ data: user });
      }),
    );
    renderWithProviders(<ProfilePage />);

    const input = await screen.findByLabelText("Name");
    expect(input).toHaveValue("Rina");
    await userEvent.clear(input);
    await userEvent.type(input, "Rina Akter");
    await userEvent.click(screen.getByRole("button", { name: "Save name" }));

    expect(await screen.findByText("Your name was saved.")).toBeInTheDocument();
    expect(sent).toEqual({ name: "Rina Akter" });
  });

  it("refuses an empty name", async () => {
    renderWithProviders(<ProfilePage />);
    await userEvent.clear(await screen.findByLabelText("Name"));
    await userEvent.click(screen.getByRole("button", { name: "Save name" }));
    expect(await screen.findByText("This field is required.")).toBeInTheDocument();
  });

  it("shows the phone card and logs out to the login page", async () => {
    let loggedOut = false;
    server.use(
      http.post(`${API_BASE_URL}/api/auth/logout`, () => {
        loggedOut = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderWithProviders(<ProfilePage />);

    expect(await screen.findByText("Phone number")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Log out" }));

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/login"));
    expect(loggedOut).toBe(true);
  });

  it("is all Bangla in bn", async () => {
    renderWithProviders(<ProfilePage />, { locale: "bn" });
    await screen.findByText("আপনার প্রোফাইল");
    await screen.findByLabelText("নাম");
    expectBanglaOnly();
  });
});
