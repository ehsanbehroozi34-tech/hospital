"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { Globe2, LayoutDashboard, Mail, Send, Stethoscope, Syringe, Users } from "lucide-react";
import { MODE_INFO, useMode, type Mode } from "./ModeProvider";

const NAV = [
  { href: "/", label: "داشبورد و لیست روزانه", icon: LayoutDashboard },
  { href: "/leads", label: "همه ایمیل‌ها", icon: Mail },
  { href: "/clients", label: "کلاینت‌ها و متن ایمیل", icon: Users },
  { href: "/send", label: "ارسال خودکار", icon: Send },
  { href: "/sources", label: "منابع و سایت‌ها", icon: Globe2 },
];

function ModeSwitch() {
  const { mode, setMode } = useMode();
  const opt = (m: Mode, Icon: typeof Stethoscope) => {
    const active = mode === m;
    return (
      <button
        key={m}
        onClick={() => setMode(m)}
        className={`relative flex flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-bold transition-all ${
          active ? "bg-white text-brand-700 shadow-md" : "text-white/80 hover:bg-white/10"
        }`}
        aria-pressed={active}
      >
        <Icon size={17} />
        {m}
      </button>
    );
  };
  return (
    <div>
      <div className="mb-2 text-xs font-medium text-white/70">رشته فعال</div>
      <div className="flex gap-1 rounded-2xl bg-black/20 p-1">
        {opt("OTA", Stethoscope)}
        {opt("ATA", Syringe)}
      </div>
      <div className="mt-2 text-[11px] leading-5 text-white/70">{MODE_INFO[mode].desc}</div>
    </div>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const { mode } = useMode();

  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);

  return (
    <div className="mx-auto flex min-h-screen max-w-[1500px] flex-col gap-5 p-3 lg:flex-row lg:p-5">
      <aside className="lg:sticky lg:top-5 lg:h-[calc(100vh-2.5rem)] lg:w-72 lg:shrink-0">
        <div className="flex h-full flex-col gap-6 overflow-auto rounded-3xl bg-gradient-to-b from-brand-700 via-brand-800 to-brand-900 p-5 text-white shadow-xl transition-colors duration-500">
          <div className="flex items-center gap-3">
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-white/15 backdrop-blur">
              <Mail size={24} />
            </div>
            <div>
              <div className="text-lg font-extrabold leading-tight">کلینیک‌یاب</div>
              <div className="text-xs text-white/70">Klinik Finder · آلمان</div>
            </div>
          </div>

          <ModeSwitch />

          <nav className="flex flex-col gap-1">
            {NAV.map((n) => {
              const active = n.href === "/" ? path === "/" : path.startsWith(n.href);
              const Icon = n.icon;
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                    active ? "bg-white/20 shadow-inner" : "text-white/80 hover:bg-white/10"
                  }`}
                >
                  <Icon size={18} />
                  {n.label}
                </Link>
              );
            })}
          </nav>

          <div className="mt-auto rounded-2xl bg-white/10 p-3 text-[11px] leading-5 text-white/80">
            حالت فعلی: <b className="text-white">{mode}</b>
            <br />
            هر ایمیل فقط یک‌بار در لیست‌های روزانه ظاهر می‌شود و هرگز تکرار نمی‌شود.
          </div>
        </div>
      </aside>
      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
