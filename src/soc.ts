/**
 * Client for the UCLA Schedule of Classes public endpoints.
 *
 * The SoC site has no official API; these are the AJAX endpoints its own
 * front-end uses:
 *   - Terms:      embedded <option class="select_term"> tags on /ro/public/soc
 *   - Subjects:   /ro/ClassSearch/Public/Search/GetSimpleSearchData (embedded JSON)
 *   - Courses:    /ro/Public/SOC/Results/CourseTitlesView (paged, 25/page)
 *   - Sections:   /ro/Public/SOC/Results/GetCourseSummary
 *                 (root course model -> lectures; child model -> discussions/labs)
 */

import * as cheerio from "cheerio";

const BASE = "https://sa.ucla.edu";
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) ucla-soc-mcp/1.0";
const PAGE_SIZE = 25;

export type Availability =
  | "any"
  | "open"
  | "waitlist"
  | "open_or_waitlist"
  | "closed"
  | "cancelled";

const AVAILABILITY_FLAGS: Record<Availability, string> = {
  any: "O,W,C,X,T,S",
  open: "O",
  waitlist: "W",
  open_or_waitlist: "O,W",
  closed: "C",
  cancelled: "X",
};

export interface Term {
  code: string;
  name: string;
  is_registrar_default: boolean;
}

export interface SubjectArea {
  code: string;
  label: string;
}

/** Model object the SoC front-end passes to GetCourseSummary. */
interface CourseModel {
  Term: string;
  SubjectAreaCode: string;
  CatalogNumber: string;
  IsRoot: boolean;
  SessionGroup: string | null;
  ClassNumber: string | null;
  SequenceNumber: string | null;
  Path: string;
  MultiListedClassFlag: string;
  Token: string;
}

export interface CourseListing {
  course_key: string;
  catalog_number: string;
  title: string;
  model: CourseModel;
}

export interface Section {
  section: string;
  class_id: string | null;
  class_no: string | null;
  status: string;
  enrolled: number | null;
  enrollment_capacity: number | null;
  spots_left: number | null;
  waitlist: string;
  days: string;
  time: string;
  location: string;
  units: string;
  instructor: string;
  detail_url: string | null;
  subsections?: Section[];
}

async function socFetchUrl(url: URL): Promise<string> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 25_000);
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent": USER_AGENT,
          "X-Requested-With": "XMLHttpRequest",
        },
        signal: controller.signal,
      });
      if (!res.ok) {
        throw new Error(`UCLA SoC returned HTTP ${res.status} for ${url.pathname}`);
      }
      return await res.text();
    } catch (err) {
      lastError = err;
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error(`Failed to reach UCLA SoC (${url.pathname}): ${String(lastError)}`);
}

async function socFetch(path: string, params: Record<string, string>): Promise<string> {
  const url = new URL(BASE + path);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return socFetchUrl(url);
}

function decodeEntities(s: string): string {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function buildFilterFlags(availability: Availability): string {
  return JSON.stringify({
    enrollment_status: AVAILABILITY_FLAGS[availability],
    advanced: "y",
    meet_days: "M,T,W,R,F",
    start_time: "12:00 am",
    end_time: "11:00 pm",
    meet_locations: null,
    meet_units: null,
    instructor: null,
    class_career: null,
    impacted: null,
    enrollment_restrictions: null,
    enforced_requisites: null,
    individual_studies: null,
    summer_session: null,
  });
}

// ---------------------------------------------------------------- terms

let termsCache: { at: number; terms: Term[] } | null = null;

export async function getTerms(): Promise<Term[]> {
  if (termsCache && Date.now() - termsCache.at < 60 * 60 * 1000) {
    return termsCache.terms;
  }
  const html = await socFetch("/ro/public/soc", {});
  const terms: Term[] = [];
  const re =
    /<option class="select_term" value="([^"]+)"\s+data-yearText="([^"]*)"([^>]*)>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    terms.push({
      code: m[1],
      name: m[2],
      is_registrar_default: m[3].includes("selected"),
    });
  }
  if (terms.length === 0) {
    throw new Error("Could not parse term list from the SoC page (site layout may have changed).");
  }
  termsCache = { at: Date.now(), terms };
  return terms;
}

export async function resolveTerm(input: string): Promise<Term> {
  const terms = await getTerms();
  const needle = input.trim().toLowerCase();
  const found =
    terms.find((t) => t.code.toLowerCase() === needle) ??
    terms.find((t) => t.name.toLowerCase() === needle) ??
    terms.find((t) => t.name.toLowerCase().includes(needle));
  if (!found) {
    const codes = terms.map((t) => `${t.code} (${t.name})`).join(", ");
    throw new Error(`Unknown term "${input}". Available terms: ${codes}`);
  }
  return found;
}

// ------------------------------------------------------------- subjects

const subjectsCache = new Map<string, { at: number; subjects: SubjectArea[] }>();

export async function getSubjectAreas(termCode: string): Promise<SubjectArea[]> {
  const cached = subjectsCache.get(termCode);
  if (cached && Date.now() - cached.at < 12 * 60 * 60 * 1000) {
    return cached.subjects;
  }
  const html = await socFetch("/ro/ClassSearch/Public/Search/GetSimpleSearchData", {
    term_cd: termCode,
    search_type: "subject",
  });
  const m = html.match(/'(\[[^']*\])',\s*'select_filter_subject'/);
  if (!m) {
    throw new Error(
      `Could not parse subject areas for term ${termCode} (no data in SoC response).`
    );
  }
  const raw = JSON.parse(decodeEntities(m[1])) as { label: string; value: string }[];
  const subjects = raw.map((s) => ({ code: s.value.trim(), label: s.label }));
  subjectsCache.set(termCode, { at: Date.now(), subjects });
  return subjects;
}

export async function resolveSubjectArea(
  termCode: string,
  input: string
): Promise<SubjectArea> {
  const subjects = await getSubjectAreas(termCode);
  const needle = input.trim().toLowerCase();
  const byCode = subjects.find((s) => s.code.toLowerCase() === needle);
  if (byCode) return byCode;
  const byLabel = subjects.filter((s) => s.label.toLowerCase().includes(needle));
  if (byLabel.length === 1) return byLabel[0];
  if (byLabel.length > 1) {
    const opts = byLabel.slice(0, 8).map((s) => `"${s.code}" (${s.label})`).join(", ");
    throw new Error(
      `Subject area "${input}" is ambiguous for term ${termCode}. Matches: ${opts}`
    );
  }
  throw new Error(
    `Subject area "${input}" not found for term ${termCode}. ` +
      `Use the list_subject_areas tool to see valid codes (e.g. "COM SCI", "MATH", "EC ENGR").`
  );
}

// ------------------------------------------------------- course listing

function buildSearchModel(termCode: string, subject: SubjectArea): string {
  return JSON.stringify({
    subj_area_cd: subject.code,
    search_by: "subject",
    term_cd: termCode,
    SubjectAreaName: subject.label,
    CrsCatlgName: "",
    ActiveEnrollmentFlag: "n",
    HasData: "True",
  });
}

function parseModels(html: string): Map<string, CourseModel> {
  const models = new Map<string, CourseModel>();
  const re = /AddToCourseData\("([^"]+)",\s*(\{.*?\})\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    try {
      models.set(m[1], JSON.parse(m[2]) as CourseModel);
    } catch {
      // skip malformed model blobs
    }
  }
  return models;
}

async function fetchCoursePage(
  termCode: string,
  subject: SubjectArea,
  availability: Availability,
  pageNumber: number
): Promise<CourseListing[]> {
  const html = await socFetch("/ro/Public/SOC/Results/CourseTitlesView", {
    search_by: "subject",
    model: buildSearchModel(termCode, subject),
    pageNumber: String(pageNumber),
    filterFlags: buildFilterFlags(availability),
  });
  const models = parseModels(html);
  const listings: CourseListing[] = [];
  const titleRe = /id="([A-Z0-9]+)-title"[^>]*>([^<]+)</g;
  let m: RegExpExecArray | null;
  while ((m = titleRe.exec(html)) !== null) {
    const key = m[1];
    const model = models.get(key);
    if (!model) continue;
    const text = decodeEntities(m[2]).trim();
    const sep = text.indexOf(" - ");
    listings.push({
      course_key: key,
      catalog_number: sep > 0 ? text.slice(0, sep).trim() : text,
      title: sep > 0 ? text.slice(sep + 3).trim() : text,
      model,
    });
  }
  return listings;
}

export async function searchCourses(
  termCode: string,
  subject: SubjectArea,
  availability: Availability,
  maxPages = 12
): Promise<{ courses: CourseListing[]; truncated: boolean }> {
  const courses: CourseListing[] = [];
  let truncated = false;
  for (let page = 1; page <= maxPages; page++) {
    const listings = await fetchCoursePage(termCode, subject, availability, page);
    courses.push(...listings);
    if (listings.length < PAGE_SIZE) return { courses, truncated };
    if (page === maxPages) truncated = true;
  }
  return { courses, truncated };
}

// ------------------------------------------------------ section details

function cellText($row: cheerio.Cheerio<any>, selector: string): string {
  const el = $row.find(selector).first();
  if (el.length === 0) return "";
  return el
    .text()
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .join("\n");
}

function firstLine(s: string): string {
  return s.split("\n")[0] ?? "";
}

function parseSections(html: string): { sections: Section[]; models: CourseModel[] } {
  // Preserve line breaks inside cells so multi-line values stay separable.
  const prepared = html.replace(/<br\s*\/?>/gi, "\n").replace(/<\/p>/gi, "\n");
  const $ = cheerio.load(prepared);
  // Drop mobile-only duplicates (e.g. the day chip repeated inside the time cell).
  $(".hide-above-small").remove();
  const allModels = parseModels(html);

  const sections: Section[] = [];
  const models: CourseModel[] = [];

  $("div.data_row").each((_i, el) => {
    const $row = $(el);
    const path = $row.attr("id") ?? "";

    const link = $row.find(".sectionColumn a").first();
    const sectionName = (link.length ? link.text() : $row.find(".sectionColumn").text())
      .trim()
      .replace(/\s+/g, " ");

    let classId: string | null = null;
    let classNo: string | null = null;
    let detailUrl: string | null = null;
    const href = link.attr("href");
    if (href) {
      detailUrl = BASE + href;
      try {
        const q = new URL(BASE + href).searchParams;
        classId = q.get("class_id");
        classNo = (q.get("class_no") ?? "").trim() || null;
      } catch {
        // leave nulls if the href is not a normal ClassDetail link
      }
    }

    const statusText = cellText($row, ".statusColumn");
    const status = firstLine(statusText);
    const enrollMatch = statusText.match(/(\d+)\s+of\s+(\d+)\s+Enrolled/i);
    const spotsMatch = statusText.match(/(\d+)\s+Spots?\s+Left/i);
    const capMatch = statusText.match(/Class Full \((\d+)\)/i);

    const section: Section = {
      section: sectionName,
      class_id: classId,
      class_no: classNo,
      status: status || "Unknown",
      enrolled: enrollMatch ? Number(enrollMatch[1]) : null,
      enrollment_capacity: enrollMatch
        ? Number(enrollMatch[2])
        : capMatch
          ? Number(capMatch[1])
          : null,
      spots_left: spotsMatch
        ? Number(spotsMatch[1])
        : enrollMatch
          ? Math.max(0, Number(enrollMatch[2]) - Number(enrollMatch[1]))
          : capMatch
            ? 0
            : null,
      waitlist: cellText($row, ".waitlistColumn").replace(/\n/g, " ") || "n/a",
      days: firstLine(cellText($row, ".dayColumn")) || "-",
      time: cellText($row, ".timeColumn").replace(/\n/g, "") || "-",
      location: cellText($row, ".locationColumn").replace(/\n/g, "; ") || "-",
      units: firstLine(cellText($row, ".unitsColumn")) || "-",
      instructor: cellText($row, ".instructorColumn").replace(/\n/g, "; ") || "-",
      detail_url: detailUrl,
    };
    sections.push(section);

    const model = allModels.get(path);
    if (model) models.push(model);
    else models.push(null as unknown as CourseModel);
  });

  return { sections, models };
}

async function fetchCourseSummary(
  model: CourseModel,
  availability: Availability
): Promise<{ sections: Section[]; models: CourseModel[] }> {
  const html = await socFetch("/ro/Public/SOC/Results/GetCourseSummary", {
    model: JSON.stringify(model),
    FilterFlags: buildFilterFlags(availability),
  });
  return parseSections(html);
}

/**
 * Full detail for one course: top-level sections (lectures/seminars) each with
 * their subsections (discussions/labs) fetched via the child model.
 */
export async function getCourseSections(
  listing: CourseListing,
  availability: Availability = "any"
): Promise<Section[]> {
  const { sections, models } = await fetchCourseSummary(listing.model, availability);

  await Promise.all(
    sections.map(async (section, i) => {
      const childModel = models[i];
      if (!childModel) return;
      try {
        const child = await fetchCourseSummary(childModel, availability);
        if (child.sections.length > 0) section.subsections = child.sections;
      } catch {
        // A lecture with no subsections is normal; ignore child fetch errors.
      }
    })
  );

  return sections;
}

// ---------------------------------------------------- class detail page

export interface FinalExam {
  date: string;
  day: string;
  time: string;
  location: string;
}

export interface Requisite {
  course: string;
  course_title: string | null;
  connector: string | null;
  minimum_grade: string | null;
  prerequisite: boolean;
  corequisite: boolean;
  type: string;
}

interface ClassDetailPage {
  final_exam: FinalExam | null;
  final_exam_note: string | null;
  requisites: Requisite[];
  requisites_text: string | null;
  grading_type: string | null;
  enrollment_restrictions: string | null;
  impacted: string | null;
  individual_studies: string | null;
  level: string | null;
  course_description: string | null;
  class_description: string | null;
  general_education: string | null;
  class_notes: string | null;
}

export interface ClassDetail extends ClassDetailPage {
  section: string;
  class_id: string | null;
  detail_url: string;
  status: string;
  days: string;
  time: string;
  location: string;
  units: string;
  instructor: string;
}

function blockText($el: cheerio.Cheerio<any>): string {
  return $el
    .text()
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .join("\n");
}

/** Treat the registrar's "---" placeholder as absent; keep line breaks. */
function textOrNull(s: string): string | null {
  const t = s.trim();
  return t.length === 0 || t === "---" ? null : t;
}

/** Same, for table cells where multi-line values read better on one line. */
function orNull(s: string): string | null {
  return textOrNull(s.replace(/\n/g, " "));
}

function parseRequisites($: cheerio.CheerioAPI): Requisite[] {
  const requisites: Requisite[] = [];
  $("#course_requisites tbody tr").each((_i, el) => {
    const cells = $(el).find("td");
    if (cells.length < 5) return;
    const nameButton = cells.eq(0).find("button").first();
    const raw = blockText(cells.eq(0)).replace(/\n/g, " ").trim();
    const connector = raw.match(/\s(and|or)$/i);
    const typeContent = cells.eq(4).find("button").first().attr("data-content") ?? "";
    requisites.push({
      course: connector ? raw.slice(0, raw.length - connector[0].length).trim() : raw,
      course_title: orNull(nameButton.attr("data-content") ?? ""),
      connector: connector ? connector[1].toLowerCase() : null,
      minimum_grade: orNull(blockText(cells.eq(1))),
      prerequisite: /yes/i.test(blockText(cells.eq(2))),
      corequisite: /yes/i.test(blockText(cells.eq(3))),
      type: /^enforced/i.test(typeContent)
        ? "Enforced"
        : /^warning/i.test(typeContent)
          ? "Warning"
          : "Unknown",
    });
  });
  return requisites;
}

function summarizeRequisites(requisites: Requisite[]): string | null {
  if (requisites.length === 0) return null;
  const list = requisites
    .map((r) => [r.course, r.connector].filter((p) => p).join(" "))
    .join(" ");
  const types = [...new Set(requisites.map((r) => r.type))];
  return types.length === 1 && types[0] !== "Unknown" ? `${types[0]}: ${list}` : list;
}

function parseFinalExam($: cheerio.CheerioAPI): {
  final_exam: FinalExam | null;
  final_exam_note: string | null;
} {
  const cells = $("#final_exam_info tbody tr").first().find("td");
  if (cells.length < 4) {
    return { final_exam: null, final_exam_note: "No final exam information listed." };
  }
  const values = cells.map((_i, el) => blockText($(el)).replace(/\n/g, " ")).get();
  const [date, day, time, location] = values;
  // Courses without a scheduled final show "None listed" plus an explanation.
  if (orNull(date) === null || /^none listed$/i.test(date.trim())) {
    const note = values.map((v) => v.trim()).filter((v) => v && v !== "---").join(" - ");
    return { final_exam: null, final_exam_note: note || "None listed" };
  }
  return { final_exam: { date, day, time, location }, final_exam_note: null };
}

/** The "Course Description" / "Class Notes" / ... stack at the bottom of the page. */
function parseDetailSections($: cheerio.CheerioAPI): Map<string, string> {
  const blocks = new Map<string, string>();
  let title: string | null = null;
  let subtitle: string | null = null;
  // Iterate every child, not just <p>: HTML parsers close the <p> that wraps
  // the class notes as soon as its <ul> starts, so the list ends up a sibling.
  $("#section").children().each((_i, el) => {
    const $p = $(el);
    const text = blockText($p);
    if ($p.hasClass("class_detail_title")) {
      if ($p.hasClass("GE_subsection_title")) {
        subtitle = text;
      } else {
        title = text;
        subtitle = null;
        if (!blocks.has(title)) blocks.set(title, "");
      }
      return;
    }
    if (!title || text.length === 0) return;
    const line = subtitle ? `${subtitle}: ${text.replace(/\n/g, " ")}` : text;
    const existing = blocks.get(title) ?? "";
    blocks.set(title, existing.length > 0 ? `${existing}\n${line}` : line);
  });
  return blocks;
}

function parseClassDetailPage(html: string): ClassDetailPage {
  // Keep line breaks inside cells and list items, and drop the <template>
  // wrapper the SoC page shell puts around the class detail markup.
  const prepared = html
    .replace(/<\/?template[^>]*>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(li|p)>/gi, "\n$&");
  const $ = cheerio.load(prepared);

  const enrollment = $("#enrollment_info tbody tr").first().find("td");
  const blocks = parseDetailSections($);
  const requisites = parseRequisites($);
  const description = blocks.get("Course Description") ?? "";
  const classDescription = blocks.get("Class Description") ?? "";

  return {
    ...parseFinalExam($),
    requisites,
    requisites_text: summarizeRequisites(requisites),
    grading_type: orNull(blockText(enrollment.eq(0))),
    enrollment_restrictions: orNull(blockText(enrollment.eq(1))),
    impacted: orNull(blockText(enrollment.eq(2))),
    individual_studies: orNull(blockText(enrollment.eq(3))),
    level: orNull(blockText(enrollment.eq(4))),
    course_description: orNull(description),
    class_description: /^none$/i.test(classDescription.trim())
      ? null
      : textOrNull(classDescription),
    general_education: orNull(blocks.get("General Education (GE)") ?? ""),
    class_notes: textOrNull(blocks.get("Class Notes") ?? ""),
  };
}

/**
 * Final exam, enforced requisites, grading basis and class notes for one
 * section, from the public ClassDetail page its section link points at:
 * /ro/Public/SOC/Results/ClassDetail?term_cd=&subj_area_cd=&crs_catlg_no=&class_id=&class_no=
 */
export async function getClassDetail(section: Section): Promise<ClassDetail> {
  if (!section.detail_url) {
    throw new Error(
      `Section "${section.section}" has no class detail link in the Schedule of Classes.`
    );
  }
  const html = await socFetchUrl(new URL(section.detail_url));
  return {
    section: section.section,
    class_id: section.class_id,
    detail_url: section.detail_url,
    status: section.status,
    days: section.days,
    time: section.time,
    location: section.location,
    units: section.units,
    instructor: section.instructor,
    ...parseClassDetailPage(html),
  };
}

// --------------------------------------------------- catalog number match

/** Normalize "M151B", " m 151 b", "0031", "CS 31" style numbers for comparison. */
export function normalizeCatalog(input: string): string {
  const s = input.toUpperCase().replace(/\s+/g, "");
  const m = s.match(/^([A-Z]*)0*(\d+)(.*)$/);
  return m ? `${m[1]}${m[2]}${m[3]}` : s;
}

export function matchCourses(
  courses: CourseListing[],
  catalogNumber: string
): CourseListing[] {
  const wanted = normalizeCatalog(catalogNumber);
  const exact = courses.filter(
    (c) =>
      normalizeCatalog(c.catalog_number) === wanted ||
      c.course_key.toUpperCase() === catalogNumber.toUpperCase().replace(/\s+/g, "")
  );
  if (exact.length > 0) return exact;
  // Fall back to prefix match so "188" finds topic-split offerings like 188-1, 188-2.
  return courses.filter((c) => normalizeCatalog(c.catalog_number).startsWith(wanted));
}

/**
 * Match "1", "Lec 1", "lec1", "1A" style input against section names.
 * Top-level sections win; discussions/labs are only searched if none matched.
 */
export function matchSections(sections: Section[], input: string): Section[] {
  const wanted = input.trim().toLowerCase().replace(/\s+/g, "");
  const hit = (s: Section) => {
    const name = s.section.toLowerCase().replace(/\s+/g, "");
    return name === wanted || name.endsWith(wanted) || name.startsWith(wanted);
  };
  const top = sections.filter(hit);
  if (top.length > 0) return top;
  return sections.flatMap((s) => s.subsections ?? []).filter(hit);
}
