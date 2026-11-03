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

let user: { id: number; name: string; email: string | null; phone: string; phone_verified: boolean; has_verified_contact: boolean; locale: string; has_password: boolean; has_google: boolean };

beforeEach(() => {
  resetApiClientState();
  replace.mockReset();
  document.cookie = "XSRF-TOKEN=t; path=/";
  user = { id: 1, name: "Rina", email: null, phone: "01712345678", phone_verified: true, has_verified_contact: true, locale: "en", has_password: true, has_google: false };
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

  it("changes the password with the current one", async () => {
    let sent: unknown;
    server.use(
      http.patch(`${API_BASE_URL}/api/auth/me/password`, async ({ request }) => {
        sent = await request.json();
        return HttpResponse.json({ data: user });
      }),
    );
    renderWithProviders(<ProfilePage />);

    await userEvent.type(await screen.findByLabelText("Current password", { selector: "#password input, #password" }), "oldpass12");
    await userEvent.type(screen.getByLabelText("New password"), "newpass123");
    await userEvent.type(screen.getByLabelText("Confirm new password"), "newpass123");
    await userEvent.click(screen.getByRole("button", { name: "Change password" }));

    expect(await screen.findByText("Your password was saved.")).toBeInTheDocument();
    expect(sent).toEqual({ current_password: "oldpass12", password: "newpass123", password_confirmation: "newpass123" });
  });

  it("refuses a short or mismatched new password", async () => {
    renderWithProviders(<ProfilePage />);
    await userEvent.type(await screen.findByLabelText("New password"), "short");
    await userEvent.type(screen.getByLabelText("Confirm new password"), "other");
    await userEvent.click(screen.getByRole("button", { name: "Change password" }));
    expect(await screen.findByText("The passwords do not match.")).toBeInTheDocument();
  });

  it("asks a Google-only account to set a first password and hides the current one", async () => {
    user = { ...user, has_password: false, has_google: true };
    renderWithProviders(<ProfilePage />);
    expect(await screen.findByRole("button", { name: "Set password" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Current password")).not.toBeInTheDocument();
    expect(screen.getByText(/Set a password below first/)).toBeInTheDocument();
  });

  it("changes the email with the current password and shows a server error", async () => {
    let sent: unknown;
    server.use(
      http.patch(`${API_BASE_URL}/api/auth/me/email`, async ({ request }) => {
        sent = await request.json();
        return HttpResponse.json({ message: "bad", errors: { current_password: ["The password is incorrect."] } }, { status: 422 });
      }),
    );
    renderWithProviders(<ProfilePage />);

    await userEvent.type(await screen.findByLabelText("Email address"), "Rina@Example.com");
    await userEvent.type(screen.getAllByLabelText("Current password")[0], "wrongpass1");
    await userEvent.click(screen.getByRole("button", { name: "Save email" }));

    expect(await screen.findByText("The password is incorrect.")).toBeInTheDocument();
    expect(sent).toEqual({ email: "Rina@Example.com", current_password: "wrongpass1" });
  });

  it("is all Bangla in bn", async () => {
    user = { ...user, name: "রিনা" };
    renderWithProviders(<ProfilePage />, { locale: "bn" });
    await screen.findByText("আপনার প্রোফাইল");
    await screen.findByLabelText("নাম");
    expectBanglaOnly();
  });
});
