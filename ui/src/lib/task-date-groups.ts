import { DEFAULT_TIME_ZONE } from "@paperclipai/shared";

export type TaskDateGroup = "today" | "yesterday" | "earlier";

export const taskDateGroupLabels: Record<TaskDateGroup, string> = {
  today: "Today",
  yesterday: "Yesterday",
  earlier: "Earlier",
};

const dayFormatter = new Intl.DateTimeFormat("en-US", { year: "numeric", month: "numeric", day: "numeric", timeZone: DEFAULT_TIME_ZONE });

function kstCalendarOrdinal(date: Date): number {
  const parts = dayFormatter.formatToParts(date);
  const number = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  return Date.UTC(number("year"), number("month") - 1, number("day"));
}

/** Groups timestamps by the KST calendar day. */
export function taskDateGroup(value: Date | string | number, now: Date = new Date()): TaskDateGroup {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "earlier";

  const dayDifference = Math.round(
    (kstCalendarOrdinal(now) - kstCalendarOrdinal(date)) / (24 * 60 * 60 * 1000),
  );
  if (dayDifference <= 0) return "today";
  if (dayDifference === 1) return "yesterday";
  return "earlier";
}

/**
 * Returns the label to insert before the current row. A list made entirely of
 * older work does not begin with a redundant "Earlier" heading.
 */
export function taskDateGroupSeparator(
  previous: TaskDateGroup | null,
  current: TaskDateGroup,
): string | null {
  if (previous === current) return null;
  if (previous === null && current === "earlier") return null;
  return taskDateGroupLabels[current];
}
