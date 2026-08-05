# UNOFFICIAL UCLA Schedule of Classes — MCP Server & Claude Plugin

An MCP (Model Context Protocol) server that lets Claude or any MCP-capable agent query the
public [UCLA Schedule of Classes](https://sa.ucla.edu/ro/public/soc) — no login or API key
required. It wraps the same AJAX endpoints the SoC website itself uses.

The repo is also a **Claude Code plugin** (`ucla-soc`) that bundles the server together with
a `schedule-planning` skill: a guided workflow that confirms the term being planned, collects
the student's wants and a DARS degree audit, verifies prerequisites and final-exam conflicts,
weighs time-of-day/gap/walking-distance preferences, and renders a mock schedule artifact
from a fixed template.

## Tools

| Tool                 | What it does                                                                                                                                                                                         |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `list_terms`         | Terms selectable in the SoC (e.g. `26F` = Fall 2026), with the registrar's current default marked                                                                                                    |
| `list_subject_areas` | All subject areas offering courses in a term, with exact codes (`COM SCI`, `EC ENGR`, …)                                                                                                             |
| `search_courses`     | Overview of every course a subject offers in a term — catalog number + title — optionally filtered by availability (`open`, `waitlist`, `open_or_waitlist`, `closed`, `cancelled`, `any`)            |
| `get_course_details` | Full detail for one course: each lecture/seminar section's status, enrolled/capacity/spots left, waitlist counts, days, times, locations, units, instructors, plus nested discussion/lab subsections |
| `get_class_detail`   | Per-section class detail page: final exam date/day/time/location (or an explicit "none listed"), enforced/warning requisites with minimum grades, grading basis, enrollment restrictions, level, class notes, course description |
| `get_course_description` | UCLA General Catalog entry for a course (term-independent): title, units, grading basis, level, full catalog description, and the requisite sentences pulled out of it |
| `estimate_walk_time` | Offline walking-time estimate between two classroom buildings, from raw SoC location strings (`Boelter Hall 3400`) or bare building names |
| `list_buildings`     | Every UCLA building `estimate_walk_time` knows, with the registrar's official abbreviation, aliases, and approximate coordinates |
| `parse_degree_audit` | Deterministically parse a locally saved UCLA Degree Audit (DARS) HTML file: overall status, admit/catalog info, unit & GPA breakdown, and every requirement/subrequirement with applied courses, remaining needs, and SELECT FROM lists |

Inputs are forgiving: terms accept `26F` or `Fall 2026`; subjects accept codes or names
(`COM SCI` or `Computer Science`); catalog numbers accept `31`, `M151B`, `cs 31`-style input.
Ambiguous or unknown inputs return actionable error messages listing valid options.

### Schedule planning

Three tools answer the questions that come up once you have a candidate schedule.
`get_class_detail` reads the class detail page behind each section link, so you can
check whether two courses share a final exam slot (`final_exam` is `null` with a
`final_exam_note` when nothing is scheduled) and whether a class is requisite-blocked.
`get_course_description` reads the General Catalog entry, which states requisites in
prose ("Enforced requisites: courses 32, 33, 35L.") independent of any term.
`estimate_walk_time` is fully offline: it strips the room number off a location string,
fuzzy-matches the building against a curated dataset (96 buildings, registrar
abbreviations included), and reports haversine distance × 1.4 walked at 80 m/min.
Coordinates are approximate and labelled as such — it is for spotting a 10-minute
passing-period problem, not for navigation. `list_buildings` shows what it knows.

### Degree audit parsing

`parse_degree_audit` works offline on a file you save yourself: open your audit at
[dars.ucla.edu](https://dars.ucla.edu) (Audit Results tab), use the browser's
**Save page as** (complete webpage or single HTML file), then pass the absolute file
path to the tool. Parsing is fully deterministic — it walks the audit's stable DARS
markup (`.requirement`, `.subrequirement`, `.takenCourse`, `.subreqNeeds`, …), no
network access and nothing is uploaded. `status_filter: "unfulfilled"` narrows the
output to what's still missing.

## Setup

### Claude Code (plugin — recommended)

The repo is its own plugin marketplace. In Claude Code:

```
/plugin marketplace add aaditsingh07/ucla-soc-mcp
/plugin install ucla-soc@ucla-soc-mcp
```

No Node build step needed — the plugin ships a self-contained server bundle
(`dist/bundle.cjs`) and registers all tools automatically. Start planning with
`/ucla-soc:schedule-planning`, or just ask about UCLA classes and Claude will
pick the skill up on its own.

### Manual build (any other setup)

```sh
git clone https://github.com/aaditsingh07/ucla-soc-mcp.git
cd ucla-soc-mcp
npm install
npm run build
```

> Note: the repo's `.mcp.json` is the *plugin's* server config and uses
> `${CLAUDE_PLUGIN_ROOT}`, so it only resolves when installed as a plugin. For a
> manual setup, register the server yourself as shown below (Claude Code:
> `claude mcp add ucla-soc -- node /absolute/path/to/dist/index.js`).

### Claude Desktop

Add to `claude_desktop_config.json` (Settings → Developer → Edit Config), using the
absolute path to `dist/index.js` in your clone:

```json
{
  "mcpServers": {
    "ucla-soc": {
      "command": "node",
      "args": ["/absolute/path/to/ucla-soc-mcp/dist/index.js"]
    }
  }
}
```

### Any other MCP host

Stdio transport: `node dist/index.js`. All tools are read-only (`readOnlyHint: true`).

## Testing

```sh
npm test        # builds, then runs scripts/smoke-test.mjs against the live SoC site
```

## How it works (reverse-engineered endpoints)

This server uses endpoints the web front-end calls:

- **Terms** — parsed from `<option class="select_term">` tags on `/ro/public/soc`.
- **Subject areas** — `GET /ro/ClassSearch/Public/Search/GetSimpleSearchData?term_cd={term}&search_type=subject`;
  the response embeds an HTML-encoded JSON array of `{label, value}` pairs.
- **Course list** — `GET /ro/Public/SOC/Results/CourseTitlesView` with `model` (subject search
  JSON) and `filterFlags` (availability etc.), paged 25 courses at a time. Each course comes
  with a model object (including a base64 token) used for the detail call.
- **Sections** — `GET /ro/Public/SOC/Results/GetCourseSummary` with a course model. Called
  with the root model it returns top-level sections (lectures); called with a section's child
  model it returns that section's discussions/labs. Rows are HTML; status ("Open",
  "81 of 237 Enrolled", "156 Spots Left", "Class Full (160)"), waitlist ("0 of 40 Taken"),
  days/time/location/units/instructor are parsed from the column cells.
- **Class detail** — `GET /ro/Public/SOC/Results/ClassDetail?term_cd=&subj_area_cd=&crs_catlg_no=&class_id=&class_no=`,
  the URL each section link points at. The response is the full SoC page shell, with the
  data in `#final_exam_info`, `#course_requisites`, `#enrollment_info` and `#section`.
- **Catalog descriptions** — `GET https://catalog.registrar.ucla.edu/course/{year}/{SUBJECTCODE}{NUMBER}`
  (e.g. `/course/current/COMSCI111`). The catalog's own JSON API needs a key, but the page is
  server-rendered and every field is in its embedded `__NEXT_DATA__` blob.

Requests send `X-Requested-With: XMLHttpRequest`. Terms are cached 1 h, subject lists 12 h;
course/section data is always fetched live so seat counts are current.

## Notes

- `search_courses` caps at 12 pages (300 courses) per subject and sets a `truncated` flag if hit.
- `get_course_details` returns at most 4 matching courses (relevant for topic-split numbers
  like `188`, which appear once per topic).
- `get_class_detail` fetches one page per section, so it uses the first matching course and
  caps at 6 sections per call.
- Not every class has a final: online, summer-session and many seminar/lab sections come back
  as "None listed — consult instructor for method of evaluation". Final exam *locations* are
  only published in 9th week; before that the location cell says so.
- Not affiliated with UCLA. Data comes from the public SoC and is subject to change by the
  registrar; enrollment capacities are "subject to departmental change" per the site.

## License

[Unlicense](LICENSE) — public domain. Do whatever you want with it.
