import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  parseEnemyDataYaml,
  parseScenarioMarkdown,
  renderScenarioHtmlDocument,
  renderScenarioHtmlFragment,
  resolveEnemyDataReferences,
} from "../../src/index.js";

const projectRoot = process.cwd();

function readProjectFile(path: string): string {
  return readFileSync(join(projectRoot, path), "utf8");
}

function parseValid(source: string, filePath = "tests/fixtures/valid/html.md") {
  const result = parseScenarioMarkdown(source, filePath);
  expect(result.ok, result.ok ? "" : result.diagnostics.map((diagnostic) => diagnostic.message).join("; ")).toBe(true);
  if (!result.ok) throw new Error("expected valid Markdown");
  return result.document;
}

describe("semantic HTML renderer", () => {
  it("renders the kitchen-sink AST in source order without markers or duplicated fields", () => {
    const document = parseValid(readProjectFile("tests/fixtures/valid/11-kitchen-sink.md"));
    const result = renderScenarioHtmlFragment(document);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const html = result.html;
    expect(html.match(/data-block-kind="[^"]+"/g)).toEqual([
      'data-block-kind="dialogue"',
      'data-block-kind="roleplay"',
      'data-block-kind="choice"',
      'data-block-kind="check"',
      'data-block-kind="info"',
      'data-block-kind="e-lois"',
      'data-block-kind="battle"',
    ]);
    expect(html).toContain('data-check-mandatory="true"');
    expect(html).toContain('<pre>');
    expect(html).toContain('<code class="language-text">');
    expect(html).toContain("標準的なコードフェンスの内容");
    expect(html).not.toContain("~~~text");
    expect(html).toContain('| 項目 | 値 |');
    expect(html).toContain('<blockquote>');
    expect(html).toContain('data-field-key="target"');
    expect(html).toContain('data-field-key="enemy"');
    expect(html).toContain('data-field-key="reference"');
    expect(html).toContain('href="#section-v-11-01"');
    expect(html).not.toContain(":::");
    expect(html).not.toContain("{.scene-title}");
    expect(html).not.toContain("style=");
    expect(html).not.toContain("A5");
    expect(html).not.toContain("A4");
    expect(html).not.toContain(" mm");

    const targetFields = [...html.matchAll(/data-field-key="target"/g)].length;
    expect(targetFields).toBe(1);
    const infoFields = html.slice(html.indexOf("scenario-block--info"), html.indexOf("scenario-block--e-lois"));
    expect(infoFields.match(/data-field-key="skill"/g)?.length).toBe(1);
    expect(infoFields.match(/data-field-key="difficulty"/g)?.length).toBe(1);

    const choiceBlock = html.slice(html.indexOf("scenario-block--choice"), html.indexOf("scenario-block--check"));
    expect(choiceBlock).toContain("<p>");
    expect(choiceBlock).not.toContain("<ul>");
  });

  it("keeps repeated info skill/difficulty fields and required display entries in input order", () => {
    const document = parseValid(readProjectFile("tests/fixtures/valid/07-info.md"));
    const result = renderScenarioHtmlFragment(document);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const info = result.html.slice(result.html.indexOf("scenario-block--info"));
    expect(info.match(/data-field-key="skill"/g)?.length).toBe(2);
    expect(info.match(/data-field-key="difficulty"/g)?.length).toBe(2);
    expect(info.match(/data-field-key="required"/g)?.length).toBe(1);
    expect(info.indexOf("〈情報: 噂話〉")).toBeLessThan(info.indexOf("〈情報: UGN〉"));
    expect(info.indexOf("5")).toBeLessThan(info.indexOf("8"));
    expect(info).not.toContain("data-check-mandatory");
  });

  it("renders document metadata, nested sections, deterministic collision-safe IDs, and escaping", () => {
    const document = parseValid([
      "---",
      "id: HTML-ESCAPE",
      "kicker: Kicker & \"quote\"",
      "lang: ja-JP",
      "---",
      "",
      "# Title &amp; &lt;tag&gt; \"quote\"",
      "",
      "## Same &lt;tag&gt;",
      "",
      "Text &amp; &lt;tag&gt; \"quote\" 'single' [link](https://example.com/?q=a&b).",
      "",
      "## Same &lt;tag&gt;",
      "",
      "![画像 &lt; \"alt\"](./image.png \"caption &lt;x&gt;\")",
    ].join("\n"));
    const result = renderScenarioHtmlDocument(document);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.html).toContain("<!doctype html>");
    expect(result.html).toContain('<html lang="ja-JP" data-html-contract="dx3rd-scenario/v1">');
    expect(result.html).toContain('<meta charset="utf-8">');
    expect(result.html).toContain("<title>Title &amp; &lt;tag&gt; &quot;quote&quot;</title>");
    expect(result.html).toContain("Kicker &amp; &quot;quote&quot;");
    expect(result.html).toContain("Text &amp; &lt;tag&gt; &quot;quote&quot; &#39;single&#39;");
    expect(result.html).toContain("href=\"https://example.com/?q=a&amp;b\"");
    expect(result.html).toContain('class="document-figure"');
    expect(result.html).not.toContain('width=');
    expect(result.html).not.toContain('height=');
    expect(result.html).not.toContain('style=');
    expect(result.html.match(/data-section-id="[^"]+"/g)).toEqual([
      'data-section-id="section-html-escape-01"',
      'data-section-id="section-html-escape-02"',
    ]);
    expect(result.html.match(/aria-labelledby="([^"]+)"/g)?.every((value) => {
      const id = value.slice('aria-labelledby="'.length, -1);
      return result.html.includes(`id="${id}"`);
    })).toBe(true);
  });

  it("resolves standard Markdown reference links and images from the AST definitions", () => {
    const document = parseValid([
      "---",
      "id: REFERENCES",
      "---",
      "",
      "# References",
      "",
      "[参照][guide]",
      "",
      "![図][image]",
      "",
      "[guide]: https://example.com/guide",
      "[image]: ./diagram.png \"図の説明\"",
    ].join("\n"));
    const result = renderScenarioHtmlFragment(document);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.html).toContain('<a data-link-kind="external" href="https://example.com/guide">参照</a>');
    expect(result.html).toContain('<figure class="document-figure" data-region="figure">');
    expect(result.html).toContain('src="./diagram.png"');
    expect(result.html).toContain("<figcaption>");
    expect(result.html).not.toContain("[guide]:");
  });

  it("keeps resolved enemy and combo links and expands the validated data in YAML order", () => {
    const filePath = "manuscripts/sample/04-climax.md";
    const document = parseValid(readProjectFile(filePath), filePath);
    const yamlPath = "data/enemies/gray-experiment.yaml";
    const resolved = resolveEnemyDataReferences(document, {
      [yamlPath]: readProjectFile(yamlPath),
    });
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;

    const result = renderScenarioHtmlFragment(document, { references: resolved.references });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const html = result.html;
    expect(html).toContain('data-link-kind="structured-data"');
    expect(html).toContain('data-data-kind="enemy"');
    expect(html).toContain('data-data-kind="combo"');
    expect(html).toContain('data-enemy-id="gray-experiment"');
    expect(html).toContain('data-combo-id="afterglow-chain"');
    expect(html).toContain('id="enemy-gray-experiment"');
    expect(html).toContain('id="combo-gray-experiment-afterglow-chain"');
    expect(html).toContain('data-entry-id="body"');
    expect(html).toContain('data-entry-id="sense"');
    expect(html.indexOf('data-entry-id="body"')).toBeLessThan(html.indexOf('data-entry-id="sense"'));
    expect(html.indexOf('data-entry-id="afterglow-bind"')).toBeLessThan(html.indexOf('data-entry-id="signal-distortion"'));
    expect(html.indexOf('data-effect-id="afterglow-bind"')).toBeLessThan(html.indexOf('data-effect-id="concentrate-solaris"'));
    expect(html).not.toContain(':::enemy');
    expect(html).not.toContain(':::combo');
  });

  it("rejects dangerous URLs, raw HTML nodes, unknown AST nodes, and unverified ParseFailure input", () => {
    const dangerous = parseValid([
      "---",
      "id: DANGER",
      "---",
      "",
      "# Danger",
      "",
      "[run](javascript:alert(1))",
    ].join("\n"));
    const dangerousResult = renderScenarioHtmlFragment(dangerous);
    expect(dangerousResult.ok).toBe(false);
    if (!dangerousResult.ok) expect(dangerousResult.diagnostics[0]?.code).toBe("HTML_UNSAFE_URL");

    const valid = parseValid(readProjectFile("tests/fixtures/valid/00-chapter-minimal.md"));
    valid.ast.children.push({ type: "html", value: "<script>alert(1)</script>" });
    const rawResult = renderScenarioHtmlFragment(valid);
    expect(rawResult.ok).toBe(false);
    if (!rawResult.ok) expect(rawResult.diagnostics[0]?.code).toBe("HTML_RAW_HTML");

    const unknown = parseValid(readProjectFile("tests/fixtures/valid/00-chapter-minimal.md"));
    unknown.ast.children.push({ type: "mystery-node" });
    const unknownResult = renderScenarioHtmlFragment(unknown);
    expect(unknownResult.ok).toBe(false);
    if (!unknownResult.ok) expect(unknownResult.diagnostics[0]?.code).toBe("HTML_UNKNOWN_NODE");

    const parseFailure = parseScenarioMarkdown(readFileSync(join(projectRoot, "tests/fixtures/invalid/15-raw-html.md"), "utf8"));
    const failureResult = renderScenarioHtmlFragment(parseFailure as never);
    expect(failureResult.ok).toBe(false);
    if (!failureResult.ok) expect(failureResult.diagnostics[0]?.code).toBe("HTML_INPUT_NOT_VERIFIED");
  });

  it("does not expand the same resolved reference twice by default", () => {
    const source = [
      "---",
      "id: DUPLICATE",
      "---",
      "",
      "# Duplicate",
      "",
      "[敵データ：灰庭の番人](../data/enemies/sample-warden.yaml)",
      "",
      "[敵データ：灰庭の番人](../data/enemies/sample-warden.yaml)",
    ].join("\n");
    const document = parseValid(source, "tests/fixtures/valid/10-enemy-links.md");
    const resolved = resolveEnemyDataReferences(document, {
      "tests/fixtures/data/enemies/sample-warden.yaml": readProjectFile("tests/fixtures/data/enemies/sample-warden.yaml"),
    });
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    const result = renderScenarioHtmlFragment(document, { references: resolved.references });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.html.match(/class="structured-data structured-data--enemy"/g)?.length).toBe(1);
  });
});
