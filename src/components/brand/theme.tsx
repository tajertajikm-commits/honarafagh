"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";

type Theme = "light" | "dark" | "system";
const KEY = "ha-theme";

/** Inline script run before paint so the correct theme is applied without a flash. */
export const themeInitScript = `(function(){try{var t=localStorage.getItem("${KEY}")||"light";var d=t==="dark"||(t==="system"&&matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.dataset.theme=d?"dark":"light";}catch(e){}})();`;

function apply(t: Theme) {
  const dark = t === "dark" || (t === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
}

export function ThemeSwitch({ className }: { className?: string }) {
  const [theme, setTheme] = useState<Theme>("light");
  useEffect(() => {
    try {
      setTheme((localStorage.getItem(KEY) as Theme) || "light");
    } catch {
      /* storage unavailable */
    }
  }, []);
  const choose = (t: Theme) => {
    setTheme(t);
    try {
      localStorage.setItem(KEY, t);
    } catch {
      /* ignore */
    }
    apply(t);
  };
  const opts: { t: Theme; icon: typeof Sun; label: string }[] = [
    { t: "light", icon: Sun, label: "روشن" },
    { t: "dark", icon: Moon, label: "تیره" },
    { t: "system", icon: Monitor, label: "سیستم" },
  ];
  return (
    <div className={cn("inline-flex rounded-md bg-surface-2 p-0.5", className)} role="radiogroup" aria-label="حالت نمایش">
      {opts.map(({ t, icon: Icon, label }) => (
        <button
          key={t}
          role="radio"
          aria-checked={theme === t}
          title={label}
          onClick={() => choose(t)}
          className={cn("grid size-7 place-items-center rounded-[6px] text-muted transition-colors", theme === t && "bg-surface text-ink shadow-soft")}
        >
          <Icon className="size-3.5" />
        </button>
      ))}
    </div>
  );
}
