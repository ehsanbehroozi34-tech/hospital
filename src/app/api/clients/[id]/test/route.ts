import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { clients } from "@/db/schema";
import { sendTest } from "@/lib/mailer";

export const dynamic = "force-dynamic";
export const maxDuration = 90;

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const b = (await req.json().catch(() => ({}))) as { mode?: string };
  const [c] = await db.select().from(clients).where(eq(clients.id, Number(id)));
  if (!c) return NextResponse.json({ error: "کلاینت پیدا نشد" }, { status: 404 });
  if (!c.smtpHost) return NextResponse.json({ error: "ابتدا تنظیمات SMTP را کامل کنید" }, { status: 400 });
  try {
    await sendTest(c, b.mode === "test" ? "test" : "verify");
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}
