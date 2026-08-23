import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

import { parseEnemyDataYaml, parseScenarioMarkdown } from "../../src/index.js";
import {
  GiftMigrationFailure,
  migrateGiftMarkdown,
  runGiftMigration,
} from "../../src/migration/index.js";

const projectRoot = process.cwd();

function readFixture(path: string): string {
  return readFileSync(join(projectRoot, path), "utf8");
}

describe("gift migration Markdown conversion", () => {
  it("maps section titles, legacy block aliases, and mandatory stars", () => {
    const result = migrateGiftMarkdown(readFixture("tests/fixtures/migration/legacy-complex.md"), {
      sourceFile: "tests/fixtures/migration/legacy-complex.md",
      outputFile: "manuscripts/legacy-complex.md",
    });
    expect(result.output).toContain("kicker: 導入");
    expect(result.output).toContain(":::dialogue 渚");
    expect(result.output).toContain(":::roleplay 導入ロールプレイ");
    expect(result.output).toContain("[難易度] 8\n[必須]");
    expect(result.output).not.toContain(":::section-title");
    const parsed = parseScenarioMarkdown(result.output, "manuscripts/legacy-complex.md");
    expect(parsed.ok).toBe(true);
    expect(result.diagnostics.some((diagnostic) => diagnostic.code === "MIGRATION_FRONTMATTER_KEY_DROPPED")).toBe(true);
  });

  it("preserves code-fence markers and reports unsupported ruby/combo semantics", () => {
    const result = migrateGiftMarkdown(readFixture("tests/fixtures/migration/legacy-ambiguous.md"), {
      sourceFile: "tests/fixtures/migration/legacy-ambiguous.md",
      outputFile: "manuscripts/legacy-ambiguous.md",
    });
    expect(result.output).toContain(":::serif コード内の記号");
    expect(result.output).toContain("七海（ななみ）");
    expect(result.output).toContain("#### コンボ: 所有者不明");
    expect(result.diagnostics.some((diagnostic) => diagnostic.code === "MIGRATION_RUBY_PRESERVED")).toBe(true);
    expect(result.diagnostics.some((diagnostic) => diagnostic.code === "MIGRATION_COMBO_OWNER_UNRESOLVED")).toBe(true);
    expect(parseScenarioMarkdown(result.output, "manuscripts/legacy-ambiguous.md").ok).toBe(true);
  });

  it("does not turn a broken legacy fence into a false success", () => {
    const result = migrateGiftMarkdown(readFixture("tests/fixtures/migration/legacy-broken.md"), {
      sourceFile: "tests/fixtures/migration/legacy-broken.md",
      outputFile: "manuscripts/legacy-broken.md",
    });
    expect(result.diagnostics.some((diagnostic) => diagnostic.code === "MIGRATION_BLOCK_UNCLOSED")).toBe(true);
    expect(parseScenarioMarkdown(result.output, "manuscripts/legacy-broken.md").ok).toBe(false);
  });
});

describe("gift migration project boundary and YAML conversion", () => {
  it("generates validator-approved enemy YAML and validates converted references", async () => {
    const parent = mkdtempSync(join(projectRoot, "tmp", "migration-fixture-"));
    const output = join(parent, "out");
    const enemyBefore = createHash("sha256").update(readFixture("tests/fixtures/legacy-gift/manuscripts/enemy.md")).digest("hex");
    try {
      const result = await runGiftMigration({
        rootDir: projectRoot,
        sourcePath: "tests/fixtures/legacy-gift",
        outputPath: relative(projectRoot, output),
      });
      expect(result.published).toBe(true);
      expect(result.report.summary.generatedYamlFiles).toBe(1);
      expect(result.report.summary.validatedYamlFiles).toBe(1);
      expect(result.report.summary.referenceFailureFiles).toBe(0);
      expect(result.report.files.every((file) => file.status !== "failed")).toBe(true);
      const yamlPath = join(output, "data", "enemies", "enemy.yaml");
      expect(parseEnemyDataYaml(readFileSync(yamlPath, "utf8"), "data/enemies/enemy.yaml").ok).toBe(true);
      expect(existsSync(join(output, "migration-report.json"))).toBe(true);
      const enemyAfter = createHash("sha256").update(readFixture("tests/fixtures/legacy-gift/manuscripts/enemy.md")).digest("hex");
      expect(enemyAfter).toBe(enemyBefore);
    } finally {
      rmSync(parent, { recursive: true, force: true });
    }
  });

  it("rejects traversal, protected outputs, and existing output collisions", async () => {
    await expect(runGiftMigration({
      rootDir: projectRoot,
      sourcePath: "../outside",
      outputPath: "tmp/migration-invalid-source",
    })).rejects.toBeInstanceOf(GiftMigrationFailure);
    await expect(runGiftMigration({
      rootDir: projectRoot,
      sourcePath: "gift",
      outputPath: "gift/migration-output",
    })).rejects.toMatchObject({ diagnostics: [expect.objectContaining({ code: "MIGRATION_PROTECTED_OUTPUT" })] });
    const parent = mkdtempSync(join(projectRoot, "tmp", "migration-collision-"));
    const output = join(parent, "out");
    try {
      await runGiftMigration({
        rootDir: projectRoot,
        sourcePath: "tests/fixtures/legacy-gift",
        outputPath: relative(projectRoot, output),
      });
      await expect(runGiftMigration({
        rootDir: projectRoot,
        sourcePath: "tests/fixtures/legacy-gift",
        outputPath: relative(projectRoot, output),
      })).rejects.toMatchObject({ diagnostics: [expect.objectContaining({ code: "MIGRATION_OUTPUT_EXISTS" })] });
    } finally {
      rmSync(parent, { recursive: true, force: true });
    }
  });
});
