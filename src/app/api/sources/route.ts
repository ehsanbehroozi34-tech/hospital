import { NextResponse } from "next/server";
import { asc } from "drizzle-orm";
import { db } from "@/db";
import { sources } from "@/db/schema";
import { ensureDefaultSources } from "@/lib/discover";
import { hostOf } from "@/lib/crawler";

export const dynamic = "force-dynamic";

export async function GET() {
  await ensureDefaultSources();
  const rows = await db.select().from(sources).orderBy(asc(sources.id));
  return NextResponse.json(rows);
}

export async function POST(req: Request) {
  const b = (await req.json().catch(() => ({}))) as { url?: string; name?: string };
  let url = (b.url ?? "").trim();
  if (!url) return NextResponse.json({ error: "آدرس سایت را وارد کنید" }, { status: 400 });
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  try {
    new URL(url);
  } catch {
    return NextResponse.json({ error: "آدرس معتبر نیست" }, { status: 400 });
  }
  const name = (b.name ?? "").trim() || hostOf(url);
  const r = await db.insert(sources).values({ name, url, kind: "custom" }).onConflictDoNothing().returning();
  if (!r.length) return NextResponse.json({ error: "این آدرس قبلاً اضافه شده است" }, { status: 409 });
  return NextResponse.json(r[0]);
}
