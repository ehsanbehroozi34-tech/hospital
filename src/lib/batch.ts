import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { batches, contacts } from "@/db/schema";
import type { Specialty } from "./crawler";

export const BATCH_SIZE = 20;

export function todayStr(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin" }).format(new Date());
}

export function parseSpecialty(v: unknown): Specialty {
  return v === "ATA" ? "ATA" : "OTA";
}

export async function availableCount(spec: Specialty): Promise<number> {
  const r = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(contacts)
    .where(and(eq(contacts.specialty, spec), isNull(contacts.exportedAt)));
  return r[0]?.c ?? 0;
}

export async function todaysBatches(spec: Specialty) {
  return db
    .select()
    .from(batches)
    .where(and(eq(batches.specialty, spec), eq(batches.day, todayStr())))
    .orderBy(desc(batches.id));
}

export type BatchResult =
  | { status: "created" | "existing"; batchId: number; count: number }
  | { status: "need_discovery"; available: number }
  | { status: "empty" };

/**
 * Creates today's batch of 20 never-before-exported contacts.
 * Contacts are marked as exported immediately so they can never appear again.
 */
export async function createBatch(
  spec: Specialty,
  opts: { extra?: boolean; allowPartial?: boolean } = {},
): Promise<BatchResult> {
  if (!opts.extra) {
    const existing = await todaysBatches(spec);
    if (existing.length) return { status: "existing", batchId: existing[0].id, count: existing[0].count };
  }
  const pool = await db
    .select()
    .from(contacts)
    .where(and(eq(contacts.specialty, spec), isNull(contacts.exportedAt)))
    .orderBy(desc(contacts.score), sql`random()`)
    .limit(400);

  if (pool.length < BATCH_SIZE && !opts.allowPartial) return { status: "need_discovery", available: pool.length };
  if (!pool.length) return { status: "empty" };

  const chosen: typeof pool = [];
  const perDomain = new Map<string, number>();
  for (const c of pool) {
    if (chosen.length >= BATCH_SIZE) break;
    const n = perDomain.get(c.domain) ?? 0;
    if (n >= 3) continue;
    perDomain.set(c.domain, n + 1);
    chosen.push(c);
  }
  for (const c of pool) {
    if (chosen.length >= BATCH_SIZE) break;
    if (!chosen.includes(c)) chosen.push(c);
  }

  const [b] = await db
    .insert(batches)
    .values({ specialty: spec, day: todayStr(), count: chosen.length })
    .returning();
  await db
    .update(contacts)
    .set({ batchId: b.id, exportedAt: new Date() })
    .where(
      inArray(
        contacts.id,
        chosen.map((c) => c.id),
      ),
    );
  return { status: "created", batchId: b.id, count: chosen.length };
}
