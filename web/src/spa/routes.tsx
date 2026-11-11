"use client";

import { lazy, Suspense, useEffect, type ReactNode } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { StaffOnly } from "@/components/shell/staff-only";
import { navigate } from "@/lib/nav";
import { AuthLayout, MessLayout, OnboardingLayout } from "./layouts";

const Landing = lazy(() => import("@/features/auth").then((m) => ({ default: m.Landing })));
const LoginForm = lazy(() => import("@/features/auth").then((m) => ({ default: m.LoginForm })));
const RegisterForm = lazy(() => import("@/features/auth").then((m) => ({ default: m.RegisterForm })));
const ForgotPasswordForm = lazy(() => import("@/features/auth").then((m) => ({ default: m.ForgotPasswordForm })));
const ResetPasswordForm = lazy(() => import("@/features/auth").then((m) => ({ default: m.ResetPasswordForm })));
const VerifyPhoneForm = lazy(() => import("@/features/auth").then((m) => ({ default: m.VerifyPhoneForm })));
const GoogleCallback = lazy(() => import("@/features/auth").then((m) => ({ default: m.GoogleCallback })));
const InviteView = lazy(() => import("@/features/auth").then((m) => ({ default: m.InviteView })));
const OnboardingView = lazy(() => import("@/features/mess").then((m) => ({ default: m.OnboardingView })));
const DashboardPage = lazy(() => import("@/features/dashboard/dashboard-page").then((m) => ({ default: m.DashboardPage })));
const StaffDashboard = lazy(() => import("@/features/dashboard/staff-dashboard").then((m) => ({ default: m.StaffDashboard })));
const ExpensesPage = lazy(() => import("@/features/expenses/expenses-page").then((m) => ({ default: m.ExpensesPage })));
const PaymentsPage = lazy(() => import("@/features/payments/payments-page").then((m) => ({ default: m.PaymentsPage })));
const MealsPage = lazy(() => import("@/features/meals/meals-page").then((m) => ({ default: m.MealsPage })));
const HistoryPage = lazy(() => import("@/features/statements/history-page").then((m) => ({ default: m.HistoryPage })));
const StatementPage = lazy(() => import("@/features/statements/statement-page").then((m) => ({ default: m.StatementPage })));
const ProfilePage = lazy(() => import("@/features/profile").then((m) => ({ default: m.ProfilePage })));
const FixedPage = lazy(() => import("@/features/fixed/fixed-page").then((m) => ({ default: m.FixedPage })));
const SettingsPage = lazy(() => import("@/features/settings").then((m) => ({ default: m.SettingsPage })));
const AuditPage = lazy(() => import("@/features/audit").then((m) => ({ default: m.AuditPage })));
const MembersPage = lazy(() => import("@/features/members").then((m) => ({ default: m.MembersPage })));
const MonthsPage = lazy(() => import("@/features/months/months-page").then((m) => ({ default: m.MonthsPage })));

function positive(value: string | null | undefined): number | null {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function Redirect({ to }: { to: string }) {
  useEffect(() => navigate(to, { replace: true }), [to]);
  return null;
}

function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-3 p-6 text-center">
      <h1 className="text-2xl font-semibold">404</h1>
      <a href="/" className="underline">Mess Hisab</a>
    </main>
  );
}

const staff = (node: ReactNode) => <StaffOnly>{node}</StaffOnly>;

/** The signed-in app, below /<mess>/. `rest` is the path after the mess id. */
function messRoute(rest: string[], query: URLSearchParams): ReactNode {
  const month = positive(query.get("month"));
  const tab = query.get("tab") === "report" ? "report" : "statement";
  const [a, b] = rest;

  if (!a) return <DashboardPage initialMonthId={month} />;
  if (a === "expenses" && !b) return <ExpensesPage />;
  if (a === "payments" && !b) return <PaymentsPage />;
  if (a === "meals" && !b) return <MealsPage />;
  if (a === "history" && !b) return <HistoryPage />;
  if (a === "profile" && !b) return <ProfilePage />;
  if (a === "statements" && b && rest.length === 2) {
    const memberId = positive(b);
    return memberId ? <StatementPage memberId={memberId} initialMonthId={month} initialTab={tab} /> : <NotFound />;
  }
  if (a === "admin") {
    if (!b) return staff(<StaffDashboard initialMonthId={month} />);
    if (rest.length === 2) {
      switch (b) {
        case "expenses": return staff(<ExpensesPage scope="all" />);
        case "payments": return staff(<PaymentsPage scope="all" />);
        case "meals": return staff(<MealsPage scope="all" />);
        case "members": return staff(<MembersPage />);
        case "months": return staff(<MonthsPage />);
        case "fixed": return staff(<FixedPage />);
        case "settings": return staff(<SettingsPage />);
        case "audit": return staff(<AuditPage />);
        case "statements": return staff(<StatementPage initialMonthId={month} initialTab={tab} />);
      }
    }
  }
  return <NotFound />;
}

export function Routes() {
  const pathname = usePathname();
  const query = useSearchParams();
  const parts = pathname.split("/").filter(Boolean);
  const [first, second] = parts;

  let page: ReactNode;
  if (parts.length === 0) page = <Landing />;
  else if (first === "login" && parts.length === 1) page = <AuthLayout><LoginForm /></AuthLayout>;
  else if (first === "register" && parts.length === 1) page = <AuthLayout><RegisterForm /></AuthLayout>;
  else if (first === "forgot-password" && parts.length === 1) page = <AuthLayout><ForgotPasswordForm /></AuthLayout>;
  else if (first === "reset-password" && parts.length === 1) page = <AuthLayout><ResetPasswordForm /></AuthLayout>;
  else if (first === "verify-phone" && parts.length === 1) page = <AuthLayout><VerifyPhoneForm /></AuthLayout>;
  else if (first === "auth" && second === "callback" && parts.length === 2) page = <AuthLayout><GoogleCallback /></AuthLayout>;
  else if (first === "invite" && second && parts.length === 2) page = <AuthLayout><InviteView token={decodeURIComponent(second)} /></AuthLayout>;
  else if (first === "onboarding" && parts.length === 1) page = <OnboardingLayout><OnboardingView /></OnboardingLayout>;
  else if (positive(first)) {
    if (second === "admin" && parts[2] === "reports" && parts.length === 3) page = <Redirect to={`/${first}/admin/statements?tab=report`} />;
    else page = <MessLayout messId={positive(first)!} key={first}>{messRoute(parts.slice(1), query)}</MessLayout>;
  } else page = <NotFound />;

  return <Suspense>{page}</Suspense>;
}
