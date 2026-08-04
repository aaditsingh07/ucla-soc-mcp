/**
 * Deterministic parser for saved UCLA Degree Audit (DARS / u.achieve self-service)
 * HTML pages, as exported from dars.ucla.edu ("Audit Results" tab, saved via the
 * browser). Everything is extracted from the audit's stable CSS-class markup
 * (.requirement / .subrequirement / .takenCourse / .subreqNeeds / ...); no
 * heuristics or fuzzy matching.
 */

import * as cheerio from "cheerio";
import type { AnyNode } from "domhandler";

export type RequirementStatus =
  | "complete"
  | "unfulfilled"
  | "in_progress"
  | "planned"
  | "informational";

export interface AppliedCourse {
  term: string;
  course: string;
  units: number | null;
  grade: string;
  in_progress?: boolean;
  condition_code?: string;
  title?: string;
  notes?: string[];
}

export interface Subrequirement {
  number?: string;
  status: RequirementStatus;
  title: string;
  earned?: Record<string, number>;
  needs?: Record<string, number>;
  courses_applied?: AppliedCourse[];
  select_from?: string[];
  not_from?: string[];
}

export interface Requirement {
  name: string;
  title: string;
  status: RequirementStatus;
  category?: string;
  earned?: Record<string, number>;
  needs?: Record<string, number>;
  subrequirements: Subrequirement[];
}

export interface GpaCategory {
  label: string;
  completed_units: number;
  in_progress_units: number;
  unfulfilled_units: number;
  planned_units: number;
  gpa: number | null;
}

export interface DegreeAudit {
  overall_status: string;
  student_info: Record<string, string>;
  degree_programs: { role: string; catalog_term: string; code: string; description: string }[];
  unit_gpa_summary: GpaCategory[];
  requirements: Requirement[];
}

/** Collapse runs of whitespace (incl. NBSP and newlines) into single spaces. */
function clean(text: string): string {
  return text.replace(/[\s ]+/g, " ").trim();
}

function numOrNull(text: string): number | null {
  const t = clean(text);
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function statusFromClass(cls: string | undefined): RequirementStatus {
  const m = /(?:Status_|status)(OK|NO|IP|PL|NONE)\b/.exec(cls ?? "");
  switch (m?.[1]) {
    case "OK":
      return "complete";
    case "NO":
      return "unfulfilled";
    case "IP":
      return "in_progress";
    case "PL":
      return "planned";
    default:
      return "informational";
  }
}

/** Label a numeric cell by its sibling label text ("UNITS" -> units, "COURSES" -> courses...). */
function keyFromLabel(label: string, fallback: string): string {
  const l = clean(label).toUpperCase();
  if (!l) return fallback;
  if (l.includes("GRADED")) return "graded_attempted_units";
  if (l.includes("UNIT")) return "units";
  if (l.includes("COURSE")) return "courses";
  if (l.includes("POINT")) return "grade_points";
  if (l.includes("GPA")) return "gpa";
  if (l.includes("SUB")) return "subrequirements";
  return l.toLowerCase().replace(/[^a-z0-9]+/g, "_");
}

/**
 * Parse a requirementTotals / subrequirementTotals / subreqNeeds table.
 * Rows are keyed by their class (reqEarned, reqNeeds, subreqIpHours, ...) or
 * rowlabel text; number cells are paired with the label cell that follows them.
 */
function parseTotalsTable(
  $: cheerio.CheerioAPI,
  $table: cheerio.Cheerio<AnyNode>
): { earned?: Record<string, number>; needs?: Record<string, number> } {
  const earned: Record<string, number> = {};
  const needs: Record<string, number> = {};

  $table.find("tr").each((_, tr) => {
    const $tr = $(tr);
    const rowClass = $tr.attr("class") ?? "";
    const rowLabel = clean($tr.find(".rowlabel").first().text()).toUpperCase();
    const isNeeds = /needs/i.test(rowClass) || rowLabel.startsWith("NEEDS");
    const isInProgress = /IpHours/i.test(rowClass) || rowLabel.startsWith("IN-PROG");
    const target = isNeeds ? needs : earned;
    const prefix = isInProgress ? "in_progress_" : "";

    // Number cells (<td>/<span> class "... number") are each followed by a
    // label cell ("UNITS", "COURSES", "POINTS", ...); .gpa has its label after.
    $tr.find(".number, td.gpa, span.gpa").each((_, el) => {
      const $el = $(el);
      const value = numOrNull($el.text());
      if (value === null) return;
      const cls = $el.attr("class") ?? "";
      let fallback = "value";
      if (/\bhours\b/.test(cls)) fallback = "units";
      else if (/\bcount\b/.test(cls)) fallback = "courses";
      else if (/\bpoints\b/.test(cls)) fallback = "grade_points";
      else if (/\bgpa\b/.test(cls)) fallback = "gpa";
      else if (/\bsubreqs\b/.test(cls)) fallback = "subrequirements";
      const label = $el.nextAll(".hourslabel, .countlabel, .pointslabel, .gpalabel, .countlabel, .fieldlabel, .smallfieldlabel").first().text();
      const key = /\bgpa\b/.test(cls) ? "gpa" : keyFromLabel(label, fallback);
      target[prefix + key] = value;
    });
  });

  return {
    earned: Object.keys(earned).length ? earned : undefined,
    needs: Object.keys(needs).length ? needs : undefined,
  };
}

function mergeTotals(
  base: { earned?: Record<string, number>; needs?: Record<string, number> },
  extra: { earned?: Record<string, number>; needs?: Record<string, number> }
) {
  if (extra.earned) base.earned = { ...(base.earned ?? {}), ...extra.earned };
  if (extra.needs) base.needs = { ...(base.needs ?? {}), ...extra.needs };
}

function parseCourseRows(
  $: cheerio.CheerioAPI,
  $table: cheerio.Cheerio<AnyNode>
): AppliedCourse[] {
  const courses: AppliedCourse[] = [];
  $table.find("tr.takenCourse").each((_, tr) => {
    const $tr = $(tr);
    const descLines = $tr
      .find("td.description .descLine")
      .map((_, d) => clean($(d).text()))
      .get()
      .filter((l) => l.length > 0);
    const course: AppliedCourse = {
      term: clean($tr.find("td.term").first().text()),
      course: clean($tr.find("td.course").first().text()),
      units: numOrNull($tr.find("td.credit").first().text()),
      grade: clean($tr.find("td.grade").first().text()),
    };
    if (/\bip\b/.test($tr.attr("class") ?? "")) course.in_progress = true;
    const ccode = clean($tr.find("td.ccode").first().text());
    if (ccode) course.condition_code = ccode;
    if (descLines.length > 0) course.title = descLines[0];
    if (descLines.length > 1) course.notes = descLines.slice(1);
    courses.push(course);
  });
  return courses;
}

/** Text of an element whose <br>-separated lines become newline-joined text. */
function multilineText(
  $: cheerio.CheerioAPI,
  $el: cheerio.Cheerio<AnyNode>
): string {
  const $copy = $el.clone();
  $copy.find("br").replaceWith("\n");
  return $copy
    .text()
    .split("\n")
    .map((l) => clean(l))
    .filter((l) => l.length > 0)
    .join("\n");
}

/** Course lists inside SELECT FROM / NOT FROM tables. */
function parseCourseList(
  $: cheerio.CheerioAPI,
  $table: cheerio.Cheerio<AnyNode>
): string[] {
  const out: string[] = [];
  $table.find("span.course").each((_, el) => {
    const $el = $(el);
    const dept = clean($el.attr("department") ?? "");
    const num = clean($el.attr("number") ?? "");
    const text = dept && num ? `${dept} ${num}` : clean($el.text());
    if (text) out.push(text);
  });
  return out;
}

function parseSubrequirement(
  $: cheerio.CheerioAPI,
  el: AnyNode
): Subrequirement {
  const $sub = $(el);
  const number = clean($sub.find(".subreqPretext .subreqNumber").first().text()).replace(/\)$/, "");
  const status = statusFromClass(
    $sub.find(".subreqPretext .status").first().attr("class")
  );
  const title = multilineText($, $sub.find(".subreqTitle").first());

  const sub: Subrequirement = { status, title };
  if (number) sub.number = number;

  const $body = $sub.find(".subreqBody").first();
  const totals: { earned?: Record<string, number>; needs?: Record<string, number> } = {};
  $body.find("table.subrequirementTotals, table.subreqNeeds").each((_, t) => {
    mergeTotals(totals, parseTotalsTable($, $(t)));
  });
  if (totals.earned) sub.earned = totals.earned;
  if (totals.needs) sub.needs = totals.needs;

  const applied = parseCourseRows($, $body.find("table.completedCourses").first());
  if (applied.length > 0) sub.courses_applied = applied;

  const selectFrom = parseCourseList($, $body.find("table.selectcourses").first());
  if (selectFrom.length > 0) sub.select_from = selectFrom;
  const notFrom = parseCourseList($, $body.find("table.notcourses").first());
  if (notFrom.length > 0) sub.not_from = notFrom;

  return sub;
}

function parseRequirement($: cheerio.CheerioAPI, el: AnyNode): Requirement {
  const $req = $(el);
  const cls = $req.attr("class") ?? "";
  const req: Requirement = {
    name: clean($req.attr("rname") ?? ""),
    title: multilineText($, $req.find(".reqText .reqTitle").first()),
    status: statusFromClass(cls),
    subrequirements: [],
  };
  const category = /category_(\S+)/.exec(cls)?.[1];
  if (category) req.category = category;

  const totals = parseTotalsTable(
    $,
    $req.find("> .reqBody > table.requirementTotals").first()
  );
  if (totals.earned) req.earned = totals.earned;
  if (totals.needs) req.needs = totals.needs;

  $req
    .find("> .reqBody > .auditSubrequirements > .subrequirement")
    .each((_, s) => {
      req.subrequirements.push(parseSubrequirement($, s));
    });

  return req;
}

/** Unit/GPA breakdown embedded as JSON in the loadAcademicProgressGraph() call. */
function parseGpaCategories(html: string): GpaCategory[] {
  const m = /loadAcademicProgressGraph\([^,]+,\s*\{[^)]*?\},\s*(\{[\s\S]*?\})\);/.exec(html);
  if (!m) return [];
  try {
    const graph = JSON.parse(m[1]) as {
      data?: {
        label?: string;
        completedHours?: number;
        inProgressHours?: number;
        unfulfilledHours?: number;
        plannedHours?: number;
        gpa?: number;
      }[];
    };
    return (graph.data ?? []).map((d) => ({
      label: d.label ?? "",
      completed_units: d.completedHours ?? 0,
      in_progress_units: d.inProgressHours ?? 0,
      unfulfilled_units: d.unfulfilledHours ?? 0,
      planned_units: d.plannedHours ?? 0,
      gpa: d.gpa && d.gpa > 0 ? Number(d.gpa.toFixed(3)) : null,
    }));
  } catch {
    return [];
  }
}

/**
 * UCLA comments out the "Default Program" table in the self-service page, so the
 * major/concentration names only exist inside an HTML comment. Best-effort parse.
 */
function parseDegreePrograms(html: string): DegreeAudit["degree_programs"] {
  const programs: DegreeAudit["degree_programs"] = [];
  const section = /Default Program<\/b>[\s\S]*?<\/table>/.exec(html)?.[0];
  if (!section) return programs;
  const rowRe = /<tr>\s*(?:<td[^>]*>[\s\S]*?<\/td>\s*){4}<\/tr>/g;
  for (const row of section.match(rowRe) ?? []) {
    const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((c) =>
      clean(c[1].replace(/&nbsp;/g, " "))
    );
    if (cells.length === 4 && cells[0]) {
      programs.push({
        role: cells[0],
        catalog_term: cells[1],
        code: cells[2],
        description: cells[3],
      });
    }
  }
  return programs;
}

export function parseDegreeAudit(html: string): DegreeAudit {
  const $ = cheerio.load(html);

  const $audit = $("#audit").first();
  if ($audit.length === 0 || $("#auditRequirements").length === 0) {
    throw new Error(
      "This file does not look like a saved UCLA DARS degree audit (no #audit / " +
        "#auditRequirements markup found). Save the 'Audit Results' page from " +
        "dars.ucla.edu with the browser's 'Save page as' and pass that HTML file."
    );
  }

  const studentInfo: Record<string, string> = {};
  $(".auditHeaderTable th").each((_, th) => {
    const key = clean($(th).text());
    const value = clean($(th).next("td").text());
    if (key && value) studentInfo[key] = value;
  });

  const overallStatus =
    clean($("#auditHeader [class^='completionText']").first().text()) ||
    "(no completion banner found)";

  const requirements: Requirement[] = [];
  $("#auditRequirements > .requirement").each((_, el) => {
    requirements.push(parseRequirement($, el));
  });

  return {
    overall_status: overallStatus,
    student_info: studentInfo,
    degree_programs: parseDegreePrograms(html),
    unit_gpa_summary: parseGpaCategories(html),
    requirements,
  };
}
