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

vi.mock("../components/DiffChecker", () => ({
  default: ({ diffTree }) => (
    <div data-test-id="diff-checker">
      Diff loaded: {diffTree?.summary ?? "none"}
    </div>
  ),
}));

const LOCALES = [
  { sys: { id: "l-en" }, code: "en", name: "English", default: true },
  { sys: { id: "l-jo" }, code: "en-JO", name: "English (Jordan)", default: false },
  { sys: { id: "l-jp" }, code: "ja-JP", name: "Japanese", default: false },
  { sys: { id: "l-ae" }, code: "en-AE", name: "English (UAE)", default: false },
];

function deferred() {
  let resolve;
  const promise = new Promise((r) => { resolve = r; });
  return { promise, resolve };
}

const pick = (index, value) =>
  fireEvent.change(screen.getAllByRole("combobox")[index], { target: { value } });

async function openWithPair(source, target) {
  render(<Dialog />);
  await waitFor(() => expect(mockCma.locale.getMany).toHaveBeenCalled());
  pick(0, source);
  pick(1, target);
}

const adoptButton = () =>
  screen.getAllByRole("button", { name: "Merge Source → Target" })[0];

beforeEach(() => {
  vi.clearAllMocks();
  buildDiffTreeMock.mockReset();
  adoptEntryTreeMock.mockReset();
  mockCma.locale.getMany.mockResolvedValue({ items: LOCALES });
  mockCma.entry.get.mockResolvedValue({ sys: { id: "entry-1" }, fields: {} });
});

describe("Dialog — stale diff results", () => {
  it("keeps the diff for the selected pair when an earlier, slower load finishes last", async () => {
    const japan = deferred();
    const jordan = deferred();
    buildDiffTreeMock.mockImplementation(({ targetLocale }) =>
      targetLocale === "ja-JP" ? japan.promise : jordan.promise,
    );

    await openWithPair("en", "ja-JP");
    await waitFor(() => expect(buildDiffTreeMock).toHaveBeenCalledTimes(1));

    pick(1, "en-JO");
    await waitFor(() => expect(buildDiffTreeMock).toHaveBeenCalledTimes(2));

    jordan.resolve({ summary: "Jordan content" });
    await screen.findByText("Diff loaded: Jordan content");

    japan.resolve({ summary: "Japanese content" });
    await new Promise((r) => setTimeout(r, 0));

    expect(screen.getByTestId("diff-checker")).toHaveTextContent("Jordan content");
    expect(screen.queryByText(/Japanese content/)).not.toBeInTheDocument();
  });
});

describe("Dialog — where adopt writes", () => {
  beforeEach(() => {
    buildDiffTreeMock.mockResolvedValue({ summary: "diff" });
    adoptEntryTreeMock.mockResolvedValue({
      changedFields: 1, updatedEntries: 1, traversedEntries: 1, failures: [],
    });
  });

  it("writes to the target locale plus the additional locales, and says so", async () => {
    await openWithPair("en", "en-JO");
    await screen.findByText("Diff loaded: diff");

    fireEvent.click(screen.getAllByLabelText("English (UAE) (en-AE)")[0]);
    expect(screen.getAllByTestId("write-targets")[0]).toHaveTextContent(
      "Will write to 2 locales: en-JO, en-AE",
    );

    fireEvent.click(screen.getAllByLabelText(/Merge all fields/i)[0]);
    fireEvent.click(adoptButton());

    await waitFor(() => expect(adoptEntryTreeMock).toHaveBeenCalledTimes(2));
    expect(adoptEntryTreeMock.mock.calls.map(([a]) => a.targetLocale)).toEqual([
      "en-JO",
      "en-AE",
    ]);
  });

  it("clears the additional locales when the target locale changes", async () => {
    await openWithPair("en", "en-JO");
    await screen.findByText("Diff loaded: diff");

    fireEvent.click(screen.getAllByLabelText("English (UAE) (en-AE)")[0]);
    pick(1, "ja-JP");
    await screen.findByText("Diff loaded: diff");

    expect(screen.getAllByTestId("write-targets")[0]).toHaveTextContent(
      "Will write to 1 locale: ja-JP",
    );
  });
});

describe("Dialog — adopt result reporting", () => {
  beforeEach(() => {
    buildDiffTreeMock.mockResolvedValue({ summary: "diff" });
  });

  async function adoptIntoJordanAndUae() {
    await openWithPair("en", "en-JO");
    await screen.findByText("Diff loaded: diff");
    fireEvent.click(screen.getAllByLabelText("English (UAE) (en-AE)")[0]);
    fireEvent.click(screen.getAllByLabelText(/Merge all fields/i)[0]);
    fireEvent.click(adoptButton());
  }

  it("reports per locale when one locale has entry failures", async () => {
    adoptEntryTreeMock.mockImplementation(async ({ targetLocale }) =>
      targetLocale === "en-JO"
        ? { changedFields: 3, updatedEntries: 2, traversedEntries: 3, failures: [] }
        : {
            changedFields: 1, updatedEntries: 1, traversedEntries: 3,
            failures: [{ entryId: "card-9", reason: "Size must be at most 50", requestId: "req-1" }],
          },
    );

    await adoptIntoJordanAndUae();

    const [report] = await screen.findAllByText(/1 of 2 locales had failures/);
    expect(report).toHaveTextContent("✓ en-JO: 3 fields across 2 entries");
    expect(report).toHaveTextContent(
      "✗ en-AE: 1 entry failed, 1 field across 1 entries saved",
    );
    expect(report).toHaveTextContent("card-9: Size must be at most 50 (Request ID: req-1)");
    expect(screen.getAllByText("Adoption partly failed").length).toBeGreaterThan(0);
  });

  it("carries on with the next locale when one locale throws", async () => {
    adoptEntryTreeMock.mockImplementation(async ({ targetLocale }) => {
      if (targetLocale === "en-JO") throw new Error("Network down");
      return { changedFields: 2, updatedEntries: 1, traversedEntries: 1, failures: [] };
    });

    await adoptIntoJordanAndUae();

    const [report] = await screen.findAllByText(/1 of 2 locales had failures/);
    expect(adoptEntryTreeMock).toHaveBeenCalledTimes(2);
    expect(report).toHaveTextContent("✗ en-JO: 1 entry failed");
    expect(report).toHaveTextContent("Network down");
    expect(report).toHaveTextContent("✓ en-AE: 2 fields across 1 entries");
  });

  it("shows success when the writes worked but the diff refresh failed", async () => {
    adoptEntryTreeMock.mockResolvedValue({
      changedFields: 2, updatedEntries: 1, traversedEntries: 1, failures: [],
    });
    await openWithPair("en", "en-JO");
    await screen.findByText("Diff loaded: diff");

    buildDiffTreeMock.mockRejectedValueOnce(new Error("refresh blew up"));
    fireEvent.click(screen.getAllByLabelText(/Merge all fields/i)[0]);
    fireEvent.click(adoptButton());

    await screen.findAllByText("Adopted 2 fields across 1 entries (en-JO).");
    expect(screen.getAllByText("Adoption complete").length).toBeGreaterThan(0);
    expect(screen.queryByText("Adoption failed")).not.toBeInTheDocument();
    await screen.findByText(/the diff could not be refreshed/);
  });
});
