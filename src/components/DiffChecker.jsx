import React, { useState } from "react";
import { diff_match_patch } from "diff-match-patch";
import { Pill, Stack, EntryCard } from "@contentful/f36-components";
import { documentToReactComponents } from "@contentful/rich-text-react-renderer";
import {
  toDiffableString,
  splitStringByEmbeddedEntryTokens,
  uniqueEmbeddedEntryParts,
  stripEmbeddedEntryTokens,
  buildEntryUrl,
  formatEmbeddedEntryLabel,
  parseJsonAssetField,
} from "../lib/helpers";

const dmp = new diff_match_patch();

function SafeEntryCard({ title, description, ...props }) {
  return (
    <EntryCard
      {...props}
      title={typeof title === "string" ? title : String(title ?? "")}
      description={
        typeof description === "string"
          ? description
          : String(description ?? "")
      }
    />
  );
}

function extractLTags(raw) {
  if (!raw) return { l1: [], l2: [], l3: [], flags: {} };

  let value = raw;

  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw);
    } catch {
      return { l1: [], l2: [], l3: [], flags: {} };
    }
  }

  if (!value || typeof value !== "object") {
    return { l1: [], l2: [], l3: [], flags: {} };
  }

  const normalize = (arr) =>
    (Array.isArray(arr) ? arr : [])
      .filter((t) => t && t.title)
      .map((t) => ({
        title: t.title,
        tagCode: t.tagCode || "",
      }));

  return {
    l1: normalize(value.l1Tag),
    l2: normalize(value.l2Tag),
    l3: normalize(value.l3Tag),
    flags: {
      enableL1Tag: Boolean(value.enableL1Tag),
      enableL2Tag: Boolean(value.enableL2Tag),
      enableL3Tag: Boolean(value.enableL3Tag),
    },
  };
}

function LTagRenderer({
  fieldKey,
  node,
  level,
  entryId,
  selected,
  onToggleField,
  adoptAll,
  overwriteAll,
}) {
  const indentStyle = { marginLeft: `${level * 20}px` };

  const source = extractLTags(node.source);
  const target = extractLTags(node.target);

  const selectedSet = selected?.[entryId];
  const explicitlySelected = Boolean(selectedSet && selectedSet.has(fieldKey));
  const checked = overwriteAll ? true : adoptAll ? true : explicitlySelected;

  const renderGroup = (label, items) => {
    if (!items || items.length === 0) return <div>(empty)</div>;

    return (
      <Stack flexDirection="row" flexWrap="wrap" gap="spacingXs">
        {items.map((t) => (
          <Pill
            style={{ marginBottom: "5px" }}
            key={`${label}-${t.tagCode || t.title}`}
            label={t.tagCode ? `${t.title} (${t.tagCode})` : t.title}
          />
        ))}
      </Stack>
    );
  };

  const hasChanged = JSON.stringify(source) !== JSON.stringify(target);

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
        }}
      >
        <strong>{fieldKey}</strong>

        <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <input
            type="checkbox"
            checked={checked}
            disabled={overwriteAll}
            onChange={(e) => onToggleField(entryId, fieldKey, e.target.checked)}
          />
          {checked ? "Adopt this field" : "Do not adopt this field"}
        </label>
      </div>

      <div style={{ display: "flex", gap: 12 }}>
        <div style={{ flex: 1 }}>
          <em style={{ color: "#666", marginBottom: 4, display: "block" }}>
            Source
          </em>

          {renderGroup("L1", source.l1)}
          {renderGroup("L2", source.l2)}
          {renderGroup("L3", source.l3)}
        </div>

        <div style={{ flex: 1 }}>
          <em style={{ color: "#666", marginBottom: 4, display: "block" }}>
            Target
          </em>

          {renderGroup("L1", target.l1)}
          {renderGroup("L2", target.l2)}
          {renderGroup("L3", target.l3)}
        </div>
      </div>
    </div>
  );
}

function asString(val, fallback = "—") {
  if (val == null) return fallback;

  if (typeof val === "string") return val;
  if (typeof val === "number" || typeof val === "boolean") return String(val);

  // Rich text
  if (isRichTextDocument(val)) {
    return richTextToPlainText(val);
  }

  if (Array.isArray(val)) {
    return val.map((v) => asString(v)).join(", ");
  }

  return fallback;
}

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
  overwriteAll,
}) {
  const indentStyle = { marginLeft: `${level * 20}px` };

  const sourceTags = extractTags(node.source);
  const targetTags = extractTags(node.target);

  const hasChanged = JSON.stringify(sourceTags) !== JSON.stringify(targetTags);

  const selectedSet = selected?.[entryId];
  const explicitlySelected = Boolean(selectedSet && selectedSet.has(fieldKey));
  const checked = overwriteAll ? true : adoptAll ? true : explicitlySelected;

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
            disabled={overwriteAll}
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

function HeroCards({ value }) {
  if (!Array.isArray(value)) return null;

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {value.map((card, i) => {
        const title =
          card.entryTitle ||
          card.pageLink?.slug ||
          card.pageLink?.id ||
          `Hero ${i + 1}`;

        return (
          <div
            key={card.pageLink?.id || `${title}-${i}`}
            style={{
              border: "1px solid #eee",
              borderRadius: 6,
              padding: 12,
              background: "#fff",
            }}
          >
            <strong style={{ display: "block", marginBottom: 6 }}>
              {asString(title)}
            </strong>

            {card.subhead && (
              <div style={{ marginBottom: 6 }}>
                {documentToReactComponents(card.subhead)}
              </div>
            )}

            {card.text && (
              <div style={{ marginBottom: 8 }}>
                {documentToReactComponents(card.text)}
              </div>
            )}

            {card.heroImage?.assetUrl && (
              <img
                src={card.heroImage.assetUrl}
                alt={card.heroImage.altText || ""}
                style={{
                  maxWidth: "100%",
                  maxHeight: 200,
                  objectFit: "contain",
                  borderRadius: 4,
                  marginBottom: 8,
                }}
              />
            )}

            {card.pageLink?.id && (
              <div style={{ fontSize: 12, color: "#666" }}>
                <strong>Page link:</strong>{" "}
                {card.pageLink.slug
                  ? `${card.pageLink.slug} (${card.pageLink.id})`
                  : card.pageLink.id}
              </div>
            )}

            {card.ctaText || card.ctaUrl ? (
              <div style={{ marginTop: 6, fontSize: 12 }}>
                <strong>CTA:</strong>{" "}
                {card.ctaText ? card.ctaText : "(no text)"}{" "}
                {card.ctaUrl ? `→ ${card.ctaUrl}` : ""}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

const JSON_FIELDS = {
  demonstratedResults: "demonstratedResults",
  secondaryFeatures: "secondaryFeatures",
  features: "features",
  imageGallery: "imageGallery",
  featuredProducts: "featuredProducts",
  relatedProducts: "relatedProducts",
  heroCards: "heroCards",
  featuredSolutions: "featuredSolutions",
  mediaGallery: "mediaGallery",
  promoBanner: "promoBanner",
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

function isRichTextDocument(v) {
  return (
    v &&
    typeof v === "object" &&
    v.nodeType === "document" &&
    Array.isArray(v.content)
  );
}

function richTextToPlainText(doc) {
  if (!isRichTextDocument(doc)) return "";

  const walk = (node) => {
    if (!node) return "";
    if (node.nodeType === "text") return node.value || "";
    if (!Array.isArray(node.content)) return "";
    return node.content.map(walk).join("");
  };

  return walk(doc).replace(/\s+/g, " ").trim();
}

function ProductList({ value }) {
  if (!Array.isArray(value)) return null;

  const getTitle = (p) => {
    // navigationTitle is rich text
    if (isRichTextDocument(p?.navigationTitle)) {
      return richTextToPlainText(p.navigationTitle);
    }

    // normal string titles
    return (
      p?.title || p?.entryTitle || p?.navigationTitle || p?.slug || p?.id || "—"
    );
  };

  const getDescription = (p) => {
    if (isRichTextDocument(p?.navigationDescription)) {
      return richTextToPlainText(p.navigationDescription);
    }
    return p?.navigationDescription || "";
  };

  const getCtn = (p) => {
    return p?.ctn || p?.CTN || p?.productCtn || "";
  };

  return (
    <div style={{ display: "grid", gap: 10 }}>
      {value.map((p, i) => {
        const title = asString(getTitle(p), "—");
        const description = asString(getDescription(p), "");
        const ctn = asString(getCtn(p), "");

        return (
          <div
            key={p?.id || `${title}-${i}`}
            style={{
              border: "1px solid #eee",
              padding: 10,
              borderRadius: 6,
              background: "#fff",
            }}
          >
            <strong style={{ display: "block", marginBottom: 4 }}>
              {title}
              {ctn ? ` (${ctn})` : ""}
            </strong>

            {description ? (
              <div style={{ fontSize: 13, color: "#555" }}>{description}</div>
            ) : null}

            {p?.navigationThumbnail?.assetUrl ? (
              <img
                src={p.navigationThumbnail.assetUrl}
                alt={p.navigationThumbnail.altText || ""}
                style={{
                  marginTop: 8,
                  maxWidth: "100%",
                  maxHeight: 160,
                  objectFit: "contain",
                  borderRadius: 4,
                }}
              />
            ) : null}

            {p?.slug ? (
              <div style={{ marginTop: 6, fontSize: 12, color: "#777" }}>
                <strong>Slug:</strong> {p.slug}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function getRelatedEntryCardText(entry) {
  const isTemplate =
    typeof entry.type === "string" &&
    entry.type.toLowerCase().startsWith("template");

  const extractText = (val) => {
    if (typeof val === "string") return val;
    if (isRichTextDocument(val)) return richTextToPlainText(val);
    return "";
  };

  const baseTitle =
    extractText(entry.navigationTitle) ||
    extractText(entry.title) ||
    extractText(entry.slug) ||
    String(entry.id || "—");

  const title = isTemplate ? `Template – ${baseTitle}` : baseTitle;

  const description =
    extractText(entry.navigationDescription) || extractText(entry.type) || "";

  return {
    title: String(title),
    description: String(description),
  };
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
  overwriteAll,
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
  const checked = overwriteAll ? true : adoptAll ? true : explicitlySelected;

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
            disabled={overwriteAll}
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
  overwriteAll,
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
  const checked = overwriteAll ? true : adoptAll ? true : explicitlySelected;

  const renderEntryCard = (entry) => {
    const entryUrl =
      spaceId && environmentId
        ? `https://app.contentful.com/spaces/${spaceId}/environments/${environmentId}/entries/${entry.id}`
        : null;

    const { title, description } = getRelatedEntryCardText(entry);

    return (
      <SafeEntryCard
        key={entry.id}
        title={String(title)}
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
            disabled={overwriteAll}
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
  overwriteAll,
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
  const checked = overwriteAll ? true : adoptAll ? true : explicitlySelected;

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
            disabled={overwriteAll}
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
  overwriteAll,
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
  function PromoBanner({ value }) {
    if (!Array.isArray(value)) return null;

    return (
      <div style={{ display: "grid", gap: 12 }}>
        {value.map((b, i) => {
          const hero = parseJsonAssetField(b.heroImage);
          const headline = b.headline
            ? documentToReactComponents(b.headline)
            : null;
          const summary = b.summary
            ? documentToReactComponents(b.summary)
            : null;
          const pageLink = b.pageLink;

          return (
            <div
              key={pageLink?.id || b.entryTitle || i}
              style={{
                border: "1px solid #eee",
                borderRadius: 6,
                padding: 12,
                background: "#fff",
              }}
            >
              <strong style={{ display: "block", marginBottom: 6 }}>
                {b.entryTitle || "(no title)"}
              </strong>

              {headline ? (
                <div style={{ marginBottom: 6 }}>{headline}</div>
              ) : null}

              {summary ? (
                <div style={{ marginBottom: 10 }}>{summary}</div>
              ) : null}

              {/* image */}
              {hero?.kind === "image" ? (
                <img
                  src={hero.url}
                  alt={hero.alt || ""}
                  style={{
                    maxWidth: "100%",
                    maxHeight: 220,
                    objectFit: "contain",
                    borderRadius: 4,
                    marginBottom: 10,
                  }}
                />
              ) : hero?.kind === "video" ? (
                <div style={{ fontSize: 12, color: "#666", marginBottom: 10 }}>
                  🎥 Video: {hero.assetName || "(unnamed)"}
                </div>
              ) : null}

              {/* CTA */}
              {b.ctaText || b.ctaUrl ? (
                <div style={{ fontSize: 12 }}>
                  <strong>CTA:</strong> {b.ctaText ? b.ctaText : "(no text)"}{" "}
                  {b.ctaUrl ? `→ ${b.ctaUrl}` : ""}
                </div>
              ) : null}

              {/* page link */}
              {pageLink?.id ? (
                <div style={{ marginTop: 6, fontSize: 12, color: "#777" }}>
                  <strong>Page link:</strong>{" "}
                  {pageLink.slug
                    ? `${pageLink.slug} (${pageLink.id})`
                    : pageLink.id}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    );
  }

  function SecondaryFeatures({ value }) {
    if (!Array.isArray(value)) return null;

    return (
      <div style={{ display: "grid", gap: 12 }}>
        {value.map((f, i) => {
          const title =
            f.entryTitle || (isRichTextDocument(f.subhead) ? "—" : "—");

          const subhead = f.subhead
            ? documentToReactComponents(f.subhead)
            : null;
          const text = f.text ? documentToReactComponents(f.text) : null;

          const hero = parseJsonAssetField(f.heroImage);
          const pageLink = f.pageLink;

          return (
            <div
              key={pageLink?.id || title || i}
              style={{
                border: "1px solid #eee",
                borderRadius: 6,
                padding: 12,
                background: "#fff",
              }}
            >
              <strong style={{ display: "block", marginBottom: 6 }}>
                {f.entryTitle || "(no title)"}
              </strong>

              {subhead ? (
                <div style={{ marginBottom: 6 }}>{subhead}</div>
              ) : null}

              {text ? <div style={{ marginBottom: 10 }}>{text}</div> : null}

              {/* image */}
              {hero?.kind === "image" ? (
                <img
                  src={hero.url}
                  alt={hero.alt || ""}
                  style={{
                    maxWidth: "100%",
                    maxHeight: 200,
                    objectFit: "contain",
                    borderRadius: 4,
                    marginBottom: 10,
                  }}
                />
              ) : hero?.kind === "video" ? (
                <div style={{ fontSize: 12, color: "#666", marginBottom: 10 }}>
                  🎥 Video: {hero.assetName || "(unnamed)"}
                </div>
              ) : null}

              {/* CTA */}
              {f.ctaText || f.ctaUrl ? (
                <div style={{ fontSize: 12 }}>
                  <strong>CTA:</strong> {f.ctaText ? f.ctaText : "(no text)"}{" "}
                  {f.ctaUrl ? `→ ${f.ctaUrl}` : ""}
                </div>
              ) : null}

              {/* page link */}
              {pageLink?.id ? (
                <div style={{ marginTop: 6, fontSize: 12, color: "#777" }}>
                  <strong>Page link:</strong>{" "}
                  {pageLink.slug
                    ? `${pageLink.slug} (${pageLink.id})`
                    : pageLink.id}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    );
  }

  function MediaGallery({ value }) {
    if (!Array.isArray(value)) return null;

    return (
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, 1fr)",
          gap: 12,
        }}
      >
        {value.map((item, i) => {
          const asset = parseJsonAssetField(item);

          if (!asset) {
            return (
              <div key={i} style={{ border: "1px solid #eee", padding: 10 }}>
                (invalid asset)
              </div>
            );
          }

          return (
            <div
              key={asset.url || `${asset.assetName}-${i}`}
              style={{
                border: "1px solid #eee",
                borderRadius: 6,
                padding: 10,
                background: "#fff",
              }}
            >
              {asset.kind === "image" ? (
                <img
                  src={asset.url}
                  alt={asset.alt || ""}
                  style={{
                    width: "100%",
                    maxHeight: 180,
                    objectFit: "contain",
                    borderRadius: 4,
                    marginBottom: 8,
                  }}
                />
              ) : (
                <div style={{ fontSize: 12, color: "#666" }}>
                  🎥 Video: {asset.assetName || "(unnamed)"}
                </div>
              )}

              <div style={{ fontSize: 12, color: "#666" }}>
                <strong>{asset.assetName || "(no name)"}</strong>
              </div>

              {asset.alt ? (
                <div style={{ fontSize: 12, color: "#777", marginTop: 4 }}>
                  <strong>Alt:</strong> {asset.alt}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    );
  }

  function FeaturedSolutions({ value }) {
    if (!Array.isArray(value)) return null;

    return (
      <div style={{ display: "grid", gap: 12 }}>
        {value.map((item, i) => {
          const headline = item?.headline
            ? documentToReactComponents(item.headline)
            : null;

          const text = item?.text ? documentToReactComponents(item.text) : null;

          const asset = parseJsonAssetField(item?.imageVideoAsset);

          const pageLink = item?.pageLink;

          return (
            <div
              key={pageLink?.id || item?.entryTitle || i}
              style={{
                border: "1px solid #eee",
                borderRadius: 6,
                padding: 12,
                background: "#fff",
              }}
            >
              <strong style={{ display: "block", marginBottom: 6 }}>
                {item?.entryTitle || "(no title)"}
              </strong>

              {headline ? (
                <div style={{ marginBottom: 6 }}>{headline}</div>
              ) : null}

              {text ? <div style={{ marginBottom: 10 }}>{text}</div> : null}

              {/* image */}
              {asset?.kind === "image" ? (
                <img
                  src={asset.url}
                  alt={asset.alt || ""}
                  style={{
                    maxWidth: "100%",
                    maxHeight: 200,
                    objectFit: "contain",
                    borderRadius: 4,
                    marginBottom: 10,
                  }}
                />
              ) : asset?.kind === "video" ? (
                <div
                  style={{
                    padding: 8,
                    border: "1px solid #eee",
                    borderRadius: 6,
                    marginBottom: 10,
                    fontSize: 12,
                    color: "#666",
                  }}
                >
                  🎥 Video: {asset.assetName || "(unnamed)"}
                </div>
              ) : null}

              {/* CTA */}
              {item?.ctaText || item?.ctaUrl ? (
                <div style={{ fontSize: 12 }}>
                  <strong>CTA:</strong>{" "}
                  {item.ctaText ? item.ctaText : "(no text)"}{" "}
                  {item.ctaUrl ? `→ ${item.ctaUrl}` : ""}
                </div>
              ) : null}

              {/* page link */}
              {pageLink?.id ? (
                <div style={{ marginTop: 6, fontSize: 12, color: "#777" }}>
                  <strong>Page link:</strong>{" "}
                  {pageLink.slug
                    ? `${pageLink.slug} (${pageLink.id})`
                    : pageLink.id}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    );
  }

  if (node.type === "field" && fieldKey === "name") {
    // only render with this if it looks like the L-tag JSON
    const parsed = parseJsonOnce(node.source) || parseJsonOnce(node.target);

    const looksLikeLTags =
      parsed &&
      typeof parsed === "object" &&
      ("l1Tag" in parsed || "l2Tag" in parsed || "l3Tag" in parsed);

    if (looksLikeLTags) {
      return (
        <LTagRenderer
          fieldKey={fieldKey}
          node={node}
          level={level}
          entryId={entryId}
          selected={selected}
          onToggleField={onToggleField}
          adoptAll={adoptAll}
          overwriteAll={overwriteAll}
        />
      );
    }
  }

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
        overwriteAll={overwriteAll}
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

        case "promobanner":
          return <PromoBanner value={value} />;

        case "features":
          return <Features value={value} />;

        case "secondaryfeatures":
          return <SecondaryFeatures value={value} />;

        case "imagegallery":
          return <ImageGallery value={value} />;

        case "mediagallery":
          return <MediaGallery value={value} />;

        case "featuredproducts":
        case "relatedproducts":
          return <ProductList value={value} />;

        case "herocards":
          return <HeroCards value={value} />;
        case "featuredsolutions":
          return <FeaturedSolutions value={value} />;

        default:
          return null;
      }
    };
    const checked = overwriteAll
      ? true
      : adoptAll
      ? true
      : selected?.[entryId]?.has(fieldKey);

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
              checked={checked}
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
        <SafeEntryCard
          title={asString(node.title, node.entryId)}
          description={asString(node.slug, "")}
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
    const sourceStr = node.isRichText
      ? richTextToStableDiffString(node.source)
      : toDiffableString(node.source);

    const targetStr = node.isRichText
      ? richTextToStableDiffString(node.target)
      : toDiffableString(node.target);

    const embeddedChildren = node.embeddedChildren || {};
    const hasEmbeddedChildren =
      embeddedChildren && Object.keys(embeddedChildren).length > 0;

    console.log("sourceStr is", sourceStr);
    console.log("targetStr is", targetStr);

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
    const checked = overwriteAll ? true : adoptAll ? true : explicitlySelected;

    const sourceAsset = parseJsonAssetField(node.source);
    const targetAsset = parseJsonAssetField(node.target);

    const jsonAssetFields = new Set([
      "navigationThumbnail",
      "mastheadAsset",
      "mainAsset",
      "mastheadImage",
    ]);

    const forceJsonAssetImage = jsonAssetFields.has(fieldKey);

    const hasAssetLinkImage = Boolean(node.isImage);
    const hasJsonImage = Boolean(sourceAsset || targetAsset);
    const isImageField =
      forceJsonAssetImage || hasAssetLinkImage || hasJsonImage;

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
              disabled={overwriteAll}
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
                {sourceAsset?.kind === "image" ? (
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
                ) : sourceAsset?.kind === "video" ? (
                  <div style={{ fontSize: 12, color: "#666" }}>
                    🎥 Video: {sourceAsset.assetName || "(unnamed)"}
                  </div>
                ) : (
                  <span>(no image)</span>
                )}
              </div>
            ) : (
              <div style={fieldBoxStyle}>
                {node.isRichText ? (
                  <RichTextDiffWithEmbeddedRefs
                    side="source"
                    sourceStr={sourceStr}
                    targetStr={targetStr}
                    embeddedChildren={embeddedChildren}
                    level={level}
                    spaceId={spaceId}
                    environmentId={environmentId}
                    selected={selected}
                    onToggleField={onToggleField}
                    adoptAll={adoptAll}
                    overwriteAll={overwriteAll}
                  />
                ) : sourceStr === "" ? (
                  "(empty)"
                ) : (
                  <span
                    dangerouslySetInnerHTML={{
                      __html: renderDiffHtmlSourceGreen(sourceStr, targetStr),
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
                {node.isRichText ? (
                  <RichTextDiffWithEmbeddedRefs
                    side="target"
                    sourceStr={sourceStr}
                    targetStr={targetStr}
                    embeddedChildren={embeddedChildren}
                    level={level}
                    spaceId={spaceId}
                    environmentId={environmentId}
                    selected={selected}
                    onToggleField={onToggleField}
                    adoptAll={adoptAll}
                    overwriteAll={overwriteAll}
                  />
                ) : targetStr === "(empty)" ? (
                  "(empty)"
                ) : (
                  <span
                    dangerouslySetInnerHTML={{
                      __html: renderDiffHtmlTargetRed(sourceStr, targetStr),
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
                  overwriteAll={overwriteAll}
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
                overwriteAll={overwriteAll}
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
        overwriteAll={overwriteAll}
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
  overwriteAll,
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
              overwriteAll={overwriteAll}
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
  overwriteAll,
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
          overwriteAll={overwriteAll}
        />
      ))}
    </div>
  );
};

export default DiffChecker;

function richTextToStableDiffString(node) {
  if (!node || typeof node !== "object") return "";

  if (node.nodeType === "text") {
    return node.value || "";
  }

  if (
    node.nodeType === "embedded-entry-block" ||
    node.nodeType === "embedded-entry-inline"
  ) {
    const id = node?.data?.target?.sys?.id;
    return `\n<EMBEDDED_ENTRY:${id || "unknown"}>\n`;
  }

  if (node.nodeType === "embedded-asset-block") {
    const id = node?.data?.target?.sys?.id;
    return `\n<EMBEDDED_ASSET:${id || "unknown"}>\n`;
  }

  if (node.nodeType === "entry-hyperlink") {
    const id = node?.data?.target?.sys?.id;
    return `<ENTRY_LINK:${id || "unknown"}>`;
  }

  if (Array.isArray(node.content)) {
    const childText = node.content.map(richTextToStableDiffString).join("");

    const blockNodes = new Set([
      "paragraph",
      "heading-1",
      "heading-2",
      "heading-3",
      "heading-4",
      "heading-5",
      "heading-6",
      "unordered-list",
      "ordered-list",
      "list-item",
      "blockquote",
      "hr",
      "table",
      "table-row",
      "table-cell",
      "document",
    ]);

    if (blockNodes.has(node.nodeType)) {
      return childText.trim() ? `${childText.trim()}\n` : "";
    }

    return childText;
  }

  return "";
}

function RichTextDiffWithEmbeddedRefs({
  side,
  sourceStr,
  targetStr,
  embeddedChildren,
  level,
  spaceId,
  environmentId,
  selected,
  onToggleField,
  adoptAll,
  overwriteAll,
}) {
  const viewStr = side === "source" ? sourceStr : targetStr;

  let parts = splitStringByEmbeddedEntryTokens(viewStr);
  parts = uniqueEmbeddedEntryParts(parts);

  const cleanedSource = stripEmbeddedEntryTokens(sourceStr);
  const cleanedTarget = stripEmbeddedEntryTokens(targetStr);

  const diffHtml =
    side === "source"
      ? renderDiffHtmlSourceGreen(cleanedSource, cleanedTarget)
      : renderDiffHtmlTargetRed(cleanedSource, cleanedTarget);

  const embeddedIds = parts
    .filter((p) => p.type === "embedded-entry")
    .map((p) => p.id);

  return (
    <div style={{ display: "grid", gap: 10 }}>
      {/* 1) The text diff */}
      <div dangerouslySetInnerHTML={{ __html: diffHtml }} />

      {/* 2) Embedded entries as link blocks */}
      {embeddedIds.length > 0 ? (
        <div style={{ display: "grid", gap: 8 }}>
          {embeddedIds.map((id) => {
            const url = buildEntryUrl({
              spaceId,
              environmentId,
              entryId: id,
            });

            return (
              <div
                key={id}
                style={{
                  padding: 8,
                  border: "1px solid #eee",
                  borderRadius: 6,
                  background: "#fff",
                  fontSize: 12,
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 12,
                  alignItems: "center",
                }}
              >
                <div style={{ fontFamily: "monospace" }}>
                  {formatEmbeddedEntryLabel(id)}
                </div>

                {url ? (
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      fontSize: 12,
                      textDecoration: "none",
                      border: "1px solid #ddd",
                      padding: "4px 8px",
                      borderRadius: 6,
                      background: "#f7f7f7",
                      whiteSpace: "nowrap",
                    }}
                  >
                    Open ↗
                  </a>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
