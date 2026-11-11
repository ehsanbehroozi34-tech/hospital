import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { contacts } from "@/db/schema";
import { parseSpecialty, todayStr } from "@/lib/batch";
import { buildWorkbook, xlsxResponse } from "@/lib/excel";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const spec = parseSpecialty(new URL(req.url).searchParams.get("specialty"));
  const rows = await db.select().from(contacts).where(eq(contacts.specialty, spec)).orderBy(desc(contacts.score)).limit(5000);
  const buf = await buildWorkbook(rows, `${spec} all`);
  return xlsxResponse(buf, `${spec}-all-contacts-${todayStr()}.xlsx`);
}
