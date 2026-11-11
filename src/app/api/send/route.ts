import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { clients, contacts, sends } from "@/db/schema";
import { getSendState, startSend } from "@/lib/mailer";

export const dynamic = "force-dynamic";

/** وضعیت ارسال + تاریخچه برای یک کلاینت */
export async function GET(req: Request) {
  const clientId = Number(new URL(req.url).searchParams.get("clientId"));
  if (!clientId) return NextResponse.json({ state: null, history: [] });
  const history = await db
    .select({
      id: sends.id,
      email: sends.email,
      status: sends.status,
      error: sends.error,
      sentAt: sends.sentAt,
      hospital: contacts.hospital,
    })
    .from(sends)
    .leftJoin(contacts, eq(contacts.id, sends.contactId))
    .where(eq(sends.clientId, clientId))
    .orderBy(desc(sends.sentAt))
    .limit(100);
  return NextResponse.json({ state: getSendState(clientId), history });
}

export async function POST(req: Request) {
  const b = (await req.json().catch(() => ({}))) as { clientId?: number; contactIds?: number[] };
  const [client] = await db.select().from(clients).where(eq(clients.id, Number(b.clientId)));
  if (!client) return NextResponse.json({ error: "کلاینت پیدا نشد" }, { status: 404 });
  if (!client.smtpHost || !client.smtpPass) return NextResponse.json({ error: "تنظیمات SMTP این کلاینت کامل نیست" }, { status: 400 });
  if (!client.subject.trim() || !client.body.trim())
    return NextResponse.json({ error: "موضوع و متن ایمیل این کلاینت را وارد کنید" }, { status: 400 });
  const ids = (b.contactIds ?? []).map(Number).filter(Boolean);
  if (!ids.length) return NextResponse.json({ error: "هیچ مخاطبی انتخاب نشده" }, { status: 400 });
  const started = startSend(client, ids);
  return NextResponse.json({ started });
}
