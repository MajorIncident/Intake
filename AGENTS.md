# Intake Repository Guidelines

## Scope
This file applies to the entire repository unless a more specific `AGENTS.md` file exists deeper in the directory tree. Follow these guidelines when editing or adding files anywhere in the project.

## UI/UX Principles
- **Apple-like spacing:** Use generous whitespace, especially around sections, cards, and form controls. Maintain consistent padding and margins (e.g., multiples of 8px) to create a calm, breathable layout.
- **Typography hierarchy:** Favor clean sans-serif fonts with clear size steps. Headings should scale down gradually, and body text should remain highly legible. Use weight, size, and color to signal hierarchy while keeping the palette minimal.
- **Progressive disclosure:** Reveal information and advanced inputs gradually. Present primary actions and essential fields first, and defer complex or optional inputs to expandable sections or secondary cards.
- **Accessible contrast and feedback:** Ensure sufficient color contrast, provide clear focus states, and pair iconography with text labels so interactions remain inclusive.

## Coding Conventions for `ktintake.html`
- **Section structure:** Split the intake experience into concise cards or panels. Each card should focus on a single topic (e.g., contact details, project scope, impact metrics) to reduce cognitive load.
- **Layout patterns:** Use vertical stacking for form fields to emphasize the importance of each input. Group related fields with headings or subheadings, and align labels consistently on the left.
- **Impact fields:** Present impact-related inputs in vertically ordered sections that flow from high-level summaries to supporting details. Pair charts or key metrics with explanatory copy when applicable.
- **Consistency:** Reuse component classes and utility styles for spacing, typography, and buttons. Favor semantic HTML elements (`<section>`, `<header>`, `<form>`, `<fieldset>`, etc.) to communicate structure clearly.
- **Interactions:** Incorporate inline validation and helper text near the relevant fields. Keep calls-to-action concise and prominent within each card.

## Extending These Guidelines
- Place any additional global conventions or tooling instructions in this root-level `AGENTS.md` file.
- If a specific directory or feature needs specialized guidance, create a sub-`AGENTS.md` within that directory. Its instructions will override or extend these guidelines for files within its scope.
- Document the intent and scope clearly at the top of any new `AGENTS.md` so future contributors understand where and how to apply it.
