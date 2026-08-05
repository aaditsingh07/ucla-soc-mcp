/**
 * Client for the UCLA General Catalog course descriptions.
 *
 * registrar.ucla.edu/academics/course-descriptions is a thin shell around
 * catalog.registrar.ucla.edu (a Next.js site whose own JSON API needs a key).
 * The course pages are server-rendered though, and every field the page shows
 * is in the embedded __NEXT_DATA__ blob:
 *   GET https://catalog.registrar.ucla.edu/course/{year}/{SUBJECTCODE}{NUMBER}
 *   -> props.pageProps.pageContent { code, title, credit_points_header,
 *      grading_schema, course_level, description (HTML), ... }
 * {year} accepts "current" (redirects to the live catalog year) or e.g. "2026".
 * Requisites are not a separate field: they are sentences inside `description`
 * ("Enforced requisite: course 31A with grade of C- or better."), so they are
 * extracted from the description text.
 */

import { normalizeCatalog } from "./soc.js";

const CATALOG_BASE = "https://catalog.registrar.ucla.edu";
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) ucla-soc-mcp/1.0";

export interface CatalogCourse {
  code: string;
  title: string;
  units: string | null;
  grading: string | null;
  level: string | null;
  description: string;
  requisite_sentences: string[];
  catalog_year: string;
  source_url: string;
}

/** Shape of the fields we read out of props.pageProps.pageContent. */
interface PageContent {
  code?: string;
  title?: string;
  credit_points_header?: string;
  grading_schema?: string;
  course_level?: string;
  description?: string;
  implementation_year?: string;
}

async function catalogFetch(url: string): Promise<{ status: number; body: string }> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 25_000);
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": USER_AGENT },
        signal: controller.signal,
      });
      return { status: res.status, body: await res.text() };
    } catch (err) {
      lastError = err;
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error(`Failed to reach the UCLA General Catalog: ${String(lastError)}`);
}

function stripHtml(html: string): string {
  return html
    .replace(/<\/(p|div|li|br)\s*>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Pull the requisite/recommended-preparation sentences out of a catalog
 * description. UCLA writes these as their own sentences near the front:
 * "Enforced requisites: courses 32, 33, 35L." / "Recommended: course 111."
 */
export function extractRequisiteSentences(description: string): string[] {
  return description
    .split(/(?<=[.!?])\s+(?=[A-Z(])/)
    .map((s) => s.trim())
    .filter((s) => /requisit|^recommended\b|^preparation\b|^prerequisite/i.test(s));
}

/** "COM SCI" + "0031" -> "COMSCI31", the slug the catalog uses in its URLs. */
export function catalogSlug(subjectCode: string, catalogNumber: string): string {
  return (
    subjectCode.replace(/[^A-Za-z0-9]/g, "").toUpperCase() +
    normalizeCatalog(catalogNumber)
  );
}

/**
 * Catalog entry for one course. `year` is a catalog year ("2026") or "current".
 */
export async function getCatalogCourse(
  subjectCode: string,
  catalogNumber: string,
  year = "current"
): Promise<CatalogCourse> {
  const slug = catalogSlug(subjectCode, catalogNumber);
  const url = `${CATALOG_BASE}/course/${year}/${slug}`;
  const { status, body } = await catalogFetch(url);

  if (status === 404) {
    throw new Error(
      `"${subjectCode} ${catalogNumber}" is not in the UCLA General Catalog (${url} returned 404). ` +
        "Check the subject area and catalog number, or use get_class_detail for a course " +
        "that is offered but not separately cataloged."
    );
  }
  if (status !== 200) {
    throw new Error(`UCLA General Catalog returned HTTP ${status} for ${url}`);
  }

  const m = body.match(
    /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/
  );
  if (!m) {
    throw new Error(
      `Could not parse the UCLA General Catalog page for "${subjectCode} ${catalogNumber}" ` +
        "(site layout may have changed)."
    );
  }

  let content: PageContent | undefined;
  try {
    content = JSON.parse(m[1])?.props?.pageProps?.pageContent as PageContent | undefined;
  } catch {
    content = undefined;
  }
  if (!content?.description) {
    throw new Error(
      `The UCLA General Catalog has no description for "${subjectCode} ${catalogNumber}".`
    );
  }

  const description = stripHtml(content.description);
  return {
    code: content.code ?? `${subjectCode} ${normalizeCatalog(catalogNumber)}`,
    title: content.title ?? "",
    units: content.credit_points_header?.trim() || null,
    grading: content.grading_schema?.trim() || null,
    level: content.course_level?.trim() || null,
    description,
    requisite_sentences: extractRequisiteSentences(description),
    catalog_year: content.implementation_year ?? year,
    source_url: url,
  };
}
