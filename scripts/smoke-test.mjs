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

const cs111 = await call("get_class_detail", { term, subject_area: "COM SCI", catalog_number: "111", section: "1" });
for (const s of cs111.sections) {
  console.log(
    `get_class_detail(CS 111 ${s.section}): final = ${s.final_exam ? `${s.final_exam.date} ${s.final_exam.day} ${s.final_exam.time}` : s.final_exam_note}, ` +
      `grading ${s.grading_type}, level ${s.level}, requisites: ${s.requisites_text ?? "none"}, ` +
      `${s.class_notes ? `${s.class_notes.split("\n").length} class note(s)` : "no class notes"}`
  );
}
if (cs111.sections[0].requisites.length === 0) throw new Error("get_class_detail: expected enforced requisites on COM SCI 111");
if (!cs111.sections[0].final_exam) throw new Error("get_class_detail: expected a final exam on COM SCI 111");

// A non-engineering lecture, to confirm the class detail parse generalizes
const hist = await call("get_class_detail", { term, subject_area: "HIST", catalog_number: "1A" });
const h = hist.sections[0];
console.log(
  `get_class_detail(HIST 1A): ${hist.sections_shown} section(s); ${h.section} final = ` +
    `${h.final_exam ? `${h.final_exam.date} ${h.final_exam.time}` : h.final_exam_note}, GE: ${(h.general_education ?? "n/a").slice(0, 60)}...`
);

const desc = await call("get_course_description", { subject_area: "Computer Science", catalog_number: "111" });
console.log(
  `get_course_description(CS 111): ${desc.code} "${desc.title}", ${desc.units}, ${desc.grading} grading, ` +
    `catalog ${desc.catalog_year}; requisites: ${desc.requisite_sentences.join(" ") || "none listed"}`
);
if (!desc.has_requisites) throw new Error("get_course_description: expected requisite sentences for COM SCI 111");

const psych = await call("get_course_description", { subject_area: "PSYCH", catalog_number: "10" });
console.log(`get_course_description(PSYCH 10): ${psych.code} "${psych.title}", ${psych.units}, ${psych.description.length} chars of description`);

const walk = await call("estimate_walk_time", { from_location: "Boelter Hall 3400", to_location: "Royce Hall 190" });
console.log(
  `estimate_walk_time: ${walk.from.building} (room ${walk.from.room}) -> ${walk.to.building} (room ${walk.to.room}): ` +
    `~${walk.approx_distance_m} m, ~${walk.approx_walk_minutes} min`
);
if (!(walk.approx_walk_minutes > 0)) throw new Error("estimate_walk_time: expected a non-zero walk across campus");

const same = await call("estimate_walk_time", { from_location: "Engineering VI Mong Learning Center", to_location: "ENGR VI 289" });
console.log(`estimate_walk_time(same building): ${same.same_building}, ~${same.approx_walk_minutes} min`);

const online = await client.callTool({
  name: "estimate_walk_time",
  arguments: { from_location: "Online - Asynchronous", to_location: "Royce Hall 190" },
});
if (!online.isError) throw new Error("estimate_walk_time: expected an error for an online location");
console.log(`estimate_walk_time(online): correctly rejected -> ${text(online).slice(0, 70)}...`);

const buildings = await call("list_buildings", { search: "engineering" });
console.log(
  `list_buildings(engineering): ${buildings.count} of ${buildings.total_known} known buildings; ` +
    buildings.buildings.map((b) => `${b.name} (${b.abbreviation})`).join(", ")
);

await client.close();
console.log("SMOKE TEST PASSED");
