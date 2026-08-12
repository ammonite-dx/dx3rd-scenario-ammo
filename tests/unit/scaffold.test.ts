import { describe, expect, it } from "vitest";

import {
  CONTRACT_VERSION,
  PACKAGE_NAME,
  PARSER_STACK,
} from "../../src/index.js";

describe("root parser scaffold", () => {
  it("exposes the package contract", () => {
    expect(PACKAGE_NAME).toBe("dx3rd-scenario-ammo");
    expect(CONTRACT_VERSION).toBe("0.1.0");
  });

  it("declares the planned parsing stack", () => {
    expect(PARSER_STACK).toEqual({
      markdown: "remark-parse",
      ast: "unified",
      frontmatter: "remark-frontmatter",
      yaml: "yaml",
    });
  });
});
