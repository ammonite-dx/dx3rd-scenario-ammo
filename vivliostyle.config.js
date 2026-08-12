/**
 * Official Vivliostyle CLI configuration for the generated HTML boundary.
 * The scenario CLI selects A5/A4 and the corresponding theme at runtime;
 * this file keeps the official workspace setting and normal A5 defaults
 * reproducible. The wrapper deliberately lets the official config own
 * workspaceDir instead of adding a private CLI argument.
 */
export default {
  entry: "generated/html/sample-publication.html",
  title: "DX3rd Scenario Sample",
  entryContext: ".",
  theme: "themes/scenario-a5/theme.css",
  size: "A5",
  language: "ja",
  workspaceDir: "generated/.vivliostyle",
  output: {
    path: "generated/pdf/sample-a5.pdf",
    format: "pdf",
  },
};
