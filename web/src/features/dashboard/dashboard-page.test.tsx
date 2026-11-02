import { screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import DashboardFx from "../../../../docs/contract-fixtures/Dashboard.json";
import type { Dashboard, Mess } from "@/lib/api/contract";
import { API_BASE_URL } from "@/lib/api-client/client";
import { server } from "@/test/msw/server";
import { renderWithProviders } from "@/test/render";
import { DashboardPage } from "./dashboard-page";

const BASE = `${API_BASE_URL}/api/messes/7`;
const mess = { id: 7, name: "Green House", rounding_mode: "two_decimals" } as Mess;

function mockApi(flags: { is_admin?: boolean; is_manager?: boolean }) {
  server.use(
    http.get(`${API_BASE_URL}/api/auth/me`, () =>
      HttpResponse.json({
        user: { id: 1, name: "X", email: null, phone: null, phone_verified: true, has_verified_contact: true, locale: "en", has_password: true, has_google: false },
        memberships: [{ mess_id: 7, mess_name: "Green House", member_id: 1, archived: false, is_admin: false, is_manager: false, ...flags }],
      }),
    ),
    http.get(BASE, () => HttpResponse.json({ data: { mess, me: {} } })),
    http.get(`${BASE}/history`, () => HttpResponse.json({ data: [] })),
    http.get(`${BASE}/categories`, () => HttpResponse.json({ data: [] })),
    http.get(`${BASE}/expenses`, () => HttpResponse.json({ data: [] })),
    http.get(`${BASE}/dashboard`, () => HttpResponse.json({ data: DashboardFx as Dashboard })),
  );
}
const render = () => renderWithProviders(<DashboardPage />, { messId: 7 });

describe("DashboardPage role switch", () => {
  it("shows the member dashboard to a normal member", async () => {
    mockApi({});
    render();
    expect(await screen.findByTestId("balance-card")).toBeInTheDocument();
    expect(screen.queryByTestId("cash-card")).toBeNull();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it.each([{ is_manager: true }, { is_admin: true }])("shows the staff dashboard for %o", async (flags) => {
    mockApi(flags);
    render();
    expect(await screen.findByTestId("cash-card")).toBeInTheDocument();
    expect(screen.queryByTestId("balance-card")).toBeNull();
  });
});
