"use client";

import { useCallback, useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { CheckCircle2, Loader2, X, XCircle } from "lucide-react";

export async function api<T = unknown>(url: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const { json, ...rest } = init ?? {};
  const res = await fetch(url, {
    ...rest,
    headers: json !== undefined ? { "Content-Type": "application/json", ...(rest.headers ?? {}) } : rest.headers,
    body: json !== undefined ? JSON.stringify(json) : rest.body,
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? "خطا در ارتباط با سرور");
  return data as T;
}

export function PageHeader({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3 fade-up">
      <div>
        <h1 className="text-2xl font-extrabold text-slate-900 lg:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`glass rounded-3xl p-5 fade-up ${className}`}>{children}</div>;
}

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "soft" | "ghost" | "danger";
  loading?: boolean;
  size?: "sm" | "md" | "lg";
};

export function Btn({ variant = "primary", loading, size = "md", className = "", children, disabled, ...rest }: BtnProps) {
  const v = {
    primary: "bg-brand-600 text-white shadow-lg shadow-brand-600/25 hover:bg-brand-700",
    soft: "bg-brand-50 text-brand-700 hover:bg-brand-100 border border-brand-200",
    ghost: "bg-white text-slate-700 hover:bg-slate-50 border border-slate-200",
    danger: "bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200",
  }[variant];
  const s = { sm: "px-3 py-1.5 text-xs", md: "px-4 py-2.5 text-sm", lg: "px-6 py-3.5 text-base" }[size];
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center gap-2 rounded-xl font-bold transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 ${v} ${s} ${className}`}
    >
      {loading && <Loader2 size={16} className="animate-spin" />}
      {children}
    </button>
  );
}

export function Badge({ children, tone = "slate" }: { children: ReactNode; tone?: "slate" | "brand" | "green" | "amber" | "rose" | "blue" }) {
  const t = {
    slate: "bg-slate-100 text-slate-600",
    brand: "bg-brand-100 text-brand-700",
    green: "bg-emerald-100 text-emerald-700",
    amber: "bg-amber-100 text-amber-700",
    rose: "bg-rose-100 text-rose-700",
    blue: "bg-sky-100 text-sky-700",
  }[tone];
  return <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11px] font-bold ${t}`}>{children}</span>;
}

export const inputCls =
  "w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm outline-none transition placeholder:text-slate-400 focus:border-brand-400 focus:ring-4 focus:ring-brand-100";

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-bold text-slate-600">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-slate-400">{hint}</span>}
    </label>
  );
}

export function Stat({ label, value, icon, tone = "brand" }: { label: string; value: ReactNode; icon: ReactNode; tone?: "brand" | "amber" | "green" | "blue" }) {
  const t = {
    brand: "from-brand-500 to-brand-700",
    amber: "from-amber-400 to-orange-500",
    green: "from-emerald-400 to-emerald-600",
    blue: "from-sky-400 to-blue-600",
  }[tone];
  return (
    <div className="glass flex items-center gap-4 rounded-2xl p-4 fade-up">
      <div className={`grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br text-white shadow-md ${t}`}>{icon}</div>
      <div>
        <div className="text-2xl font-extrabold leading-none text-slate-900">{value}</div>
        <div className="mt-1 text-xs text-slate-500">{label}</div>
      </div>
    </div>
  );
}

export function Empty({ icon, title, text }: { icon: ReactNode; title: string; text?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-12 text-center text-slate-400">
      <div className="grid h-16 w-16 place-items-center rounded-full bg-slate-100">{icon}</div>
      <div className="font-bold text-slate-600">{title}</div>
      {text && <div className="max-w-sm text-sm">{text}</div>}
    </div>
  );
}

export function LogBox({ lines, running }: { lines: string[]; running?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [lines.length]);
  return (
    <div
      ref={ref}
      dir="rtl"
      className="scroll-thin max-h-56 overflow-auto rounded-2xl bg-slate-900 p-4 text-[12px] leading-6 text-slate-200"
    >
      {lines.length === 0 && <div className="text-slate-500">در انتظار شروع…</div>}
      {lines.map((l, i) => (
        <div key={i}>{l}</div>
      ))}
      {running && <Loader2 size={14} className="mt-1 animate-spin text-brand-300" />}
    </div>
  );
}

type Toast = { id: number; text: string; ok: boolean };

export function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((text: string, ok = true) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, text, ok }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4500);
  }, []);
  const node = (
    <div className="fixed bottom-5 left-5 z-50 flex max-w-sm flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`fade-up flex items-start gap-2 rounded-2xl px-4 py-3 text-sm font-medium text-white shadow-xl ${
            t.ok ? "bg-emerald-600" : "bg-rose-600"
          }`}
        >
          {t.ok ? <CheckCircle2 size={18} className="mt-0.5 shrink-0" /> : <XCircle size={18} className="mt-0.5 shrink-0" />}
          <span className="break-words">{t.text}</span>
        </div>
      ))}
    </div>
  );
  return { toast: push, toastNode: node };
}

export function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-slate-900/50 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="fade-up max-h-[90vh] w-full max-w-lg overflow-auto rounded-3xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-extrabold">{title}</h3>
          <button onClick={onClose} className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100">
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function timeAgo(d: string | Date) {
  return new Date(d).toLocaleString("fa-IR", { dateStyle: "short", timeStyle: "short" });
}
