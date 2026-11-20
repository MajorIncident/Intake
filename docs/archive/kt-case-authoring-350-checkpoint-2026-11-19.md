# Historical KT authoring PR #351 checkpoint

Retained from STATUS.md as of the pre-Case Library checkpoint (PR #351 since merged).

## KT official-case authoring workflow (Issue #350 / PR #351)

- **Accepted source precedent:** Red Sweat Mystery official-solution correction [#349](https://github.com/MajorIncident/Intake/pull/349) is **merged** at `ce3dd06` on `main` (2026-11-19); its exact production deployment state has not been rechecked in this documentation slice. The earlier #346/#347 content mistakes are retained as anti-patterns.
- **Current documentation work:** [Issue #350](https://github.com/MajorIncident/Intake/issues/350), [PR #351](https://github.com/MajorIncident/Intake/pull/351), branch `docs/350-kt-case-authoring-playbook` based on `main` `ce3dd06`. New `docs/case-study-authoring.md` and `docs/playbooks/author-kt-case-study.md`; discovery links in root/template `AGENTS.md`, playbook index and README.
- **Companion KT-repository work:** [KT issue #563](https://github.com/MajorIncident/kt-application-coach/issues/563), [KT PR #564](https://github.com/MajorIncident/kt-application-coach/pull/564). They document invoking/installing the canonical Skill and the official case-source side; Intake owns JSON field mapping and CI.
- **Product-owner authoring decisions codified:** official KT case answer first; use the installed Skill or request installation, fetch case authority/participant/instructor evidence, map current/future/deadline Impact correctly, keep symptom onset in KT WHEN, write factual paired IS/IS NOT/D&C, test mechanisms and confirm the True Cause. **Full = final solution.** Use the complete MIM state surface where relevant but do not fabricate operations, DA/PPA, task registers or repeated provenance caveats. Classroom already owns stage release; public Standalone full-answer rights remain separately governed.
- **Scope:** docs only; no authored Case Study payload, generated manifest, server, database, skill source or release changes. Documentation and path checks committed; canonical `npm run quality` + `npm run test:browser` and PR policy checks must be verified on exact head in GitHub CI. Do not claim production acceptance or a new Skill release from these PRs.
- **Next:** verify exact-head CI and repo-hygiene guards for Intake #351 and KT #564; reconcile any doc links/check failures; obtain owner approval/merge decisions, update status at merge, and leave both docs as the cold-start route for future official KT case requests.

