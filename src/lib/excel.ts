import ExcelJS from "exceljs";
import type { contacts } from "@/db/schema";

type Contact = typeof contacts.$inferSelect;

const CAT: Record<string, string> = {
  pflege: "مدیریت پرستاری",
  op: "مدیریت اتاق عمل/بیهوشی",
  hr: "منابع انسانی / جذب نیرو",
  general: "عمومی",
};

export async function buildWorkbook(rows: Contact[], title: string): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Klinik Finder";
  const ws = wb.addWorksheet(title.slice(0, 30), {
    views: [{ rightToLeft: true, state: "frozen", ySplit: 1 }],
  });
  ws.columns = [
    { header: "#", key: "n", width: 5 },
    { header: "بیمارستان / Krankenhaus", key: "hospital", width: 42 },
    { header: "ایمیل / E-Mail", key: "email", width: 38 },
    { header: "نام مسئول / Ansprechpartner", key: "name", width: 30 },
    { header: "سمت / Position", key: "role", width: 30 },
    { header: "دسته", key: "cat", width: 22 },
    { header: "تلفن / Telefon", key: "phone", width: 20 },
    { header: "شهر / Stadt", key: "city", width: 16 },
    { header: "عنوان آگهی / Stelle", key: "job", width: 40 },
    { header: "پذیرش نیروی خارجی", key: "foreign", width: 18 },
    { header: "لینک آگهی / منبع", key: "url", width: 50 },
    { header: "منبع", key: "src", width: 22 },
  ];
  rows.forEach((c, i) => {
    ws.addRow({
      n: i + 1,
      hospital: c.hospital,
      email: c.email,
      name: c.contactName,
      role: c.role,
      cat: CAT[c.roleCategory] ?? "",
      phone: c.phone,
      city: c.city,
      job: c.jobTitle,
      foreign: c.foreignFriendly ? "بله ✓" : "—",
      url: c.jobUrl,
      src: c.sourceName,
    });
  });
  const head = ws.getRow(1);
  head.height = 26;
  head.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 12 };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F766E" } };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  });
  ws.eachRow((row, idx) => {
    if (idx === 1) return;
    row.alignment = { vertical: "middle", wrapText: true };
    if (idx % 2 === 0) row.eachCell((c) => (c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF0FDFA" } }));
  });
  ws.autoFilter = { from: "A1", to: "L1" };
  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf as ArrayBuffer);
}

export function xlsxResponse(buf: Buffer, filename: string) {
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
