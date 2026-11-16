import { describe, expect, it } from "vitest";
import { ConfigError, parseConfig, slug } from "@/config";

const page = (overrides = {}) => ({
  name: "Node.js releases",
  url: "https://example.test/releases",
  ...overrides,
});

describe("parseConfig", () => {
  it("accepts a minimal config and defaults ignore to an empty list", () => {
    const { pages } = parseConfig({ pages: [page()] });
    expect(pages[0]).toEqual({ ...page(), ignore: [] });
  });

  it("rejects an empty page list", () => {
    expect(() => parseConfig({ pages: [] })).toThrow(ConfigError);
  });

  it("rejects addresses that are not http or https", () => {
    for (const url of ["file:///etc/passwd", "javascript:alert(1)", "not an address"]) {
      expect(() => parseConfig({ pages: [page({ url })] })).toThrow(ConfigError);
    }
  });

  it("rejects two pages whose snapshots would overwrite each other", () => {
    const two = [page(), page({ name: "node js RELEASES", url: "https://example.test/other" })];
    expect(() => parseConfig({ pages: two })).toThrow("is used twice");
  });

  it("rejects an ignore pattern that is not a valid regex", () => {
    expect(() => parseConfig({ pages: [page({ ignore: ["("] })] })).toThrow(
      "invalid ignore pattern",
    );
  });
});

describe("slug", () => {
  it("keeps only lowercase letters, digits and hyphens", () => {
    expect(slug("Node.js Releases!")).toBe("node-js-releases");
    expect(slug("  Fuel   prices (2026) ")).toBe("fuel-prices-2026");
  });

  it("never produces a path separator or an empty name", () => {
    expect(slug("../../etc/passwd")).toBe("etc-passwd");
    expect(slug("???")).toBe("page");
  });
});
