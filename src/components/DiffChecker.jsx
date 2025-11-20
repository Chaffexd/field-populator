import React, { useState } from "react";
import { diff_match_patch } from "diff-match-patch";

const dmp = new diff_match_patch();

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * LEFT (Source): highlight what's in Source but NOT in Target.
 * That's op === -1 (DELETE segments) when diff = diff_main(source, target).
 * We render those as GREEN inserts on the source side.
 */
function renderDiffHtmlSourceGreen(source = "", target = "") {
  const diffs = dmp.diff_main(source, target);
  dmp.diff_cleanupSemantic(diffs);

  return diffs
    .map(([op, text]) => {
      if (op === 0) return `<span>${escapeHtml(text)}</span>`; // equal
      if (op === -1) {
        // present in Source, missing in Target → show as green on Source
        return `<ins style="background:#e6ffed;text-decoration:none;">${escapeHtml(
          text
        )}</ins>`;
      }
      // op === 1 (insert in target) → hide on Source side
      return "";
    })
    .join("");
}

/**
 * RIGHT (Target): highlight what's in Target but NOT in Source.
 * That's op === 1 (INSERT segments) when diff = diff_main(source, target).
 * We render those as RED on the target side.
 */
function renderDiffHtmlTargetRed(source = "", target = "") {
  const diffs = dmp.diff_main(source, target);
  dmp.diff_cleanupSemantic(diffs);

  return diffs
    .map(([op, text]) => {
      if (op === 0) return `<span>${escapeHtml(text)}</span>`; // equal
      if (op === 1) {
        // present in Target, missing in Source → show as red on Target
        return `<del style="background:#ffeef0;">${escapeHtml(text)}</del>`;
      }
      // op === -1 (delete from source) → hide on Target side
      return "";
    })
    .join("");
}

const fieldBoxStyle = {
  padding: "8px",
  backgroundColor: "#fafafa",
  border: "1px solid #eee",
  borderRadius: "4px",
  whiteSpace: "pre-wrap",
  fontFamily: "monospace",
  fontSize: "13px",
};

function buildFieldUrl({ spaceId, environmentId, entryId, fieldKey }) {
  if (!spaceId || !environmentId || !entryId) return undefined;
  return `https://app.contentful.com/spaces/${spaceId}/environments/${environmentId}/entries/${entryId}?focusedField=${encodeURIComponent(
    fieldKey
  )}`;
}

/**
 * Try to parse an "asset JSON" value of the shape:
 * {
 *   "altText": "...",
 *   "assetUrl": "https://...",
 *   ...
 * }
 */
function parseAssetFromString(value) {
  if (!value || typeof value !== "string") return null;

  try {
    const json = JSON.parse(value);

    if (json && typeof json === "object") {
      if (
        json.assetUrl &&
        typeof json.assetUrl === "string" &&
        json.assetUrl.length > 0
      ) {
        return {
          isImage: true,
          url: json.assetUrl,
          alt: json.altText || "",
        };
      }
    }
  } catch {
    // Not JSON or not in expected shape – ignore
  }

  return null;
}

/**
 * Recursive node renderer
 * - field nodes: left=green source-only, right=red target-only
 * - reference nodes: collapsible; children link to the referenced entry's fields
 * - reference-list nodes: wrapper for arrays of entry references
 * - adds a checkbox to adopt this field (granular control)
 */
function NodeRenderer({
  fieldKey,
  node,
  level = 0,
  spaceId,
  environmentId,
  entryId, // the entry id whose fields we're linking to at this level
  selected,
  onToggleField,
  adoptAll,
}) {
  const indentStyle = { marginLeft: `${level * 20}px` };

  // ---------------- FIELD NODE ----------------
  if (node.type === "field") {
    const changed = node.source !== node.target;
    const fieldUrl = buildFieldUrl({
      spaceId,
      environmentId,
      entryId,
      fieldKey,
    });

    const selectedSet = selected?.[entryId];
    const explicitlySelected = Boolean(
      selectedSet && selectedSet.has(fieldKey)
    );
    const checked = adoptAll ? true : explicitlySelected;

    // Image support:
    // 1) explicit isImage from buildDiffTree (asset links)
    // 2) inferred from JSON (assetUrl)
    const sourceAsset = parseAssetFromString(node.source);
    const targetAsset = parseAssetFromString(node.target);
    const hasJsonImage = Boolean(sourceAsset || targetAsset);
    const hasAssetLinkImage = Boolean(node.isImage);
    const isImageField = hasAssetLinkImage || hasJsonImage;

    const sourceImageUrl =
      hasAssetLinkImage && node.sourceImageUrl
        ? node.sourceImageUrl
        : sourceAsset?.url;
    const targetImageUrl =
      hasAssetLinkImage && node.targetImageUrl
        ? node.targetImageUrl
        : targetAsset?.url;
    const sourceAlt =
      (hasAssetLinkImage ? fieldKey : sourceAsset?.alt) || fieldKey;
    const targetAlt =
      (hasAssetLinkImage ? fieldKey : targetAsset?.alt) || fieldKey;

    return (
      <div
        key={fieldKey}
        style={{
          marginBottom: 15,
          padding: 10,
          border: "1px solid #ddd",
          borderRadius: 6,
          backgroundColor: changed ? "#fffef8" : "#f6f6f6",
          ...indentStyle,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 8,
            gap: 12,
          }}
        >
          <strong style={{ display: "block" }}>
            {fieldUrl ? (
              <a href={fieldUrl} target="_blank" rel="noopener noreferrer">
                {fieldKey}
              </a>
            ) : (
              fieldKey
            )}
          </strong>

          <label
            style={{
              display: "flex",
              gap: 6,
              alignItems: "center",
              fontSize: 12,
              color: "#444",
            }}
          >
            <input
              type="checkbox"
              checked={checked}
              onChange={(e) =>
                onToggleField(entryId, fieldKey, e.target.checked)
              }
            />
            {checked ? "Adopt this field" : "Do not adopt this field"}
          </label>
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          {/* LEFT = SOURCE (green for Source-only segments) */}
          <div style={{ flex: 1 }}>
            <em style={{ display: "block", marginBottom: 4, color: "#666" }}>
              Source
            </em>
            {isImageField ? (
              <div style={{ ...fieldBoxStyle, textAlign: "center" }}>
                {sourceImageUrl ? (
                  <img
                    src={sourceImageUrl}
                    alt={sourceAlt}
                    style={{
                      maxWidth: "100%",
                      maxHeight: 200,
                      objectFit: "contain",
                      borderRadius: 4,
                    }}
                  />
                ) : (
                  <span>(no image)</span>
                )}
              </div>
            ) : (
              <div style={fieldBoxStyle}>
                {node.source === "" ? (
                  "(empty)"
                ) : (
                  <span
                    dangerouslySetInnerHTML={{
                      __html: renderDiffHtmlSourceGreen(
                        node.source,
                        node.target
                      ),
                    }}
                  />
                )}
              </div>
            )}
          </div>

          {/* RIGHT = TARGET (red for Target-only segments) */}
          <div style={{ flex: 1 }}>
            <em style={{ display: "block", marginBottom: 4, color: "#666" }}>
              Target
            </em>
            {isImageField ? (
              <div style={{ ...fieldBoxStyle, textAlign: "center" }}>
                {targetImageUrl ? (
                  <img
                    src={targetImageUrl}
                    alt={targetAlt}
                    style={{
                      maxWidth: "100%",
                      maxHeight: 200,
                      objectFit: "contain",
                      borderRadius: 4,
                    }}
                  />
                ) : (
                  <span>(no image)</span>
                )}
              </div>
            ) : (
              <div style={fieldBoxStyle}>
                {node.target === "(empty)" ? (
                  "(empty)"
                ) : (
                  <span
                    dangerouslySetInnerHTML={{
                      __html: renderDiffHtmlTargetRed(node.source, node.target),
                    }}
                  />
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ---------------- REFERENCE-LIST NODE (Array of entry links) ----------------
  if (node.type === "reference-list") {
    return (
      <div style={{ ...indentStyle, marginBottom: 10 }}>
        <strong style={{ display: "block", marginBottom: 6 }}>
          {fieldKey}
        </strong>
        <div style={{ display: "grid", gap: 8 }}>
          {Object.entries(node.children).map(([childEntryId, childNode]) => (
            <CollapsibleReference
              key={childEntryId}
              fieldKey={childEntryId}
              node={childNode}
              level={level + 1}
              spaceId={spaceId}
              environmentId={environmentId}
              entryId={childNode.linkEntryId || childEntryId}
              selected={selected}
              onToggleField={onToggleField}
              adoptAll={adoptAll}
            />
          ))}
        </div>
      </div>
    );
  }

  // ---------------- SINGLE REFERENCE NODE ----------------
  if (node.type === "reference") {
    return (
      <CollapsibleReference
        key={fieldKey}
        fieldKey={fieldKey}
        node={node}
        level={level}
        spaceId={spaceId}
        environmentId={environmentId}
        // children should link to the referenced entry’s fields
        entryId={node.linkEntryId || node.id}
        selected={selected}
        onToggleField={onToggleField}
        adoptAll={adoptAll}
      />
    );
  }

  return null;
}

function CollapsibleReference({
  fieldKey,
  node,
  level,
  spaceId,
  environmentId,
  entryId, // for children inside this reference
  selected,
  onToggleField,
  adoptAll,
}) {
  const [expanded, setExpanded] = useState(false);
  const indentStyle = { marginLeft: `${level * 20}px` };
  const childCount = Object.keys(node.children).length;

  return (
    <div key={fieldKey} style={{ ...indentStyle, marginBottom: 10 }}>
      <div
        onClick={() => setExpanded(!expanded)}
        style={{
          fontWeight: "bold",
          marginBottom: expanded ? 8 : 0,
          padding: "6px 10px",
          background: "#f0f4f8",
          borderRadius: 4,
          border: "1px solid #ddd",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <span>
          {expanded ? "▼" : "▶"} {fieldKey} → [Reference: {node.id}]
        </span>
        <span style={{ fontWeight: 400, fontSize: "0.85em", color: "#666" }}>
          {childCount} {childCount === 1 ? "field" : "fields"}
        </span>
      </div>

      {expanded && (
        <div style={{ marginTop: 4 }}>
          {Object.entries(node.children).map(([childKey, childNode]) => (
            <NodeRenderer
              key={childKey}
              fieldKey={childKey}
              node={childNode}
              level={level + 1}
              spaceId={spaceId}
              environmentId={environmentId}
              entryId={entryId} // referenced entry id for child field links
              selected={selected}
              onToggleField={onToggleField}
              adoptAll={adoptAll}
            />
          ))}
        </div>
      )}
    </div>
  );
}

const DiffChecker = ({
  diffTree,
  spaceId,
  environmentId,
  entryId,
  selected,
  onToggleField,
  adoptAll,
}) => {
  if (!diffTree) return <div style={{ margin: 20 }}>Loading diffs…</div>;

  return (
    <div style={{ margin: 20 }}>
      {Object.entries(diffTree).map(([key, node]) => (
        <NodeRenderer
          key={key}
          fieldKey={key}
          node={node}
          spaceId={spaceId}
          environmentId={environmentId}
          entryId={entryId}
          selected={selected}
          onToggleField={onToggleField}
          adoptAll={adoptAll}
        />
      ))}
    </div>
  );
};

export default DiffChecker;
