export const PACKAGE_NAME = "dx3rd-scenario-ammo" as const;
export const CONTRACT_VERSION = "0.1.0" as const;

export const PARSER_STACK = {
  markdown: "remark-parse",
  ast: "unified",
  frontmatter: "remark-frontmatter",
  yaml: "yaml",
} as const;

export {
  KNOWN_FIELDS_BY_BLOCK,
  NARRATIVE_BLOCK_NAMES,
  isParseSuccess,
  parseScenarioMarkdown,
  validateScenarioMarkdown,
} from "./core/parser.js";

export {
  isEnemyDataParseSuccess,
  parseEnemyDataYaml,
  validateEnemyDataYaml,
} from "./data/enemy.js";

export {
  extractDataReferences,
  extractEnemyDataReferences,
  resolveDataReferences,
  resolveEnemyDataReferences,
} from "./data/references.js";

export type {
  BattleBlock,
  CheckBlock,
  CheckSpec,
  Diagnostic,
  DiagnosticCategory,
  DiagnosticSeverity,
  DialogueBlock,
  ELoisBlock,
  InfoBlock,
  KnownFieldLabel,
  MarkdownNode,
  MarkdownRoot,
  NarrativeBlock,
  NarrativeBlockBase,
  NarrativeBlockName,
  ParseFailure,
  ParseResult,
  ParseSuccess,
  RoleplayBlock,
  ScenarioDocument,
  ScenarioField,
  ScenarioFrontmatter,
  SkillDifficultyPair,
  SourcePoint,
  SourcePosition,
} from "./core/types.js";

export {
  ENEMY_DATA_SCHEMA,
  ENEMY_DATA_VERSION,
} from "./data/types.js";

export type {
  AbilitiesData,
  ComboData,
  ComboEffectData,
  DataDiagnostic,
  DataReferenceExtractionResult,
  DataReferenceKind,
  DataReferenceResolutionFailure,
  DataReferenceResolutionResult,
  DataReferenceResolutionSuccess,
  DLoisData,
  ELoisData,
  EffectData,
  EncroachmentData,
  EnemyData,
  EnemyDataDocument,
  EnemyDataParseFailure,
  EnemyDataParseResult,
  EnemyDataParseSuccess,
  EnemyDataReference,
  EnemyDataSource,
  EnemyDataSourceLoader,
  EnemyDataSourceLoaderObject,
  ItemData,
  LoisData,
  MarkdownReferenceInput,
  PrimaryAbilityData,
  ResolvedEnemyDataReference,
  SecondaryAbilityData,
  SkillData,
} from "./data/types.js";

export {
  HTML_CONTRACT,
  generateScenarioHtml,
  renderScenarioHtml,
  renderScenarioHtmlDocument,
  renderScenarioHtmlFragment,
  renderScenarioHtmlOrThrow,
} from "./html/renderer.js";

export {
  HtmlRenderError,
  isHtmlRenderSuccess,
} from "./html/types.js";

export type {
  HtmlDiagnostic,
  HtmlDiagnosticCategory,
  HtmlNodeContext,
  HtmlReferenceExpansion,
  HtmlRenderFailure,
  HtmlRenderInput,
  HtmlRenderMode,
  HtmlRenderOptions,
  HtmlRenderResult,
  HtmlRenderSuccess,
} from "./html/types.js";
