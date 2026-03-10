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

describe("Dialog component", () => {
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

    mockCma.entry.get.mockResolvedValue({
      sys: {
        id: "entry-1",
      },
      fields: {},
    });

    buildDiffTreeMock
      .mockResolvedValueOnce({ summary: "initial diff" })
      .mockResolvedValueOnce({ summary: "refreshed diff" });

    adoptEntryTreeMock.mockResolvedValue({
      changedFields: 2,
      updatedEntries: 1,
      traversedEntries: 1,
    });
  });

  it("loads a diff and adopts changes from the dialog flow", async () => {
    render(<Dialog />);

    await waitFor(() =>
      expect(mockCma.locale.getMany).toHaveBeenCalledWith({
        environmentId: "master",
        spaceId: "vvbytozt5evi",
        query: { limit: 1000 },
      }),
    );

    fireEvent.change(screen.getAllByRole("combobox")[0], {
      target: { value: "en-US" },
    });
    fireEvent.change(screen.getAllByRole("combobox")[1], {
      target: { value: "en-GB" },
    });

    await waitFor(() =>
      expect(buildDiffTreeMock).toHaveBeenCalledWith(
        expect.objectContaining({
          entry: expect.objectContaining({ sys: { id: "entry-1" } }),
          cma: mockCma,
          sourceLocale: "en-US",
          targetLocale: "en-GB",
          defaultLocale: "en-US",
        }),
      ),
    );

    expect(screen.getByTestId("diff-checker")).toHaveTextContent(
      "Diff loaded: initial diff",
    );

    fireEvent.click(screen.getByRole("button", { name: "Adopt Source → Target" }));

    await waitFor(() =>
      expect(adoptEntryTreeMock).toHaveBeenCalledWith({
        cma: mockCma,
        entryId: "entry-1",
        environmentId: "master",
        spaceId: "vvbytozt5evi",
        sourceLocale: "en-US",
        targetLocale: "en-GB",
        defaultLocale: "en-US",
        selected: {},
        adoptAll: true,
        overwriteAll: false,
      }),
    );

    await waitFor(() =>
      expect(buildDiffTreeMock).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          sourceLocale: "en-US",
          targetLocale: "en-GB",
          defaultLocale: "en-US",
        }),
      ),
    );

    expect(
      screen.getByText("Adopted 2 fields across 1 entries (en-GB)."),
    ).toBeInTheDocument();
  });

  it("passes overwrite mode through the dialog when enabled", async () => {
    buildDiffTreeMock.mockReset();
    buildDiffTreeMock
      .mockResolvedValueOnce({ summary: "initial diff" })
      .mockResolvedValueOnce({ summary: "refreshed diff" });

    render(<Dialog />);

    await waitFor(() => expect(mockCma.locale.getMany).toHaveBeenCalled());

    fireEvent.change(screen.getAllByRole("combobox")[0], {
      target: { value: "en-US" },
    });
    fireEvent.change(screen.getAllByRole("combobox")[1], {
      target: { value: "en-GB" },
    });

    await waitFor(() => expect(buildDiffTreeMock).toHaveBeenCalled());

    fireEvent.click(screen.getByLabelText(/Overwrite all fields/i));
    fireEvent.click(screen.getByRole("button", { name: "Adopt Source → Target" }));

    await waitFor(() =>
      expect(adoptEntryTreeMock).toHaveBeenCalledWith(
        expect.objectContaining({
          overwriteAll: true,
          adoptAll: true,
          targetLocale: "en-GB",
        }),
      ),
    );
  });
});
