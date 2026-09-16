"use client";

/** Analytics charts (build prompt §10). One scale system; colour from theme tokens. */
import { Bar, BarChart, CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend } from "recharts";
import type { SessionPoint, FamilyTally } from "@/lib/analytics";

const axis = { stroke: "var(--fg-muted)", fontSize: 11, tickLine: false as const, axisLine: false as const };
const tooltipStyle = { contentStyle: { background: "var(--surface-raised)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12, color: "var(--fg)" } };
const PALETTE = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)", "var(--incorrect)", "var(--correct)", "var(--warn)", "var(--fg-faint)", "var(--accent-hover)"];

export function AccuracyOverTime({ points, target }: { points: SessionPoint[]; target: number }) {
  const data = points.map((p, i) => ({ i: i + 1, label: `${p.date}${p.label ? ` (${p.label})` : ""}`, pct: p.pct, small: p.smallSample, n: p.questions, kind: p.kind }));
  return (
    <div className="h-56 w-full">
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
          <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
          <XAxis dataKey="i" {...axis} />
          <YAxis domain={[0, 100]} unit="%" {...axis} />
          <Tooltip
            {...tooltipStyle}
            formatter={(v, _n, item) => [`${v}%${item.payload.small ? " (small sample)" : ""}`, `${item.payload.kind} · ${item.payload.n} q`]}
            labelFormatter={(_l, p) => p?.[0]?.payload?.label ?? ""}
          />
          <ReferenceLine y={target} stroke="var(--correct)" strokeDasharray="4 4" label={{ value: `gate ${target}%`, fontSize: 10, fill: "var(--fg-muted)", position: "insideTopRight" }} />
          <Line
            type="monotone"
            dataKey="pct"
            stroke="var(--chart-1)"
            strokeWidth={2}
            dot={(props) => {
              const { cx, cy, payload, index } = props as { cx: number; cy: number; payload: { small: boolean }; index: number };
              return <circle key={index} cx={cx} cy={cy} r={4} fill={payload.small ? "var(--surface)" : "var(--chart-1)"} stroke="var(--chart-1)" strokeWidth={2} strokeDasharray={payload.small ? "2 2" : undefined} />;
            }}
            name="accuracy"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function FamilyTrend({ mocks, families }: { mocks: Array<{ sessionId: number; date: string }>; families: FamilyTally[] }) {
  const data = mocks.map((m, i) => {
    const row: Record<string, number | string> = { mock: `Mock ${i + 1}`, date: m.date };
    for (const f of families) row[f.family] = f.perMock[i]?.count ?? 0;
    return row;
  });
  const shown = families.filter((f) => f.total > 0);
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
          <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
          <XAxis dataKey="mock" {...axis} />
          <YAxis allowDecimals={false} {...axis} />
          <Tooltip {...tooltipStyle} />
          <Legend wrapperStyle={{ fontSize: 11 }} formatter={(v) => String(v).replace(/_/g, " ")} />
          {shown.map((f, i) => (
            <Line key={f.family} type="monotone" dataKey={f.family} stroke={PALETTE[i % PALETTE.length]} strokeWidth={2} dot={{ r: 3 }} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function PaceHistogram({ buckets, targetLabel }: { buckets: Array<{ label: string; count: number }>; targetLabel: string }) {
  return (
    <div className="h-48 w-full">
      <ResponsiveContainer>
        <BarChart data={buckets} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
          <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
          <XAxis dataKey="label" {...axis} />
          <YAxis allowDecimals={false} {...axis} />
          <Tooltip {...tooltipStyle} />
          <Bar dataKey="count" radius={[3, 3, 0, 0]} fill="var(--chart-1)" name="questions" />
          <ReferenceLine x={targetLabel} stroke="var(--incorrect)" strokeDasharray="4 4" label={{ value: "80s pace", fontSize: 10, fill: "var(--fg-muted)", position: "insideTopRight" }} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
