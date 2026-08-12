# DX3rd Scenario A5 Theme

`theme.css` is the default Vivliostyle entry point. It formats the semantic
HTML contract from `docs/html-contract.md` as A5 portrait pages.

## Entries

- `theme.css`: A5 portrait, 3 mm bleed, 14 mm inline margins, and 16/17 mm
  block margins. The running header/footer uses the document kicker/title,
  section heading, and the Vivliostyle page counter.
- `theme-a4.css`: optional A4 portrait entry. It imports `theme.css` through a
  relative path and changes only the page box and a small set of sizing
  variables. Markdown, YAML, and generated HTML do not need to change.

The theme has no network font or image dependency. It starts with common
Japanese system font names and always includes generic fallbacks.

PDF generation and visual regression are outside this implementation step;
the CSS is covered by static contract tests in `tests/unit/theme.test.ts`.
