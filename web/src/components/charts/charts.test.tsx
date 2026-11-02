import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BarList, ChartCard, ColumnChart, DivergingBars, LineChart } from "./index";
import { niceTicks } from "./scale";

describe("niceTicks", () => {
  it("returns clean steps covering the range, on the unit grid", () => {
    expect(niceTicks(0, 87000, { count: 4, minStep: 100 })).toEqual([0, 50000, 100000]);
    expect(niceTicks(-1200, 3400, { count: 4, minStep: 100 })).toEqual([-2000, 0, 2000, 4000]);
  });
  it("copes with a flat or all-zero range", () => {
    expect(niceTicks(0, 0, { minStep: 100 })).toEqual([0, 100]);
    const t = niceTicks(5000, 5000, { minStep: 100 });
    expect(t[0]).toBeLessThan(5000);
    expect(t[t.length - 1]).toBeGreaterThan(5000);
  });
});

describe("ChartCard", () => {
  const table = { headers: ["Month", "Value"], rows: [["Jan", "৳1"], ["Feb", "৳2"]] };
  const card = (extra = {}) =>
    render(
      <ChartCard title="Spend" subtitle="By month" table={table} showTableLabel="Show as table" hideTableLabel="Hide table" {...extra}>
        <div data-testid="chart" />
      </ChartCard>,
    );

  it("renders title, subtitle and the chart, then swaps to an accessible table and back", () => {
    card();
    expect(screen.getByRole("heading", { name: "Spend" })).toBeInTheDocument();
    expect(screen.getByText("By month")).toBeInTheDocument();
    expect(screen.getByTestId("chart")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Show as table" }));
    expect(screen.queryByTestId("chart")).not.toBeInTheDocument();
    const t = screen.getByRole("table");
    expect(within(t).getByRole("columnheader", { name: "Value" })).toBeInTheDocument();
    expect(within(t).getByRole("rowheader", { name: "Feb" })).toBeInTheDocument();
    expect(within(t).getByRole("cell", { name: "৳2" })).toBeInTheDocument();

    const hide = screen.getByRole("button", { name: "Hide table" });
    expect(hide).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(hide);
    expect(screen.getByTestId("chart")).toBeInTheDocument();
  });

  it("shows the empty text instead of the chart and hides the toggle", () => {
    card({ empty: "Nothing yet" });
    expect(screen.getByText("Nothing yet")).toBeInTheDocument();
    expect(screen.queryByTestId("chart")).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});

describe("BarList", () => {
  it("renders a row per item with label and formatted value, widest bar for the largest", () => {
    render(
      <BarList
        items={[
          { key: 1, label: "Rice", value: 1000, valueLabel: "৳10" },
          { key: 2, label: "Fish", value: 250, valueLabel: "৳2.50" },
        ]}
      />,
    );
    const rows = screen.getAllByRole("listitem");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("Rice");
    expect(rows[0]).toHaveTextContent("৳10");
    const bar = (i: number) => rows[i].querySelector<HTMLElement>("[style*=width]")!;
    expect(bar(0).style.width).toBe("100%");
    expect(bar(1).style.width).toBe("25%");
  });
  it("renders nothing for empty data", () => {
    const { container } = render(<BarList items={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("DivergingBars", () => {
  const items = [
    { key: "a", label: "Karim", value: 70000, valueLabel: "Credit ৳700" },
    { key: "b", label: "Salma", value: -50000, valueLabel: "Due ৳500" },
  ];
  it("horizontal: colours by sign using theme variables", () => {
    render(<DivergingBars items={items} />);
    expect(screen.getByTestId("dbar-a")).toHaveTextContent("Credit ৳700");
    expect(screen.getByTestId("dbar-a").querySelector(".bg-success")).not.toBeNull();
    expect(screen.getByTestId("dbar-b").querySelector(".bg-danger")).not.toBeNull();
  });
  it("vertical: shows a tooltip on keyboard focus and hover, and removes it on blur", () => {
    render(<DivergingBars items={items} orientation="vertical" formatTick={(n) => `t${n}`} minStep={100} />);
    const col = screen.getByRole("img", { name: "Salma: Due ৳500" });
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    fireEvent.focus(col);
    expect(screen.getByRole("tooltip")).toHaveTextContent("Due ৳500");
    expect(screen.getByRole("tooltip")).toHaveTextContent("Salma");
    fireEvent.blur(col);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    fireEvent.pointerEnter(screen.getByRole("img", { name: "Karim: Credit ৳700" }));
    expect(screen.getByRole("tooltip")).toHaveTextContent("Credit ৳700");
  });
  it("renders nothing for empty data", () => {
    const { container } = render(<DivergingBars items={[]} orientation="vertical" />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("ColumnChart", () => {
  it("draws one accent column per item and a tooltip on focus", () => {
    const { container } = render(
      <ColumnChart
        items={[
          { key: 1, label: "Oct", value: 100000, valueLabel: "৳1,000" },
          { key: 2, label: "Nov", value: 50000, valueLabel: "৳500" },
        ]}
        formatTick={(n) => `৳${n / 100}`}
        minStep={100}
      />,
    );
    expect(container.querySelectorAll(".bg-accent")).toHaveLength(2);
    fireEvent.focus(screen.getByTestId("col-2"));
    expect(screen.getByRole("tooltip")).toHaveTextContent("৳500");
  });
  it("renders nothing for empty data", () => {
    const { container } = render(<ColumnChart items={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("LineChart", () => {
  const pts = [
    { key: 1, label: "Sep", value: 3000, valueLabel: "৳30" },
    { key: 2, label: "Oct", value: null, valueLabel: "-" },
    { key: 3, label: "Nov", value: 4000, valueLabel: "৳40" },
  ];
  it("draws a 2px line with a gap for missing values and a focusable point per real value", () => {
    const { container } = render(<LineChart points={pts} formatTick={(n) => `৳${n / 100}`} minStep={100} />);
    const paths = container.querySelectorAll("path");
    expect(paths).toHaveLength(2); // gap splits the line
    expect(paths[0]).toHaveAttribute("stroke-width", "2");
    expect(paths[0]).toHaveAttribute("stroke", "var(--accent)");
    expect(screen.getAllByRole("img")).toHaveLength(2);
    expect(screen.queryByTestId("pt-2")).not.toBeInTheDocument();
  });
  it("shows the tooltip when a point takes focus", () => {
    render(<LineChart points={pts} formatTick={(n) => `৳${n / 100}`} minStep={100} />);
    fireEvent.focus(screen.getByTestId("pt-3"));
    expect(screen.getByRole("tooltip")).toHaveTextContent("৳40");
    expect(screen.getByRole("tooltip")).toHaveTextContent("Nov");
    fireEvent.blur(screen.getByTestId("pt-3"));
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });
  it("renders a single point, and nothing when there are no values", () => {
    const one = render(<LineChart points={[pts[0]]} formatTick={String} />);
    expect(one.container.querySelectorAll("circle").length).toBeGreaterThan(0);
    one.unmount();
    const none = render(<LineChart points={[pts[1]]} formatTick={String} />);
    expect(none.container).toBeEmptyDOMElement();
  });
});
