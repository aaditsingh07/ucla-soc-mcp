#!/usr/bin/env node
/**
 * MCP server exposing the UCLA Schedule of Classes.
 * Transport: stdio. All tools are read-only queries against public data.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  Availability,
  getCourseSections,
  getSubjectAreas,
  getTerms,
  matchCourses,
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
      "and discussion/lab subsections for one course). All data is public; no auth needed.",
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

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("ucla-soc MCP server running on stdio");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
