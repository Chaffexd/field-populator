import { describe, it, expect, vi, beforeEach } from "vitest";
import { createClient } from "contentful-management";
import { cmaSDK } from "./contentful";

vi.mock("contentful-management", () => ({
  createClient: vi.fn(() => ({ mockClient: true })),
}));

const sdk = {
  ids: { space: "space-1", environment: "master", environmentAlias: undefined },
};

describe("cmaSDK", () => {
  beforeEach(() => {
    createClient.mockClear();
  });

  it("throws when no token is configured", () => {
    expect(() => cmaSDK(sdk, undefined)).toThrow(/configuration/i);
    expect(createClient).not.toHaveBeenCalled();
  });

  it("throws when the configured token is only whitespace", () => {
    expect(() => cmaSDK(sdk, "   ")).toThrow(/configuration/i);
    expect(createClient).not.toHaveBeenCalled();
  });

  it("passes the configured token to createClient", () => {
    cmaSDK(sdk, "cfpat-from-config-screen");

    expect(createClient).toHaveBeenCalledWith(
      { accessToken: "cfpat-from-config-screen" },
      expect.anything(),
    );
  });

  it("prefers the environment alias over the environment id in defaults", () => {
    cmaSDK(
      { ids: { space: "space-1", environment: "release-x", environmentAlias: "master" } },
      "cfpat-token",
    );

    expect(createClient).toHaveBeenCalledWith(expect.anything(), {
      type: "plain",
      defaults: { environmentId: "master", spaceId: "space-1" },
    });
  });
});
