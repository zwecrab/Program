"use client";

/**
 * UI kit (Phase 2 brief §19). shadcn/ui conventions — cva variants, Radix
 * primitives, `cn` merging — built on the theme tokens in globals.css.
 * The shadcn CLI registry is not reachable from every build environment, so
 * these are the same components authored locally; drop-in compatible.
 */
import * as React from "react";
import Link from "next/link";
import { cva, type VariantProps } from "class-variance-authority";
import { Dialog as RDialog, Tabs as RTabs, Switch as RSwitch, Slot, Progress as RProgress, Separator as RSeparator, Tooltip as RTooltip } from "radix-ui";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ Button */

export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 select-none",
  {
    variants: {
      variant: {
        default: "bg-accent text-accent-fg hover:bg-accent-hover shadow-sm",
        secondary: "bg-surface text-fg border border-border hover:bg-bg-sunken",
        soft: "bg-accent-soft text-accent-soft-fg hover:opacity-90",
        ghost: "hover:bg-bg-sunken text-fg",
        destructive: "bg-incorrect text-white hover:opacity-90",
        link: "text-accent underline-offset-4 hover:underline",
      },
      size: {
        sm: "h-8 px-3 text-sm",
        md: "h-10 px-4 text-sm",
        lg: "h-12 px-5 text-base",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: { variant: "default", size: "md" },
  },
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, asChild, ...props }, ref) => {
  const Comp = asChild ? Slot.Root : "button";
  return <Comp ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />;
});
Button.displayName = "Button";

export function LinkButton({ className, variant, size, ...props }: React.ComponentProps<typeof Link> & VariantProps<typeof buttonVariants>) {
  return <Link className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}

/* -------------------------------------------------------------------- Card */

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-lg border border-border bg-surface shadow-card", className)} {...props} />;
}
export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex flex-col gap-1 p-4 pb-2", className)} {...props} />;
}
export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn("text-xs font-semibold uppercase tracking-[0.08em] text-fg-muted font-sans", className)} {...props} />;
}
export function CardDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("text-sm text-fg-muted", className)} {...props} />;
}
export function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-4 pt-2", className)} {...props} />;
}

/* ------------------------------------------------------------------- Badge */

export const badgeVariants = cva("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap", {
  variants: {
    tone: {
      neutral: "bg-bg-sunken text-fg-muted",
      accent: "bg-accent-soft text-accent-soft-fg",
      correct: "bg-correct-soft text-correct",
      incorrect: "bg-incorrect-soft text-incorrect",
      warn: "bg-warn-soft text-fg",
      outline: "border border-border text-fg-muted",
    },
  },
  defaultVariants: { tone: "neutral" },
});
export function Badge({ className, tone, ...props }: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}

/* -------------------------------------------------------------- Form bits */

const fieldBase =
  "w-full rounded-md border border-border bg-surface px-3 py-2 text-base text-fg placeholder:text-fg-faint outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(({ className, ...props }, ref) => (
  <input ref={ref} className={cn(fieldBase, "h-10", className)} {...props} />
));
Input.displayName = "Input";

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(({ className, ...props }, ref) => (
  <textarea ref={ref} className={cn(fieldBase, "min-h-20", className)} {...props} />
));
Textarea.displayName = "Textarea";

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(({ className, ...props }, ref) => (
  <select ref={ref} className={cn(fieldBase, "h-10", className)} {...props} />
));
Select.displayName = "Select";

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("mb-1 block text-xs font-medium text-fg-muted", className)} {...props} />;
}

export function Field({ label, hint, children, className }: { label: string; hint?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <Label>{label}</Label>
      {children}
      {hint ? <p className="mt-1 text-xs text-fg-faint">{hint}</p> : null}
    </div>
  );
}

export function Switch({ checked, onCheckedChange, label, id }: { checked: boolean; onCheckedChange: (v: boolean) => void; label?: string; id?: string }) {
  return (
    <label className="inline-flex items-center gap-2 text-sm" htmlFor={id}>
      <RSwitch.Root
        id={id}
        checked={checked}
        onCheckedChange={onCheckedChange}
        className="relative h-6 w-10 rounded-full border border-border bg-bg-sunken transition-colors data-[state=checked]:bg-accent"
      >
        <RSwitch.Thumb className="block h-5 w-5 translate-x-0.5 rounded-full bg-surface shadow transition-transform data-[state=checked]:translate-x-[18px]" />
      </RSwitch.Root>
      {label}
    </label>
  );
}

/* ------------------------------------------------------------------ Tabs */

export const Tabs = RTabs.Root;
export function TabsList({ className, ...props }: React.ComponentProps<typeof RTabs.List>) {
  return <RTabs.List className={cn("inline-flex h-10 items-center gap-1 rounded-md bg-bg-sunken p-1", className)} {...props} />;
}
export function TabsTrigger({ className, ...props }: React.ComponentProps<typeof RTabs.Trigger>) {
  return (
    <RTabs.Trigger
      className={cn(
        "rounded-sm px-3 py-1.5 text-sm font-medium text-fg-muted transition-colors data-[state=active]:bg-surface data-[state=active]:text-fg data-[state=active]:shadow-sm",
        className,
      )}
      {...props}
    />
  );
}
export const TabsContent = RTabs.Content;

/* ---------------------------------------------------------------- Dialog */

export const Dialog = RDialog.Root;
export const DialogTrigger = RDialog.Trigger;
export function DialogContent({ className, title, children, ...props }: React.ComponentProps<typeof RDialog.Content> & { title: string }) {
  return (
    <RDialog.Portal>
      <RDialog.Overlay className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px]" />
      <RDialog.Content
        className={cn(
          "fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border bg-surface p-5 shadow-card",
          className,
        )}
        {...props}
      >
        <div className="mb-3 flex items-start justify-between gap-4">
          <RDialog.Title className="font-display text-xl">{title}</RDialog.Title>
          <RDialog.Close className="rounded-md p-1 text-fg-muted hover:bg-bg-sunken" aria-label="Close">
            <X size={18} />
          </RDialog.Close>
        </div>
        {children}
      </RDialog.Content>
    </RDialog.Portal>
  );
}

/* -------------------------------------------------------------- Progress */

export function Progress({ value, className, tone = "accent" }: { value: number; className?: string; tone?: "accent" | "correct" | "incorrect" }) {
  const bar = tone === "correct" ? "bg-correct" : tone === "incorrect" ? "bg-incorrect" : "bg-accent";
  return (
    <RProgress.Root value={value} className={cn("h-1.5 w-full overflow-hidden rounded-full bg-bg-sunken", className)}>
      <RProgress.Indicator className={cn("h-full rounded-full transition-[width]", bar)} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </RProgress.Root>
  );
}

export function ProgressRing({ value, size = 96, label, sublabel }: { value: number; size?: number; label?: string; sublabel?: string }) {
  const stroke = Math.max(6, size / 12);
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, value));
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${Math.round(pct)}%`} className="shrink-0">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--border)" strokeWidth={stroke} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="var(--accent)"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - pct / 100)}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text x="50%" y={sublabel ? "46%" : "50%"} dominantBaseline="central" textAnchor="middle" fontSize={size / 4.2} fontWeight={600} fill="currentColor" style={{ fontFamily: "var(--font-display)" }}>
        {label ?? `${Math.round(pct)}%`}
      </text>
      {sublabel ? (
        <text x="50%" y="66%" dominantBaseline="central" textAnchor="middle" fontSize={size / 9} fill="var(--fg-muted)">
          {sublabel}
        </text>
      ) : null}
    </svg>
  );
}

/* --------------------------------------------------------- Misc primitives */

export function Separator({ className }: { className?: string }) {
  return <RSeparator.Root className={cn("h-px w-full bg-border", className)} />;
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-bg-sunken", className)} />;
}

export function Tooltip({ content, children }: { content: React.ReactNode; children: React.ReactNode }) {
  return (
    <RTooltip.Provider delayDuration={200}>
      <RTooltip.Root>
        <RTooltip.Trigger asChild>{children}</RTooltip.Trigger>
        <RTooltip.Portal>
          <RTooltip.Content sideOffset={6} className="z-50 max-w-xs rounded-md border border-border bg-surface-raised px-3 py-2 text-xs text-fg shadow-card">
            {content}
          </RTooltip.Content>
        </RTooltip.Portal>
      </RTooltip.Root>
    </RTooltip.Provider>
  );
}

/** Big number tile for dashboards. */
export function Stat({ label, value, hint, tone }: { label: string; value: React.ReactNode; hint?: React.ReactNode; tone?: "correct" | "incorrect" | "warn" }) {
  const color = tone === "correct" ? "text-correct" : tone === "incorrect" ? "text-incorrect" : tone === "warn" ? "text-warn" : "text-fg";
  return (
    <Card className="p-4">
      <CardTitle>{label}</CardTitle>
      <p className={cn("font-display mt-1 text-3xl tabular", color)}>{value}</p>
      {hint ? <p className="mt-1 text-xs text-fg-muted">{hint}</p> : null}
    </Card>
  );
}

export function PageHeader({ eyebrow, title, description, actions }: { eyebrow?: React.ReactNode; title: React.ReactNode; description?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        {eyebrow ? <p className="text-xs font-medium uppercase tracking-[0.08em] text-fg-muted">{eyebrow}</p> : null}
        <h1 className="text-2xl leading-tight md:text-3xl">{title}</h1>
        {description ? <p className="mt-1 text-sm text-fg-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 gap-2">{actions}</div> : null}
    </header>
  );
}

export function EmptyState({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <Card className="p-6 text-center">
      <p className="font-display text-lg">{title}</p>
      {children ? <div className="mt-2 text-sm text-fg-muted">{children}</div> : null}
    </Card>
  );
}
