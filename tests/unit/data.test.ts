import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  extractEnemyDataReferences,
  parseEnemyDataYaml,
  parseScenarioMarkdown,
  resolveEnemyDataReferences,
} from "../../src/index.js";

const projectRoot = process.cwd();

function readProjectFile(path: string): string {
  return readFileSync(join(projectRoot, path), "utf8");
}

function sampleEnemyYaml(): string {
  return readProjectFile("tests/fixtures/data/enemies/sample-warden.yaml");
}

function validDocument(source: string, filePath = "tests/fixtures/valid/data-links.md") {
  const result = parseScenarioMarkdown(source, filePath);
  expect(result.ok, result.ok ? "" : result.diagnostics.map((diagnostic) => diagnostic.message).join("; ")).toBe(true);
  if (!result.ok) throw new Error("expected valid Markdown");
  return result.document;
}

function linkDocument(href: string, label = "敵データ：灰庭の番人") {
  return [
    "---",
    "id: DATA-01",
    "lang: ja",
    "---",
    "",
    "# データ参照",
    "",
    `[${label}](${href})`,
  ].join("\n");
}

describe("external enemy YAML contract", () => {
  it("parses gray-experiment into a typed IR and preserves every array order", () => {
    const result = parseEnemyDataYaml(readProjectFile("data/enemies/gray-experiment.yaml"), "data/enemies/gray-experiment.yaml");
    expect(result.ok, result.ok ? "" : result.diagnostics.map((diagnostic) => diagnostic.message).join("; ")).toBe(true);
    if (!result.ok) return;

    expect(result.value.schema).toBe("dx3rd-scenario/enemy");
    expect(result.value.version).toBe(1);
    const enemy = result.value.enemy;
    expect(enemy.id).toBe("gray-experiment");
    expect(enemy.name).toBe("灰灯の実験体");
    expect(enemy.aliases).toEqual(["灰灯"]);
    expect(enemy.syndromes).toEqual(["ソラリス", "ノイマン"]);
    expect(enemy.encroachment).toEqual({
      rate: 118,
      level_bonus: 1,
      dice_bonus: 2,
      notes: "灰灯の共鳴で一時的に侵蝕が増幅している。",
    });
    expect(enemy.impulse).toBe("妄想");
    expect(enemy.abilities.primary.map((entry) => entry.id)).toEqual(["body", "sense", "mind", "social"]);
    expect(enemy.abilities.secondary.map((entry) => entry.id)).toEqual(["hp-max", "action"]);
    expect(enemy.abilities.skills.map((entry) => entry.id)).toEqual(["rc", "dodge", "knowledge-resonance"]);
    expect(enemy.effects.map((entry) => entry.id)).toEqual([
      "afterglow-bind",
      "signal-distortion",
      "concentrate-solaris",
      "tactical-reading",
    ]);
    expect(enemy.items.map((entry) => entry.id)).toEqual(["gray-lantern", "resonance-wire"]);
    expect(enemy.lois.map((entry) => entry.id)).toEqual(["lost-sibling"]);
    expect(enemy.d_lois).toEqual([]);
    expect(enemy.e_lois.map((entry) => entry.id)).toEqual(["silent-gift"]);
    expect(enemy.combos.map((entry) => entry.id)).toEqual(["afterglow-chain", "silent-overwrite"]);
    expect(enemy.combos[0]?.effects.map((entry) => entry.effect_id)).toEqual([
      "afterglow-bind",
      "concentrate-solaris",
      "tactical-reading",
    ]);
    expect(enemy.combos[1]?.item_ids).toEqual(["gray-lantern"]);
  });

  it("accepts the documented fixture YAML with optional defaults", () => {
    const result = parseEnemyDataYaml(sampleEnemyYaml(), "tests/fixtures/data/enemies/sample-warden.yaml");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.enemy.aliases).toEqual(["番人"]);
      expect(result.value.enemy.lois).toEqual([]);
      expect(result.value.enemy.combos[0]?.item_ids).toEqual(["iron-gauntlet"]);
      expect(result.value.enemy.combos[0]?.description).toBe("鉄甲を使った白兵攻撃。");
    }
  });

  it("reports syntax, shape, unknown-key, missing-key, type, and unsafe YAML errors", () => {
    expect(parseEnemyDataYaml("schema: [", "bad.yaml").ok).toBe(false);
    expect(parseEnemyDataYaml("- value", "list.yaml").diagnostics.some((diagnostic) => diagnostic.code === "DATA_TOP_LEVEL_MAPPING_REQUIRED")).toBe(true);

    const sample = sampleEnemyYaml();
    expect(parseEnemyDataYaml(sample.replace("enemy:\n", "enemy:\n  unexpected: true\n"), "unknown.yaml").diagnostics.some((diagnostic) => diagnostic.code === "DATA_UNKNOWN_KEY")).toBe(true);
    expect(parseEnemyDataYaml(sample.replace('  name: "灰庭の番人"\n', ""), "missing.yaml").diagnostics.some((diagnostic) => diagnostic.code === "DATA_REQUIRED_KEY")).toBe(true);
    expect(parseEnemyDataYaml(sample.replace("version: 1", 'version: "1"'), "type.yaml").diagnostics.some((diagnostic) => diagnostic.code === "DATA_INTEGER_REQUIRED")).toBe(true);
    expect(parseEnemyDataYaml(sample.replace('      - id: "dodge"', '      - id: "melee"'), "duplicate-id.yaml").diagnostics.some((diagnostic) => diagnostic.code === "DATA_DUPLICATE_ID")).toBe(true);
    expect(parseEnemyDataYaml(sample.replace('  id: "sample-warden"', '  id: &enemy-id "sample-warden"'), "anchor.yaml").diagnostics.some((diagnostic) => diagnostic.code === "DATA_UNSAFE_ANCHOR")).toBe(true);
    expect(parseEnemyDataYaml(sample.replace('  id: "sample-warden"', "  id: *enemy-id"), "alias.yaml").diagnostics.some((diagnostic) => diagnostic.code === "DATA_UNSAFE_ALIAS")).toBe(true);
    expect(parseEnemyDataYaml(sample.replace('  id: "sample-warden"', '  id: !!str "sample-warden"'), "tag.yaml").diagnostics.some((diagnostic) => diagnostic.code === "DATA_UNSAFE_TAG")).toBe(true);
    expect(parseEnemyDataYaml(sample.replace("enemy:\n", 'enemy:\n  <<: {}\n'), "merge.yaml").diagnostics.some((diagnostic) => diagnostic.code === "DATA_UNSAFE_MERGE")).toBe(true);
  });

  it("rejects duplicate YAML mapping keys and duplicate combo IDs", () => {
    const sample = sampleEnemyYaml();
    const duplicateKey = sample.replace('  id: "sample-warden"\n  name:', '  id: "sample-warden"\n  id: "other"\n  name:');
    expect(parseEnemyDataYaml(duplicateKey, "duplicate-key.yaml").diagnostics.some((diagnostic) => diagnostic.code === "YAML_DUPLICATE_KEY")).toBe(true);

    const combo = '    - id: "iron-claw"\n      name: "鉄爪の一撃"\n';
    const duplicateCombo = sample.replace(combo, `${combo}${combo}`);
    expect(parseEnemyDataYaml(duplicateCombo, "duplicate-combo.yaml").diagnostics.some((diagnostic) => diagnostic.code === "DATA_DUPLICATE_ID")).toBe(true);
  });

  it("rejects multiple YAML documents with a positioned parser diagnostic", () => {
    const multipleDocuments = `${sampleEnemyYaml()}\n---\nschema: "dx3rd-scenario/enemy"\nversion: 1\nenemy: {}`;
    const result = parseEnemyDataYaml(multipleDocuments, "multiple-documents.yaml");
    expect(result.ok).toBe(false);
    const diagnostic = result.diagnostics.find((candidate) => candidate.code === "YAML_MULTIPLE_DOCS");
    expect(diagnostic).toBeDefined();
    expect(diagnostic?.file).toBe("multiple-documents.yaml");
    expect(diagnostic?.line).toBeGreaterThan(0);
    expect(diagnostic?.column).toBeGreaterThan(0);
  });

  it("reports fixed primary IDs, skill ability references, and combo effect/item references", () => {
    const sample = sampleEnemyYaml();

    const missingPrimary = parseEnemyDataYaml(
      sample.replace('      - id: "sense"\n        name: "感覚"\n        value: 2\n', ""),
      "primary-missing.yaml",
    );
    expect(missingPrimary.diagnostics.some((diagnostic) => diagnostic.code === "DATA_PRIMARY_ID_REQUIRED")).toBe(true);

    const duplicatePrimary = parseEnemyDataYaml(
      sample.replace('      - id: "sense"', '      - id: "body"'),
      "primary-duplicate.yaml",
    );
    expect(duplicatePrimary.diagnostics.some((diagnostic) => diagnostic.code === "DATA_DUPLICATE_ID")).toBe(true);

    const missingAbility = parseEnemyDataYaml(
      sample.replace('        ability_id: "body"', '        ability_id: "missing-ability"'),
      "ability-reference-missing.yaml",
    );
    const abilityDiagnostic = missingAbility.diagnostics.find((diagnostic) => diagnostic.code === "DATA_ABILITY_REFERENCE_MISSING");
    expect(abilityDiagnostic?.path).toBe("/enemy/abilities/skills/0/ability_id");

    const missingEffect = parseEnemyDataYaml(
      sample.replace('        - effect_id: "beast-claw"', '        - effect_id: "missing-effect"'),
      "effect-reference-missing.yaml",
    );
    const effectDiagnostic = missingEffect.diagnostics.find((diagnostic) => diagnostic.code === "DATA_EFFECT_REFERENCE_MISSING");
    expect(effectDiagnostic?.path).toBe("/enemy/combos/0/effects/0/effect_id");

    const duplicateEffect = parseEnemyDataYaml(
      sample.replace('        - effect_id: "concentrate-beast"', '        - effect_id: "beast-claw"'),
      "effect-reference-duplicate.yaml",
    );
    expect(duplicateEffect.diagnostics.some((diagnostic) => diagnostic.code === "DATA_DUPLICATE_ID")).toBe(true);

    const missingItem = parseEnemyDataYaml(
      sample.replace('        - "iron-gauntlet"', '        - "missing-item"'),
      "item-reference-missing.yaml",
    );
    const itemDiagnostic = missingItem.diagnostics.find((diagnostic) => diagnostic.code === "DATA_ITEM_REFERENCE_MISSING");
    expect(itemDiagnostic?.path).toBe("/enemy/combos/0/item_ids/0");

    const duplicateItem = parseEnemyDataYaml(
      sample.replace('      item_ids:\n        - "iron-gauntlet"', '      item_ids:\n        - "iron-gauntlet"\n        - "iron-gauntlet"'),
      "item-reference-duplicate.yaml",
    );
    expect(duplicateItem.diagnostics.some((diagnostic) => diagnostic.code === "DATA_DUPLICATE_ID")).toBe(true);
  });

  it("rejects realistic source safety boundaries with diagnostic codes", () => {
    const sample = sampleEnemyYaml();
    const replacement = parseEnemyDataYaml(sample.replace("灰庭", "灰�庭"), "replacement-character.yaml");
    expect(replacement.diagnostics.some((diagnostic) => diagnostic.code === "DATA_INVALID_UNICODE")).toBe(true);

    const oversized = parseEnemyDataYaml("x".repeat(1_000_001), "oversized.yaml");
    expect(oversized.diagnostics.some((diagnostic) => diagnostic.code === "DATA_SOURCE_TOO_LARGE")).toBe(true);
  });

  it("keeps CRLF positions, Japanese strings, and the supplied YAML file path", () => {
    const source = sampleEnemyYaml().replace(/\n/g, "\r\n");
    const result = parseEnemyDataYaml(source.replace('  id: "sample-warden"', '  id: "Invalid"'), "fixtures\\敵.yaml");
    expect(result.ok).toBe(false);
    const diagnostic = result.diagnostics.find((candidate) => candidate.code === "DATA_ID_INVALID");
    expect(diagnostic?.file).toBe("fixtures\\敵.yaml");
    expect(diagnostic?.line).toBe(4);
    expect(diagnostic?.column).toBeGreaterThan(0);
  });
});

describe("Markdown enemy data references", () => {
  it("extracts and resolves fixture enemy and combo links from the Markdown AST", () => {
    const document = validDocument(readProjectFile("tests/fixtures/valid/10-enemy-links.md"), "tests/fixtures/valid/10-enemy-links.md");
    const extraction = extractEnemyDataReferences(document);
    expect(extraction.diagnostics).toEqual([]);
    expect(extraction.references.map((reference) => reference.kind)).toEqual(["enemy", "combo"]);
    expect(extraction.references[1]?.fragment).toBe("iron-claw");

    const result = resolveEnemyDataReferences(document, {
      "tests\\fixtures\\data\\enemies\\sample-warden.yaml": sampleEnemyYaml(),
    });
    expect(result.ok, result.ok ? "" : result.diagnostics.map((diagnostic) => diagnostic.message).join("; ")).toBe(true);
    if (result.ok) {
      expect(result.references.map((reference) => reference.enemy.id)).toEqual(["sample-warden", "sample-warden"]);
      expect(result.references[1]?.combo?.id).toBe("iron-claw");
    }
  });

  it("extracts and resolves the sample manuscript's gray enemy and combo references", () => {
    const filePath = "manuscripts/sample/04-climax.md";
    const parsed = parseScenarioMarkdown(readProjectFile(filePath), filePath);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const result = resolveEnemyDataReferences(parsed.document, {
      "data/enemies/gray-experiment.yaml": readProjectFile("data/enemies/gray-experiment.yaml"),
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.references.map((reference) => reference.reference.kind)).toEqual(["enemy", "combo"]);
      expect(result.references[1]?.combo?.id).toBe("afterglow-chain");
    }
  });

  it("ignores other ordinary links and diagnoses invalid data-link labels and fragments", () => {
    const source = [
      "---",
      "id: DATA-02",
      "---",
      "",
      "# 参照",
      "",
      "[通常リンク](https://example.com)",
      "[敵データ:ラベル](../data/enemies/sample-warden.yaml)",
      "[敵データ：敵](../data/enemies/sample-warden.yaml#iron-claw)",
      "[コンボデータ：コンボ](../data/enemies/sample-warden.yaml)",
    ].join("\n");
    const extraction = extractEnemyDataReferences(validDocument(source));
    expect(extraction.references).toEqual([]);
    expect(extraction.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      "DATA_REFERENCE_LABEL_INVALID",
      "DATA_REFERENCE_ENEMY_FRAGMENT_FORBIDDEN",
      "DATA_REFERENCE_COMBO_FRAGMENT_REQUIRED",
    ]);
  });

  it("reports missing files, ID mismatches, missing combos, and traversal", () => {
    const filePath = "tests/fixtures/valid/10-enemy-links.md";
    const document = validDocument(readProjectFile(filePath), filePath);
    const missing = resolveEnemyDataReferences(document, {});
    expect(missing.ok).toBe(false);
    expect(missing.diagnostics.some((diagnostic) => diagnostic.code === "DATA_REFERENCE_FILE_MISSING")).toBe(true);

    const mismatch = resolveEnemyDataReferences(document, {
      "tests/fixtures/data/enemies/sample-warden.yaml": sampleEnemyYaml().replace('  id: "sample-warden"', '  id: "other-enemy"'),
    });
    expect(mismatch.diagnostics.some((diagnostic) => diagnostic.code === "DATA_REFERENCE_ENEMY_ID_MISMATCH")).toBe(true);

    const comboDocument = validDocument(linkDocument("../data/enemies/sample-warden.yaml#not-a-combo", "コンボデータ：未知"), filePath);
    const missingCombo = resolveEnemyDataReferences(comboDocument, {
      "tests/fixtures/data/enemies/sample-warden.yaml": sampleEnemyYaml(),
    });
    expect(missingCombo.diagnostics.some((diagnostic) => diagnostic.code === "DATA_REFERENCE_COMBO_MISSING")).toBe(true);

    const traversalDocument = validDocument(linkDocument("../../../../data/enemies/sample-warden.yaml"), filePath);
    const traversal = extractEnemyDataReferences(traversalDocument);
    expect(traversal.diagnostics.some((diagnostic) => diagnostic.code === "DATA_REFERENCE_PATH_TRAVERSAL")).toBe(true);
  });

  it("validates lowercase yaml paths and keeps link positions under CRLF", () => {
    const source = linkDocument("../data/enemies/sample-warden.yml").replace(/\n/g, "\r\n");
    const document = validDocument(source, "chapters\\敵.md");
    const extraction = extractEnemyDataReferences(document);
    const diagnostic = extraction.diagnostics[0];
    expect(diagnostic?.code).toBe("DATA_REFERENCE_PATH_INVALID");
    expect(diagnostic?.file).toBe("chapters\\敵.md");
    expect(diagnostic?.line).toBe(8);
    expect(diagnostic?.column).toBe(1);
  });
});
