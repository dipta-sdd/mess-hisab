import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Invite, Member } from "@/lib/api/contract";
import { API_BASE_URL, resetApiClientState } from "@/lib/api-client/client";
import { server } from "@/test/msw/server";
import { expectBanglaOnly } from "@/test/bangla";
import { renderWithProviders } from "@/test/render";
import { MembersPage } from "./members-page";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const base = { user_id: null, has_account: false, is_admin: false, is_manager: false, joined_on: "2026-10-01", left_on: null, archived_at: null };
const member = (over: Partial<Member> & { id: number; display_name: string }): Member => ({ ...base, ...over });

const rina = member({ id: 1, display_name: "Rina", has_account: true, user_id: 1, is_admin: true });
const karim = member({ id: 2, display_name: "Karim", has_account: true, user_id: 2, is_manager: true });
const salma = member({ id: 3, display_name: "Salma" });
const old = member({ id: 4, display_name: "Old Timer", archived_at: "2026-09-01T00:00:00Z", left_on: "2026-08-31" });
const mess = { id: 3, name: "Green House" };

function serve(me: Member, members: Member[] = [rina, karim, salma, old], invites: Invite[] = []) {
  server.use(
    http.get(`${API_BASE_URL}/api/messes/3`, () => HttpResponse.json({ data: { mess, me } })),
    http.get(`${API_BASE_URL}/api/messes/3/members`, () => HttpResponse.json({ data: members })),
    http.get(`${API_BASE_URL}/api/messes/3/invites`, () => HttpResponse.json({ data: invites })),
  );
}

const openMenu = async (name: string) => {
  await userEvent.click(await screen.findByRole("button", { name: `More actions for ${name}` }));
};
const pick = async (member: string, action: "Edit" | "Archive") => {
  await openMenu(member);
  await userEvent.click(await screen.findByRole("menuitem", { name: `${action} ${member}` }));
};

const render = () => renderWithProviders(<MembersPage />, { messId: 3 });

beforeEach(() => {
  resetApiClientState();
  document.cookie = "XSRF-TOKEN=t; path=/";
});

describe("MembersPage list and filter", () => {
  it("shows active members by default and archived ones through the filter", async () => {
    serve(rina);
    render();
    expect(await screen.findByRole("button", { name: "More actions for Karim" })).toBeInTheDocument();
    expect(screen.queryByText("Old Timer")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Archived members" }));
    expect(screen.getByText("Old Timer")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "More actions for Karim" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Everyone" }));
    expect(screen.getByRole("button", { name: "More actions for Karim" })).toBeInTheDocument();
    expect(screen.getByText("Old Timer")).toBeInTheDocument();
  });

  it("is read-only for a plain member", async () => {
    serve(salma);
    render();
    expect(await screen.findByText("Karim")).toBeInTheDocument();
    expect(screen.getByText("Only the admin or manager can change members.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add member" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^More actions/ })).not.toBeInTheDocument();
    expect(screen.queryByText("Invites")).not.toBeInTheDocument();
    expect(screen.queryByText("Roles")).not.toBeInTheDocument();
  });

  it("shows invites but not role transfer to a manager", async () => {
    serve(karim);
    render();
    expect(await screen.findByRole("heading", { name: "Invites" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Roles" })).not.toBeInTheDocument();
  });

  it("shows an alert when the list fails to load", async () => {
    server.use(
      http.get(`${API_BASE_URL}/api/messes/3`, () => HttpResponse.json({ data: { mess, me: rina } })),
      http.get(`${API_BASE_URL}/api/messes/3/members`, () => HttpResponse.json({ message: "x" }, { status: 500 })),
    );
    render();
    expect(await screen.findByText("Could not load members. Please try again.")).toBeInTheDocument();
  });

  it("renders in Bangla", async () => {
    serve(rina);
    renderWithProviders(<MembersPage />, { messId: 3, locale: "bn" });
    expect(await screen.findByRole("heading", { name: "সদস্য" })).toBeInTheDocument();
    expectBanglaOnly([]);
  });
});

describe("adding a member", () => {
  it("posts the opening balance as signed paisa", async () => {
    serve(rina);
    const body = vi.fn();
    server.use(
      http.post(`${API_BASE_URL}/api/messes/3/members`, async ({ request }) => {
        body(await request.json());
        return HttpResponse.json({ data: member({ id: 9, display_name: "Nila" }) }, { status: 201 });
      }),
    );
    render();
    await userEvent.click(await screen.findByRole("button", { name: "Add member" }));
    const form = screen.getByRole("form", { name: "Add a member" });
    await userEvent.type(within(form).getByLabelText("Display name"), "Nila");
    await userEvent.type(within(form).getByLabelText("Opening balance"), "500.5");
    await userEvent.click(within(form).getByLabelText("The mess owes them"));
    await userEvent.click(within(form).getByRole("button", { name: "Add member" }));
    await waitFor(() => expect(body).toHaveBeenCalled());
    expect(body.mock.calls[0]![0]).toMatchObject({ display_name: "Nila", opening_balance_paisa: 50050 });
    await waitFor(() => expect(screen.queryByRole("form", { name: "Add a member" })).not.toBeInTheDocument());
  });

  it("puts a 422 on the matching input", async () => {
    serve(rina);
    server.use(
      http.post(`${API_BASE_URL}/api/messes/3/members`, () =>
        HttpResponse.json({ message: "x", errors: { display_name: ["That name is taken."] } }, { status: 422 }),
      ),
    );
    render();
    await userEvent.click(await screen.findByRole("button", { name: "Add member" }));
    const form = screen.getByRole("form", { name: "Add a member" });
    await userEvent.type(within(form).getByLabelText("Display name"), "Karim");
    await userEvent.click(within(form).getByRole("button", { name: "Add member" }));
    expect(await screen.findByText("That name is taken.")).toBeInTheDocument();
  });
});

describe("editing and archiving", () => {
  it("edits a member and clears left_on to null when blank", async () => {
    serve(rina);
    const body = vi.fn();
    server.use(
      http.patch(`${API_BASE_URL}/api/messes/3/members/3`, async ({ request }) => {
        body(await request.json());
        return HttpResponse.json({ data: salma });
      }),
    );
    render();
    await pick("Salma", "Edit");
    const form = screen.getByRole("form", { name: "Edit Salma" });
    const name = within(form).getByLabelText("Display name");
    await userEvent.clear(name);
    await userEvent.type(name, "Salma B");
    await userEvent.click(within(form).getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(body).toHaveBeenCalledWith({ display_name: "Salma B", joined_on: "2026-10-01", left_on: null }));
  });

  it("shows the is_admin_or_manager conflict clearly", async () => {
    serve(rina);
    server.use(
      http.post(`${API_BASE_URL}/api/messes/3/members/2/archive`, () =>
        HttpResponse.json({ message: "Cannot", code: "is_admin_or_manager" }, { status: 409 }),
      ),
    );
    render();
    await pick("Karim", "Archive");
    await userEvent.click(screen.getByRole("button", { name: "Yes, archive" }));
    expect(
      await screen.findByText("The admin or manager cannot be archived. Hand over the role to someone else first."),
    ).toBeInTheDocument();
  });

  it("archives after confirmation and refreshes the list", async () => {
    serve(rina);
    const archive = vi.fn();
    server.use(
      http.post(`${API_BASE_URL}/api/messes/3/members/3/archive`, () => {
        archive();
        return HttpResponse.json({ data: { ...salma, archived_at: "2026-11-01T00:00:00Z" } });
      }),
    );
    render();
    await pick("Salma", "Archive");
    expect(archive).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Yes, archive" }));
    await waitFor(() => expect(archive).toHaveBeenCalledTimes(1));
  });

  it("shows a server 403 as an alert", async () => {
    serve(karim);
    server.use(
      http.post(`${API_BASE_URL}/api/messes/3/members/3/archive`, () => HttpResponse.json({ message: "no" }, { status: 403 })),
    );
    render();
    await pick("Salma", "Archive");
    await userEvent.click(screen.getByRole("button", { name: "Yes, archive" }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });
});

describe("invites", () => {
  const invite: Invite = {
    id: 5,
    token: "abc",
    url: "http://localhost:3000/invite/abc",
    member_id: 3,
    expires_at: "2099-01-01T00:00:00Z",
    max_uses: 1,
    uses: 0,
    revoked_at: null,
  };

  it("creates an invite for a placeholder member", async () => {
    serve(rina);
    const body = vi.fn();
    server.use(
      http.post(`${API_BASE_URL}/api/messes/3/invites`, async ({ request }) => {
        body(await request.json());
        return HttpResponse.json({ data: invite }, { status: 201 });
      }),
    );
    render();
    const form = await screen.findByRole("form", { name: "Create invite" });
    const select = within(form).getByLabelText("For member");
    // Only unclaimed, unarchived placeholders are offered.
    expect(within(select).queryByRole("option", { name: "Karim" })).not.toBeInTheDocument();
    await userEvent.selectOptions(select, "Salma");
    await userEvent.type(within(form).getByLabelText("Expires in days (optional)"), "7");
    await userEvent.click(within(form).getByRole("button", { name: "Create invite" }));
    await waitFor(() => expect(body).toHaveBeenCalledWith({ member_id: 3, expires_in_days: 7 }));
  });

  it("rejects an out-of-range expiry without calling the API", async () => {
    serve(rina);
    render();
    const form = await screen.findByRole("form", { name: "Create invite" });
    await userEvent.type(within(form).getByLabelText("Expires in days (optional)"), "999");
    await userEvent.click(within(form).getByRole("button", { name: "Create invite" }));
    expect(await screen.findByText("Enter a number from 1 to 365.")).toBeInTheDocument();
  });

  it("copies the link and revokes", async () => {
    serve(rina, undefined, [invite]);
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    const revoked = vi.fn();
    server.use(
      http.delete(`${API_BASE_URL}/api/messes/3/invites/5`, () => {
        revoked();
        return new HttpResponse(null, { status: 204 });
      }),
    );
    render();
    await userEvent.click(await screen.findByRole("button", { name: "Copy link" }));
    expect(writeText).toHaveBeenCalledWith("http://localhost:3000/invite/abc");
    expect(await screen.findByText("Link copied.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Revoke" }));
    await waitFor(() => expect(revoked).toHaveBeenCalled());
  });

  it("tells the user when copying fails", async () => {
    serve(rina, undefined, [invite]);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: vi.fn().mockRejectedValue(new Error("denied")) },
      configurable: true,
    });
    render();
    await userEvent.click(await screen.findByRole("button", { name: "Copy link" }));
    expect(await screen.findByText(/Could not copy the link/)).toBeInTheDocument();
  });
});

describe("roles", () => {
  it("assigns a manager from members with an account", async () => {
    serve(rina);
    const body = vi.fn();
    server.use(
      http.post(`${API_BASE_URL}/api/messes/3/manager`, async ({ request }) => {
        body(await request.json());
        return HttpResponse.json({ data: mess });
      }),
    );
    render();
    const heading = await screen.findByRole("heading", { name: "Roles" });
    const card = heading.closest("div[data-slot='card']") as HTMLElement;
    const select = within(card).getByLabelText("New manager");
    // Placeholder (no account) and archived members are not offered.
    expect(within(select).queryByRole("option", { name: "Salma" })).not.toBeInTheDocument();
    expect(within(select).queryByRole("option", { name: "Old Timer" })).not.toBeInTheDocument();
    await userEvent.selectOptions(select, "Rina");
    await userEvent.click(within(card).getByRole("button", { name: "Make manager" }));
    await waitFor(() => expect(body).toHaveBeenCalledWith({ member_id: 1 }));
  });

  it("asks for confirmation before transferring admin, and surfaces a server error", async () => {
    serve(rina);
    server.use(
      http.post(`${API_BASE_URL}/api/messes/3/admin`, () =>
        HttpResponse.json({ message: "no", code: "member_not_eligible" }, { status: 409 }),
      ),
    );
    render();
    const heading = await screen.findByRole("heading", { name: "Roles" });
    const card = heading.closest("div[data-slot='card']") as HTMLElement;
    await userEvent.selectOptions(within(card).getByLabelText("New admin"), "Karim");
    await userEvent.click(within(card).getByRole("button", { name: "Transfer admin role" }));
    expect(within(card).getByText(/Transfer the admin role to Karim/)).toBeInTheDocument();
    await userEvent.click(within(card).getByRole("button", { name: "Yes, do it" }));
    expect(await screen.findByText(/cannot take this role/)).toBeInTheDocument();
  });
});
