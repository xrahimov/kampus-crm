"use client";

/* Small dependency-free SVG charts for the finance page (EXP §9 donut and yearly bars). */

const PALETTE = ["#0f766e", "#f59e0b", "#3b82f6", "#ef4444", "#8b5cf6", "#10b981", "#64748b"];

export function Donut({
  slices,
  format,
  emptyLabel,
}: {
  slices: Array<{ label: string; value: number }>;
  format: (value: number) => string;
  emptyLabel: string;
}) {
  const total = slices.reduce((s, x) => s + x.value, 0);
  if (total <= 0) return <p className="text-sm text-muted-foreground">{emptyLabel}</p>;
  const r = 40;
  const c = 2 * Math.PI * r;
  const arcs = slices.reduce<Array<{ label: string; len: number; offset: number }>>((acc, s) => {
    const len = (s.value / total) * c;
    const offset = acc.reduce((sum, a) => sum + a.len, 0);
    return [...acc, { label: s.label, len, offset }];
  }, []);
  return (
    <div className="flex flex-wrap items-center gap-6" data-testid="donut">
      <svg viewBox="0 0 100 100" className="size-36 shrink-0" role="img" aria-label={format(total)}>
        {arcs.map((a, i) => (
          <circle
            key={a.label}
            cx="50"
            cy="50"
            r={r}
            fill="none"
            stroke={PALETTE[i % PALETTE.length]}
            strokeWidth="14"
            strokeDasharray={`${a.len} ${c - a.len}`}
            strokeDashoffset={-a.offset}
            transform="rotate(-90 50 50)"
          />
        ))}
      </svg>
      <ul className="space-y-1 text-sm">
        {slices.map((s, i) => (
          <li key={s.label} className="flex items-center gap-2">
            <span
              className="inline-block size-3 rounded-sm"
              style={{ background: PALETTE[i % PALETTE.length] }}
            />
            <span className="min-w-24">{s.label}</span>
            <span className="tabular-nums text-muted-foreground">
              {format(s.value)} · {Math.round((s.value / total) * 100)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function YearBars({
  months,
  labels,
  format,
  legend,
}: {
  months: Array<{ income: number; expenses: number }>;
  labels: string[];
  format: (value: number) => string;
  legend: { income: string; expenses: string };
}) {
  const max = Math.max(1, ...months.flatMap((m) => [m.income, m.expenses]));
  const h = 120;
  const w = 24;
  const gap = 8;
  const width = months.length * (2 * w + gap) + gap;
  return (
    <div className="space-y-2" data-testid="year-bars">
      <svg viewBox={`0 0 ${width} ${h + 24}`} className="h-44 w-full" role="img">
        {months.map((m, i) => {
          const x = gap + i * (2 * w + gap);
          const hi = (m.income / max) * h;
          const he = (m.expenses / max) * h;
          return (
            <g key={labels[i]}>
              <rect x={x} y={h - hi} width={w} height={hi} fill={PALETTE[0]}>
                <title>{`${labels[i]}: ${legend.income} ${format(m.income)}`}</title>
              </rect>
              <rect x={x + w} y={h - he} width={w} height={he} fill={PALETTE[1]}>
                <title>{`${labels[i]}: ${legend.expenses} ${format(m.expenses)}`}</title>
              </rect>
              <text x={x + w} y={h + 16} textAnchor="middle" fontSize="10" fill="currentColor">
                {labels[i]}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="flex gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="inline-block size-3 rounded-sm" style={{ background: PALETTE[0] }} />
          {legend.income}
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block size-3 rounded-sm" style={{ background: PALETTE[1] }} />
          {legend.expenses}
        </span>
      </div>
    </div>
  );
}
