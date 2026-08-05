# Mock Schedule Artifact Template

Every mock schedule artifact MUST contain the five REQUIRED sections below, in this order. Render as a self-contained HTML artifact when an artifact/canvas tool is available (if your environment provides artifact design skills, load them before writing the page); otherwise render the same sections as Markdown in chat. Do not present a schedule to the student in any other format.

## REQUIRED section 1 — Header

- Title: `<Term name> Mock Schedule` (e.g. "Fall 2026 Mock Schedule").
- Directly under it, the badge line: **`MOCK SCHEDULE — UNOFFICIAL — not an enrollment record`**.
- The date/time the schedule data was fetched ("Data as of …").

## REQUIRED section 2 — Weekly grid

A Monday–Friday time grid (add Sat/Sun only if a class meets then):

- Rows span from one hour before the earliest meeting to one hour after the latest, in 30-minute increments; label hours down the left edge.
- One block per class meeting, placed at its real day/time, containing exactly: course code, section (e.g. "Lec 1" / "Dis 1A"), and building + room.
- Discussion/lab meetings appear as their own blocks — never omitted.
- One consistent color per course (lecture and its discussion share the color; use lighter fill for the discussion). In HTML, ensure legibility in light and dark themes.

HTML skeleton for the grid (adapt row counts to the actual times; one column per day, blocks absolutely positioned or grid-row-spanned within their day column):

```html
<div class="week" style="display:grid;grid-template-columns:3rem repeat(5,1fr);gap:2px">
  <!-- hour labels column, then one column per day; each day column is a
       nested grid with one row per 30-min slot; class blocks span rows -->
  <div class="block" style="grid-row: 5 / 8"><b>COM SCI 111</b><br>Lec 1<br>Boelter 3400</div>
</div>
```

## REQUIRED section 3 — Course table

One row per course:

| Course | Section | Type | Days | Time | Location | Instructor | Units | Enrollment status |
|---|---|---|---|---|---|---|---|---|

- Discussions/labs get their own rows under their lecture.
- `Enrollment status` is the live status at fetch time (e.g. "Open — 12 of 90 left", "Waitlist 4/30").
- Below the table, one line: **`Total units: N`**.

## REQUIRED section 4 — Finals table

| Course | Final exam date | Day | Time | Conflict? |
|---|---|---|---|---|

- Courses with no listed final get the row value "none listed" — never a blank cell.
- After the table, exactly one verdict line: either **"No final exam conflicts detected."** or a bolded description of each conflict (including 3+ finals on one day).

## REQUIRED section 5 — Caveats

A visually distinct note block containing all of:

1. This is an unofficial mock schedule built from public Schedule of Classes data; it is not an enrollment record.
2. Seat and waitlist counts change constantly — recheck when your enrollment pass opens, and enroll through MyUCLA.
3. Final exam listings can change; midterms, quizzes, and deadlines are set by each course's syllabus — verify them yourself once syllabi are released.
4. Walking-time estimates (if shown) are approximate.
5. Confirm degree requirements with your departmental counselor; a parsed DAR is not official advising.

## Optional additions (allowed, after the required sections)

- A backup-plan table in the same format as section 3.
- Walk-time annotations between back-to-back blocks in the grid.
- Per-requirement notes mapping each course to the DAR requirement it satisfies.
