import { describe, expect, it } from "vitest";
import { isLikelyBot, normalizeUtmValue } from "./utm";

describe("normalizeUtmValue", () => {
  it("normalizes mixed values into clean tags", () => {
    expect(normalizeUtmValue(" LinkedIn Paid ")).toBe("linkedin-paid");
    expect(normalizeUtmValue("Q2 Promo #1")).toBe("q2-promo-1");
  });

  it("uses fallback for empty values", () => {
    expect(normalizeUtmValue("", "direct")).toBe("direct");
  });
});

describe("isLikelyBot", () => {
  it("detects typical crawler user agents", () => {
    expect(isLikelyBot("Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)")).toBe(true);
    expect(isLikelyBot("Mozilla/5.0 (Macintosh; Intel Mac OS X) AppleWebKit Safari")).toBe(false);
  });
});
