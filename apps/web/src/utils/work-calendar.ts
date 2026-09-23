import {
  formatBikramSambatDateTime,
} from "./nepal-calendar";
import type { WorkCalendarMode } from "./nepal-calendar";

const WORK_CALENDAR_STORAGE_KEY = "nt-message:work-calendar-mode";

export function readWorkCalendarMode(): WorkCalendarMode {
  if (typeof window === "undefined") return "AD";
  return window.localStorage.getItem(WORK_CALENDAR_STORAGE_KEY) === "BS"
    ? "BS"
    : "AD";
}

export function writeWorkCalendarMode(mode: WorkCalendarMode): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(WORK_CALENDAR_STORAGE_KEY, mode);
}

export function formatWorkDateTime(
  value: string | Date | null | undefined,
  language = "en",
  notSet = "Not set",
  mode: WorkCalendarMode = readWorkCalendarMode(),
): string {
  if (!value) return notSet;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return typeof value === "string" ? value : notSet;

  if (mode === "BS") {
    const formatted = formatBikramSambatDateTime(date);
    return formatted === "Time unavailable" ? notSet : formatted;
  }

  return new Intl.DateTimeFormat(language.startsWith("ne") ? "ne-NP" : "en-GB", {
    timeZone: "Asia/Kathmandu",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}
