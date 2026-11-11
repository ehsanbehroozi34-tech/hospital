import { NextResponse } from "next/server";
import { and, eq, gte, sql } from "drizzle-orm";
import { db } from "@/db";
import { clients, contacts, sends } from "@/db/schema";
import { parseSpecialty, todaysBatches } from "@/lib/batch";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const spec = parseSpecialty(new URL(req.url).searchParams.get("specialty"));
  const [c] = await db
    .select({
      total: sql<number>`count(*)::int`,
      available: sql<number>`count(*) filter (where ${contacts.exportedAt} is null)::int`,
      exported: sql<number>`count(*) filter (where ${contacts.exportedAt} is not null)::int`,
      pflege: sql<number>`count(*) filter (where ${contacts.roleCategory} = 'pflege')::int`,
      foreign: sql<number>`count(*) filter (where ${contacts.foreignFriendly})::int`,
    })
    .from(contacts)
    .where(eq(contacts.specialty, spec));
  const [cl] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(clients)
    .where(eq(clients.specialty, spec));
  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);
  const [s] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(sends)
    .where(and(eq(sends.status, "sent"), gte(sends.sentAt, dayStart)));
  const [sAll] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(sends)
    .where(eq(sends.status, "sent"));
  const today = await todaysBatches(spec);
  return NextResponse.json({ ...c, clients: cl.n, sentToday: s.n, sentTotal: sAll.n, todayBatches: today });
}
