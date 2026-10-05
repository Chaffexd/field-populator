import { describe, it, expect, vi } from "vitest";
import { adoptEntryTree } from "./adoptTree";

function createEntry({ entryId, version = 1, fields }) {
  return {
    sys: {
      id: entryId,
      version,
      contentType: { sys: { id: "article" } },
      environment: { sys: { id: "master" } },
      space: { sys: { id: "space-1" } },
    },
    fields,
  };
}

const contentType = {
  fields: [
    { id: "title", type: "Symbol", localized: true },
    {
      id: "cards",
      type: "Array",
      localized: false,
      items: { type: "Link", linkType: "Entry" },
    },
  ],
};

const link = (id) => ({ sys: { type: "Link", linkType: "Entry", id } });

function versionMismatch() {
  const err = new Error("Version mismatch");
  err.status = 409;
  err.sys = { id: "VersionMismatch" };
  return err;
}

function validationFailed() {
  const err = new Error(
    JSON.stringify({
      status: 422,
      message: "Validation error",
      requestId: "req-422",
      details: { errors: [{ message: "Size must be at most 50" }] },
    }),
  );
  err.status = 422;
  return err;
}

const baseArgs = {
  environmentId: "master",
  spaceId: "space-1",
  sourceLocale: "en",
  targetLocale: "en-JO",
  defaultLocale: "en",
  overwriteAll: true,
  adoptAll: true,
};

describe("adoptEntryTree — conflict retry", () => {
  it("refetches and recomputes from the latest entry after a 409", async () => {
    const stale = createEntry({
      entryId: "page",
      version: 3,
      fields: { title: { en: "New", "en-JO": "Old" } },
    });
    // Someone edited ja-JP between our GET and our PUT.
    const fresh = createEntry({
      entryId: "page",
      version: 4,
      fields: { title: { en: "New", "en-JO": "Old", "ja-JP": "新しい" } },
    });

    const cma = {
      entry: {
        get: vi.fn().mockResolvedValueOnce(stale).mockResolvedValueOnce(fresh),
        update: vi
          .fn()
          .mockRejectedValueOnce(versionMismatch())
          .mockImplementation(async (_p, payload) => payload),
      },
      contentType: { get: vi.fn().mockResolvedValue(contentType) },
    };

    const result = await adoptEntryTree({ ...baseArgs, cma, entryId: "page" });

    expect(cma.entry.get).toHaveBeenCalledTimes(2);
    expect(cma.entry.update).toHaveBeenCalledTimes(2);
    const [params, payload] = cma.entry.update.mock.calls[1];
    expect(params.version).toBe(4);
    expect(payload.fields.title).toEqual({
      en: "New",
      "en-JO": "New",
      "ja-JP": "新しい",
    });
    expect(result.updatedEntries).toBe(1);
    expect(result.failures).toEqual([]);
  });

  it("reports a failure (does not throw) when 409s keep happening", async () => {
    const entry = createEntry({
      entryId: "page",
      fields: { title: { en: "New", "en-JO": "Old" } },
    });
    const cma = {
      entry: {
        get: vi.fn().mockResolvedValue(entry),
        update: vi.fn().mockRejectedValue(versionMismatch()),
      },
      contentType: { get: vi.fn().mockResolvedValue(contentType) },
    };

    const result = await adoptEntryTree({ ...baseArgs, cma, entryId: "page" });

    expect(cma.entry.update.mock.calls.length).toBeGreaterThan(1);
    expect(result.updatedEntries).toBe(0);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]).toMatchObject({ entryId: "page" });
    expect(result.failures[0].reason).toMatch(/version mismatch/i);
  });
});

describe("adoptEntryTree — per-entry failure isolation", () => {
  it("keeps adopting other entries when one entry's update fails", async () => {
    const entries = {
      page: createEntry({
        entryId: "page",
        fields: {
          title: { en: "Page", "en-JO": "Old page" },
          cards: { en: [link("card-a"), link("card-b")] },
        },
      }),
      "card-a": createEntry({
        entryId: "card-a",
        fields: { title: { en: "A", "en-JO": "old A" } },
      }),
      "card-b": createEntry({
        entryId: "card-b",
        fields: { title: { en: "B", "en-JO": "old B" } },
      }),
    };

    const cma = {
      entry: {
        get: vi.fn(async ({ entryId }) => entries[entryId]),
        update: vi.fn(async ({ entryId }, payload) => {
          if (entryId === "card-a") throw validationFailed();
          return payload;
        }),
      },
      contentType: { get: vi.fn().mockResolvedValue(contentType) },
    };

    const result = await adoptEntryTree({ ...baseArgs, cma, entryId: "page" });

    expect(result.updatedEntries).toBe(2); // page + card-b
    expect(result.failures).toEqual([
      {
        entryId: "card-a",
        reason: "Size must be at most 50",
        requestId: "req-422",
      },
    ]);
  });

  it("still traverses the children of an entry whose update failed", async () => {
    const entries = {
      page: createEntry({
        entryId: "page",
        fields: {
          title: { en: "Page", "en-JO": "Old page" },
          cards: { en: [link("card-a")] },
        },
      }),
      "card-a": createEntry({
        entryId: "card-a",
        fields: { title: { en: "A", "en-JO": "old A" } },
      }),
    };

    const cma = {
      entry: {
        get: vi.fn(async ({ entryId }) => entries[entryId]),
        update: vi.fn(async ({ entryId }, payload) => {
          if (entryId === "page") throw validationFailed();
          return payload;
        }),
      },
      contentType: { get: vi.fn().mockResolvedValue(contentType) },
    };

    const result = await adoptEntryTree({ ...baseArgs, cma, entryId: "page" });

    expect(result.updatedEntries).toBe(1);
    expect(result.failures.map((f) => f.entryId)).toEqual(["page"]);
  });

  it("records an entry that cannot be fetched as a failure", async () => {
    const notFound = Object.assign(new Error("The resource could not be found."), {
      status: 404,
    });
    const cma = {
      entry: { get: vi.fn().mockRejectedValue(notFound), update: vi.fn() },
      contentType: { get: vi.fn() },
    };

    const result = await adoptEntryTree({ ...baseArgs, cma, entryId: "gone" });

    expect(result.failures).toEqual([
      {
        entryId: "gone",
        reason: "The resource could not be found.",
        requestId: null,
      },
    ]);
  });
});
