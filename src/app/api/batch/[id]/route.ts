import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { batches, contacts } from "@/db/schema";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const bid = Number(id);
  const [batch] = await db.select().from(batches).where(eq(batches.id, bid));
  if (!batch) return NextResponse.json({ error: "not found" }, { status: 404 });
  const rows = await db
    .select()
    .from(contacts)
    .where(eq(contacts.batchId, bid))
    .orderBy(desc(contacts.score));
  return NextResponse.json({ batch, contacts: rows });
}
