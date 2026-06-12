import { describe, it, expect } from "vitest";
import { isPairAllowed, ALLOWED_BASES_DEFAULT } from "./localeUtils";

describe("isPairAllowed", () => {
  it("returns false when source is missing", () => {
    expect(isPairAllowed(undefined, "en-GB")).toBe(false);
  });

  it("returns false when target is missing", () => {
    expect(isPairAllowed("en-US", undefined)).toBe(false);
  });

  it("allows any pair when allowedBases is empty (unrestricted default)", () => {
    expect(isPairAllowed("en-US", "en-GB")).toBe(true);
    expect(isPairAllowed("de-DE", "de-AT")).toBe(true);
    expect(isPairAllowed("en-US", "de-DE")).toBe(true);
    expect(isPairAllowed("en-US", "fr-FR")).toBe(true);
    expect(isPairAllowed("xx-YY", "xx-ZZ")).toBe(true);
  });

  it("allows source → base-only target", () => {
    expect(isPairAllowed("en-US", "en")).toBe(true);
  });

  it("allows pinned target regardless of source base", () => {
    expect(isPairAllowed("en-US", "zu-ZA")).toBe(true);
    expect(isPairAllowed("de-DE", "zu-ZA")).toBe(true);
  });

  it("respects custom allowedBases array", () => {
    expect(isPairAllowed("en-US", "en-GB", ["de"])).toBe(false);
    expect(isPairAllowed("de-DE", "de-AT", ["de"])).toBe(true);
  });

  it("rejects cross-base pairs when allowedBases is set", () => {
    expect(isPairAllowed("en-US", "de-DE", ["en", "de"])).toBe(false);
    expect(isPairAllowed("en-US", "fr-FR", ["en", "fr"])).toBe(false);
  });

  it("rejects pair when source base not in allowedBases", () => {
    expect(isPairAllowed("xx-YY", "xx-ZZ", ["en"])).toBe(false);
  });
});
