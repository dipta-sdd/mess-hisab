import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { API_BASE_URL, resetApiClientState } from "@/lib/api-client/client";
import { server } from "@/test/msw/server";
import { expectBanglaOnly } from "@/test/bangla";
import { renderWithProviders } from "@/test/render";
import { OnboardingView } from "./onboarding-view";

const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, refresh: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const user = { id: 1, name: "Rina", email: "r@example.com", locale: "en" };
const session = (memberships: unknown[] = []) =>
  http.get(`${API_BASE_URL}/api/auth/me`, () => HttpResponse.json({ data: { user, memberships } }));

beforeEach(() => {
  replace.mockClear();
  resetApiClientState();
  document.cookie = "XSRF-TOKEN=t; path=/";
});

async function fillBasics() {
  await userEvent.type(await screen.findByLabelText("Mess name"), "Green House");
  await userEvent.clear(screen.getByLabelText("First month starts on"));
  await userEvent.type(screen.getByLabelText("First month starts on"), "2026-11-01");
  await userEvent.clear(screen.getByLabelText("Your name in this mess"));
  await userEvent.type(screen.getByLabelText("Your name in this mess"), "Rina");
}

describe("OnboardingView", () => {
  it("lists memberships with role chips", async () => {
    server.use(
      session([
        { mess_id: 4, mess_name: "Green House", member_id: 1, is_admin: true, is_manager: false, archived: false },
        { mess_id: 5, mess_name: "Blue Flat", member_id: 2, is_admin: false, is_manager: false, archived: true },
      ]),
    );
    renderWithProviders(<OnboardingView />);
    expect(await screen.findByRole("link", { name: /Green House/ })).toHaveAttribute("href", "/4");
    expect(screen.getByRole("link", { name: /Blue Flat/ })).toBeInTheDocument();
    expect(screen.getByText("Admin")).toBeInTheDocument();
    expect(screen.getByText("Archived")).toBeInTheDocument();
  });

  it("sends signed-out visitors to login and keeps the way back", async () => {
    server.use(http.get(`${API_BASE_URL}/api/auth/me`, () => HttpResponse.json({ message: "no" }, { status: 401 })));
    renderWithProviders(<OnboardingView />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/login?next=%2Fonboarding"));
  });

  it("creates a mess with integer paisa and explicit direction, then opens it", async () => {
    const body = vi.fn();
    server.use(
      session(),
      http.post(`${API_BASE_URL}/api/messes`, async ({ request }) => {
        body(await request.json());
        return HttpResponse.json({ data: { mess: { id: 12 }, member: { id: 1 } } }, { status: 201 });
      }),
    );
    renderWithProviders(<OnboardingView />);
    await fillBasics();
    // Creator owes 1,234.50 taka -> negative paisa (default direction is "they owe").
    await userEvent.type(screen.getByLabelText("Your opening balance"), "1,234.50");

    await userEvent.click(screen.getByRole("button", { name: "Add a member" }));
    await userEvent.type(screen.getByLabelText("Member 1 name"), "Karim");
    await userEvent.type(screen.getByLabelText("Member 1 opening balance"), "0.07");
    const radios = screen.getAllByLabelText("The mess owes them");
    await userEvent.click(radios[1]!);

    await userEvent.click(screen.getByRole("button", { name: "Create mess" }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/12"));
    expect(body).toHaveBeenCalledWith({
      name: "Green House",
      month_start_day: 1,
      first_month_starts_on: "2026-11-01",
      creator_display_name: "Rina",
      creator_opening_balance_paisa: -123450,
      members: [{ display_name: "Karim", opening_balance_paisa: 7 }],
    });
  });

  it("omits the opening balance when left empty", async () => {
    const body = vi.fn();
    server.use(
      session(),
      http.post(`${API_BASE_URL}/api/messes`, async ({ request }) => {
        body(await request.json());
        return HttpResponse.json({ data: { mess: { id: 12 }, member: { id: 1 } } }, { status: 201 });
      }),
    );
    renderWithProviders(<OnboardingView />);
    await fillBasics();
    await userEvent.click(screen.getByRole("button", { name: "Create mess" }));
    await waitFor(() => expect(body).toHaveBeenCalled());
    expect(body.mock.calls[0]![0]).not.toHaveProperty("creator_opening_balance_paisa");
    expect(body.mock.calls[0]![0]).not.toHaveProperty("members");
  });

  it("rejects more than two decimals in the browser", async () => {
    server.use(session());
    renderWithProviders(<OnboardingView />);
    await fillBasics();
    await userEvent.type(screen.getByLabelText("Your opening balance"), "10.123");
    await userEvent.click(screen.getByRole("button", { name: "Create mess" }));
    expect(await screen.findByText("Enter an amount in taka, with at most 2 decimals.")).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  it("maps server 422 errors onto the matching inputs", async () => {
    server.use(
      session(),
      http.post(`${API_BASE_URL}/api/messes`, () =>
        HttpResponse.json(
          {
            message: "invalid",
            errors: {
              name: ["The name field is required."],
              creator_opening_balance_paisa: ["The opening balance is too large."],
              "members.0.display_name": ["Duplicate name."],
            },
          },
          { status: 422 },
        ),
      ),
    );
    renderWithProviders(<OnboardingView />);
    await fillBasics();
    await userEvent.click(screen.getByRole("button", { name: "Add a member" }));
    await userEvent.type(screen.getByLabelText("Member 1 name"), "Karim");
    await userEvent.click(screen.getByRole("button", { name: "Create mess" }));
    expect(await screen.findByText("The name field is required.")).toBeInTheDocument();
    expect(screen.getByText("The opening balance is too large.")).toBeInTheDocument();
    expect(screen.getByText("Duplicate name.")).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  it("shows other failures as an alert", async () => {
    server.use(session(), http.post(`${API_BASE_URL}/api/messes`, () => HttpResponse.json({ message: "boom" }, { status: 500 })));
    renderWithProviders(<OnboardingView />);
    await fillBasics();
    await userEvent.click(screen.getByRole("button", { name: "Create mess" }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });

  it("renders in Bangla", async () => {
    server.use(session());
    renderWithProviders(<OnboardingView />, { locale: "bn" });
    expect(await screen.findByRole("button", { name: "মেস খুলুন" })).toBeInTheDocument();
    expectBanglaOnly([]);
  });
});
