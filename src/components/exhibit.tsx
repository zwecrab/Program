"use client";

/**
 * Renders `exhibit_json` chart specs (build prompt §6.6) with Recharts, taking
 * colour from theme tokens. Data shapes are the ones the generator prompt
 * describes; unknown shapes fall back to a readable JSON block so a question
 * is never blank.
 */
import { Bar, BarChart, CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from "recharts";
import { Card } from "@/components/ui";

const C = { a: "var(--chart-1)", b: "var(--chart-2)", c: "var(--chart-3)", d: "var(--chart-4)", grid: "var(--chart-grid)", ref: "var(--chart-ref)", fg: "var(--fg-muted)" };
const axis = { stroke: C.fg, fontSize: 11, tickLine: false as const, axisLine: false as const };
const tooltipStyle = { contentStyle: { background: "var(--surface-raised)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12, color: "var(--fg)" } };

type Rec = Record<string, unknown>;
const num = (v: unknown, d = 0) => (typeof v === "number" && Number.isFinite(v) ? v : Number(v) || d);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

export function ExhibitView({ kind, title, data }: { kind: string; title?: string; data: unknown }) {
  const d = (data ?? {}) as Rec;
  return (
    <Card className="p-3">
      {title ? <p className="mb-2 text-xs font-medium uppercase tracking-[0.08em] text-fg-muted">{title}</p> : null}
      <div className="h-56 w-full">
        <Chart kind={kind} d={d} />
      </div>
    </Card>
  );
}

function Chart({ kind, d }: { kind: string; d: Rec }) {
  switch (kind) {
    case "burndown":
    case "burnup": {
      const ideal = arr(d.ideal).map(num);
      const actual = arr(d.actual).map(num);
      const n = Math.max(ideal.length, actual.length, num(d.sprintDays, 0));
      const rows = Array.from({ length: n }, (_, i) => ({ day: i + 1, ideal: ideal[i], actual: actual[i] }));
      return (
        <ResponsiveContainer>
          <LineChart data={rows} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
            <CartesianGrid stroke={C.grid} vertical={false} />
            <XAxis dataKey="day" {...axis} />
            <YAxis {...axis} />
            <Tooltip {...tooltipStyle} />
            <Line type="monotone" dataKey="ideal" stroke={C.ref} strokeDasharray="4 4" dot={false} name={kind === "burnup" ? "scope" : "ideal"} />
            <Line type="monotone" dataKey="actual" stroke={C.a} strokeWidth={2} dot={{ r: 2 }} name="actual" />
          </LineChart>
        </ResponsiveContainer>
      );
    }
    case "control_chart": {
      const rows = arr(d.points).map((v, i) => ({ i: i + 1, v: num(v) }));
      return (
        <ResponsiveContainer>
          <LineChart data={rows} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
            <CartesianGrid stroke={C.grid} vertical={false} />
            <XAxis dataKey="i" {...axis} />
            <YAxis {...axis} domain={["auto", "auto"]} />
            <Tooltip {...tooltipStyle} />
            <ReferenceLine y={num(d.ucl)} stroke="var(--incorrect)" strokeDasharray="3 3" label={{ value: "UCL", fontSize: 10, fill: C.fg, position: "right" }} />
            <ReferenceLine y={num(d.mean)} stroke={C.ref} label={{ value: "mean", fontSize: 10, fill: C.fg, position: "right" }} />
            <ReferenceLine y={num(d.lcl)} stroke="var(--incorrect)" strokeDasharray="3 3" label={{ value: "LCL", fontSize: 10, fill: C.fg, position: "right" }} />
            <Line type="linear" dataKey="v" stroke={C.a} strokeWidth={2} dot={{ r: 3 }} name="value" />
          </LineChart>
        </ResponsiveContainer>
      );
    }
    case "pareto": {
      const cats = arr(d.categories)
        .map((c) => c as Rec)
        .map((c) => ({ name: String(c.name ?? ""), count: num(c.count) }))
        .sort((a, b) => b.count - a.count);
      const total = cats.reduce((a, c) => a + c.count, 0) || 1;
      let acc = 0;
      const rows = cats.map((c) => ({ ...c, cum: Math.round(((acc += c.count) / total) * 100) }));
      return (
        <ResponsiveContainer>
          <BarChart data={rows} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
            <CartesianGrid stroke={C.grid} vertical={false} />
            <XAxis dataKey="name" {...axis} interval={0} />
            <YAxis yAxisId="l" {...axis} />
            <YAxis yAxisId="r" orientation="right" {...axis} domain={[0, 100]} unit="%" />
            <Tooltip {...tooltipStyle} />
            <Bar yAxisId="l" dataKey="count" fill={C.a} radius={[3, 3, 0, 0]} />
            <Line yAxisId="r" type="monotone" dataKey="cum" stroke={C.c} strokeWidth={2} dot={{ r: 2 }} name="cumulative %" />
          </BarChart>
        </ResponsiveContainer>
      );
    }
    case "histogram": {
      const rows = arr(d.bins ?? d.categories)
        .map((c) => c as Rec)
        .map((c) => ({ name: String(c.name ?? c.label ?? ""), count: num(c.count) }));
      return (
        <ResponsiveContainer>
          <BarChart data={rows} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
            <CartesianGrid stroke={C.grid} vertical={false} />
            <XAxis dataKey="name" {...axis} interval={0} />
            <YAxis {...axis} />
            <Tooltip {...tooltipStyle} />
            <Bar dataKey="count" fill={C.a} radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      );
    }
    case "tornado": {
      const rows = arr(d.variables ?? d.items)
        .map((c) => c as Rec)
        .map((c) => ({ name: String(c.name ?? ""), low: num(c.low), high: num(c.high) }))
        .sort((a, b) => Math.abs(b.high - b.low) - Math.abs(a.high - a.low));
      return (
        <ResponsiveContainer>
          <BarChart data={rows} layout="vertical" margin={{ top: 8, right: 12, left: 8, bottom: 0 }} stackOffset="sign">
            <CartesianGrid stroke={C.grid} horizontal={false} />
            <XAxis type="number" {...axis} />
            <YAxis type="category" dataKey="name" {...axis} width={110} />
            <Tooltip {...tooltipStyle} />
            <ReferenceLine x={0} stroke={C.ref} />
            <Bar dataKey="low" fill={C.b} stackId="s" />
            <Bar dataKey="high" fill={C.a} stackId="s" />
          </BarChart>
        </ResponsiveContainer>
      );
    }
    case "evm_dashboard": {
      const pv = num(d.pv);
      const ev = num(d.ev);
      const ac = num(d.ac);
      const bac = num(d.bac);
      const cpi = ac ? ev / ac : 0;
      const spi = pv ? ev / pv : 0;
      const tiles = [
        ["PV", pv],
        ["EV", ev],
        ["AC", ac],
        ["BAC", bac],
        ["CV = EV − AC", ev - ac],
        ["SV = EV − PV", ev - pv],
        ["CPI", cpi.toFixed(2)],
        ["SPI", spi.toFixed(2)],
      ];
      return (
        <div className="grid h-full grid-cols-4 gap-2">
          {tiles.map(([k, v]) => (
            <div key={String(k)} className="flex flex-col justify-center rounded-md bg-bg-sunken px-2 py-1">
              <span className="text-[10px] uppercase tracking-wide text-fg-muted">{k}</span>
              <span className="font-display text-lg tabular">{typeof v === "number" ? v.toLocaleString() : v}</span>
            </div>
          ))}
        </div>
      );
    }
    case "network_diagram": {
      const acts = arr(d.activities)
        .map((c) => c as Rec)
        .map((c) => ({ id: String(c.id), duration: num(c.duration), preds: arr(c.predecessors).map(String) }));
      // topological columns
      const level = new Map<string, number>();
      const lv = (id: string, depth = 0): number => {
        if (level.has(id)) return level.get(id)!;
        if (depth > 50) return 0;
        const a = acts.find((x) => x.id === id);
        const l = a && a.preds.length ? Math.max(...a.preds.map((p) => lv(p, depth + 1))) + 1 : 0;
        level.set(id, l);
        return l;
      };
      acts.forEach((a) => lv(a.id));
      const cols = Math.max(...[...level.values()], 0) + 1;
      const byCol: string[][] = Array.from({ length: cols }, () => []);
      acts.forEach((a) => byCol[level.get(a.id) ?? 0].push(a.id));
      const W = 100 * cols + 20;
      const H = 60 * Math.max(...byCol.map((c) => c.length), 1) + 20;
      const pos = new Map<string, [number, number]>();
      byCol.forEach((ids, ci) => ids.forEach((id, ri) => pos.set(id, [20 + ci * 100, 20 + ri * 60])));
      return (
        <svg viewBox={`0 0 ${W} ${H}`} className="h-full w-full" role="img" aria-label="network diagram">
          {acts.map((a) =>
            a.preds.map((p) => {
              const from = pos.get(p);
              const to = pos.get(a.id);
              if (!from || !to) return null;
              return <line key={`${p}-${a.id}`} x1={from[0] + 70} y1={from[1] + 20} x2={to[0]} y2={to[1] + 20} stroke={C.ref} strokeWidth={1.5} markerEnd="url(#arrow)" />;
            }),
          )}
          <defs>
            <marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
              <path d="M0,0 L8,4 L0,8 z" fill={C.ref} />
            </marker>
          </defs>
          {acts.map((a) => {
            const [x, y] = pos.get(a.id) ?? [0, 0];
            return (
              <g key={a.id}>
                <rect x={x} y={y} width={70} height={40} rx={6} fill="var(--surface-raised)" stroke="var(--border-strong)" />
                <text x={x + 35} y={y + 17} textAnchor="middle" fontSize={12} fontWeight={600} fill="var(--fg)">
                  {a.id}
                </text>
                <text x={x + 35} y={y + 32} textAnchor="middle" fontSize={10} fill={C.fg}>
                  {a.duration}d
                </text>
              </g>
            );
          })}
        </svg>
      );
    }
    case "kanban": {
      const cols = arr(d.columns)
        .map((c) => c as Rec)
        .map((c) => ({ name: String(c.name ?? ""), wip: c.wip === undefined ? null : num(c.wip), cards: arr(c.cards).map(String) }));
      return (
        <div className="grid h-full gap-2" style={{ gridTemplateColumns: `repeat(${Math.max(cols.length, 1)}, minmax(0, 1fr))` }}>
          {cols.map((c) => (
            <div key={c.name} className={`flex flex-col rounded-md p-2 ${c.wip !== null && c.cards.length > c.wip ? "bg-incorrect-soft" : "bg-bg-sunken"}`}>
              <p className="mb-1 truncate text-[11px] font-medium">
                {c.name} {c.wip !== null ? <span className="text-fg-muted">({c.cards.length}/{c.wip})</span> : <span className="text-fg-muted">({c.cards.length})</span>}
              </p>
              <div className="flex flex-1 flex-col gap-1 overflow-hidden">
                {c.cards.slice(0, 6).map((card, i) => (
                  <div key={i} className="truncate rounded bg-surface px-1.5 py-0.5 text-[10px]">
                    {card}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      );
    }
    case "power_interest_grid": {
      const rows = arr(d.stakeholders)
        .map((c) => c as Rec)
        .map((c) => ({ name: String(c.name ?? ""), power: num(c.power), interest: num(c.interest) }));
      return (
        <ResponsiveContainer>
          <ScatterChart margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
            <CartesianGrid stroke={C.grid} />
            <XAxis type="number" dataKey="interest" name="interest" domain={[0, 10]} {...axis} label={{ value: "interest →", position: "insideBottomRight", fontSize: 10, fill: C.fg }} />
            <YAxis type="number" dataKey="power" name="power" domain={[0, 10]} {...axis} label={{ value: "power ↑", angle: -90, position: "insideLeft", fontSize: 10, fill: C.fg }} />
            <ZAxis range={[80, 80]} />
            <ReferenceLine x={5} stroke={C.ref} strokeDasharray="3 3" />
            <ReferenceLine y={5} stroke={C.ref} strokeDasharray="3 3" />
            <Tooltip {...tooltipStyle} cursor={{ strokeDasharray: "3 3" }} />
            <Scatter data={rows} fill={C.a} name="stakeholders" />
          </ScatterChart>
        </ResponsiveContainer>
      );
    }
    default:
      return <pre className="h-full overflow-auto rounded bg-bg-sunken p-2 text-xs">{JSON.stringify(d, null, 2)}</pre>;
  }
}
