"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, History, Paperclip, Rocket, Send, ShieldAlert, XCircle } from "lucide-react";
import { useMode } from "@/components/ModeProvider";
import { Badge, Btn, Card, Empty, LogBox, PageHeader, api, inputCls, timeAgo, useToast } from "@/components/ui";

type Client = {
  id: number;
  name: string;
  fromEmail: string;
  smtpHost: string;
  hasPass: boolean;
  subject: string;
  body: string;
  attachments: { id: number; filename: string }[];
};
type Batch = { id: number; day: string; count: number; createdAt: string };
type Contact = { id: number; email: string; hospital: string; contactName: string; role: string };
type SendState = { running: boolean; total: number; done: number; sent: number; failed: number; skipped: number; logs: string[] } | null;
type Hist = { id: number; email: string; status: string; error: string; sentAt: string; hospital: string | null };

export default function SendPage() {
  const { mode } = useMode();
  const { toast, toastNode } = useToast();
  const [clients, setClients] = useState<Client[]>([]);
  const [clientId, setClientId] = useState<number | null>(null);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [batchId, setBatchId] = useState<number | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [state, setState] = useState<SendState>(null);
  const [history, setHistory] = useState<Hist[]>([]);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    const want = Number(new URLSearchParams(window.location.search).get("batch")) || null;
    Promise.all([api<Client[]>(`/api/clients?specialty=${mode}`), api<{ history: Batch[]; today: Batch[] }>(`/api/batch?specialty=${mode}`)]).then(
      ([c, b]) => {
        setClients(c);
        setClientId((cur) => (cur && c.some((x) => x.id === cur) ? cur : (c[0]?.id ?? null)));
        setBatches(b.history);
        setBatchId((cur) => (cur && b.history.some((x) => x.id === cur) ? cur : (want && b.history.some((x) => x.id === want) ? want : (b.today[0]?.id ?? b.history[0]?.id ?? null))));
      },
    );
  }, [mode]);

  useEffect(() => {
    if (!batchId) {
      setContacts([]);
      return;
    }
    api<{ contacts: Contact[] }>(`/api/batch/${batchId}`).then((r) => setContacts(r.contacts));
  }, [batchId]);

  const refresh = useCallback(async () => {
    if (!clientId) return;
    const r = await api<{ state: SendState; history: Hist[] }>(`/api/send?clientId=${clientId}`);
    setState(r.state);
    setHistory(r.history);
  }, [clientId]);

  useEffect(() => {
    refresh().catch(() => {});
    const t = setInterval(() => refresh().catch(() => {}), state?.running ? 1500 : 6000);
    return () => clearInterval(t);
  }, [refresh, state?.running]);

  const sentSet = useMemo(() => new Set(history.filter((h) => h.status === "sent").map((h) => h.email)), [history]);

  useEffect(() => {
    setSelected(new Set(contacts.filter((c) => !sentSet.has(c.email)).map((c) => c.id)));
    // only re-evaluate when contacts or client change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contacts, clientId]);

  const client = clients.find((c) => c.id === clientId);
  const ready = !!client && !!client.smtpHost && client.hasPass && !!client.subject.trim() && !!client.body.trim();
  const running = !!state?.running;

  async function start() {
    if (!client) return;
    setStarting(true);
    try {
      const r = await api<{ started: boolean }>("/api/send", { method: "POST", json: { clientId: client.id, contactIds: [...selected] } });
      toast(r.started ? "ارسال شروع شد" : "یک ارسال دیگر برای این کلاینت در حال اجراست", r.started);
      refresh();
    } catch (e) {
      toast((e as Error).message, false);
    } finally {
      setStarting(false);
    }
  }

  const pct = state && state.total ? Math.round((state.done / state.total) * 100) : 0;

  return (
    <div>
      {toastNode}
      <PageHeader title={`ارسال خودکار ایمیل (${mode})`} subtitle="ایمیل‌ها با متن و پیوست‌های کلاینت و از آدرس ایمیل خود او ارسال می‌شوند. ارسال تکراری به یک بیمارستان برای یک کلاینت غیرممکن است." />

      {clients.length === 0 ? (
        <Card>
          <Empty icon={<Send size={28} />} title={`هنوز کلاینتی برای ${mode} ندارید`} text="ابتدا از بخش «کلاینت‌ها» یک کلاینت بسازید و ایمیل و متن او را وارد کنید." />
        </Card>
      ) : (
        <div className="grid gap-5 xl:grid-cols-[1fr_380px]">
          <div className="grid gap-5">
            <Card>
              <div className="grid gap-3 md:grid-cols-2">
                <label className="block">
                  <span className="mb-1.5 block text-xs font-bold text-slate-600">۱) کلاینت (فرستنده)</span>
                  <select className={inputCls} value={clientId ?? ""} onChange={(e) => setClientId(Number(e.target.value))}>
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} — {c.fromEmail}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-xs font-bold text-slate-600">۲) لیست گیرندگان</span>
                  <select className={inputCls} value={batchId ?? ""} onChange={(e) => setBatchId(Number(e.target.value))}>
                    {batches.length === 0 && <option value="">لیستی وجود ندارد</option>}
                    {batches.map((b) => (
                      <option key={b.id} value={b.id}>
                        دسته #{b.id} — {b.day} ({b.count} ایمیل)
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {client && (
                <div className="mt-4 rounded-2xl bg-slate-50 p-4 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <b dir="ltr">{client.subject || "— بدون موضوع —"}</b>
                    <Badge tone="blue">
                      <Paperclip size={11} /> {client.attachments.length} پیوست
                    </Badge>
                    {ready ? <Badge tone="green">آماده ارسال</Badge> : <Badge tone="amber">تنظیمات ناقص</Badge>}
                  </div>
                  {client.attachments.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5 text-xs text-slate-500" dir="ltr">
                      {client.attachments.map((a) => (
                        <span key={a.id} className="rounded-lg bg-white px-2 py-1">
                          📎 {a.filename}
                        </span>
                      ))}
                    </div>
                  )}
                  {!ready && (
                    <div className="mt-3 flex items-start gap-2 text-xs text-amber-700">
                      <ShieldAlert size={15} className="mt-0.5" /> تنظیمات SMTP، موضوع یا متن ایمیل این کلاینت کامل نیست. از بخش «کلاینت‌ها» کامل کنید.
                    </div>
                  )}
                </div>
              )}
            </Card>

            <Card>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-extrabold">۳) انتخاب گیرندگان ({selected.size} از {contacts.length})</h2>
                <div className="flex gap-2">
                  <Btn size="sm" variant="ghost" onClick={() => setSelected(new Set(contacts.filter((c) => !sentSet.has(c.email)).map((c) => c.id)))}>
                    انتخاب همه‌ی ارسال‌نشده‌ها
                  </Btn>
                  <Btn size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
                    هیچ‌کدام
                  </Btn>
                </div>
              </div>
              {contacts.length === 0 ? (
                <Empty icon={<Send size={28} />} title="لیست خالی است" text="ابتدا از داشبورد لیست روزانه را بسازید." />
              ) : (
                <div className="scroll-thin grid max-h-[420px] gap-1.5 overflow-auto">
                  {contacts.map((c) => {
                    const done = sentSet.has(c.email);
                    return (
                      <label key={c.id} className={`flex cursor-pointer items-center gap-3 rounded-xl border p-2.5 transition ${selected.has(c.id) ? "border-brand-200 bg-brand-50/60" : "border-slate-100 bg-white"} ${done ? "opacity-60" : ""}`}>
                        <input
                          type="checkbox"
                          className="h-4 w-4 accent-brand-600"
                          checked={selected.has(c.id)}
                          onChange={(e) => {
                            const n = new Set(selected);
                            if (e.target.checked) n.add(c.id);
                            else n.delete(c.id);
                            setSelected(n);
                          }}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-bold">{c.hospital || "—"}</div>
                          <div className="truncate text-xs text-slate-500" dir="ltr">
                            {c.email}
                          </div>
                        </div>
                        {done && <Badge tone="green">قبلاً ارسال شده</Badge>}
                      </label>
                    );
                  })}
                </div>
              )}
              <div className="mt-4">
                <Btn size="lg" onClick={start} loading={starting || running} disabled={!ready || selected.size === 0} className="w-full">
                  <Rocket size={18} /> ارسال {selected.size} ایمیل برای {client?.name}
                </Btn>
                <p className="mt-2 text-center text-[11px] text-slate-400">بین هر ایمیل چند ثانیه فاصله می‌افتد تا ایمیل شما اسپم نشود. صفحه را می‌توانید باز نگه دارید.</p>
              </div>
            </Card>
          </div>

          <div className="grid h-fit gap-5">
            {state && (
              <Card>
                <h2 className="mb-3 font-extrabold">{running ? "در حال ارسال…" : "نتیجه‌ی آخرین ارسال"}</h2>
                <div className="mb-3 h-3 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-gradient-to-l from-brand-400 to-brand-600 transition-all" style={{ width: `${pct}%` }} />
                </div>
                <div className="mb-3 flex flex-wrap gap-2 text-xs">
                  <Badge tone="green">
                    <CheckCircle2 size={12} /> موفق: {state.sent}
                  </Badge>
                  <Badge tone="rose">
                    <XCircle size={12} /> ناموفق: {state.failed}
                  </Badge>
                  {state.skipped > 0 && <Badge>ردشده (تکراری): {state.skipped}</Badge>}
                  <Badge tone="blue">
                    {state.done}/{state.total}
                  </Badge>
                </div>
                <LogBox lines={state.logs} running={running} />
              </Card>
            )}
            <Card>
              <h2 className="mb-3 flex items-center gap-2 font-extrabold">
                <History size={18} className="text-brand-600" /> تاریخچه ارسال این کلاینت
              </h2>
              {history.length === 0 ? (
                <div className="py-4 text-center text-sm text-slate-400">هنوز ایمیلی ارسال نشده.</div>
              ) : (
                <div className="scroll-thin grid max-h-[460px] gap-1.5 overflow-auto">
                  {history.map((h) => (
                    <div key={h.id} className="flex items-center gap-2 rounded-xl border border-slate-100 p-2.5 text-xs">
                      {h.status === "sent" ? <CheckCircle2 size={16} className="shrink-0 text-emerald-500" /> : <XCircle size={16} className="shrink-0 text-rose-500" />}
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-bold" dir="ltr">
                          {h.email}
                        </div>
                        <div className="truncate text-slate-400">{h.status === "failed" ? h.error : h.hospital}</div>
                      </div>
                      <span className="shrink-0 text-[10px] text-slate-400">{timeAgo(h.sentAt)}</span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
