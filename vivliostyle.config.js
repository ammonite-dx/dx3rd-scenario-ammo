/**
 * Explicit external-CLI compatibility configuration.
 * The normal PDF path uses the pinned CoreViewer adapter and does not read
 * this file, its staged copy, or its workspaceDir. An explicitly supplied
 * external executable can consume the same temporary config instead.
 */
export default {
  entry: ["generated/html/sample-publication.html"],
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
