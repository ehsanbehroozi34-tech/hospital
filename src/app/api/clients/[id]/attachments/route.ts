import { NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { attachments } from "@/db/schema";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const MAX_FILE = 15 * 1024 * 1024;
const MAX_TOTAL = 25 * 1024 * 1024;

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const clientId = Number(id);
  const form = await req.formData();
  const files = form.getAll("files").filter((f): f is File => typeof f !== "string");
  if (!files.length) return NextResponse.json({ error: "فایلی انتخاب نشده" }, { status: 400 });
  const [{ total }] = await db
    .select({ total: sql<number>`coalesce(sum(${attachments.size}),0)::int` })
    .from(attachments)
    .where(eq(attachments.clientId, clientId));
  let sum = total;
  const added: string[] = [];
  for (const f of files) {
    if (f.size > MAX_FILE) return NextResponse.json({ error: `فایل «${f.name}» بزرگ‌تر از ۱۵ مگابایت است` }, { status: 400 });
    if (sum + f.size > MAX_TOTAL)
      return NextResponse.json({ error: "مجموع حجم پیوست‌ها نباید بیشتر از ۲۵ مگابایت باشد" }, { status: 400 });
    sum += f.size;
    const data = Buffer.from(await f.arrayBuffer());
    await db.insert(attachments).values({
      clientId,
      filename: f.name,
      mimeType: f.type || "application/octet-stream",
      size: f.size,
      data,
    });
    added.push(f.name);
  }
  return NextResponse.json({ ok: true, added });
}
