import { describe, it, expect } from "vitest";
import { matchCards, applyCardSelection, isCardField } from "./cardMatch";

const rt = (text) => ({
  nodeType: "document",
  data: {},
  content: [
    {
      nodeType: "paragraph",
      data: {},
      content: [{ nodeType: "text", value: text, marks: [], data: {} }],
    },
  ],
});

// demonstratedResults items: no id, empty ctaUrl, empty pageLink
const result = (stat, teaser, summary) => ({
  ctaUrl: "",
  pageLink: { id: "", slug: "", type: "", locale: "" },
  statistics: rt(stat),
  teaser: rt(teaser),
  summary: rt(summary),
  result: { assetUrl: "", assetName: "" },
});

const contrast = result(
  "28.8%",
  "reduction in contrast agent with Dynamic Coronary Roadmap[1]",
  "Clinical Study: Dynamic Coronary Roadmap versus standard angiography for percutaneous coronary intervention.",
);
const workflow = result(
  "85%",
  "believe TSM control of HEMO visualizations improves workflow[2]",
  "A usability study revealed that 85% of users believe the Azurion TSM control of HEMO visualizations improves workflow.",
);
const savingUS = result(
  "$1024",
  "saved per patient with Philips iFR compared to FFR[3]",
  "An analysis to assess a cost-minimization of iFR-guided compared with FFR-guided revascularization demonstrated a cost saving per patient.",
);
const savingNordic = { ...savingUS, statistics: rt("$896") };

// featuredSolutions items: product code in ctaUrl, locale-prefixed in some locales
const solution = (title, ctaUrl, extra = {}) => ({
  entryTitle: title,
  headline: rt(title),
  text: rt(`${title} description text`),
  ctaText: "",
  ctaUrl,
  imageVideoAsset: { assetUrl: "", assetName: "" },
  ...extra,
});

describe("isCardField", () => {
  it("covers the card components", () => {
    expect(isCardField("heroCards")).toBe(true);
    expect(isCardField("demonstratedResults")).toBe(true);
    expect(isCardField("featuredSolutions")).toBe(true);
    expect(isCardField("headline")).toBe(false);
  });
});

describe("matchCards", () => {
  it("matches a locally edited card to its counterpart by content", () => {
    const { pairs } = matchCards(
      [contrast, workflow, savingNordic],
      [contrast, workflow, savingUS],
    );
    expect(pairs).toEqual([0, 1, 2]);
  });

  it("does not shift matches when a locale removed a card mid-list", () => {
    // en-MY dropped the second card: position-matching would pair
    // source card 3 with target card 2.
    const { pairs } = matchCards(
      [contrast, workflow, savingNordic],
      [contrast, savingUS],
    );
    expect(pairs).toEqual([0, null, 1]);
  });

  it("matches by product code across locale-prefixed URLs", () => {
    const src = [
      solution("Azurion", "/healthcare/product/HCIGTDGLS"),
      solution("Dilator", "/healthcare/product/HCIGTDTRRDS"),
      solution("Bobcat", "/healthcare/product/HCIGTDBOB"),
    ];
    const ru = [
      solution("Дилататор", "/healthcare/ru-RU/product/HCIGTDTRRDS"),
      solution("Бобкэт", "https://www.philips.ru/healthcare/ru-RU/product/HCIGTDBOB/some-slug"),
    ];
    expect(matchCards(src, ru).pairs).toEqual([null, 0, 1]);
  });

  it("matches by pageLink id and taxonomy id", () => {
    const src = [
      solution("A", "", { pageLink: { id: "4yr7C8", slug: "azurion" } }),
      solution("B", "", { id: "https://pp.biz/Site/20499" }),
    ];
    const tgt = [
      solution("B translated", "", { id: "https://pp.biz/Site/20499" }),
      solution("A translated", "", { pageLink: { id: "4yr7C8", slug: "azurion" } }),
    ];
    expect(matchCards(src, tgt).pairs).toEqual([1, 0]);
  });

  it("refuses to match a translated keyless card", () => {
    const german = result(
      "28,8 %",
      "weniger Kontrastmittel mit Dynamic Coronary Roadmap[1]",
      "Klinische Studie: Dynamic Coronary Roadmap im Vergleich zur Standardangiographie.",
    );
    expect(matchCards([contrast], [german]).pairs).toEqual([null]);
  });

  it("refuses to guess between two near-identical target cards", () => {
    const a = result("10%", "faster exam times", "Shared summary text for both cards here.");
    const b = result("20%", "faster exam times", "Shared summary text for both cards here.");
    const src = result("15%", "faster exam times", "Shared summary text for both cards here.");
    expect(matchCards([src], [a, b]).pairs).toEqual([null]);
  });
});

describe("applyCardSelection", () => {
  const picks = (source, indexes) =>
    Object.fromEntries(indexes.map((i) => [i, source[i]]));

  it("replaces only the ticked card and leaves the others alone", () => {
    const source = [contrast, workflow, savingNordic];
    const localWorkflow = result("85 %", "locally edited teaser", "A usability study revealed that 85% of users believe the Azurion TSM control of HEMO visualizations improves workflow.");
    const target = [contrast, localWorkflow, savingUS];

    const out = applyCardSelection({ source, target, picks: picks(source, [2]) });

    expect(out.value).toEqual([contrast, localWorkflow, savingNordic]);
    expect(out.skipped).toEqual([]);
  });

  it("skips a ticked card the locale doesn't have, instead of re-adding it", () => {
    const source = [contrast, workflow, savingNordic];
    const target = [contrast, savingUS];

    const out = applyCardSelection({ source, target, picks: picks(source, [1, 2]) });

    expect(out.value).toEqual([contrast, savingNordic]);
    expect(out.skipped).toEqual([
      { card: 2, reason: "no matching card on this locale" },
    ]);
  });

  it("inserts a missing card after its source neighbour when addMissing is on", () => {
    const source = [contrast, workflow, savingNordic];
    const target = [contrast, savingUS];

    const out = applyCardSelection({
      source,
      target,
      picks: picks(source, [1]),
      addMissing: true,
    });

    expect(out.value).toEqual([contrast, workflow, savingUS]);
    expect(out.skipped).toEqual([]);
  });

  it("adds ticked cards to an empty target only when addMissing is on", () => {
    const source = [contrast, workflow];
    expect(
      applyCardSelection({ source, target: undefined, picks: picks(source, [1]) }).value,
    ).toBeUndefined();
    expect(
      applyCardSelection({ source, target: undefined, picks: picks(source, [1]), addMissing: true }).value,
    ).toEqual([workflow]);
  });

  it("skips a card whose source changed since it was ticked", () => {
    const source = [contrast, workflow];
    const out = applyCardSelection({
      source,
      target: [contrast, workflow],
      picks: { 1: savingUS },
    });
    expect(out.value).toEqual([contrast, workflow]);
    expect(out.skipped).toEqual([
      { card: 2, reason: "source card changed since it was ticked — reopen and retry" },
    ]);
  });
});
