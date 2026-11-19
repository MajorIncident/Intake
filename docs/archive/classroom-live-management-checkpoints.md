# Live class management (#312) delivery checkpoints

> Archived verbatim from `docs/classroom-live-management.md` to keep the active contract short. This is historical delivery evidence, not current requirements. Current state lives in `STATUS.md`.

## Historical implementation checkpoint — additive persistence

Completed on #314 before any Student UI cutover. The bullets below describe that migration-time checkpoint; #328 later removed the compatibility structures it temporarily preserved:

- human join-code helpers enforce the eight-character unambiguous alphabet and normalize display separators/case;
- `classroom_classes.student_join_code` is additive and uniquely indexed when present;
- new `classroom_participants` initially persisted admitted live-class participants beside the then-existing compatibility membership table;
- a participant may exist with `workspace_id = NULL` as a first-class waiting/unassigned state;
- Student class-session capability hashes are independent from assignment-specific workspace-access hashes;
- re-admitting the same participant may rotate the class-session capability and update display name without inventing a workspace assignment;
- Instructor-scoped participant listing and Student-session lookup repository primitives are in place;
- at this historical checkpoint the two-code path remained unchanged; #328 subsequently removed it.

Durable implementation commits:
- `99c31f2e9c59180ed297db96512b62b310692b4c` — additive schema/repository primitives;
- `fa6180ada0183dfc4b19790925e61deea60bdfbf` — participant composite FK preserves required class identity when a workspace is deleted;
- `5665637e6f550bebb861c73109e991b6e96a73c9` — deterministic in-memory participant/session model;
- `df3633d008bb7e352509e15c1964b7d27ebf441f` — focused join-code/waiting-roster/session-rotation tests.

Validation on `df3633d...`:
- canonical repository quality: **241 tests, 1 intentional skip**;
- required Browser E2E: **22 passed, 6 intentional project-scoped skips, 0 failed**;
- CodeQL, Dependency Review, and Template Manifest Guard: green.

**Exact next tranche:** implement the new live-class HTTP layer around these primitives:
- Start Class emits a generated human join code while preserving the legacy high-entropy join token for compatibility;
- `POST /api/classes/admit` creates/rotates a waiting Student class session;
- `GET /api/classes/student` returns only the represented Student's own assignment state;
- `POST /api/classes/student/access` issues assignment-specific edit authority only when assigned;
- `GET /api/classes/participants` gives only the Instructor their live roster.

Do not implement assign/reassign UI or cut over the current Student client until these APIs and their authorization tests are green.

## Historical implementation checkpoint — live HTTP admission/status/access

Completed on #314 after the additive persistence tranche and before any Student UI cutover. #328 later removed the temporary compatibility outputs described in the original rollout.

Implemented:
- Start Class generates and returns a formatted human Student join code;
- `POST /api/classes/admit` accepts only join code + participant ID + display name and returns a high-entropy Student class-session token;
- admitted Students may remain waiting/unassigned with no collaboration edit authority;
- `GET /api/classes/participants` is Instructor-only and lists only the represented class;
- `GET /api/classes/student` returns only the represented Student's own assignment state and never a roster/workspace catalog;
- `POST /api/classes/student/access` exchanges a Student class-session token for a fresh assignment-specific `classroom-student` workspace capability only when assigned;
- rotating current workspace access revokes the prior edit token;
- the class-session token itself is not accepted by collaboration workspace APIs;
- live workspace-access tokens resolve through the Student coaching/protected-resource live-participant authorization boundary;
- workspace-access issuance checks class/workspace/assignment revision before persisting the token so a concurrent assignment change cannot silently bind stale access to the wrong team.

Durable implementation commits:
- `746559e67620aab3457b6cda90e42168d5350dde` — Start Class join code + live workspace-access repository path + migration-time Student context resolution;
- `1b81d4a4c80a7fe16cee5523d6c13811f51f20b3` — deterministic repository parity for live access;
- `2d6f92d05c693c35818e4457685c311c66a65807` — live admission/roster/status/access handlers;
- `11a83da6d96588022b8879b3c5ca1e6961e75ed8` through `dc698c1103285efe95932c253f6cdbd1172b3227` — Vercel route entrypoints;
- `04f95f24dd63d2ce75260034d75c9c514d07e84e` — focused HTTP authorization tests.

Validation on `04f95f2...`:
- repository quality: **244 tests / 243 pass / 0 fail / 1 intentional skip**;
- required Browser E2E: **22 passed / 6 intentional project-scoped skips / 0 failed**;
- CodeQL, Dependency Review, and Template Manifest Guard: green.

## Implementation checkpoint — assign / reassign / unassign authority

Completed on #314 before any live team-management UI cutover.

Implemented:
- Instructor-only `PATCH /api/classes/participants` assigns, reassigns, or unassigns one admitted Student;
- assignment is class-scoped: participant and destination workspace must both belong to the Instructor's represented class;
- `workspaceId: null` returns the Student to waiting/unassigned;
- assignment changes increment `assignmentRevision`; repeating the same assignment is idempotent and does not increment;
- any current assignment-specific edit capability is revoked **before** participant assignment metadata changes;
- stale collaboration presence is removed from the old workspace by internal workspace ID after revocation;
- the participant's stored workspace-access hash is cleared on assignment change;
- destination access is never issued by the Instructor assignment operation; the Student must later call `POST /api/classes/student/access`;
- cross-class destinations are rejected without changing assignment;
- individual live workspaces enforce one participant;
- leaving an individual workspace releases its individual claim for later reassignment;
- no assignment operation reads, copies, or merges Intake snapshots;
- live Student coaching/protected-resource context now additionally requires an active, unrevoked `classroom-student` collaboration alias, closing the stale stored-hash authorization window;
- optimistic assignment-revision protection means a concurrent conflict can fail closed with old authority revoked rather than risk stale authority surviving or being retargeted.

Durable implementation commits:
- `742240e92156a9d43a96752a2cb6acc5908f4172` — server-only presence cleanup by workspace ID;
- `2c1d6fdf6872eb1390424503f08692a581da6322` — deterministic presence-cleanup parity;
- `b48e6bbb71c2d6ec818ca1f69b656b3bffbed473` — live assignment repository/HTTP semantics plus active-alias validation for Student context;
- `a382acad42de25f4fa1ae217acf34d69a047606b` — deterministic assignment transition model;
- `7bfd662e2dcbe5511a4065b7b19222129485d08a` — full Waiting -> Team A -> Team B -> Waiting authority-cutoff and individual-workspace tests.

Validation on `7bfd662...`:
- repository quality: **246 tests / 245 pass / 0 fail / 1 intentional skip**;
- required Browser E2E: **22 passed / 6 intentional project-scoped skips / 0 failed**;
- CodeQL, Dependency Review, and Template Manifest Guard: green.

**Exact next tranche:** build the Instructor live-management client on this proven server contract:
1. Start Class as the primary Instructor action;
2. persist the Instructor capability for same-device resume;
3. display/copy the human Student join code;
4. show Waiting/Unassigned plus team/individual workspace roster;
5. create team/individual workspaces;
6. assign/reassign/unassign through accessible button/select controls first;
7. keep drag-and-drop optional/progressive enhancement, never the only assignment path;
8. wire observer/coaching navigation from each workspace;
9. extend the deterministic browser fixture and real-browser E2E for Instructor start/roster/team assignment before cutting over the Student client.

Do not implement Student one-code waiting/automatic reassignment UI until the Instructor management surface is browser-green.

## Historical implementation checkpoint — Instructor live-management client

Completed on #314 after the server assignment-authority tranche and before Student UI cutover. #328 later removes the public existing-class bearer recovery path.

Implemented at the #312 checkpoint:
- Instructor entry made **Start a class** the primary path while temporarily retaining **Open an existing class** as a collapsed recovery/advanced path;
- Start Class creates the class from a title, persists only the Instructor capability plus public class/join-code context for same-device resume, and enters the dashboard immediately;
- the dashboard displays the human Student join code with a copy affordance;
- live polling combines class workspaces with the Instructor-only participant roster;
- Waiting/Unassigned Students are visible before they have any workspace authority;
- Instructor can create Team or Individual workspaces from the management panel;
- accessible per-Student assignment selectors support assign, reassign, and unassign without requiring drag-and-drop;
- workspace cards count live `classroom_participants`;
- selecting a workspace continues to use the existing server-enforced read-only observer and coaching integration;
- workspace creation returns no assignment secret;
- same-device reload resumes the live class, current join code, participant roster, assignment state, and selected observer workspace;
- #328 removes the old existing-class recovery disclosure; same-device resume remains, with future recovery owned by #329 Administration / Maintenance;
- dynamic management controls are explicitly marked local-only so they never enter Intake persistence/export state.

Browser fixture / regression coverage:
- deterministic fixture now supports Start Class, live workspaces, live participant roster, assignment PATCH, and live observation;
- real-browser journey proves: Start Class -> join-code display -> Waiting Student -> create Team Alpha -> assign Student -> read-only observe Team Alpha -> reload/resume;
- the journey asserts the retired two-code route is absent and Instructor request bodies contain no retired assignment secret;
- serious/critical axe violations and uncaught browser errors remain fatal;
- current Instructor observer/coaching/negative-authorization journeys resume from a seeded same-device Instructor session where a pre-existing class context is required.

Durable implementation commits:
- `0d004552db82660dc723fd37a79ef4e46d197083` — live Instructor shell / primary Start Class UX;
- `9c26bdf1a546428092af44dcf342cb2eae0d44a4` — live-management layout and responsive controls;
- `f2306021eaa4cb95fd34e72940233fc0a99bcb3e` through `a2ae981e0a902f3c143446fec2fa1e77ef346d1f` — join-code/session, live roster, Start Class, workspace creation, assignment, copy, and lifecycle controller logic;
- `40f6ece94c47d026ac201e0f434f51329d38c604` + `8fe9e4438b18684377382c7e7cadd68208da1c53` — count live participants in server/deterministic workspace rosters;
- `09daa729f4b2a32e0c913985b741771ace34dc5f` + `709cd910de22189b1d362f58aa58c3c5abbf2642` — Instructor feature/unit coverage;
- `2a76541675217aff46f90c255c33e40968db718f` + `e23b4cd8cf998b313418706bc36b7cf2d175b1db` — live-management browser fixture;
- `692c81aa9c0007d94f2d91fe36bb34160ff9173c` — live Instructor Playwright journey;
- `6122ba21719ae6823095331f429e9c337bf3713d` — source-level local-only annotations required by the persistence guard;
- `205b0edc504e9978eb23e7f637ab14d811d9f088` through `d3e2a397cd76fc75e62516ed63ad76231bb4812c` — legacy Instructor browser journeys explicitly use the advanced existing-class recovery disclosure.

Validation on `d3e2a397...`:
- repository quality: **248 tests / 247 pass / 0 fail / 1 intentional skip**;
- required Browser E2E: **23 passed / 7 intentional project-scoped skips / 0 failed**;
- CI, CodeQL, Dependency Review, and Template Manifest Guard: green.

## Historical implementation checkpoint — Student live-class client

Completed on #314 after the Instructor live-management surface. #328 later removes the temporary recovery path.

Current behavior:
- Student entry is **display name + one human class code**;
- `POST /api/classes/admit` creates the live Student session and the human code is discarded after admission;
- the same-device live resume envelope persists only the high-entropy Student class-session capability plus public class/participant/assignment context;
- assignment-specific workspace edit capabilities are **memory-only** and intentionally rejected if present in a live resume envelope;
- an admitted unassigned Student renders a dedicated Waiting state, hides Intake, does not connect collaboration, and polls only own assignment status;
- assignment exchanges the class-session capability through `POST /api/classes/student/access`, then attaches the existing collaboration controller;
- reassignment disconnects/discards old workspace authority before requesting destination access; destination Intake is authoritative and no snapshot merge occurs;
- unassign disconnects collaboration and returns the Student to Waiting while retaining class-session authority;
- role changes pause/disconnect live workspace activity without destroying the resumable class session;
- terminal class-session failure clears invalid Classroom authority and restores pre-class local recovery where available;
- coaching and protected-resource Student integrations continue to receive only the currently active assignment-specific workspace token.

#328 compatibility reset:
- obsolete two-code Student join/resume is unsupported;
- browser authorization, coaching, protected Case Study, and collaboration journeys use only current live Student admission/session authority;
- the retired route, schema, and UI are removed.

Deterministic/browser coverage:
- focused tests prove one-code Waiting and Waiting -> Team Alpha -> Team Beta -> Waiting lifecycle;
- live resume tests prove no assignment-specific `workspaceToken` is persisted;
- the isolated browser fixture rotates fresh workspace capabilities while preserving canonical Team A/B snapshots;
- real-browser desktop + mobile coverage proves one-code join -> Waiting -> Team Alpha -> edit -> reload/resume Alpha -> Team Beta -> Waiting;
- the browser test proves destination Team Beta does not inherit Team Alpha Intake;
- stale Alpha access returns 404 after reassignment and stale Beta access returns 404 after unassign;
- serious/critical axe scanning caught the Waiting eyebrow contrast at 3.72:1; the Waiting surface now uses the existing accessible `var(--accent-text)` foreground;
- no browser journey depends on the retired two-code recovery disclosure.

Durable implementation commits:
- `47485439c34fc7237c28f93619924e2da87b084a` / `73792b71db9ec7965c36c2b905ebc09bb699ea78` — primary one-code Student UX and Waiting surface from the migration phase;
- `d32c7ec331daa5010f9617c6b332756e9395d35b` — live Student admission/status/access/resume/reassignment lifecycle;
- `db54b1aa84dc4d43802aa568b811b6974a84c02c` / `a3d520655c928abbeb4cb63e592593a38a969cd8` — live session-isolation and lifecycle tests;
- `8485b2ca1a5ba59fb98d4aae0398a9052fab91b6` / `2fd0d53c0fd8e4e4cac0298aca9f5ed7ad930a94` — isolated live Student browser fixture and side-effect-free Waiting behavior;
- `50f6260a251793c0794945d941ad4ac1c97d4e8d` — live Student Playwright journey;
- `30dbb0d807793fc503b4933c24ffa7e2ff50d8ba` through `1b90c0f40238769d6ab17ce9bfe7d44fc391a212` — historical migration-phase two-code browser coverage, retired by #328;
- `0c8692c7486ecb50c730d0757c41426b81830250` — Waiting-state WCAG contrast repair and green implementation gate.

Validation on `0c8692c...`:
- repository quality: **252 tests / 251 pass / 0 fail / 1 intentional skip**;
- required Browser E2E: **25 passed / 7 intentional project-scoped skips / 0 failed**;
- CI, CodeQL, Dependency Review, and Template Manifest Guard: green.

## Implementation checkpoint — integrated live-class acceptance

Completed after the Instructor and Student live clients were independently browser-green.

The deterministic browser server now has a parallel-safe integrated classroom namespace with its own Instructor capability, human join code, workspace IDs, participant roster, and shared workspace-state maps. This keeps the integrated acceptance journey isolated from the existing Instructor-only and Student-only fixtures when Playwright runs specs concurrently.

The real-browser journey in `tests/e2e/classroom-live-integration.spec.mjs` drives four browser contexts against one class:
- Instructor starts **Integrated Browser Classroom** and the test reads the actual join code rendered by the Instructor UI;
- Instructor creates Team Alpha and Team Beta;
- two Students join through that displayed one-code path and appear Waiting in the Instructor roster;
- both Students are assigned to Team Alpha through the accessible assignment selectors;
- one Student edits Team Alpha and the second Student converges on the same Intake;
- a late Student joins after Team Alpha work has begun, appears Waiting, and is assigned to Team Beta;
- Team Beta edits remain isolated while both Team Alpha Students retain Team Alpha state;
- Instructor opens Team Alpha read-only and observes the actual shared Student snapshot;
- Instructor saves field-level **Needs improvement** coaching and a Team Alpha Student receives it read-only;
- Instructor moves Student Alpha One from Team Alpha to Team Beta;
- the moved Student lands on Team Beta's existing snapshot rather than carrying Team Alpha content across;
- the remaining Team Alpha Student stays on Team Alpha unchanged;
- the moved Student's old Team Alpha workspace token returns 404;
- Instructor unassigns that Student, the Student returns to Waiting, and the old Team Beta token also returns 404;
- both destination-team and remaining-team state remain intact;
- serious/critical axe violations and uncaught page errors remain fatal.

Fixture implementation:
- `5f1404921eeec8b2aba3103672be547af35b6865` shares managed Instructor workspace state with Student collaboration/observation;
- `4f36af2d5221234a9ebf35d574f287f7aa52bb39` connects one-code Student admission/assignment to the Instructor-managed class;
- `e7b8d06111b8dbda6ba6a27372956b3d012899c3` enables coaching on managed live workspaces;
- `2262490c9de7da5a9b675932fda2c84475977168` adds the integrated four-browser acceptance journey;
- `971898cb4eca725ad079be5c8ba5c97484fdab2f`, `6c712e47383079d5aa50869be4e9d9a26def28e9`, and `9315210dd15ed583cfbd3201302699d025ded3a1` isolate and route managed fixtures by capability so parallel specs cannot reset or mutate each other's class state.

Validation on `9315210...`:
- repository quality: **252 tests / 251 pass / 0 fail / 1 intentional skip**;
- required Browser E2E: **26 passed / 8 intentional project-scoped skips / 0 failed**;
- CI, CodeQL, Dependency Review, and Template Manifest Guard: green.

This closes the browser acceptance matrix listed below for #312 without adding #313 staged exercise/case state.

**Exact next tranche:** final #312 security/docs/merge-readiness review. Reconcile the canonical API/architecture docs with the implemented one-code live lifecycle, review the complete `main -> #314` diff and unresolved review/security state, verify rollback/legacy compatibility language, and make the draft PR ready for review only if the documented head remains green. Keep #313 as the next separate product slice.
