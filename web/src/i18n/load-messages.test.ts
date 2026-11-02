import { describe, expect, it } from "vitest";
import { loadMessages } from "./load-messages";

describe("loadMessages", () => {
  it("merges every file under its file name as namespace, for both locales", () => {
    expect(loadMessages("en")).toMatchObject({ app: { name: "Mess Hisab" } });
    expect(loadMessages("bn")).toMatchObject({ app: { name: "মেসের হিসাব" } });
  });

  it("has the same namespaces in en and bn", () => {
    expect(Object.keys(loadMessages("bn"))).toEqual(Object.keys(loadMessages("en")));
  });
});
