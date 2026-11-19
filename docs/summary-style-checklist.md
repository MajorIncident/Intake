# Summary & Styling Checklist for New UI Controls

Any new field, dropdown option, or selectable control added to the interface must:

1. **Feed the Copy & Paste Summary.** Wire the new data into `src/summary.js` (or a nearby formatter) and assert it in a summary-focused test under `tests/`.
2. **Maintain Apple-like readability.** Use the existing spacing rhythm, typography scale, and semantic classes already defined in `styles.css`. If you rely on existing rules, still document the decision.
3. **Document the mapping.** Note how the control flows into the summary and any styling considerations here so reviewers can trace the intent quickly.

Run `npm run verify:summary` to enforce this checklist. The guard fails when new form controls appear without accompanying summary wiring, styling updates, or a note in this file.


## Presentation-only experience surfaces

Containers marked only with `data-experience-surface` control Standalone / Student / Instructor visibility and do not capture user data. The summary and persistence diff guards intentionally ignore those container-only additions. If the same added line introduces a real `input`, `textarea`, `select`, `option`, `button`, or `label`, normal guard enforcement still applies.

## Privileged session-only controls

Administration / Maintenance controls use `data-persistence="session-only"` because they are outside the Intake data model and must never enter local Intake persistence, templates, file exports, or Copy & Paste Summary output.

The summary and persistence guards treat both `local-only` and `session-only` controls as explicitly non-Intake state. Admin credentials, lifecycle filters, purge thresholds, preview confirmation controls, and recovery values therefore remain excluded from incident summaries by design. They still require normal accessible labels and shared visual styling.

