import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Member } from "@/lib/api/contract";
import { API_BASE_URL, resetApiClientState } from "@/lib/api-client/client";
import { server } from "@/test/msw/server";
import { expectBanglaOnly } from "@/test/bangla";
import { renderWithProviders } from "@/test/render";
import { SettingsPage } from "./settings-page";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const base = { user_id: 1, has_account: true, is_admin: false, is_manager: false, joined_on: "2026-10-01", left_on: null, archived_at: null };
const admin: Member = { ...base, id: 1, display_name: "Rina", is_admin: true };
const plain: Member = { ...base, id: 2, display_name: "Salma" };

const mess = {
  id: 3,
  name: "Green House",
  currency: "BDT",
  month_start_day: 1,
  admin_member_id: 1,
  manager_member_id: null,
  approval_required: false,
  rounding_mode: "whole_taka",
  meal_tracking: "daily_number",
  meal_entry_by: "manager",
  breakfast_weight_centi: 50,
  lunch_weight_centi: 100,
  dinner_weight_centi: 100,
  min_meals_enabled: false,
  min_meals_centi: null,
  min_payable_enabled: false,
  min_payable_paisa: null,
  deposit_paisa: 100000,
  fixed_due_day_offset: 5,
  deposit_due_day_offset: 5,
};

const user = { id: 1, name: "Rina", email: null, phone: "01712345678", phone_verified: true, has_verified_contact: true, locale: "en", has_password: true, has_google: false };

const serve = (me: Member) =>
  server.use(
    http.get(`${API_BASE_URL}/api/messes/3`, () => HttpResponse.json({ data: { mess, me } })),
    http.get(`${API_BASE_URL}/api/auth/me`, () => HttpResponse.json({ data: { user, memberships: [] } })),
  );

const render = (locale?: "en" | "bn") => renderWithProviders(<SettingsPage />, { messId: 3, locale });
const save = () => userEvent.click(screen.getByRole("button", { name: "Save settings" }));

beforeEach(() => {
  resetApiClientState();
  document.cookie = "XSRF-TOKEN=t; path=/";
});

describe("SettingsPage as admin", () => {
  it("loads current values", async () => {
    serve(admin);
    render();
    const nm = await screen.findByLabelText("Mess name");
    expect(nm).toHaveValue("Green House");
    expect(screen.getByLabelText("Deposit per member (taka)")).toHaveValue("1000");
    // Weights only matter for breakfast/lunch/dinner ticks.
    expect(screen.queryByLabelText("Breakfast counts as (meals)")).not.toBeInTheDocument();
  });

  it("saves taka as integer paisa and meals as centi-meals", async () => {
    serve(admin);
    const body = vi.fn();
    server.use(
      http.patch(`${API_BASE_URL}/api/messes/3/settings`, async ({ request }) => {
        body(await request.json());
        return HttpResponse.json({ data: mess });
      }),
    );
    render();
    await userEvent.selectOptions(await screen.findByLabelText("How meals are tracked"), "bld_ticks");
    const breakfast = screen.getByLabelText("Breakfast counts as (meals)");
    expect(breakfast).toHaveValue("0.5");
    await userEvent.clear(breakfast);
    await userEvent.type(breakfast, "0.75");

    await userEvent.click(screen.getByLabelText("Minimum meals per month"));
    await userEvent.type(screen.getByLabelText("Minimum meals"), "10");
    await userEvent.click(screen.getByLabelText("Minimum payable amount"));
    await userEvent.type(screen.getByLabelText("Minimum payable (taka)"), "12.5");

    const deposit = screen.getByLabelText("Deposit per member (taka)");
    await userEvent.clear(deposit);
    await userEvent.type(deposit, "1,500.25");

    await save();
    await waitFor(() => expect(body).toHaveBeenCalled());
    expect(body.mock.calls[0]![0]).toMatchObject({
      name: "Green House",
      meal_tracking: "bld_ticks",
      breakfast_weight_centi: 75,
      lunch_weight_centi: 100,
      dinner_weight_centi: 100,
      min_meals_enabled: true,
      min_meals_centi: 1000,
      min_payable_enabled: true,
      min_payable_paisa: 1250,
      deposit_paisa: 150025,
      month_start_day: 1,
    });
    expect(await screen.findByText("Settings saved.")).toBeInTheDocument();
  });

  it("sends null for minimums that are switched off", async () => {
    serve(admin);
    const body = vi.fn();
    server.use(
      http.patch(`${API_BASE_URL}/api/messes/3/settings`, async ({ request }) => {
        body(await request.json());
        return HttpResponse.json({ data: mess });
      }),
    );
    render();
    await screen.findByLabelText("Mess name");
    await save();
    await waitFor(() => expect(body).toHaveBeenCalled());
    expect(body.mock.calls[0]![0]).toMatchObject({
      min_meals_enabled: false,
      min_meals_centi: null,
      min_payable_enabled: false,
      min_payable_paisa: null,
    });
  });

  it("rejects more than two decimals in the browser without calling the API", async () => {
    serve(admin);
    const call = vi.fn();
    server.use(
      http.patch(`${API_BASE_URL}/api/messes/3/settings`, () => {
        call();
        return HttpResponse.json({ data: mess });
      }),
    );
    render();
    const deposit = await screen.findByLabelText("Deposit per member (taka)");
    await userEvent.clear(deposit);
    await userEvent.type(deposit, "10.123");
    await save();
    expect(await screen.findByText("Enter an amount in taka, with at most 2 decimals.")).toBeInTheDocument();
    expect(call).not.toHaveBeenCalled();
  });

  it("puts a server 422 on the matching input", async () => {
    serve(admin);
    server.use(
      http.patch(`${API_BASE_URL}/api/messes/3/settings`, () =>
        HttpResponse.json(
          { message: "x", errors: { deposit_paisa: ["The deposit is too large."], name: ["Name is taken."] } },
          { status: 422 },
        ),
      ),
    );
    render();
    await screen.findByLabelText("Mess name");
    await save();
    expect(await screen.findByText("The deposit is too large.")).toBeInTheDocument();
    expect(screen.getByText("Name is taken.")).toBeInTheDocument();
  });

  it("shows a server 403 as an alert", async () => {
    serve(admin);
    server.use(
      http.patch(`${API_BASE_URL}/api/messes/3/settings`, () => HttpResponse.json({ message: "no" }, { status: 403 })),
    );
    render();
    await screen.findByLabelText("Mess name");
    await save();
    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });

  it("renders in Bangla", async () => {
    serve(admin);
    render("bn");
    expect(await screen.findByRole("heading", { name: "সেটিংস" })).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("status")).toBeNull());
    expectBanglaOnly([]);
  });
});

describe("SettingsPage as a plain member", () => {
  it("is read-only: fields disabled, no save button", async () => {
    serve(plain);
    render();
    expect(await screen.findByLabelText("Mess name")).toBeDisabled();
    expect(screen.getByLabelText("Deposit per member (taka)")).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Save settings" })).not.toBeInTheDocument();
    expect(screen.getByText("Only the admin can change these settings.")).toBeInTheDocument();
  });
});

describe("SettingsPage loading failure", () => {
  it("shows an alert", async () => {
    server.use(http.get(`${API_BASE_URL}/api/messes/3`, () => HttpResponse.json({ message: "x" }, { status: 500 })));
    render();
    expect(await screen.findByText("Could not load settings. Please try again.")).toBeInTheDocument();
  });
});
