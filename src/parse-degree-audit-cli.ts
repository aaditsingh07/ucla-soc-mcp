#!/usr/bin/env node
/**
 * Standalone CLI for parseDegreeAudit(). Bundled with its dependencies (esbuild) so it
 * can be saved and run with plain `node` wherever the caller's DARS export actually lives,
 * independent of where the MCP server process runs.
 *
 * Usage: node parse-degree-audit.cjs <path-to-saved-DARS-audit.html> [status_filter]
 *   status_filter: all (default) | unfulfilled | in_progress | complete
 */

import { readFileSync } from "node:fs";
import { parseDegreeAudit } from "./audit.js";

const STATUS_FILTERS = ["all", "unfulfilled", "in_progress", "complete"] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];

function main() {
  const [, , filePath, statusFilterArg] = process.argv;
  if (!filePath) {
    console.error(
      "Usage: node parse-degree-audit.cjs <path-to-saved-DARS-audit.html> [status_filter]\n" +
        `  status_filter: ${STATUS_FILTERS.join(" | ")} (default: all)`
    );
    process.exit(1);
  }

  const statusFilter = (statusFilterArg ?? "all") as StatusFilter;
  if (!STATUS_FILTERS.includes(statusFilter)) {
    console.error(
      `Invalid status_filter "${statusFilterArg}". Use one of: ${STATUS_FILTERS.join(", ")}.`
    );
    process.exit(1);
  }

  let html: string;
  try {
    html = readFileSync(filePath, "utf8");
  } catch (err) {
    console.error(
      `Could not read "${filePath}": ${err instanceof Error ? err.message : String(err)}`
    );
    process.exit(1);
    return;
  }

  try {
    const audit = parseDegreeAudit(html);
    const requirements =
      statusFilter === "all"
        ? audit.requirements
        : audit.requirements.filter((r) => r.status === statusFilter);

    console.log(
      JSON.stringify(
        {
          source_file: filePath,
          status_filter: statusFilter,
          overall_status: audit.overall_status,
          student_info: audit.student_info,
          degree_programs: audit.degree_programs.length ? audit.degree_programs : undefined,
          unit_gpa_summary: audit.unit_gpa_summary,
          requirement_count: audit.requirements.length,
          requirements_shown: requirements.length,
          requirements,
        },
        null,
        2
      )
    );
  } catch (err) {
    console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}

main();
