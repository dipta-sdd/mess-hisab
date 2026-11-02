import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { API_BASE_URL, resetApiClientState } from "@/lib/api-client/client";
import { server } from "@/test/msw/server";
import { expectBanglaOnly } from "@/test/bangla";
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

const user = { id: 1, name: "Rina", email: "rina@example.com", phone: "01712345678", phone_verified: true, has_verified_contact: true, locale: "en" };
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
  async function fillAndSubmit(login = "01712345678") {
    await userEvent.type(screen.getByLabelText("Phone or email"), login);
    await userEvent.type(screen.getByLabelText("Password"), "secret-pass");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
  }

  it("signs in with a phone and goes to the landing route", async () => {
    const body = vi.fn();
    server.use(
      http.post(`${API_BASE_URL}/api/auth/login`, async ({ request }) => {
        body(await request.json());
        return HttpResponse.json({ data: user });
      }),
    );
    renderWithProviders(<LoginForm />);
    await fillAndSubmit("01712345678");
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/"));
    expect(body).toHaveBeenCalledWith({ login: "01712345678", password: "secret-pass", remember: false });
  });

  it("signs in with an email in the same field", async () => {
    const body = vi.fn();
    server.use(
      http.post(`${API_BASE_URL}/api/auth/login`, async ({ request }) => {
        body(await request.json());
        return HttpResponse.json({ data: user });
      }),
    );
    renderWithProviders(<LoginForm />);
    await fillAndSubmit("rina@example.com");
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/"));
    expect(body).toHaveBeenCalledWith({ login: "rina@example.com", password: "secret-pass", remember: false });
  });

  it("sends a locked account to verify-phone", async () => {
    server.use(
      http.post(`${API_BASE_URL}/api/auth/login`, () =>
        HttpResponse.json({ data: { ...user, phone_verified: false, has_verified_contact: false } }),
      ),
    );
    renderWithProviders(<LoginForm />);
    await fillAndSubmit();
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/verify-phone"));
  });

  async function signInAs(accountLocale: string) {
    server.use(
      http.post(`${API_BASE_URL}/api/auth/login`, () => HttpResponse.json({ data: { ...user, locale: accountLocale } })),
    );
    renderWithProviders(<LoginForm />);
    await fillAndSubmit();
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

  it("links to register and forgot password, and no longer offers Google or an 'or' divider", () => {
    renderWithProviders(<LoginForm />);
    expect(screen.getByRole("link", { name: "Create one" })).toHaveAttribute("href", "/register");
    expect(screen.getByRole("link", { name: "Forgot your password?" })).toHaveAttribute("href", "/forgot-password");
    expect(screen.queryByRole("link", { name: "Continue with Google" })).not.toBeInTheDocument();
    expect(screen.queryByText("or")).not.toBeInTheDocument();
  });

  it("follows a safe ?next and ignores an unsafe one", async () => {
    search = new URLSearchParams("next=/invite/abc");
    server.use(http.post(`${API_BASE_URL}/api/auth/login`, () => HttpResponse.json({ data: user })));
    renderWithProviders(<LoginForm />);
    await fillAndSubmit();
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/invite/abc"));
  });

  it("shows a server 422 on the login input", async () => {
    server.use(
      http.post(`${API_BASE_URL}/api/auth/login`, () =>
        HttpResponse.json({ message: "bad", errors: { login: ["These credentials do not match."] } }, { status: 422 }),
      ),
    );
    renderWithProviders(<LoginForm />);
    await fillAndSubmit();
    expect(await screen.findByText("These credentials do not match.")).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  it("validates required fields before calling the API", async () => {
    renderWithProviders(<LoginForm />);
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findAllByText("This field is required.")).not.toHaveLength(0);
  });

  it("renders in Bangla", () => {
    renderWithProviders(<LoginForm />, { locale: "bn" });
    expect(screen.getByRole("button", { name: "লগইন" })).toBeInTheDocument();
    expect(screen.getByLabelText("ফোন বা ইমেইল")).toBeInTheDocument();
    expectBanglaOnly([]);
  });
});

describe("RegisterForm", () => {
  async function fill(phone = "01712345678", email = "") {
    await userEvent.type(screen.getByLabelText("Your name"), "Rina");
    await userEvent.type(screen.getByLabelText("Mobile number"), phone);
    if (email) await userEvent.type(screen.getByLabelText("Email (optional)"), email);
    await userEvent.type(screen.getByLabelText("Password"), "secret-pass");
    await userEvent.type(screen.getByLabelText("Confirm password"), "secret-pass");
    await userEvent.click(screen.getByRole("button", { name: "Create account" }));
  }

  it("registers with a phone (email left out) and goes to verify-phone", async () => {
    const body = vi.fn();
    server.use(
      http.post(`${API_BASE_URL}/api/auth/register`, async ({ request }) => {
        body(await request.json());
        return HttpResponse.json({ data: { ...user, phone_verified: false, has_verified_contact: false } }, { status: 201 });
      }),
    );
    renderWithProviders(<RegisterForm />);
    await fill("+880 1712-345678");
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/verify-phone"));
    expect(body).toHaveBeenCalledWith({
      name: "Rina",
      phone: "+8801712345678",
      password: "secret-pass",
      password_confirmation: "secret-pass",
      locale: "en",
    });
  });

  it("sends the optional email when given", async () => {
    const body = vi.fn();
    server.use(
      http.post(`${API_BASE_URL}/api/auth/register`, async ({ request }) => {
        body(await request.json());
        return HttpResponse.json({ data: user }, { status: 201 });
      }),
    );
    renderWithProviders(<RegisterForm />);
    await fill("01712345678", "rina@example.com");
    await waitFor(() => expect(replace).toHaveBeenCalled());
    expect(body).toHaveBeenCalledWith(expect.objectContaining({ email: "rina@example.com", phone: "01712345678" }));
  });

  it("keeps ?next through to verify-phone", async () => {
    search = new URLSearchParams("next=/invite/abc");
    server.use(http.post(`${API_BASE_URL}/api/auth/register`, () => HttpResponse.json({ data: user }, { status: 201 })));
    renderWithProviders(<RegisterForm />);
    await fill();
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/verify-phone?next=%2Finvite%2Fabc"));
  });

  it("rejects a non-Bangladeshi number without calling the API", async () => {
    renderWithProviders(<RegisterForm />);
    await fill("12345");
    expect(await screen.findByText("Enter a valid Bangladesh mobile number.")).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  it("flags a password mismatch without calling the API", async () => {
    renderWithProviders(<RegisterForm />);
    await userEvent.type(screen.getByLabelText("Your name"), "Rina");
    await userEvent.type(screen.getByLabelText("Mobile number"), "01712345678");
    await userEvent.type(screen.getByLabelText("Password"), "secret-pass");
    await userEvent.type(screen.getByLabelText("Confirm password"), "different");
    await userEvent.click(screen.getByRole("button", { name: "Create account" }));
    expect(await screen.findByText("The passwords do not match.")).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  it("puts a taken-phone 422 on the phone input", async () => {
    server.use(
      http.post(`${API_BASE_URL}/api/auth/register`, () =>
        HttpResponse.json({ message: "x", errors: { phone: ["The phone has already been taken."] } }, { status: 422 }),
      ),
    );
    renderWithProviders(<RegisterForm />);
    await fill();
    expect(await screen.findByText("The phone has already been taken.")).toBeInTheDocument();
  });

  it("renders in Bangla", () => {
    renderWithProviders(<RegisterForm />, { locale: "bn" });
    expect(screen.getByLabelText("মোবাইল নম্বর")).toBeInTheDocument();
    expectBanglaOnly(["English", "বাংলা"]);
  });
});

describe("ForgotPasswordForm", () => {
  it("runs phone -> code -> new password -> done", async () => {
    const sendBody = vi.fn();
    const verifyBody = vi.fn();
    const resetBody = vi.fn();
    server.use(
      http.post(`${API_BASE_URL}/api/auth/password/phone`, async ({ request }) => {
        sendBody(await request.json());
        return HttpResponse.json({ message: "ok" }, { status: 202 });
      }),
      http.post(`${API_BASE_URL}/api/auth/password/phone/verify`, async ({ request }) => {
        verifyBody(await request.json());
        return HttpResponse.json({ reset_token: "tok-1" });
      }),
      http.post(`${API_BASE_URL}/api/auth/password/phone/reset`, async ({ request }) => {
        resetBody(await request.json());
        return HttpResponse.json({ message: "ok" });
      }),
    );
    renderWithProviders(<ForgotPasswordForm />);
    await userEvent.type(screen.getByLabelText("Mobile number"), "01712345678");
    await userEvent.click(screen.getByRole("button", { name: "Send code" }));
    await userEvent.type(await screen.findByLabelText("6-digit code"), "123456");
    await userEvent.click(screen.getByRole("button", { name: "Check code" }));
    await userEvent.type(await screen.findByLabelText("New password"), "brand-new-pass");
    await userEvent.type(screen.getByLabelText("Confirm password"), "brand-new-pass");
    await userEvent.click(screen.getByRole("button", { name: "Save new password" }));
    expect(await screen.findByText(/password was changed/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to sign in" })).toHaveAttribute("href", "/login");
    expect(sendBody).toHaveBeenCalledWith({ phone: "01712345678" });
    expect(verifyBody).toHaveBeenCalledWith({ phone: "01712345678", code: "123456" });
    expect(resetBody).toHaveBeenCalledWith({
      phone: "01712345678",
      reset_token: "tok-1",
      password: "brand-new-pass",
      password_confirmation: "brand-new-pass",
    });
  });

  it("shows a wrong-code message and stays on the code step", async () => {
    server.use(
      http.post(`${API_BASE_URL}/api/auth/password/phone`, () => HttpResponse.json({}, { status: 202 })),
      http.post(`${API_BASE_URL}/api/auth/password/phone/verify`, () =>
        HttpResponse.json({ message: "x", code: "otp_invalid", errors: { code: ["otp_invalid"] } }, { status: 422 }),
      ),
    );
    renderWithProviders(<ForgotPasswordForm />);
    await userEvent.type(screen.getByLabelText("Mobile number"), "01712345678");
    await userEvent.click(screen.getByRole("button", { name: "Send code" }));
    await userEvent.type(await screen.findByLabelText("6-digit code"), "000000");
    await userEvent.click(screen.getByRole("button", { name: "Check code" }));
    expect(await screen.findByText(/That code is not correct/)).toBeInTheDocument();
  });

  it("shows an invalid reset token in the alert", async () => {
    server.use(
      http.post(`${API_BASE_URL}/api/auth/password/phone`, () => HttpResponse.json({}, { status: 202 })),
      http.post(`${API_BASE_URL}/api/auth/password/phone/verify`, () => HttpResponse.json({ reset_token: "t" })),
      http.post(`${API_BASE_URL}/api/auth/password/phone/reset`, () =>
        HttpResponse.json({ message: "x", errors: { reset_token: ["The reset token is invalid."] } }, { status: 422 }),
      ),
    );
    renderWithProviders(<ForgotPasswordForm />);
    await userEvent.type(screen.getByLabelText("Mobile number"), "01712345678");
    await userEvent.click(screen.getByRole("button", { name: "Send code" }));
    await userEvent.type(await screen.findByLabelText("6-digit code"), "123456");
    await userEvent.click(screen.getByRole("button", { name: "Check code" }));
    await userEvent.type(await screen.findByLabelText("New password"), "brand-new-pass");
    await userEvent.type(screen.getByLabelText("Confirm password"), "brand-new-pass");
    await userEvent.click(screen.getByRole("button", { name: "Save new password" }));
    expect(await screen.findByText("The reset token is invalid.")).toBeInTheDocument();
  });

  it("validates the phone before calling the API", async () => {
    renderWithProviders(<ForgotPasswordForm />);
    await userEvent.type(screen.getByLabelText("Mobile number"), "abc");
    await userEvent.click(screen.getByRole("button", { name: "Send code" }));
    expect(await screen.findByText("Enter a valid Bangladesh mobile number.")).toBeInTheDocument();
  });

  it("shows an alert when sending fails", async () => {
    server.use(
      http.post(`${API_BASE_URL}/api/auth/password/phone`, () =>
        HttpResponse.json({ message: "x", code: "sms_failed" }, { status: 502 }),
      ),
    );
    renderWithProviders(<ForgotPasswordForm />);
    await userEvent.type(screen.getByLabelText("Mobile number"), "01712345678");
    await userEvent.click(screen.getByRole("button", { name: "Send code" }));
    expect(await screen.findByText(/could not send the SMS/)).toBeInTheDocument();
  });

  it("renders the first step in Bangla", () => {
    renderWithProviders(<ForgotPasswordForm />, { locale: "bn" });
    expect(screen.getByRole("button", { name: "কোড পাঠান" })).toBeInTheDocument();
    expectBanglaOnly([]);
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
