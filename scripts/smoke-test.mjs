// End-to-end smoke test: spawns the built server over stdio and exercises every tool.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const client = new Client({ name: "smoke-test", version: "1.0.0" });
await client.connect(
  new StdioClientTransport({ command: "node", args: ["dist/index.js"] })
);

const text = (r) => r.content[0].text;
const call = async (name, args) => {
  const res = await client.callTool({ name, arguments: args });
  if (res.isError) throw new Error(`${name} failed: ${text(res)}`);
  return JSON.parse(text(res));
};

const tools = await client.listTools();
console.log("tools:", tools.tools.map((t) => t.name).join(", "));

const terms = await call("list_terms", {});
console.log(`list_terms: ${terms.length} terms, default = ${terms.find((t) => t.is_registrar_default)?.code}`);

const term = "26F";
const subjects = await call("list_subject_areas", { term });
console.log(`list_subject_areas(${term}): ${subjects.count} subjects; first = ${subjects.subject_areas[0].code}`);

const open = await call("search_courses", { term, subject_area: "Computer Science", availability: "waitlist" });
console.log(`search_courses(COM SCI, waitlist-only): ${open.course_count} courses`);

const all = await call("search_courses", { term, subject_area: "COM SCI", availability: "any" });
console.log(`search_courses(COM SCI, any): ${all.course_count} courses; sample: ${all.courses.slice(0, 3).map((c) => c.catalog_number).join(", ")}`);

const details = await call("get_course_details", { term, subject_area: "COM SCI", catalog_number: "31", availability: "any" });
const course = details.courses[0];
console.log(`get_course_details(CS 31): ${course.title}`);
for (const s of course.sections) {
  console.log(
    `  ${s.section}: ${s.status}, ${s.enrolled}/${s.enrollment_capacity} enrolled, ` +
      `${s.spots_left} left, waitlist ${s.waitlist}, ${s.days} ${s.time} @ ${s.location}, ` +
      `${s.units}u, ${s.instructor}, subsections: ${s.subsections?.length ?? 0}`
  );
  for (const d of s.subsections ?? []) {
    console.log(`    ${d.section}: ${d.status}, ${d.enrolled}/${d.enrollment_capacity}, ${d.days} ${d.time} @ ${d.location}`);
  }
}

// Loose catalog matching + a different department for variety
const m151 = await call("get_course_details", { term, subject_area: "Computer Science", catalog_number: "m151b" });
console.log(`get_course_details(m151b): matched ${m151.matched_courses} -> ${m151.courses[0]?.catalog_number} ${m151.courses[0]?.title}`);

await client.close();
console.log("SMOKE TEST PASSED");
