import { Badge, Button, Card, CardTitle, Input, PageHeader, Progress, ProgressRing, Select, Stat, Textarea } from "@/components/ui";
import { DesignInteractive } from "./interactive";

export const dynamic = "force-dynamic";

/** Every component in both themes, side by side, so drift is visible (Phase 2 brief §19). */
export default function DesignPage() {
  return (
    <div>
      <PageHeader eyebrow="Design system" title="Components in both themes" description="Fraunces for display, Inter Tight for UI. Semantic colour only where it carries meaning." />
      <div className="grid gap-4 lg:grid-cols-2">
        {(["light", "dark"] as const).map((theme) => (
          <div key={theme} data-theme={theme} className="rounded-lg border border-border bg-bg p-4 text-fg" style={{ colorScheme: theme }}>
            <p className="mb-3 text-xs font-medium uppercase tracking-[0.08em] text-fg-muted">{theme}</p>
            <Swatches />
            <div className="mt-4 space-y-4">
              <section>
                <CardTitle>Type scale</CardTitle>
                <p className="font-display text-4xl leading-none">Aa 47</p>
                <h2 className="text-2xl">Plan and manage risk</h2>
                <p className="prose-reading text-base">
                  A key supplier reports that a component <em>may</em> arrive two weeks late. The stem reads at a 65-character measure with 1.7 line height, because you read hundreds of these a day.
                </p>
                <p className="text-sm text-fg-muted">Muted UI text · 14px</p>
                <p className="text-xs text-fg-faint">Faint caption · 12px</p>
              </section>
              <section className="flex flex-wrap gap-2">
                <Button>Primary</Button>
                <Button variant="secondary">Secondary</Button>
                <Button variant="soft">Soft</Button>
                <Button variant="ghost">Ghost</Button>
                <Button variant="destructive">Destructive</Button>
                <Button variant="link">Link</Button>
                <Button size="sm">Small</Button>
                <Button size="lg">Large</Button>
                <Button disabled>Disabled</Button>
              </section>
              <section className="flex flex-wrap gap-2">
                <Badge>neutral</Badge>
                <Badge tone="accent">accent</Badge>
                <Badge tone="correct">correct</Badge>
                <Badge tone="incorrect">incorrect</Badge>
                <Badge tone="warn">warn</Badge>
                <Badge tone="outline">outline</Badge>
              </section>
              <section className="grid grid-cols-2 gap-2">
                <Stat label="Accuracy" value="68%" hint="120 answered" />
                <Stat label="Gate" value="not yet" tone="warn" />
                <Card className="col-span-2 flex items-center gap-4 p-4">
                  <ProgressRing value={34} size={72} label="16" sublabel="of 47" />
                  <div className="flex-1 space-y-2">
                    <Progress value={34} />
                    <Progress value={80} tone="correct" />
                    <Progress value={20} tone="incorrect" />
                  </div>
                </Card>
              </section>
              <section className="grid gap-2">
                <Input placeholder="Input" />
                <Select defaultValue="a">
                  <option value="a">Select option</option>
                </Select>
                <Textarea placeholder="Textarea" rows={2} />
              </section>
              <DesignInteractive />
              <section>
                <CardTitle>Heatmap ramp</CardTitle>
                <div className="mt-1 flex gap-1">
                  {[0, 1, 2, 3, 4].map((i) => (
                    <div key={i} className="h-8 flex-1 rounded" style={{ background: `var(--heat-${i})` }} />
                  ))}
                </div>
              </section>
              <section>
                <CardTitle>Chart palette</CardTitle>
                <div className="mt-1 flex gap-1">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <div key={i} className="h-8 flex-1 rounded" style={{ background: `var(--chart-${i})` }} />
                  ))}
                </div>
              </section>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Swatches() {
  const tokens = ["--bg", "--bg-sunken", "--surface", "--surface-raised", "--border", "--fg", "--fg-muted", "--fg-faint", "--accent", "--accent-soft", "--correct", "--incorrect", "--warn"];
  return (
    <div className="grid grid-cols-7 gap-1.5 sm:grid-cols-13">
      {tokens.map((t) => (
        <div key={t} className="text-[9px] leading-tight text-fg-muted">
          <div className="mb-0.5 h-7 rounded border border-border" style={{ background: `var(${t})` }} />
          {t.slice(2)}
        </div>
      ))}
    </div>
  );
}
