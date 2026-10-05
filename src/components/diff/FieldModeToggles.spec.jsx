import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FieldModeToggles } from "./FieldModeToggles";

function renderToggles(props = {}) {
  const onToggleField = vi.fn();
  const onToggleOverwrite = vi.fn();
  render(
    <FieldModeToggles
      entryId="entry-1"
      fieldKey="categoryUrl"
      selected={{}}
      overwriteSelected={{}}
      onToggleField={onToggleField}
      onToggleOverwrite={onToggleOverwrite}
      {...props}
    />,
  );
  return { onToggleField, onToggleOverwrite };
}

describe("FieldModeToggles", () => {
  it("has no Ignore option", () => {
    renderToggles();
    expect(screen.queryByLabelText("Ignore")).not.toBeInTheDocument();
  });

  it("shows Merge checked under Merge all", () => {
    renderToggles({ adoptAll: true });
    expect(screen.getByLabelText("Merge")).toBeChecked();
    expect(screen.getByLabelText("Overwrite")).not.toBeChecked();
  });

  it("shows only Overwrite checked, both disabled, under Overwrite all", () => {
    renderToggles({ adoptAll: true, overwriteAll: true });
    expect(screen.getByLabelText("Merge")).not.toBeChecked();
    expect(screen.getByLabelText("Overwrite")).toBeChecked();
    expect(screen.getByLabelText("Merge")).toBeDisabled();
    expect(screen.getByLabelText("Overwrite")).toBeDisabled();
  });

  it("calls the toggle handlers with the entry and field", () => {
    const { onToggleField, onToggleOverwrite } = renderToggles();
    fireEvent.click(screen.getByLabelText("Merge"));
    fireEvent.click(screen.getByLabelText("Overwrite"));
    expect(onToggleField).toHaveBeenCalledWith("entry-1", "categoryUrl", true);
    expect(onToggleOverwrite).toHaveBeenCalledWith("entry-1", "categoryUrl", true);
  });
});
