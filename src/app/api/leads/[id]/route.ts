import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { contacts } from "@/db/schema";

export const dynamic = "force-dynamic";

// حذف نکردن واقعی: ایمیل حذف‌شده هم نباید دوباره پیدا شود، پس به‌عنوان «استفاده‌شده» علامت می‌خورد.
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  await db.update(contacts).set({ exportedAt: new Date() }).where(eq(contacts.id, Number(id)));
  return NextResponse.json({ ok: true });
}
