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
      contentType: {
        sys: {
          id: contentTypeId,
        },
      },
      environment: {
        sys: {
          id: "master",
        },
      },
      space: {
        sys: {
          id: "vvbytozt5evi",
        },
      },
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

function createRichText(text) {
  return {
    nodeType: "document",
    data: {},
    content: [
      {
        nodeType: "paragraph",
        data: {},
        content: [
          {
            nodeType: "text",
            value: text,
            marks: [],
            data: {},
          },
        ],
      },
    ],
  };
}

function createGraphCma({ entries, contentTypes }) {
  return {
    entry: {
      get: vi.fn().mockImplementation(async ({ entryId }) => entries[entryId]),
      update: vi.fn().mockImplementation(async (_params, payload) => payload),
    },
    contentType: {
      get: vi
        .fn()
        .mockImplementation(
          async ({ contentTypeId }) => contentTypes[contentTypeId],
        ),
    },
  };
}

describe("adoptEntryTree", () => {
  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("populates the target locale and leaves the source locale unchanged", async () => {
    const entry = createEntry({
      fields: {
        title: {
          "en-US": "Source headline",
        },
      },
    });
    const originalEntry = structuredClone(entry);
    const cma = createCma({
      entry,
      contentType: {
        fields: [{ id: "title", type: "Symbol", localized: true }],
      },
    });

    const summary = await adoptEntryTree({
      cma,
      entryId: entry.sys.id,
      environmentId: "master",
      spaceId: "vvbytozt5evi",
      sourceLocale: "en-US",
      targetLocale: "de-DE",
      defaultLocale: "en-US",
      adoptAll: true,
    });

    expect(summary).toEqual({
      updatedEntries: 1,
      changedFields: 1,
      traversedEntries: 1,
      failures: [],
      cardSkips: [],
    });
    expect(cma.entry.get).toHaveBeenCalledWith({
      entryId: "entry-1",
      environmentId: "master",
      spaceId: "vvbytozt5evi",
    });
    expect(cma.entry.update).toHaveBeenCalledTimes(1);
    expect(cma.entry.update).toHaveBeenCalledWith(
      {
        entryId: "entry-1",
        environmentId: "master",
        spaceId: "vvbytozt5evi",
        version: 7,
      },
      expect.objectContaining({
        fields: {
          title: {
            "en-US": "Source headline",
            "de-DE": "Source headline",
          },
        },
      }),
    );
    expect(entry).toEqual(originalEntry);
  });

  it("overwrites different target content with the source locale content", async () => {
    const entry = createEntry({
      fields: {
        body: {
          "en-US": "Fresh source content",
          "de-DE": "Outdated target content",
        },
      },
    });
    const cma = createCma({
      entry,
      contentType: {
        fields: [{ id: "body", type: "Text", localized: true }],
      },
    });

    const summary = await adoptEntryTree({
      cma,
      entryId: entry.sys.id,
      environmentId: "master",
      spaceId: "vvbytozt5evi",
      sourceLocale: "en-US",
      targetLocale: "de-DE",
      defaultLocale: "en-US",
      overwriteAll: true,
    });

    expect(summary).toEqual({
      updatedEntries: 1,
      changedFields: 1,
      traversedEntries: 1,
      failures: [],
      cardSkips: [],
    });
    expect(cma.entry.update).toHaveBeenCalledWith(
      {
        entryId: "entry-1",
        environmentId: "master",
        spaceId: "vvbytozt5evi",
        version: 7,
      },
      expect.objectContaining({
        fields: {
          body: {
            "en-US": "Fresh source content",
            "de-DE": "Fresh source content",
          },
        },
      }),
    );
  });

  it("does not update the entry when source and target locales already match", async () => {
    const entry = createEntry({
      fields: {
        title: {
          "en-US": "Already aligned",
          "de-DE": "Already aligned",
        },
      },
    });
    const cma = createCma({
      entry,
      contentType: {
        fields: [{ id: "title", type: "Symbol", localized: true }],
      },
    });

    const summary = await adoptEntryTree({
      cma,
      entryId: entry.sys.id,
      environmentId: "master",
      spaceId: "vvbytozt5evi",
      sourceLocale: "en-US",
      targetLocale: "de-DE",
      defaultLocale: "en-US",
      adoptAll: true,
    });

    expect(summary).toEqual({
      updatedEntries: 0,
      changedFields: 0,
      traversedEntries: 1,
      failures: [],
      cardSkips: [],
    });
    expect(cma.entry.update).not.toHaveBeenCalled();
  });

  it("normalizes and populates date fields in the target locale", async () => {
    const entry = createEntry({
      fields: {
        publishDate: {
          "en-US": "2026-03-10T14:30:00Z",
        },
      },
    });
    const cma = createCma({
      entry,
      contentType: {
        fields: [{ id: "publishDate", type: "Date", localized: true }],
      },
    });

    const summary = await adoptEntryTree({
      cma,
      entryId: entry.sys.id,
      environmentId: "master",
      spaceId: "vvbytozt5evi",
      sourceLocale: "en-US",
      targetLocale: "de-DE",
      defaultLocale: "en-US",
      adoptAll: true,
    });

    expect(summary).toEqual({
      updatedEntries: 1,
      changedFields: 1,
      traversedEntries: 1,
      failures: [],
      cardSkips: [],
    });
    expect(cma.entry.update).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        fields: {
          publishDate: {
            "en-US": "2026-03-10T14:30:00Z",
            "de-DE": "2026-03-10T14:30:00Z",
          },
        },
      }),
    );
  });

  it("merges rich text insert-only in non-overwrite mode", async () => {
    const entry = createEntry({
      fields: {
        body: {
          "en-US": createRichText("Hello brave new world"),
          "de-DE": createRichText("Hello world"),
        },
      },
    });
    const cma = createCma({
      entry,
      contentType: {
        fields: [{ id: "body", type: "RichText", localized: true }],
      },
    });

    const summary = await adoptEntryTree({
      cma,
      entryId: entry.sys.id,
      environmentId: "master",
      spaceId: "vvbytozt5evi",
      sourceLocale: "en-US",
      targetLocale: "de-DE",
      defaultLocale: "en-US",
      adoptAll: true,
    });

    expect(summary).toEqual({
      updatedEntries: 1,
      changedFields: 1,
      traversedEntries: 1,
      failures: [],
      cardSkips: [],
    });
    expect(cma.entry.update).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        fields: {
          body: {
            "en-US": createRichText("Hello brave new world"),
            "de-DE": createRichText("Hello brave new world"),
          },
        },
      }),
    );
  });

  it("copies a localized entry link into the target locale", async () => {
    const entry = createEntry({
      fields: {
        relatedArticle: {
          "en-US": {
            sys: {
              type: "Link",
              linkType: "Entry",
              id: "linked-entry-1",
            },
          },
        },
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

    const summary = await adoptEntryTree({
      cma,
      entryId: entry.sys.id,
      environmentId: "master",
      spaceId: "vvbytozt5evi",
      sourceLocale: "en-US",
      targetLocale: "de-DE",
      defaultLocale: "en-US",
      adoptAll: true,
      visited: new Set(["linked-entry-1"]),
    });

    expect(summary).toEqual({
      updatedEntries: 1,
      changedFields: 1,
      traversedEntries: 1,
      failures: [],
      cardSkips: [],
    });
    expect(cma.entry.update).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        fields: {
          relatedArticle: {
            "en-US": {
              sys: {
                type: "Link",
                linkType: "Entry",
                id: "linked-entry-1",
              },
            },
            "de-DE": {
              sys: {
                type: "Link",
                linkType: "Entry",
                id: "linked-entry-1",
              },
            },
          },
        },
      }),
    );
  });

  it("copies a localized array of entry links into the target locale", async () => {
    const entry = createEntry({
      fields: {
        modules: {
          "en-US": [
            {
              sys: {
                type: "Link",
                linkType: "Entry",
                id: "module-1",
              },
            },
            {
              sys: {
                type: "Link",
                linkType: "Entry",
                id: "module-2",
              },
            },
          ],
        },
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
            items: {
              type: "Link",
              linkType: "Entry",
            },
          },
        ],
      },
    });

    const summary = await adoptEntryTree({
      cma,
      entryId: entry.sys.id,
      environmentId: "master",
      spaceId: "vvbytozt5evi",
      sourceLocale: "en-US",
      targetLocale: "de-DE",
      defaultLocale: "en-US",
      adoptAll: true,
      visited: new Set(["module-1", "module-2"]),
    });

    expect(summary).toEqual({
      updatedEntries: 1,
      changedFields: 1,
      traversedEntries: 1,
      failures: [],
      cardSkips: [],
    });
    expect(cma.entry.update).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        fields: {
          modules: {
            "en-US": [
              {
                sys: {
                  type: "Link",
                  linkType: "Entry",
                  id: "module-1",
                },
              },
              {
                sys: {
                  type: "Link",
                  linkType: "Entry",
                  id: "module-2",
                },
              },
            ],
            "de-DE": [
              {
                sys: {
                  type: "Link",
                  linkType: "Entry",
                  id: "module-1",
                },
              },
              {
                sys: {
                  type: "Link",
                  linkType: "Entry",
                  id: "module-2",
                },
              },
            ],
          },
        },
      }),
    );
  });

  it("recursively traverses referenced entries and updates descendants", async () => {
    const parentEntry = createEntry({
      entryId: "parent-entry",
      contentTypeId: "page",
      fields: {
        relatedArticle: {
          "en-US": {
            sys: {
              type: "Link",
              linkType: "Entry",
              id: "child-entry",
            },
          },
        },
      },
    });
    const childEntry = createEntry({
      entryId: "child-entry",
      contentTypeId: "article",
      fields: {
        title: {
          "en-US": "Child source copy",
        },
      },
    });
    const cma = createGraphCma({
      entries: {
        "parent-entry": parentEntry,
        "child-entry": childEntry,
      },
      contentTypes: {
        page: {
          fields: [
            {
              id: "relatedArticle",
              type: "Link",
              linkType: "Entry",
              localized: true,
            },
          ],
        },
        article: {
          fields: [{ id: "title", type: "Symbol", localized: true }],
        },
      },
    });

    const summary = await adoptEntryTree({
      cma,
      entryId: "parent-entry",
      environmentId: "master",
      spaceId: "vvbytozt5evi",
      sourceLocale: "en-US",
      targetLocale: "de-DE",
      defaultLocale: "en-US",
      adoptAll: true,
    });

    expect(summary).toEqual({
      updatedEntries: 2,
      changedFields: 2,
      traversedEntries: 2,
      failures: [],
      cardSkips: [],
    });
    expect(cma.entry.get).toHaveBeenNthCalledWith(1, {
      entryId: "parent-entry",
      environmentId: "master",
      spaceId: "vvbytozt5evi",
    });
    expect(cma.entry.get).toHaveBeenNthCalledWith(2, {
      entryId: "child-entry",
      environmentId: "master",
      spaceId: "vvbytozt5evi",
    });
    expect(cma.entry.update).toHaveBeenCalledTimes(2);
    expect(cma.entry.update).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ entryId: "parent-entry" }),
      expect.objectContaining({
        fields: {
          relatedArticle: {
            "en-US": {
              sys: {
                type: "Link",
                linkType: "Entry",
                id: "child-entry",
              },
            },
            "de-DE": {
              sys: {
                type: "Link",
                linkType: "Entry",
                id: "child-entry",
              },
            },
          },
        },
      }),
    );
    expect(cma.entry.update).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ entryId: "child-entry" }),
      expect.objectContaining({
        fields: {
          title: {
            "en-US": "Child source copy",
            "de-DE": "Child source copy",
          },
        },
      }),
    );
  });

  describe("merge mode preserves existing non-text target values", () => {
    const link = (id) => ({ sys: { type: "Link", linkType: "Entry", id } });
    const assetLink = (id) => ({
      sys: { type: "Link", linkType: "Asset", id },
    });

    const cases = [
      {
        name: "a localized entry link",
        def: { type: "Link", linkType: "Entry" },
        src: link("page-ar"),
        tgt: link("page-co"),
      },
      {
        name: "a localized array of entry links",
        def: { type: "Array", items: { type: "Link", linkType: "Entry" } },
        src: [link("card-ar-1"), link("card-ar-2")],
        tgt: [link("card-co-1")],
      },
      {
        name: "a localized asset link",
        def: { type: "Link", linkType: "Asset" },
        src: assetLink("image-ar"),
        tgt: assetLink("image-co"),
      },
      {
        name: "a localized JSON object",
        def: { type: "Object" },
        src: {
          ctaURL: "https://www.philips.com.ar/a",
          pageLink: { id: "page-ar" },
        },
        tgt: {
          ctaURL: "https://www.philips.com.co/a",
          pageLink: { id: "page-co" },
        },
      },
      {
        name: "a localized boolean",
        def: { type: "Boolean" },
        src: true,
        tgt: false,
      },
    ];

    for (const { name, def, src, tgt } of cases) {
      it(`does not replace ${name} that already has a different target value`, async () => {
        const entry = createEntry({
          fields: { field: { "es-AR": src, "es-CO": tgt } },
        });
        const cma = createCma({
          entry,
          contentType: { fields: [{ id: "field", localized: true, ...def }] },
        });

        const summary = await adoptEntryTree({
          cma,
          entryId: entry.sys.id,
          environmentId: "master",
          spaceId: "vvbytozt5evi",
          sourceLocale: "es-AR",
          targetLocale: "es-CO",
          defaultLocale: "es-AR",
          adoptAll: true,
          visited: new Set([
            "page-ar",
            "page-co",
            "card-ar-1",
            "card-ar-2",
            "card-co-1",
          ]),
        });

        expect(summary.changedFields).toBe(0);
        expect(cma.entry.update).not.toHaveBeenCalled();
      });

      it(`does not replace ${name} selected per field in merge mode`, async () => {
        const entry = createEntry({
          fields: { field: { "es-AR": src, "es-CO": tgt } },
        });
        const cma = createCma({
          entry,
          contentType: { fields: [{ id: "field", localized: true, ...def }] },
        });

        await adoptEntryTree({
          cma,
          entryId: entry.sys.id,
          environmentId: "master",
          spaceId: "vvbytozt5evi",
          sourceLocale: "es-AR",
          targetLocale: "es-CO",
          defaultLocale: "es-AR",
          selected: { [entry.sys.id]: new Set(["field"]) },
          visited: new Set([
            "page-ar",
            "page-co",
            "card-ar-1",
            "card-ar-2",
            "card-co-1",
          ]),
        });

        expect(cma.entry.update).not.toHaveBeenCalled();
      });

      it(`fills ${name} when the target is empty`, async () => {
        const entry = createEntry({ fields: { field: { "es-AR": src } } });
        const cma = createCma({
          entry,
          contentType: { fields: [{ id: "field", localized: true, ...def }] },
        });

        await adoptEntryTree({
          cma,
          entryId: entry.sys.id,
          environmentId: "master",
          spaceId: "vvbytozt5evi",
          sourceLocale: "es-AR",
          targetLocale: "es-CO",
          defaultLocale: "es-AR",
          adoptAll: true,
          visited: new Set(["page-ar", "card-ar-1", "card-ar-2"]),
        });

        expect(cma.entry.update).toHaveBeenCalledWith(
          expect.any(Object),
          expect.objectContaining({
            fields: { field: { "es-AR": src, "es-CO": src } },
          }),
        );
      });

      it(`still replaces ${name} when overwriteAll is set`, async () => {
        const entry = createEntry({
          fields: { field: { "es-AR": src, "es-CO": tgt } },
        });
        const cma = createCma({
          entry,
          contentType: { fields: [{ id: "field", localized: true, ...def }] },
        });

        await adoptEntryTree({
          cma,
          entryId: entry.sys.id,
          environmentId: "master",
          spaceId: "vvbytozt5evi",
          sourceLocale: "es-AR",
          targetLocale: "es-CO",
          defaultLocale: "es-AR",
          adoptAll: true,
          overwriteAll: true,
          visited: new Set([
            "page-ar",
            "page-co",
            "card-ar-1",
            "card-ar-2",
            "card-co-1",
          ]),
        });

        expect(cma.entry.update).toHaveBeenCalledWith(
          expect.any(Object),
          expect.objectContaining({
            fields: { field: { "es-AR": src, "es-CO": src } },
          }),
        );
      });
    }

    it("traverses the target's linked entry when source and target links differ", async () => {
      const page = createEntry({
        entryId: "hero-card",
        contentTypeId: "card",
        fields: {
          pageLink: { "es-AR": link("page-ar"), "es-CO": link("page-co") },
        },
      });
      const pageAr = createEntry({
        entryId: "page-ar",
        contentTypeId: "page",
        fields: { title: { "es-AR": "Argentina" } },
      });
      const pageCo = createEntry({
        entryId: "page-co",
        contentTypeId: "page",
        fields: { title: { "es-AR": "Argentina" } },
      });
      const cma = createGraphCma({
        entries: { "hero-card": page, "page-ar": pageAr, "page-co": pageCo },
        contentTypes: {
          card: {
            fields: [
              {
                id: "pageLink",
                type: "Link",
                linkType: "Entry",
                localized: true,
              },
            ],
          },
          page: { fields: [{ id: "title", type: "Symbol", localized: true }] },
        },
      });

      await adoptEntryTree({
        cma,
        entryId: "hero-card",
        environmentId: "master",
        spaceId: "vvbytozt5evi",
        sourceLocale: "es-AR",
        targetLocale: "es-CO",
        defaultLocale: "es-AR",
        adoptAll: true,
      });

      const fetched = cma.entry.get.mock.calls.map(([args]) => args.entryId);
      expect(fetched).toEqual(["hero-card", "page-co"]);
      expect(cma.entry.update).toHaveBeenCalledTimes(1);
      expect(cma.entry.update).toHaveBeenCalledWith(
        expect.objectContaining({ entryId: "page-co" }),
        expect.any(Object),
      );
    });
  });
});
