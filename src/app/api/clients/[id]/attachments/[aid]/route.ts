import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { attachments } from "@/db/schema";

export const dynamic = "force-dynamic";

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string; aid: string }> }) {
  const { id, aid } = await ctx.params;
  await db.delete(attachments).where(and(eq(attachments.id, Number(aid)), eq(attachments.clientId, Number(id))));
  return NextResponse.json({ ok: true });
}
