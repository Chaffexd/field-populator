import React from "react";
import { NodeRenderer } from "./diff/NodeRenderer";
import { CardSelectionContext } from "./diff/CardListDiff";

export default function DiffChecker({
  diffTree,
  spaceId,
  environmentId,
  entryId,
  selected,
  onToggleField,
  adoptAll,
  overwriteAll,
  overwriteSelected,
  onToggleOverwrite,
  cardSelected,
  onToggleCard,
  onToggleAddMissing,
  hiddenFields,
}) {
  if (!diffTree) return null;

  return (
    <CardSelectionContext.Provider
      value={{ cardSelected, onToggleCard, onToggleAddMissing }}
    >
    <div style={{ margin: 20 }}>
      {Object.entries(diffTree).map(([key, node]) => (
        <NodeRenderer
          key={key}
          fieldKey={key}
          node={node}
          level={0}
          spaceId={spaceId}
          environmentId={environmentId}
          entryId={entryId}
          selected={selected}
          onToggleField={onToggleField}
          adoptAll={adoptAll}
          overwriteAll={overwriteAll}
          overwriteSelected={overwriteSelected}
          onToggleOverwrite={onToggleOverwrite}
          hiddenFields={hiddenFields}
        />
      ))}
    </div>
    </CardSelectionContext.Provider>
  );
}
