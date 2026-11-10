import { DEFAULT_TIME_ZONE } from "@paperclipai/shared";

/** Tomorrow at 09:00 KST as an absolute UTC timestamp. */
export function tomorrowMorningKstIso(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", { year: "numeric", month: "numeric", day: "numeric", timeZone: DEFAULT_TIME_ZONE }).formatToParts(now);
  const number = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  return new Date(Date.UTC(number("year"), number("month") - 1, number("day") + 1)).toISOString();
}
