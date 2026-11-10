import { DEFAULT_TIME_ZONE } from "@paperclipai/shared";

const DAY = 86_400_000;

const dayFormatter = new Intl.DateTimeFormat("en-US", { year: "numeric", month: "numeric", day: "numeric", timeZone: DEFAULT_TIME_ZONE });
const startOfDay = (date: Date) => {
  const parts = dayFormatter.formatToParts(date);
  const number = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  return Date.UTC(number("year"), number("month") - 1, number("day"));
};

/** The Artifacts page's form: "4:05 PM" · "Yesterday" · "Monday" · "Sep 12". */
export function updatedLabel(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  const days = Math.round((startOfDay(now) - startOfDay(date)) / DAY);
  if (days <= 0) return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: DEFAULT_TIME_ZONE });
  if (days === 1) return "Yesterday";
  if (days < 7) return date.toLocaleDateString("en-US", { weekday: "long", timeZone: DEFAULT_TIME_ZONE });
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: DEFAULT_TIME_ZONE });
}

/** The panel row's form: "Today" · "Yesterday" · "2D ago" · "July 23". */
export function panelDateLabel(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  const days = Math.round((startOfDay(now) - startOfDay(date)) / DAY);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}D ago`;
  return date.toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: DEFAULT_TIME_ZONE });
}

export const countLabel = (count: number) => `${count} ${count === 1 ? "Artifact" : "Artifacts"}`;

export function sizeLabel(bytes: number | null | undefined): string | null {
  if (bytes == null) return null;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
