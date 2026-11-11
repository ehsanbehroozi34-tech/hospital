"use client";

import { useCallback, useEffect, useState } from "react";
import { Building2, Download, Mailbox, Plus, Search, Trash2 } from "lucide-react";
import { useMode } from "@/components/ModeProvider";
import { Badge, Btn, Card, Empty, Field, Modal, PageHeader, api, inputCls, timeAgo, useToast } from "@/components/ui";

type Lead = {
  id: number;
  email: string;
  hospital: string;
  contactName: string;
  role: string;
  roleCategory: string;
  city: string;
  jobUrl: string;
  sourceName: string;
  foreignFriendly: boolean;
  exportedAt: string | null;
  manual: boolean;
  createdAt: string;
};

const CATS = [
  { v: "all", t: "همه دسته‌ها" },
  { v: "pflege", t: "مدیریت پرستاری" },
  { v: "op", t: "مدیر OP / بیهوشی" },
  { v: "hr", t: "جذب نیرو / HR" },
  { v: "general", t: "عمومی" },
];

export default function LeadsPage() {
  const { mode } = useMode();
  const { toast, toastNode } = useToast();
  const [rows, setRows] = useState<Lead[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [cat, setCat] = useState("all");
  const [foreign, setForeign] = useState(false);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ email: "", hospital: "", contactName: "", role: "", city: "", jobUrl: "" });

  const load = useCallback(async () => {
    const p = new URLSearchParams({ specialty: mode, q, status, cat, page: String(page) });
    if (foreign) p.set("foreign", "1");
    const r = await api<{ rows: Lead[]; total: number; pages: number }>(`/api/leads?${p}`);
    setRows(r.rows);
    setTotal(r.total);
    setPages(r.pages);
  }, [mode, q, status, cat, page, foreign]);

  useEffect(() => {
    const t = setTimeout(() => load().catch(() => {}), 250);
    return () => clearTimeout(t);
  }, [load]);

  useEffect(() => setPage(1), [mode, q, status, cat, foreign]);

  async function add() {
    try {
      await api("/api/leads", { method: "POST", json: { ...form, specialty: mode } });
      toast("مخاطب اضافه شد");
      setOpen(false);
      setForm({ email: "", hospital: "", contactName: "", role: "", city: "", jobUrl: "" });
      load();
    } catch (e) {
      toast((e as Error).message, false);
    }
  }

  async function remove(id: number) {
    if (!confirm("این ایمیل از لیست‌های آینده کنار گذاشته شود؟")) return;
    await api(`/api/leads/${id}`, { method: "DELETE" });
    load();
  }

  return (
    <div>
      {toastNode}
      <PageHeader
        title={`همه ایمیل‌های ${mode}`}
        subtitle={`${total} ایمیل یکتا در پایگاه‌داده — هر ایمیل فقط یک‌بار ثبت می‌شود`}
        actions={
          <>
            <Btn variant="soft" onClick={() => setOpen(true)}>
              <Plus size={16} /> افزودن دستی
            </Btn>
            <a href={`/api/leads/export?specialty=${mode}`}>
              <Btn>
                <Download size={16} /> اکسل همه
              </Btn>
            </a>
          </>
        }
      />

      <Card>
        <div className="mb-4 grid gap-3 md:grid-cols-[1fr_auto_auto_auto]">
          <div className="relative">
            <Search size={16} className="pointer-events-none absolute right-3 top-3.5 text-slate-400" />
            <input className={`${inputCls} pr-9`} placeholder="جستجو در ایمیل، بیمارستان، نام یا شهر…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <select className={inputCls} value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="all">همه وضعیت‌ها</option>
            <option value="new">استفاده‌نشده</option>
            <option value="used">در لیست روزانه آمده</option>
          </select>
          <select className={inputCls} value={cat} onChange={(e) => setCat(e.target.value)}>
            {CATS.map((c) => (
              <option key={c.v} value={c.v}>
                {c.t}
              </option>
            ))}
          </select>
          <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 text-sm font-medium">
            <input type="checkbox" checked={foreign} onChange={(e) => setForeign(e.target.checked)} className="accent-brand-600" />
            فقط پذیرای نیروی خارجی
          </label>
        </div>

        {rows.length === 0 ? (
          <Empty icon={<Mailbox size={28} />} title="ایمیلی پیدا نشد" text="از داشبورد جستجوی خودکار را اجرا کنید یا ایمیل را دستی اضافه کنید." />
        ) : (
          <div className="scroll-thin overflow-auto rounded-2xl border border-slate-100">
            <table className="w-full min-w-[900px] text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500">
                <tr>
                  {["بیمارستان", "ایمیل", "مسئول / سمت", "شهر", "منبع", "وضعیت", ""].map((h) => (
                    <th key={h} className="px-3 py-3 text-right font-bold">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.id} className="border-t border-slate-100 hover:bg-brand-50/50">
                    <td className="px-3 py-3 font-bold">
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
                      <div dir="auto">{c.contactName || "—"}</div>
                      <div className="text-xs text-slate-400" dir="auto">
                        {c.role}
                      </div>
                    </td>
                    <td className="px-3 py-3">{c.city || "—"}</td>
                    <td className="px-3 py-3 text-xs text-slate-500">{c.sourceName}</td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap gap-1">
                        {c.exportedAt ? <Badge>استفاده‌شده</Badge> : <Badge tone="green">جدید</Badge>}
                        {c.foreignFriendly && <Badge tone="brand">نیروی خارجی</Badge>}
                        {c.manual && <Badge tone="blue">دستی</Badge>}
                      </div>
                      <div className="mt-1 text-[10px] text-slate-400">{timeAgo(c.createdAt)}</div>
                    </td>
                    <td className="px-3 py-3">
                      {!c.exportedAt && (
                        <button onClick={() => remove(c.id)} className="rounded-lg p-1.5 text-slate-300 hover:bg-rose-50 hover:text-rose-600" title="کنار گذاشتن">
                          <Trash2 size={16} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {pages > 1 && (
          <div className="mt-4 flex items-center justify-center gap-3">
            <Btn size="sm" variant="ghost" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              قبلی
            </Btn>
            <span className="text-sm text-slate-500">
              صفحه {page} از {pages}
            </span>
            <Btn size="sm" variant="ghost" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
              بعدی
            </Btn>
          </div>
        )}
      </Card>

      <Modal open={open} onClose={() => setOpen(false)} title={`افزودن دستی ایمیل (${mode})`}>
        <div className="grid gap-3">
          <Field label="ایمیل *">
            <input dir="ltr" className={inputCls} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="pflegedirektion@klinikum.de" />
          </Field>
          <Field label="نام بیمارستان">
            <input className={inputCls} value={form.hospital} onChange={(e) => setForm({ ...form, hospital: e.target.value })} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="نام مسئول">
              <input className={inputCls} value={form.contactName} onChange={(e) => setForm({ ...form, contactName: e.target.value })} placeholder="Frau Dr. Müller" />
            </Field>
            <Field label="سمت">
              <input className={inputCls} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} placeholder="Pflegedirektorin" />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="شهر">
              <input className={inputCls} value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
            </Field>
            <Field label="لینک آگهی">
              <input dir="ltr" className={inputCls} value={form.jobUrl} onChange={(e) => setForm({ ...form, jobUrl: e.target.value })} />
            </Field>
          </div>
          <Btn onClick={add}>
            <Plus size={16} /> ذخیره
          </Btn>
        </div>
      </Modal>
    </div>
  );
}
