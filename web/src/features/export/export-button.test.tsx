import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import ExportFx from "../../../../docs/contract-fixtures/Export.json";
import type { Export } from "@/lib/api/contract";
import { API_BASE_URL } from "@/lib/api-client/client";
import { server } from "@/test/msw/server";
import { renderWithProviders } from "@/test/render";
import { ExportButton } from "./export-button";
import { StatementExport } from "./statement-export";

const BASE = `${API_BASE_URL}/api/messes/7`;
const fx = ExportFx as Export;
const pending: Export = { ...fx, status: "queued", download_url: null };
const done: Export = { ...fx, status: "done", download_url: "http://localhost:8000/api/messes/7/exports/1/download" };
const failed: Export = { ...fx, status: "failed", download_url: null };

const csrf = http.get(`${API_BASE_URL}/sanctum/csrf-cookie`, () => new HttpResponse(null, { status: 204 }));

describe("ExportButton", () => {
  it("creates the export, polls until done and shows the download link", async () => {
    let body: unknown = null;
    let polls = 0;
    server.use(
      csrf,
      http.post(`${BASE}/exports`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ data: pending }, { status: 202 });
      }),
      http.get(`${BASE}/exports/1`, () => {
        polls += 1;
        return HttpResponse.json({ data: polls >= 3 ? done : pending });
      }),
    );
    const user = userEvent.setup();
    renderWithProviders(<ExportButton type="month" monthId={11} pollMs={10} />, { messId: 7 });

    await user.click(screen.getByRole("button", { name: "Export month (Excel)" }));
    expect(await screen.findByText("Preparing your file…")).toBeInTheDocument();

    const link = await screen.findByRole("link", { name: "Download Excel file" });
    expect(link).toHaveAttribute("href", done.download_url);
    expect(body).toEqual({ type: "month", month_id: 11 });
    expect(polls).toBeGreaterThanOrEqual(3);
    expect(screen.queryByText("Preparing your file…")).toBeNull();
  });

  it("shows a failed state", async () => {
    server.use(
      csrf,
      http.post(`${BASE}/exports`, () => HttpResponse.json({ data: pending }, { status: 202 })),
      http.get(`${BASE}/exports/1`, () => HttpResponse.json({ data: failed })),
    );
    const user = userEvent.setup();
    renderWithProviders(<ExportButton type="month" monthId={11} pollMs={10} />, { messId: 7 });
    await user.click(screen.getByRole("button", { name: "Export month (Excel)" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("The export could not be created");
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("stops polling after the limit and says it is taking too long", async () => {
    let polls = 0;
    server.use(
      csrf,
      http.post(`${BASE}/exports`, () => HttpResponse.json({ data: pending }, { status: 202 })),
      http.get(`${BASE}/exports/1`, () => {
        polls += 1;
        return HttpResponse.json({ data: pending });
      }),
    );
    const user = userEvent.setup();
    renderWithProviders(<ExportButton type="month" monthId={11} pollMs={10} maxPolls={3} />, { messId: 7 });
    await user.click(screen.getByRole("button", { name: "Export month (Excel)" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("taking longer than expected");
    const seen = polls;
    await new Promise((r) => setTimeout(r, 80));
    expect(polls).toBe(seen);
    expect(seen).toBeLessThanOrEqual(4);
  });

  it("shows a friendly error when the request is rejected", async () => {
    server.use(csrf, http.post(`${BASE}/exports`, () => HttpResponse.json({ message: "no" }, { status: 403 })));
    const user = userEvent.setup();
    renderWithProviders(<ExportButton type="month" monthId={11} pollMs={10} />, { messId: 7 });
    await user.click(screen.getByRole("button", { name: "Export month (Excel)" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("You do not have permission to export.");
  });
});

describe("StatementExport", () => {
  it("needs a member, then sends member_id and shows the link", async () => {
    let body: unknown = null;
    server.use(
      csrf,
      http.post(`${BASE}/exports`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ data: { ...pending, type: "statement" } }, { status: 202 });
      }),
      http.get(`${BASE}/exports/1`, () => HttpResponse.json({ data: { ...done, type: "statement" } })),
    );
    const user = userEvent.setup();
    renderWithProviders(
      <StatementExport monthId={11} pollMs={10} members={[{ id: 1, display_name: "Rahim" }, { id: 2, display_name: "Karim" }]} />,
      { messId: 7 },
    );

    const button = screen.getByRole("button", { name: "Export statement (Excel)" });
    expect(button).toBeDisabled();
    await user.selectOptions(screen.getByLabelText("Member for the statement"), "2");
    await user.click(screen.getByRole("button", { name: "Export statement (Excel)" }));

    expect(await screen.findByRole("link", { name: "Download Excel file" })).toBeInTheDocument();
    await waitFor(() => expect(body).toEqual({ type: "statement", month_id: 11, member_id: 2 }));
  });
});

describe("Export (Bangla)", () => {
  it("shows Bangla labels for the month export flow", async () => {
    server.use(
      csrf,
      http.post(`${BASE}/exports`, () => HttpResponse.json({ data: pending }, { status: 202 })),
      http.get(`${BASE}/exports/1`, () => HttpResponse.json({ data: done })),
    );
    const user = userEvent.setup();
    const { container } = renderWithProviders(<ExportButton type="month" monthId={11} pollMs={10} />, { messId: 7, locale: "bn" });
    await user.click(screen.getByRole("button", { name: "মাসের হিসাব এক্সপোর্ট (এক্সেল)" }));
    const link = await screen.findByRole("link", { name: "এক্সেল ফাইল ডাউনলোড করুন" });
    expect(link).toHaveAttribute("href", done.download_url);
    expect(container.textContent ?? "").not.toMatch(/[A-Za-z]/);
  });

  it("labels the member picker in Bangla on the statement export", () => {
    renderWithProviders(
      <StatementExport monthId={11} pollMs={10} members={[{ id: 1, display_name: "Rahim" }]} />,
      { messId: 7, locale: "bn" },
    );
    expect(screen.getByLabelText("কোন সদস্যের স্টেটমেন্ট")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "স্টেটমেন্ট এক্সপোর্ট (এক্সেল)" })).toBeDisabled();
  });
});
