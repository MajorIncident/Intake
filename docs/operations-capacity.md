# Operations Capacity

How much server traffic a real class generates, and what to check before a pilot. Rates come from the polling constants in `src/` and are **measured** by `tests/e2e/load-budget.spec.mjs` (re-derive them if those constants change; the test fails if an idle Student exceeds its budget).

## Request rates per connected browser

| Source | Interval | Requests/second |
| --- | --- | --- |
| Collaboration revision poll (`src/collaboration.js`) while anyone in the workspace is active (`POLL_DELAY_MS`) | 0.9 s | 1.11 |
| Collaboration revision poll when nobody has been active for 15 s (`IDLE_POLL_DELAY_MS`, `ACTIVE_WINDOW_MS`) | 3 s | 0.33 |
| Presence refresh (`PRESENCE_DELAY_MS`; focus/typing changes are also sent immediately) | 5 s | 0.20 |
| Student own-status poll (`src/classroomStudent.js`) | 5 s | 0.20 |
| Student coaching poll (`src/classroomCoaching.js`) | 5 s | 0.20 |
| Student staged-exercise poll (`src/classroomExerciseStudent.js`) during an exercise | 5 s | 0.20 |
| Student staged-exercise poll when the class has no exercise | 10 s | 0.10 |
| **Idle connected Student** (measured) | | **1.10** (was 2.80) |
| **Student while their team is active** (estimate) | | **≈ 2.0** (was ≈ 3.0) |
| Instructor roster poll (`src/classroomInstructor.js`) | 5 s | 0.20 |
| Instructor observer poll (while observing a workspace) | 1.2 s | 0.83 |

"Active" means local typing or focus, a received change, a save, or a teammate whose presence reports editing/focused. A whole team therefore switches to the fast poll together while anyone in it works, and back to the slow poll about 15 s after everyone stops. Hidden tabs suspend the collaboration poll and presence. An unchanged revision returns an empty 204 but still counts as one Serverless Function invocation and usually one database query.

## Typical class

About **22 Students in about 5 teams**, plus one Instructor (≈ 1 request/second while observing):

| Scenario | Requests/second | Invocations per hour | 3-hour session |
| --- | --- | --- | --- |
| Everyone connected, nobody typing (floor) | ≈ 25 | ≈ 90,000 | ≈ 270,000 |
| Realistic mix (about half the teams active) | ≈ 35 | ≈ 125,000 | ≈ 380,000 |
| Every team typing continuously (ceiling) | ≈ 45 | ≈ 160,000 | ≈ 490,000 |
| Before pilot blocker 6 (for comparison) | ≈ 63 | ≈ 225,000 | ≈ 680,000 |

Individual work (one workspace per Student) does not change the request rate — it is per browser, not per team.

## Plan limits (checked 2026-11; confirm on the provider's pages before a pilot)

- **Vercel Hobby:** 1,000,000 function invocations and 4 hours of Active CPU per month with Fluid compute; projects still on the legacy (non-Fluid) model are capped at **100,000** invocations. Exceeding a Hobby limit pauses the feature until the 30-day window resets. Hobby is for non-commercial use. Sources: [Hobby plan](https://vercel.com/docs/plans/hobby), [Functions usage and pricing](https://vercel.com/docs/functions/usage-and-pricing), [legacy pricing](https://vercel.com/docs/functions/usage-and-pricing/legacy-pricing).
- **Neon Free:** 100 CU-hours of compute per project per month; compute scales to zero after 5 minutes idle. A 3-hour class at the minimum 0.25 CU uses under 1 CU-hour, so Neon is not the constraint. Source: [Neon plans](https://neon.com/docs/introduction/plans).

What that means:

- On **Hobby with Fluid compute**, the monthly invocation allowance covers roughly **two to three 3-hour classes**; Active CPU may run out first if each invocation averages more than ~10 ms of CPU (calibrate in step 2 below).
- On **Hobby without Fluid compute**, a single class exhausts the 100,000 cap in under an hour. Check the project's Fluid compute setting first.
- Regular classes, or any commercial use, need a paid Vercel plan (usage billed beyond the included amounts).

## Pre-pilot checklist (human)

1. In the Vercel project, confirm **Fluid compute is enabled** and note the plan's current invocation and Active CPU allowances. Confirm the plan's terms allow the intended use.
2. Run one rehearsal with ≥ 5 real devices for 15 minutes and read Vercel's usage dashboard (invocations and Active CPU) to calibrate the per-invocation CPU cost; multiply out to a full class.
3. If limits are still tight, the next levers are, in order: combine the Student status, coaching, and exercise polls into one endpoint (≈ 0.4 requests/second less per idle Student); carry presence on the revision poll instead of a separate request; lengthen the idle collaboration poll beyond 3 s.

## Abuse controls

Class creation requires the class-creation password, and unauthenticated creation/admission endpoints are rate-limited per client address (see `docs/classroom-api.md`).
