import { NextResponse } from "next/server";
import { asc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { attachments, clients } from "@/db/schema";
import { parseSpecialty } from "@/lib/batch";
import { publicClient } from "@/lib/clients";

export const dynamic = "force-dynamic";


export async function GET(req: Request) {
  const spec = new URL(req.url).searchParams.get("specialty");
  const rows = spec
    ? await db.select().from(clients).where(eq(clients.specialty, parseSpecialty(spec))).orderBy(asc(clients.id))
    : await db.select().from(clients).orderBy(asc(clients.id));
  const atts = await db
    .select({
      id: attachments.id,
      clientId: attachments.clientId,
      filename: attachments.filename,
      size: attachments.size,
      mimeType: attachments.mimeType,
    })
    .from(attachments)
    .orderBy(sql`${attachments.id} asc`);
  return NextResponse.json(rows.map((c) => ({ ...publicClient(c), attachments: atts.filter((a) => a.clientId === c.id) })));
}

export async function POST(req: Request) {
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const name = String(b.name ?? "").trim();
  const fromEmail = String(b.fromEmail ?? "").trim();
  if (!name || !fromEmail) return NextResponse.json({ error: "نام کلاینت و ایمیل فرستنده الزامی است" }, { status: 400 });
  const [row] = await db
    .insert(clients)
    .values({
      name,
      specialty: parseSpecialty(b.specialty),
      fromName: String(b.fromName ?? name),
      fromEmail,
      smtpHost: String(b.smtpHost ?? ""),
      smtpPort: Number(b.smtpPort ?? 587),
      smtpSecure: !!b.smtpSecure,
      smtpUser: String(b.smtpUser ?? fromEmail),
      smtpPass: String(b.smtpPass ?? ""),
      subject: String(b.subject ?? ""),
      body: String(b.body ?? ""),
    })
    .returning();
  return NextResponse.json(publicClient(row));
}
