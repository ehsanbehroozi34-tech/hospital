"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  Building2,
  CalendarCheck2,
  Download,
  FileSpreadsheet,
  Globe2,
  History,
  Mailbox,
  Plus,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  UserRoundCheck,
} from "lucide-react";
import { useMode } from "@/components/ModeProvider";
import { Badge, Btn, Card, Empty, LogBox, PageHeader, Stat, api, timeAgo, useToast } from "@/components/ui";
import { useDiscover } from "@/components/useDiscover";

type Batch = { id: number; specialty: string; day: string; count: number; createdAt: string };
type Contact = {
  id: number;
  email: string;
  hospital: string;
  contactName: string;
  role: string;
  roleCategory: string;
  phone: string;
  city: string;
  jobTitle: string;
  jobUrl: string;
  foreignFriendly: boolean;
};
type Stats = {
  total: number;
  available: number;
  exported: number;
  pflege: number;
  foreign: number;
  clients: number;
  sentToday: number;
  sentTotal: number;
  todayBatches: Batch[];
};

const CAT: Record<string, { t: string; tone: "green" | "blue" | "amber" | "slate" }> = {
  pflege: { t: "مدیریت پرستاری", tone: "green" },
  op: { t: "مدیر OP / بیهوشی", tone: "blue" },
  hr: { t: "جذب نیرو / HR", tone: "amber" },
  general: { t: "عمومی", tone: "slate" },
};

export default function Dashboard() {
  const { mode } = useMode();
  const { toast, toastNode } = useToast();
  const [stats, setStats] = useState<Stats | null>(null);
  const [history, setHistory] = useState<Batch[]>([]);
  const [rows, setRows] = useState<Contact[]>([]);
  const [activeBatch, setActiveBatch] = useState<Batch | null>(null);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<{ extra: boolean } | null>(null);

  const load = useCallback(async () => {
    const [s, b] = await Promise.all([
      api<Stats>(`/api/stats?specialty=${mode}`),
      api<{ today: Batch[]; history: Batch[] }>(`/api/batch?specialty=${mode}`),
    ]);
    setStats(s);
    setHistory(b.history);
    const latest = b.today[0] ?? null;
    setActiveBatch((cur) => (cur && b.history.some((h) => h.id === cur.id) ? cur : latest));
  }, [mode]);

  const finishBatch = useCallback(
    async (extra: boolean) => {
      try {
        const r = await api<{ status: string; batchId?: number; count?: number }>("/api/batch", {
          method: "POST",
          json: { specialty: mode, extra, allowPartial: true },
        });
        if (r.status === "empty") toast("متأسفانه ایمیل جدیدی پیدا نشد. منابع جدید اضافه کنید یا بعداً دوباره تلاش کنید.", false);
        else if (r.status === "created") toast(`لیست امروز با ${r.count} ایمیل جدید آماده شد 🎉`);
        await load();
        if (r.batchId) setActiveBatch(null);
      } catch (e) {
        toast((e as Error).message, false);
      } finally {
        setBusy(false);
        setPending(null);
      }
    },
    [load, mode, toast],
  );

  const disc = useDiscover(() => {
    load();
    if (pending) finishBatch(pending.extra);
  });

  useEffect(() => {
    load().catch(() => {});
  }, [load]);

  useEffect(() => {
    if (!activeBatch) {
      api<{ today: Batch[] }>(`/api/batch?specialty=${mode}`).then((b) => b.today[0] && setActiveBatch(b.today[0]));
      setRows([]);
      return;
    }
    api<{ contacts: Contact[] }>(`/api/batch/${activeBatch.id}`)
      .then((r) => setRows(r.contacts))
      .catch(() => {});
  }, [activeBatch, mode]);

  async function createList(extra: boolean) {
    setBusy(true);
    try {
      const r = await api<{ status: string; batchId?: number; count?: number }>("/api/batch", {
        method: "POST",
        json: { specialty: mode, extra },
      });
      if (r.status === "discovering") {
        setPending({ extra });
        disc.watch();
        toast("موجودی کافی نیست؛ جستجوی خودکار ایمیل‌های جدید شروع شد…");
        return;
      }
      if (r.status === "existing") toast("لیست امروز قبلاً ساخته شده است. برای ایمیل بیشتر از «۲۰ ایمیل دیگر» استفاده کنید.");
      else toast(`لیست امروز با ${r.count} ایمیل جدید ساخته شد 🎉`);
      await load();
      setActiveBatch(null);
      setBusy(false);
    } catch (e) {
      toast((e as Error).message, false);
      setBusy(false);
    }
  }

  const running = !!disc.state?.running;
  const todayBatch = stats?.todayBatches?.[0];

  return (
    <div>
      {toastNode}
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            لیست روزانه
            <span className="rounded-2xl bg-brand-600 px-3 py-1 text-xl text-white shadow-lg shadow-brand-600/30">{mode}</span>
          </span>
        }
        subtitle={`امروز ${new Date().toLocaleDateString("fa-IR", { dateStyle: "full" })} — هر روز ۲۰ ایمیل جدید و غیرتکراری`}
      />

      <div className="mb-5 grid grid-cols-2 gap-3 xl:grid-cols-5">
        <Stat label="کل ایمیل‌های پیدا شده" value={stats?.total ?? "…"} icon={<Mailbox size={22} />} />
        <Stat label="موجودی استفاده‌نشده" value={stats?.available ?? "…"} icon={<Sparkles size={22} />} tone="green" />
        <Stat label="مدیران پرستاری" value={stats?.pflege ?? "…"} icon={<UserRoundCheck size={22} />} tone="blue" />
        <Stat label="بیمارستان‌های پذیرای نیروی خارجی" value={stats?.foreign ?? "…"} icon={<Globe2 size={22} />} tone="amber" />
        <Stat label="ایمیل ارسال‌شده امروز" value={stats?.sentToday ?? "…"} icon={<Send size={22} />} tone="green" />
      </div>

      <Card className="mb-5 overflow-hidden">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-4">
            <div className={`grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-brand-100 text-brand-700 ${running ? "pulse-ring" : ""}`}>
              <CalendarCheck2 size={28} />
            </div>
            <div>
              <h2 className="text-lg font-extrabold">
                {todayBatch ? `لیست امروز آماده است (${todayBatch.count} ایمیل)` : "لیست امروز هنوز ساخته نشده"}
              </h2>
              <p className="mt-1 max-w-xl text-sm leading-6 text-slate-500">
                با یک کلیک، برنامه سایت‌های کاریابی و وب‌سایت بیمارستان‌ها را می‌گردد، ایمیل مدیران پرستاری و جذب نیرو را پیدا می‌کند و
                ۲۰ ایمیل جدید را آماده‌ی دانلود اکسل می‌کند. ایمیل‌های قبلی هرگز تکرار نمی‌شوند.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {!todayBatch ? (
              <Btn size="lg" onClick={() => createList(false)} loading={busy || running}>
                <Search size={18} /> پیدا کن و لیست امروز را بساز
              </Btn>
            ) : (
              <>
                <a href={`/api/batch/${todayBatch.id}/export`}>
                  <Btn size="lg">
                    <Download size={18} /> دانلود اکسل امروز
                  </Btn>
                </a>
                <Link href={`/send?batch=${todayBatch.id}`}>
                  <Btn size="lg" variant="soft">
                    <Send size={18} /> ارسال برای کلاینت
                  </Btn>
                </Link>
                <Btn size="lg" variant="ghost" onClick={() => createList(true)} loading={busy || running}>
                  <Plus size={18} /> ۲۰ ایمیل دیگر
                </Btn>
              </>
            )}
            <Btn size="lg" variant="ghost" onClick={() => disc.start(mode).then(() => toast("جستجو شروع شد")).catch((e) => toast(e.message, false))} disabled={running}>
              <Globe2 size={18} /> فقط جستجوی ایمیل جدید
            </Btn>
          </div>
        </div>

        {(running || (disc.state && disc.state.logs.length > 0)) && (
          <div className="mt-5">
            <div className="mb-2 flex items-center justify-between text-xs text-slate-500">
              <span className="font-bold">
                {running ? `در حال جستجو برای ${disc.state?.specialty}… (ممکن است چند دقیقه طول بکشد)` : "گزارش آخرین جستجو"}
              </span>
              <span>
                {disc.state?.pages ?? 0} صفحه بررسی شد · {disc.state?.added ?? 0} ایمیل جدید
              </span>
            </div>
            <LogBox lines={disc.state?.logs ?? []} running={running} />
          </div>
        )}
      </Card>

      <Card className="mb-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-lg font-extrabold">
            <FileSpreadsheet size={20} className="text-brand-600" />
            {activeBatch ? `دسته #${activeBatch.id} — ${activeBatch.day}` : "ایمیل‌های لیست"}
          </h2>
          {activeBatch && (
            <a href={`/api/batch/${activeBatch.id}/export`}>
              <Btn size="sm" variant="soft">
                <Download size={15} /> اکسل این دسته
              </Btn>
            </a>
          )}
        </div>
        {rows.length === 0 ? (
          <Empty icon={<Mailbox size={28} />} title="هنوز لیستی ساخته نشده" text="روی دکمه‌ی «پیدا کن و لیست امروز را بساز» بزنید." />
        ) : (
          <div className="scroll-thin overflow-auto rounded-2xl border border-slate-100">
            <table className="w-full min-w-[820px] text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500">
                <tr>
                  {["#", "بیمارستان", "ایمیل", "مسئول / سمت", "شهر", "ویژگی"].map((h) => (
                    <th key={h} className="px-3 py-3 text-right font-bold">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((c, i) => (
                  <tr key={c.id} className="border-t border-slate-100 hover:bg-brand-50/50">
                    <td className="px-3 py-3 text-slate-400">{i + 1}</td>
                    <td className="px-3 py-3 font-bold text-slate-800">
                      <div className="flex items-center gap-2">
                        <Building2 size={15} className="shrink-0 text-brand-500" />
                        {c.jobUrl ? (
                          <a href={c.jobUrl} target="_blank" rel="noreferrer" className="hover:underline">
                            {c.hospital || "—"}
                          </a>
                        ) : (
                          c.hospital || "—"
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-3 font-mono text-[13px]" dir="ltr">
                      {c.email}
                    </td>
                    <td className="px-3 py-3">
                      <div className="text-slate-700" dir="auto">
                        {c.contactName || "—"}
                      </div>
                      <div className="text-xs text-slate-400" dir="auto">
                        {c.role}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-slate-600">{c.city || "—"}</td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap gap-1">
                        <Badge tone={CAT[c.roleCategory]?.tone}>{CAT[c.roleCategory]?.t}</Badge>
                        {c.foreignFriendly && <Badge tone="brand">نیروی خارجی ✓</Badge>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card>
        <h2 className="mb-4 flex items-center gap-2 text-lg font-extrabold">
          <History size={20} className="text-brand-600" /> تاریخچه‌ی لیست‌ها
          <Badge tone="green">
            <ShieldCheck size={12} /> بدون تکرار
          </Badge>
        </h2>
        {history.length === 0 ? (
          <div className="py-6 text-center text-sm text-slate-400">هنوز تاریخچه‌ای وجود ندارد.</div>
        ) : (
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {history.map((h) => (
              <div
                key={h.id}
                className={`flex items-center justify-between rounded-2xl border p-3 transition ${
                  activeBatch?.id === h.id ? "border-brand-300 bg-brand-50" : "border-slate-100 bg-white"
                }`}
              >
                <button onClick={() => setActiveBatch(h)} className="text-right">
                  <div className="font-bold">
                    دسته #{h.id} · {h.count} ایمیل
                  </div>
                  <div className="text-xs text-slate-400">{timeAgo(h.createdAt)}</div>
                </button>
                <a href={`/api/batch/${h.id}/export`} className="rounded-xl bg-brand-100 p-2 text-brand-700 hover:bg-brand-200" title="دانلود اکسل">
                  <Download size={16} />
                </a>
              </div>
            ))}
          </div>
        )}
        <div className="mt-4 text-left">
          <a href={`/api/leads/export?specialty=${mode}`} className="text-sm font-bold text-brand-700 hover:underline">
            دانلود اکسل همه‌ی ایمیل‌های {mode} ↓
          </a>
        </div>
      </Card>
    </div>
  );
}
