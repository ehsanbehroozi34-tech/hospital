import { NextResponse } from "next/server";
import { and, desc, eq, ilike, isNotNull, isNull, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { contacts } from "@/db/schema";
import { parseSpecialty } from "@/lib/batch";
import { hostOf, isValidEmail } from "@/lib/crawler";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const spec = parseSpecialty(sp.get("specialty"));
  const q = (sp.get("q") ?? "").trim();
  const status = sp.get("status") ?? "all";
  const cat = sp.get("cat") ?? "all";
  const page = Math.max(1, Number(sp.get("page") ?? 1));
  const size = 50;

  const conds = [eq(contacts.specialty, spec)];
  if (q) {
    const like = `%${q}%`;
    conds.push(
      or(
        ilike(contacts.email, like),
        ilike(contacts.hospital, like),
        ilike(contacts.contactName, like),
        ilike(contacts.city, like),
      )!,
    );
  }
  if (status === "new") conds.push(isNull(contacts.exportedAt));
  if (status === "used") conds.push(isNotNull(contacts.exportedAt));
  if (cat !== "all") conds.push(eq(contacts.roleCategory, cat));
  if (sp.get("foreign") === "1") conds.push(eq(contacts.foreignFriendly, true));

  const where = and(...conds);
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(contacts).where(where);
  const rows = await db
    .select()
    .from(contacts)
    .where(where)
    .orderBy(desc(contacts.createdAt), desc(contacts.score))
    .limit(size)
    .offset((page - 1) * size);
  return NextResponse.json({ rows, total: n, page, pages: Math.max(1, Math.ceil(n / size)) });
}

export async function POST(req: Request) {
  const b = (await req.json().catch(() => ({}))) as Record<string, string>;
  const email = (b.email ?? "").trim().toLowerCase();
  if (!email || !/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/.test(email))
    return NextResponse.json({ error: "ایمیل معتبر نیست" }, { status: 400 });
  const spec = parseSpecialty(b.specialty);
  const rows = await db
    .insert(contacts)
    .values({
      email,
      specialty: spec,
      hospital: b.hospital ?? "",
      domain: email.split("@")[1],
      contactName: b.contactName ?? "",
      role: b.role ?? "",
      roleCategory: /pflege/i.test(b.role ?? "") ? "pflege" : /op|an(ä|ae)sth/i.test(b.role ?? "") ? "op" : isValidEmail(email) ? "hr" : "general",
      city: b.city ?? "",
      jobUrl: b.jobUrl ?? "",
      sourceName: b.jobUrl ? hostOf(b.jobUrl) || "دستی" : "دستی",
      manual: true,
      score: 70,
    })
    .onConflictDoNothing()
    .returning({ id: contacts.id });
  if (!rows.length) return NextResponse.json({ error: "این ایمیل قبلاً ثبت شده است" }, { status: 409 });
  return NextResponse.json({ ok: true });
}
