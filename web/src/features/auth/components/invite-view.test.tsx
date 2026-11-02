import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { API_BASE_URL, resetApiClientState } from "@/lib/api-client/client";
import { server } from "@/test/msw/server";
import { expectBanglaOnly } from "@/test/bangla";
import { renderWithProviders } from "@/test/render";
import { InviteView } from "./invite-view";
import { Landing } from "./landing";

const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, refresh: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const me = { data: { user: { id: 1, name: "Rina", email: "r@example.com", locale: "en" }, memberships: [] } };
const signedOut = () => http.get(`${API_BASE_URL}/api/auth/me`, () => HttpResponse.json({ message: "no" }, { status: 401 }));
const signedIn = (memberships: unknown[] = []) =>
  http.get(`${API_BASE_URL}/api/auth/me`, () => HttpResponse.json({ data: { ...me.data, memberships } }));
const preview = (body: Record<string, unknown>, status = 200) =>
  http.get(`${API_BASE_URL}/api/invites/tok`, () => HttpResponse.json(body, { status }));

beforeEach(() => {
  replace.mockClear();
  resetApiClientState();
  document.cookie = "XSRF-TOKEN=t; path=/";
});

describe("InviteView", () => {
  it("shows the mess and member, and sends signed-out people to sign in or register with a way back", async () => {
    server.use(signedOut(), preview({ data: { mess_name: "Green House", member_display_name: "Karim", valid: true } }));
    renderWithProviders(<InviteView token="tok" />);
    expect(await screen.findByText(/Green House/)).toBeInTheDocument();
    expect(screen.getByText(/Karim/)).toBeInTheDocument();
    const next = encodeURIComponent("/invite/tok");
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", `/login?next=${next}`);
    expect(screen.getByRole("link", { name: "Create account" })).toHaveAttribute("href", `/register?next=${next}`);
  });

  it("lets a signed-in user accept with a display name", async () => {
    const body = vi.fn();
    server.use(
      signedIn(),
      preview({ data: { mess_name: "Green House", member_display_name: "Karim", valid: true } }),
      http.post(`${API_BASE_URL}/api/invites/tok/accept`, async ({ request }) => {
        body(await request.json());
        return HttpResponse.json({ data: { mess_id: 7, member_id: 3 } });
      }),
    );
    renderWithProviders(<InviteView token="tok" />);
    await userEvent.type(await screen.findByLabelText(/Display name in this mess/), "Karim R");
    await userEvent.click(screen.getByRole("button", { name: "Join this mess" }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/7/members"));
    expect(body).toHaveBeenCalledWith({ display_name: "Karim R" });
  });

  it("accepts with no body fields when the name is left empty", async () => {
    const body = vi.fn();
    server.use(
      signedIn(),
      preview({ data: { mess_name: "Green House", valid: true } }),
      http.post(`${API_BASE_URL}/api/invites/tok/accept`, async ({ request }) => {
        body(await request.json());
        return HttpResponse.json({ data: { mess_id: 7, member_id: 3 } });
      }),
    );
    renderWithProviders(<InviteView token="tok" />);
    await userEvent.click(await screen.findByRole("button", { name: "Join this mess" }));
    await waitFor(() => expect(body).toHaveBeenCalledWith({}));
  });

  it("shows already_member as a clear error", async () => {
    server.use(
      signedIn(),
      preview({ data: { mess_name: "Green House", valid: true } }),
      http.post(`${API_BASE_URL}/api/invites/tok/accept`, () =>
        HttpResponse.json({ message: "Already", code: "already_member" }, { status: 409 }),
      ),
    );
    renderWithProviders(<InviteView token="tok" />);
    await userEvent.click(await screen.findByRole("button", { name: "Join this mess" }));
    expect(await screen.findByText("You are already a member of this mess.")).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  it("shows invite_invalid when acceptance races a revoke", async () => {
    server.use(
      signedIn(),
      preview({ data: { mess_name: "Green House", valid: true } }),
      http.post(`${API_BASE_URL}/api/invites/tok/accept`, () =>
        HttpResponse.json({ message: "Invalid", code: "invite_invalid" }, { status: 409 }),
      ),
    );
    renderWithProviders(<InviteView token="tok" />);
    await userEvent.click(await screen.findByRole("button", { name: "Join this mess" }));
    expect(await screen.findByText("This invite is no longer valid.")).toBeInTheDocument();
  });

  it.each([
    ["revoked", /cancelled by the mess admin/],
    ["expired", /has expired/],
    ["used_up", /maximum number of times/],
    ["member_unavailable", /no longer available/],
  ])("explains a %s invite", async (reason, text) => {
    server.use(signedIn(), preview({ data: { mess_name: "Green House", valid: false, reason } }));
    renderWithProviders(<InviteView token="tok" />);
    expect(await screen.findByText(text)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Join this mess" })).not.toBeInTheDocument();
  });

  it("treats an unknown token (404) as not valid", async () => {
    server.use(signedOut(), preview({ message: "nope" }, 404));
    renderWithProviders(<InviteView token="tok" />);
    expect(await screen.findByText("This invite link is not valid.")).toBeInTheDocument();
  });

  it("is available in Bangla", async () => {
    server.use(signedIn(), preview({ data: { mess_name: "Green House", valid: true } }));
    renderWithProviders(<InviteView token="tok" />, { locale: "bn" });
    expect(await screen.findByRole("button", { name: "এই মেসে যোগ দিন" })).toBeInTheDocument();
    expectBanglaOnly(["House"]);
  });
});

describe("Landing", () => {
  it("sends signed-out visitors to login", async () => {
    server.use(signedOut());
    renderWithProviders(<Landing />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/login"));
  });

  it("opens the only mess directly", async () => {
    server.use(signedIn([{ mess_id: 9, member_id: 1, role: "admin" }]));
    renderWithProviders(<Landing />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/9/members"));
  });

  it("sends people with no or several messes to onboarding", async () => {
    server.use(signedIn([]));
    renderWithProviders(<Landing />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/onboarding"));
  });

  it("shows an alert if the session check fails", async () => {
    server.use(http.get(`${API_BASE_URL}/api/auth/me`, () => HttpResponse.json({ message: "x" }, { status: 500 })));
    renderWithProviders(<Landing />);
    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });
});
