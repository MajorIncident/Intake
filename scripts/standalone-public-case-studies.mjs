/**
 * @fileoverview TEMPORARY transition switch: protected Case Studies that are
 * also published to the PUBLIC browser manifest so **Work independently**
 * (Standalone) can load them again, as it could before #299/#295.
 *
 * Why: until the Student/Instructor classroom experience fully replaces
 * self-study, people still need to practise these cases without a class.
 *
 * Consequence (accepted by the product owner on 2026-11-19): every case listed
 * here — including its worked answers — is downloadable by anyone from the
 * deployed site's JavaScript. The per-minute "mode password" in the drawer is
 * pedagogy, not protection. Student/Instructor classroom delivery is unchanged
 * and still goes through the server-gated API.
 *
 * Rules enforced by scripts/build-templates-manifest.mjs and
 * scripts/verify-protected-case-boundary.mjs:
 * - only IDs listed here may appear in the public manifest;
 * - a Case Study with a staged `simulation` may never be listed (it would let
 *   Students bypass server-side progressive disclosure);
 * - the server-only `simulation` field is never copied to the public manifest.
 *
 * To end the transition: empty this list, run `npm run build:templates`, and
 * commit the regenerated `src/templates.manifest.js`. Standalone then returns
 * to Standard Templates only automatically.
 */

export const STANDALONE_PUBLIC_CASE_STUDY_IDS = Object.freeze([
  'microcomputer-cabinets',
  'paytrix',
  'mrs-walthers-sugar-donuts',
  'tamworth-petrochemical'
]);
