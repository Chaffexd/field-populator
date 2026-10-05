import React, { createContext, useContext, useMemo } from "react";
import { matchCards } from "../../lib/cardMatch";

/**
 * Card selection is provided by DiffChecker through context.
 * cardSelected: { [entryId]: { [fieldId]: { picks: { [index]: card }, addMissing } } }
 */
export const CardSelectionContext = createContext({
  cardSelected: {},
  onToggleCard: () => {},
  onToggleAddMissing: () => {},
});

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// Row tint only (no labels): grey = identical, amber = differs, blue = the
// target locale has no matching card.
const ROW_BACKGROUND = {
  same: "#f6f6f6",
  differs: "#fff7e0",
  missing: "#eef4ff",
  targetOnly: "#fafafa",
};

const headerStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 8,
  minHeight: 22,
  marginBottom: 6,
  fontSize: 12,
  color: "#666",
};

const placeholder = (text) => (
  <div
    style={{
      height: "100%",
      minHeight: 60,
      border: "1px dashed #ccc",
      borderRadius: 6,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      color: "#888",
      fontSize: 12,
      padding: 12,
      textAlign: "center",
    }}
  >
    {text}
  </div>
);

/**
 * Source/target card list with one checkbox per source card. Cards are paired
 * with the same matcher adopt uses, so what's shown here is what gets written
 * to this target locale (other bulk locales are matched on their own).
 */
export function CardListDiff({
  entryId,
  fieldKey,
  source,
  target,
  renderCard,
  disabledReason,
}) {
  const { cardSelected, onToggleCard, onToggleAddMissing } =
    useContext(CardSelectionContext);
  const choice = cardSelected?.[entryId]?.[fieldKey];
  const picks = choice?.picks || {};
  const pickedCount = Object.keys(picks).length;

  const { pairs } = useMemo(() => matchCards(source, target), [source, target]);
  const targetOnly = target
    .map((_, ti) => ti)
    .filter((ti) => !pairs.includes(ti));

  const rows = source.map((card, si) => {
    const ti = pairs[si];
    const status =
      ti === null ? "missing" : same(card, target[ti]) ? "same" : "differs";
    return { si, ti, card, status };
  });

  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div style={{ fontSize: 12, color: "#555" }}>
        {disabledReason ??
          "Tick individual cards to adopt. A ticked card replaces only its matching card on each target locale; other cards are left alone."}
      </div>

      {rows.map(({ si, ti, card, status }) => {
        const checked = Boolean(picks[si]);
        const disabled = Boolean(disabledReason) || status === "same";
        // The tick sits on the target side, top right, like the field-level
        // Merge / Overwrite boxes.
        const toggle = (
          <label
            data-test-id={`card-toggle-${fieldKey}-${si}`}
            title={
              status === "same"
                ? "Identical on this locale, nothing to adopt"
                : undefined
            }
            style={{ display: "flex", gap: 6, alignItems: "center", color: "#444" }}
          >
            <input
              type="checkbox"
              aria-label={`Adopt ${fieldKey} card ${si + 1}`}
              checked={checked}
              disabled={disabled}
              onChange={(e) =>
                onToggleCard(entryId, fieldKey, si, card, e.target.checked)
              }
            />
            Adopt
          </label>
        );
        return (
          <div
            key={`s-${si}`}
            data-test-id={`card-row-${fieldKey}-${si}`}
            style={{
              display: "flex",
              gap: 12,
              padding: 8,
              borderRadius: 6,
              background: ROW_BACKGROUND[status],
              outline: checked ? "2px solid #0059C8" : "none",
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={headerStyle}>
                <strong style={{ color: "#333" }}>Card {si + 1}</strong>
              </div>
              {renderCard(card)}
            </div>
            <div
              data-test-id={`card-target-${fieldKey}-${si}`}
              style={{ flex: 1, minWidth: 0 }}
            >
              <div style={headerStyle}>
                <span>
                  {ti === null ? "Not on this locale" : `Target card ${ti + 1}`}
                </span>
                {toggle}
              </div>
              {ti === null
                ? placeholder(
                    "No matching card on this locale. A ticked card is skipped here unless “Add where missing” is on.",
                  )
                : renderCard(target[ti])}
            </div>
          </div>
        );
      })}

      {targetOnly.map((ti) => (
        <div
          key={`t-${ti}`}
          style={{
            display: "flex",
            gap: 12,
            padding: 8,
            borderRadius: 6,
            background: ROW_BACKGROUND.targetOnly,
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            {placeholder("Not in source. This target card is kept as it is.")}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={headerStyle}>
              <span>Target card {ti + 1}</span>
            </div>
            {renderCard(target[ti])}
          </div>
        </div>
      ))}

      {pickedCount > 0 && !disabledReason && (
        <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12 }}>
          <input
            type="checkbox"
            checked={Boolean(choice?.addMissing)}
            onChange={(e) =>
              onToggleAddMissing(entryId, fieldKey, e.target.checked)
            }
          />
          Add where missing — also insert ticked cards into locales that don’t have
          them (leave off if cards were removed on purpose)
        </label>
      )}
    </div>
  );
}
