"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, Layers, BarChart3, ListChecks, Settings, Sun, Timer } from "lucide-react";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/theme";

interface Labels {
  today: string;
  plan: string;
  practice: string;
  cards: string;
  stats: string;
  exam: string;
  admin: string;
}

export function Nav({ labels }: { labels: Labels }) {
  const path = usePathname();
  const items = [
    { href: "/", label: labels.today, icon: Sun },
    { href: "/plan", label: labels.plan, icon: CalendarDays },
    { href: "/practice", label: labels.practice, icon: ListChecks },
    { href: "/flashcards", label: labels.cards, icon: Layers },
    { href: "/analytics", label: labels.stats, icon: BarChart3 },
    { href: "/exam", label: labels.exam, icon: Timer },
    { href: "/admin", label: labels.admin, icon: Settings },
  ];
  return (
    <>
      {/* Desktop: top bar */}
      <header className="sticky top-0 z-20 hidden border-b border-border bg-bg/85 backdrop-blur md:block">
        <div className="mx-auto flex max-w-4xl items-center gap-1 px-4">
          <Link href="/" className="font-display mr-4 py-3 text-lg">
            PMP Trainer
          </Link>
          {items.map(({ href, label, icon: Icon }) => {
            const active = href === "/" ? path === "/" : path.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-3 py-2 text-sm transition-colors",
                  active ? "bg-accent-soft text-accent-soft-fg font-medium" : "text-fg-muted hover:text-fg",
                )}
              >
                <Icon size={16} aria-hidden />
                {label}
              </Link>
            );
          })}
          <div className="ml-auto">
            <ThemeToggle />
          </div>
        </div>
      </header>
      {/* Phone: bottom tabs */}
      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-surface/95 backdrop-blur md:hidden" aria-label="Main">
        <ul className="flex justify-around px-1 pb-[env(safe-area-inset-bottom)]">
          {items.map(({ href, label, icon: Icon }) => {
            const active = href === "/" ? path === "/" : path.startsWith(href);
            return (
              <li key={href} className="min-w-0 flex-1">
                <Link
                  href={href}
                  className={cn("flex flex-col items-center gap-0.5 py-2 text-[10px] leading-none", active ? "text-accent font-semibold" : "text-fg-muted")}
                >
                  <Icon size={20} aria-hidden />
                  <span className="truncate">{label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}
