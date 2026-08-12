import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { join, relative } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { runCli, type CliIO } from "../../src/cli/main.js";

const rootDir = process.cwd();
const temporaryRoots: string[] = [];

interface CapturedRun {
  code: number;
  stdout: string;
  stderr: string;
}

function captureCli(): { io: CliIO; read: () => { stdout: string; stderr: string } } {
  const stdout: string[] = [];
  const stderr: string[] = [];
  return {
    io: {
      stdout: (value) => stdout.push(value),
      stderr: (value) => stderr.push(value),
    },
    read: () => ({ stdout: stdout.join(""), stderr: stderr.join("") }),
  };
}

function relativeToRoot(path: string): string {
  return relative(rootDir, path).replaceAll("\\", "/");
}

function writeConfig(directory: string, chapter: string, outputName: string): string {
  const configPath = join(directory, "build.config.json");
  const outputBase = relativeToRoot(join(directory, outputName));
  writeFileSync(configPath, JSON.stringify({
    title: "CLI integration test",
    chapters: [chapter],
    themes: {
      a5: "themes/scenario-a5/theme.css",
      a4: "themes/scenario-a5/theme-a4.css",
    },
    output: {
      html: `${outputBase}.html`,
      pdf: {
        a5: `${outputBase}.pdf`,
        a4: `${outputBase}-a4.pdf`,
      },
    },
    vivliostyleConfig: "vivliostyle.config.js",
    workspaceDir: "generated/.vivliostyle",
  }, null, 2), "utf8");
  return relativeToRoot(configPath);
}

function runCaptured(args: string[]): CapturedRun {
  const captured = captureCli();
  const code = runCli(args, { cwd: rootDir, io: captured.io });
  const output = captured.read();
  return { code, ...output };
}

afterEach(() => {
  while (temporaryRoots.length > 0) {
    const directory = temporaryRoots.pop();
    if (directory) rmSync(directory, { recursive: true, force: true });
  }
});

describe("build CLI", () => {
  it("writes ordered HTML and keeps normal logs separate from diagnostics", () => {
    mkdirSync(join(rootDir, "tmp"), { recursive: true });
    const directory = mkdtempSync(join(rootDir, "tmp", "build-integration-"));
    temporaryRoots.push(directory);
    const config = writeConfig(directory, "manuscripts/sample/01-opening.md", "build-integration-valid");
    const result = runCaptured(["build", "html", "--config", config]);
    const outputPath = join(directory, "build-integration-valid.html");

    expect(result.code).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("HTML written:");
    expect(existsSync(outputPath)).toBe(true);
    expect(readFileSync(outputPath, "utf8")).toContain('data-document-id="SAMPLE-01"');
  });

  it("returns a positioned diagnostic and leaves no HTML for invalid Markdown", () => {
    mkdirSync(join(rootDir, "tmp"), { recursive: true });
    const directory = mkdtempSync(join(rootDir, "tmp", "build-integration-"));
    temporaryRoots.push(directory);
    const config = writeConfig(directory, "tests/fixtures/invalid/15-raw-html.md", "build-integration-invalid");
    const result = runCaptured(["build", "html", "--config", config]);
    const outputPath = join(directory, "build-integration-invalid.html");

    expect(result.code).not.toBe(0);
    expect(result.stdout).toBe("");
    expect(result.stderr).toMatch(/tests\/fixtures\/invalid\/15-raw-html\.md:\d+:\d+ RAW_HTML /u);
    expect(existsSync(outputPath)).toBe(false);
  });

  it("rejects traversal in a configured chapter before reading outside the repository", () => {
    mkdirSync(join(rootDir, "tmp"), { recursive: true });
    const directory = mkdtempSync(join(rootDir, "tmp", "build-integration-"));
    temporaryRoots.push(directory);
    const config = writeConfig(directory, "../outside.md", "build-integration-traversal");
    const result = runCaptured(["build", "html", "--config", config]);

    expect(result.code).not.toBe(0);
    expect(result.stderr).toContain("PATH_TRAVERSAL");
  });

  it("rejects missing files and unknown options with non-zero exit codes", () => {
    mkdirSync(join(rootDir, "tmp"), { recursive: true });
    const directory = mkdtempSync(join(rootDir, "tmp", "build-integration-"));
    temporaryRoots.push(directory);
    const config = writeConfig(directory, "manuscripts/sample/missing.md", "build-integration-missing");
    const missing = runCaptured(["build", "html", "--config", config]);
    const unknown = runCaptured(["build", "html", "--unknown-option"]);

    expect(missing.code).not.toBe(0);
    expect(missing.stderr).toContain("FILE_MISSING");
    expect(unknown.code).not.toBe(0);
    expect(unknown.stderr).toMatch(/<cli>:1:1 CLI_UNKNOWN_OPTION /u);
  });
});
