import { DEFAULT_TIME_ZONE } from "@paperclipai/shared";
import { useId } from "react";
import { Input } from "@/components/ui/input";

export function RoutineTimeZoneSelect({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const listId = useId();
  const browserTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const options = Array.from(new Set([DEFAULT_TIME_ZONE, "UTC", browserTimeZone, value].filter(Boolean)));
  return (
    <>
      <Input aria-label="Schedule timezone" list={listId} value={value} onChange={(event) => onChange(event.target.value)} />
      <datalist id={listId}>
        {options.map((timeZone) => <option key={timeZone} value={timeZone} label={timeZone === DEFAULT_TIME_ZONE ? "KST" : timeZone} />)}
      </datalist>
    </>
  );
}
