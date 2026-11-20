# Write a KT case into Intake

This is the repeatable **execution checklist**. The field-level rules, examples and nonnegotiables are in the [Case Study authoring contract](../case-study-authoring.md). Read that document before touching a case payload. The [KT repository integration guide](https://github.com/MajorIncident/kt-application-coach/blob/main/docs/INTAKE_CASE_AUTHORING.md) is the companion source-side entrypoint.

## Task trigger

Use for requests like: "Take the [official KT case] from kt-application-coach and build/load it into Intake," "write the complete answer into General/Full," or "add a case for Classroom."

## 1. Preflight and sources

1. Refresh Intake and `MajorIncident/kt-application-coach` live main, PR/issues, scoped `AGENTS.md`, Intake `STATUS.md`, and this playbook. Do not rely on case facts from earlier conversations.
2. Invoke the **installed KT Application Coach Skill**; read its current entrypoint and relevant process/named-case guidance, complying with license/availability. If unavailable, request installation through [KT's validated Skill ZIP instructions](https://github.com/MajorIncident/kt-application-coach/blob/main/docs/INSTALL.md); user action is required in ChatGPT and a pasted repository URL does not install the Skill. Never pretend the Skill or private case source is accessible.
3. In the KT repo inspect `skill/kt-application-coach/references/case-registry.md`, the specific `case-*.md`, governing process and authority references, official participant dossier/exhibits, instructor preferred answer and post-exercise reveal. Confirm the case family/edition, role visibility and actual resolution.
4. Build a working evidence map: `learner facts | instructor/debrief facts | official answer/confirmation | permissible KT inference | unknowns`. Reconcile the official case preference with higher-priority generic KT Concept Rationale mechanics when necessary.

## 2. Author the complete source (not a set of partial files)

5. Start `templates/<slug>.json`, `templateKind: "case-study"`, supported presentation modes, one full `state`. Use [Red Sweat after #349](https://github.com/MajorIncident/Intake/blob/main/templates/red-sweat-mystery.json) for **schema structure only**. Default `meta.intakeMode` to the natural lens (General for a non-MIM KT PA); fill relevant full Major Incident schema fields without inventing operations.
6. **Intake `pre`:** official short **Object + Deviation** problem statement; specific object; Should; Actual; and concise *participant-stage* evidence, no answer leakage.
7. **Impact `impact.now/future/time`:** present impact ("Who cannot do what right now?"), plausible future incremental impact, and a real resolution deadline/decision event. Do not assert inability not in the source. **Symptom onset belongs in WHEN**, not `impact.time`.
8. **KT `table[]`:** factual WHAT/WHERE/WHEN/EXTENT IS plus close factual IS NOT; `di` only for a distinct unique fact of that pair, `ch` for a properly dated change; leave unsupported values blank/NMD in the appropriate field, not as a false IS NOT.
9. **`causes[]`:** official preferred causal mechanism first; complete causal statements and all supported `findings[questionId]` with Y/A/N (`yes|assumption|fail`) and specific explanations for the paired boundary. Check candidate changes could actually precede the onset. `likelyCauseId` is MPC, not automatic True Cause; put the **official confirmed cause, evidence and corrective outcome** in Full, with relevant confirmation approach(es).
10. **Remaining full fields:** `ops`, `steps`, `actions`, `handover`, DA/PPA, notes and appearance only where supported. A PA case does not need invented incident commanders, severity, made-up actions, major incident checklists, DA choices, PPA ratings or repetitive disclaimers. A blank irrelevant field is correct.
11. Existing self-study projections are **Intake -> IS / IS NOT -> D&C -> Full (Final answer)**. Existing Classroom server-side stage release controls learner visibility; do **not** duplicate it in a new case.

For Case Library work (#353), also set `libraryGroup` and the separate `participantCase` reading sections from **initial authorized learner-visible facts**, not `state` Full answers. See [the inventory](../case-library-inventory.md). Stage-released text/figures remain controlled by the existing exercise API; absence of usable image rights means use text instead of publishing scans.

## 3. Build, test, review and hand off

12. Check **publication rights** before adding to `scripts/standalone-public-case-studies.mjs`. An allowlisted case's Full answer is downloadable; a per-minute password is not access control. Never commit copied official PDFs or full protected exhibits.
13. Commit authored JSON plus **both generated manifests**:
    ```bash
    npm ci
    npm run build:templates
    npm run verify:protected-cases
    npm run quality
    npm run test:browser
    ```
    `npm run check:templates` also detects generated manifest drift.
14. Regression test exact KT field answers, source-preferred cause, chronology, compare/assumption logic, early-view no-answer leakage, Full answer completeness, General/MIM lens, serialized MIM field preservation, manifest equality and existing Standard Template behavior.
15. Create a linked PR on a feature branch; record sources, edition, rights, case facts vs derived hypotheses, field placement, coverage, CI and manual check steps. Update `STATUS.md` as a checkpoint, never claim unrun tests or unverified production.
16. After checks and review, obtain explicit merge authorization. Verify merge commit is `main` HEAD; verify Vercel `READY` on the exact SHA, then perform a live browser pass of all four views in General/MIM.

## Lessons encoded in the Red Sweat history

- **#346 mistake:** useful starting evidence, but **Full** had blank D&C, causes and test/confirmation answers.
- **#347 mistake:** filling every possible MIM input with fictional actions/DA/PPA, mixing episode timing into impact, repetitive disclaimer prose, and giving invented evidence the same status as case facts.
- **#349 accepted pattern:** official Problem Statement and official confirmed life-vest red-ink cause; clean factual IS/IS NOT, over-water/vest distinction and properly dated life-vest Change; later ozone-filter change eliminated; impact current/future/time correctly separated; one source-backed corrective action and optional fields left blank.

**If source access, an active Skill, source rights or a reliable official answer is missing, report the blocker rather than inventing a case answer.**
