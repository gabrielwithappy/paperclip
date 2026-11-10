import { describe, expect, it } from "vitest";
import { taskDateGroup, taskDateGroupSeparator } from "./task-date-groups";

describe("task date groups", () => {
  const now = new Date("2026-08-30T15:30:00.000Z");

  it("uses KST calendar boundaries instead of rolling 24-hour windows", () => {
    expect(taskDateGroup("2026-08-30T15:01:00.000Z", now)).toBe("today");
    expect(taskDateGroup("2026-08-30T14:59:00.000Z", now)).toBe("yesterday");
    expect(taskDateGroup("2026-08-29T14:59:00.000Z", now)).toBe("earlier");
  });

  it("does not emit duplicate or leading Earlier separators", () => {
    expect(taskDateGroupSeparator(null, "earlier")).toBeNull();
    expect(taskDateGroupSeparator(null, "today")).toBe("Today");
    expect(taskDateGroupSeparator("today", "today")).toBeNull();
    expect(taskDateGroupSeparator("today", "yesterday")).toBe("Yesterday");
    expect(taskDateGroupSeparator("yesterday", "earlier")).toBe("Earlier");
  });
});
