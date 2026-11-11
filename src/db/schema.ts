import {
  boolean,
  customType,
  index,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return "bytea";
  },
});

/** منابع جستجو (سایت‌های کاریابی و صفحات مرجع) */
export const sources = pgTable("sources", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  url: text("url").notNull().unique(),
  kind: text("kind").notNull().default("custom"), // default | custom
  enabled: boolean("enabled").notNull().default(true),
  lastRunAt: timestamp("last_run_at"),
  lastFound: integer("last_found").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

/** دسته‌های روزانه (هر روز ۲۰ ایمیل) */
export const batches = pgTable("batches", {
  id: serial("id").primaryKey(),
  specialty: text("specialty").notNull(), // OTA | ATA
  day: text("day").notNull(), // yyyy-mm-dd
  count: integer("count").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

/** مخاطبین پیدا شده (ایمیل یکتا برای هر رشته) */
export const contacts = pgTable(
  "contacts",
  {
    id: serial("id").primaryKey(),
    email: text("email").notNull(),
    specialty: text("specialty").notNull(), // OTA | ATA
    hospital: text("hospital").notNull().default(""),
    domain: text("domain").notNull().default(""),
    contactName: text("contact_name").notNull().default(""),
    role: text("role").notNull().default(""),
    roleCategory: text("role_category").notNull().default("general"), // pflege | op | hr | general
    phone: text("phone").notNull().default(""),
    city: text("city").notNull().default(""),
    jobTitle: text("job_title").notNull().default(""),
    jobUrl: text("job_url").notNull().default(""),
    sourceName: text("source_name").notNull().default(""),
    foreignFriendly: boolean("foreign_friendly").notNull().default(false),
    score: integer("score").notNull().default(0),
    manual: boolean("manual").notNull().default(false),
    batchId: integer("batch_id"),
    exportedAt: timestamp("exported_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("contacts_email_specialty_uq").on(t.email, t.specialty),
    index("contacts_specialty_idx").on(t.specialty, t.exportedAt),
  ],
);

/** آدرس‌هایی که قبلاً بررسی شده‌اند */
export const visited = pgTable(
  "visited",
  {
    id: serial("id").primaryKey(),
    key: text("key").notNull(),
    specialty: text("specialty").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("visited_key_specialty_uq").on(t.key, t.specialty)],
);

/** کلاینت‌ها */
export const clients = pgTable("clients", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  specialty: text("specialty").notNull(), // OTA | ATA
  fromName: text("from_name").notNull().default(""),
  fromEmail: text("from_email").notNull(),
  smtpHost: text("smtp_host").notNull().default(""),
  smtpPort: integer("smtp_port").notNull().default(587),
  smtpSecure: boolean("smtp_secure").notNull().default(false),
  smtpUser: text("smtp_user").notNull().default(""),
  smtpPass: text("smtp_pass").notNull().default(""),
  subject: text("subject").notNull().default(""),
  body: text("body").notNull().default(""),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

/** فایل‌های پیوست هر کلاینت */
export const attachments = pgTable("attachments", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id")
    .notNull()
    .references(() => clients.id, { onDelete: "cascade" }),
  filename: text("filename").notNull(),
  mimeType: text("mime_type").notNull().default("application/octet-stream"),
  size: integer("size").notNull().default(0),
  data: bytea("data").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

/** گزارش ارسال ایمیل (برای جلوگیری از ارسال تکراری به یک مخاطب برای یک کلاینت) */
export const sends = pgTable(
  "sends",
  {
    id: serial("id").primaryKey(),
    clientId: integer("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    contactId: integer("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    status: text("status").notNull(), // sent | failed
    error: text("error").notNull().default(""),
    sentAt: timestamp("sent_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("sends_client_contact_uq").on(t.clientId, t.contactId)],
);
