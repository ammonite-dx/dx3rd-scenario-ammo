import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { parseScenarioMarkdown, renderScenarioHtmlFragment } from "../../src/index.js";

const projectRoot = process.cwd();
const themeRoot = join(projectRoot, "themes", "scenario-a5");
const entryPath = join(themeRoot, "theme.css");
const a4Path = join(themeRoot, "theme-a4.css");
const metadataPath = join(themeRoot, "package.json");

function readProjectFile(path: string): string {
  return readFileSync(join(projectRoot, path), "utf8");
}

function readThemeFile(path: string): string {
  return readFileSync(join(themeRoot, path), "utf8");
}

function expectSelector(css: string, selector: string): void {
  expect(css, `missing Theme selector: ${selector}`).toContain(selector);
}

function isMonochromeHexColor(color: string): boolean {
  const hex = color.slice(1);
  const channels = hex.length <= 4
    ? hex.slice(0, 3).split("").map((channel) => Number.parseInt(channel + channel, 16))
    : [0, 2, 4].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16));
  return Math.max(...channels) - Math.min(...channels) <= 2;
}

function resolveRelativeImports(css: string, sourcePath: string): string[] {
  const imports: string[] = [];
  const pattern = /@import\s+(?:url\(\s*)?["']([^"')]+)["']\s*\)?\s*;/gu;
  for (const match of css.matchAll(pattern)) {
    const target = match[1];
    if (!target || /^[a-z][a-z0-9+.-]*:/iu.test(target) || target.startsWith("//")) continue;
    const resolvedPath = resolve(dirname(sourcePath), target);
    expect(existsSync(resolvedPath), `unresolved Theme import: ${target}`).toBe(true);
    imports.push(resolvedPath);
  }
  return imports;
}

describe("scenario A5 Vivliostyle Theme", () => {
  it("has an A5 entry, metadata, and only resolvable local imports", () => {
    expect(existsSync(entryPath)).toBe(true);
    expect(existsSync(a4Path)).toBe(true);
    expect(existsSync(metadataPath)).toBe(true);

    const metadata = JSON.parse(readFileSync(metadataPath, "utf8")) as {
      vivliostyle?: { theme?: { style?: string; main?: string } };
    };
    expect(metadata.vivliostyle?.theme?.style).toBe("./theme.css");
    expect(metadata.vivliostyle?.theme?.main).toBe("./theme.css");
    expect(resolve(themeRoot, metadata.vivliostyle?.theme?.style ?? "")).toBe(entryPath);

    const entry = readThemeFile("theme.css");
    const a4 = readThemeFile("theme-a4.css");
    expect(resolveRelativeImports(entry, entryPath)).toEqual([]);
    expect(resolveRelativeImports(a4, a4Path)).toEqual([entryPath]);
    expect(entry).toContain("@page");
    expect(entry).toContain("size: A5 portrait");
    expect(a4).toContain("size: A4 portrait");
  });

  it("uses gift-like A5 page furniture and Japanese typography", () => {
    const css = readThemeFile("theme.css");

    expect(css).toContain("margin: 14mm");
    expect(css).toContain("@bottom-center");
    expect(css).toContain("@right-middle");
    expect(css).not.toContain("bleed:");
    expect(css).not.toContain("@top-");
    expect(css).not.toContain("@bottom-left");
    expect(css).not.toContain("@bottom-right");
    expect(css).toContain("counter(page)");
    expect(css).toContain("writing-mode: vertical-rl");
    expect(css).toContain("text-orientation: sideways");
    expect(css).toContain("--font-body: \"Noto Sans JP\"");
    expect(css).toContain("--font-display: \"Noto Serif JP\"");
    expect(css).toContain("--font-size-body: 16Q");
    expect(css).toContain("--line-height-body: 28Q");
    expect(css).toContain("text-align: justify");
    expect(css).toContain("text-spacing-trim: trim-start");
    expect(css).toContain("hanging-punctuation: allow-end");
    expect(css).toContain("string-set: document-title content(text)");
    expect(css).toContain("string-set: section-title content(text)");
    expect(css).toContain("string-set: document-id attr(data-document-id)");
    expect(css).toContain("line-break: strict");
    expect(css).toContain("overflow-wrap: anywhere");
    expect(css).toContain("orphans: 2");
    expect(css).toContain("widows: 2");
    expect(css).toContain("font-family: var(--font-body)");
    expect(css).toContain("font-family: var(--font-ui)");
    expect(css).toContain("font-family: var(--font-mono)");
    expect(css).not.toMatch(/https?:\/\//iu);
    expect(css).not.toMatch(/@font-face/iu);
  });

  it("builds a CSS-only black chapter band and dotted black section headings", () => {
    const css = readThemeFile("theme.css");

    expect(css).toContain(".document-header::before");
    expect(css).toContain(".document-header::after");
    expect(css).toContain("inline-size: 120mm");
    expect(css).toContain("min-block-size: 25mm");
    expect(css).toContain("break-before: page");
    expect(css).toContain("font-size: 32Q");
    expect(css).toContain("border-block-end: 3px dotted #000");
    expect(css).toContain('content: "▼ "');
    expect(css).toContain('content: "● "');
    expect(css).not.toContain("background-image");
  });

  it("covers the semantic document, section, narrative, field, and media contract", () => {
    const css = readThemeFile("theme.css");
    const selectors = [
      "html[data-html-contract=\"dx3rd-scenario/v1\"]",
      "main.document",
      ".document-header",
      ".document-kicker",
      ".document-title",
      ".document-body",
      ".document-section",
      ".document-section[data-section-level=\"3\"]",
      ".document-section__title",
      ".document-toc",
      ".document-toc__link",
      ".document-figure",
      ".scenario-block",
      ".scenario-block__header",
      ".scenario-block__title",
      ".scenario-block__body",
      ".field-list",
      ".field-list__item[data-field-key=\"required\"]",
      ".structured-data-reference[data-link-kind=\"structured-data\"]",
      ".structured-data",
      ".structured-data__header",
      ".structured-data__title",
      ".structured-data__body",
      ".structured-data__section",
      ".structured-data__section-title",
      ".data-fields",
      ".data-fields__item",
      ".data-list",
      ".data-list__item",
      ".data-list__item-title",
      ".data-reference-list[data-region=\"effect-references\"]",
      ".data-reference-list[data-region=\"item-references\"]",
      ".combo-data",
      ".combo-data__title",
      "table",
      "blockquote",
      "pre",
      "code",
      ".document-figure img",
    ];
    for (const selector of selectors) expectSelector(css, selector);
  });

  it("covers all narrative kinds with monochrome panels and preserves check state", () => {
    const css = readThemeFile("theme.css");
    const kinds = ["dialogue", "roleplay", "choice", "check", "info", "e-lois", "battle"];
    for (const kind of kinds) {
      expectSelector(css, `.scenario-block--${kind}`);
      expectSelector(css, `.scenario-block[data-block-kind=\"${kind}\"]`);
    }
    expect(css).toContain("data-check-mandatory=\"true\"");
    expect(css).toContain("data-check-mandatory=\"false\"");
    expect(css).toContain("background: #eee");
    expect(css).toContain("background: #fff");
    expect(css).toContain("border: 2px solid #999");
    expect(css).toContain("border-style: double");
    expect(css).toContain("border-block-style: dashed");
    expect(css).toContain("border-block-end: 2px dotted #999");
  });

  it("uses grayscale colors and gift-like data-key chips without losing repeated fields", () => {
    const css = readThemeFile("theme.css");
    const colors = css.match(/#[\da-f]{3,8}\b/giu) ?? [];

    expect(colors.length).toBeGreaterThan(0);
    for (const color of colors) expect(isMonochromeHexColor(color), `${color} is not grayscale`).toBe(true);
    expect(css).toContain("flex: 0 0 30mm");
    expect(css).toContain("min-inline-size: 30mm");
    expect(css).toContain("border-radius: 4Q");
    expect(css).toContain("--color-panel-strong: #757575");
    expect(css).toContain("background: var(--color-panel-strong)");
    expect(css).toContain("color: #fff");
    expect(css).toContain(".field-list__item > dd");
    expect(css).toContain(".data-fields__item > dd");
  });

  it("names every structured-data section and protects lists, rows, and panels at page breaks", () => {
    const css = readThemeFile("theme.css");
    for (const section of ["basic", "abilities", "effects", "items", "lois", "d-lois", "e-lois", "combos"]) {
      expectSelector(css, `.structured-data__section[data-data-section=\"${section}\"]`);
    }
    expect(css).toContain("break-inside: avoid-page");
    expect(css).toContain("page-break-inside: avoid");
    expect(css).toContain("display: table-header-group");
    expect(css).toContain("break-inside: avoid;");
    expect(css).toContain("word-break: break-word");
    expect(css).toContain("a[data-link-kind=\"internal\"]::after");
    expect(css).toContain('content: " (p." target-counter(attr(href), page) ")"');
    expect(css).toContain("table a[data-link-kind=\"internal\"]::after");
  });

  it("renders fixture HTML containing the selectors the Theme is responsible for", () => {
    const source = readProjectFile("tests/fixtures/valid/11-kitchen-sink.md");
    const parsed = parseScenarioMarkdown(source, "tests/fixtures/valid/11-kitchen-sink.md");
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const rendered = renderScenarioHtmlFragment(parsed.document);
    expect(rendered.ok).toBe(true);
    if (!rendered.ok) return;

    for (const kind of ["dialogue", "roleplay", "choice", "check", "info", "e-lois", "battle"]) {
      expect(rendered.html).toContain(`scenario-block--${kind}`);
      expect(rendered.html).toContain(`data-block-kind=\"${kind}\"`);
    }
    for (const selector of [
      'class="field-list"',
      "<blockquote>",
      "<pre>",
      '<code class="language-text">',
    ]) {
      expect(rendered.html).toContain(selector);
    }
  });
});
