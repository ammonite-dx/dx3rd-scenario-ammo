import type {
  MarkdownNode,
  ScenarioDocument,
  SourcePosition,
} from "../core/types.js";
import type { ResolvedEnemyDataReference } from "../data/types.js";

export type HtmlRenderMode = "fragment" | "document";

export type HtmlDiagnosticCategory = "input" | "render" | "security";

export interface HtmlDiagnostic {
  category: HtmlDiagnosticCategory;
  code: string;
  message: string;
  file: string;
  line: number;
  column: number;
  position: SourcePosition;
  severity: "error";
}

export type HtmlReferenceExpansion = "first" | "each";

export interface HtmlRenderOptions {
  /** Output a semantic main fragment or a complete HTML document. */
  mode?: HtmlRenderMode;
  /** Resolved references returned by resolveEnemyDataReferences. */
  references?: readonly ResolvedEnemyDataReference[];
  /** Descriptive alias for references, retained for call-site readability. */
  resolvedReferences?: readonly ResolvedEnemyDataReference[];
  /** Descriptive alias for references, retained for call-site readability. */
  resolvedEnemyReferences?: readonly ResolvedEnemyDataReference[];
  /** Explicit long-form alias for references. */
  resolvedEnemyDataReferences?: readonly ResolvedEnemyDataReference[];
  /** Expand the first occurrence only, or every resolved occurrence. */
  referenceExpansion?: HtmlReferenceExpansion;
  /** Alias for referenceExpansion. */
  expandReferences?: HtmlReferenceExpansion;
  /** Include <!doctype html> for document mode. Defaults to true. */
  doctype?: boolean;
}

export interface HtmlRenderSuccess {
  ok: true;
  success: true;
  diagnostics: [];
  html: string;
  value: string;
  mode: HtmlRenderMode;
}

export interface HtmlRenderFailure {
  ok: false;
  success: false;
  diagnostics: HtmlDiagnostic[];
}

export type HtmlRenderResult = HtmlRenderSuccess | HtmlRenderFailure;

export interface HtmlRenderInput {
  document: ScenarioDocument;
  options?: HtmlRenderOptions;
}

/** A typed error for callers that prefer an exception-based rendering API. */
export class HtmlRenderError extends Error {
  readonly diagnostics: readonly HtmlDiagnostic[];

  constructor(diagnostics: readonly HtmlDiagnostic[]) {
    super(diagnostics.map((diagnostic) => diagnostic.message).join("; ") || "HTML rendering failed.");
    this.name = "HtmlRenderError";
    this.diagnostics = diagnostics;
  }
}

export function isHtmlRenderSuccess(result: HtmlRenderResult): result is HtmlRenderSuccess {
  return result.ok;
}

/**
 * This is intentionally exported as a small nominal helper for integrations
 * that need to associate a diagnostic with the source AST node they were
 * visiting. The renderer itself never emits this object into HTML.
 */
export interface HtmlNodeContext {
  node?: MarkdownNode;
}
