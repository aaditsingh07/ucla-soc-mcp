---
name: schedule-planning
description: Use when a UCLA student wants help planning classes for a term — deciding what to take, building a conflict-free schedule, checking seats or waitlists, working around degree requirements, or asking "what should I take next quarter".
---

# UCLA Schedule Planning

## Overview

Guided workflow for planning a UCLA student's class schedule for one term, ending in a rendered mock-schedule artifact. Core principle: **verify, don't assume** — the term, the student's requirements, every prerequisite, and every conflict get an explicit check, and the student confirms anything the data cannot.

Uses the `ucla-soc` MCP tools (`list_terms`, `search_courses`, `get_course_details`, `get_class_detail`, `get_course_description`, `parse_degree_audit`, `estimate_walk_time`, `list_buildings`). All schedule data is the public Schedule of Classes — unofficial and subject to registrar change.

**Create a todo for each step below and work them in order.** Steps 2 and 3 may be asked in one message; nothing else merges.

## Step 1 — Confirm the term

Call `list_terms`. Infer the term being planned from today's date (students usually plan the *next* term; the registrar's SoC default term is marked in the output). **Explicitly state the inference and get confirmation** — e.g. "It's early August 2026, so I'll assume you're planning **Fall 2026** — is that right?" If the date or context leaves the term genuinely ambiguous, ask instead of inferring.

## Step 2 — Ask what they want or need to take

Ask whether they have specific courses they want or need this term: required courses, courses of interest, a target unit load. Record answers; do not skip this step even though the degree audit in Step 3 will also suggest courses.

## Step 3 — Get course history and remaining requirements (DAR)

Request a Degree Audit Report with these exact instructions to the student:

1. Go to **dars.ucla.edu** and sign in.
2. Run a new audit for your program and open it (the **Audit Results** tab).
3. Press **Ctrl+S** (Cmd+S on Mac) in your browser and save it as an HTML file (single file or complete webpage).
4. Tell me the saved file's path (or drag the file into the chat).

Parse it with `parse_degree_audit` (use `status_filter: "unfulfilled"` first, then widen as needed). If the student can't or won't provide a DAR, ask for course history plus remaining requirements in any form (pasted transcript, typed list) before continuing.

**Reconcile with Step 2:** if the audit contradicts what the student said — different major/program than they described, a "needed" course already satisfied, a graduation timeline that doesn't fit their stated plans — stop and clarify with the student before proceeding.

## Step 4 — Verify prerequisites

For every candidate course, fetch requisites (`get_course_description`, and `get_class_detail` for enforced requisites). The two sources can disagree: the catalog text is advisory prose (with course numbers relative to the subject, "courses 32, 33"), while `get_class_detail`'s structured requisites table is what the registrar actually enforces per section (full course names, minimum grades, Enforced vs Warning) — treat it as authoritative for enrollment blocking. Check each requisite against the student's course history from Step 3. In-progress courses usually satisfy enforced requisites for enrollment, but say so rather than silently assuming. If a requisite is **not clearly satisfied** by the history, explicitly ask the student to confirm how it's covered (AP/IB credit, transfer credit, in-progress elsewhere, PTE/petition). Never include a course in the plan with unconfirmed prerequisites.

## Step 5 — Logistics preferences

Ask about: earliest acceptable start / latest end time, back-to-back classes vs. gaps, days they'd like free, and tolerance for cross-campus walks (North ↔ South Campus). For candidate back-to-back pairs, run `estimate_walk_time` on the two locations and flag anything over ~10 minutes. The estimates are straight-line-based and ignore UCLA's hills — treat anything within ~2 minutes of the passing period as tight, not fine, and say the numbers are approximate. Skip walk checks for online/asynchronous sections (common in Summer Sessions, where days/times are often "Varies").

## Step 6 — Build the schedule

Use `get_course_details` for live sections, seats, and waitlists. Choose sections honoring the preferences from Step 5. Conflict-check **every required meeting, including discussion/lab subsections** — enrollment requires both. Prefer open sections; where seats are tight, propose a backup section or course. Present the plan (and backup) in chat and get the student's agreement before rendering anything.

## Step 7 — Check final exams

For each chosen lecture, get the final exam date/time via `get_class_detail` (it fetches one large page per section and caps at 6 — pass `section` explicitly for multi-lecture courses). Flag any overlap and any day with 3+ finals. Some courses list no final (`final_exam: null`) — report that as "none listed / unknown," not as verified conflict-free. Final exam *locations* are typically placeholders until 9th week of the prior term — never feed them to `estimate_walk_time`; dates and times are the reliable part. Tell the student: **midterms, quizzes, and project deadlines are set by each syllabus — re-verify those yourself once syllabi/rubrics are released**, and finals data can still change.

## Step 8 — Render the mock schedule artifact

Only after the student agrees on a plan. **REQUIRED: follow [schedule-template.md](references/schedule-template.md) and fill every REQUIRED slot it defines.** Close the conversation with the template's caveats: data is unofficial, seats change, enroll via MyUCLA during your enrollment pass, and confirm requirements with a departmental counselor.

## Quick reference

| Need | Tool |
|---|---|
| Which terms exist / default term | `list_terms` |
| Subject codes | `list_subject_areas` |
| What a department offers | `search_courses` |
| Sections, seats, times, locations | `get_course_details` |
| Final exam, enforced requisites, notes | `get_class_detail` |
| Catalog description + requisite text | `get_course_description` |
| Degree audit parsing | `parse_degree_audit` |
| Walking time between buildings | `estimate_walk_time` |
| Look up campus building names | `list_buildings` |

## Common mistakes

| Mistake | Fix |
|---|---|
| Assuming the SoC default term is the one being planned | State the inferred term and get confirmation (Step 1) |
| Treating in-progress courses as completed prereqs without saying so | Name the assumption; ask if unsure (Step 4) |
| Conflict-checking lectures only | Discussions/labs are required meetings too (Step 6) |
| Rendering the artifact before the student agrees on the plan | Agreement first, artifact last (Step 6 → 8) |
| Reporting "no final listed" as "no conflict" | Distinguish verified-clear from no-data (Step 7) |
| Presenting seat counts as stable | Note the as-of time; recheck at enrollment (Step 6) |
