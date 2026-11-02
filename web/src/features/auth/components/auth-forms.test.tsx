import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { API_BASE_URL, resetApiClientState } from "@/lib/api-client/client";
import { server } from "@/test/msw/server";
import { renderWithProviders } from "@/test/render";
import { ForgotPasswordForm } from "./forgot-password-form";
import { GoogleCallback } from "./google-callback";
import { LoginForm } from "./login-form";
import { RegisterForm } from "./register-form";
import { ResetPasswordForm } from "./reset-password-form";

const replace = vi.fn();
const refresh = vi.fn();
let search = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, refresh, push: vi.fn() }),
  useSearchParams: () => search,
}));

const user = { id: 1, name: "Rina", email: "rina@example.com", locale: "en" };
const me = { data: { user, memberships: [] } };

beforeEach(() => {
  replace.mockClear();
  refresh.mockClear();
  search = new URLSearchParams();
  resetApiClientState();
  document.cookie = "XSRF-TOKEN=t; path=/";
  document.cookie = "NEXT_LOCALE=en; path=/";
  window.sessionStorage.clear();
});

describe("LoginForm", () => {
  it("signs in and goes to the landing route", async () => {
    const body = vi.fn();
    server.use(
      http.post(`${API_BASE_URL}/api/auth/login`, async ({ request }) => {
        body(await request.json());
        return HttpResponse.json({ data: user });
      }),
    );
    renderWithProviders(<LoginForm />);
    await userEvent.type(screen.getByLabelText("Email"), "rina@example.com");
    await userEvent.type(screen.getByLabelText("Password"), "secret-pass");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/"));
    expect(body).toHaveBeenCalledWith({ email: "rina@example.com", password: "secret-pass", remember: false });
  });

  async function signInAs(accountLocale: string) {
    server.use(
      http.post(`${API_BASE_URL}/api/auth/login`, () => HttpResponse.json({ data: { ...user, locale: accountLocale } })),
    );
    renderWithProviders(<LoginForm />);
    await userEvent.type(screen.getByLabelText("Email"), "rina@example.com");
    await userEvent.type(screen.getByLabelText("Password"), "secret-pass");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/"));
  }

  it("saves the device language on the account via PATCH /api/auth/me when they differ", async () => {
    const body = vi.fn();
    server.use(
      http.patch(`${API_BASE_URL}/api/auth/me`, async ({ request }) => {
        body(await request.json());
        return HttpResponse.json({ data: user });
      }),
    );
    await signInAs("bn"); // device cookie says en, account says bn
    await waitFor(() => expect(body).toHaveBeenCalledWith({ locale: "en" }));
  });

  it("adopts the account language on a device with no language choice", async () => {
    document.cookie = "NEXT_LOCALE=; path=/; max-age=0";
    const patch = vi.fn();
    server.use(
      http.patch(`${API_BASE_URL}/api/auth/me`, () => {
        patch();
        return HttpResponse.json({ data: user });
      }),
    );
    await signInAs("bn");
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(document.cookie).toContain("NEXT_LOCALE=bn");
    expect(patch).not.toHaveBeenCalled();
  });

  it("still signs in when saving the language fails", async () => {
    server.use(http.patch(`${API_BASE_URL}/api/auth/me`, () => HttpResponse.json({ message: "x" }, { status: 500 })));
    await signInAs("bn");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("links to register, forgot password and Google", () => {
    renderWithProviders(<LoginForm />);
    expect(screen.getByRole("link", { name: "Create one" })).toHaveAttribute("href", "/register");
    expect(screen.getByRole("link", { name: "Forgot your password?" })).toHaveAttribute("href", "/forgot-password");
    expect(screen.getByRole("link", { name: "Continue with Google" })).toHaveAttribute(
      "href",
      `${API_BASE_URL}/api/auth/google/redirect`,
    );
  });

  it("follows a safe ?next and ignores an unsafe one", async () => {
    search = new URLSearchParams("next=/invite/abc");
    server.use(http.post(`${API_BASE_URL}/api/auth/login`, () => HttpResponse.json({ data: user })));
    renderWithProviders(<LoginForm />);
    await userEvent.type(screen.getByLabelText("Email"), "rina@example.com");
    await userEvent.type(screen.getByLabelText("Password"), "secret-pass");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/invite/abc"));
  });

  it("shows a server 422 on the email input", async () => {
    server.use(
      http.post(`${API_BASE_URL}/api/auth/login`, () =>
        HttpResponse.json({ message: "bad", errors: { email: ["These credentials do not match."] } }, { status: 422 }),
      ),
    );
    renderWithProviders(<LoginForm />);
    await userEvent.type(screen.getByLabelText("Email"), "rina@example.com");
    await userEvent.type(screen.getByLabelText("Password"), "wrong");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByText("These credentials do not match.")).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  it("validates required fields before calling the API", async () => {
    renderWithProviders(<LoginForm />);
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findAllByText("This field is required.")).not.toHaveLength(0);
  });

  it("shows the Google failure message after a failed callback", () => {
    search = new URLSearchParams("error=google");
    renderWithProviders(<LoginForm />);
    expect(screen.getByText(/Google sign-in did not work/)).toBeInTheDocument();
  });

  it("renders in Bangla", () => {
    renderWithProviders(<LoginForm />, { locale: "bn" });
    expect(screen.getByRole("button", { name: "সাইন ইন" })).toBeInTheDocument();
  });
});

describe("RegisterForm", () => {
  it("registers with the chosen language", async () => {
    const body = vi.fn();
    server.use(
      http.post(`${API_BASE_URL}/api/auth/register`, async ({ request }) => {
        body(await request.json());
        return HttpResponse.json({ data: user }, { status: 201 });
      }),
    );
    renderWithProviders(<RegisterForm />);
    await userEvent.type(screen.getByLabelText("Your name"), "Rina");
    await userEvent.type(screen.getByLabelText("Email"), "rina@example.com");
    await userEvent.type(screen.getByLabelText("Password"), "secret-pass");
    await userEvent.type(screen.getByLabelText("Confirm password"), "secret-pass");
    await userEvent.click(screen.getByRole("button", { name: "Create account" }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/"));
    expect(body).toHaveBeenCalledWith({
      name: "Rina",
      email: "rina@example.com",
      password: "secret-pass",
      password_confirmation: "secret-pass",
      locale: "en",
    });
  });

  it("flags a password mismatch without calling the API", async () => {
    renderWithProviders(<RegisterForm />);
    await userEvent.type(screen.getByLabelText("Your name"), "Rina");
    await userEvent.type(screen.getByLabelText("Email"), "rina@example.com");
    await userEvent.type(screen.getByLabelText("Password"), "secret-pass");
    await userEvent.type(screen.getByLabelText("Confirm password"), "different");
    await userEvent.click(screen.getByRole("button", { name: "Create account" }));
    expect(await screen.findByText("The passwords do not match.")).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  it("puts a taken-email 422 on the email input", async () => {
    server.use(
      http.post(`${API_BASE_URL}/api/auth/register`, () =>
        HttpResponse.json({ message: "x", errors: { email: ["The email has already been taken."] } }, { status: 422 }),
      ),
    );
    renderWithProviders(<RegisterForm />);
    await userEvent.type(screen.getByLabelText("Your name"), "Rina");
    await userEvent.type(screen.getByLabelText("Email"), "rina@example.com");
    await userEvent.type(screen.getByLabelText("Password"), "secret-pass");
    await userEvent.type(screen.getByLabelText("Confirm password"), "secret-pass");
    await userEvent.click(screen.getByRole("button", { name: "Create account" }));
    expect(await screen.findByText("The email has already been taken.")).toBeInTheDocument();
  });
});

describe("ForgotPasswordForm", () => {
  it("confirms that a link was sent", async () => {
    server.use(http.post(`${API_BASE_URL}/api/auth/forgot-password`, () => HttpResponse.json({ message: "ok" })));
    renderWithProviders(<ForgotPasswordForm />);
    await userEvent.type(screen.getByLabelText("Email"), "rina@example.com");
    await userEvent.click(screen.getByRole("button", { name: "Send reset link" }));
    expect(await screen.findByText(/reset link is on its way/)).toBeInTheDocument();
  });

  it("shows an alert when the server fails", async () => {
    server.use(http.post(`${API_BASE_URL}/api/auth/forgot-password`, () => HttpResponse.json({ message: "boom" }, { status: 500 })));
    renderWithProviders(<ForgotPasswordForm />);
    await userEvent.type(screen.getByLabelText("Email"), "rina@example.com");
    await userEvent.click(screen.getByRole("button", { name: "Send reset link" }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });
});

describe("ResetPasswordForm", () => {
  it("resets the password with the token from the link", async () => {
    search = new URLSearchParams("token=tok123&email=rina%40example.com");
    const body = vi.fn();
    server.use(
      http.post(`${API_BASE_URL}/api/auth/reset-password`, async ({ request }) => {
        body(await request.json());
        return HttpResponse.json({ message: "ok" });
      }),
    );
    renderWithProviders(<ResetPasswordForm />);
    await userEvent.type(screen.getByLabelText("New password"), "brand-new-pass");
    await userEvent.type(screen.getByLabelText("Confirm password"), "brand-new-pass");
    await userEvent.click(screen.getByRole("button", { name: "Save new password" }));
    expect(await screen.findByText(/password was changed/)).toBeInTheDocument();
    expect(body).toHaveBeenCalledWith({
      token: "tok123",
      email: "rina@example.com",
      password: "brand-new-pass",
      password_confirmation: "brand-new-pass",
    });
  });

  it("explains a missing token", () => {
    renderWithProviders(<ResetPasswordForm />);
    expect(screen.getByText(/incomplete or has expired/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Request a new link" })).toHaveAttribute("href", "/forgot-password");
  });

  it("shows an expired-token error from the server", async () => {
    search = new URLSearchParams("token=old&email=rina%40example.com");
    server.use(
      http.post(`${API_BASE_URL}/api/auth/reset-password`, () =>
        HttpResponse.json({ message: "x", errors: { email: ["This password reset token is invalid."] } }, { status: 422 }),
      ),
    );
    renderWithProviders(<ResetPasswordForm />);
    await userEvent.type(screen.getByLabelText("New password"), "brand-new-pass");
    await userEvent.type(screen.getByLabelText("Confirm password"), "brand-new-pass");
    await userEvent.click(screen.getByRole("button", { name: "Save new password" }));
    expect(await screen.findByText("This password reset token is invalid.")).toBeInTheDocument();
  });
});

describe("GoogleCallback", () => {
  it("goes to the landing route after status=ok", async () => {
    search = new URLSearchParams("status=ok");
    server.use(http.get(`${API_BASE_URL}/api/auth/me`, () => HttpResponse.json(me)));
    renderWithProviders(<GoogleCallback />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/"));
  });

  it("returns to the stashed page after status=ok", async () => {
    search = new URLSearchParams("status=ok");
    window.sessionStorage.setItem("mh.next", "/invite/abc");
    server.use(http.get(`${API_BASE_URL}/api/auth/me`, () => HttpResponse.json(me)));
    renderWithProviders(<GoogleCallback />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/invite/abc"));
  });

  it("goes back to login with an error flag after status=error", async () => {
    search = new URLSearchParams("status=error");
    renderWithProviders(<GoogleCallback />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/login?error=google"));
  });

  it("goes back to login when no session exists", async () => {
    search = new URLSearchParams("status=ok");
    server.use(http.get(`${API_BASE_URL}/api/auth/me`, () => HttpResponse.json({ message: "no" }, { status: 401 })));
    renderWithProviders(<GoogleCallback />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/login?error=google"));
  });
});
