import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { readBuildConfig } from "../../src/build/config.js";
import {
  buildStagedVivliostyleConfig,
  vivliostyleConfigStageBasePath,
} from "../../src/build/pdf.js";
import { preparePublication } from "../../src/build/publication.js";
import {
  buildVivliostyleArgs,
  buildPuppeteerLaunchArgs,
  buildWindowsCommandLine,
  buildWindowsShellCommand,
  locateVivliostyle,
  runVivliostyle,
} from "../../src/build/vivliostyle.js";

const rootDir = process.cwd();

describe("publication build preparation", () => {
  it("uses the explicit four-chapter order and resolves structured data", () => {
    const result = readBuildConfig(join(rootDir, "build.config.json"));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.config.chapters).toEqual([
      "manuscripts/sample/01-opening.md",
      "manuscripts/sample/02-traces.md",
      "manuscripts/sample/03-resonance.md",
      "manuscripts/sample/04-climax.md",
    ]);

    const publication = preparePublication(rootDir, result.config, "a5", "tmp/unit-publication/sample.html");
    expect(publication.chapters).toHaveLength(4);
    expect(publication.html).toContain('data-paper="a5"');
    expect(publication.html).toContain('href="../../themes/scenario-a5/theme.css"');
    expect(publication.html).toContain('data-data-kind="enemy"');
    expect(publication.html).toContain('data-data-kind="combo"');

    const chapterPositions = ["SAMPLE-01", "SAMPLE-02", "SAMPLE-03", "SAMPLE-04"]
      .map((id) => publication.html.indexOf(`data-document-id="${id}"`));
    expect(chapterPositions.every((position) => position >= 0)).toBe(true);
    expect(chapterPositions).toEqual([...chapterPositions].sort((left, right) => left - right));
  });

  it("switches the publication theme and paper metadata to A4", () => {
    const result = readBuildConfig(join(rootDir, "build.config.json"));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const publication = preparePublication(rootDir, result.config, "a4", "tmp/unit-publication/sample-a4.html");
    expect(publication.html).toContain('data-paper="a4"');
    expect(publication.html).toContain('href="../../themes/scenario-a5/theme-a4.css"');
  });
});

describe("Vivliostyle adapter boundary", () => {
  it("keeps Chrome sandbox enabled unless the exact opt-in value is set", () => {
    expect(buildPuppeteerLaunchArgs(undefined)).toEqual([]);
    expect(buildPuppeteerLaunchArgs("0")).toEqual([]);
    expect(buildPuppeteerLaunchArgs("true")).toEqual([]);
    expect(buildPuppeteerLaunchArgs("1")).toEqual(["--no-sandbox"]);
  });

  it("passes only the explicit config and log level without duplicate build inputs", () => {
    expect(buildVivliostyleArgs({
      prefixArgs: [],
      configRelative: ".vivliostyle.config.js.123.js",
    })).toEqual([
      "build",
      "--config",
      ".vivliostyle.config.js.123.js",
      "--log-level",
      "info",
    ]);
  });

  it("adds only the executable browser option when configured", () => {
    expect(buildVivliostyleArgs({
      prefixArgs: [],
      configRelative: ".vivliostyle.config.js.123.js",
      browser: "C:/Program Files/Google/Chrome/Application/chrome.exe",
    })).toEqual([
      "build",
      "--config",
      ".vivliostyle.config.js.123.js",
      "--log-level",
      "info",
      "--executable-browser",
      "C:/Program Files/Google/Chrome/Application/chrome.exe",
    ]);
  });

  it("quotes Windows .cmd arguments containing spaces", () => {
    expect(buildWindowsCommandLine("C:/tools/vivliostyle.cmd", [
      "--executable-browser",
      "C:/Program Files/Google/Chrome/Application/chrome.exe",
    ])).toBe(
      "C:/tools/vivliostyle.cmd --executable-browser \"C:/Program Files/Google/Chrome/Application/chrome.exe\"",
    );
  });

  it("wraps the complete Windows /c command for paths with spaces and metacharacters", () => {
    expect(buildWindowsShellCommand("C:/tools/vivliostyle & runner.cmd", [
      "--executable-browser",
      "C:/Program Files/Google/Chrome/Application/chrome.exe",
    ])).toBe(
      'call "C:/tools/vivliostyle & runner.cmd" --executable-browser "C:/Program Files/Google/Chrome/Application/chrome.exe"',
    );
  });

  it("waits for a Windows .cmd boundary and propagates both success and failure", async () => {
    if (process.platform !== "win32") return;

    const temporaryRoot = mkdtempSync(join(tmpdir(), "vivliostyle-cmd-boundary-"));
    const boundaryDir = join(temporaryRoot, "cmd boundary & spaces");
    const commandPath = join(boundaryDir, "dummy vivliostyle & runner.cmd");
    const browserPath = join(boundaryDir, "browser & argument.exe");
    const markerPath = join(boundaryDir, "marker.txt");
    const previousBrowser = process.env.VIVLIOSTYLE_BROWSER;

    const writeDummyCommand = (exitCode: number): void => {
      writeFileSync(commandPath, [
        "@echo off",
        '> "%~dp0marker.txt" echo %*',
        `exit /b ${String(exitCode)}`,
        "",
      ].join("\r\n"), "utf8");
    };

    try {
      mkdirSync(boundaryDir, { recursive: true });
      writeFileSync(browserPath, "", "utf8");
      writeDummyCommand(0);
      process.env.VIVLIOSTYLE_BROWSER = browserPath;

      const options = {
        rootDir,
        executable: { command: commandPath, prefixArgs: [], label: "dummy Vivliostyle" },
        configPath: "package.json",
        htmlPath: "package.json",
        pdfPath: "tmp/dummy.pdf",
        paper: "a5" as const,
      };
      await expect(runVivliostyle(options)).resolves.toBeUndefined();
      expect(existsSync(markerPath)).toBe(true);
      expect(readFileSync(markerPath, "utf8")).toContain(
        `--executable-browser "${browserPath}"`,
      );

      rmSync(markerPath, { force: true });
      writeDummyCommand(23);
      await expect(runVivliostyle(options)).rejects.toThrow("dummy Vivliostyle exited with status 23.");
      expect(existsSync(markerPath)).toBe(true);
    } finally {
      if (previousBrowser === undefined) delete process.env.VIVLIOSTYLE_BROWSER;
      else process.env.VIVLIOSTYLE_BROWSER = previousBrowser;
      rmSync(temporaryRoot, { recursive: true, force: true });
    }
  });

  it("resolves relative explicit executables from rootDir and preserves absolute paths", () => {
    const relative = locateVivliostyle(rootDir, "package.json");
    const absolutePath = resolve(rootDir, "package.json");
    const absolute = locateVivliostyle(rootDir, absolutePath);

    expect(relative.command).toBe(absolutePath);
    expect(absolute.command).toBe(absolutePath);
  });

  it("does not resolve an implicit PATH executable for the default adapter", () => {
    const previous = process.env.VIVLIOSTYLE_BIN;
    delete process.env.VIVLIOSTYLE_BIN;
    try {
      expect(() => locateVivliostyle(rootDir)).toThrow("pinned @vivliostyle/core adapter");
    } finally {
      if (previous === undefined) delete process.env.VIVLIOSTYLE_BIN;
      else process.env.VIVLIOSTYLE_BIN = previous;
    }
  });
});

describe("external Vivliostyle compatibility config", () => {
  it("keeps the temporary config at root while retaining root-relative paths", () => {
    const htmlPath = join(rootDir, "generated", "html", ".publication.stage.html");
    const pdfPath = join(rootDir, "generated", "pdf", ".publication.stage.pdf");
    const themePath = join(rootDir, "themes", "scenario-a5", "theme.css");
    const workspaceDir = join(rootDir, "generated", ".vivliostyle");
    const stagedConfig = buildStagedVivliostyleConfig(
      rootDir,
      htmlPath,
      pdfPath,
      themePath,
      workspaceDir,
      "a5",
    );

    expect(vivliostyleConfigStageBasePath(rootDir)).toBe(join(rootDir, "vivliostyle.config.js"));
    expect(stagedConfig).toContain(
      '"entry": [\n    "generated/html/.publication.stage.html"\n  ]',
    );
    expect(stagedConfig).toContain(
      '"theme": "themes/scenario-a5/theme.css"',
    );
    expect(stagedConfig).toContain(
      '"workspaceDir": "generated/.vivliostyle"',
    );
    expect(stagedConfig).toContain(
      '"path": "generated/pdf/.publication.stage.pdf"',
    );
  });
});
