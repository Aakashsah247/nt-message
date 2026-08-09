import type { CSSProperties } from "react";

import type { WorkReportSummary } from "../../types/work-management";

const CHART_WIDTH = 760;
const CHART_HEIGHT = 250;
const PADDING_X = 44;
const PADDING_TOP = 24;
const PADDING_BOTTOM = 38;

interface TrendSeries {
  key: "workCreated" | "workClosed" | "helpRequested" | "dutyScheduled";
  label: string;
  className: string;
}

function buildPoints(
  trend: WorkReportSummary["trend"],
  key: TrendSeries["key"],
  maximum: number,
): string {
  const plotWidth = CHART_WIDTH - PADDING_X * 2;
  const plotHeight = CHART_HEIGHT - PADDING_TOP - PADDING_BOTTOM;
  return trend
    .map((row, index) => {
      const x =
        trend.length <= 1
          ? PADDING_X + plotWidth / 2
          : PADDING_X + (index / (trend.length - 1)) * plotWidth;
      const y = PADDING_TOP + plotHeight - (row[key] / maximum) * plotHeight;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

function formatShortDate(value: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    timeZone: "Asia/Kathmandu",
  }).format(new Date(`${value}T06:00:00Z`));
}

export function ReportTrendChart({
  title,
  subtitle,
  trend,
  series,
}: {
  title: string;
  subtitle: string;
  trend: WorkReportSummary["trend"];
  series: TrendSeries[];
}) {
  const maximum = Math.max(
    1,
    ...trend.flatMap((row) => series.map((item) => row[item.key])),
  );
  const hasActivity = trend.some((row) =>
    series.some((item) => row[item.key] > 0),
  );
  const labelIndexes = new Set(
    trend
      .map((_, index) => index)
      .filter(
        (index) =>
          index === 0 ||
          index === trend.length - 1 ||
          index % Math.max(1, Math.ceil(trend.length / 6)) === 0,
      ),
  );

  return (
    <article className="work-report__panel work-report-e__chart-panel">
      <header>
        <div>
          <span>Trend</span>
          <h2>{title}</h2>
          <p>{subtitle}</p>
        </div>
      </header>
      <div className="work-report-e__legend" aria-hidden="true">
        {series.map((item) => (
          <span key={item.key} className={item.className}>
            {item.label}
          </span>
        ))}
      </div>
      {hasActivity ? (
        <div className="work-report-e__chart-scroll">
          <svg
            className="work-report-e__line-chart"
            role="img"
            aria-label={`${title}. ${subtitle}`}
            viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
          >
            {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
              const y =
                PADDING_TOP +
                (CHART_HEIGHT - PADDING_TOP - PADDING_BOTTOM) * ratio;
              return (
                <line
                  key={ratio}
                  className="grid"
                  x1={PADDING_X}
                  x2={CHART_WIDTH - PADDING_X}
                  y1={y}
                  y2={y}
                />
              );
            })}
            {series.map((item) => (
              <polyline
                key={item.key}
                className={item.className}
                points={buildPoints(trend, item.key, maximum)}
              />
            ))}
            {trend.map((row, index) => {
              if (!labelIndexes.has(index)) return null;
              const plotWidth = CHART_WIDTH - PADDING_X * 2;
              const x =
                trend.length <= 1
                  ? PADDING_X + plotWidth / 2
                  : PADDING_X + (index / (trend.length - 1)) * plotWidth;
              return (
                <text key={row.date} x={x} y={CHART_HEIGHT - 12} textAnchor="middle">
                  {formatShortDate(row.date)}
                </text>
              );
            })}
          </svg>
        </div>
      ) : (
        <div className="work-report-e__chart-empty">
          <strong>No activity in this period</strong>
          <p>Change the report period or filters to review another range.</p>
        </div>
      )}
    </article>
  );
}

export function ReportDonut({
  title,
  value,
  total,
  label,
  note,
}: {
  title: string;
  value: number;
  total: number;
  label: string;
  note: string;
}) {
  const percentage = total > 0 ? Math.min(100, Math.round((value / total) * 100)) : 0;
  return (
    <article className="work-report__panel work-report-e__donut-panel">
      <header>
        <div>
          <span>Risk ratio</span>
          <h2>{title}</h2>
          <p>{note}</p>
        </div>
      </header>
      <div className="work-report-e__donut-content">
        <div
          className="work-report-e__donut"
          style={{ "--report-donut-value": `${percentage}%` } as CSSProperties}
          role="img"
          aria-label={`${percentage}% ${label}`}
        >
          <span>
            <strong>{percentage}%</strong>
            <small>{label}</small>
          </span>
        </div>
        <dl>
          <div>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
          <div>
            <dt>Comparison total</dt>
            <dd>{total}</dd>
          </div>
        </dl>
      </div>
    </article>
  );
}

export function ScopeClosureChart({
  title,
  rows,
  onSelect,
}: {
  title: string;
  rows: Array<{
    id: string;
    code: string;
    name: string;
    workCreated: number;
    workClosed: number;
  }>;
  onSelect: (id: string) => void;
}) {
  return (
    <article className="work-report__panel work-report-e__scope-chart">
      <header>
        <div>
          <span>Comparison</span>
          <h2>{title}</h2>
          <p>
            Closure ratio compares work closed during the period with work created during the period. It is not an employee rating.
          </p>
        </div>
      </header>
      <div className="work-report-e__scope-bars">
        {rows.map((row) => {
          const ratio =
            row.workCreated > 0
              ? Math.min(100, Math.round((row.workClosed / row.workCreated) * 100))
              : row.workClosed > 0
                ? 100
                : 0;
          return (
            <button key={row.id} type="button" onClick={() => onSelect(row.id)}>
              <span>
                <strong>{row.name}</strong>
                <small>{row.code}</small>
              </span>
              <i>
                <b style={{ width: `${ratio}%` }} />
              </i>
              <em>{ratio}%</em>
            </button>
          );
        })}
        {rows.length === 0 && (
          <p className="work-report__empty">No scope comparison data is available.</p>
        )}
      </div>
    </article>
  );
}
