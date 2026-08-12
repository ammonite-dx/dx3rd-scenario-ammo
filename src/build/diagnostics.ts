import type { AnyBuildDiagnostic, BuildDiagnostic } from "./types.js";

export function buildDiagnostic(
  file: string,
  code: string,
  message: string,
  category: BuildDiagnostic["category"] = "build",
  line = 1,
  column = 1,
): BuildDiagnostic {
  return {
    category,
    code,
    message,
    file,
    line,
    column,
    severity: "error",
  };
}

export function formatDiagnostic(diagnostic: AnyBuildDiagnostic): string {
  const file = diagnostic.file || "<input>";
  const line = Number.isInteger(diagnostic.line) && diagnostic.line > 0 ? diagnostic.line : 1;
  const column = Number.isInteger(diagnostic.column) && diagnostic.column > 0 ? diagnostic.column : 1;
  return `${file}:${line}:${column} ${diagnostic.code} ${diagnostic.message}`;
}

export function formatDiagnostics(diagnostics: readonly AnyBuildDiagnostic[]): string {
  return diagnostics.map(formatDiagnostic).join("\n");
}

export class BuildFailure extends Error {
  readonly diagnostics: readonly AnyBuildDiagnostic[];

  constructor(diagnostics: readonly AnyBuildDiagnostic[]) {
    super(diagnostics.map((diagnostic) => diagnostic.message).join("; ") || "Build failed.");
    this.name = "BuildFailure";
    this.diagnostics = diagnostics;
  }
}
