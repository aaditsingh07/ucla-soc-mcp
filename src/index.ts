#!/usr/bin/env node
/**
 * MCP server exposing the UCLA Schedule of Classes.
 * Transport: stdio. All tools are read-only queries against public data.
 */

import { readFile } from "node:fs/promises";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { parseDegreeAudit } from "./audit.js";
import {
  BUILDINGS,
  LocationMatch,
  estimateWalk,
  isVirtualLocation,
  matchBuilding,
  suggestBuildings,
} from "./buildings.js";
import { getCatalogCourse } from "./catalog.js";
import {
  Availability,
  getClassDetail,
  getCourseSections,
  getSubjectAreas,
  getTerms,
  matchCourses,
  matchSections,
  resolveSubjectArea,
  resolveTerm,
  searchCourses,
} from "./soc.js";

const availabilitySchema = z
  .enum(["any", "open", "waitlist", "open_or_waitlist", "closed", "cancelled"])
  .default("any")
  .describe(
    "Filter by section availability: 'open' = has open seats, 'waitlist' = waitlist available, " +
      "'open_or_waitlist' = enrollable either way, 'closed', 'cancelled', or 'any' (default, no filter)."
  );

const termSchema = z
  .string()
  .describe(
    'Term code such as "26F" (Fall 2026), "26W" (Winter), "26S" (Spring), "261" (Summer Sessions). ' +
      "Full names like 'Fall 2026' also work. Use list_terms to see what is offered."
  );

const server = new McpServer(
  { name: "ucla-soc", version: "1.0.0" },
  {
    instructions:
      "Tools for querying the public UCLA Schedule of Classes. Typical flow: " +
      "list_terms -> list_subject_areas (find the subject code) -> search_courses " +
      "(overview of a subject's courses, optionally filtered by seat availability) -> " +
      "get_course_details (per-section seats, waitlist, times, locations, instructors, " +
      "and discussion/lab subsections for one course). All data is public; no auth needed. " +
      "For schedule planning: get_class_detail adds a section's final exam date/time/location, " +
      "enforced requisites, grading basis and class notes; get_course_description returns the " +
      "General Catalog description with its requisite sentences; estimate_walk_time (with " +
      "list_buildings) gives an offline walking-time estimate between two classroom buildings. " +
      "parse_degree_audit is different: it reads a locally saved UCLA DARS degree audit HTML " +
      "file and returns requirement completion status, applied courses, and remaining needs.",
  }
);

function jsonResult(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

function errorResult(err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  return {
    content: [{ type: "text" as const, text: `Error: ${message}` }],
    isError: true,
  };
}

server.registerTool(
  "list_terms",
  {
    title: "List UCLA terms",
    description:
      "List the academic terms currently selectable in the UCLA Schedule of Classes, " +
      "with their codes (e.g. 26F = Fall 2026). Marks the term the registrar currently defaults to.",
    inputSchema: {},
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async () => {
    try {
      return jsonResult(await getTerms());
    } catch (err) {
      return errorResult(err);
    }
  }
);

server.registerTool(
  "list_subject_areas",
  {
    title: "List subject areas",
    description:
      "List all subject areas (departments) offering courses in a given term, with the exact " +
      'subject codes (e.g. "COM SCI", "EC ENGR", "MATH") needed by search_courses and get_course_details.',
    inputSchema: { term: termSchema },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async ({ term }) => {
    try {
      const t = await resolveTerm(term);
      const subjects = await getSubjectAreas(t.code);
      return jsonResult({ term: t.code, term_name: t.name, count: subjects.length, subject_areas: subjects });
    } catch (err) {
      return errorResult(err);
    }
  }
);

server.registerTool(
  "search_courses",
  {
    title: "Search courses (overview)",
    description:
      "Overview list of all courses offered by a subject area in a term: catalog number and title " +
      "for each course. Optionally filter to courses that have sections with a given availability " +
      "(open seats, waitlist, etc.). For seats/times/sections of a specific course, use get_course_details.",
    inputSchema: {
      term: termSchema,
      subject_area: z
        .string()
        .describe('Subject area code or name, e.g. "COM SCI" or "Computer Science".'),
      availability: availabilitySchema,
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async ({ term, subject_area, availability }) => {
    try {
      const t = await resolveTerm(term);
      const subject = await resolveSubjectArea(t.code, subject_area);
      const { courses, truncated } = await searchCourses(
        t.code,
        subject,
        availability as Availability
      );
      return jsonResult({
        term: t.code,
        term_name: t.name,
        subject_area: subject.code,
        subject_label: subject.label,
        availability_filter: availability,
        course_count: courses.length,
        truncated_at_300_courses: truncated || undefined,
        courses: courses.map((c) => ({
          catalog_number: c.catalog_number,
          title: c.title,
        })),
        hint: "Call get_course_details with a catalog_number for sections, seats, and times.",
      });
    } catch (err) {
      return errorResult(err);
    }
  }
);

server.registerTool(
  "get_course_details",
  {
    title: "Get course details",
    description:
      "Detailed schedule for one course: every section (lecture/seminar) with enrollment status, " +
      "seats taken/capacity/remaining, waitlist counts, meeting days, times, locations, units, " +
      "instructors, and nested discussion/lab subsections. Matches catalog numbers loosely " +
      '("31", "M151B", "CS 31" all work).',
    inputSchema: {
      term: termSchema,
      subject_area: z
        .string()
        .describe('Subject area code or name, e.g. "COM SCI" or "Computer Science".'),
      catalog_number: z
        .string()
        .describe('Course catalog number as shown in the SoC, e.g. "31", "111", "M151B", "188".'),
      availability: availabilitySchema.describe(
        "Only include sections with this availability. Default 'any' shows all sections."
      ),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async ({ term, subject_area, catalog_number, availability }) => {
    try {
      const t = await resolveTerm(term);
      const subject = await resolveSubjectArea(t.code, subject_area);
      const { courses } = await searchCourses(t.code, subject, "any");
      const matches = matchCourses(courses, catalog_number);

      if (matches.length === 0) {
        const sample = courses.slice(0, 40).map((c) => c.catalog_number).join(", ");
        return errorResult(
          new Error(
            `No course "${catalog_number}" found in ${subject.code} for ${t.name}. ` +
              `Offered catalog numbers include: ${sample}${courses.length > 40 ? ", ..." : ""}`
          )
        );
      }

      const limited = matches.slice(0, 4);
      const results = await Promise.all(
        limited.map(async (listing) => ({
          catalog_number: listing.catalog_number,
          title: listing.title,
          sections: await getCourseSections(listing, availability as Availability),
        }))
      );

      return jsonResult({
        term: t.code,
        term_name: t.name,
        subject_area: subject.code,
        subject_label: subject.label,
        availability_filter: availability,
        matched_courses: matches.length,
        shown: results.length,
        courses: results,
      });
    } catch (err) {
      return errorResult(err);
    }
  }
);

/** Class detail pages are large; cap how many are fetched per call. */
const MAX_DETAIL_SECTIONS = 6;

server.registerTool(
  "get_class_detail",
  {
    title: "Get class detail (final exam, requisites, notes)",
    description:
      "Per-section detail from the Schedule of Classes class detail page: final exam date, day, " +
      "time and location (explicitly null when the course has no scheduled final), enforced/warning " +
      "requisites with minimum grades, grading basis, enrollment restrictions, level, class notes, " +
      "and the course description. Use this to check final exam conflicts and whether a class is " +
      "requisite-blocked. Defaults to every lecture/seminar section of the course.",
    inputSchema: {
      term: termSchema,
      subject_area: z
        .string()
        .describe('Subject area code or name, e.g. "COM SCI" or "Computer Science".'),
      catalog_number: z
        .string()
        .describe('Course catalog number as shown in the SoC, e.g. "31", "111", "M151B".'),
      section: z
        .string()
        .optional()
        .describe(
          'One section to look up, e.g. "1", "Lec 1", or a discussion like "1A". ' +
            "Omit to get every lecture/seminar section of the course."
        ),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async ({ term, subject_area, catalog_number, section }) => {
    try {
      const t = await resolveTerm(term);
      const subject = await resolveSubjectArea(t.code, subject_area);
      const { courses } = await searchCourses(t.code, subject, "any");
      const matches = matchCourses(courses, catalog_number);

      if (matches.length === 0) {
        const sample = courses.slice(0, 40).map((c) => c.catalog_number).join(", ");
        return errorResult(
          new Error(
            `No course "${catalog_number}" found in ${subject.code} for ${t.name}. ` +
              `Offered catalog numbers include: ${sample}${courses.length > 40 ? ", ..." : ""}`
          )
        );
      }

      const listing = matches[0];
      const sections = await getCourseSections(listing, "any");
      const targets = section ? matchSections(sections, section) : sections;

      if (targets.length === 0) {
        const names = sections.map((s) => s.section).join(", ");
        return errorResult(
          new Error(
            `No section "${section}" in ${subject.code} ${listing.catalog_number} for ${t.name}. ` +
              `Sections offered: ${names || "none"}.`
          )
        );
      }

      const shown = targets.slice(0, MAX_DETAIL_SECTIONS);
      const details = await Promise.all(
        shown.map(async (s) => {
          try {
            return await getClassDetail(s);
          } catch (err) {
            return {
              section: s.section,
              detail_url: s.detail_url,
              error: err instanceof Error ? err.message : String(err),
            };
          }
        })
      );

      return jsonResult({
        term: t.code,
        term_name: t.name,
        subject_area: subject.code,
        subject_label: subject.label,
        catalog_number: listing.catalog_number,
        title: listing.title,
        matched_courses: matches.length,
        section_filter: section,
        sections_shown: details.length,
        truncated_at_6_sections: targets.length > MAX_DETAIL_SECTIONS || undefined,
        sections: details,
      });
    } catch (err) {
      return errorResult(err);
    }
  }
);

server.registerTool(
  "get_course_description",
  {
    title: "Get catalog course description",
    description:
      "Official UCLA General Catalog entry for a course: title, units, grading basis, level, the " +
      "full catalog description, and the requisite sentences pulled out of it (\"Enforced " +
      "requisites: courses 32, 33, 35L.\", \"Recommended: course 111.\"). Term-independent — use it " +
      "to verify prerequisites before planning a schedule. For requisites as the registrar enforces " +
      "them on a specific offered section, use get_class_detail instead.",
    inputSchema: {
      subject_area: z
        .string()
        .describe('Subject area code or name, e.g. "COM SCI" or "Computer Science".'),
      catalog_number: z
        .string()
        .describe('Course catalog number, e.g. "31", "111", "M151B", "32A".'),
      catalog_year: z
        .string()
        .default("current")
        .describe(
          'Catalog year to read, e.g. "2026" for the 2026-27 catalog. Default "current".'
        ),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async ({ subject_area, catalog_number, catalog_year }) => {
    try {
      // The catalog has no subject-area index of its own, so resolve the code
      // against the registrar's current default term to stay forgiving.
      const terms = await getTerms();
      const defaultTerm = terms.find((t) => t.is_registrar_default) ?? terms[0];
      const subject = await resolveSubjectArea(defaultTerm.code, subject_area);
      const course = await getCatalogCourse(subject.code, catalog_number, catalog_year);
      return jsonResult({
        subject_area: subject.code,
        subject_label: subject.label,
        ...course,
        has_requisites: course.requisite_sentences.length > 0,
        hint: "Requisite sentences are the catalog's own wording; get_class_detail shows what the registrar enforces on a given section.",
      });
    } catch (err) {
      return errorResult(err);
    }
  }
);

function resolveWalkLocation(input: string): LocationMatch {
  if (isVirtualLocation(input)) {
    throw new Error(
      `"${input}" is not a physical classroom (online, TBA, or no location), so walking ` +
        "time cannot be estimated."
    );
  }
  const match = matchBuilding(input);
  if (!match) {
    const suggestions = suggestBuildings(input);
    throw new Error(
      `Could not match "${input}" to a UCLA building. ` +
        (suggestions.length > 0 ? `Closest names: ${suggestions.join(", ")}. ` : "") +
        "Use list_buildings to see every building this tool knows."
    );
  }
  return match;
}

server.registerTool(
  "estimate_walk_time",
  {
    title: "Estimate walking time between buildings",
    description:
      "Offline estimate of how long it takes to walk between two UCLA classroom buildings. " +
      "Accepts raw Schedule of Classes location strings with room numbers " +
      '("Boelter Hall 3400", "Renee and David Kaplan Hall A65") or bare building names/abbreviations. ' +
      "Distances are straight-line (haversine) between approximate building coordinates, scaled by " +
      "1.4 for real paths, at 80 m/min — good for spotting back-to-back class conflicts, not for navigation.",
    inputSchema: {
      from_location: z
        .string()
        .describe(
          'Where the earlier class meets — a SoC location string ("Boelter Hall 3400") or a building name.'
        ),
      to_location: z
        .string()
        .describe(
          'Where the later class meets — a SoC location string ("Royce Hall 190") or a building name.'
        ),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  async ({ from_location, to_location }) => {
    try {
      const from = resolveWalkLocation(from_location);
      const to = resolveWalkLocation(to_location);
      const estimate = estimateWalk(from.building, to.building);
      const sameBuilding = from.building.name === to.building.name;
      return jsonResult({
        from: {
          input: from.input,
          building: from.building.name,
          abbreviation: from.building.abbreviation,
          room: from.room,
          approx_lat: from.building.lat,
          approx_lon: from.building.lon,
        },
        to: {
          input: to.input,
          building: to.building.name,
          abbreviation: to.building.abbreviation,
          room: to.room,
          approx_lat: to.building.lat,
          approx_lon: to.building.lon,
        },
        same_building: sameBuilding,
        ...estimate,
        note:
          "Approximate: straight-line distance between approximate building coordinates x 1.4 " +
          "path factor, walked at 80 m/min. Ignores stairs, hills, elevators and crowds — " +
          "UCLA's north/south campus grade adds a few minutes in practice." +
          (sameBuilding ? " Same building: still allow time for floors and stairs." : ""),
      });
    } catch (err) {
      return errorResult(err);
    }
  }
);

server.registerTool(
  "list_buildings",
  {
    title: "List known UCLA buildings",
    description:
      "Every UCLA building estimate_walk_time knows, with the registrar's official abbreviation, " +
      "alternate names, and approximate coordinates. Use it to see what a SoC location string " +
      "should be matched against, or when estimate_walk_time reports an unknown building.",
    inputSchema: {
      search: z
        .string()
        .optional()
        .describe('Only list buildings whose name, abbreviation or aliases contain this text, e.g. "engineering".'),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  async ({ search }) => {
    try {
      const needle = search?.trim().toLowerCase() ?? "";
      const buildings = BUILDINGS.filter(
        (b) =>
          needle.length === 0 ||
          [b.name, b.abbreviation ?? "", ...b.aliases]
            .join(" ")
            .toLowerCase()
            .includes(needle)
      );
      return jsonResult({
        search: search,
        count: buildings.length,
        total_known: BUILDINGS.length,
        coordinates_are_approximate: true,
        buildings: buildings.map((b) => ({
          name: b.name,
          abbreviation: b.abbreviation,
          aliases: b.aliases.length > 0 ? b.aliases : undefined,
          approx_lat: b.lat,
          approx_lon: b.lon,
        })),
      });
    } catch (err) {
      return errorResult(err);
    }
  }
);

server.registerTool(
  "parse_degree_audit",
  {
    title: "Parse a saved UCLA degree audit (DARS)",
    description:
      "Deterministically parse a UCLA Degree Audit Report (DARS) that was saved from " +
      "dars.ucla.edu as an HTML file ('Audit Results' tab -> browser 'Save page as'). " +
      "Returns the overall completion status, student/admit info, unit & GPA breakdown " +
      "(completed / in-progress / unfulfilled units per GPA category), and every " +
      "requirement with its subrequirements: status (complete / unfulfilled / in_progress / " +
      "informational), courses applied (term, course, units, grade), what is still NEEDED " +
      "(course/unit counts), and SELECT FROM / NOT FROM course lists. " +
      "Use status_filter to narrow to just unfulfilled or in-progress requirements.",
    inputSchema: {
      file_path: z
        .string()
        .describe(
          "Absolute path to the saved DARS audit HTML file, e.g. " +
            "\"C:\\\\Users\\\\me\\\\Documents\\\\My Audit - Audit Results Tab.html\"."
        ),
      status_filter: z
        .enum(["all", "unfulfilled", "in_progress", "complete"])
        .default("all")
        .describe(
          "Only include requirements with this status ('all' = everything, including " +
            "informational blocks). Header and unit/GPA summary are always returned."
        ),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  async ({ file_path, status_filter }) => {
    try {
      let html: string;
      try {
        html = await readFile(file_path, "utf8");
      } catch (err) {
        return errorResult(
          new Error(
            `Could not read "${file_path}": ${err instanceof Error ? err.message : String(err)}. ` +
              "Pass the absolute path to a saved DARS audit HTML file."
          )
        );
      }
      const audit = parseDegreeAudit(html);
      const requirements =
        status_filter === "all"
          ? audit.requirements
          : audit.requirements.filter((r) => r.status === status_filter);
      return jsonResult({
        source_file: file_path,
        status_filter,
        overall_status: audit.overall_status,
        student_info: audit.student_info,
        degree_programs: audit.degree_programs.length ? audit.degree_programs : undefined,
        unit_gpa_summary: audit.unit_gpa_summary,
        requirement_count: audit.requirements.length,
        requirements_shown: requirements.length,
        requirements,
      });
    } catch (err) {
      return errorResult(err);
    }
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("ucla-soc MCP server running on stdio");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
