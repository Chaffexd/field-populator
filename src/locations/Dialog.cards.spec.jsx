import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Dialog from "./Dialog";

const mockSdk = {
  cmaAdapter: {},
  ids: {
    app: "test-app",
    entry: "entry-1",
    environment: "master",
    space: "vvbytozt5evi",
  },
  parameters: {
    invocation: {
      entryId: "entry-1",
      environmentId: "master",
      spaceId: "vvbytozt5evi",
    },
  },
};

const mockCma = {
  locale: {
    getMany: vi.fn(),
  },
  entry: {
    get: vi.fn(),
  },
};

const buildDiffTreeMock = vi.fn();
const adoptEntryTreeMock = vi.fn();

vi.mock("@contentful/react-apps-toolkit", () => ({
  useSDK: () => mockSdk,
}));

vi.mock("../lib/contentful", () => ({
  cmaSDK: () => mockCma,
}));

vi.mock("../lib/buildDiffTree", () => ({
  buildDiffTree: (...args) => buildDiffTreeMock(...args),
}));

vi.mock("../lib/adoptTree", () => ({
  adoptEntryTree: (...args) => adoptEntryTreeMock(...args),
}));

vi.mock("@contentful/f36-multiselect", () => {
  const Multiselect = ({ children }) => (
    <div data-test-id="mock-multiselect">{children}</div>
  );

  Multiselect.Option = ({ label, value, onSelectItem, isChecked, isDisabled }) => (
    <label>
      <input
        type="checkbox"
        value={value}
        checked={Boolean(isChecked)}
        disabled={Boolean(isDisabled)}
        onChange={(event) => onSelectItem?.({ target: event.target })}
      />
      {label}
    </label>
  );

  return { Multiselect };
});

const LOCALES = [
  { sys: { id: "l-en" }, code: "en", name: "English", default: true },
  { sys: { id: "l-jo" }, code: "en-JO", name: "English (Jordan)", default: false },
  { sys: { id: "l-ae" }, code: "en-AE", name: "English (UAE)", default: false },
];

const card = (title, url) => ({ entryTitle: title, ctaUrl: url });
const azurion = card("Azurion", "/healthcare/product/HC1");
const intraSight = card("IntraSight", "/healthcare/product/HC2");
const intraSightNew = card("IntraSight new copy", "/healthcare/product/HC2");
const hemo = card("Hemo", "/healthcare/product/HC3");

const pick = (index, value) =>
  fireEvent.change(screen.getAllByRole("combobox")[index], { target: { value } });

beforeEach(() => {
  vi.clearAllMocks();
  mockCma.locale.getMany.mockResolvedValue({ items: LOCALES });
  mockCma.entry.get.mockResolvedValue({ sys: { id: "entry-1" }, fields: {} });
  // en-JO doesn't sell Hemo
  buildDiffTreeMock.mockResolvedValue({
    heroCards: {
      type: "field",
      isJson: true,
      source: [azurion, intraSightNew, hemo],
      target: [azurion, intraSight],
    },
  });
});

async function openJordan() {
  render(<Dialog />);
  await waitFor(() => expect(mockCma.locale.getMany).toHaveBeenCalled());
  pick(0, "en");
  pick(1, "en-JO");
  await screen.findByLabelText("Adopt heroCards card 2");
}

describe("Dialog — card-level adopt", () => {
  it("only allows ticking cards that differ, with no Same/Differs tags", async () => {
    await openJordan();

    expect(screen.queryByText("Same")).not.toBeInTheDocument();
    expect(screen.queryByText("Differs")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Adopt heroCards card 1")).toBeDisabled();
    expect(screen.getByLabelText("Adopt heroCards card 2")).toBeEnabled();
    expect(screen.getByTestId("card-target-heroCards-2")).toHaveTextContent(
      "Not on this locale",
    );
  });

  it("puts each card's checkbox on the target side", async () => {
    await openJordan();

    [0, 1, 2].forEach((i) => {
      const box = screen.getByLabelText(`Adopt heroCards card ${i + 1}`);
      expect(screen.getByTestId(`card-target-heroCards-${i}`)).toContainElement(box);
    });
  });

  it("adopts only the ticked card and reports locales that lack it", async () => {
    adoptEntryTreeMock.mockImplementation(async ({ targetLocale }) => ({
      changedFields: targetLocale === "en-JO" ? 1 : 0,
      updatedEntries: targetLocale === "en-JO" ? 1 : 0,
      traversedEntries: 1,
      failures: [],
      cardSkips:
        targetLocale === "en-AE"
          ? [{ entryId: "entry-1", fieldId: "heroCards", card: 2, reason: "no matching card on this locale" }]
          : [],
    }));
    await openJordan();

    fireEvent.click(screen.getByLabelText("Adopt heroCards card 2"));
    fireEvent.click(screen.getAllByLabelText("English (UAE) (en-AE)")[0]);
    fireEvent.click(screen.getAllByRole("button", { name: "Merge Source → Target" })[0]);

    await waitFor(() => expect(adoptEntryTreeMock).toHaveBeenCalledTimes(2));
    expect(adoptEntryTreeMock.mock.calls[0][0]).toMatchObject({
      targetLocale: "en-JO",
      adoptAll: false,
      overwriteAll: false,
      cardSelected: {
        "entry-1": { heroCards: { picks: { 1: intraSightNew }, addMissing: false } },
      },
    });

    const [report] = await screen.findAllByText(/Adopted 1 field/);
    expect(report).toHaveTextContent("✓ en-JO: 1 field across 1 entries");
    expect(report).toHaveTextContent(
      "↷ heroCards card 2 not written: no matching card on this locale",
    );
  });

  it("disables card ticks while Overwrite is on for the field", async () => {
    await openJordan();
    const overwrite = screen.getAllByLabelText("Overwrite")[0];
    fireEvent.click(overwrite);
    expect(screen.getByLabelText("Adopt heroCards card 2")).toBeDisabled();
    expect(screen.getByText(/Untick Overwrite to adopt individual cards/)).toBeInTheDocument();
  });

  it("offers Add where missing once a card is ticked", async () => {
    await openJordan();
    expect(screen.queryByLabelText(/Add where missing/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Adopt heroCards card 3"));
    fireEvent.click(screen.getByLabelText(/Add where missing/));
    fireEvent.click(screen.getAllByRole("button", { name: "Merge Source → Target" })[0]);
    await waitFor(() =>
      expect(adoptEntryTreeMock.mock.calls[0][0].cardSelected).toEqual({
        "entry-1": { heroCards: { picks: { 2: hemo }, addMissing: true } },
      }),
    );
  });
});
