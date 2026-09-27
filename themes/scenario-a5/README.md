# DX3rd Scenario Theme

`theme.css` is the default Vivliostyle entry point for the semantic HTML
contract in `docs/html-contract.md`. Its visual baseline ports the major values
of the old `gift` theme without restoring the old HTML classes or Markdown
rewriting workflow.

## Entries

- `theme.css`: A5 portrait, 14 mm margins on all sides, no bleed, page number
  centered at the bottom (16Q with a 4 mm start margin), and the section name
  document ID vertically set in the right-side page margin. Body text uses 16Q/28Q Japanese
  typography; major section headings, panels, fields, tables, and links follow
  the documented gift port map.
- `theme-a4.css`: optional A4 portrait entry with 18 mm margins. It imports the
  same semantic rules and remains secondary to A5 acceptance.

No network fonts, images, or icon fonts are loaded. Common Japanese system
font names are tried before generic fallbacks. The old chapter-band image and
Material Symbols icons are deferred; their current CSS reserves the relevant
geometry but does not claim exact asset parity.

## Visual comparison fixture

`tests/fixtures/visual/gift-op1-parity.md` recreates the reader-facing content
of `gift/manuscripts/op1.md` using the current Markdown contract. It is a
visual QA fixture, not production manuscript or parser-conformance input. Build
its A5 PDF with:

```text
npm run build:pdf -- --config tests/fixtures/visual/build.config.json --paper a5
```

The production build configuration is unchanged. The complete old-to-new
mapping and known visual differences are in `docs/gift-css-port-map.md`.
