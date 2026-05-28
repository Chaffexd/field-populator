import React, { useState } from "react";
import { toDiffableString, parseJsonAssetField } from "../../lib/helpers";
import {
  asString,
  parseJsonOnce,
  richTextToStableDiffString,
  buildFieldUrl,
  renderDiffHtmlSourceGreen,
  renderDiffHtmlTargetRed,
} from "./diffUtils";
import {
  SafeEntryCard,
  LTagRenderer,
  TagRenderer,
  HeroCards,
  DemonstratedResults,
  Features,
  ImageGallery,
  ProductList,
  FrontendTagsRenderer,
  RelatedProductPortfolioRenderer,
  MainImageAssetRenderer,
  CategoryUrlRenderer,
  PromoBanner,
  RichTextDiffWithEmbeddedRefs,
  SecondaryFeatures,
  MediaGallery,
  FeaturedSolutions,
  JSON_FIELDS,
  fieldBoxStyle,
} from "./FieldRenderers";

export function NodeRenderer({
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
  overwriteSelected,
  onToggleOverwrite,
  hiddenFields,
}) {
  const indentStyle = { marginLeft: `${level * 20}px` };

  /* ---------------------------------------------------------------------- */
  /* 🔥 HIDE THESE FIELDS COMPLETELY (VISUALLY ONLY)                        */
  /* ---------------------------------------------------------------------- */
  const hiddenFieldsSet = new Set(hiddenFields ?? []);
  if (hiddenFieldsSet.has(fieldKey)) {
    return null;
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
          overwriteSelected={overwriteSelected}
          onToggleOverwrite={onToggleOverwrite}
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
        overwriteSelected={overwriteSelected}
        onToggleOverwrite={onToggleOverwrite}
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
    const jsonFieldOverwriteChecked = overwriteAll || Boolean(overwriteSelected?.[entryId]?.has(fieldKey));
    const jsonFieldMergeChecked = !jsonFieldOverwriteChecked && (adoptAll || Boolean(selected?.[entryId]?.has(fieldKey)));

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

          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12, color: "#444" }}>
              <input
                type="checkbox"
                checked={jsonFieldMergeChecked}
                disabled={overwriteAll}
                onChange={(e) => onToggleField(entryId, fieldKey, e.target.checked)}
              />
              Merge
            </label>
            <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12, color: "#444" }}>
              <input
                type="checkbox"
                checked={jsonFieldOverwriteChecked}
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
        overwriteAll={overwriteAll}
        overwriteSelected={overwriteSelected}
        onToggleOverwrite={onToggleOverwrite}
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
        overwriteAll={overwriteAll}
        overwriteSelected={overwriteSelected}
        onToggleOverwrite={onToggleOverwrite}
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
        overwriteAll={overwriteAll}
        overwriteSelected={overwriteSelected}
        onToggleOverwrite={onToggleOverwrite}
      />
    );
  }

  /* -------------------------------------------------------------------------- */
  /* 🔥 NEW — CUSTOM RENDERER FOR mainImageasset                                */
  /* -------------------------------------------------------------------------- */
  if (node.type === "field" && (fieldKey === "mainImageasset" || fieldKey === "downloadReference")) {
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
        overwriteAll={overwriteAll}
        overwriteSelected={overwriteSelected}
        onToggleOverwrite={onToggleOverwrite}
      />
    );
  }

  if (node.type === "field" && fieldKey === "categoryUrl") {
    return (
      <CategoryUrlRenderer
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
        overwriteSelected={overwriteSelected}
        onToggleOverwrite={onToggleOverwrite}
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
    const overwriteChecked = overwriteAll || Boolean(overwriteSelected?.[entryId]?.has(fieldKey));
    const mergeChecked = !overwriteChecked && (adoptAll || explicitlySelected);

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
                  overwriteSelected={overwriteSelected}
                  onToggleOverwrite={onToggleOverwrite}
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
                overwriteSelected={overwriteSelected}
                onToggleOverwrite={onToggleOverwrite}
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
        overwriteSelected={overwriteSelected}
        onToggleOverwrite={onToggleOverwrite}
      />
    );
  }

  return null;
}

export function CollapsibleReference({
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
              overwriteSelected={overwriteSelected}
              onToggleOverwrite={onToggleOverwrite}
            />
          ))}
        </div>
      )}
    </div>
  );
}
