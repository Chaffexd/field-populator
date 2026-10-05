import { describe, it, expect, vi } from "vitest";
import { adoptEntryTree } from "./adoptTree";

const card = (title, ctaUrl = "") => ({ entryTitle: title, ctaUrl, text: title });

const contentType = {
  fields: [
    { id: "heroCards", type: "Object", localized: true },
    { id: "headline", type: "Symbol", localized: true },
  ],
};

function setup(heroCards, extraFields = {}) {
  const entry = {
    sys: {
      id: "page",
      version: 5,
      contentType: { sys: { id: "level3Catalog" } },
      environment: { sys: { id: "master" } },
      space: { sys: { id: "space-1" } },
    },
    fields: { heroCards, ...extraFields },
  };
  return {
    entry: {
      get: vi.fn().mockResolvedValue(entry),
      update: vi.fn(async (_p, payload) => payload),
    },
    contentType: { get: vi.fn().mockResolvedValue(contentType) },
  };
}

const base = {
  entryId: "page",
  environmentId: "master",
  spaceId: "space-1",
  sourceLocale: "en",
  defaultLocale: "en",
};

const a = card("Azurion", "/healthcare/product/HC1");
const b = card("IntraSight", "/healthcare/product/HC2");
const c = card("Hemo", "/healthcare/product/HC3");
const bEdited = card("IntraSight — new copy", "/healthcare/product/HC2");
const aLocal = card("Azurion (local copy)", "/healthcare/product/HC1");

describe("adoptEntryTree — card-level adopt", () => {
  it("writes only the ticked card into each locale, keeping local edits and removals", async () => {
    const cma = setup({
      en: [a, bEdited, c],
      "en-JO": [aLocal, b, c],
      "en-AE": [aLocal, b], // Hemo not sold here
    });
    const cardSelected = { page: { heroCards: { picks: { 1: bEdited } } } };

    const jo = await adoptEntryTree({ ...base, cma, targetLocale: "en-JO", cardSelected });
    const joWrite = cma.entry.update.mock.calls[0][1].fields.heroCards;
    expect(joWrite["en-JO"]).toEqual([aLocal, bEdited, c]);
    expect(jo.cardSkips).toEqual([]);

    await adoptEntryTree({ ...base, cma, targetLocale: "en-AE", cardSelected });
    const aeWrite = cma.entry.update.mock.calls[1][1].fields.heroCards;
    expect(aeWrite["en-AE"]).toEqual([aLocal, bEdited]);
  });

  it("reports a ticked card the locale doesn't have, and does not re-add it", async () => {
    const cma = setup({ en: [a, b, c], "en-AE": [aLocal, b] });
    const result = await adoptEntryTree({
      ...base,
      cma,
      targetLocale: "en-AE",
      cardSelected: { page: { heroCards: { picks: { 2: c } } } },
    });

    expect(cma.entry.update).not.toHaveBeenCalled();
    expect(result.cardSkips).toEqual([
      { entryId: "page", fieldId: "heroCards", card: 3, reason: "no matching card on this locale" },
    ]);
  });

  it("lets field-level Overwrite take precedence over ticked cards", async () => {
    const picks = { page: { heroCards: { picks: { 1: bEdited } } } };

    const overwrite = setup({ en: [a, bEdited], "en-JO": [aLocal, b] });
    await adoptEntryTree({
      ...base, cma: overwrite, targetLocale: "en-JO", cardSelected: picks,
      overwriteSelected: { page: new Set(["heroCards"]) },
    });
    expect(overwrite.entry.update.mock.calls[0][1].fields.heroCards["en-JO"]).toEqual([a, bEdited]);
  });

  it("combines card picks with other fields' merge on the same entry", async () => {
    const cma = setup(
      { en: [a, bEdited], "en-JO": [aLocal, b] },
      { headline: { en: "New headline" } },
    );
    await adoptEntryTree({
      ...base, cma, targetLocale: "en-JO",
      selected: { page: new Set(["headline"]) },
      cardSelected: { page: { heroCards: { picks: { 1: bEdited } } } },
    });
    const fields = cma.entry.update.mock.calls[0][1].fields;
    expect(fields.heroCards["en-JO"]).toEqual([aLocal, bEdited]);
    expect(fields.headline["en-JO"]).toBe("New headline");
  });
});
