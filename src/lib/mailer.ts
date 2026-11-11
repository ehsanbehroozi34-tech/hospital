import nodemailer from "nodemailer";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { attachments, clients, contacts, sends } from "@/db/schema";
import { sleep } from "./crawler";

type Client = typeof clients.$inferSelect;
type Contact = typeof contacts.$inferSelect;

export type SendState = {
  running: boolean;
  total: number;
  done: number;
  sent: number;
  failed: number;
  skipped: number;
  logs: string[];
  finishedAt: number | null;
};

const g = globalThis as typeof globalThis & { __sendJobs?: Map<number, SendState> };
const jobs = () => (g.__sendJobs ??= new Map());

export function getSendState(clientId: number): SendState | null {
  return jobs().get(clientId) ?? null;
}

export function makeTransport(c: Client) {
  return nodemailer.createTransport({
    host: c.smtpHost,
    port: c.smtpPort,
    secure: c.smtpSecure,
    auth: c.smtpUser ? { user: c.smtpUser, pass: c.smtpPass } : undefined,
    connectionTimeout: 20000,
    greetingTimeout: 20000,
    socketTimeout: 60000,
  });
}

export function greeting(name: string): string {
  const n = name.trim();
  if (/^Frau\b/.test(n)) return `Sehr geehrte ${n}`;
  if (/^Herr\b/.test(n)) return `Sehr geehrter ${n}`;
  return "Sehr geehrte Damen und Herren";
}

export function render(tpl: string, c: Partial<Contact>): string {
  const map: Record<string, string> = {
    anrede: greeting(c.contactName ?? ""),
    krankenhaus: c.hospital || "Ihr Haus",
    ansprechpartner: c.contactName ?? "",
    stelle: c.jobTitle || "",
    stadt: c.city ?? "",
  };
  return tpl.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k: string) => map[k.toLowerCase()] ?? "");
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export async function loadAttachments(clientId: number) {
  return db.select().from(attachments).where(eq(attachments.clientId, clientId));
}

function mailOptions(c: Client, to: string, contact: Partial<Contact>, atts: (typeof attachments.$inferSelect)[]) {
  const text = render(c.body, contact);
  return {
    from: c.fromName ? `"${c.fromName.replace(/"/g, "")}" <${c.fromEmail}>` : c.fromEmail,
    to,
    replyTo: c.fromEmail,
    subject: render(c.subject, contact),
    text,
    html: `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;color:#111">${esc(text).replace(/\n/g, "<br>")}</div>`,
    attachments: atts.map((a) => ({ filename: a.filename, content: a.data, contentType: a.mimeType })),
  };
}

export async function sendTest(c: Client, mode: "verify" | "test") {
  const t = makeTransport(c);
  await t.verify();
  if (mode === "test") {
    const atts = await loadAttachments(c.id);
    await t.sendMail(
      mailOptions(c, c.fromEmail, { hospital: "Musterklinikum", contactName: "Frau Dr. Muster", city: "Berlin", jobTitle: "OTA / ATA (m/w/d)" }, atts),
    );
  }
}

export function startSend(client: Client, contactIds: number[]): boolean {
  const cur = getSendState(client.id);
  if (cur?.running) return false;
  const state: SendState = { running: true, total: 0, done: 0, sent: 0, failed: 0, skipped: 0, logs: [], finishedAt: null };
  jobs().set(client.id, state);
  const log = (s: string) => {
    state.logs.push(s);
    if (state.logs.length > 200) state.logs.shift();
  };
  (async () => {
    const rows = contactIds.length ? await db.select().from(contacts).where(inArray(contacts.id, contactIds)) : [];
    const already = rows.length
      ? await db
          .select({ contactId: sends.contactId })
          .from(sends)
          .where(and(eq(sends.clientId, client.id), eq(sends.status, "sent"), inArray(sends.contactId, rows.map((r) => r.id))))
      : [];
    const sentSet = new Set(already.map((a) => a.contactId));
    const todo = rows.filter((r) => !sentSet.has(r.id));
    state.skipped = rows.length - todo.length;
    state.total = todo.length;
    if (state.skipped) log(`⏭️ ${state.skipped} ایمیل قبلاً برای این کلاینت ارسال شده بود و رد شد`);
    const atts = await loadAttachments(client.id);
    const transport = makeTransport(client);
    for (const c of todo) {
      try {
        await transport.sendMail(mailOptions(client, c.email, c, atts));
        state.sent++;
        log(`✅ ${c.email}`);
        await db
          .insert(sends)
          .values({ clientId: client.id, contactId: c.id, email: c.email, status: "sent" })
          .onConflictDoUpdate({
            target: [sends.clientId, sends.contactId],
            set: { status: "sent", error: "", sentAt: new Date() },
          });
      } catch (e) {
        state.failed++;
        const msg = e instanceof Error ? e.message : String(e);
        log(`❌ ${c.email}: ${msg}`);
        await db
          .insert(sends)
          .values({ clientId: client.id, contactId: c.id, email: c.email, status: "failed", error: msg.slice(0, 400) })
          .onConflictDoUpdate({
            target: [sends.clientId, sends.contactId],
            set: { status: "failed", error: msg.slice(0, 400), sentAt: new Date() },
          });
      }
      state.done++;
      await sleep(2500);
    }
  })()
    .catch((e: unknown) => log(`❌ ${e instanceof Error ? e.message : String(e)}`))
    .finally(() => {
      state.running = false;
      state.finishedAt = Date.now();
    });
  return true;
}
