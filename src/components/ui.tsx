import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

/* Small shadcn-style primitives. Kept in one file to stay cheap to edit. */

export function Card({ className, ...props }: ComponentProps<"section">) {
  return <section className={cn("rounded-xl border border-border bg-card p-4 shadow-sm", className)} {...props} />;
}

export function CardTitle({ className, ...props }: ComponentProps<"h2">) {
  return <h2 className={cn("text-sm font-semibold uppercase tracking-wide text-muted", className)} {...props} />;
}

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
const variants: Record<ButtonVariant, string> = {
  primary: "bg-primary text-primary-fg hover:opacity-90",
  secondary: "border border-border bg-card hover:bg-background",
  ghost: "hover:bg-card",
  danger: "bg-danger text-white hover:opacity-90",
};
const base =
  "inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition disabled:opacity-50 disabled:pointer-events-none";

export function Button({
  variant = "primary",
  className,
  ...props
}: ComponentProps<"button"> & { variant?: ButtonVariant }) {
  return <button className={cn(base, variants[variant], className)} {...props} />;
}

export function LinkButton({
  variant = "primary",
  className,
  ...props
}: ComponentProps<typeof Link> & { variant?: ButtonVariant }) {
  return <Link className={cn(base, variants[variant], className)} {...props} />;
}

export function Badge({
  tone = "neutral",
  className,
  ...props
}: ComponentProps<"span"> & { tone?: "neutral" | "success" | "warn" | "danger" | "primary" }) {
  const tones = {
    neutral: "bg-border text-foreground",
    success: "bg-success/15 text-success",
    warn: "bg-accent/15 text-accent",
    danger: "bg-danger/15 text-danger",
    primary: "bg-primary/15 text-primary",
  };
  return (
    <span className={cn("inline-block rounded-full px-2 py-0.5 text-xs font-medium", tones[tone], className)} {...props} />
  );
}

export function Input({ className, ...props }: ComponentProps<"input">) {
  return (
    <input
      className={cn(
        "w-full rounded-lg border border-border bg-card px-3 py-2 text-base outline-none focus:ring-2 focus:ring-primary/40",
        className,
      )}
      {...props}
    />
  );
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return (
    <textarea
      className={cn(
        "w-full rounded-lg border border-border bg-card px-3 py-2 text-base outline-none focus:ring-2 focus:ring-primary/40",
        className,
      )}
      {...props}
    />
  );
}

export function Select({ className, ...props }: ComponentProps<"select">) {
  return (
    <select
      className={cn(
        "w-full rounded-lg border border-border bg-card px-3 py-2 text-base outline-none focus:ring-2 focus:ring-primary/40",
        className,
      )}
      {...props}
    />
  );
}

export function Label({ className, ...props }: ComponentProps<"label">) {
  return <label className={cn("mb-1 block text-xs font-medium text-muted", className)} {...props} />;
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <div>
      <Label>{label}</Label>
      {children}
      {hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
    </div>
  );
}

/** SVG progress ring, 0–100. */
export function ProgressRing({ value, size = 96, label }: { value: number; size?: number; label?: string }) {
  const stroke = 8;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, value));
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${Math.round(pct)}%`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--border)" strokeWidth={stroke} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="var(--primary)"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - pct / 100)}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle" fontSize={size / 5} fontWeight={600} fill="currentColor">
        {label ?? `${Math.round(pct)}%`}
      </text>
    </svg>
  );
}
