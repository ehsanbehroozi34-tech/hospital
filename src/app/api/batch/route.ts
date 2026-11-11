import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { batches } from "@/db/schema";
import { availableCount, createBatch, parseSpecialty, todaysBatches } from "@/lib/batch";
import { getDiscoverState, startDiscovery } from "@/lib/discover";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const spec = parseSpecialty(new URL(req.url).searchParams.get("specialty"));
  const today = await todaysBatches(spec);
  const history = await db
    .select()
    .from(batches)
    .where(eq(batches.specialty, spec))
    .orderBy(desc(batches.id))
    .limit(30);
  return NextResponse.json({ today, history, available: await availableCount(spec) });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    specialty?: string;
    extra?: boolean;
    allowPartial?: boolean;
  };
  const spec = parseSpecialty(body.specialty);
  const res = await createBatch(spec, { extra: !!body.extra, allowPartial: !!body.allowPartial });
  if (res.status === "empty" && body.allowPartial) return NextResponse.json({ status: "empty" });
  if (res.status === "need_discovery" || res.status === "empty") {
    const st = getDiscoverState();
    if (!st.running) startDiscovery(spec);
    return NextResponse.json({ status: "discovering", available: res.status === "empty" ? 0 : res.available });
  }
  return NextResponse.json(res);
}
