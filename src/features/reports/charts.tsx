"use client";

/* Small dependency-free SVG charts for the report pages (EXP §10), in the finance page's style. */

export const PALETTE = [
  "#0f766e",
  "#f59e0b",
  "#3b82f6",
  "#ef4444",
  "#8b5cf6",
  "#10b981",
  "#64748b",
];

/** Vertical bars, one per item (daily dynamics, funnel). */
export function Bars({
  items,
  format = (v) => String(v),
  color = PALETTE[0],
  emptyLabel,
  height = 110,
}: {
  items: Array<{ label: string; value: number }>;
  format?: (value: number) => string;
  color?: string;
  emptyLabel: string;
  height?: number;
}) {
  const max = Math.max(...items.map((i) => i.value), 0);
  if (items.length === 0 || max <= 0)
    return <p className="text-sm text-muted-foreground">{emptyLabel}</p>;
  const w = Math.max(6, Math.min(28, Math.floor(480 / items.length) - 4));
  const gap = 4;
  const width = items.length * (w + gap) + gap;
  const every = Math.max(1, Math.ceil(items.length / 12));
  return (
    <svg
      viewBox={`0 0 ${width} ${height + 20}`}
      className="h-40 w-full"
      role="img"
      data-testid="bars"
    >
      {items.map((it, i) => {
        const h = (it.value / max) * height;
        const x = gap + i * (w + gap);
        return (
          <g key={`${it.label}-${i}`}>
            <rect x={x} y={height - h} width={w} height={h} fill={color} rx="1">
              <title>{`${it.label}: ${format(it.value)}`}</title>
            </rect>
            {i % every === 0 && (
              <text
                x={x + w / 2}
                y={height + 14}
                textAnchor="middle"
                fontSize="9"
                fill="currentColor"
              >
                {it.label}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

/** Horizontal bars with the label and value beside each (breakdowns by course, reason…). */
export function HBars({
  items,
  format = (v) => String(v),
  emptyLabel,
  colored = false,
}: {
  items: Array<{ name: string; count: number }>;
  format?: (value: number) => string;
  emptyLabel: string;
  colored?: boolean;
}) {
  const max = Math.max(...items.map((i) => i.count), 0);
  if (items.length === 0 || max <= 0)
    return <p className="text-sm text-muted-foreground">{emptyLabel}</p>;
  return (
    <ul className="space-y-1.5" data-testid="hbars">
      {items.slice(0, 12).map((it, i) => (
        <li
          key={`${it.name}-${i}`}
          className="grid grid-cols-[minmax(0,10rem)_1fr_auto] items-center gap-2 text-sm"
        >
          <span className="truncate" title={it.name}>
            {it.name}
          </span>
          <span className="h-3 rounded bg-muted">
            <span
              className="block h-3 rounded"
              style={{
                width: `${(it.count / max) * 100}%`,
                background: colored ? PALETTE[i % PALETTE.length] : PALETTE[0],
              }}
            />
          </span>
          <span className="tabular-nums text-muted-foreground">{format(it.count)}</span>
        </li>
      ))}
    </ul>
  );
}

/** Grouped bars: several series per label (leads per month: new / lost / converted). */
export function MultiBars({
  labels,
  series,
  format = (v) => String(v),
}: {
  labels: string[];
  series: Array<{ name: string; values: number[]; color?: string }>;
  format?: (value: number) => string;
}) {
  const max = Math.max(1, ...series.flatMap((s) => s.values));
  const h = 110;
  const w = 10;
  const gap = 10;
  const groupW = series.length * w;
  const width = labels.length * (groupW + gap) + gap;
  return (
    <div className="space-y-2" data-testid="multi-bars">
      <svg viewBox={`0 0 ${width} ${h + 20}`} className="h-44 w-full" role="img">
        {labels.map((label, i) => {
          const x = gap + i * (groupW + gap);
          return (
            <g key={label}>
              {series.map((s, j) => {
                const v = s.values[i] ?? 0;
                const bh = (v / max) * h;
                return (
                  <rect
                    key={s.name}
                    x={x + j * w}
                    y={h - bh}
                    width={w - 1}
                    height={bh}
                    fill={s.color ?? PALETTE[j % PALETTE.length]}
                  >
                    <title>{`${label}: ${s.name} ${format(v)}`}</title>
                  </rect>
                );
              })}
              <text
                x={x + groupW / 2}
                y={h + 14}
                textAnchor="middle"
                fontSize="9"
                fill="currentColor"
              >
                {label}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
        {series.map((s, j) => (
          <span key={s.name} className="flex items-center gap-1">
            <span
              className="inline-block size-3 rounded-sm"
              style={{ background: s.color ?? PALETTE[j % PALETTE.length] }}
            />
            {s.name}
          </span>
        ))}
      </div>
    </div>
  );
}
