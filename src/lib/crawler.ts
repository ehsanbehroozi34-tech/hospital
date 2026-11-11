// Standalone crawling helpers (no DB imports) — fetch pages, search, extract contacts.

export type Specialty = "OTA" | "ATA";

export type FoundContact = {
  email: string;
  contactName: string;
  role: string;
  roleCategory: "pflege" | "op" | "hr" | "general";
  phone: string;
  score: number;
};

export const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

export const OTA_RE =
  /\bOTA\b|Operationstechnisch|OP-Pflege|OP-Fachkraft|OP-Dienst|Operationsdienst|OP-Assistent|Operationsassistent|OP-Schwester|OP-Pfleger|Chirurgisch-?technisch|OP-Management/i;
export const ATA_RE =
  /\bATA\b|An(ä|ae)sthesietechnisch|An(ä|ae)sthesie-?pflege|An(ä|ae)sthesiefachkraft|Fachkraft f(ü|ue)r An(ä|ae)sthesie|An(ä|ae)sthesie-?assistent|An(ä|ae)sthesie-?schwester|An(ä|ae)sthesie-?pfleger/i;

export const FOREIGN_RE =
  /aus dem Ausland|Ausland(s?erfahrung|skr)|ausl(ä|ae)ndische|Anerkennung|Anerkennungsverfahren|internationale[nr]?\s+(Fachkr|Pflege|Mitarbeit|Bewerb|Recruit|Team)|Visum|Visa\b|Relocation|Fachkr(ä|ae)fte aus|Drittstaat|Einwanderung|Integrationsbegleit|Berufsanerkennung|Anpassungslehrgang|Kenntnispr(ü|ue)fung|Sprachkurs|Recruiting aus|Pflegefachkr(ä|ae)fte aus|Willkommenskultur|Welcome Center|Gleichwertigkeit/i;

const BAD_DOMAINS = [
  "indeed.", "medi-karriere.", "arbeitsagentur.", "jobware.", "stepstone.", "xing.", "linkedin.",
  "kimeta.", "google.", "bing.", "sentry", "wixpress", "example.", "schema.org", "w3.org",
  "facebook.", "instagram.", "twitter.", "jobvector.", "monster.", "meinestadt.", "stellenanzeigen.",
  "jooble.", "adzuna.", "praktischarzt.", "pflegeboard.", "karriere.at", "kununu.", "glassdoor.",
  "rexx-systems.", "softgarden.", "personio.", "bewerbermanagement.", "wordpress.",
  "gmail.", "gmx.", "web.de", "yahoo.", "outlook.", "hotmail.", "t-online.", "icloud.", "freenet.",
  "bundesregierung.", "wikipedia.", "youtube.", "duckduckgo.", "microsoft.", "apple.com",
];
const BAD_LOCALS = [
  "noreply", "no-reply", "donotreply", "do-not-reply", "datenschutz", "privacy", "webmaster",
  "abuse", "mailer-daemon", "postmaster", "presse", "press", "support", "newsletter", "spam",
  "dsb", "datenschutzbeauftragte", "impressum", "marketing", "einkauf", "rechnung", "buchhaltung",
  "patientenaufnahme", "aufnahme", "spenden", "sponsoring", "beschwerde", "lob", "ehrenamt",
];

export function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&auml;/g, "ä").replace(/&ouml;/g, "ö").replace(/&uuml;/g, "ü")
    .replace(/&Auml;/g, "Ä").replace(/&Ouml;/g, "Ö").replace(/&Uuml;/g, "Ü")
    .replace(/&szlig;/g, "ß");
}

function decodeCf(hex: string): string {
  try {
    const r = parseInt(hex.slice(0, 2), 16);
    let out = "";
    for (let i = 2; i < hex.length; i += 2) {
      out += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16) ^ r);
    }
    return out;
  } catch {
    return "";
  }
}

export async function fetchText(
  url: string,
  opts: { timeout?: number; headers?: Record<string, string> } = {},
): Promise<string | null> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), opts.timeout ?? 12000);
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect: "follow",
      headers: {
        "User-Agent": UA,
        "Accept-Language": "de-DE,de;q=0.9,en;q=0.5",
        Accept: "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.5",
        ...(opts.headers ?? {}),
      },
    });
    if (!res.ok) {
      clearTimeout(t);
      return null;
    }
    const ct = res.headers.get("content-type") ?? "";
    if (/pdf|image|video|zip|octet-stream|font/i.test(ct)) {
      clearTimeout(t);
      return null;
    }
    const buf = await res.arrayBuffer();
    clearTimeout(t);
    if (buf.byteLength > 3_000_000) return null;
    return new TextDecoder("utf-8").decode(buf);
  } catch {
    return null;
  }
}

export function htmlToText(html: string): string {
  let h = html;
  // Cloudflare protected e-mails
  h = h.replace(/<a[^>]*data-cfemail="([0-9a-f]+)"[^>]*>[\s\S]*?<\/a>/gi, (_, hex) => ` ${decodeCf(hex)} `);
  h = h.replace(/<span[^>]*data-cfemail="([0-9a-f]+)"[^>]*>[\s\S]*?<\/span>/gi, (_, hex) => ` ${decodeCf(hex)} `);
  // keep mailto addresses visible
  h = h.replace(/<a[^>]*href=["']mailto:([^"'?]+)[^"']*["'][^>]*>/gi, (m, addr: string) => {
    let a = addr;
    try {
      a = decodeURIComponent(addr);
    } catch {
      /* ignore */
    }
    return ` ${a} ${m}`;
  });
  h = h.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ");
  h = h.replace(/<!--[\s\S]*?-->/g, " ");
  h = h.replace(/<(br|\/p|\/div|\/li|\/tr|\/h\d|\/td|\/section)[^>]*>/gi, "\n");
  h = h.replace(/<[^>]+>/g, " ");
  h = decodeEntities(h);
  // de-obfuscate
  h = h
    .replace(/\s*[\[(]\s*(at|ät|AT)\s*[\])]\s*/g, "@")
    .replace(/\s*[\[(]\s*(dot|punkt)\s*[\])]\s*/gi, ".");
  h = h.replace(/[ \t\u00a0]+/g, " ").replace(/\n\s*\n+/g, "\n");
  return h;
}

export function getTitle(html: string): string {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return m ? decodeEntities(m[1]).replace(/\s+/g, " ").trim() : "";
}

export function getMeta(html: string, prop: string): string {
  const re = new RegExp(
    `<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']*)["']|<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${prop}["']`,
    "i",
  );
  const m = html.match(re);
  return m ? decodeEntities(m[1] ?? m[2] ?? "").trim() : "";
}

export function extractLinks(html: string, base: string): { url: string; text: string }[] {
  const out: { url: string; text: string }[] = [];
  const re = /<a\s[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    try {
      const u = new URL(decodeEntities(m[1]), base);
      if (!/^https?:$/.test(u.protocol)) continue;
      const text = decodeEntities(m[2].replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
      out.push({ url: u.toString(), text });
    } catch {
      /* ignore */
    }
  }
  return out;
}

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

export function isValidEmail(email: string): boolean {
  const e = email.toLowerCase();
  if (!/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(e)) return false;
  if (/\.(png|jpe?g|gif|svg|webp|css|js|pdf)$/.test(e)) return false;
  const [local, domain] = e.split("@");
  if (BAD_DOMAINS.some((d) => domain.includes(d))) return false;
  if (BAD_LOCALS.some((l) => local === l || local.startsWith(l + "."))) return false;
  if (/ausbildung|praktikum|freiwillig|bundesfreiwillig|\bbfd\b|^bfd|^fsj|azubi|studium|patient|besucher|akademie|schule|fortbildung|beschwerde|seelsorge|spende|wohnung|rechnung|kasse|labor|apotheke|archiv|datenschutz|presse|erecruiter|stipendi|kita/.test(local)) return false;
  if (local.length < 2 || local.length > 64) return false;
  return true;
}

const ROLE_PATTERNS: { re: RegExp; cat: FoundContact["roleCategory"]; label: string; score: number }[] = [
  { re: /stellv\.?\s*Pflegedirektor(in)?|stellvertretende[rn]?\s+Pflegedirektor(in)?/i, cat: "pflege", label: "Stellv. Pflegedirektor/in", score: 55 },
  { re: /Pflegedirektor(in)?|Pflegedirektion|Direktor(in)?\s+Pflege|Leitung\s+Pflegedirektion/i, cat: "pflege", label: "Pflegedirektion", score: 60 },
  { re: /Pflegedienstleitung|Pflegedienstleiter(in)?|\bPDL\b|Pflegerische[rn]?\s+Leitung|Pflegemanagement|Pflegeleitung|Leitung\s+Pflege/i, cat: "pflege", label: "Pflegedienstleitung (PDL)", score: 55 },
  { re: /Gesamtleitung\s+OP|OP-Management|OP-Leitung|Leitung\s+(des\s+)?(Zentral-?)?OP|Zentral-?OP|OP-Koordination|Leitung\s+Operationsdienst|Leitung\s+An(ä|ae)sthesie(pflege)?|An(ä|ae)sthesie-?Leitung|Leitende[rn]?\s+(OTA|ATA)|Funktionsdienst(leitung)?|Leitung\s+Funktionsdienst/i, cat: "op", label: "OP-/Anästhesie-Leitung", score: 50 },
  { re: /Personalreferent(in)?|Recruiting|Recruiter(in)?|Personalabteilung|Personalmanagement|Personalgewinnung|Human\s+Resources|\bHR\b|Bewerbermanagement|Talent\s+Acquisition|Personalmarketing|Personalleitung|Personalsachbearbeit|Ansprechpartner(in)?\s+f(ü|ue)r\s+R(ü|ue)ckfragen|Karriereberatung|Personalservice/i, cat: "hr", label: "Personal / Recruiting", score: 40 },
];

const NAME_WORD =
  "(?!Pflege|Abteilung|Leitung|Direkt|Personal|Telefon|Tel\\b|Mail|Fax|Ansprech|Bereich|Klinik|Zentral|Stellv|Recruit|Assist|Sekret|Referent|Frau|Herr|Human|Gesch|Bewerb|Karriere|Kontakt|Ausbildung|Praxis|Station|Oberarzt|Chefarzt|Leiter|Manag|Team|Anästhesie|Operations|Funktions)[A-ZÄÖÜ][a-zäöüß]+";
const NAME_RE = new RegExp(
  `(Frau|Herr)\\s+(?:(?:Prof\\.?|Dr\\.?|med\\.?|PD)\\s*)*${NAME_WORD}(?:[-\\s]${NAME_WORD})?`,
  "g",
);
const PHONE_RE = /(?:\+49|0049|0)[\s\d()/.-]{7,22}\d/g;

function localCategory(email: string): { cat: FoundContact["roleCategory"]; role: string; score: number } {
  const local = email.split("@")[0].toLowerCase();
  if (/pflegedirektion|pflegedienstleitung|pflegedirektor|^pdl|pflegemanagement|pflegeleitung/.test(local))
    return { cat: "pflege", role: "Pflegedirektion (Funktionsadresse)", score: 55 };
  if (/^op[-._]|opleitung|op-management|zentral-?op|anaesthesie|anästhesie/.test(local))
    return { cat: "op", role: "OP-/Anästhesie (Funktionsadresse)", score: 45 };
  if (/bewerbung|karriere|personal|recruiting|^hr$|^hr[._-]|jobs|stellen|career|bewerber|talent|human/.test(local))
    return { cat: "hr", role: "Personal / Bewerbungen", score: 35 };
  if (/^(info|kontakt|zentrale|mail|office|verwaltung|sekretariat|post|service)$/.test(local))
    return { cat: "general", role: "Allgemein", score: 5 };
  return { cat: "general", role: "", score: 12 };
}

/** Extract e-mail contacts with name/role context from the page text. */
export function extractContacts(html: string, text?: string): FoundContact[] {
  const t = text ?? htmlToText(html);
  const found = new Map<string, FoundContact>();
  const re = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(t))) {
    const email = m[0].replace(/^[._-]+|[._-]+$/g, "").toLowerCase();
    if (!isValidEmail(email)) continue;
    const start = Math.max(0, m.index - 280);
    const before = t.slice(start, m.index);
    const after = t.slice(m.index, m.index + 140);
    const ctx = before + " " + after;

    // name: closest preceding match
    let name = "";
    let nm: RegExpExecArray | null;
    NAME_RE.lastIndex = 0;
    while ((nm = NAME_RE.exec(before))) name = nm[0].replace(/\s+/g, " ").trim();
    if (!name) {
      NAME_RE.lastIndex = 0;
      const a = NAME_RE.exec(after);
      if (a) name = a[0].replace(/\s+/g, " ").trim();
    }

    // role by context
    let role = "";
    let cat: FoundContact["roleCategory"] = "general";
    let score = 0;
    for (const p of ROLE_PATTERNS) {
      if (p.re.test(ctx) && p.score > score) {
        role = p.label;
        cat = p.cat;
        score = p.score;
      }
    }
    const lc = localCategory(email);
    if (lc.score > score) {
      role = role || lc.role;
      cat = lc.cat;
      score = lc.score;
    }
    if (!role) role = lc.role;
    if (name) score += 8;

    // phone
    const pm = (before.slice(-120) + after).match(PHONE_RE);
    const phone = pm ? pm[0].replace(/\s+/g, " ").trim() : "";

    const prev = found.get(email);
    const cand: FoundContact = { email, contactName: name, role, roleCategory: cat, phone, score };
    if (!prev || cand.score > prev.score) found.set(email, cand);
  }
  return [...found.values()];
}

function jsonStr(x: string): string {
  return decodeEntities(x.replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16))).replace(/\\\//g, "/"));
}

export function guessHospitalName(html: string, url: string): string {
  const title = getTitle(html);
  const site = getMeta(html, "og:site_name");
  const KW =
    /(Klinik|Krankenhaus|Klinikum|Uniklinik|Universit(ä|ae)t|Hospital|Kliniken|Helios|Asklepios|Sana|Ameos|Vivantes|Charit(é|e)|Diakonie|Caritas|St\.|Medizinisches Zentrum|MVZ|Fachklinik|Rehaklinik|Rhön|Agaplesion|Alexianer|Johanniter|Malteser|Schön|Median|Paracelsus|Regiomed|Mediclin|Marienhospital|Elisabeth|Kreisklinik|Stadtklinik|Gesundheit)/i;
  const parts = title.split(/\s[-–|·•:]\s/).map((s) => s.trim()).filter(Boolean);
  const hit = parts.find((p) => KW.test(p) && p.length < 90 && !/Stellenangebot|Jobs?\b/i.test(p));
  if (hit) return hit.replace(/\s*\(m\/w\/d\)\s*/gi, "").trim();
  const arb = html.match(/"hiringOrganization"[\s\S]{0,200}?"name"\s*:\s*"([^"]+)"/);
  if (arb) return jsonStr(arb[1]);
  if (site && KW.test(site)) return site;
  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (h1) {
    const s = decodeEntities(h1[1].replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
    if (KW.test(s) && s.length < 90) return s;
  }
  if (site) return site;
  return hostOf(url);
}

export function guessCity(text: string): string {
  const m = text.match(/\b(\d{5})\s+([A-ZÄÖÜ][a-zäöüß]+(?:[\s-][A-ZÄÖÜ][a-zäöüß]+)?)/);
  return m ? m[2] : "";
}

export function guessJobTitle(html: string): string {
  const jp = html.match(/"@type"\s*:\s*"JobPosting"[\s\S]{0,400}?"title"\s*:\s*"([^"]+)"/);
  if (jp) return jsonStr(jp[1]);
  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (h1) return decodeEntities(h1[1].replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim().slice(0, 140);
  return getTitle(html).slice(0, 140);
}

/** Search Bing (HTML) and return result URLs. */
export async function bingSearch(query: string, first = 1): Promise<string[]> {
  const url = `https://www.bing.com/search?q=${encodeURIComponent(query)}${first > 1 ? `&first=${first}` : ""}`;
  const html = await fetchText(url, { timeout: 15000 });
  if (!html) return [];
  const urls: string[] = [];
  const blocks = html.split('<li class="b_algo"').slice(1);
  for (const b of blocks) {
    const m = b.match(/<h2[^>]*>\s*<a[^>]*href="([^"]+)"/i);
    if (!m) continue;
    let href = decodeEntities(m[1]);
    const u = href.match(/[?&]u=a1([A-Za-z0-9_-]+)/);
    if (u) {
      try {
        href = Buffer.from(u[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
      } catch {
        continue;
      }
    }
    if (/^https?:\/\//.test(href) && !/bing\.com|wikipedia\.org|youtube\.com/.test(href)) urls.push(href);
  }
  return [...new Set(urls)];
}

export function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
