import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { invalidateMoney, MONEY_QUERY_PREFIXES } from "./query-keys";

describe("invalidateMoney", () => {
  it("marks every money cache of that mess stale and leaves other messes and features alone", async () => {
    const client = new QueryClient();
    for (const prefix of MONEY_QUERY_PREFIXES) {
      client.setQueryData([prefix, 7, "x"], 1);
      client.setQueryData([prefix, 8, "x"], 1);
    }
    client.setQueryData(["mess", 7, "detail"], 1);

    await invalidateMoney(client, 7);

    for (const prefix of MONEY_QUERY_PREFIXES) {
      expect(client.getQueryState([prefix, 7, "x"])?.isInvalidated).toBe(true);
      expect(client.getQueryState([prefix, 8, "x"])?.isInvalidated).toBe(false);
    }
    expect(client.getQueryState(["mess", 7, "detail"])?.isInvalidated).toBe(false);
  });

  it("covers the prefixes the features use", () => {
    expect([...MONEY_QUERY_PREFIXES].sort()).toEqual(["audit", "balance", "expenses", "fixed", "meals", "months", "payments", "settlement"]);
  });
});
