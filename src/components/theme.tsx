"use client";

import { useEffect, useState } from "react";
import { Moon, Sun, Monitor } from "lucide-react";
import { cn } from "@/lib/utils";

export type ThemePref = "light" | "dark" | "system";
const KEY = "pmp-theme";

/** Inline in <head> to avoid a flash: applies the stored preference before paint. */
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem("${KEY}");if(t==="light"||t==="dark"){document.documentElement.setAttribute("data-theme",t)}}catch(e){}})();`;

export function applyTheme(pref: ThemePref) {
  const root = document.documentElement;
  if (pref === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", pref);
  try {
    localStorage.setItem(KEY, pref);
  } catch {
    /* private mode */
  }
}

export function useThemePref(): [ThemePref, (p: ThemePref) => void] {
  const [pref, setPref] = useState<ThemePref>("system");
  useEffect(() => {
    try {
      const t = localStorage.getItem(KEY) as ThemePref | null;
      if (t === "light" || t === "dark") setPref(t);
    } catch {
      /* ignore */
    }
  }, []);
  return [
    pref,
    (p) => {
      setPref(p);
      applyTheme(p);
    },
  ];
}

export function ThemeToggle({ className }: { className?: string }) {
  const [pref, set] = useThemePref();
  const opts: Array<[ThemePref, typeof Sun, string]> = [
    ["light", Sun, "Light"],
    ["system", Monitor, "System"],
    ["dark", Moon, "Dark"],
  ];
  return (
    <div role="radiogroup" aria-label="Theme" className={cn("inline-flex rounded-md border border-border bg-bg-sunken p-0.5", className)}>
      {opts.map(([v, Icon, label]) => (
        <button
          key={v}
          role="radio"
          aria-checked={pref === v}
          aria-label={label}
          onClick={() => set(v)}
          className={cn("rounded-sm p-1.5 text-fg-muted", pref === v && "bg-surface text-fg shadow-sm")}
        >
          <Icon size={16} />
        </button>
      ))}
    </div>
  );
}
