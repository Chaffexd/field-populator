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
  locale: { getMany: vi.fn() },
  entry: { get: vi.fn() },
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

// DiffChecker mock that exposes onToggleOverwrite and onToggleField via buttons,
// and surfaces the current overwriteSelected state as a data attribute.
vi.mock("../components/DiffChecker", () => ({
  default: ({
    diffTree,
    onToggleOverwrite,
    onToggleField,
    overwriteSelected,
    adoptAll,
  }) => (
    <div
      data-test-id="diff-checker"
      data-overwrite-selected={JSON.stringify(
        Object.fromEntries(
          Object.entries(overwriteSelected ?? {}).map(([k, v]) => [
            k,
            Array.from(v),
          ]),
        ),
      )}
      data-adopt-all={String(adoptAll)}
    >
      Diff loaded: {diffTree?.summary ?? "none"}
      <button
        data-test-id="toggle-overwrite-body"
        onClick={() => onToggleOverwrite("entry-1", "body", true)}
      >
        Overwrite body
      </button>
      <button
        data-test-id="untoggle-merge-title"
        onClick={() => onToggleField("entry-1", "title", false)}
      >
        Untoggle merge title
      </button>
    </div>
  ),
}));

// Minimal set of fields returned by collectFields (via allFields state in Dialog)
// The diff tree mock only needs a summary string; collectFields is called on the real tree.
// We return a shape that collectFields will walk — a map with two field nodes.
function makeDiffTree() {
  return {
    title: { type: "field", source: "Source title", target: "" },
    body: { type: "field", source: "Source body", target: "Old body" },
  };
}

describe("Dialog — per-field overwrite (overwriteSelected)", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockCma.locale.getMany.mockResolvedValue({
      items: [
        {
          sys: { id: "locale-en-us" },
          code: "en-US",
          name: "English (United States)",
          default: true,
        },
        {
          sys: { id: "locale-en-gb" },
          code: "en-GB",
          name: "English (United Kingdom)",
          default: false,
        },
      ],
    });

    mockCma.entry.get.mockResolvedValue({ sys: { id: "entry-1" }, fields: {} });

    buildDiffTreeMock.mockResolvedValue(makeDiffTree());

    adoptEntryTreeMock.mockResolvedValue({
      changedFields: 1,
      updatedEntries: 1,
      traversedEntries: 1,
    });
  });

  async function renderAndSelectLocales() {
    render(<Dialog />);

    await waitFor(() => expect(mockCma.locale.getMany).toHaveBeenCalled());

    fireEvent.change(screen.getAllByRole("combobox")[0], {
      target: { value: "en-US" },
    });
    fireEvent.change(screen.getAllByRole("combobox")[1], {
      target: { value: "en-GB" },
    });

    await waitFor(() => expect(buildDiffTreeMock).toHaveBeenCalled());

    // Enable "Merge all fields" so there is at least one selection (required by new validation)
    fireEvent.click(screen.getAllByLabelText(/Merge all fields/i)[0]);
  }

  it("passes an empty overwriteSelected to adoptEntryTree by default", async () => {
    await renderAndSelectLocales();

    fireEvent.click(screen.getAllByRole("button", { name: "Merge Source → Target" })[0]);

    await waitFor(() =>
      expect(adoptEntryTreeMock).toHaveBeenCalledWith(
        expect.objectContaining({ adoptAll: true, overwriteSelected: {} }),
      ),
    );
  });

  it("passes the updated overwriteSelected map after onToggleOverwrite is called", async () => {
    await renderAndSelectLocales();

    // Simulate the user clicking "Overwrite" on the body field
    fireEvent.click(screen.getByTestId("toggle-overwrite-body"));

    fireEvent.click(screen.getAllByRole("button", { name: "Merge Source → Target" })[0]);

    await waitFor(() => {
      const call = adoptEntryTreeMock.mock.calls[0][0];
      const overwriteSet = call.overwriteSelected?.["entry-1"];
      expect(overwriteSet).toBeDefined();
      expect(overwriteSet.has("body")).toBe(true);
    });
  });

  it("removes a field from selected (merge) when it is added to overwriteSelected", async () => {
    await renderAndSelectLocales();

    // "body" starts in the merged set (adoptAll=true means all are merged).
    // Clicking "Overwrite body" should move body out of selected.
    fireEvent.click(screen.getByTestId("toggle-overwrite-body"));

    fireEvent.click(screen.getAllByRole("button", { name: "Merge Source → Target" })[0]);

    await waitFor(() => {
      const call = adoptEntryTreeMock.mock.calls[0][0];
      // body should not be in the merge selected map
      const mergeSet = call.selected?.["entry-1"];
      expect(mergeSet?.has("body")).toBeFalsy();
    });
  });

  it("clears overwriteSelected when the global 'Merge all fields' checkbox is re-enabled", async () => {
    await renderAndSelectLocales();

    // Clicking "Overwrite body" transitions out of adoptAll mode (sets adoptAll=false)
    fireEvent.click(screen.getByTestId("toggle-overwrite-body"));

    // The adoptAll checkbox is now unchecked — click once to re-enable it,
    // which should reset overwriteSelected back to {}
    fireEvent.click(screen.getAllByLabelText(/Merge all fields/i)[0]);

    fireEvent.click(screen.getAllByRole("button", { name: "Merge Source → Target" })[0]);

    await waitFor(() =>
      expect(adoptEntryTreeMock).toHaveBeenCalledWith(
        expect.objectContaining({
          adoptAll: true,
          overwriteSelected: {},
        }),
      ),
    );
  });

  it("clears overwriteSelected when the global 'Overwrite all fields' checkbox is enabled", async () => {
    await renderAndSelectLocales();

    // Mark body as per-field overwrite
    fireEvent.click(screen.getByTestId("toggle-overwrite-body"));

    // Enable global overwrite — this should clear per-field overwrite state
    fireEvent.click(screen.getAllByLabelText(/Overwrite all fields/i)[0]);

    fireEvent.click(screen.getAllByRole("button", { name: "Merge Source → Target" })[0]);

    await waitFor(() =>
      expect(adoptEntryTreeMock).toHaveBeenCalledWith(
        expect.objectContaining({
          overwriteAll: true,
          overwriteSelected: {},
        }),
      ),
    );
  });
});
