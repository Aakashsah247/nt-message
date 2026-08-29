import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import {
  bikramSambatDateToKathmanduDate,
  formatBikramSambatDateTime,
  formatKathmanduDateTime,
  getCalendarMonthLength,
  getCalendarMonthStartWeekday,
  kathmanduDateAndTimeToIso,
  kathmanduDateToBikramSambatDate,
  toKathmanduDateLocal,
  toKathmanduTimeLocal,
} from "../../utils/nepal-calendar";
import type { WorkCalendarMode } from "../../utils/nepal-calendar";

interface DualCalendarDateTimeInputProps {
  id: string;
  label: string;
  value: string;
  required?: boolean;
  min?: string;
  max?: string;
  /**
   * Optional parent-controlled calendar system. When provided, the field follows
   * the shared mode and hides its local AD/BS switch. This keeps a group of
   * schedule fields synchronized without duplicating the stored timestamp.
   */
  mode?: WorkCalendarMode;
  /** Hide the alternate calendar preview when a parent-level AD/BS switch already controls the group. */
  showAlternate?: boolean;
  onChange: (nextIsoValue: string) => void;
}

interface CalendarPosition {
  top: number;
  left: number;
  width: number;
  placement: "above" | "below";
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const AD_MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const BS_MONTHS = [
  "Baisakh",
  "Jestha",
  "Ashadh",
  "Shrawan",
  "Bhadra",
  "Ashwin",
  "Kartik",
  "Mangsir",
  "Poush",
  "Magh",
  "Falgun",
  "Chaitra",
];

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function parseDate(value: string): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
}

function getModeDate(mode: WorkCalendarMode, adDate: string): string {
  if (!adDate) return "";
  return mode === "AD" ? adDate : kathmanduDateToBikramSambatDate(adDate);
}

function getInitialCalendarDate(mode: WorkCalendarMode, value: string): string {
  const adDate = toKathmanduDateLocal(value || new Date());
  return getModeDate(mode, adDate) || getModeDate(mode, toKathmanduDateLocal(new Date()));
}

/**
 * Resolve a typed date into the canonical AD date used for timestamp storage.
 * The calendar mode affects presentation only; no duplicate AD/BS values are stored.
 */
function resolveTypedDate(mode: WorkCalendarMode, typedDate: string): string | null {
  const parts = parseDate(typedDate);
  if (!parts || parts.month < 1 || parts.month > 12) return null;

  try {
    const monthLength = getCalendarMonthLength(mode, parts.year, parts.month);
    if (parts.day < 1 || parts.day > monthLength) return null;

    if (mode === "AD") return typedDate;
    return bikramSambatDateToKathmanduDate(typedDate) || null;
  } catch {
    // Unsupported calendar years and malformed dates are handled as input errors.
    return null;
  }
}

export function DualCalendarDateTimeInput({
  id,
  label,
  value,
  required = false,
  min,
  max,
  mode: controlledMode,
  showAlternate = true,
  onChange,
}: DualCalendarDateTimeInputProps) {
  const [internalMode, setInternalMode] = useState<WorkCalendarMode>("AD");
  const mode = controlledMode ?? internalMode;
  const isModeControlled = controlledMode !== undefined;
  const [open, setOpen] = useState(false);
  const [dateValue, setDateValue] = useState(() => toKathmanduDateLocal(value));
  const [dateDraft, setDateDraft] = useState(() =>
    getModeDate("AD", toKathmanduDateLocal(value)),
  );
  const [timeValue, setTimeValue] = useState(() => toKathmanduTimeLocal(value));
  const initialCalendarDate = getInitialCalendarDate("AD", value);
  const initialParts = parseDate(initialCalendarDate) ?? {
    year: new Date().getFullYear(),
    month: new Date().getMonth() + 1,
    day: 1,
  };
  const [displayYear, setDisplayYear] = useState(initialParts.year);
  const [displayMonth, setDisplayMonth] = useState(initialParts.month);
  const [error, setError] = useState("");
  const [showError, setShowError] = useState(false);
  const [calendarPosition, setCalendarPosition] = useState<CalendarPosition | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const dateFieldRef = useRef<HTMLDivElement>(null);
  const dateInputRef = useRef<HTMLInputElement>(null);
  const calendarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const nextDate = toKathmanduDateLocal(value);
    const nextTime = toKathmanduTimeLocal(value);
    setDateValue(nextDate);
    setDateDraft(getModeDate(mode, nextDate));
    setTimeValue(nextTime);
    setError("");
    setShowError(false);

    const displayDate = getModeDate(mode, nextDate || toKathmanduDateLocal(new Date()));
    const parts = parseDate(displayDate);
    if (parts) {
      setDisplayYear(parts.year);
      setDisplayMonth(parts.month);
    }
  }, [mode, value]);

  useEffect(() => {
    dateInputRef.current?.setCustomValidity(error);
  }, [error]);

  useEffect(() => {
    if (!open) return undefined;

    function handlePointerDown(event: MouseEvent): void {
      const target = event.target as Node;
      if (
        !containerRef.current?.contains(target) &&
        !calendarRef.current?.contains(target)
      ) {
        setOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        setOpen(false);
        dateInputRef.current?.focus();
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  useLayoutEffect(() => {
    if (!open) {
      setCalendarPosition(null);
      return undefined;
    }

    function updateCalendarPosition(): void {
      const anchor = dateFieldRef.current;
      if (!anchor) return;

      const anchorRect = anchor.getBoundingClientRect();
      const viewportPadding = 12;
      const preferredGap = 8;
      const measuredHeight = calendarRef.current?.offsetHeight ?? 350;
      const availableWidth = Math.max(0, window.innerWidth - viewportPadding * 2);
      // Keep the calendar at a predictable compact width instead of stretching
      // to the date field. This makes the popup easier to scan on wide forms
      // while still respecting narrow mobile viewports.
      const width = Math.min(304, availableWidth);
      const stickyFooter = document.querySelector<HTMLElement>(
        ".management-work-wizard__footer",
      );
      const stickyFooterRect = stickyFooter?.getBoundingClientRect();
      const lowerBoundary =
        stickyFooterRect && stickyFooterRect.top > anchorRect.bottom
          ? Math.min(window.innerHeight - viewportPadding, stickyFooterRect.top - preferredGap)
          : window.innerHeight - viewportPadding;
      const availableBelow = lowerBoundary - anchorRect.bottom;
      const availableAbove = anchorRect.top - viewportPadding;
      const placement =
        availableBelow >= measuredHeight + preferredGap || availableBelow >= availableAbove
          ? "below"
          : "above";
      const unclampedTop =
        placement === "below"
          ? anchorRect.bottom + preferredGap
          : anchorRect.top - measuredHeight - preferredGap;
      const maxTop = Math.max(
        viewportPadding,
        lowerBoundary - measuredHeight,
      );
      const top = Math.min(Math.max(unclampedTop, viewportPadding), maxTop);
      const maxLeft = Math.max(viewportPadding, window.innerWidth - width - viewportPadding);
      const left = Math.min(Math.max(anchorRect.left, viewportPadding), maxLeft);

      setCalendarPosition({ top, left, width, placement });
    }

    updateCalendarPosition();
    const frame = window.requestAnimationFrame(updateCalendarPosition);
    window.addEventListener("resize", updateCalendarPosition);
    window.addEventListener("scroll", updateCalendarPosition, true);

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", updateCalendarPosition);
      window.removeEventListener("scroll", updateCalendarPosition, true);
    };
  }, [displayMonth, displayYear, mode, open]);

  const selectedModeDate = useMemo(
    () => getModeDate(mode, dateValue),
    [dateValue, mode],
  );
  const selectedParts = parseDate(selectedModeDate);
  const todayAd = toKathmanduDateLocal(new Date());
  const todayModeDate = getModeDate(mode, todayAd);
  const minAdDate = toKathmanduDateLocal(min ?? null);
  const maxAdDate = toKathmanduDateLocal(max ?? null);
  const monthLength = getCalendarMonthLength(mode, displayYear, displayMonth);
  const monthStartWeekday = getCalendarMonthStartWeekday(
    mode,
    displayYear,
    displayMonth,
  );
  const monthName = (mode === "AD" ? AD_MONTHS : BS_MONTHS)[displayMonth - 1];
  const previewValue =
    dateValue && timeValue
      ? kathmanduDateAndTimeToIso(dateValue, timeValue) ?? ""
      : "";

  function validateAndCommit(nextDate: string, nextTime: string): boolean {
    if (!nextDate || !nextTime) {
      setError("");
      setShowError(false);
      onChange("");
      return false;
    }

    const isoValue = kathmanduDateAndTimeToIso(nextDate, nextTime);
    if (!isoValue) {
      setError("Enter a valid date and time.");
      setShowError(true);
      return false;
    }

    const timestamp = new Date(isoValue).getTime();
    if (min && timestamp < new Date(min).getTime()) {
      setError("Choose a date and time that is not earlier than the minimum value.");
      setShowError(true);
      return false;
    }
    if (max && timestamp > new Date(max).getTime()) {
      setError("Choose a date and time that is not later than the maximum value.");
      setShowError(true);
      return false;
    }

    setError("");
    setShowError(false);
    onChange(isoValue);
    return true;
  }

  function commitDateDraft(
    nextDraft = dateDraft,
    nextTime = timeValue,
  ): boolean {
    const normalizedDraft = nextDraft.trim();
    if (!normalizedDraft) {
      setDateValue("");
      setDateDraft("");
      setError("");
      setShowError(false);
      onChange("");
      return !required;
    }

    const nextAdDate = resolveTypedDate(mode, normalizedDraft);
    if (!nextAdDate) {
      setError(`Enter a valid ${mode} date using YYYY-MM-DD.`);
      setShowError(true);
      return false;
    }

    const normalizedModeDate = getModeDate(mode, nextAdDate);
    setDateValue(nextAdDate);
    setDateDraft(normalizedModeDate);

    const parts = parseDate(normalizedModeDate);
    if (parts) {
      setDisplayYear(parts.year);
      setDisplayMonth(parts.month);
    }

    validateAndCommit(nextAdDate, nextTime);
    return true;
  }

  function switchMode(nextMode: WorkCalendarMode): void {
    if (nextMode === mode || isModeControlled) return;

    // Do not discard a typed date when switching calendar systems.
    if (dateDraft && dateDraft !== selectedModeDate && !commitDateDraft(dateDraft)) {
      return;
    }

    setInternalMode(nextMode);
    const displayDate = getModeDate(
      nextMode,
      dateValue || toKathmanduDateLocal(new Date()),
    );
    setDateDraft(dateValue ? displayDate : "");
    const parts = parseDate(displayDate);
    if (parts) {
      setDisplayYear(parts.year);
      setDisplayMonth(parts.month);
    }
  }

  function changeMonth(delta: number): void {
    let nextYear = displayYear;
    let nextMonth = displayMonth + delta;
    if (nextMonth < 1) {
      nextMonth = 12;
      nextYear -= 1;
    } else if (nextMonth > 12) {
      nextMonth = 1;
      nextYear += 1;
    }
    setDisplayYear(nextYear);
    setDisplayMonth(nextMonth);
  }

  function selectDay(day: number): void {
    const modeDate = `${displayYear}-${pad(displayMonth)}-${pad(day)}`;
    const nextAdDate =
      mode === "AD" ? modeDate : bikramSambatDateToKathmanduDate(modeDate);
    if (!nextAdDate) {
      setError("Choose a valid calendar date.");
      setShowError(true);
      return;
    }

    setDateValue(nextAdDate);
    setDateDraft(modeDate);
    validateAndCommit(nextAdDate, timeValue);
    setOpen(false);
    dateInputRef.current?.focus();
  }

  function isDayDisabled(day: number): boolean {
    const modeDate = `${displayYear}-${pad(displayMonth)}-${pad(day)}`;
    const adDate =
      mode === "AD" ? modeDate : bikramSambatDateToKathmanduDate(modeDate);
    if (!adDate) return true;
    return Boolean(
      (minAdDate && adDate < minAdDate) || (maxAdDate && adDate > maxAdDate),
    );
  }

  const alternateCalendarLabel =
    mode === "AD"
      ? `BS: ${formatBikramSambatDateTime(previewValue || null)}`
      : `AD: ${formatKathmanduDateTime(previewValue || null)}`;

  return (
    <div className={`management-work-dual-date ${open ? "is-calendar-open" : ""}`.trim()} ref={containerRef}>
      <span className="management-work-form__label-text" id={`${id}-label`}>
        {label}
        {required && (
          <>
            {" "}
            <span className="management-work-form__required" aria-hidden="true">
              *
            </span>
            <span className="sr-only"> required</span>
          </>
        )}
      </span>

      <div className="management-work-date-time-row">
        <div className="management-work-date-picker">
          <div
            ref={dateFieldRef}
            className={`management-work-date-picker__field ${showError && error ? "has-error" : ""}`.trim()}
          >
            <span className="management-work-date-picker__system" aria-hidden="true">
              {mode}
            </span>
            <input
              ref={dateInputRef}
              id={id}
              type="text"
              inputMode="numeric"
              autoComplete="off"
              maxLength={10}
              required={required}
              value={dateDraft}
              placeholder="YYYY-MM-DD"
              aria-labelledby={`${id}-label`}
              aria-describedby={[
                showAlternate ? `${id}-alternate` : "",
                showError && error ? `${id}-error` : "",
              ].filter(Boolean).join(" ") || undefined}
              aria-invalid={Boolean(error)}
              aria-label={`${label} date`}
              onChange={(event) => {
                const nextDraft = event.target.value;
                setDateDraft(nextDraft);
                setError("");
                setShowError(false);

                if (!nextDraft) {
                  setDateValue("");
                  onChange("");
                  return;
                }

                if (/^\d{4}-\d{2}-\d{2}$/.test(nextDraft)) {
                  commitDateDraft(nextDraft);
                } else {
                  // Keep native form validation authoritative without showing a
                  // distracting error while the user is still typing.
                  setError(`Complete the ${mode} date using YYYY-MM-DD.`);
                }
              }}
              onBlur={() => commitDateDraft()}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  commitDateDraft();
                }
              }}
            />
            <button
              type="button"
              className="management-work-date-picker__toggle"
              aria-label={`Open ${label} calendar`}
              aria-haspopup="dialog"
              aria-expanded={open}
              aria-controls={open ? `${id}-calendar` : undefined}
              onClick={() => setOpen((current) => !current)}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M7 2v3M17 2v3M3.5 9h17M5.5 4.5h13a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2v-12a2 2 0 0 1 2-2Z" />
              </svg>
            </button>
          </div>
          {open && calendarPosition && typeof document !== "undefined"
            ? createPortal(
                <div
                  ref={calendarRef}
                  id={`${id}-calendar`}
                  className={`management-work-date-picker__calendar is-${calendarPosition.placement}`}
                  role="dialog"
                  aria-label={`${label} calendar`}
                  style={{
                    top: calendarPosition.top,
                    left: calendarPosition.left,
                    width: calendarPosition.width,
                  }}
                >
                  <header className="management-work-date-picker__header">
                    <div className="management-work-date-picker__heading">
                      <strong>Select date</strong>
                      {!isModeControlled && (
                        <div
                          className="management-work-date-picker__mode"
                          role="group"
                          aria-label="Calendar system"
                        >
                          <button
                            type="button"
                            className={mode === "AD" ? "is-active" : ""}
                            aria-pressed={mode === "AD"}
                            onClick={() => switchMode("AD")}
                          >
                            AD
                          </button>
                          <button
                            type="button"
                            className={mode === "BS" ? "is-active" : ""}
                            aria-pressed={mode === "BS"}
                            onClick={() => switchMode("BS")}
                          >
                            BS
                          </button>
                        </div>
                      )}
                      {isModeControlled && (
                        <span className="management-work-date-picker__system-title">{mode}</span>
                      )}
                    </div>
                    <button
                      type="button"
                      className="management-work-date-picker__close"
                      aria-label="Close calendar"
                      onClick={() => setOpen(false)}
                    >
                      ×
                    </button>
                  </header>

                  <div className="management-work-date-picker__month">
                    <button type="button" aria-label="Previous month" onClick={() => changeMonth(-1)}>
                      ‹
                    </button>
                    <strong aria-live="polite">
                      {monthName} {displayYear}
                    </strong>
                    <button type="button" aria-label="Next month" onClick={() => changeMonth(1)}>
                      ›
                    </button>
                  </div>

                  <div className="management-work-date-picker__weekdays" aria-hidden="true">
                    {WEEKDAYS.map((weekday) => (
                      <span key={weekday}>{weekday}</span>
                    ))}
                  </div>
                  <div className="management-work-date-picker__days">
                    {Array.from({ length: monthStartWeekday }, (_, index) => (
                      <span key={`empty-${index}`} aria-hidden="true" />
                    ))}
                    {Array.from({ length: monthLength }, (_, index) => {
                      const day = index + 1;
                      const date = `${displayYear}-${pad(displayMonth)}-${pad(day)}`;
                      const selected =
                        selectedParts?.year === displayYear &&
                        selectedParts.month === displayMonth &&
                        selectedParts.day === day;
                      const today = date === todayModeDate;
                      return (
                        <button
                          key={day}
                          type="button"
                          className={`${selected ? "is-selected" : ""} ${
                            today ? "is-today" : ""
                          }`.trim()}
                          disabled={isDayDisabled(day)}
                          aria-pressed={selected}
                          aria-label={`${monthName} ${day}, ${displayYear} ${mode}`}
                          onClick={() => selectDay(day)}
                        >
                          {day}
                        </button>
                      );
                    })}
                  </div>
                </div>,
                document.body,
              )
            : null}
        </div>

        <label className="management-work-time-input" htmlFor={`${id}-time`}>
          <span>Time</span>
          <div className={`management-work-time-input__field ${showError && error ? "has-error" : ""}`.trim()}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="12" cy="12" r="8.5" />
              <path d="M12 7.5V12l3.25 2" />
            </svg>
            <input
              id={`${id}-time`}
              type="time"
              step={60}
              required={required}
              value={timeValue}
              aria-invalid={Boolean(error)}
              onChange={(event) => {
                const nextTime = event.target.value;
                setTimeValue(nextTime);
                if (dateDraft) {
                  commitDateDraft(dateDraft, nextTime);
                } else {
                  validateAndCommit("", nextTime);
                }
              }}
            />
          </div>
        </label>
      </div>

      {showAlternate && (
        <small id={`${id}-alternate`} className="management-work-dual-date__alternate">
          {alternateCalendarLabel}
        </small>
      )}
      {showError && error && (
        <small id={`${id}-error`} className="management-work-dual-date__error" role="alert">
          {error}
        </small>
      )}
    </div>
  );
}
