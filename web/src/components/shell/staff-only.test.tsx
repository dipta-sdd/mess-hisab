import { screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { API_BASE_URL } from "@/lib/api-client/client";
import { server } from "@/test/msw/server";
import { renderWithProviders } from "@/test/render";
import { StaffOnly } from "./staff-only";

function me(flags: { is_admin: boolean; is_manager: boolean }) {
  server.use(
    http.get(`${API_BASE_URL}/api/auth/me`, () =>
      HttpResponse.json({
        user: { id: 1, name: "A", email: "a@x.com", phone: "01700000001", phone_verified: true, has_verified_contact: true, locale: "en", has_password: true, has_google: false },
        memberships: [{ mess_id: 7, mess_name: "Green House", member_id: 3, archived: false, ...flags }],
      }),
    ),
  );
}

describe("StaffOnly", () => {
  it("blocks a member with a friendly message and a link to the dashboard", async () => {
    me({ is_admin: false, is_manager: false });
    renderWithProviders(<StaffOnly><p>secret</p></StaffOnly>, { messId: 7 });
    expect(await screen.findByText("Only the manager can see this page")).toBeTruthy();
    expect(screen.queryByText("secret")).toBeNull();
    expect(screen.getByRole("link", { name: "Back to dashboard" })).toHaveAttribute("href", "/7");
  });

  it("renders children for a manager and for an admin", async () => {
    me({ is_admin: false, is_manager: true });
    const first = renderWithProviders(<StaffOnly><p>secret</p></StaffOnly>, { messId: 7 });
    expect(await screen.findByText("secret")).toBeTruthy();
    first.unmount();
    me({ is_admin: true, is_manager: false });
    renderWithProviders(<StaffOnly><p>secret</p></StaffOnly>, { messId: 7 });
    expect(await screen.findByText("secret")).toBeTruthy();
  });

  it("speaks Bangla", async () => {
    me({ is_admin: false, is_manager: false });
    renderWithProviders(<StaffOnly><p>secret</p></StaffOnly>, { messId: 7, locale: "bn" });
    expect(await screen.findByText("এই পেজ শুধু ম্যানেজার দেখতে পারেন")).toBeTruthy();
  });
});
