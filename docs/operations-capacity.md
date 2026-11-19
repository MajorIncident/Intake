# Operations Capacity

How much server traffic a real class generates, and what to check before a pilot. Numbers come from the polling constants in `src/` (re-derive them if those constants change).

## Request rates per connected browser

| Source | Interval | Requests/second |
| --- | --- | --- |
| Collaboration revision poll (`src/collaboration.js` `POLL_DELAY_MS`) | 0.9 s | 1.11 |
| Presence heartbeat | ~2 s | 0.50 |
| Student own-status poll (`src/classroomStudent.js`) | 2.5 s | 0.40 |
| Student coaching poll (`src/classroomCoaching.js`) | 2.5 s | 0.40 |
| Student staged-exercise poll (`src/classroomExerciseStudent.js`) | 2.5 s | 0.40 |
| **Student total** | | **≈ 2.8** |
| Instructor roster poll (`src/classroomInstructor.js`) | 5 s | 0.20 |
| Instructor observer poll (while observing) | 1.2 s | 0.83 |

Hidden tabs suspend the collaboration poll and heartbeat; unchanged revisions return an empty 204 but still count as one Serverless Function invocation and usually one database query.

## Typical class

About **22 Students in about 5 teams**, plus one Instructor:

- ≈ 22 × 2.8 + 1 ≈ **63 requests/second** while everyone is active;
- ≈ **225,000 function invocations per hour**, ≈ **680,000 for a 3-hour session**;
- each invocation performs one or more Neon HTTP queries.

Individual work (one workspace per Student) does not change the request rate — it is per browser, not per team.

## Pre-pilot checklist (human)

1. Compare the numbers above with the current Vercel plan's function-invocation and execution limits, and Neon compute-hour limits. Confirm the plan's terms allow the intended use (Vercel Hobby is non-commercial).
2. Run one rehearsal with ≥ 5 real devices for 15 minutes and read Vercel's usage dashboard to calibrate.
3. If limits are tight, the cheapest levers are, in order: lengthen the Student coaching/exercise/status polls (they change rarely), skip the exercise poll when no exercise exists, and combine Student status/coaching/exercise into one endpoint.

## Abuse controls

Class creation requires the class-creation password, and unauthenticated creation/admission endpoints are rate-limited per client address (see `docs/classroom-api.md`).
