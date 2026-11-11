"use client";

import { useCallback, useEffect, useState } from "react";
import { ExternalLink, Globe2, Link2, Play, Plus, Trash2 } from "lucide-react";
import { useMode } from "@/components/ModeProvider";
import { Badge, Btn, Card, Field, LogBox, PageHeader, api, inputCls, timeAgo, useToast } from "@/components/ui";
import { useDiscover } from "@/components/useDiscover";

type Source = {
  id: number;
  name: string;
  url: string;
  kind: string;
  enabled: boolean;
  lastRunAt: string | null;
  lastFound: number;
};

export default function SourcesPage() {
  const { mode } = useMode();
  const { toast, toastNode } = useToast();
  const [list, setList] = useState<Source[]>([]);
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [adding, setAdding] = useState(false);
  const load = useCallback(() => api<Source[]>("/api/sources").then(setList).catch(() => {}), []);
  const disc = useDiscover(() => load());

  useEffect(() => {
    load();
  }, [load]);

  async function add() {
    setAdding(true);
    try {
      await api("/api/sources", { method: "POST", json: { url, name } });
      setUrl("");
      setName("");
      toast("منبع جدید اضافه شد و در جستجوی بعدی استفاده می‌شود");
      load();
    } catch (e) {
      toast((e as Error).message, false);
    } finally {
      setAdding(false);
    }
  }

  const running = !!disc.state?.running;

  return (
    <div>
      {toastNode}
      <PageHeader
        title="منابع و سایت‌های کاریابی"
        subtitle="سایت‌های پیش‌فرض و سایت‌هایی که خودتان اضافه می‌کنید. برنامه هر بار همه‌ی منابع فعال را می‌گردد."
        actions={
          <Btn onClick={() => disc.start(mode).then(() => toast("جستجو شروع شد")).catch((e) => toast(e.message, false))} loading={running}>
            <Play size={16} /> اجرای جستجو برای {mode}
          </Btn>
        }
      />

      <Card className="mb-5">
        <h2 className="mb-1 flex items-center gap-2 text-lg font-extrabold">
          <Link2 size={20} className="text-brand-600" /> افزودن سایت مرجع / کاریابی جدید
        </h2>
        <p className="mb-4 text-sm text-slate-500">
          آدرس صفحه‌ی لیست آگهی‌ها (مثلاً نتیجه‌ی جستجوی «OTA» در یک سایت) یا صفحه‌ی کاریابی خود بیمارستان را وارد کنید.
        </p>
        <div className="grid gap-3 md:grid-cols-[2fr_1fr_auto]">
          <Field label="آدرس سایت (URL)">
            <input dir="ltr" className={inputCls} placeholder="https://www.example-klinikum.de/karriere/stellenangebote" value={url} onChange={(e) => setUrl(e.target.value)} />
          </Field>
          <Field label="نام (اختیاری)">
            <input className={inputCls} placeholder="مثلاً کلینیکوم نمونه" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <div className="flex items-end">
            <Btn onClick={add} loading={adding} disabled={!url.trim()} className="w-full">
              <Plus size={16} /> افزودن
            </Btn>
          </div>
        </div>
      </Card>

      {(running || (disc.state && disc.state.logs.length > 0)) && (
        <Card className="mb-5">
          <div className="mb-2 flex justify-between text-xs text-slate-500">
            <b>{running ? "در حال جستجو…" : "گزارش آخرین جستجو"}</b>
            <span>
              {disc.state?.pages ?? 0} صفحه · {disc.state?.added ?? 0} ایمیل جدید
            </span>
          </div>
          <LogBox lines={disc.state?.logs ?? []} running={running} />
        </Card>
      )}

      <Card>
        <h2 className="mb-4 flex items-center gap-2 text-lg font-extrabold">
          <Globe2 size={20} className="text-brand-600" /> منابع ثبت‌شده ({list.length})
        </h2>
        <div className="grid gap-2">
          {list.map((s) => (
            <div key={s.id} className={`flex flex-wrap items-center gap-3 rounded-2xl border p-3 transition ${s.enabled ? "border-slate-100 bg-white" : "border-dashed bg-slate-50 opacity-60"}`}>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-bold">{s.name}</span>
                  <Badge tone={s.kind === "default" ? "slate" : "brand"}>{s.kind === "default" ? "پیش‌فرض" : "افزوده‌شده توسط شما"}</Badge>
                  {s.lastRunAt && <span className="text-[11px] text-slate-400">آخرین اجرا: {timeAgo(s.lastRunAt)}</span>}
                </div>
                <a href={s.url} target="_blank" rel="noreferrer" dir="ltr" className="mt-0.5 flex items-center gap-1 truncate text-left text-xs text-slate-400 hover:text-brand-600">
                  <ExternalLink size={12} /> {s.url}
                </a>
              </div>
              <label className="flex cursor-pointer items-center gap-2 text-xs font-bold text-slate-600">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-brand-600"
                  checked={s.enabled}
                  onChange={async (e) => {
                    await api(`/api/sources/${s.id}`, { method: "PATCH", json: { enabled: e.target.checked } });
                    load();
                  }}
                />
                فعال
              </label>
              <button
                onClick={async () => {
                  if (!confirm("این منبع حذف شود؟")) return;
                  await api(`/api/sources/${s.id}`, { method: "DELETE" });
                  load();
                }}
                className="rounded-lg p-2 text-slate-300 hover:bg-rose-50 hover:text-rose-600"
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
