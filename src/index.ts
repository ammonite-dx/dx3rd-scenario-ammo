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
