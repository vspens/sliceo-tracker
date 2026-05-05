import { describe, expect, it } from "vitest";
import { buildTableHref, parseTableParams } from "./tableParams";

describe("parseTableParams", () => {
  it("returns defaults for missing params", () => {
    const parsed = parseTableParams(undefined);
    expect(parsed.q).toBe("");
    expect(parsed.page).toBe(1);
    expect(parsed.pageSize).toBe(20);
    expect(parsed.from).toBe(0);
    expect(parsed.to).toBe(19);
  });

  it("parses custom page and query", () => {
    const parsed = parseTableParams({ q: "abc", page: "3", pageSize: "10" });
    expect(parsed.q).toBe("abc");
    expect(parsed.page).toBe(3);
    expect(parsed.pageSize).toBe(10);
    expect(parsed.from).toBe(20);
    expect(parsed.to).toBe(29);
  });
});

describe("buildTableHref", () => {
  it("builds stable href for paging", () => {
    const href = buildTableHref("/dashboard/leads", { q: "john", page: 2, pageSize: 20 });
    expect(href).toBe("/dashboard/leads?q=john&page=2");
  });
});
