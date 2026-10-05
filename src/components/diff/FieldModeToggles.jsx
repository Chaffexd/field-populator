import React from "react";

const labelStyle = {
  display: "flex",
  gap: 6,
  alignItems: "center",
  fontSize: 12,
  color: "#444",
};

/**
 * Merge / Overwrite checkboxes for one field.
 */
export function FieldModeToggles({
  entryId,
  fieldKey,
  selected,
  adoptAll,
  overwriteAll,
  overwriteSelected,
  onToggleField,
  onToggleOverwrite,
}) {
  const overwriteChecked =
    overwriteAll || Boolean(overwriteSelected?.[entryId]?.has(fieldKey));
  const mergeChecked =
    !overwriteChecked &&
    (adoptAll || Boolean(selected?.[entryId]?.has(fieldKey)));

  return (
    <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
      <label style={labelStyle}>
        <input
          type="checkbox"
          checked={mergeChecked}
          disabled={overwriteAll}
          onChange={(e) => onToggleField(entryId, fieldKey, e.target.checked)}
        />
        Merge
      </label>
      <label style={labelStyle}>
        <input
          type="checkbox"
          checked={overwriteChecked}
          disabled={overwriteAll}
          onChange={(e) => onToggleOverwrite(entryId, fieldKey, e.target.checked)}
        />
        Overwrite
      </label>
    </div>
  );
}
