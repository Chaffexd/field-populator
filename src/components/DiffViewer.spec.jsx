import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import DiffViewer from "./DiffViewer";

vi.mock("./DiffChecker", () => ({
  default: ({ diffTree }) => (
    <div data-test-id="diff-checker">{JSON.stringify(diffTree)}</div>
  ),
}));

describe("DiffViewer", () => {
  it("shows a loading indicator when loading", () => {
    render(<DiffViewer loading={true} error={null} diffData={null} />);
    expect(screen.getByTestId("diff-loading")).toBeInTheDocument();
  });

  it("shows an error message when error is set", () => {
    render(
      <DiffViewer loading={false} error="Something went wrong" diffData={null} />,
    );
    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
  });

  it("renders nothing when no diff and not loading", () => {
    const { container } = render(
      <DiffViewer loading={false} error={null} diffData={null} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders DiffChecker when diffData is present", () => {
    const tree = { fieldA: { type: "field", source: "a", target: "b" } };
    render(
      <DiffViewer
        loading={false}
        error={null}
        diffData={tree}
        spaceId="s"
        environmentId="e"
        entryId="id"
        selected={{}}
        onToggleField={() => {}}
        adoptAll={false}
        overwriteAll={false}
        overwriteSelected={{}}
        onToggleOverwrite={() => {}}
      />,
    );
    expect(screen.getByTestId("diff-checker")).toBeInTheDocument();
  });
});
