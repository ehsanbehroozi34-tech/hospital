import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { contacts, sources, visited } from "@/db/schema";
import {
  ATA_RE,
  FOREIGN_RE,
  OTA_RE,
  bingSearch,
  extractContacts,
  extractLinks,
  fetchText,
  getTitle,
  guessCity,
  guessHospitalName,
  guessJobTitle,
  hostOf,
  htmlToText,
  isValidEmail,
  sleep,
  type FoundContact,
  type Specialty,
} from "./crawler";
import { DEFAULT_SOURCES, GERMAN_CITIES, HOSPITAL_SEEDS, KEYWORDS } from "./seeds";

export type DiscoverState = {
  running: boolean;
  specialty: Specialty | null;
  startedAt: number | null;
  finishedAt: number | null;
  logs: string[];
  added: number;
  pages: number;
  error: string | null;
};

const g = globalThis as typeof globalThis & { __discover?: DiscoverState };

function initial(): DiscoverState {
  return { running: false, specialty: null, startedAt: null, finishedAt: null, logs: [], added: 0, pages: 0, error: null };
}

export function getDiscoverState(): DiscoverState {
  if (!g.__discover) g.__discover = initial();
  return g.__discover;
}

export async function ensureDefaultSources() {
  const rows = await db.select({ id: sources.id }).from(sources).limit(1);
  if (rows.length) return;
  await db
    .insert(sources)
    .values(DEFAULT_SOURCES.map((s) => ({ ...s, kind: "default" })))
    .onConflictDoNothing();
}

function relevant(text: string, spec: Specialty): boolean {
  const mine = spec === "OTA" ? OTA_RE : ATA_RE;
  return mine.test(text);
}

function pick<T>(arr: T[], n: number): T[] {
  return [...arr].sort(() => Math.random() - 0.5).slice(0, n);
}

async function mapPool<T>(items: T[], n: number, fn: (x: T) => Promise<void>, deadline: number) {
  let i = 0;
  const workers = Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length && Date.now() < deadline) {
      const item = items[i++];
      try {
        await fn(item);
      } catch {
        /* ignore */
      }
    }
  });
  await Promise.all(workers);
}

async function isVisited(key: string, spec: Specialty) {
  const r = await db
    .select({ id: visited.id })
    .from(visited)
    .where(and(eq(visited.key, key), eq(visited.specialty, spec)))
    .limit(1);
  return r.length > 0;
}
async function markVisited(key: string, spec: Specialty) {
  await db.insert(visited).values({ key, specialty: spec }).onConflictDoNothing();
}

type SaveInfo = {
  spec: Specialty;
  hospital: string;
  city: string;
  jobTitle: string;
  jobUrl: string;
  sourceName: string;
  foreign: boolean;
  found: FoundContact[];
};

const HOSPITAL_KW = /klinik|krankenhaus|hospital|gesundheit|medizin|caritas|diakonie|pflege|reha|helios|asklepios|sana|ameos|vivantes|charit|alexianer|agaplesion|johanniter|malteser|srh|contilia|vinzenz|median|mediclin|regiomed/i;

function rootDomain(d: string): string {
  return d.split(".").slice(-2).join(".");
}

async function saveContacts(info: SaveInfo & { hostRoot?: string }): Promise<number> {
  let list = info.found.filter((c) => isValidEmail(c.email));
  // only plausible German hospital addresses
  list = list.filter((c) => {
    const d = c.email.split("@")[1];
    if (info.hostRoot && rootDomain(d) !== info.hostRoot) return false;
    return d.endsWith(".de") || d.endsWith(".eu") || HOSPITAL_KW.test(info.hospital + " " + d);
  });
  const strong = list.filter((c) => c.score >= 30);
  if (strong.length) list = strong;
  else list = list.sort((a, b) => b.score - a.score).slice(0, 1);
  list = list.sort((a, b) => b.score - a.score).slice(0, 6);
  if (!list.length) return 0;
  const rows = list.map((c) => ({
    email: c.email,
    specialty: info.spec,
    hospital: info.hospital.slice(0, 160),
    domain: c.email.split("@")[1],
    contactName: c.contactName,
    role: c.role,
    roleCategory: c.roleCategory,
    phone: c.phone,
    city: info.city,
    jobTitle: info.jobTitle.slice(0, 200),
    jobUrl: info.jobUrl,
    sourceName: info.sourceName,
    foreignFriendly: info.foreign,
    score: c.score + (info.foreign ? 25 : 0) + (info.jobTitle ? 10 : 0),
  }));
  const res = await db.insert(contacts).values(rows).onConflictDoNothing().returning({ id: contacts.id });
  return res.length;
}

const LINK_PRIORITY: [RegExp, number][] = [
  [/pflegedirektion|pflegedirektor|pflegedienstleitung/i, 10],
  [/ansprechpartner|ansprechperson/i, 7],
  [/international|ausland|anerkennung/i, 7],
  [/karriere|jobs|stellen|bewerb|career/i, 6],
  [/kontakt|personal|recruit/i, 5],
  [/an(ä|ae)sthesie|operations|\bop[-_ ]|funktionsdienst|pflege/i, 4],
  [/impressum/i, 2],
];

/** Crawl a hospital website: home + the most relevant sub pages. */
async function deepCrawl(
  baseUrl: string,
  spec: Specialty,
  sourceName: string,
  hospitalHint: string | null,
  deadline: number,
  log: (s: string) => void,
): Promise<number> {
  const host = hostOf(baseUrl);
  if (!host) return 0;
  const home = await fetchText(baseUrl.startsWith("http") ? baseUrl : `https://${baseUrl}`);
  if (!home) return 0;
  const hospital = hospitalHint || guessHospitalName(home, baseUrl);
  const seen = new Set<string>([baseUrl]);
  const queue: { url: string; p: number }[] = [];
  const addLinks = (html: string, from: string) => {
    for (const l of extractLinks(html, from)) {
      if (hostOf(l.url) !== host || seen.has(l.url) || /\.(pdf|jpg|png|zip|docx?)($|\?)/i.test(l.url)) continue;
      const s = l.text + " " + l.url;
      let p = 0;
      for (const [re, w] of LINK_PRIORITY) if (re.test(s)) p = Math.max(p, w);
      if (p > 0) {
        seen.add(l.url);
        queue.push({ url: l.url, p });
      }
    }
  };
  addLinks(home, baseUrl);
  const pages: { url: string; html: string }[] = [{ url: baseUrl, html: home }];
  let fetched = 0;
  while (queue.length && fetched < 9 && Date.now() < deadline) {
    queue.sort((a, b) => b.p - a.p);
    const next = queue.splice(0, 3);
    const got = await Promise.all(next.map((n) => fetchText(n.url, { timeout: 10000 })));
    got.forEach((h, i) => {
      fetched++;
      if (!h) return;
      pages.push({ url: next[i].url, html: h });
      if (fetched <= 5) addLinks(h, next[i].url);
    });
  }
  const all = new Map<string, FoundContact>();
  let foreign = false;
  let city = "";
  let bestUrl = baseUrl;
  for (const pg of pages) {
    const text = htmlToText(pg.html);
    if (FOREIGN_RE.test(text) && /karriere|jobs|stellen|bewerb|international|ausland|anerkennung/i.test(pg.url + getTitle(pg.html)))
      foreign = true;
    if (!city) city = guessCity(text);
    for (const c of extractContacts(pg.html, text)) {
      const prev = all.get(c.email);
      if (!prev || c.score > prev.score) {
        all.set(c.email, c);
        if (!prev || c.score > prev.score) bestUrl = pg.url;
      }
    }
  }
  if (!all.size) return 0;
  const n = await saveContacts({
    spec,
    hospital,
    city,
    jobTitle: "",
    jobUrl: bestUrl,
    sourceName,
    foreign,
    found: [...all.values()],
    hostRoot: rootDomain(host),
  });
  log(`🏥 ${hospital}: ${all.size} ایمیل پیدا شد، ${n} مورد جدید`);
  return n;
}

async function fromArbeitsagentur(spec: Specialty, log: (s: string) => void): Promise<{ url: string; name: string }[]> {
  const out: { url: string; name: string }[] = [];
  const kw = spec === "OTA" ? "Operationstechnischer Assistent" : "Anästhesietechnischer Assistent";
  const headers = { "X-API-Key": "jobboerse-jobsuche", Accept: "application/json" };
  const page = Math.floor(Math.random() * 3) + 1;
  const list = await fetchText(
    `https://rest.arbeitsagentur.de/jobboerse/jobsuche-service/pc/v4/jobs?was=${encodeURIComponent(kw)}&angebotsart=1&size=50&page=${page}&veroeffentlichtseit=60`,
    { headers },
  );
  if (!list) {
    log("⚠️ API بوندسآگنتور در دسترس نبود؛ از روش‌های دیگر ادامه می‌دهم");
    return out;
  }
  try {
    const json = JSON.parse(list) as {
      stellenangebote?: { refnr: string; arbeitgeber?: string; externeUrl?: string }[];
    };
    const jobs = json.stellenangebote ?? [];
    log(`📋 بوندسآگنتور: ${jobs.length} آگهی`);
    for (const j of jobs.slice(0, 40)) {
      if (j.externeUrl) out.push({ url: j.externeUrl, name: "Bundesagentur für Arbeit" });
      const d = await fetchText(
        `https://rest.arbeitsagentur.de/jobboerse/jobsuche-service/pc/v4/jobdetails/${Buffer.from(j.refnr).toString("base64")}`,
        { headers },
      );
      if (!d) continue;
      try {
        const det = JSON.parse(d) as { stellenangebotsBeschreibung?: string; externeUrl?: string; firma?: string; stellenangebotsTitel?: string };
        if (det.externeUrl) out.push({ url: det.externeUrl, name: "Bundesagentur für Arbeit" });
        const text = det.stellenangebotsBeschreibung ?? "";
        if (!text) continue;
        const employer = det.firma || j.arbeitgeber || "";
        if (!/klinik|krankenhaus|hospital|uniklinik|medizin|caritas|diakonie|gesundheit|MVZ/i.test(employer + text.slice(0, 600))) continue;
        const found = extractContacts("", text);
        if (found.length) {
          const n = await saveContacts({
            spec,
            hospital: employer,
            city: guessCity(text),
            jobTitle: det.stellenangebotsTitel ?? "",
            jobUrl: `https://www.arbeitsagentur.de/jobsuche/jobdetail/${j.refnr}`,
            sourceName: "Bundesagentur für Arbeit",
            foreign: FOREIGN_RE.test(text),
            found,
          });
          if (n) g.__discover!.added += n;
        }
      } catch {
        /* ignore */
      }
    }
  } catch {
    log("⚠️ پاسخ API بوندسآگنتور قابل خواندن نبود");
  }
  return out;
}

async function runDiscovery(spec: Specialty) {
  const st = getDiscoverState();
  const deadline = Date.now() + 6 * 60 * 1000;
  const log = (s: string) => {
    st.logs.push(`${new Date().toLocaleTimeString("fa-IR")}  ${s}`);
    if (st.logs.length > 300) st.logs.shift();
  };
  const sourceFound = new Map<string, number>();
  const bumpSource = (name: string, n: number) => sourceFound.set(name, (sourceFound.get(name) ?? 0) + n);

  await ensureDefaultSources();
  const srcs = await db.select().from(sources).where(eq(sources.enabled, true));
  log(`🔎 شروع جستجو برای ${spec} با ${srcs.length} منبع`);

  const candidates = new Map<string, string>(); // url -> source name
  const mine = spec === "OTA" ? OTA_RE : ATA_RE;
  const kws = KEYWORDS[spec];

  // A) sources
  await mapPool(
    srcs,
    3,
    async (s) => {
      const host = hostOf(s.url);
      if (host.includes("arbeitsagentur")) {
        const ext = await fromArbeitsagentur(spec, log);
        ext.forEach((e) => candidates.set(e.url, s.name));
      }
      const first = await fetchText(s.url);
      const pagesToScan: string[] = [];
      if (first) {
        pagesToScan.push(first);
        // pagination
        const pag = extractLinks(first, s.url)
          .filter((l) => hostOf(l.url) === host && /[?&](start|page|seite|p|offset)=\d+/i.test(l.url))
          .map((l) => l.url);
        const uniq = [...new Set(pag)].slice(0, 14);
        const more = await Promise.all(uniq.map((u) => fetchText(u, { timeout: 10000 })));
        more.forEach((m) => m && pagesToScan.push(m));
        // search-style URLs
        if (!/[?&](q|was|search|s|keywords?)=/i.test(s.url)) {
          const kw = spec === "OTA" ? "OTA" : "ATA";
          const o = new URL(s.url);
          for (const key of ["q", "search", "s"]) {
            const u = `${o.origin}${o.pathname}?${key}=${kw}`;
            const h = await fetchText(u, { timeout: 8000 });
            if (h && extractLinks(h, u).some((l) => mine.test(l.text + " " + l.url))) {
              pagesToScan.push(h);
              break;
            }
          }
        }
      }
      let count = 0;
      for (const html of pagesToScan) {
        for (const l of extractLinks(html, s.url)) {
          if (mine.test(l.text) || mine.test(decodeURIComponent(l.url).replace(/[-_+]/g, " "))) {
            if (!candidates.has(l.url) && count < 60) {
              candidates.set(l.url, s.name);
              count++;
            }
          }
        }
      }
      // The page itself might be a job ad / contact page
      candidates.set(s.url, s.name);
      log(`🌐 ${s.name}: ${count} لینک آگهی مرتبط`);
      await db.update(sources).set({ lastRunAt: new Date() }).where(eq(sources.id, s.id));
    },
    deadline,
  );

  // B) web searches
  const cities = pick(GERMAN_CITIES, 4);
  const queries: string[] = [];
  for (const c of cities) {
    queries.push(`${pick(kws, 1)[0]} ${c} Krankenhaus Bewerbung Ansprechpartner Pflegedirektion`);
    queries.push(`${pick(kws, 1)[0]} ${c} Klinikum Ausland Anerkennung Fachkräfte`);
  }
  queries.push(`${pick(kws, 1)[0]} Ansprechpartner für Rückfragen Pflegedirektion Klinikum`);
  let searchHits = 0;
  for (const q of queries) {
    if (Date.now() > deadline) break;
    const first = Math.random() < 0.6 ? 1 : 11;
    const res = await bingSearch(q, first);
    for (const u of res) {
      if (!candidates.has(u)) {
        candidates.set(u, "جستجوی وب");
        searchHits++;
      }
    }
    await sleep(500);
  }
  log(`🔍 جستجوی وب: ${searchHits} صفحه`);

  // C) process candidate pages
  const hospitalDomains = new Map<string, { name: string; url: string; src: string }>();
  const toProcess: [string, string][] = [];
  for (const [url, src] of candidates) {
    if (await isVisited(url, spec)) continue;
    toProcess.push([url, src]);
  }
  const limited = pick(toProcess, 90);
  log(`📄 بررسی ${limited.length} صفحه آگهی…`);
  await mapPool(
    limited,
    5,
    async ([url, src]) => {
      await markVisited(url, spec);
      const html = await fetchText(url);
      if (!html) return;
      st.pages++;
      const text = htmlToText(html);
      if (!relevant(text, spec)) return;
      const found = extractContacts(html, text);
      const hospital = guessHospitalName(html, url);
      const foreign = FOREIGN_RE.test(text);
      let n = 0;
      if (found.length) {
        n = await saveContacts({
          spec,
          hospital,
          city: guessCity(text),
          jobTitle: guessJobTitle(html),
          jobUrl: url,
          sourceName: src,
          foreign,
          found,
        });
        st.added += n;
        bumpSource(src, n);
        if (n) log(`✉️ ${hospital}: ${n} ایمیل جدید`);
      }
      const dom = found.find((f) => f.score > 5)?.email.split("@")[1];
      if (dom && !hospitalDomains.has(dom)) hospitalDomains.set(dom, { name: hospital, url: `https://www.${dom.replace(/^www\./, "")}`, src });
    },
    deadline,
  );

  // D) enrich hospitals found in ads + seeds (nursing management pages)
  const targets: { name: string; url: string; src: string }[] = [];
  for (const [dom, v] of hospitalDomains) {
    if (!(await isVisited(`site:${dom}`, spec))) targets.push({ ...v, url: `https://www.${dom}` });
  }
  const seedPool: { name: string; url: string; src: string }[] = [];
  for (const s of pick(HOSPITAL_SEEDS, HOSPITAL_SEEDS.length)) {
    if (seedPool.length >= 12) break;
    if (!(await isVisited(`site:${hostOf(s.url)}`, spec))) seedPool.push({ name: s.name, url: s.url, src: "فهرست بیمارستان‌ها" });
  }
  const enrich = [...pick(targets, 10), ...seedPool];
  log(`🏥 بررسی عمیق وب‌سایت ${enrich.length} بیمارستان (مدیریت پرستاری / منابع انسانی)…`);
  await mapPool(
    enrich,
    4,
    async (t) => {
      const host = hostOf(t.url);
      await markVisited(`site:${host}`, spec);
      let n = await deepCrawl(t.url, spec, t.src, t.name.includes("www.") ? null : t.name, deadline, log);
      if (!n && !t.url.includes("://www.")) n = await deepCrawl(`https://www.${host}`, spec, t.src, t.name, deadline, log);
      st.added += n;
      bumpSource(t.src, n);
    },
    deadline,
  );

  // update source stats
  for (const s of srcs) {
    const n = sourceFound.get(s.name) ?? 0;
    await db.update(sources).set({ lastFound: n }).where(eq(sources.id, s.id));
  }
  const total = await db.execute(sql`select count(*)::int as c from contacts where specialty = ${spec} and exported_at is null`);
  const avail = (total.rows[0] as { c: number }).c;
  log(`✅ پایان جستجو: ${st.added} ایمیل جدید اضافه شد. موجودی استفاده‌نشده ${spec}: ${avail}`);
}

export function startDiscovery(spec: Specialty): boolean {
  const st = getDiscoverState();
  if (st.running) return false;
  g.__discover = { ...initial(), running: true, specialty: spec, startedAt: Date.now() };
  runDiscovery(spec)
    .catch((e: unknown) => {
      const s = getDiscoverState();
      s.error = e instanceof Error ? e.message : String(e);
      s.logs.push(`❌ خطا: ${s.error}`);
    })
    .finally(() => {
      const s = getDiscoverState();
      s.running = false;
      s.finishedAt = Date.now();
    });
  return true;
}
