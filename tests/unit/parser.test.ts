import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  parseScenarioMarkdown,
  validateScenarioMarkdown,
} from "../../src/index.js";

const fixturesRoot = join(process.cwd(), "tests", "fixtures");
const validRoot = join(fixturesRoot, "valid");
const invalidRoot = join(fixturesRoot, "invalid");

function readFixture(root: string, filename: string): string {
  return readFileSync(join(root, filename), "utf8");
}

describe("scenario Markdown parser", () => {
  it("accepts every valid fixture", () => {
    const filenames = readdirSync(validRoot).filter((filename) => filename.endsWith(".md"));
    expect(filenames.length).toBe(13);
    for (const filename of filenames) {
      const result = parseScenarioMarkdown(readFixture(validRoot, filename), `tests/fixtures/valid/${filename}`);
      expect(result.ok, `${filename}: ${result.diagnostics.map((diagnostic) => diagnostic.message).join("; ")}`).toBe(true);
      if (result.ok) {
        expect(result.document.frontmatter.id).toMatch(/^[A-Za-z][A-Za-z0-9_-]*$/);
        expect(result.document.chapterTitle.length).toBeGreaterThan(0);
      }
    }
  });

  it("rejects every invalid fixture with a positioned diagnostic", () => {
    const filenames = readdirSync(invalidRoot).filter((filename) => filename.endsWith(".md"));
    expect(filenames.length).toBe(21);
    for (const filename of filenames) {
      const filePath = `tests/fixtures/invalid/${filename}`;
      const result = parseScenarioMarkdown(readFixture(invalidRoot, filename), filePath);
      expect(result.ok, `${filename} unexpectedly parsed`).toBe(false);
      expect(result.diagnostics.length, filename).toBeGreaterThan(0);
      for (const diagnostic of result.diagnostics) {
        expect(diagnostic.category).toBeTruthy();
        expect(diagnostic.code).toBeTruthy();
        expect(diagnostic.message).toBeTruthy();
        expect(diagnostic.file).toBe(filePath);
        expect(diagnostic.line).toBeGreaterThan(0);
        expect(diagnostic.column).toBeGreaterThan(0);
        expect(diagnostic.position.start.line).toBe(diagnostic.line);
        expect(diagnostic.position.start.column).toBe(diagnostic.column);
      }
    }
  });

  it("maps the README's invalid-fixture locations to stable diagnostic codes", () => {
    const expected: Record<string, { code: string; line: number }> = {
      "01-unknown-block.md": { code: "UNKNOWN_BLOCK", line: 8 },
      "02-unclosed-block.md": { code: "UNCLOSED_BLOCK", line: 8 },
      "03-extra-terminator.md": { code: "EXTRA_TERMINATOR", line: 8 },
      "04-missing-title.md": { code: "BLOCK_TITLE_REQUIRED", line: 8 },
      "05-check-skill-missing.md": { code: "CHECK_SKILL_MISSING", line: 10 },
      "06-check-difficulty-missing.md": { code: "CHECK_DIFFICULTY_MISSING", line: 10 },
      "07-check-type-invalid.md": { code: "CHECK_DIFFICULTY_INVALID", line: 11 },
      "08-nested-block.md": { code: "NESTED_BLOCK", line: 10 },
      "09-invalid-frontmatter.md": { code: "FRONTMATTER_KICKER_TYPE", line: 3 },
      "10-frontmatter-id-missing.md": { code: "FRONTMATTER_ID_REQUIRED", line: 2 },
      "11-frontmatter-unknown-key.md": { code: "FRONTMATTER_UNKNOWN_KEY", line: 3 },
      "12-h1-missing.md": { code: "CHAPTER_H1_MISSING", line: 6 },
      "13-scene-title.md": { code: "CHAPTER_H1_ATTRIBUTE_LIST", line: 6 },
      "14-multiple-h1.md": { code: "CHAPTER_H1_MULTIPLE", line: 8 },
      "15-raw-html.md": { code: "RAW_HTML", line: 8 },
      "16-check-second-pair.md": { code: "CHECK_SECOND_PAIR", line: 13 },
      "17-field-after-body.md": { code: "CHECK_FIELD_AFTER_BODY", line: 15 },
      "18-unknown-field.md": { code: "UNKNOWN_FIELD", line: 10 },
      "19-attribute-list.md": { code: "BLOCK_ATTRIBUTE_LIST", line: 8 },
      "20-combo-block.md": { code: "RESERVED_COMBO_BLOCK", line: 8 },
      "21-enemy-block.md": { code: "RESERVED_ENEMY_BLOCK", line: 8 },
    };
    for (const [filename, expectation] of Object.entries(expected)) {
      const diagnostics = validateScenarioMarkdown(
        readFixture(invalidRoot, filename),
        `tests/fixtures/invalid/${filename}`,
      );
      const diagnostic = diagnostics.find((candidate) => candidate.code === expectation.code);
      expect(diagnostic, filename).toBeDefined();
      expect(diagnostic?.line, filename).toBe(expectation.line);
      expect(diagnostic?.column, filename).toBe(1);
    }
  });

  it("keeps the seven kitchen-sink blocks and their order", () => {
    const result = parseScenarioMarkdown(readFixture(validRoot, "11-kitchen-sink.md"));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document.blocks.map((block) => block.name)).toEqual([
      "dialogue",
      "roleplay",
      "choice",
      "check",
      "info",
      "e-lois",
      "battle",
    ]);
    expect(result.document.blocks.map((block) => block.displayTitle)).toEqual([
      "渚",
      "ふたりと渚",
      "信号への接近",
      "衝動判定",
      "観測ログの開示",
      "《記憶の残響》",
      "実験体との接触",
    ]);
  });

  it("supports both choice body forms and preserves ordinary Markdown AST nodes", () => {
    for (const filename of ["04-choice.md", "04-choice-no-list.md"]) {
      const result = parseScenarioMarkdown(readFixture(validRoot, filename));
      expect(result.ok).toBe(true);
      if (!result.ok) continue;
      expect(result.document.blocks[0]?.name).toBe("choice");
      expect(result.document.blocks[0]?.contentAst.children.length).toBeGreaterThan(0);
    }
    const result = parseScenarioMarkdown(readFixture(validRoot, "01-standard-markdown.md"));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.document.ast.children.some((node) => node.type === "heading")).toBe(true);
      expect(result.document.ast.children.some((node) => node.type === "code")).toBe(true);
    }
  });

  it("parses check fields and ordered info pairs", () => {
    const optional = parseScenarioMarkdown(readFixture(validRoot, "05-check-optional.md"));
    expect(optional.ok).toBe(true);
    if (optional.ok) {
      const block = optional.document.blocks[0];
      expect(block?.name).toBe("check");
      if (block?.name === "check") {
        expect(block.check?.skill).toContain("情報");
        expect(block.check?.difficulty).toBe(8);
        expect(block.check?.mandatory).toBe(false);
      }
    }

    const mandatory = parseScenarioMarkdown(readFixture(validRoot, "06-check-mandatory.md"));
    expect(mandatory.ok).toBe(true);
    if (mandatory.ok) {
      const block = mandatory.document.blocks[0];
      if (block?.name === "check") expect(block.check?.mandatory).toBe(true);
    }

    const info = parseScenarioMarkdown(readFixture(validRoot, "07-info.md"));
    expect(info.ok).toBe(true);
    if (info.ok) {
      const block = info.document.blocks[0];
      if (block?.name === "info") {
        expect(block.skillDifficultyPairs.map((pair) => pair.difficulty)).toEqual(["5", "8"]);
        expect(block.skillDifficultyPairs.map((pair) => pair.mandatory)).toEqual([true, false]);
      }
    }
  });

  it("does not interpret code fences or ordinary Markdown decoration as fields", () => {
    const source = [
      "---",
      "id: TEST",
      "lang: ja",
      "---",
      "",
      "# Test",
      "",
      ":::check 判定",
      "",
      "```text",
      "[技能] 〈偽の技能〉",
      "[難易度] 99",
      "```",
      "",
      "**[技能]** 〈意志〉",
      "> [難易度] 8",
      "",
      "本文。",
      ":::",
    ].join("\n");
    const result = parseScenarioMarkdown(source);
    expect(result.ok).toBe(false);
    expect(result.diagnostics.some((diagnostic) => diagnostic.code === "CHECK_SKILL_MISSING")).toBe(true);
    expect(result.diagnostics.some((diagnostic) => diagnostic.code === "UNKNOWN_FIELD")).toBe(false);
  });

  it("normalizes CRLF and keeps file paths in diagnostics", () => {
    const source = readFixture(validRoot, "00-chapter-minimal.md").replace(/\n/g, "\r\n");
    const result = parseScenarioMarkdown(source, "chapters/minimal.md");
    expect(result.ok).toBe(true);

    const invalid = readFixture(invalidRoot, "01-unknown-block.md").replace(/\n/g, "\r\n");
    const diagnostics = validateScenarioMarkdown(invalid, "chapters/unknown.md");
    expect(diagnostics.some((diagnostic) => diagnostic.code === "UNKNOWN_BLOCK")).toBe(true);
    expect(diagnostics.find((diagnostic) => diagnostic.code === "UNKNOWN_BLOCK")?.line).toBe(8);
    expect(diagnostics.find((diagnostic) => diagnostic.code === "UNKNOWN_BLOCK")?.column).toBe(1);
    expect(diagnostics.find((diagnostic) => diagnostic.code === "UNKNOWN_BLOCK")?.file).toBe("chapters/unknown.md");
  });

  it("validates frontmatter mapping, duplicate keys, and identifier metadata", () => {
    const valid = [
      "\uFEFF---",
      "id: CH-01_test",
      "kicker: 導入",
      "lang: ja-JP",
      "---",
      "",
      "# 章",
      "本文。",
    ].join("\n");
    expect(parseScenarioMarkdown(valid).ok).toBe(true);

    const duplicate = [
      "---",
      "id: CH-01",
      "id: CH-02",
      "---",
      "",
      "# 章",
      "本文。",
    ].join("\n");
    expect(validateScenarioMarkdown(duplicate).some((diagnostic) => diagnostic.code === "YAML_DUPLICATE_KEY")).toBe(true);

    const list = [
      "---",
      "- id: CH-01",
      "---",
      "",
      "# 章",
      "本文。",
    ].join("\n");
    expect(validateScenarioMarkdown(list).some((diagnostic) => diagnostic.code === "FRONTMATTER_NOT_MAPPING")).toBe(true);

    const metadata = [
      "---",
      "id: 123",
      "kicker: ''",
      "lang: ja_JP",
      "---",
      "",
      "# 章",
      "本文。",
    ].join("\n");
    const diagnostics = validateScenarioMarkdown(metadata);
    expect(diagnostics.some((diagnostic) => diagnostic.code === "FRONTMATTER_ID_REQUIRED")).toBe(true);
    expect(diagnostics.some((diagnostic) => diagnostic.code === "FRONTMATTER_KICKER_TYPE")).toBe(true);
    expect(diagnostics.some((diagnostic) => diagnostic.code === "FRONTMATTER_LANG_INVALID")).toBe(true);
  });
});
