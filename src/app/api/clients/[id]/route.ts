import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { clients } from "@/db/schema";
import { parseSpecialty } from "@/lib/batch";
import { publicClient } from "@/lib/clients";

export const dynamic = "force-dynamic";

export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const set: Partial<typeof clients.$inferInsert> = {
    name: String(b.name ?? "").trim(),
    specialty: parseSpecialty(b.specialty),
    fromName: String(b.fromName ?? ""),
    fromEmail: String(b.fromEmail ?? "").trim(),
    smtpHost: String(b.smtpHost ?? ""),
    smtpPort: Number(b.smtpPort ?? 587),
    smtpSecure: !!b.smtpSecure,
    smtpUser: String(b.smtpUser ?? ""),
    subject: String(b.subject ?? ""),
    body: String(b.body ?? ""),
  };
  if (typeof b.smtpPass === "string" && b.smtpPass.length > 0) set.smtpPass = b.smtpPass;
  if (!set.name || !set.fromEmail) return NextResponse.json({ error: "نام و ایمیل الزامی است" }, { status: 400 });
  const [row] = await db.update(clients).set(set).where(eq(clients.id, Number(id))).returning();
  return NextResponse.json(publicClient(row));
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  await db.delete(clients).where(eq(clients.id, Number(id)));
  return NextResponse.json({ ok: true });
}
