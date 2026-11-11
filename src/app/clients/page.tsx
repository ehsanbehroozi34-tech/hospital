"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FileText, Info, Mail, Paperclip, PlugZap, Plus, Save, Send, Trash2, UploadCloud, UserRound } from "lucide-react";
import { MODE_INFO, useMode, type Mode } from "@/components/ModeProvider";
import { Badge, Btn, Card, Empty, Field, PageHeader, api, inputCls, useToast } from "@/components/ui";

type Att = { id: number; filename: string; size: number; mimeType: string };
type Client = {
  id: number;
  name: string;
  specialty: Mode;
  fromName: string;
  fromEmail: string;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUser: string;
  hasPass: boolean;
  subject: string;
  body: string;
  attachments: Att[];
};
type Form = Omit<Client, "id" | "hasPass" | "attachments"> & { id?: number; smtpPass: string; hasPass?: boolean };

const PRESETS: Record<string, { label: string; host: string; port: number; secure: boolean; hint?: string }> = {
  custom: { label: "تنظیم دستی", host: "", port: 587, secure: false },
  gmail: { label: "Gmail", host: "smtp.gmail.com", port: 465, secure: true, hint: "برای Gmail باید «رمز عبور برنامه» (App Password) بسازید، نه رمز اصلی." },
  outlook: { label: "Outlook / Office365", host: "smtp.office365.com", port: 587, secure: false },
  gmx: { label: "GMX", host: "mail.gmx.net", port: 587, secure: false, hint: "در GMX باید دسترسی POP3/IMAP/SMTP را در تنظیمات فعال کنید." },
  webde: { label: "WEB.DE", host: "smtp.web.de", port: 587, secure: false },
  yahoo: { label: "Yahoo", host: "smtp.mail.yahoo.com", port: 465, secure: true, hint: "برای Yahoo هم «App Password» لازم است." },
  tonline: { label: "T-Online", host: "securesmtp.t-online.de", port: 465, secure: true },
};

const TEMPLATES: Record<Mode, { subject: string; body: string }> = {
  OTA: {
    subject: "Bewerbung als Operationstechnische/r Assistent/in (OTA) – {{krankenhaus}}",
    body: `{{anrede}},

mit großem Interesse bewerbe ich mich bei Ihnen als Operationstechnische/r Assistent/in (OTA). Ich bin ausgebildete Fachkraft aus dem Iran mit mehrjähriger Berufserfahrung im Operationssaal und bin bereit, das Anerkennungsverfahren in Deutschland zu durchlaufen und meine Deutschkenntnisse stetig zu verbessern.

Meinen Lebenslauf sowie meine Zeugnisse finden Sie im Anhang. Über eine Einladung zu einem (Online-)Vorstellungsgespräch würde ich mich sehr freuen.

Mit freundlichen Grüßen
[Name]`,
  },
  ATA: {
    subject: "Bewerbung als Anästhesietechnische/r Assistent/in (ATA) – {{krankenhaus}}",
    body: `{{anrede}},

mit großem Interesse bewerbe ich mich bei Ihnen als Anästhesietechnische/r Assistent/in (ATA). Ich bin ausgebildete Fachkraft aus dem Iran mit mehrjähriger Berufserfahrung in der Anästhesie und bin bereit, das Anerkennungsverfahren in Deutschland zu durchlaufen und meine Deutschkenntnisse stetig zu verbessern.

Meinen Lebenslauf sowie meine Zeugnisse finden Sie im Anhang. Über eine Einladung zu einem (Online-)Vorstellungsgespräch würde ich mich sehr freuen.

Mit freundlichen Grüßen
[Name]`,
  },
};

const VARS = [
  ["{{anrede}}", "سلام رسمی (Sehr geehrte…)"],
  ["{{krankenhaus}}", "نام بیمارستان"],
  ["{{ansprechpartner}}", "نام مسئول"],
  ["{{stelle}}", "عنوان آگهی"],
  ["{{stadt}}", "شهر"],
];

const blank = (mode: Mode): Form => ({
  name: "",
  specialty: mode,
  fromName: "",
  fromEmail: "",
  smtpHost: "",
  smtpPort: 587,
  smtpSecure: false,
  smtpUser: "",
  smtpPass: "",
  subject: TEMPLATES[mode].subject,
  body: TEMPLATES[mode].body,
});

const fmtSize = (n: number) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.ceil(n / 1024)} KB`);

export default function ClientsPage() {
  const { mode } = useMode();
  const { toast, toastNode } = useToast();
  const [list, setList] = useState<Client[]>([]);
  const [form, setForm] = useState<Form | null>(null);
  const [atts, setAtts] = useState<Att[]>([]);
  const [pending, setPending] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [preset, setPreset] = useState("custom");

  const load = useCallback(async () => {
    const r = await api<Client[]>(`/api/clients?specialty=${mode}`);
    setList(r);
    return r;
  }, [mode]);

  useEffect(() => {
    setForm(null);
    load().catch(() => {});
  }, [load]);

  function edit(c: Client) {
    setForm({ ...c, smtpPass: "" });
    setAtts(c.attachments);
    setPending([]);
    setPreset("custom");
  }

  function applyPreset(k: string) {
    setPreset(k);
    const p = PRESETS[k];
    if (k !== "custom" && form) setForm({ ...form, smtpHost: p.host, smtpPort: p.port, smtpSecure: p.secure });
  }

  async function uploadFiles(clientId: number, files: File[]) {
    if (!files.length) return;
    const fd = new FormData();
    files.forEach((f) => fd.append("files", f));
    await api(`/api/clients/${clientId}/attachments`, { method: "POST", body: fd });
  }

  async function save() {
    if (!form) return;
    setSaving(true);
    try {
      const saved = form.id
        ? await api<Client>(`/api/clients/${form.id}`, { method: "PUT", json: form })
        : await api<Client>("/api/clients", { method: "POST", json: form });
      if (pending.length) await uploadFiles(saved.id, pending);
      toast("کلاینت ذخیره شد");
      const r = await load();
      const fresh = r.find((c) => c.id === saved.id);
      if (fresh) edit(fresh);
    } catch (e) {
      toast((e as Error).message, false);
    } finally {
      setSaving(false);
    }
  }

  async function addFiles(files: FileList | File[]) {
    const arr = Array.from(files);
    if (!arr.length) return;
    if (!form?.id) {
      setPending((p) => [...p, ...arr]);
      return;
    }
    try {
      await uploadFiles(form.id, arr);
      toast(`${arr.length} فایل پیوست شد`);
      const r = await load();
      const fresh = r.find((c) => c.id === form.id);
      if (fresh) setAtts(fresh.attachments);
    } catch (e) {
      toast((e as Error).message, false);
    }
  }

  async function removeAtt(a: Att) {
    if (!form?.id) return;
    await api(`/api/clients/${form.id}/attachments/${a.id}`, { method: "DELETE" });
    setAtts((x) => x.filter((y) => y.id !== a.id));
    load();
  }

  async function test(mode2: "verify" | "test") {
    if (!form?.id) return toast("ابتدا کلاینت را ذخیره کنید", false);
    setTesting(mode2);
    try {
      await api(`/api/clients/${form.id}/test`, { method: "POST", json: { mode: mode2 } });
      toast(mode2 === "verify" ? "اتصال به ایمیل موفق بود ✅" : `ایمیل آزمایشی به ${form.fromEmail} ارسال شد ✅`);
    } catch (e) {
      toast((e as Error).message, false);
    } finally {
      setTesting(null);
    }
  }

  async function del() {
    if (!form?.id || !confirm("این کلاینت و پیوست‌هایش حذف شود؟")) return;
    await api(`/api/clients/${form.id}`, { method: "DELETE" });
    setForm(null);
    load();
  }

  function insertVar(v: string) {
    if (!form) return;
    const el = bodyRef.current;
    if (!el) return setForm({ ...form, body: form.body + v });
    const s = el.selectionStart ?? form.body.length;
    const e = el.selectionEnd ?? s;
    setForm({ ...form, body: form.body.slice(0, s) + v + form.body.slice(e) });
    setTimeout(() => {
      el.focus();
      el.setSelectionRange(s + v.length, s + v.length);
    }, 0);
  }

  const set = <K extends keyof Form>(k: K, v: Form[K]) => form && setForm({ ...form, [k]: v });

  return (
    <div>
      {toastNode}
      <PageHeader
        title={`کلاینت‌های ${mode}`}
        subtitle={`${MODE_INFO[mode].desc} — برای هر کلاینت ایمیل فرستنده، متن و مدارک پیوست جداگانه ثبت کنید.`}
        actions={
          <Btn
            onClick={() => {
              setForm(blank(mode));
              setAtts([]);
              setPending([]);
              setPreset("custom");
            }}
          >
            <Plus size={16} /> کلاینت جدید
          </Btn>
        }
      />

      <div className="grid gap-5 xl:grid-cols-[300px_1fr]">
        <Card className="h-fit">
          <h2 className="mb-3 flex items-center gap-2 font-extrabold">
            <UserRound size={18} className="text-brand-600" /> فهرست کلاینت‌ها
          </h2>
          {list.length === 0 ? (
            <div className="py-6 text-center text-sm text-slate-400">هنوز کلاینتی برای {mode} ثبت نشده است.</div>
          ) : (
            <div className="grid gap-2">
              {list.map((c) => (
                <button
                  key={c.id}
                  onClick={() => edit(c)}
                  className={`rounded-2xl border p-3 text-right transition ${
                    form?.id === c.id ? "border-brand-300 bg-brand-50" : "border-slate-100 bg-white hover:border-brand-200"
                  }`}
                >
                  <div className="font-bold">{c.name}</div>
                  <div className="mt-0.5 truncate text-xs text-slate-400" dir="ltr">
                    {c.fromEmail}
                  </div>
                  <div className="mt-2 flex gap-1">
                    <Badge tone={c.hasPass && c.smtpHost ? "green" : "amber"}>{c.hasPass && c.smtpHost ? "SMTP آماده" : "نیاز به تنظیم"}</Badge>
                    <Badge tone="blue">
                      <Paperclip size={11} /> {c.attachments.length}
                    </Badge>
                  </div>
                </button>
              ))}
            </div>
          )}
        </Card>

        {!form ? (
          <Card>
            <Empty icon={<Mail size={28} />} title="یک کلاینت انتخاب یا ایجاد کنید" text="هر کلاینت ایمیل خودش را دارد و پیام‌ها از همان آدرس ارسال می‌شود." />
          </Card>
        ) : (
          <div className="grid gap-5">
            <Card>
              <h2 className="mb-4 flex items-center gap-2 text-lg font-extrabold">
                <UserRound size={20} className="text-brand-600" /> مشخصات و ایمیل فرستنده
              </h2>
              <div className="grid gap-3 md:grid-cols-2">
                <Field label="نام کلاینت *">
                  <input className={inputCls} value={form.name} onChange={(e) => set("name", e.target.value)} />
                </Field>
                <Field label="رشته">
                  <select className={inputCls} value={form.specialty} onChange={(e) => set("specialty", e.target.value as Mode)}>
                    <option value="OTA">OTA – اتاق عمل</option>
                    <option value="ATA">ATA – بیهوشی</option>
                  </select>
                </Field>
                <Field label="نام نمایشی فرستنده" hint="همان‌چیزی که گیرنده به‌عنوان نام فرستنده می‌بیند">
                  <input className={inputCls} dir="ltr" value={form.fromName} onChange={(e) => set("fromName", e.target.value)} placeholder="Max Mustermann" />
                </Field>
                <Field label="آدرس ایمیل کلاینت *">
                  <input className={inputCls} dir="ltr" value={form.fromEmail} onChange={(e) => setForm({ ...form, fromEmail: e.target.value, smtpUser: form.smtpUser || e.target.value })} placeholder="client@gmail.com" />
                </Field>
              </div>

              <div className="mt-5 rounded-2xl border border-slate-100 bg-slate-50/70 p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <h3 className="flex items-center gap-2 text-sm font-extrabold">
                    <PlugZap size={16} className="text-brand-600" /> اتصال به ایمیل (SMTP)
                  </h3>
                  <select className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold" value={preset} onChange={(e) => applyPreset(e.target.value)}>
                    {Object.entries(PRESETS).map(([k, p]) => (
                      <option key={k} value={k}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </div>
                {PRESETS[preset].hint && (
                  <div className="mb-3 flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-800">
                    <Info size={15} className="mt-0.5 shrink-0" /> {PRESETS[preset].hint}
                  </div>
                )}
                <div className="grid gap-3 md:grid-cols-3">
                  <Field label="سرور SMTP">
                    <input className={inputCls} dir="ltr" value={form.smtpHost} onChange={(e) => set("smtpHost", e.target.value)} placeholder="smtp.gmail.com" />
                  </Field>
                  <Field label="پورت">
                    <input className={inputCls} dir="ltr" type="number" value={form.smtpPort} onChange={(e) => set("smtpPort", Number(e.target.value))} />
                  </Field>
                  <Field label="رمزنگاری">
                    <select className={inputCls} value={form.smtpSecure ? "ssl" : "tls"} onChange={(e) => set("smtpSecure", e.target.value === "ssl")}>
                      <option value="ssl">SSL (پورت 465)</option>
                      <option value="tls">STARTTLS (پورت 587)</option>
                    </select>
                  </Field>
                  <Field label="نام کاربری">
                    <input className={inputCls} dir="ltr" value={form.smtpUser} onChange={(e) => set("smtpUser", e.target.value)} />
                  </Field>
                  <div className="md:col-span-2">
                    <Field label="رمز عبور / App Password" hint={form.id && form.hasPass ? "رمز قبلاً ذخیره شده؛ برای تغییر، رمز جدید بنویسید." : undefined}>
                      <input className={inputCls} dir="ltr" type="password" autoComplete="new-password" value={form.smtpPass} onChange={(e) => set("smtpPass", e.target.value)} placeholder={form.hasPass ? "••••••••" : ""} />
                    </Field>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Btn size="sm" variant="ghost" onClick={() => test("verify")} loading={testing === "verify"}>
                    <PlugZap size={14} /> تست اتصال
                  </Btn>
                  <Btn size="sm" variant="ghost" onClick={() => test("test")} loading={testing === "test"}>
                    <Send size={14} /> ارسال ایمیل آزمایشی به خودم
                  </Btn>
                </div>
              </div>
            </Card>

            <Card>
              <h2 className="mb-4 flex items-center gap-2 text-lg font-extrabold">
                <FileText size={20} className="text-brand-600" /> متن ایمیل و مدارک پیوست
              </h2>
              <div className="grid gap-3">
                <Field label="موضوع ایمیل (Betreff)">
                  <input className={inputCls} dir="ltr" value={form.subject} onChange={(e) => set("subject", e.target.value)} />
                </Field>
                <div>
                  <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                    <span className="text-xs font-bold text-slate-600">متن ایمیل:</span>
                    {VARS.map(([v, d]) => (
                      <button key={v} type="button" title={d} onClick={() => insertVar(v)} className="rounded-lg bg-brand-50 px-2 py-1 font-mono text-[11px] text-brand-700 hover:bg-brand-100">
                        {v}
                      </button>
                    ))}
                  </div>
                  <textarea ref={bodyRef} rows={13} dir="ltr" className={`${inputCls} leading-6`} value={form.body} onChange={(e) => set("body", e.target.value)} />
                  <p className="mt-1 text-[11px] text-slate-400">
                    متغیرها هنگام ارسال با اطلاعات هر بیمارستان جایگزین می‌شوند. اگر نام مسئول پیدا نشود، «Sehr geehrte Damen und Herren» نوشته می‌شود.
                  </p>
                </div>

                <div>
                  <div className="mb-1.5 text-xs font-bold text-slate-600">مدارک پیوست (رزومه، مدارک، مدرک زبان و…)</div>
                  <div
                    onDragOver={(e) => {
                      e.preventDefault();
                      setDrag(true);
                    }}
                    onDragLeave={() => setDrag(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setDrag(false);
                      addFiles(e.dataTransfer.files);
                    }}
                    onClick={() => fileRef.current?.click()}
                    className={`flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed p-6 text-center transition ${
                      drag ? "border-brand-500 bg-brand-50" : "border-slate-200 bg-slate-50/60 hover:border-brand-300"
                    }`}
                  >
                    <UploadCloud size={30} className="text-brand-500" />
                    <div className="text-sm font-bold">فایل‌ها را اینجا رها کنید یا کلیک کنید</div>
                    <div className="text-xs text-slate-400">PDF، Word، تصویر… (حداکثر ۱۵ مگابایت برای هر فایل، ۲۵ مگابایت مجموع)</div>
                    <input
                      ref={fileRef}
                      type="file"
                      multiple
                      hidden
                      onChange={(e) => {
                        if (e.target.files) addFiles(e.target.files);
                        e.target.value = "";
                      }}
                    />
                  </div>
                  {(atts.length > 0 || pending.length > 0) && (
                    <div className="mt-3 grid gap-2 md:grid-cols-2">
                      {atts.map((a) => (
                        <div key={a.id} className="flex items-center gap-3 rounded-xl border border-slate-100 bg-white p-2.5">
                          <Paperclip size={16} className="text-brand-500" />
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-medium" dir="ltr">
                              {a.filename}
                            </div>
                            <div className="text-[11px] text-slate-400">{fmtSize(a.size)}</div>
                          </div>
                          <button onClick={() => removeAtt(a)} className="rounded-lg p-1.5 text-slate-300 hover:bg-rose-50 hover:text-rose-600">
                            <Trash2 size={15} />
                          </button>
                        </div>
                      ))}
                      {pending.map((f, i) => (
                        <div key={i} className="flex items-center gap-3 rounded-xl border border-dashed border-amber-300 bg-amber-50 p-2.5">
                          <Paperclip size={16} className="text-amber-600" />
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-medium" dir="ltr">
                              {f.name}
                            </div>
                            <div className="text-[11px] text-amber-700">پس از ذخیره آپلود می‌شود · {fmtSize(f.size)}</div>
                          </div>
                          <button onClick={() => setPending((p) => p.filter((_, j) => j !== i))} className="rounded-lg p-1.5 text-amber-500 hover:bg-amber-100">
                            <Trash2 size={15} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-5 flex flex-wrap justify-between gap-2">
                <Btn size="lg" onClick={save} loading={saving} disabled={!form.name || !form.fromEmail}>
                  <Save size={18} /> ذخیره کلاینت
                </Btn>
                {form.id && (
                  <Btn variant="danger" onClick={del}>
                    <Trash2 size={16} /> حذف کلاینت
                  </Btn>
                )}
              </div>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
