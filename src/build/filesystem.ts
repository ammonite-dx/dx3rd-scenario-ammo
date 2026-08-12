import {
  existsSync,
  mkdirSync,
  realpathSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";

import { buildDiagnostic, BuildFailure } from "./diagnostics.js";

export interface RepoFile {
  absolutePath: string;
  relativePath: string;
  source: string;
}

export function normalizeSlashes(value: string): string {
  return value.replaceAll("\\", "/");
}

export function isWithin(rootDir: string, candidate: string): boolean {
  const rel = relative(rootDir, candidate);
  return rel === "" || (rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
}

function existingAncestor(path: string): string {
  let candidate = path;
  while (!existsSync(candidate)) {
    const parent = dirname(candidate);
    if (parent === candidate) return candidate;
    candidate = parent;
  }
  return candidate;
}

export function repositoryRoot(rootDir: string): string {
  const absolute = resolve(rootDir);
  if (!existsSync(absolute) || !statSync(absolute).isDirectory()) {
    throw new BuildFailure([buildDiagnostic(absolute, "REPO_ROOT_INVALID", "Repository root must be an existing directory.", "security")]);
  }
  return realpathSync(absolute);
}

export function resolveExistingRepoPath(rootDir: string, inputPath: string, label: string): string {
  const root = repositoryRoot(rootDir);
  if (isAbsolute(inputPath)) {
    throw new BuildFailure([buildDiagnostic(inputPath, "PATH_ABSOLUTE_FORBIDDEN", `${label} must be repository-relative.`, "security")]);
  }
  const lexical = resolve(root, inputPath);
  if (!isWithin(root, lexical)) {
    throw new BuildFailure([buildDiagnostic(inputPath, "PATH_TRAVERSAL", `${label} escapes the repository root.`, "security")]);
  }
  if (!existsSync(lexical)) {
    throw new BuildFailure([buildDiagnostic(inputPath, "FILE_MISSING", `${label} does not exist: ${normalizeSlashes(inputPath)}.`, "build")]);
  }
  const actual = realpathSync(lexical);
  if (!isWithin(root, actual)) {
    throw new BuildFailure([buildDiagnostic(inputPath, "SYMLINK_ROOT_ESCAPE", `${label} resolves outside the repository root.`, "security")]);
  }
  if (!statSync(actual).isFile()) {
    throw new BuildFailure([buildDiagnostic(inputPath, "FILE_NOT_REGULAR", `${label} must be a regular file.`, "build")]);
  }
  return actual;
}

export function resolveOutputRepoPath(rootDir: string, inputPath: string, label: string): string {
  const root = repositoryRoot(rootDir);
  if (isAbsolute(inputPath)) {
    throw new BuildFailure([buildDiagnostic(inputPath, "PATH_ABSOLUTE_FORBIDDEN", `${label} must be repository-relative.`, "security")]);
  }
  const lexical = resolve(root, inputPath);
  if (!isWithin(root, lexical)) {
    throw new BuildFailure([buildDiagnostic(inputPath, "PATH_TRAVERSAL", `${label} escapes the repository root.`, "security")]);
  }
  const ancestor = existingAncestor(lexical);
  const actualAncestor = realpathSync(ancestor);
  if (!isWithin(root, actualAncestor)) {
    throw new BuildFailure([buildDiagnostic(inputPath, "SYMLINK_ROOT_ESCAPE", `${label} resolves outside the repository root.`, "security")]);
  }
  return lexical;
}

export function repoRelativePath(rootDir: string, absolutePath: string): string {
  return normalizeSlashes(relative(repositoryRoot(rootDir), absolutePath));
}

export function readRepoFile(rootDir: string, inputPath: string, label: string): RepoFile {
  const absolutePath = resolveExistingRepoPath(rootDir, inputPath, label);
  return {
    absolutePath,
    relativePath: repoRelativePath(rootDir, absolutePath),
    source: readFileSync(absolutePath, "utf8"),
  };
}

export function createTempPath(targetPath: string, extension = ".tmp"): string {
  const timestamp = `${Date.now()}-${process.pid}`;
  return resolve(dirname(targetPath), `.${targetPath.split(/[\\/]/u).pop() ?? "output"}.${timestamp}${extension}`);
}

export function writeTextFile(path: string, value: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, value, "utf8");
}

export function replaceFileAtomically(stagedPath: string, targetPath: string): void {
  mkdirSync(dirname(targetPath), { recursive: true });
  try {
    renameSync(stagedPath, targetPath);
  } catch (error) {
    if (!existsSync(targetPath)) throw error;
    rmSync(targetPath, { force: true });
    renameSync(stagedPath, targetPath);
  }
}

export function removeIfExists(path: string): void {
  rmSync(path, { force: true });
}
