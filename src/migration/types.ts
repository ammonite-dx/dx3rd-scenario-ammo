import type { DataDiagnostic } from "../data/types.js";
import type { Diagnostic } from "../core/types.js";

export type MigrationDiagnosticSeverity = "warning" | "unresolved" | "error";

export type MigrationDiagnosticCategory =
  | "inventory"
  | "frontmatter"
  | "markdown"
  | "data"
  | "reference"
  | "safety"
  | "validation";

export interface MigrationDiagnostic {
  category: MigrationDiagnosticCategory;
  code: string;
  message: string;
  file: string;
  line: number;
  column: number;
  severity: MigrationDiagnosticSeverity;
  sourceFile?: string;
  outputFile?: string;
}

export type MigrationFileStatus = "success" | "partial" | "failed";

export interface MigrationValidationSummary {
  ok: boolean;
  diagnostics: Array<Diagnostic | DataDiagnostic | MigrationDiagnostic>;
}

export interface MigrationFileReport {
  source: string;
  output?: string;
  status: MigrationFileStatus;
  sourceBytes: number;
  outputBytes?: number;
  generatedYaml?: string;
  parser: MigrationValidationSummary;
  references: MigrationValidationSummary;
  diagnostics: MigrationDiagnostic[];
}

export interface ReplacementRuleInventory {
  index: number;
  pattern: string;
  replacement: string;
  sourceMatchCount: number;
  sourceFileCount: number;
}

export interface GiftInventory {
  includedFiles: string[];
  excludedDirectories: string[];
  excludedGeneratedFiles: string[];
  markdownFiles: string[];
  legacyConfigurationFiles: string[];
  legacyThemeFiles: string[];
  replacementRules: ReplacementRuleInventory[];
}

export interface GiftMigrationSummary {
  sourceMarkdownFiles: number;
  convertedMarkdownFiles: number;
  parserValidatedMarkdownFiles: number;
  parserFailedMarkdownFiles: number;
  successfulMarkdownFiles: number;
  partialMarkdownFiles: number;
  failedMarkdownFiles: number;
  generatedYamlFiles: number;
  validatedYamlFiles: number;
  invalidYamlFiles: number;
  referenceValidatedFiles: number;
  referenceFailureFiles: number;
  warningCount: number;
  unresolvedDiagnosticCount: number;
  errorCount: number;
  copiedAssetFiles: number;
}

export interface GiftMigrationReport {
  reportVersion: 1;
  tool: "gift-migration";
  source: string;
  output?: string;
  dryRun: boolean;
  inventory: GiftInventory;
  summary: GiftMigrationSummary;
  files: MigrationFileReport[];
  diagnostics: MigrationDiagnostic[];
}

export interface GiftMigrationOptions {
  rootDir: string;
  sourcePath: string;
  outputPath?: string;
  dryRun?: boolean;
}

export interface GiftMigrationRunResult {
  report: GiftMigrationReport;
  outputPath?: string;
  published: boolean;
}

export interface GiftMarkdownMigrationOptions {
  sourceFile: string;
  outputFile: string;
  enemyPage?: {
    dataPath: string;
    displayName: string;
    yamlAvailable: boolean;
  };
  enemyPages?: ReadonlyMap<string, {
    dataPath: string;
    displayName: string;
    yamlAvailable: boolean;
  }>;
  markdownTargets?: ReadonlySet<string>;
}

export interface GiftMarkdownMigrationResult {
  source: string;
  output: string;
  diagnostics: MigrationDiagnostic[];
  outputLineToSourceLine: number[];
}
