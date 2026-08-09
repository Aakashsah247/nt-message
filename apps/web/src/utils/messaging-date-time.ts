export const MESSAGING_TIME_ZONE = "Asia/Kathmandu";

const DAY_MS = 24 * 60 * 60 * 1000;

function toDate(value: string | Date): Date {
  return value instanceof Date ? value : new Date(value);
}

function messagingCalendarDayKey(value: string | Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: MESSAGING_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(toDate(value));

  const part = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((item) => item.type === type)?.value ?? "";

  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function isSameMessagingCalendarDay(
  first: string | Date,
  second: string | Date,
): boolean {
  return messagingCalendarDayKey(first) === messagingCalendarDayKey(second);
}

export function formatMessagingConversationTime(
  value: string | null,
  now: Date = new Date(),
): string {
  if (!value) {
    return "New";
  }

  const date = new Date(value);

  if (isSameMessagingCalendarDay(date, now)) {
    return new Intl.DateTimeFormat(undefined, {
      timeZone: MESSAGING_TIME_ZONE,
      hour: "numeric",
      minute: "2-digit",
    }).format(date);
  }

  return new Intl.DateTimeFormat(undefined, {
    timeZone: MESSAGING_TIME_ZONE,
    month: "short",
    day: "numeric",
  }).format(date);
}

export function formatMessagingTime(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    timeZone: MESSAGING_TIME_ZONE,
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export function formatMessagingLongDateTime(value: string | null): string {
  if (!value) {
    return "Not published";
  }

  return new Intl.DateTimeFormat(undefined, {
    timeZone: MESSAGING_TIME_ZONE,
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export function formatMessagingDay(
  value: string,
  now: Date = new Date(),
): string {
  const date = new Date(value);
  const yesterday = new Date(now.getTime() - DAY_MS);

  if (isSameMessagingCalendarDay(date, now)) {
    return "Today";
  }

  if (isSameMessagingCalendarDay(date, yesterday)) {
    return "Yesterday";
  }

  return new Intl.DateTimeFormat(undefined, {
    timeZone: MESSAGING_TIME_ZONE,
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(date);
}

export function formatMessagingLastSeen(
  value: string,
  now: Date = new Date(),
): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Offline";
  }

  const difference = Math.max(0, now.getTime() - date.getTime());

  if (difference < 60_000) {
    return "Last seen just now";
  }

  const time = formatMessagingTime(value);

  if (isSameMessagingCalendarDay(date, now)) {
    return `Last seen today at ${time}`;
  }

  if (isSameMessagingCalendarDay(date, new Date(now.getTime() - DAY_MS))) {
    return `Last seen yesterday at ${time}`;
  }

  return `Last seen ${new Intl.DateTimeFormat(undefined, {
    timeZone: MESSAGING_TIME_ZONE,
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date)}`;
}

export function formatMessagingTimestampLabel(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    timeZone: MESSAGING_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}
