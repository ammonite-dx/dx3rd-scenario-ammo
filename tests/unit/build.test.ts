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
  buildWindowsCommandLine,
  locateVivliostyle,
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

describe("Vivliostyle CLI argument construction", () => {
  const common = {
    prefixArgs: [] as const,
    themeRelative: "themes/scenario-a5/theme.css",
    inputRelative: "generated/html/publication.html",
    outputRelative: "generated/pdf/publication.pdf",
  };

  it("keeps the default config, A5 size, browser flag, and input in valid order", () => {
    expect(buildVivliostyleArgs({
      ...common,
      configRelative: "vivliostyle.config.js",
      paper: "a5",
      browser: "C:/Program Files/Google/Chrome/Application/chrome.exe",
    })).toEqual([
      "build",
      "--log-level",
      "info",
      "--output",
      "generated/pdf/publication.pdf",
      "--format",
      "pdf",
      "--size",
      "A5",
      "--single-doc",
      "--theme",
      "themes/scenario-a5/theme.css",
      "--executable-browser",
      "C:/Program Files/Google/Chrome/Application/chrome.exe",
      "generated/html/publication.html",
    ]);
  });

  it("places a non-default config immediately after build and omits absent browser", () => {
    expect(buildVivliostyleArgs({
      ...common,
      configRelative: "configs/custom-vivliostyle.js",
      paper: "a4",
    })).toEqual([
      "build",
      "--config",
      "configs/custom-vivliostyle.js",
      "--log-level",
      "info",
      "--output",
      "generated/pdf/publication.pdf",
      "--format",
      "pdf",
      "--size",
      "A4",
      "--single-doc",
      "--theme",
      "themes/scenario-a5/theme.css",
      "generated/html/publication.html",
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

  it("resolves relative explicit executables from rootDir and preserves absolute paths", () => {
    const relative = locateVivliostyle(rootDir, "package.json");
    const absolutePath = resolve(rootDir, "package.json");
    const absolute = locateVivliostyle(rootDir, absolutePath);

    expect(relative.command).toBe(absolutePath);
    expect(absolute.command).toBe(absolutePath);
  });
});

describe("Vivliostyle staged config", () => {
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
      '"entry": "generated/html/.publication.stage.html"',
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
