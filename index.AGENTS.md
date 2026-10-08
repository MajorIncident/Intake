# KT Intake HTML Guidelines

## Scope
This file applies to `index.html`. Follow these instructions when editing any portion of the intake application.

## File Layout & Anchors
`index.html` is divided into named anchors. Only edit inside the matching start/end comments and keep the marker text unchanged.

- `[styles]` / `[vars]` – Anchor references for global CSS. The actual styles live in `styles.css` but the comments must remain.
- `[header]` & `[section:*]` – Visual cards for each workflow stage (bridge activation, problem summary, evidence, baseline/current, impact, communications, KT table, possible causes, steps, summary export).
- `[subtitle]` – Single `h2` below the preface stack used by `src/preface.js` / `src/summary.js` to mirror the narrative subtitle stored with `kt-intake-full-v2`.
- `[feature:templates-drawer]` – Shared Templates / Case Studies drawer owned by `src/templatesDrawer.js` and `src/templateAvailability.js`. Preserve the role policy: Standalone = Templates only, Student = Templates + Case Studies, Instructor = teaching-only Case Studies. Do not infer confidentiality from hidden UI; #295 owns server-gated Case Study delivery.
- `[feature:experience-role]` / `[feature:experience-role-switch]` – First-run role chooser and View-menu switch owned by `src/experienceRoleController.js`.
- `[feature:student-class-entry]` / `[feature:student-experience-notice]` – Student join/reconnect gate and connected class context owned by `src/classroomStudent.js`. A valid client-only `#join=<human-code>` intent may prefill the normal class-code field through `src/classroomJoinLink.js`; it never bypasses normal admission or replaces a saved Student class session. On narrow screens the connected Class context defaults to a compact presentation with `studentClassContextToggle`; that expansion state is local presentation only and must not enter the Student resume envelope or Intake state. All classroom inputs/context are local-only and summary-excluded; class codes and workspace capabilities must never enter Intake state.
- `[feature:collaboration-presence]` / `[feature:notes-workspace]` – The Team/people and Notes surfaces share the secondary workspace dock. On narrow screens each defaults compact but remains one-action accessible. Team expansion is presentation-only and must not change collaboration state; Notes mobile expansion is presentation-only and must not rewrite the persisted desktop `notesWorkspace.open` preference. Keep the Student dock in normal flow on mobile rather than adding competing fixed overlays.
- `[feature:instructor-shell]` / `[feature:instructor-observer]` – Instructor class entry/roster and live read-only observation owned by `src/classroomInstructor.js`. The join-code panel may expose **Copy code**, **Share class**, and **Show/Hide QR**. Share class uses `src/classroomJoinLink.js`; QR uses the local `src/classroomJoinQr.js`; both may carry only the same fragment-based human-code URL and never bearer authority. The QR SVG contains only local vector modules plus accessible human-code labeling, not the raw URL in attributes. Instructor class/session controls are local-only. Observed Student snapshots may render through the existing Intake DOM, but the observer must preserve local storage around rehydration and re-project Student-owned controls read-only; never save observed Student state as the Instructor's Intake.
- Classroom coaching panels are **dynamic**, not new structural `index.html` anchors. `src/classroomCoaching.js` appends local-only/summary-excluded Instructor controls or Student feedback beside targets from `src/coachableFields.js`. Never add coaching controls to Intake persistence merely because they render inside `.field` or KT row containers.
- `[section:summary]` – Container for the latest generated summary text. Keep IDs intact for persistence and testing hooks.
- `[script]` – Reference block for the external ES module entry point.
  - `[rows]`, `[script:table-build]`, `[script:preface-refs]`, `[script:tokens]`, `[script:init]`, `[script:export]`, `[script:storage]`, `[script:toast]` – Historical anchors preserved for traceability. They now correspond to modules imported by `main.js`; do not remove them even though the code resides in `src/`.

Preserve the order of these anchors. If you need a new section, duplicate the existing pattern: insert markup between neighbouring anchors and provide matching comments such as `<!-- [section:new-feature] start -->` / `<!-- [section:new-feature] end -->`.

## Editing Contract
- Do **not** rename or delete anchor markers, tokens `{OBJECT}` or `{DEVIATION}`, or protected function names documented in `AGENTS.md`.
- Keep the DOM IDs and ARIA attributes stable. Tests and AI agents rely on them to replay state via `collectAppState()` / `applyAppState()`.
- All behaviour lives in modules under `src/`. Avoid inline scripts in the HTML; instead, export helpers from a module and import them in `main.js`.
- Only modify `main.js` to register new modules or top-level event wiring. Feature logic belongs beside the DOM it controls (`src/preface.js`, `src/kt.js`, etc.).
- When adjusting layout, reuse existing classes (`.card`, `.field`, `.grid`, `.chipset`, etc.) before introducing new ones.

## Data Structures & Persistence
- Immutable data such as `ROWS`, `CAUSE_FINDING_MODES`, and `STEP_DEFINITIONS` live in `src/constants.js`. Update them cautiously and ensure each change flows through summary generation and persistence.
- `collectAppState()` and `applyAppState()` coordinate the round-trip of UI state. When you add new fields, hook them into those helpers plus the serialization logic in `src/storage.js`.
- Local storage uses the key `kt-intake-full-v2`. Keep this identifier stable, but accept only the current `APP_STATE_VERSION`; pre-production historical snapshot versions are intentionally unsupported after #328.
- Experience role is an explicit exception to Intake persistence: `kt-experience-role-v1` is owned by `src/experienceRoleController.js`.
- Student classroom session/recovery are also outside Intake persistence: `kt-classroom-student-session-v1` and `kt-classroom-student-local-recovery-v1` are owned by `src/classroomStudent.js`. Never collect these keys or any classroom capability into `kt-intake-full-v2`, file exports, summaries, or templates.
- Instructor classroom resume is outside Intake persistence: `kt-classroom-instructor-session-v1` is owned by `src/classroomInstructor.js`. It may contain the raw Instructor class capability for same-device resume, so it must never enter `kt-intake-full-v2`, file exports, summaries, templates, URLs, or editable collaboration aliases.

## Extending Behaviour
- New UI fields should include descriptive labels, helper text, and keyboard/focus affordances. Maintain semantic grouping with `<section>`, `<fieldset>`, and accessible legends.
- To surface new data in the summary, update the relevant formatter in `src/summary.js` and ensure the summary card IDs in the HTML stay unchanged.
- For AI prompt adjustments, prefer to add new summary modes via `generateSummary(mode, variant)` rather than introducing inline handlers.

## Testing Hooks
- Summary buttons (`#genSummaryBtn`, `#generateAiSummaryBtn`, `#commAIPromptBtn`) remain the canonical triggers. If you add variants, expose them through `generateSummary()` to keep the global fallbacks (`window.onGenerateSummary`, etc.) valid.
- Steps drawer controls (`#stepsBtn`, `#stepsCloseBtn`, `#stepsDrawer`) and communications actions must remain accessible for automated tests. Update `src/steps.js` or `src/comms.js` if structural changes are required.

## Styling Updates
- All CSS referenced by `index.html` now lives in `styles.css`. When adjusting component spacing, typography, or responsive behaviour, update that stylesheet and keep the `[styles]` anchor comment in the HTML as a pointer only.
- Maintain the variable definitions defined under `[vars]` and reuse established class names to avoid fragmenting the design system.
