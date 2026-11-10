import { describe, expect, it } from "vitest";
import { formatDate, formatDateTime, formatShortDate } from "./utils";
import { tomorrowMorningKstIso } from "./kst-calendar";

describe("KST display formatting", () => {
  it("uses the next calendar day after 15:00 UTC regardless of host timezone", () => {
    const instant = "2026-04-28T15:17:00.000Z";
    expect(formatDate(instant)).toBe("Apr 29, 2026");
    expect(formatShortDate(instant)).toBe("Apr 29");
    expect(formatDateTime(instant)).toContain("Apr 29, 2026");
    expect(formatDateTime(instant)).toContain("12:17 AM");
  });
});

describe("KST scheduling", () => {
  it("resolves tomorrow morning at 09:00 KST across a UTC day boundary", () => {
    expect(tomorrowMorningKstIso(new Date("2026-04-28T14:59:00.000Z"))).toBe("2026-04-29T00:00:00.000Z");
    expect(tomorrowMorningKstIso(new Date("2026-04-28T15:00:00.000Z"))).toBe("2026-04-30T00:00:00.000Z");
  });
});
