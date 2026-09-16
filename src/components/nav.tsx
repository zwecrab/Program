"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, Layers, BarChart3, ListChecks, Settings, Sun } from "lucide-react";
import { cn } from "@/lib/utils";

const items = [
  { href: "/", label: "Today", icon: Sun },
  { href: "/plan", label: "Plan", icon: CalendarDays },
  { href: "/practice", label: "Practice", icon: ListChecks },
  { href: "/flashcards", label: "Cards", icon: Layers },
  { href: "/analytics", label: "Stats", icon: BarChart3 },
  { href: "/admin", label: "Admin", icon: Settings },
];

export function Nav() {
  const path = usePathname();
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-card/95 backdrop-blur md:static md:border-t-0 md:border-b"
      aria-label="Main"
    >
      <ul className="mx-auto flex max-w-3xl justify-around md:justify-start md:gap-2 md:px-4">
        {items.map(({ href, label, icon: Icon }) => {
          const active = href === "/" ? path === "/" : path.startsWith(href);
          return (
            <li key={href}>
              <Link
                href={href}
                className={cn(
                  "flex flex-col items-center gap-0.5 px-3 py-2 text-[11px] md:flex-row md:gap-2 md:py-3 md:text-sm",
                  active ? "text-primary font-semibold" : "text-muted",
                )}
              >
                <Icon size={20} aria-hidden />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
