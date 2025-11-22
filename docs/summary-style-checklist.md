# Summary & Styling Checklist for New UI Controls

Any new field, dropdown option, or selectable control added to the interface must:

1. **Feed the Copy & Paste Summary.** Wire the new data into `src/summary.js` (or a nearby formatter) and assert it in a summary-focused test under `tests/`.
2. **Maintain Apple-like readability.** Use the existing spacing rhythm, typography scale, and semantic classes already defined in `styles.css`. If you rely on existing rules, still document the decision.
3. **Document the mapping.** Note how the control flows into the summary and any styling considerations here so reviewers can trace the intent quickly.

Run `npm run verify:summary` to enforce this checklist. The guard fails when new form controls appear without accompanying summary wiring, styling updates, or a note in this file.
