import React, { useState } from "react";
import { diff_match_patch } from "diff-match-patch";
import { Pill, Stack, EntryCard } from "@contentful/f36-components";
import { documentToReactComponents } from "@contentful/rich-text-react-renderer";

const dmp = new diff_match_patch();

function extractTags(raw) {
  if (!raw) return [];

  let value = raw;

  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw);
    } catch {
      return [];
    }
  }

  if (!value || typeof value !== "object") return [];

  return [
    ...(value.productTags || []),
    ...(value.typeTags || []),
    ...(value.topicTags || []),
  ].filter((t) => t && t.id && t.title);
}

function TagRenderer({
  fieldKey,
  node,
  level,
  spaceId,
  environmentId,
  entryId,
  selected,
  onToggleField,
  adoptAll,
}) {
  const indentStyle = { marginLeft: `${level * 20}px` };

  const sourceTags = extractTags(node.source);
  const targetTags = extractTags(node.target);

  const hasChanged = JSON.stringify(sourceTags) !== JSON.stringify(targetTags);

  const selectedSet = selected?.[entryId];
  const explicitlySelected = Boolean(selectedSet && selectedSet.has(fieldKey));
  const checked = adoptAll ? true : explicitlySelected;

  return (
    <div
      key={fieldKey}
      style={{
        marginBottom: 15,
        padding: 10,
        border: "1px solid #ddd",
        borderRadius: 6,
        backgroundColor: hasChanged ? "#fffef8" : "#f6f6f6",
        ...indentStyle,
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 8,
        }}
      >
        <strong>{fieldKey}</strong>

        <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <input
            type="checkbox"
            checked={checked}
            onChange={(e) => onToggleField(entryId, fieldKey, e.target.checked)}
          />
          {checked ? "Adopt this field" : "Do not adopt this field"}
        </label>
      </div>

      <div style={{ display: "flex", gap: 12 }}>
        {/* Source */}
        <div style={{ flex: 1 }}>
          <em style={{ color: "#666", marginBottom: 4, display: "block" }}>
            Source
          </em>

          {sourceTags.length === 0 ? (
            "(empty)"
          ) : (
            <Stack flexDirection="row" flexWrap="wrap" gap="spacingXs">
              {sourceTags.map((tag) => (
                <Pill key={tag.id} label={tag.title} />
              ))}
            </Stack>
          )}
        </div>

        {/* Target */}
        <div style={{ flex: 1 }}>
          <em style={{ color: "#666", marginBottom: 4, display: "block" }}>
            Target
          </em>

          {targetTags.length === 0 ? (
            "(empty)"
          ) : (
            <Stack flexDirection="row" flexWrap="wrap" gap="spacingXs">
              {targetTags.map((tag) => (
                <Pill key={tag.id} label={tag.title} />
              ))}
            </Stack>
          )}
        </div>
      </div>
    </div>
  );
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

const JSON_FIELDS = {
  demonstratedResults: "demonstratedResults",
  features: "features",
  imageGallery: "imageGallery",
  featuredProducts: "featuredProducts",
  relatedProducts: "relatedProducts",
};

function parseJsonOnce(raw) {
  if (!raw || raw === "(empty)") return null;
  if (typeof raw === "object") return raw;

  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function DemonstratedResults({ value }) {
  if (!Array.isArray(value)) return null;

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {value.map((item, i) => (
        <div key={i} style={{ border: "1px solid #eee", padding: 12 }}>
          {item.statistics && (
            <strong>{documentToReactComponents(item.statistics)}</strong>
          )}

          {item.teaser && documentToReactComponents(item.teaser)}
          {item.summary && documentToReactComponents(item.summary)}

          {item.result?.assetUrl && (
            <a href={item.result.assetUrl} target="_blank" rel="noreferrer">
              📎 {item.result.assetName || "Download asset"}
            </a>
          )}

          {item.ctaUrl && (
            <div>
              👉 <a href={item.ctaUrl}>Read more</a>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function Features({ value }) {
  if (!Array.isArray(value)) return null;

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {value.map((f, i) => (
        <div key={i}>
          {f.subhead && <h4>{documentToReactComponents(f.subhead)}</h4>}

          {f.text && documentToReactComponents(f.text)}

          {f.heroImage?.assetUrl && (
            <img
              src={f.heroImage.assetUrl}
              alt={f.heroImage.altText}
              style={{ maxWidth: "100%" }}
            />
          )}
        </div>
      ))}
    </div>
  );
}

function ImageGallery({ value }) {
  if (!Array.isArray(value)) return null;

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(2, 1fr)",
        gap: 12,
      }}
    >
      {value.map((img, i) => (
        <figure key={i}>
          <img src={img.assetUrl} alt={img.altText} />
          {img.caption && documentToReactComponents(img.caption)}
        </figure>
      ))}
    </div>
  );
}

function ProductList({ value }) {
  if (!Array.isArray(value)) return null;

  return (
    <ul>
      {value.map((p) => (
        <li key={p.id}>
          {p.title} ({p.ctn})
        </li>
      ))}
    </ul>
  );
}

function getRelatedEntryCardText(entry) {
  const isTemplate =
    typeof entry.type === "string" &&
    entry.type.toLowerCase().startsWith("template");

  const baseTitle =
    entry.navigationTitle ||
    entry.slug ||
    `${entry.type || "Item"} – ${entry.id}`;

  const title = isTemplate ? `Template – ${baseTitle}` : baseTitle;

  const description = entry.navigationDescription || entry.type || entry.id;

  return { title, description };
}

/* -------------------------------------------------------------------------- */
/*                            🔥 ADDED — pill utils                           */
/* -------------------------------------------------------------------------- */

function extractFrontendTags(raw) {
  if (!raw) return [];

  let json;
  try {
    json = JSON.parse(raw);
  } catch {
    return [];
  }

  return Object.values(json)
    .filter((v) => Array.isArray(v))
    .flat()
    .filter((item) => item && item.title);
}

function pillVariant(tag, sourceTags, targetTags) {
  const inSource = sourceTags.some((t) => t.id === tag.id);
  const inTarget = targetTags.some((t) => t.id === tag.id);

  if (inSource && !inTarget) return "positive"; // green
  if (!inSource && inTarget) return "negative"; // red
  return "secondary"; // unchanged
}

/* -------------------------------------------------------------------------- */
/*                      🔥 ADDED — custom frontendTags renderer               */
/* -------------------------------------------------------------------------- */

function FrontendTagsRenderer({
  fieldKey,
  node,
  level,
  spaceId,
  environmentId,
  entryId,
  selected,
  onToggleField,
  adoptAll,
}) {
  const indentStyle = { marginLeft: `${level * 20}px` };

  const sourceTags = extractFrontendTags(node.source);
  const targetTags = extractFrontendTags(node.target);

  const fieldUrl =
    spaceId && environmentId && entryId
      ? `https://app.contentful.com/spaces/${spaceId}/environments/${environmentId}/entries/${entryId}?focusedField=${encodeURIComponent(
          fieldKey
        )}`
      : null;

  const selectedSet = selected?.[entryId];
  const explicitlySelected = Boolean(selectedSet && selectedSet.has(fieldKey));
  const checked = adoptAll ? true : explicitlySelected;

  return (
    <div
      key={fieldKey}
      style={{
        marginBottom: 15,
        padding: 10,
        border: "1px solid #ddd",
        borderRadius: 6,
        backgroundColor:
          JSON.stringify(node.source) !== JSON.stringify(node.target)
            ? "#fffef8"
            : "#f6f6f6",
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
        <strong>
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
            onChange={(e) => onToggleField(entryId, fieldKey, e.target.checked)}
          />
          {checked ? "Adopt this field" : "Do not adopt this field"}
        </label>
      </div>

      <div style={{ display: "flex", gap: 10 }}>
        {/* Source */}
        <div style={{ flex: 1 }}>
          <em style={{ display: "block", marginBottom: 4, color: "#666" }}>
            Source
          </em>

          {sourceTags.length === 0 ? (
            <div style={{ padding: 8, fontFamily: "monospace" }}>(empty)</div>
          ) : (
            <Stack flexDirection="row" flexWrap="wrap" gap="spacingXs">
              {sourceTags.map((t) => (
                <Pill
                  key={t.id}
                  label={t.title}
                  variant={pillVariant(t, sourceTags, targetTags)}
                />
              ))}
            </Stack>
          )}
        </div>

        {/* Target */}
        <div style={{ flex: 1 }}>
          <em style={{ display: "block", marginBottom: 4, color: "#666" }}>
            Target
          </em>

          {targetTags.length === 0 ? (
            <div style={{ padding: 8, fontFamily: "monospace" }}>(empty)</div>
          ) : (
            <Stack flexDirection="row" flexWrap="wrap" gap="spacingXs">
              {targetTags.map((t) => (
                <Pill
                  key={t.id}
                  label={t.title}
                  variant={pillVariant(t, sourceTags, targetTags)}
                />
              ))}
            </Stack>
          )}
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*          🔥 ADDED — helpers & renderer for relatedProductportfolio         */
/* -------------------------------------------------------------------------- */

function extractRelatedProducts(raw) {
  if (!raw) return [];

  let value = raw;

  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw);
    } catch {
      return [];
    }
  }

  if (!Array.isArray(value)) return [];

  return value.filter((item) => item && item.id);
}

function relatedCardVariant(entry, sourceEntries, targetEntries) {
  const inSource = sourceEntries.some((e) => e.id === entry.id);
  const inTarget = targetEntries.some((e) => e.id === entry.id);

  if (inSource && !inTarget) return "positive";
  if (!inSource && inTarget) return "negative";
  return "secondary";
}

function RelatedProductPortfolioRenderer({
  fieldKey,
  node,
  level,
  spaceId,
  environmentId,
  entryId,
  selected,
  onToggleField,
  adoptAll,
}) {
  const indentStyle = { marginLeft: `${level * 20}px` };

  const sourceEntries = extractRelatedProducts(node.source);
  const targetEntries = extractRelatedProducts(node.target);

  const fieldUrl =
    spaceId && environmentId && entryId
      ? `https://app.contentful.com/spaces/${spaceId}/environments/${environmentId}/entries/${entryId}?focusedField=${encodeURIComponent(
          fieldKey
        )}`
      : null;

  const selectedSet = selected?.[entryId];
  const explicitlySelected = Boolean(selectedSet && selectedSet.has(fieldKey));
  const checked = adoptAll ? true : explicitlySelected;

  const renderEntryCard = (entry) => {
    const entryUrl =
      spaceId && environmentId
        ? `https://app.contentful.com/spaces/${spaceId}/environments/${environmentId}/entries/${entry.id}`
        : null;

    const { title, description } = getRelatedEntryCardText(entry);

    return (
      <EntryCard
        key={entry.id}
        title={title}
        description={description}
        size="small"
      />
    );
  };

  const hasChanged =
    JSON.stringify(sourceEntries) !== JSON.stringify(targetEntries);

  return (
    <div
      key={fieldKey}
      style={{
        marginBottom: 15,
        padding: 10,
        border: "1px solid #ddd",
        borderRadius: 6,
        backgroundColor: hasChanged ? "#fffef8" : "#f6f6f6",
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
        <strong>
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
            onChange={(e) => onToggleField(entryId, fieldKey, e.target.checked)}
          />
          {checked ? "Adopt this field" : "Do not adopt this field"}
        </label>
      </div>

      <div style={{ display: "flex", gap: 10 }}>
        <div style={{ flex: 1 }}>
          <em style={{ display: "block", marginBottom: 4, color: "#666" }}>
            Source
          </em>
          {sourceEntries.length === 0 ? (
            <div style={{ padding: 8, fontFamily: "monospace" }}>(empty)</div>
          ) : (
            sourceEntries.map((entry) => renderEntryCard(entry))
          )}
        </div>

        <div style={{ flex: 1 }}>
          <em style={{ display: "block", marginBottom: 4, color: "#666" }}>
            Target
          </em>
          {targetEntries.length === 0 ? (
            <div style={{ padding: 8, fontFamily: "monospace" }}>(empty)</div>
          ) : (
            targetEntries.map((entry) =>
              renderEntryCard(
                entry,
                relatedCardVariant(entry, sourceEntries, targetEntries)
              )
            )
          )}
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                          🔥 NEW — extractMainImageAsset                    */
/* -------------------------------------------------------------------------- */
function extractMainImageAsset(raw) {
  if (!raw) return null;

  let value = raw;

  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw);
    } catch {
      return null;
    }
  }

  if (!value || typeof value !== "object") return null;

  const url =
    value.assetUrlCoverImg ||
    value.assetUrl ||
    value.targetUrl ||
    value.tabletRendition ||
    value.mobileRenditionSm ||
    value.mobileRenditionXs ||
    "";

  return {
    url: url || "",
    alt: value.altText || "",
    type: value.assetType || "",
    youtubeID: value.youtubeID || "",
    name: value.assetNameCoverImg || value.assetName || "",
  };
}

/* -------------------------------------------------------------------------- */
/*                          🔥 NEW — MainImageAssetRenderer                   */
/* -------------------------------------------------------------------------- */
function MainImageAssetRenderer({
  fieldKey,
  node,
  level,
  spaceId,
  environmentId,
  entryId,
  selected,
  onToggleField,
  adoptAll,
}) {
  const indentStyle = { marginLeft: `${level * 20}px` };

  const source = extractMainImageAsset(node.source);
  const target = extractMainImageAsset(node.target);

  const fieldUrl =
    spaceId && environmentId && entryId
      ? `https://app.contentful.com/spaces/${spaceId}/environments/${environmentId}/entries/${entryId}?focusedField=${encodeURIComponent(
          fieldKey
        )}`
      : null;

  const changed = JSON.stringify(source) !== JSON.stringify(target);

  const selectedSet = selected?.[entryId];
  const explicitlySelected = Boolean(selectedSet && selectedSet.has(fieldKey));
  const checked = adoptAll ? true : explicitlySelected;

  const renderCard = (asset) => {
    if (!asset || !asset.url) {
      return <div style={fieldBoxStyle}>(empty)</div>;
    }

    return (
      <div
        style={{
          ...fieldBoxStyle,
          textAlign: "center",
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        {asset.youtubeID ? (
          <div
            style={{
              background: "#000",
              color: "#fff",
              padding: 8,
              borderRadius: 4,
            }}
          >
            🎥 Video (YouTube ID: {asset.youtubeID})
          </div>
        ) : (
          <img
            src={asset.url}
            alt={asset.alt}
            style={{
              maxWidth: "100%",
              maxHeight: 200,
              objectFit: "contain",
              borderRadius: 4,
            }}
          />
        )}

        {asset.alt && (
          <div style={{ fontSize: 12, color: "#666" }}>
            <strong>Alt:</strong> {asset.alt}
          </div>
        )}

        {asset.name && (
          <div style={{ fontSize: 12, color: "#666" }}>
            <strong>Name:</strong> {asset.name}
          </div>
        )}
      </div>
    );
  };

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
          marginBottom: 8,
        }}
      >
        <strong>
          {fieldUrl ? (
            <a href={fieldUrl} target="_blank" rel="noopener noreferrer">
              {fieldKey}
            </a>
          ) : (
            fieldKey
          )}
        </strong>

        <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <input
            type="checkbox"
            checked={checked}
            onChange={(e) => onToggleField(entryId, fieldKey, e.target.checked)}
          />
          {checked ? "Adopt this field" : "Do not adopt this field"}
        </label>
      </div>

      <div style={{ display: "flex", gap: 10 }}>
        <div style={{ flex: 1 }}>
          <em style={{ color: "#666", marginBottom: 4, display: "block" }}>
            Source
          </em>
          {renderCard(source)}
        </div>

        <div style={{ flex: 1 }}>
          <em style={{ color: "#666", marginBottom: 4, display: "block" }}>
            Target
          </em>
          {renderCard(target)}
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                             ORIGINAL BELOW                                 */
/* -------------------------------------------------------------------------- */

function renderDiffHtmlSourceGreen(source = "", target = "") {
  const diffs = dmp.diff_main(source, target);
  dmp.diff_cleanupSemantic(diffs);

  return diffs
    .map(([op, text]) => {
      if (op === 0) return `<span>${escapeHtml(text)}</span>`;
      if (op === -1) {
        return `<ins style="background:#e6ffed;text-decoration:none;">${escapeHtml(
          text
        )}</ins>`;
      }
      return "";
    })
    .join("");
}

function renderDiffHtmlTargetRed(source = "", target = "") {
  const diffs = dmp.diff_main(source, target);
  dmp.diff_cleanupSemantic(diffs);

  return diffs
    .map(([op, text]) => {
      if (op === 0) {
        return `<span>${escapeHtml(text)}</span>`;
      }

      if (op === 1) {
        return `<span style="background:#ffeef0;">${escapeHtml(text)}</span>`;
      }

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
  } catch {}

  return null;
}

function NodeRenderer({
  fieldKey,
  node,
  level = 0,
  spaceId,
  environmentId,
  entryId,
  selected,
  onToggleField,
  adoptAll,
}) {
  const indentStyle = { marginLeft: `${level * 20}px` };

  /* ---------------------------------------------------------------------- */
  /* 🔥 HIDE THESE FIELDS COMPLETELY (VISUALLY ONLY)                        */
  /* ---------------------------------------------------------------------- */
  const hiddenFields = new Set([
    "poolpartyTagIDs",
    "LocaleValidation",
    "localeValidation",
    "globaltolocal",
  ]);
  if (hiddenFields.has(fieldKey)) {
    return null;
  }

  /* ---------------------------------------------------------------------- */
  /* 🔥 CUSTOM RENDERERS                                                    */
  /* ---------------------------------------------------------------------- */

  if (node.type === "field" && fieldKey === "tag") {
    return (
      <TagRenderer
        fieldKey={fieldKey}
        node={node}
        level={level}
        spaceId={spaceId}
        environmentId={environmentId}
        entryId={entryId}
        selected={selected}
        onToggleField={onToggleField}
        adoptAll={adoptAll}
      />
    );
  }

  function normalizeFieldKey(key) {
    return key.replace(/[^a-zA-Z]/g, "").toLowerCase();
  }

  console.log("NODE:", {
    fieldKey,
    type: node.type,
    hasSource: !!node.source,
    hasChildren: !!node.children,
  });

  if (JSON_FIELDS[fieldKey]) {
    const source = parseJsonOnce(node.source) ?? [];
    const target = parseJsonOnce(node.target) ?? [];

    const render = (value) => {
      console.log("value =", value);
      console.log("fieldKey =", fieldKey, "value =", value);

      const normalizedKey = normalizeFieldKey(fieldKey);

      switch (normalizedKey) {
        case "demonstratedresults":
          return <DemonstratedResults value={value} />;

        case "features":
          return <Features value={value} />;

        case "imagegallery":
          return <ImageGallery value={value} />;

        case "featuredproducts":
        case "relatedproducts":
          return <ProductList value={value} />;

        default:
          return null;
      }
    };

    return (
      <div
        style={{
          marginBottom: 15,
          padding: 10,
          border: "1px solid #ddd",
          borderRadius: 6,
          backgroundColor:
            JSON.stringify(source) !== JSON.stringify(target)
              ? "#fffef8"
              : "#f6f6f6",
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
          <strong>{fieldKey}</strong>

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
              checked={adoptAll || selected?.[entryId]?.has(fieldKey)}
              onChange={(e) =>
                onToggleField(entryId, fieldKey, e.target.checked)
              }
            />
            {adoptAll || selected?.[entryId]?.has(fieldKey)
              ? "Adopt this field"
              : "Do not adopt this field"}
          </label>
        </div>

        <div style={{ display: "flex", gap: 12 }}>
          <div style={{ flex: 1 }}>
            <em style={{ color: "#666", marginBottom: 4, display: "block" }}>
              Source
            </em>
            {source.length === 0 ? "(empty)" : render(source)}
          </div>

          <div style={{ flex: 1 }}>
            <em style={{ color: "#666", marginBottom: 4, display: "block" }}>
              Target
            </em>
            {target.length === 0 ? "(empty)" : render(target)}
          </div>
        </div>
      </div>
    );
  }

  if (node.type === "field" && fieldKey === "relatedProductportfolio") {
    return (
      <RelatedProductPortfolioRenderer
        fieldKey={fieldKey}
        node={node}
        level={level}
        spaceId={spaceId}
        environmentId={environmentId}
        entryId={entryId}
        selected={selected}
        onToggleField={onToggleField}
        adoptAll={adoptAll}
      />
    );
  }

  if (node.type === "reference-list" && fieldKey === "curatedStories") {
    const entries = Object.values(node.children || {}).map((child) => {
      const typeLabel =
        child.type === "template"
          ? "Template – Article"
          : child.type || "Entry";

      return {
        id: child.entryId,
        type: typeLabel,
        title: child.title,
        slug: child.slug,
      };
    });

    return (
      <RelatedProductPortfolioRenderer
        fieldKey={fieldKey}
        node={{
          source: entries,
          target: entries,
        }}
        level={level}
        spaceId={spaceId}
        environmentId={environmentId}
        entryId={entryId}
        selected={selected}
        onToggleField={onToggleField}
        adoptAll={adoptAll}
      />
    );
  }

  if (node.type === "field" && fieldKey === "frontendTags") {
    return (
      <FrontendTagsRenderer
        fieldKey={fieldKey}
        node={node}
        level={level}
        spaceId={spaceId}
        environmentId={environmentId}
        entryId={entryId}
        selected={selected}
        onToggleField={onToggleField}
        adoptAll={adoptAll}
      />
    );
  }

  /* -------------------------------------------------------------------------- */
  /* 🔥 NEW — CUSTOM RENDERER FOR mainImageasset                                */
  /* -------------------------------------------------------------------------- */
  if (node.type === "field" && fieldKey === "mainImageasset") {
    return (
      <MainImageAssetRenderer
        fieldKey={fieldKey}
        node={node}
        level={level}
        spaceId={spaceId}
        environmentId={environmentId}
        entryId={entryId}
        selected={selected}
        onToggleField={onToggleField}
        adoptAll={adoptAll}
      />
    );
  }

  if (node.type === "template" || node.type === "article") {
    const entryUrl =
      spaceId && environmentId && node.entryId
        ? `https://app.contentful.com/spaces/${spaceId}/environments/${environmentId}/entries/${node.entryId}`
        : null;

    return (
      <div style={{ marginLeft: `${level * 20}px`, marginBottom: 12 }}>
        <EntryCard
          title={node.title}
          description={node.slug}
          size="small"
          isDraft
          onClick={() => {
            if (entryUrl) window.open(entryUrl, "_blank");
          }}
        />
      </div>
    );
  }

  /* ---------------------------------------------------------------------- */
  /* ORIGINAL FIELD NODE                                                    */
  /* ---------------------------------------------------------------------- */

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
          {/* LEFT = SOURCE */}
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

          {/* RIGHT = TARGET */}
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

  if (node.type === "reference-list") {
    return (
      <div style={{ ...indentStyle, marginBottom: 10 }}>
        <strong style={{ display: "block", marginBottom: 6 }}>
          {fieldKey}
        </strong>
        <div style={{ display: "grid", gap: 8 }}>
          {Object.entries(node.children).map(([childEntryId, childNode]) => {
            // 🧩 If it's a template, render it directly as an EntryCard
            if (childNode.type === "template") {
              return (
                <NodeRenderer
                  key={childEntryId}
                  fieldKey={childEntryId}
                  node={childNode}
                  level={level + 1}
                  spaceId={spaceId}
                  environmentId={environmentId}
                  entryId={childEntryId}
                  selected={selected}
                  onToggleField={onToggleField}
                  adoptAll={adoptAll}
                />
              );
            }

            // Otherwise it's a normal reference → collapsible
            return (
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
            );
          })}
        </div>
      </div>
    );
  }

  if (node.type === "circular") {
    return (
      <div style={{ color: "#c00", fontStyle: "italic" }}>
        🔁 Circular reference detected – traversal stopped
      </div>
    );
  }

  if (node.type === "reference") {
    return (
      <CollapsibleReference
        key={fieldKey}
        fieldKey={fieldKey}
        node={node}
        level={level}
        spaceId={spaceId}
        environmentId={environmentId}
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
  entryId,
  selected,
  onToggleField,
  adoptAll,
}) {
  const [expanded, setExpanded] = useState(false);
  const indentStyle = { marginLeft: `${level * 20}px` };
  const childCount = Object.keys(node.children || {}).length;

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
              entryId={entryId}
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
