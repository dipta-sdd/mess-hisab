import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { API_BASE_URL, resetApiClientState } from "@/lib/api-client/client";
import { server } from "@/test/msw/server";
import { renderWithProviders } from "@/test/render";
import { useGuardedLogout } from "./guarded-logout";

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }) }));
const count = vi.fn<() => Promise<number>>();
vi.mock("@/lib/offline/queue", () => ({ countQueued: () => count() }));

function Probe() {
  const logout = useGuardedLogout();
  return (
    <>
      <button onClick={logout.run}>go</button>
      {logout.dialog}
    </>
  );
}

describe("logging out with unsynced expenses", () => {
  let loggedOut = 0;
  beforeEach(() => {
    loggedOut = 0;
    resetApiClientState();
    document.cookie = "XSRF-TOKEN=t; path=/";
    server.use(http.post(`${API_BASE_URL}/api/auth/logout`, () => { loggedOut++; return new HttpResponse(null, { status: 204 }); }));
  });

  it("logs out straight away when nothing is waiting", async () => {
    count.mockResolvedValue(0);
    renderWithProviders(<Probe />);
    await userEvent.click(screen.getByText("go"));
    await waitFor(() => expect(loggedOut).toBe(1));
  });

  it("warns first, and only logs out if confirmed", async () => {
    count.mockResolvedValue(2);
    renderWithProviders(<Probe />);
    await userEvent.click(screen.getByText("go"));
    expect(await screen.findByText(/2 expenses are still waiting/)).toBeInTheDocument();
    expect(loggedOut).toBe(0);

    await userEvent.click(screen.getByRole("button", { name: "Stay logged in" }));
    await waitFor(() => expect(screen.queryByText(/still waiting/)).not.toBeInTheDocument());
    expect(loggedOut).toBe(0);

    await userEvent.click(screen.getByText("go"));
    await userEvent.click(await screen.findByRole("button", { name: "Log out anyway" }));
    await waitFor(() => expect(loggedOut).toBe(1));
  });
});
