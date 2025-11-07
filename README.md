# KT Intake

KT Intake is a zero-backend, single-file HTML and JavaScript application that guides incident responders through the Kepner‑Tregoe (KT) problem-analysis method and major-incident management. Open the `ktintake.html` file in a browser to step through a structured bridge activation workflow, capture findings, and produce a polished summary that can be pasted into ServiceNow tickets or similar incident systems.

## Workflow overview

The intake experience walks facilitators through every stage of a live incident bridge:

1. **Bridge Activation** – establish whether the major-incident bridge is running, log owners, and record reference numbers.
2. **Problem Summary** – document the event headline, customer impact, and severity context.
3. **Evidence & Object** – capture detection signals, object identifiers, and key observations.
4. **Baseline vs. Current** – compare healthy metrics against current degraded behaviour.
5. **Impact Details** – note containment status, mitigations, and affected regions.
6. **Communication & Cadence** – track stakeholder updates, next communication deadlines, and the running log.
7. **KT IS / IS NOT Analysis** – populate the canonical KT table with precise IS and IS NOT statements for each question.
8. **Possible Causes** – brainstorm hypotheses, record testing modes, and mark findings against the KT evidence.
9. **Incident Steps Checklist** – work through the predefined major-incident playbook and mark progress in the steps drawer.
10. **Summary Export** – generate formatted summaries with or without AI prompt preambles for use in external systems.

Every section is contained in the single HTML file, so no server, build step, or database is required.

## Project structure

| File | Description |
| ---- | ----------- |
| `ktintake.html` | The entire application UI, styling, data model, logic, and persistence helpers. Editing anchors segment each major region. |
| `AGENTS.md` | Root project guidelines that describe UI/UX principles and global contributor expectations. |
| `ktintake.AGENTS.md` | Section-level editing rules specific to `ktintake.html`, detailing anchors, invariants, and how to extend the intake flow. |

## Usage

1. **Open the file** – download or clone the repository and open `ktintake.html` directly in any modern desktop browser.
2. **Bridge activation** – capture bridge state, lead contacts, and ticket identifiers at the top of the page.
3. **Problem summary** – fill in the narrative headline, severity, and initial impact scope.
4. **Detection & evidence chips** – toggle the detection chips to log which monitors alerted the team and add free-form evidence notes.
5. **Baseline vs. current** – use the baseline/current grid to compare pre-incident metrics, states, or behaviours against current readings.
6. **Containment status** – choose the containment radio option that matches the incident’s state and add mitigation details as needed.
7. **Communication tracking** – enter cadence targets, log stakeholders, and use the communication log to timestamp outbound updates. The cadence timer will highlight when the next update is due.
8. **KT table** – populate each IS / IS NOT field in the Kepner‑Tregoe table. Tokens such as `{OBJECT}` and `{DEVIATION}` auto-fill based on earlier fields.
9. **Possible causes** – add cards for each hypothesis, record supporting and disproving evidence, track assumption tests, and mark results with the finding chips.
10. **Steps checklist** – open the “Incident Steps” drawer to work through the pre-defined major-incident checklist and record progress for later export.
11. **Summary export** – click “Generate Summary” to create a ServiceNow-ready narrative, or “Generate AI Prompt” to include the AI preamble. The text is copied to the clipboard and surfaced in the summary card for manual copying if clipboard access is blocked.

All inputs auto-save to `localStorage`; closing and reopening the page restores the last captured state.

## Contributing

- Review the root `AGENTS.md` for the UI/UX philosophy (Apple-like spacing, typography hierarchy, progressive disclosure, and accessible contrast) before proposing changes.
- Read `ktintake.AGENTS.md` to understand the editing contract. Preserve anchors such as `[styles]`, `[rows]`, and `[script:init]`, and never rename tokens like `{OBJECT}` or `{DEVIATION}`.
- The `ROWS` and `STEP_DEFINITIONS` collections define core KT prompts and the incident playbook. Treat them as protected data and request approval before altering them.
- When introducing new features, add helper text, storage keys, and summary-output handling alongside the UI changes. Document any specialised rules in additional sub-`AGENTS.md` files within new directories or modules.

## Future work

Milestone 2 and beyond will focus on modularising the single file into reusable components, formalising the data layer, and introducing automated tests. Those changes will happen after the documentation and contributor guardrails from this milestone are in place.
