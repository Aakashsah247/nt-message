import NepaliDate from "nepali-date-converter";

export type WorkCalendarMode = "AD" | "BS";

const KATHMANDU_TIME_ZONE = "Asia/Kathmandu";
const KATHMANDU_OFFSET_MINUTES = 5 * 60 + 45;

interface KathmanduParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

function readKathmanduParts(value: string | Date): KathmanduParts | null {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: KATHMANDU_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? Number.NaN);
  const result = {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
  };

  return Object.values(result).every(Number.isFinite) ? result : null;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function parseDateOnly(value: string): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
}

function parseTimeOnly(value: string): { hour: number; minute: number } | null {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return { hour, minute };
}

function kathmanduPartsToIso(parts: KathmanduParts): string | null {
  const { year, month, day, hour, minute } = parts;
  if (
    year < 1900 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31 ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    return null;
  }

  const utcMilliseconds =
    Date.UTC(year, month - 1, day, hour, minute) -
    KATHMANDU_OFFSET_MINUTES * 60_000;
  const value = new Date(utcMilliseconds);
  const roundTrip = readKathmanduParts(value);
  if (
    !roundTrip ||
    roundTrip.year !== year ||
    roundTrip.month !== month ||
    roundTrip.day !== day ||
    roundTrip.hour !== hour ||
    roundTrip.minute !== minute
  ) {
    return null;
  }

  return value.toISOString();
}

export function toKathmanduDateLocal(value: string | Date | null): string {
  if (!value) return "";
  const parts = readKathmanduParts(value);
  if (!parts) return "";
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
}

export function toKathmanduTimeLocal(value: string | Date | null): string {
  if (!value) return "";
  const parts = readKathmanduParts(value);
  if (!parts) return "";
  return `${pad(parts.hour)}:${pad(parts.minute)}`;
}

export function toKathmanduDateTimeLocal(value: string | Date | null): string {
  const date = toKathmanduDateLocal(value);
  const time = toKathmanduTimeLocal(value);
  return date && time ? `${date}T${time}` : "";
}

export function kathmanduDateAndTimeToIso(
  dateValue: string,
  timeValue: string,
): string | undefined {
  const date = parseDateOnly(dateValue);
  const time = parseTimeOnly(timeValue);
  if (!date || !time) return undefined;
  return (
    kathmanduPartsToIso({
      ...date,
      ...time,
    }) ?? undefined
  );
}

export function kathmanduDateTimeLocalToIso(value: string): string | undefined {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})$/.exec(value);
  return match ? kathmanduDateAndTimeToIso(match[1], match[2]) : undefined;
}

export function kathmanduDateToBikramSambatDate(value: string): string {
  const date = parseDateOnly(value);
  if (!date) return "";
  try {
    // Noon avoids a browser-zone boundary while preserving the explicit AD date.
    const nepaliDate = new NepaliDate(
      new Date(date.year, date.month - 1, date.day, 12, 0, 0),
    );
    return nepaliDate.format("YYYY-MM-DD");
  } catch {
    return "";
  }
}

export function bikramSambatDateToKathmanduDate(value: string): string {
  const date = parseDateOnly(value);
  if (!date) return "";
  try {
    const nepaliDate = new NepaliDate(date.year, date.month - 1, date.day);
    if (nepaliDate.format("YYYY-MM-DD") !== value) return "";
    const adDate = nepaliDate.toJsDate();
    return `${adDate.getFullYear()}-${pad(adDate.getMonth() + 1)}-${pad(
      adDate.getDate(),
    )}`;
  } catch {
    return "";
  }
}

export function toBikramSambatDateTimeLocal(
  value: string | Date | null,
): string {
  const adDate = toKathmanduDateLocal(value);
  const time = toKathmanduTimeLocal(value);
  const bsDate = kathmanduDateToBikramSambatDate(adDate);
  return bsDate && time ? `${bsDate}T${time}` : "";
}

export function bikramSambatDateTimeLocalToIso(
  value: string,
): string | undefined {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})$/.exec(value);
  if (!match) return undefined;
  const adDate = bikramSambatDateToKathmanduDate(match[1]);
  return adDate ? kathmanduDateAndTimeToIso(adDate, match[2]) : undefined;
}

export function getCalendarMonthLength(
  mode: WorkCalendarMode,
  year: number,
  month: number,
): number {
  if (mode === "AD") {
    return new Date(year, month, 0).getDate();
  }

  for (let day = 32; day >= 28; day -= 1) {
    try {
      const date = new NepaliDate(year, month - 1, day);
      if (date.format("YYYY-MM-DD") === `${year}-${pad(month)}-${pad(day)}`) {
        return day;
      }
    } catch {
      // Continue until the last valid BS day is found.
    }
  }
  return 30;
}

export function getCalendarMonthStartWeekday(
  mode: WorkCalendarMode,
  year: number,
  month: number,
): number {
  if (mode === "AD") return new Date(year, month - 1, 1).getDay();
  try {
    return new NepaliDate(year, month - 1, 1).toJsDate().getDay();
  } catch {
    return 0;
  }
}

export function formatKathmanduDateTime(value: string | Date | null): string {
  if (!value) return "Not set";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "Time unavailable";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: KATHMANDU_TIME_ZONE,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function formatBikramSambatDateTime(
  value: string | Date | null,
): string {
  const local = toBikramSambatDateTimeLocal(value);
  if (!local) return "Time unavailable";
  const [date, time] = local.split("T");
  return `${date} BS, ${time}`;
}
