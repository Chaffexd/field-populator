import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { adoptEntryTree } from "./adoptTree";

function createEntry({
  entryId = "entry-1",
  version = 7,
  contentTypeId = "article",
  fields,
}) {
  return {
    sys: {
      id: entryId,
      version,
      contentType: { sys: { id: contentTypeId } },
      environment: { sys: { id: "master" } },
      space: { sys: { id: "vvbytozt5evi" } },
    },
    fields,
  };
}

function createCma({ entry, contentType }) {
  return {
    entry: {
      get: vi.fn().mockResolvedValue(entry),
      update: vi.fn().mockImplementation(async (_params, payload) => payload),
    },
    contentType: {
      get: vi.fn().mockResolvedValue(contentType),
    },
  };
}

const BASE_ARGS = {
  entryId: "entry-1",
  environmentId: "master",
  spaceId: "vvbytozt5evi",
  sourceLocale: "en-US",
  targetLocale: "de-DE",
  defaultLocale: "en-US",
};

describe("adoptEntryTree — per-field overwrite via overwriteSelected", () => {
  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("replaces existing target content for a field listed in overwriteSelected", async () => {
    const entry = createEntry({
      fields: {
        body: {
          "en-US": "New source content",
          "de-DE": "Old target content",
        },
      },
    });
    const cma = createCma({
      entry,
      contentType: {
        fields: [{ id: "body", type: "Text", localized: true }],
      },
    });

    await adoptEntryTree({
      ...BASE_ARGS,
      cma,
      adoptAll: false,
      overwriteSelected: { "entry-1": new Set(["body"]) },
    });

    expect(cma.entry.update).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        fields: {
          body: { "en-US": "New source content", "de-DE": "New source content" },
        },
      }),
    );
  });

  it("skips a field that is in neither overwriteSelected nor selected when adoptAll is false", async () => {
    const entry = createEntry({
      fields: {
        title: { "en-US": "Source title", "de-DE": "Old target title" },
        body: { "en-US": "Source body", "de-DE": "Old target body" },
      },
    });
    const cma = createCma({
      entry,
      contentType: {
        fields: [
          { id: "title", type: "Symbol", localized: true },
          { id: "body", type: "Text", localized: true },
        ],
      },
    });

    await adoptEntryTree({
      ...BASE_ARGS,
      cma,
      adoptAll: false,
      selected: { "entry-1": new Set(["title"]) },
      overwriteSelected: {},
    });

    expect(cma.entry.update).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        fields: {
          // title was in selected so it was merged (insert-only; values differ so it may update)
          title: expect.any(Object),
          // body was in neither — must remain untouched
          body: { "en-US": "Source body", "de-DE": "Old target body" },
        },
      }),
    );
  });

  it("overwrites one field while merging another in the same entry", async () => {
    const entry = createEntry({
      fields: {
        title: {
          "en-US": "Source title",
          "de-DE": "Existing target title",
        },
        body: {
          "en-US": "Source body",
          "de-DE": "Existing target body",
        },
      },
    });
    const cma = createCma({
      entry,
      contentType: {
        fields: [
          { id: "title", type: "Symbol", localized: true },
          { id: "body", type: "Text", localized: true },
        ],
      },
    });

    await adoptEntryTree({
      ...BASE_ARGS,
      cma,
      adoptAll: false,
      selected: { "entry-1": new Set(["title"]) },
      overwriteSelected: { "entry-1": new Set(["body"]) },
    });

    const [, updatedPayload] = cma.entry.update.mock.calls[0];

    // body was overwritten: target equals source exactly
    expect(updatedPayload.fields.body["de-DE"]).toBe("Source body");

    // title was merged insert-only: source and target differ so something was written,
    // but target is NOT simply replaced by source (merge behaviour)
    expect(updatedPayload.fields.title["de-DE"]).toBeDefined();
  });

  it("overwrites a field in overwriteSelected even when adoptAll is true", async () => {
    const entry = createEntry({
      fields: {
        body: {
          "en-US": "Replacement content",
          "de-DE": "Existing localised content",
        },
      },
    });
    const cma = createCma({
      entry,
      contentType: {
        fields: [{ id: "body", type: "Text", localized: true }],
      },
    });

    await adoptEntryTree({
      ...BASE_ARGS,
      cma,
      adoptAll: true,
      overwriteSelected: { "entry-1": new Set(["body"]) },
    });

    const [, updatedPayload] = cma.entry.update.mock.calls[0];
    expect(updatedPayload.fields.body["de-DE"]).toBe("Replacement content");
  });

  it("overwrites a Date field listed in overwriteSelected", async () => {
    const entry = createEntry({
      fields: {
        publishDate: {
          "en-US": "2026-06-01T00:00:00Z",
          "de-DE": "2025-01-01T00:00:00Z",
        },
      },
    });
    const cma = createCma({
      entry,
      contentType: {
        fields: [{ id: "publishDate", type: "Date", localized: true }],
      },
    });

    await adoptEntryTree({
      ...BASE_ARGS,
      cma,
      adoptAll: false,
      overwriteSelected: { "entry-1": new Set(["publishDate"]) },
    });

    expect(cma.entry.update).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        fields: {
          publishDate: {
            "en-US": "2026-06-01T00:00:00Z",
            "de-DE": "2026-06-01T00:00:00Z",
          },
        },
      }),
    );
  });

  it("overwrites a localized entry link listed in overwriteSelected", async () => {
    const srcLink = { sys: { type: "Link", linkType: "Entry", id: "new-ref" } };
    const tgtLink = { sys: { type: "Link", linkType: "Entry", id: "old-ref" } };
    const entry = createEntry({
      fields: {
        relatedArticle: { "en-US": srcLink, "de-DE": tgtLink },
      },
    });
    const cma = createCma({
      entry,
      contentType: {
        fields: [
          {
            id: "relatedArticle",
            type: "Link",
            linkType: "Entry",
            localized: true,
          },
        ],
      },
    });

    await adoptEntryTree({
      ...BASE_ARGS,
      cma,
      adoptAll: false,
      overwriteSelected: { "entry-1": new Set(["relatedArticle"]) },
      visited: new Set(["new-ref", "old-ref"]),
    });

    expect(cma.entry.update).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        fields: {
          relatedArticle: {
            "en-US": srcLink,
            "de-DE": srcLink,
          },
        },
      }),
    );
  });

  it("overwrites a localized array of entry links listed in overwriteSelected", async () => {
    const srcArr = [
      { sys: { type: "Link", linkType: "Entry", id: "mod-a" } },
      { sys: { type: "Link", linkType: "Entry", id: "mod-b" } },
    ];
    const tgtArr = [
      { sys: { type: "Link", linkType: "Entry", id: "mod-old" } },
    ];
    const entry = createEntry({
      fields: {
        modules: { "en-US": srcArr, "de-DE": tgtArr },
      },
    });
    const cma = createCma({
      entry,
      contentType: {
        fields: [
          {
            id: "modules",
            type: "Array",
            localized: true,
            items: { type: "Link", linkType: "Entry" },
          },
        ],
      },
    });

    await adoptEntryTree({
      ...BASE_ARGS,
      cma,
      adoptAll: false,
      overwriteSelected: { "entry-1": new Set(["modules"]) },
      visited: new Set(["mod-a", "mod-b", "mod-old"]),
    });

    expect(cma.entry.update).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        fields: {
          modules: {
            "en-US": srcArr,
            "de-DE": srcArr,
          },
        },
      }),
    );
  });

  it("still writes the entry when overwriteSelected field already matches the source (force-write)", async () => {
    // Overwrite mode is a force-write: unlike merge, it does not skip identical values.
    const entry = createEntry({
      fields: {
        body: { "en-US": "Same content", "de-DE": "Same content" },
      },
    });
    const cma = createCma({
      entry,
      contentType: {
        fields: [{ id: "body", type: "Text", localized: true }],
      },
    });

    const summary = await adoptEntryTree({
      ...BASE_ARGS,
      cma,
      adoptAll: false,
      overwriteSelected: { "entry-1": new Set(["body"]) },
    });

    expect(summary.updatedEntries).toBe(1);
    expect(cma.entry.update).toHaveBeenCalledTimes(1);
  });

  it("overwriteAll=true overwrites everything and overwriteSelected has no additional effect", async () => {
    const entry = createEntry({
      fields: {
        title: { "en-US": "Source title", "de-DE": "Old title" },
        body: { "en-US": "Source body", "de-DE": "Old body" },
      },
    });
    const cma = createCma({
      entry,
      contentType: {
        fields: [
          { id: "title", type: "Symbol", localized: true },
          { id: "body", type: "Text", localized: true },
        ],
      },
    });

    await adoptEntryTree({
      ...BASE_ARGS,
      cma,
      adoptAll: true,
      overwriteAll: true,
      overwriteSelected: { "entry-1": new Set(["body"]) },
    });

    const [, updatedPayload] = cma.entry.update.mock.calls[0];
    // Both fields overwritten by overwriteAll
    expect(updatedPayload.fields.title["de-DE"]).toBe("Source title");
    expect(updatedPayload.fields.body["de-DE"]).toBe("Source body");
  });
});
