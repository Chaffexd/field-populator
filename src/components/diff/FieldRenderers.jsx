import React from "react";
import { Pill, Stack, EntryCard } from "@contentful/f36-components";
import { documentToReactComponents } from "@contentful/rich-text-react-renderer";
import {
  isRichTextDocument,
  splitStringByEmbeddedEntryTokens,
  uniqueEmbeddedEntryParts,
  stripEmbeddedEntryTokens,
  buildEntryUrl,
  formatEmbeddedEntryLabel,
  parseJsonAssetField,
} from "../../lib/helpers";
import {
  asString,
  extractLTags,
  extractTags,
  richTextToPlainText,
  getRelatedEntryCardText,
  extractFrontendTags,
  pillVariant,
  extractRelatedProducts,
  relatedCardVariant,
  extractMainImageAsset,
  renderDiffHtmlSourceGreen,
  renderDiffHtmlTargetRed,
} from "./diffUtils";

export const fieldBoxStyle = {
  padding: "8px",
  backgroundColor: "#fafafa",
  border: "1px solid #eee",
  borderRadius: "4px",
  whiteSpace: "pre-wrap",
  fontFamily: "monospace",
  fontSize: "13px",
};

export function SafeEntryCard({ title, description, ...props }) {
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

export function LTagRenderer({
  fieldKey,
  node,
  level,
  entryId,
  selected,
  onToggleField,
  adoptAll,
  overwriteAll,
  overwriteSelected,
  onToggleOverwrite,
}) {
  const indentStyle = { marginLeft: `${level * 20}px` };

  const source = extractLTags(node.source);
  const target = extractLTags(node.target);

  const selectedSet = selected?.[entryId];
  const explicitlySelected = Boolean(selectedSet && selectedSet.has(fieldKey));
  const overwriteChecked = overwriteAll || Boolean(overwriteSelected?.[entryId]?.has(fieldKey));
  const mergeChecked = !overwriteChecked && (adoptAll || explicitlySelected);

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

        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12 }}>
            <input
              type="checkbox"
              checked={mergeChecked}
              disabled={overwriteAll}
              onChange={(e) => onToggleField(entryId, fieldKey, e.target.checked)}
            />
            Merge
          </label>
          <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12 }}>
            <input
              type="checkbox"
              checked={overwriteChecked}
              disabled={overwriteAll}
              onChange={(e) => onToggleOverwrite(entryId, fieldKey, e.target.checked)}
            />
            Overwrite
          </label>
        </div>
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

export function TagRenderer({
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
  overwriteSelected,
  onToggleOverwrite,
}) {
  const indentStyle = { marginLeft: `${level * 20}px` };

  const sourceTags = extractTags(node.source);
  const targetTags = extractTags(node.target);

  const hasChanged = JSON.stringify(sourceTags) !== JSON.stringify(targetTags);

  const selectedSet = selected?.[entryId];
  const explicitlySelected = Boolean(selectedSet && selectedSet.has(fieldKey));
  const overwriteChecked = overwriteAll || Boolean(overwriteSelected?.[entryId]?.has(fieldKey));
  const mergeChecked = !overwriteChecked && (adoptAll || explicitlySelected);

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

        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12 }}>
            <input
              type="checkbox"
              checked={mergeChecked}
              disabled={overwriteAll}
              onChange={(e) => onToggleField(entryId, fieldKey, e.target.checked)}
            />
            Merge
          </label>
          <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12 }}>
            <input
              type="checkbox"
              checked={overwriteChecked}
              disabled={overwriteAll}
              onChange={(e) => onToggleOverwrite(entryId, fieldKey, e.target.checked)}
            />
            Overwrite
          </label>
        </div>
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

export function HeroCards({ value }) {
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

export function DemonstratedResults({ value }) {
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

export function Features({ value }) {
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

export function ImageGallery({ value }) {
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

export function ProductList({ value }) {
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

export function FrontendTagsRenderer({
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
  overwriteSelected,
  onToggleOverwrite,
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
  const overwriteChecked = overwriteAll || Boolean(overwriteSelected?.[entryId]?.has(fieldKey));
  const mergeChecked = !overwriteChecked && (adoptAll || explicitlySelected);

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

        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12, color: "#444" }}>
            <input
              type="checkbox"
              checked={mergeChecked}
              disabled={overwriteAll}
              onChange={(e) => onToggleField(entryId, fieldKey, e.target.checked)}
            />
            Merge
          </label>
          <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12, color: "#444" }}>
            <input
              type="checkbox"
              checked={overwriteChecked}
              disabled={overwriteAll}
              onChange={(e) => onToggleOverwrite(entryId, fieldKey, e.target.checked)}
            />
            Overwrite
          </label>
        </div>
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

export function RelatedProductPortfolioRenderer({
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
  overwriteSelected,
  onToggleOverwrite,
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
  const overwriteChecked = overwriteAll || Boolean(overwriteSelected?.[entryId]?.has(fieldKey));
  const mergeChecked = !overwriteChecked && (adoptAll || explicitlySelected);

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

        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12, color: "#444" }}>
            <input
              type="checkbox"
              checked={mergeChecked}
              disabled={overwriteAll}
              onChange={(e) => onToggleField(entryId, fieldKey, e.target.checked)}
            />
            Merge
          </label>
          <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12, color: "#444" }}>
            <input
              type="checkbox"
              checked={overwriteChecked}
              disabled={overwriteAll}
              onChange={(e) => onToggleOverwrite(entryId, fieldKey, e.target.checked)}
            />
            Overwrite
          </label>
        </div>
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

export function MainImageAssetRenderer({
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
  overwriteSelected,
  onToggleOverwrite,
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
  const overwriteChecked = overwriteAll || Boolean(overwriteSelected?.[entryId]?.has(fieldKey));
  const mergeChecked = !overwriteChecked && (adoptAll || explicitlySelected);

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

        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12 }}>
            <input
              type="checkbox"
              checked={mergeChecked}
              disabled={overwriteAll}
              onChange={(e) => onToggleField(entryId, fieldKey, e.target.checked)}
            />
            Merge
          </label>
          <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12 }}>
            <input
              type="checkbox"
              checked={overwriteChecked}
              disabled={overwriteAll}
              onChange={(e) => onToggleOverwrite(entryId, fieldKey, e.target.checked)}
            />
            Overwrite
          </label>
        </div>
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
/* PromoBanner — hoisted out of NodeRenderer to module level                  */
/* -------------------------------------------------------------------------- */
export function PromoBanner({ value }) {
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

export function RichTextDiffWithEmbeddedRefs({
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

/* -------------------------------------------------------------------------- */
/* SecondaryFeatures — hoisted out of NodeRenderer to module level            */
/* -------------------------------------------------------------------------- */
export function SecondaryFeatures({ value }) {
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

/* -------------------------------------------------------------------------- */
/* MediaGallery — hoisted out of NodeRenderer to module level                 */
/* -------------------------------------------------------------------------- */
export function MediaGallery({ value }) {
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

/* -------------------------------------------------------------------------- */
/* FeaturedSolutions — hoisted out of NodeRenderer to module level            */
/* -------------------------------------------------------------------------- */
export function FeaturedSolutions({ value }) {
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

/* -------------------------------------------------------------------------- */
/* CategoryUrlRenderer — ctaURL + pageLink object                             */
/* -------------------------------------------------------------------------- */
export function CategoryUrlRenderer({
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
  overwriteSelected,
  onToggleOverwrite,
}) {
  const indentStyle = { marginLeft: `${level * 20}px` };

  const parse = (raw) => {
    if (!raw) return null;
    if (typeof raw === "object") return raw;
    try { return JSON.parse(raw); } catch { return null; }
  };

  const source = parse(node.source);
  const target = parse(node.target);
  const changed = JSON.stringify(source) !== JSON.stringify(target);

  const fieldUrl =
    spaceId && environmentId && entryId
      ? `https://app.contentful.com/spaces/${spaceId}/environments/${environmentId}/entries/${entryId}?focusedField=${encodeURIComponent(fieldKey)}`
      : null;

  const selectedSet = selected?.[entryId];
  const explicitlySelected = Boolean(selectedSet && selectedSet.has(fieldKey));
  const overwriteChecked = overwriteAll || Boolean(overwriteSelected?.[entryId]?.has(fieldKey));
  const mergeChecked = !overwriteChecked && (adoptAll || explicitlySelected);

  const renderCard = (val) => {
    if (!val) return <div style={fieldBoxStyle}>(empty)</div>;
    const { ctaURL, pageLink } = val;
    return (
      <div style={{ ...fieldBoxStyle, display: "flex", flexDirection: "column", gap: 6, fontSize: 13 }}>
        {ctaURL ? (
          <div>
            <strong>CTA URL:</strong>{" "}
            <a href={ctaURL} target="_blank" rel="noopener noreferrer">{ctaURL}</a>
          </div>
        ) : (
          <div style={{ color: "#999" }}>CTA URL: (none)</div>
        )}
        {pageLink ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <div><strong>Slug:</strong> {pageLink.slug || "(none)"}</div>
            <div><strong>Type:</strong> {pageLink.type || "(none)"}</div>
            {pageLink.locale && <div><strong>Locale:</strong> {pageLink.locale}</div>}
          </div>
        ) : (
          <div style={{ color: "#999" }}>Page link: (none)</div>
        )}
      </div>
    );
  };

  return (
    <div
      style={{
        marginBottom: 15,
        padding: 10,
        border: "1px solid #ddd",
        borderRadius: 6,
        backgroundColor: changed ? "#fffef8" : "#f6f6f6",
        ...indentStyle,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
        <strong>
          {fieldUrl ? (
            <a href={fieldUrl} target="_blank" rel="noopener noreferrer">{fieldKey}</a>
          ) : fieldKey}
        </strong>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12 }}>
            <input
              type="checkbox"
              checked={mergeChecked}
              disabled={overwriteAll}
              onChange={(e) => onToggleField(entryId, fieldKey, e.target.checked)}
            />
            Merge
          </label>
          <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12 }}>
            <input
              type="checkbox"
              checked={overwriteChecked}
              disabled={overwriteAll}
              onChange={(e) => onToggleOverwrite(entryId, fieldKey, e.target.checked)}
            />
            Overwrite
          </label>
        </div>
      </div>
      <div style={{ display: "flex", gap: 10 }}>
        <div style={{ flex: 1 }}>
          <em style={{ color: "#666", marginBottom: 4, display: "block" }}>Source</em>
          {renderCard(source)}
        </div>
        <div style={{ flex: 1 }}>
          <em style={{ color: "#666", marginBottom: 4, display: "block" }}>Target</em>
          {renderCard(target)}
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* RichTextObjectRenderer — object where some values are rich text docs       */
/* e.g. { quote: richTextDoc, attribution: "Name" }                          */
/* -------------------------------------------------------------------------- */
export function RichTextObjectRenderer({
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
  overwriteSelected,
  onToggleOverwrite,
}) {
  const indentStyle = { marginLeft: `${level * 20}px` };

  const parse = (raw) => {
    if (!raw) return null;
    if (typeof raw === "object" && !Array.isArray(raw)) return raw;
    try { const p = JSON.parse(raw); return (p && typeof p === "object" && !Array.isArray(p)) ? p : null; } catch { return null; }
  };

  const source = parse(node.source);
  const target = parse(node.target);
  const changed = JSON.stringify(source) !== JSON.stringify(target);

  const fieldUrl =
    spaceId && environmentId && entryId
      ? `https://app.contentful.com/spaces/${spaceId}/environments/${environmentId}/entries/${entryId}?focusedField=${encodeURIComponent(fieldKey)}`
      : null;

  const selectedSet = selected?.[entryId];
  const explicitlySelected = Boolean(selectedSet && selectedSet.has(fieldKey));
  const overwriteChecked = overwriteAll || Boolean(overwriteSelected?.[entryId]?.has(fieldKey));
  const mergeChecked = !overwriteChecked && (adoptAll || explicitlySelected);

  const renderObj = (val) => {
    if (!val) return <div style={fieldBoxStyle}>(empty)</div>;
    const entries = Object.entries(val).filter(([, v]) => v !== null && v !== undefined && v !== "");
    if (entries.length === 0) return <div style={fieldBoxStyle}>(empty)</div>;
    return (
      <div style={fieldBoxStyle}>
        {entries.map(([k, v]) => (
          <div key={k} style={{ marginBottom: 8 }}>
            {isRichTextDocument(v) ? (
              <div>{documentToReactComponents(v)}</div>
            ) : typeof v === "object" ? null : (
              <div><strong style={{ color: "#555", fontSize: 12 }}>{k}:</strong>{" "}{String(v)}</div>
            )}
          </div>
        ))}
      </div>
    );
  };

  return (
    <div
      style={{
        marginBottom: 15,
        padding: 10,
        border: "1px solid #ddd",
        borderRadius: 6,
        backgroundColor: changed ? "#fffef8" : "#f6f6f6",
        ...indentStyle,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
        <strong>
          {fieldUrl ? (
            <a href={fieldUrl} target="_blank" rel="noopener noreferrer">{fieldKey}</a>
          ) : fieldKey}
        </strong>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12 }}>
            <input
              type="checkbox"
              checked={mergeChecked}
              disabled={overwriteAll}
              onChange={(e) => onToggleField(entryId, fieldKey, e.target.checked)}
            />
            Merge
          </label>
          <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12 }}>
            <input
              type="checkbox"
              checked={overwriteChecked}
              disabled={overwriteAll}
              onChange={(e) => onToggleOverwrite(entryId, fieldKey, e.target.checked)}
            />
            Overwrite
          </label>
        </div>
      </div>
      <div style={{ display: "flex", gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <em style={{ color: "#666", marginBottom: 4, display: "block" }}>Source</em>
          {renderObj(source)}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <em style={{ color: "#666", marginBottom: 4, display: "block" }}>Target</em>
          {renderObj(target)}
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* ServiceDeliverySummaryRenderer — array of { text: richTextDoc, ... }      */
/* -------------------------------------------------------------------------- */
export function ServiceDeliverySummaryRenderer({
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
  overwriteSelected,
  onToggleOverwrite,
}) {
  const indentStyle = { marginLeft: `${level * 20}px` };

  const parse = (raw) => {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw;
    try { const p = JSON.parse(raw); return Array.isArray(p) ? p : []; } catch { return []; }
  };

  const source = parse(node.source);
  const target = parse(node.target);
  const changed = JSON.stringify(source) !== JSON.stringify(target);

  const fieldUrl =
    spaceId && environmentId && entryId
      ? `https://app.contentful.com/spaces/${spaceId}/environments/${environmentId}/entries/${entryId}?focusedField=${encodeURIComponent(fieldKey)}`
      : null;

  const selectedSet = selected?.[entryId];
  const explicitlySelected = Boolean(selectedSet && selectedSet.has(fieldKey));
  const overwriteChecked = overwriteAll || Boolean(overwriteSelected?.[entryId]?.has(fieldKey));
  const mergeChecked = !overwriteChecked && (adoptAll || explicitlySelected);

  const renderSubValue = (k, v) => {
    if (v === null || v === undefined || v === "") return <span style={{ color: "#999" }}>(none)</span>;
    if (isRichTextDocument(v)) return <div style={{ fontSize: 12 }}>{documentToReactComponents(v)}</div>;
    if (typeof v === "object" && v.assetUrl) return <span>{v.altText || v.assetName || "(asset)"}: <a href={v.assetUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12 }}>{v.assetUrl.slice(0, 60)}…</a></span>;
    if (typeof v === "object") return <span style={{ color: "#999", fontSize: 12 }}>(object)</span>;
    return <span>{String(v)}</span>;
  };

  const renderItem = (item, idx) => {
    if (!item || typeof item !== "object") return <div key={idx} style={fieldBoxStyle}>{String(item)}</div>;
    const { text, subhead, ...rest } = item;
    const extraKeys = Object.entries(rest).filter(([, v]) => v !== "" && v !== null && v !== undefined);
    return (
      <div key={idx} style={{ ...fieldBoxStyle, marginBottom: 6, fontSize: 13 }}>
        {text && isRichTextDocument(text) && <div>{documentToReactComponents(text)}</div>}
        {subhead && isRichTextDocument(subhead) && (
          <div style={{ marginTop: 6, borderTop: "1px solid #eee", paddingTop: 4 }}>
            <em style={{ color: "#888", fontSize: 11 }}>subhead</em>
            {documentToReactComponents(subhead)}
          </div>
        )}
        {extraKeys.length > 0 && (
          <div style={{ marginTop: 6, borderTop: "1px solid #eee", paddingTop: 4, display: "flex", flexDirection: "column", gap: 3 }}>
            {extraKeys.map(([k, v]) => (
              <div key={k} style={{ fontSize: 12 }}>
                <strong style={{ color: "#555" }}>{k}:</strong>{" "}
                {renderSubValue(k, v)}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  const renderList = (items) => {
    if (!items || items.length === 0) return <div style={fieldBoxStyle}>(empty)</div>;
    return <div>{items.map((item, idx) => renderItem(item, idx))}</div>;
  };

  return (
    <div
      style={{
        marginBottom: 15,
        padding: 10,
        border: "1px solid #ddd",
        borderRadius: 6,
        backgroundColor: changed ? "#fffef8" : "#f6f6f6",
        ...indentStyle,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
        <strong>
          {fieldUrl ? (
            <a href={fieldUrl} target="_blank" rel="noopener noreferrer">{fieldKey}</a>
          ) : fieldKey}
        </strong>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12 }}>
            <input
              type="checkbox"
              checked={mergeChecked}
              disabled={overwriteAll}
              onChange={(e) => onToggleField(entryId, fieldKey, e.target.checked)}
            />
            Merge
          </label>
          <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12 }}>
            <input
              type="checkbox"
              checked={overwriteChecked}
              disabled={overwriteAll}
              onChange={(e) => onToggleOverwrite(entryId, fieldKey, e.target.checked)}
            />
            Overwrite
          </label>
        </div>
      </div>
      <div style={{ display: "flex", gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <em style={{ color: "#666", marginBottom: 4, display: "block" }}>Source</em>
          {renderList(source)}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <em style={{ color: "#666", marginBottom: 4, display: "block" }}>Target</em>
          {renderList(target)}
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* JSON_FIELDS — maps field API names to JSON-array renderers                 */
/* -------------------------------------------------------------------------- */
export const JSON_FIELDS = {
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
