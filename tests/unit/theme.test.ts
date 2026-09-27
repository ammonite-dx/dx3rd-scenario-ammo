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

  it("ports gift A5 page furniture and Japanese typography", () => {
    const css = readThemeFile("theme.css");

    expect(css).toContain("margin: 14mm");
    expect(css).toContain("@bottom-center");
    expect(css).toContain("@right-middle");
    expect(css).not.toContain("bleed:");
    expect(css).not.toContain("@top-");
    expect(css).not.toContain("@bottom-left");
    expect(css).not.toContain("@bottom-right");
    expect(css).toContain("counter(page)");
    expect(css).toContain('content: string(document-id) ": " string(document-title)');
    expect(css).toContain("writing-mode: vertical-rl");
    expect(css).toContain("text-orientation: sideways");
    expect(css).toContain("--font-body: \"Noto Sans JP\"");
    expect(css).toContain("--font-display: \"Noto Serif JP\"");
    expect(css).toContain("--font-size-body: 16Q");
    expect(css).toContain("--line-height-body: 28Q");
    expect(css).toContain("text-align: justify");
    expect(css).toContain("text-spacing-trim: normal");
    expect(css).toContain("text-autospace: no-autospace");
    expect(css).toContain("hanging-punctuation: allow-end");
    expect(css).toContain("string-set: document-title content(text)");
    expect(css).toContain("string-set: section-title content(text)");
    expect(css).toContain("string-set: document-id attr(data-document-id)");
    expect(css).not.toContain("line-break: strict");
    expect(css).toContain("box-sizing: border-box");
    expect(css).toContain("box-sizing: content-box");
    expect(css).toContain(".scenario-block__kind-label,\n.combo-data__kind-label {\n  box-sizing: content-box;");
    expect(css).not.toContain("*::before");
    expect(css).not.toContain("*::after");
    expect(css).not.toContain("page-break-inside");
    expect(css).toContain(".data-fields__item > dd");
    expect(css).toContain("orphans: 1");
    expect(css).toContain("widows: 1");
    expect(css).not.toMatch(/^\s*text-spacing\s*:/mu);
    expect(css).toContain("font-family: var(--font-body)");
    expect(css).toContain("font-family: var(--font-ui)");
    expect(css).toContain("font-family: var(--font-mono)");
    expect(css).not.toMatch(/https?:\/\//iu);
    expect(css).not.toMatch(/@font-face/iu);
  });

  it("keeps the chapter-band geometry and gift heading rules without network assets", () => {
    const css = readThemeFile("theme.css");

    expect(css).toContain(".document-header::before");
    expect(css).toContain(".document-header::after");
    expect(css).toContain("inline-size: 120mm");
    expect(css).toContain("block-size: 25mm");
    expect(css).toContain("break-before: page");
    expect(css).toContain("font-size: 32Q");
    expect(css).toContain("border-block-end: 3px dotted #000");
    expect(css).toContain('content: "▼ "');
    expect(css).toContain('content: "● "');
    expect(css).not.toContain("background-image");
    expect(css).not.toMatch(/https?:\/\//iu);
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
      ".scenario-block__kind-label",
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
      ".data-reference-list",
      ".combo-data",
      ".combo-data__kind-label",
      ".combo-data__title",
      "table",
      "blockquote",
      "pre",
      "code",
      ".document-figure img",
    ];
    for (const selector of selectors) expectSelector(css, selector);
  });

  it("covers all narrative kinds with gift panels and preserves check state without changing its frame", () => {
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
    expect(css).not.toMatch(/content:\s*"(?:セリフ:|ロールプレイ:|選択:|判定|情報収集|Eロイス|戦闘|コンボ)"/u);
    expect(css).toContain(".scenario-block--battle:has(.structured-data--enemy)");
    expect(css).toContain("min-block-size: 24Q");
    expect(css).toContain("margin-block-end: 8Q");
    expect(css).toContain("display: flex");
    expect(css).toContain("align-items: center");
    expect(css).toContain("break-inside: avoid-page");
    expect(css).toContain("border-style: solid");
    expect(css).not.toContain("border-style: double");
    expect(css).not.toContain("border-block-style: dashed");
    expect(css).toContain("border-block-end: 2px dotted #999");
  });

  it("ports gift data-key chips without losing repeated fields", () => {
    const css = readThemeFile("theme.css");
    const colors = css.match(/#[\da-f]{3,8}\b/giu) ?? [];

    expect(colors.length).toBeGreaterThan(0);
    for (const color of colors) expect(isMonochromeHexColor(color), `${color} is not grayscale`).toBe(true);
    expect(css).toContain("flex: 0 0 30mm");
    expect(css).toContain("min-inline-size: 30mm");
    expect(css).toContain("border-radius: 5px");
    expect(css).toContain("--color-label: #999");
    expect(css).toContain("background: #999");
    expect(css).toContain("color: #fff");
    expect(css).toContain(".field-list__item > dd");
    expect(css).toContain(".data-fields__item > dd");
  });

  it("keeps structured-data page safety local to indivisible rows and headings", () => {
    const css = readThemeFile("theme.css");
    expectSelector(css, ".structured-data__section");
    expect(css).toContain("break-inside: avoid-page");
    expect(css).not.toContain("page-break-inside: avoid");
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

  it("keeps the visual parity manuscript in current natural Markdown", () => {
    const source = readProjectFile("tests/fixtures/visual/gift-op1-parity.md");
    const config = JSON.parse(readProjectFile("tests/fixtures/visual/build.config.json")) as {
      chapters: string[];
      themes: { a5: string; a4: string };
      output: { pdf: { a5: string; a4: string } };
    };
    expect(config.chapters).toEqual(["tests/fixtures/visual/gift-op1-parity.md"]);
    expect(config.themes.a5).toBe("themes/scenario-a5/theme.css");
    expect(config.themes.a4).toBe("themes/scenario-a5/theme-a4.css");
    expect(config.output.pdf.a5).toBe("generated/pdf/gift-op1-parity-a5.pdf");
    expect(source).not.toContain(":::rp");
    expect(source).not.toContain(":::serif");
    expect(source).not.toContain("{.scene-title}");
    expect(source.match(/^---\s*$/gmu)).toHaveLength(2);

    const parsed = parseScenarioMarkdown(source, "tests/fixtures/visual/gift-op1-parity.md");
    expect(parsed.ok, parsed.ok ? "" : parsed.diagnostics.map((diagnostic) => diagnostic.message).join("; ")).toBe(true);
    if (!parsed.ok) return;

    const rendered = renderScenarioHtmlFragment(parsed.document);
    expect(rendered.ok).toBe(true);
    if (!rendered.ok) return;
    expect(rendered.html).toContain("オープニングフェイズ・シーン1");
    expect(rendered.html).toContain("Gift from God");
    expect(rendered.html).toContain("日時");
    expect(rendered.html).toContain("シーンプレイヤー");
    expect(rendered.html).toContain("解説");
    expect(rendered.html).toContain("描写1");
    expect(rendered.html).toContain("描写2");
    expect(rendered.html).toContain("結末");
    expect(rendered.html).toContain('data-block-kind="roleplay"');
    expect(rendered.html).toContain('data-block-kind="dialogue"');
  });
});
