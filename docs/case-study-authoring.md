# Author an official KT Case Study in Intake

**Purpose:** This is the durable content-and-field contract for writing a **complete, accurate official KT case into the Intake product**. Use the shorter [task playbook](playbooks/author-kt-case-study.md) for execution. Established from the Red Sweat Mystery sequence: starter [#346](https://github.com/MajorIncident/Intake/pull/346), overfilled worked example [#347](https://github.com/MajorIncident/Intake/pull/347), and corrected, accepted KT-first version [#349](https://github.com/MajorIncident/Intake/pull/349).

**User job:** "Use KT Application Coach to take [named official case] from the KT repository and write its full, source-correct answer into Intake, ready for General or Major Incident view and classroom use."

**Success means** a source-faithful, completed case record that the appropriate Intake views can project; it does **not** mean maximizing the number of nonblank textareas or programming a second Classroom reveal system.

## 1. Preflight: two repos and one installed Skill

1. Refresh the live `main` SHA, issues, open PRs, current checks and `STATUS.md` in **both** repositories before editing. Follow each repo's root/scoped `AGENTS.md`.
2. **Invoke KT Application Coach first.** Check whether the host already has the installed `kt-application-coach` Skill, and follow its entrypoint, current demonstration/license availability and source authority. Do not work from memory, an outdated chat reply or a generic AI-generated worksheet.
3. **When the Skill is not installed:** tell the user installation is needed. Direct them to [the canonical installation guide](https://github.com/MajorIncident/kt-application-coach/blob/main/docs/INSTALL.md) and [the latest validated release](https://github.com/MajorIncident/kt-application-coach/releases/latest). For ChatGPT, the user installs the versioned Skill ZIP through **Plugins > Skills > Add > Upload from your computer**; the GitHub URL is **not** a one-click installation and a connected agent cannot silently install a Skill on the user's behalf. Claude installation has different steps in the same guide. Verify the actual installed version; installed packages do not auto-update from GitHub. Do not bypass an unavailable/expired license by pretending the Skill is available.
4. Connect to and inspect `MajorIncident/kt-application-coach`, the **authoritative case/source repository**, plus `MajorIncident/Intake`, the **target product**. Both connections and permission to read the requested source are required. Do not substitute a similarly named public case or trust a stale embedded example. Private source may be inaccessible without authorization.
5. Identify the exact case and version from `skill/kt-application-coach/references/case-registry.md`. Read `skill/kt-application-coach/references/case-<slug>.md` where present, the relevant process reference, `source-authority.md`, `rule-governance.md`, the named-case and process playbooks, and the actual official participant/instructor materials where authorized:
   - Participant/learner facts: `sources/official/psdm-participant/cases/`, `sources/official/ats-participant/cases/` or the approved source-family dossier.
   - Official debrief and case-specific preferred answer: instructor reference, case-specific `case-*.md`, officially reconciled source notes, or separate participant post-exercise reveal.
   - Canonical source documents and source-version relationships remain under the KT repository's `sources/`; do not copy entire manuals or protected source PDFs into Intake.
6. If multiple editions share a title, **prove** identity/version/lineage from the registry and their distinctive facts, exhibits, roles, chronology and solution. Do not merge unrelated similarly named cases.
7. Make a short **source/evidence map** before filling fields: initial learner-visible facts; instructor-only or post-exercise facts; official worked answer and confirmation; exact KT process mechanics; unknowns; any narrowly justified supplementary hypothesis/inference.

**Authority boundary:** The official named-case source governs **the case facts, preferred sample resolution, role permissions, sequencing and debrief**. Current KT Concept Rationale and canonical generic process rules govern **KT mechanics** if they conflict with a sample worksheet or instructor preference. Do not overwrite an official case solution with a fabricated "better" one; equally, do not elevate a sample method over a stronger governing KT rule. Preserve valid alternative solutions when the authoritative case permits them.

## 2. Write ONE complete authored source

Add or update **one** `templates/<case-slug>.json` with `templateKind: "case-study"`, an informative `id`, `name`, concise `description`, `supportedModes` and a full `state` matching `src/storage.js` / `src/appState.js`. Use `templates/red-sweat-mystery.json` as the **accepted structural/example baseline** (as corrected by #349), not a source of facts for other cases. A new named case must be written from its own sources.

The **authoring data model is the superset of Major Incident Management fields** even when `state.meta.intakeMode` is `general`. Populate all **relevant, supported** fields accurately; do not populate every possible field just to look complete. General Mode hides incident-only UI fields; selecting Major Incident exposes appropriate additional fields. The selected mode, the experience role and the case-study kind are independent. Keep an authentic non-incident PA case in General by default instead of falsely declaring a major incident.

### Intake field placement (do not conflate these questions)

| Intake field | Answer this question | Put here / keep out |
| --- | --- | --- |
| `state.pre.oneLine` | What specific object has what deviation? | Use the official concise KT **Problem Statement**, normally object + observed deviation only, no cause or fix. Red Sweat: "Flight Attendants have red sweat." |
| `state.pre.objectPrefill` | Which specific object is affected? | Affected object/group and identifying context; not all of the problem analysis or its consequences. |
| `state.pre.healthy` | What **should** happen? | Baseline/expected behavior; not a fabricated IS NOT comparison. |
| `state.pre.now` | What is **actually** happening? | Observed factual deviation; not inferred mechanism or confirmed cause. |
| `state.pre.proof` | What evidence establishes the problem? | **Participant-stage** observed facts and discriminating evidence, concise enough to use. No post-exercise solution, unearned final cause or lengthy case-handout reproduction. |
| `state.impact.now` | **Who cannot do what right now?** | Current operational/person impact, including any known restriction and scale. When the source proves only symptoms but **not** lost ability, state what is affected without inventing inability or outages. Red Sweat affects attendants' skin; the source does not establish inability to work. |
| `state.impact.future` | What impact could occur **if this continues**? | Source-supported likely spread, recurrence, downstream impact. A clear modest inference is allowed (e.g. further cases on subsequent flights) but do not promote conjectured health/safety or financial damage to fact. |
| `state.impact.time` | **By when** does resolution become difficult/expensive/irrelevant? | Actual deadline, event, threshold or decision point, with consequence. If none is supplied, state that no deadline is specified; a practical next event can be identified without calling it a mandatory historical deadline. **Never substitute the PA symptom onset time** (e.g. "within 30 minutes after takeoff") for the resolution timeframe. |
| `state.ops` | Which incident-management facts exist? | Detection/evidence/containment only to the extent supported. Only real known roles, severity, bridge times, communications, mitigations, outcomes. Keep unsupported `icName`, `bcName`, severity, timestamps, updates and cadence blank. Confirmed fix/result may appear in **Full**; early projections must not leak it. |

The prefacing evidence and Impact are **different jobs**. Do not put a long disclaimer about unknown medical outcomes into "Who cannot do what"; do not repeat the entire WHAT/WHERE/WHEN specification in Impact.

### KT worksheet mapping

| Intake payload | KT meaning / quality requirement |
| --- | --- |
| `state.table[]` rows | Preserve canonical `questionId`/band/question labels (WHAT object, WHAT deviation; WHERE location/on object; WHEN first/since-pattern/in-life-cycle; EXTENT amount/count/trend as relevant). Record only factual, dimension-correct `is` values. |
| `row.no` | **Close factual IS NOT** that could experience the deviation but does not. Never use SHOULD, "unknown", "NMD", or a fictional unaffected comparator as if it were established. Leave blank where no meaningful comparison exists. |
| `row.di` | **Distinction**: additional factual, unique characteristic of that exact IS when compared with the directly paired IS NOT, not another symptom, suspected cause or restatement of the pair. Leave blank rather than assert an unproven role/equipment exposure. |
| `row.ch` | **Change** in/on/around the distinction, with the best supported date/sequence. Use NKC when established, otherwise a specific information gap. Critically check whether it occurred **before/at onset**; a later change cannot cause earlier occurrences. |
| `state.causes[]` | Full causal mechanism (suspect/factor -> what changed or went wrong -> how the specific deviation results). Favor official case hypotheses/answer; add alternate hypotheses only where KT mechanics and source facts justify them. |
| `cause.findings[questionId]` | Test each candidate destructively against **every available close IS/IS NOT pair**: `yes` when known facts explain both; `assumption` with the specific unverified condition; `fail` with the contradicted fact. Do not score guesses as evidence or test an absent IS NOT as a valid pair. |
| `state.likelyCauseId` | Most Probable Cause / first verification priority; **not automatically** a confirmed True Cause. |
| `cause.evidence`, `summaryText` and `state.notesWorkspace` | Use the actual official sample resolution and separate **confirmation** for the Full answer: verify assumptions, observe, experiment, and/or try a fix and monitor. Record what the case reports as confirmed; identify hypothetical verification paths only when still needed. A short provenance note is enough. |

**Red Sweat #349 exemplar:** Distinction around affected over-water operations and safety demonstrations; new demonstration life vests introduced before January 1980; the later experimental air-filter rollout fails timing. Official True Cause: red ink flaked from demonstration vests, transferred to flight attendants, then spread by sweat; complaints stopped after vest removal. Do **not** "improve" this into an invented multi-person major-incident response. General-mode introductory views must not contain the ink explanation.

### Remaining full-schema fields

- `state.actions`: record source-backed implemented measures or explicit authorized case action plans with accurate status, ownership and verification. Do not add four fictitious tasks because the UI supports four action cards. A reported removal with successful recurrence outcome is a legitimate completed action.
- `state.steps`: include meaningful supported case steps where the case involves an incident-management workflow. Do **not** import/check a full Major Incident response checklist for a historical PA with no documented bridge, commander or service recovery.
- `state.decisionAnalysis` / `state.potentialProblemAnalysis`: fill **only** when the official case or requested integrated exercise contains a real DA/PPA. A PA case does not gain invented alternatives, scores, risk levels, rollback plans or owners merely to populate hidden fields.
- `state.handover`: short source-grounded current state, changes, outstanding risks, measurements, next steps where useful; do not restate the entire case or manufacture KPIs.
- `state.notesWorkspace`: at most useful source lineage, assumptions, specific instructor learning points and (in Full) solution/debrief. Avoid repeated "HISTORICAL / ILLUSTRATIVE / NOT ACTUAL" banners in every field; distinguish a proposed check from an observed test in one natural phrase.
- `state.appearance`, `state.meta` and other schema metadata: follow the current serializer. Do not add novel persistent keys to satisfy a case without a reviewed schema change.

### What may be inferred?

- **Allowed, clearly qualified:** a narrow consequence implied by a source ("could recur on later flights"), an open information question, a complete mechanism developed using governing KT technique, a competing testable hypothesis tied to source facts, and a proposed confirmation method selected for certainty/safety/speed/cost/ease.
- **Not allowed as fact:** invented case counts, injuries, inability to perform duties, exact deadline, named person/owner, date of first onset, flight/route inventory, demonstration handling by an unaffected role, computed confidence, executed experiment, established cause, completed action, incident severity or official case solution.
- If the official case has a **preferred solution**, use it first. Do not replace it with a hypothetical consulting exercise or new creative scenario. Where the official case is silent, apply the KT Skill's generic guidance and preserve assumptions.
- For unresolved data, use concise NMD/blank entries as supported by schema and document how evidence would be obtained **only if** it materially changes the analysis; avoid verbose caveat cascades. Correctness beats filled-cell percentage.

### Case Library delivery fields

Participant reading comes **before** applying an Intake mode. On selecting an authorized case in the dedicated Case Library, the reader shows `participantCase` first, followed by an explicit **Continue to analysis options** action; only then are Intake, IS/IS NOT, D&C and Full selectors visible. The later Full option remains an answered exemplar. Reader/filter/step state is client presentation only, never saved in `kt-intake-full-v2`.

For cases with two participant handouts in different stages, e.g. Mrs. Walther's Square Donuts, an optional `reveal: true` on a `participantCase.sections[]` record produces a native collapsed self-study later-handout disclosure. **That is not access control.** The Classroom Student catalog filters these later sections server-side, while Instructor catalog can list them. Authored `simulation` cases omit `participantCase` from the catalog altogether and must use the existing authorized stage-release API; do not build a separate reveal engine. Never put Full cause in initial reader text. The original PDF pages/images remain subject to source rights and secure asset delivery (#355).



Alongside the complete `state`, author `libraryGroup` and `participantCase` under the Case Study's **top-level JSON**, following [the Case Library inventory](case-library-inventory.md) and tracked [program #353](https://github.com/MajorIncident/Intake/issues/353). `libraryGroup` is `psdm`, `ats`, `legacy` or `mim`; New Rational Manager PA examples belong under Legacy with their specific source provenance recorded in the inventory, not falsely called KT's Major Incident Management cases. `participantCase.sections` contains short headings and participant-readable plain-text body sections, with no Full-cause spoilers or source content that has not yet been released. A staged case's initial material belongs in the existing `simulation.studentContent` release path. Include imagery only after source rights, protected asset delivery and stage authorization are confirmed, not as public PDF copies or remote embeds. Build group/browser metadata from the source once; a source listing does not imply its Full case has already been audited.

## 3. Presentation and classroom boundaries

`Intake -> IS / IS NOT -> D&C -> Full` is the **Standalone template projection sequence**:
1. **Intake**: starting evidence, Should/Actual, current/future impact and timeframe; no final answer.
2. **IS / IS NOT**: factual WHAT/WHERE/WHEN/EXTENT specification; no D&C or cause.
3. **D&C**: specification plus supported distinctions and dated changes; no final cause.
4. **Full = final answer/debrief**: complete worked analysis, possible causes and Y/A/N findings, MPC vs True Cause, official confirmed resolution and relevant supported full-schema fields. **Full must not be an empty worksheet.**

Classroom exercises **already** own instructor-controlled staged disclosure, authorization and server-side protected content. A Case Study JSON does **not** invent an additional reveal engine or classroom stage schedule. For authored `simulation` (when independently required and source-approved), use [classroom staging contract](classroom-staged-simulation.md); complete `state` is not a substitute for a server-withheld future stage.

**Security/distribution:** `templates/*.json` is authoring source. `api/protected-case-studies.manifest.js` is server-only. `src/templates.manifest.js` is browser-public **except** for the product owner's **temporary, explicit Standalone Case Study allowlist** in `scripts/standalone-public-case-studies.mjs`; any allowlisted case's **complete Full answer is downloadable** and the per-minute mode password is not confidentiality. Do not automatically add a new case to that allowlist. Confirm source rights and the owner's distribution decision first. Never publish proprietary source PDFs, role packets or instructor-only pages verbatim into a public repo.

## 4. Commit, build, verify, deliver

1. Read `AGENTS.md`, `templates/AGENTS.md`, this contract, [playbook](playbooks/author-kt-case-study.md) and applicable Classroom contracts. Open a tracked issue and work on a short-lived feature branch. Do not edit `main` directly.
2. Add or edit `templates/<slug>.json` as the **authoritative authored record**. Avoid manually editing only a generated manifest.
3. Run `npm run build:templates`. Commit **both** `src/templates.manifest.js` and `api/protected-case-studies.manifest.js` together with the JSON; public generation respects the allowlist.
4. Run `npm run verify:protected-cases`, `npm run quality` (includes manifest and repository hygiene checks), and `npm run test:browser` (required Playwright/axe). Use Node dependencies from `npm ci`; `npm run check:templates` detects drift. If direct local execution is unavailable, report what was actually verified and rely on CI for required gates; never describe generated-content inspection as an executed test.
5. Add/adjust case-specific `tests/<case>Case.unit.test.mjs` plus relevant `tests/templates.unit.test.mjs` and `tests/templatesRoleAvailability.feature.test.mjs` / browser coverage. Test **correct** factual placement, official cause, comparison/deviation chronology, Full completeness, earlier-stage answer non-leak, standard-template non-regression, General/MIM lens and source/manifest equality. Do not enshrine an incorrect old assertion just to keep CI green.
6. Open a PR with exact source refs/versions, authority/rights boundary, field mapping and examples, generated-manifest evidence, tests/CI, manual checks, rollback and next steps; update `STATUS.md` honestly as the single live handoff. Review source interpretation **and** rendered form fields, not only JSON validity.
7. After explicit merge authorization and passing mandatory checks, verify PR merged/commit equals `main`. Verify production deploy **READY on that exact merge SHA**, then actually load the case in General and MIM and inspect the four projections. A green CI test does not certify a live Vercel experience.
8. For any new case, start again from the current KT repository and Skill; neither source versions, installed Skill version nor Intake schema should be assumed unchanged.

### Acceptance gates / failure traps

- [ ] Skill present/active and actual case source/edition confirmed (or explicitly blocked, never faked).
- [ ] Official preferred resolution and KT generic process authority reconciled.
- [ ] `pre` has factual learner-visible evidence without solution spoilers.
- [ ] Impact **now / future / timeframe** reflects each question, not PA WHEN or speculative harm.
- [ ] IS/IS NOT pairs factual and correctly classified; D&C derived from pairs and dated.
- [ ] All supported close comparisons appear in cause-test findings, with assumptions named.
- [ ] Full contains real official cause and confirmation; no fabricated incident operations/DA/PPA.
- [ ] All relevant MIM-serializer buckets load, with unsupported fields blank.
- [ ] Existing Classroom authorization unchanged; Standalone publication explicitly approved.
- [ ] Authored JSON + both manifests identical to generator output; tests and browser gate green.
- [ ] GitHub merge and Vercel deployment independently verified; status/handoff accurate.

**Canonical example:** `templates/red-sweat-mystery.json` and its acceptance tests as revised in [PR #349](https://github.com/MajorIncident/Intake/pull/349). Earlier #347 illustrates the anti-pattern of filling every MIM field with invented operational detail; #346 illustrates the anti-pattern of leaving the Full answer empty.
