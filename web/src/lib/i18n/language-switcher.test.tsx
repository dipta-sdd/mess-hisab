import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { API_BASE_URL, resetApiClientState } from "@/lib/api-client/client";
import { renderWithProviders } from "@/test/render";
import { server } from "@/test/msw/server";
import { LanguageSwitcher } from "./language-switcher";


beforeEach(() => {
  resetApiClientState();
  document.cookie = "NEXT_LOCALE=; max-age=0; path=/";
  document.cookie = "XSRF-TOKEN=t; path=/";
});

describe("LanguageSwitcher", () => {
  it("sets the cookie and PATCHes the profile", async () => {
    const patched = vi.fn();
    server.use(
      http.patch(`${API_BASE_URL}/api/auth/me`, async ({ request }) => {
        patched(await request.json());
        return HttpResponse.json({ data: {} });
      }),
    );
    renderWithProviders(<LanguageSwitcher />);
    expect(screen.getByRole("button", { name: "English" })).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(screen.getByRole("button", { name: "বাংলা" }));

    expect(document.cookie).toContain("NEXT_LOCALE=bn");
    await waitFor(() => expect(patched).toHaveBeenCalledWith({ locale: "bn" }));
  });

  it("ignores a 401 from a logged-out user", async () => {
    server.use(http.patch(`${API_BASE_URL}/api/auth/me`, () => HttpResponse.json({ message: "no" }, { status: 401 })));
    renderWithProviders(<LanguageSwitcher />);
    await userEvent.click(screen.getByRole("button", { name: "বাংলা" }));
    expect(document.cookie).toContain("NEXT_LOCALE=bn");
  });
});
