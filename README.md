# UNOFFICIAL UCLA Schedule of Classes — MCP Server

An MCP (Model Context Protocol) server that lets Claude or any MCP-capable agent query the
public [UCLA Schedule of Classes](https://sa.ucla.edu/ro/public/soc) — no login or API key
required. It wraps the same AJAX endpoints the SoC website itself uses.

## Tools

| Tool                 | What it does                                                                                                                                                                                         |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `list_terms`         | Terms selectable in the SoC (e.g. `26F` = Fall 2026), with the registrar's current default marked                                                                                                    |
| `list_subject_areas` | All subject areas offering courses in a term, with exact codes (`COM SCI`, `EC ENGR`, …)                                                                                                             |
| `search_courses`     | Overview of every course a subject offers in a term — catalog number + title — optionally filtered by availability (`open`, `waitlist`, `open_or_waitlist`, `closed`, `cancelled`, `any`)            |
| `get_course_details` | Full detail for one course: each lecture/seminar section's status, enrolled/capacity/spots left, waitlist counts, days, times, locations, units, instructors, plus nested discussion/lab subsections |

Inputs are forgiving: terms accept `26F` or `Fall 2026`; subjects accept codes or names
(`COM SCI` or `Computer Science`); catalog numbers accept `31`, `M151B`, `cs 31`-style input.
Ambiguous or unknown inputs return actionable error messages listing valid options.

## Setup

```sh
git clone https://github.com/aaditsingh07/ucla-soc-mcp.git
cd ucla-soc-mcp
npm install
npm run build
```

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

Requests send `X-Requested-With: XMLHttpRequest`. Terms are cached 1 h, subject lists 12 h;
course/section data is always fetched live so seat counts are current.

## Notes

- `search_courses` caps at 12 pages (300 courses) per subject and sets a `truncated` flag if hit.
- `get_course_details` returns at most 4 matching courses (relevant for topic-split numbers
  like `188`, which appear once per topic).
- Not affiliated with UCLA. Data comes from the public SoC and is subject to change by the
  registrar; enrollment capacities are "subject to departmental change" per the site.

## License

[Unlicense](LICENSE) — public domain. Do whatever you want with it.
