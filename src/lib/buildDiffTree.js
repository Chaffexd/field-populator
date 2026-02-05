import { callCMA } from "./rateLimiter";

export async function buildDiffTree({
  entry,
  cma,
  sourceLocale,
  targetLocale,
  defaultLocale,
  cache,
  visited = new Set(),

  // ✅ NEW safety controls
  depth = 0,
  maxDepth = 4, // tune: 3–5 is usually plenty for UI
  maxNodes = 250, // tune: hard cap across the whole traversal

  ctCache = {},
  assetCache = {},
}) {
  const JSON_APP_FIELDS = new Set([
    "demonstratedResults",
    "features",
    "imageGallery",
    "featuredProducts",
    "relatedProducts",
  ]);

  const tree = {};
  if (!entry?.fields) return tree;

  const entryId = entry.sys.id;

  // ✅ HARD STOP: too many nodes expanded already
  if (visited.size >= maxNodes) {
    return {
      type: "circular",
      entryId,
      message: "Traversal limit reached – tree truncated",
    };
  }

  // ✅ HARD STOP: too deep
  if (depth >= maxDepth) {
    return {
      type: "circular",
      entryId,
      message: "Max depth reached – traversal stopped",
    };
  }

  // ✅ Stop re-expanding entries (prevents massive DAG explosion)
  // (This used to be “circular”; now it also means “already expanded somewhere else”.)
  if (visited.has(entryId)) {
    return {
      type: "circular",
      entryId,
      message: "Already expanded – traversal stopped",
    };
  }

  visited.add(entryId);

  const envId = entry.sys.environment.sys.id;
  const spaceId = entry.sys.space.sys.id;

  // Get content type to know which fields are localized
  const contentTypeId = entry.sys?.contentType?.sys?.id;
  let contentType = ctCache[contentTypeId];
  if (!contentType) {
    contentType = await callCMA(() =>
      cma.contentType.get({
        contentTypeId,
        environmentId: envId,
        spaceId,
      })
    );
    ctCache[contentTypeId] = contentType;
  }

  const fieldDefs = Object.fromEntries(
    (contentType.fields || []).map((f) => [f.id, f])
  );

  for (const [fieldId, localizedValues] of Object.entries(entry.fields)) {
    const def = fieldDefs[fieldId];
    if (!def) continue;

    const isEntryRef = def.type === "Link" && def.linkType === "Entry";
    const isEntryArrayRef =
      def.type === "Array" &&
      def.items?.type === "Link" &&
      def.items.linkType === "Entry";
    const isAssetLink = def.type === "Link" && def.linkType === "Asset";
    const isRichText = def.type === "RichText";

    // -----------------------------
    // 1) SINGLE ENTRY REFERENCE FIELDS
    // -----------------------------
    if (isEntryRef) {
      const getLinkForSide = (wantedLocale) => {
        if (def.localized) return localizedValues?.[wantedLocale] ?? null;
        return (
          localizedValues?.[defaultLocale] ??
          (typeof localizedValues === "object"
            ? Object.values(localizedValues)[0]
            : null) ??
          null
        );
      };

      const srcLink = getLinkForSide(sourceLocale);
      const tgtLink = getLinkForSide(targetLocale);

      const srcId = srcLink?.sys?.id || null;
      const tgtId = tgtLink?.sys?.id || null;

      if (!srcId && !tgtId) {
        tree[fieldId] = { type: "field", source: "", target: "(empty)" };
        continue;
      }

      const chosenId = srcId || tgtId;

      let referencedEntry = cache[chosenId];
      if (!referencedEntry) {
        referencedEntry = await callCMA(() =>
          cma.entry.get({
            entryId: chosenId,
            environmentId: envId,
            spaceId,
          })
        );
        cache[chosenId] = referencedEntry;
      }

      // 🧩 TEMPLATE SHORT-CIRCUIT
      if (isTemplateEntry(referencedEntry)) {
        tree[fieldId] = {
          type: "template",
          entryId: chosenId,
          title:
            referencedEntry.fields?.title?.[defaultLocale] ||
            referencedEntry.fields?.title?.[sourceLocale] ||
            "(no title)",
          slug:
            referencedEntry.fields?.slug?.[defaultLocale] ||
            referencedEntry.fields?.slug?.[sourceLocale] ||
            "(no slug)",
        };
        continue;
      }

      // Already expanded elsewhere
      if (visited.has(chosenId)) {
        tree[fieldId] = {
          type: "reference",
          id:
            srcId && tgtId && srcId !== tgtId
              ? `${srcId} → ${tgtId}`
              : chosenId,
          linkEntryId: chosenId,
          children: {
            type: "circular",
            entryId: chosenId,
            message: "Already expanded – traversal stopped",
          },
        };
        continue;
      }

      const children = await buildDiffTree({
        entry: referencedEntry,
        cma,
        sourceLocale,
        targetLocale,
        defaultLocale,
        cache,
        visited,
        depth: depth + 1,
        maxDepth,
        maxNodes,
        ctCache,
        assetCache,
      });

      tree[fieldId] = {
        type: "reference",
        id:
          srcId && tgtId && srcId !== tgtId ? `${srcId} → ${tgtId}` : chosenId,
        linkEntryId: chosenId,
        children,
      };
      continue;
    }

    // -----------------------------
    // 1a) MULTI ENTRY REFERENCE (ARRAY OF LINKS)
    // -----------------------------
    // -----------------------------
    // 1a) MULTI ENTRY REFERENCE (ARRAY OF LINKS)
    // -----------------------------
    if (isEntryArrayRef) {
      const getLinksForSide = (wantedLocale) => {
        if (def.localized) return localizedValues?.[wantedLocale] ?? [];
        const raw =
          localizedValues?.[defaultLocale] ??
          (Array.isArray(localizedValues)
            ? localizedValues
            : typeof localizedValues === "object"
            ? Object.values(localizedValues)[0]
            : []);
        return raw || [];
      };

      const srcLinks = getLinksForSide(sourceLocale) || [];
      const tgtLinks = getLinksForSide(targetLocale) || [];

      const srcIds = srcLinks.map((l) => l?.sys?.id).filter(Boolean);
      const tgtIds = tgtLinks.map((l) => l?.sys?.id).filter(Boolean);

      if (srcIds.length === 0 && tgtIds.length === 0) {
        tree[fieldId] = { type: "field", source: "", target: "(empty)" };
        continue;
      }

      const allIds = Array.from(new Set([...srcIds, ...tgtIds]));
      const listChildren = {};

      for (const linkedId of allIds) {
        if (!linkedId) continue;

        if (visited.size >= maxNodes) {
          listChildren[linkedId] = {
            type: "circular",
            entryId: linkedId,
            message: "Traversal limit reached – list truncated",
          };
          continue;
        }

        let referencedEntry = cache[linkedId];
        if (!referencedEntry) {
          referencedEntry = await callCMA(() =>
            cma.entry.get({
              entryId: linkedId,
              environmentId: envId,
              spaceId,
            })
          );
          cache[linkedId] = referencedEntry;
        }

        // 🧩 TEMPLATE SHORT-CIRCUIT
        if (isTemplateEntry(referencedEntry)) {
          listChildren[linkedId] = {
            type: "template",
            entryId: linkedId,
            title:
              referencedEntry.fields?.title?.[defaultLocale] ||
              referencedEntry.fields?.title?.[sourceLocale] ||
              "(no title)",
            slug:
              referencedEntry.fields?.slug?.[defaultLocale] ||
              referencedEntry.fields?.slug?.[sourceLocale] ||
              "(no slug)",
          };
          continue;
        }

        if (visited.has(linkedId)) {
          listChildren[linkedId] = {
            type: "reference",
            id: linkedId,
            linkEntryId: linkedId,
            children: {
              type: "circular",
              entryId: linkedId,
              message: "Already expanded – traversal stopped",
            },
          };
          continue;
        }

        const childTree = await buildDiffTree({
          entry: referencedEntry,
          cma,
          sourceLocale,
          targetLocale,
          defaultLocale,
          cache,
          visited,
          depth: depth + 1,
          maxDepth,
          maxNodes,
          ctCache,
          assetCache,
        });

        listChildren[linkedId] = {
          type: "reference",
          id: linkedId,
          linkEntryId: linkedId,
          children: childTree,
        };
      }

      tree[fieldId] = {
        type: "reference-list",
        children: listChildren,
      };
      continue;
    }

    // -----------------------------
    // 1b) ASSET / IMAGE FIELDS
    // -----------------------------
    if (isAssetLink) {
      const getLinkForSide = (wantedLocale) => {
        if (def.localized) {
          return localizedValues?.[wantedLocale] ?? null;
        }
        return (
          localizedValues?.[defaultLocale] ??
          (typeof localizedValues === "object"
            ? Object.values(localizedValues)[0]
            : null) ??
          null
        );
      };

      const srcLink = getLinkForSide(sourceLocale);
      const tgtLink = getLinkForSide(targetLocale);

      const srcId = srcLink?.sys?.id || null;
      const tgtId = tgtLink?.sys?.id || null;

      const getAsset = async (id) => {
        if (!id) return null;
        if (assetCache[id]) return assetCache[id];
        const asset = await callCMA(() =>
          cma.asset.get({
            assetId: id,
            environmentId: envId,
            spaceId,
          })
        );
        assetCache[id] = asset;
        return asset;
      };

      const [srcAsset, tgtAsset] = await Promise.all([
        getAsset(srcId),
        getAsset(tgtId),
      ]);

      const getImageUrl = (asset, locale) => {
        if (!asset?.fields?.file) return null;
        const fileField = asset.fields.file;

        const file =
          fileField[locale] ||
          fileField[defaultLocale] ||
          (typeof fileField === "object" ? Object.values(fileField)[0] : null);

        const url = file?.url;
        if (!url) return null;
        return url.startsWith("http") ? url : `https:${url}`;
      };

      tree[fieldId] = {
        type: "field",
        source: srcId || "",
        target: tgtId || "(empty)",
        isImage: true,
        sourceImageUrl: getImageUrl(srcAsset, sourceLocale),
        targetImageUrl: getImageUrl(tgtAsset, targetLocale),
      };

      continue;
    }

    // -----------------------------
    // 2) NON-REFERENCE FIELDS
    // -----------------------------
    let sourceVal;
    let targetVal;

    if (def.localized) {
      sourceVal = localizedValues?.[sourceLocale] ?? null;
      targetVal = localizedValues?.[targetLocale] ?? null;
    } else {
      sourceVal =
        localizedValues?.[defaultLocale] ??
        (typeof localizedValues === "object"
          ? Object.values(localizedValues)[0]
          : null);

      targetVal = sourceVal;
    }

    // 🔥 Preserve raw JSON for app-managed JSON fields
    if (JSON_APP_FIELDS.has(fieldId)) {
      tree[fieldId] = {
        type: "field",
        source: sourceVal ?? null,
        target: targetVal ?? null,
        isJson: true,
      };
      continue;
    }

    // Default behaviour for normal fields
    // ✅ Rich Text: keep doc AND expand embedded entries
    if (isRichText) {
      const srcDoc = sourceVal ?? null;
      const tgtDoc = targetVal ?? null;

      const srcEmbeddedIds = Array.from(
        extractEmbeddedEntryIdsFromRichText(srcDoc)
      );
      const tgtEmbeddedIds = Array.from(
        extractEmbeddedEntryIdsFromRichText(tgtDoc)
      );

      const allEmbeddedIds = Array.from(
        new Set([...srcEmbeddedIds, ...tgtEmbeddedIds])
      );

      const embeddedChildren = {};

      for (const embeddedId of allEmbeddedIds) {
        if (!embeddedId) continue;

        let embeddedEntry = cache[embeddedId];
        if (!embeddedEntry) {
          embeddedEntry = await callCMA(() =>
            cma.entry.get({
              entryId: embeddedId,
              environmentId: envId,
              spaceId,
            })
          );
          cache[embeddedId] = embeddedEntry;
        }

        // If embedded entry is a template, short-circuit
        if (isTemplateEntry(embeddedEntry)) {
          embeddedChildren[embeddedId] = {
            type: "template",
            entryId: embeddedId,
            title:
              embeddedEntry.fields?.title?.[defaultLocale] ||
              embeddedEntry.fields?.title?.[sourceLocale] ||
              "(no title)",
            slug:
              embeddedEntry.fields?.slug?.[defaultLocale] ||
              embeddedEntry.fields?.slug?.[sourceLocale] ||
              "(no slug)",
          };
          continue;
        }

        // Expand embedded entry as a reference subtree
        const childTree = await buildDiffTree({
          entry: embeddedEntry,
          cma,
          sourceLocale,
          targetLocale,
          defaultLocale,
          cache,
          visited,
          depth: depth + 1,
          maxDepth,
          maxNodes,
          ctCache,
          assetCache,
        });

        embeddedChildren[embeddedId] = {
          type: "reference",
          id: embeddedId,
          linkEntryId: embeddedId,
          children: childTree,
        };
      }

      tree[fieldId] = {
        type: "field",
        source: srcDoc,
        target: tgtDoc,
        isRichText: true,

        // 🔥 this is what DiffChecker needs to render embedded entry content
        embeddedChildren,
      };

      continue;
    }

    // Default behaviour for normal fields
    tree[fieldId] = {
      type: "field",
      source: sourceVal ?? null,
      target: targetVal ?? null,
      fieldType: def.type,
    };
  }

  return tree;
}

function safeStringify(value, maxLength = 5000) {
  const seen = new WeakSet();

  try {
    const str = JSON.stringify(
      value,
      (key, val) => {
        if (typeof val === "object" && val !== null) {
          if (seen.has(val)) return "[Circular]";
          seen.add(val);
        }

        // Strip huge Contentful sys blobs
        if (key === "sys") {
          return {
            id: val.id,
            type: val.type,
            linkType: val.linkType,
          };
        }

        return val;
      },
      2
    );

    if (str.length > maxLength) {
      return str.slice(0, maxLength) + "\n…(truncated)";
    }

    return str;
  } catch {
    return String(value);
  }
}

/** Converts various field types to string for diffing */
function stringifyFieldValue(value) {
  if (typeof value === "string") return value;

  if (value?.nodeType === "document") {
    return richTextToStableDiffString(value).trim();
  }

  return safeStringify(value);
}

/** Extract plain text from a Rich Text document */
function richTextToStableDiffString(node) {
  if (!node || typeof node !== "object") return "";

  // TEXT
  if (node.nodeType === "text") {
    return node.value || "";
  }

  // EMBEDDED ENTRIES (block + inline)
  if (
    node.nodeType === "embedded-entry-block" ||
    node.nodeType === "embedded-entry-inline"
  ) {
    const id = node?.data?.target?.sys?.id;
    return `\n<EMBEDDED_ENTRY:${id || "unknown"}>\n`;
  }

  // EMBEDDED ASSETS
  if (node.nodeType === "embedded-asset-block") {
    const id = node?.data?.target?.sys?.id;
    return `\n<EMBEDDED_ASSET:${id || "unknown"}>\n`;
  }

  // ENTRY HYPERLINKS (these matter too!)
  if (node.nodeType === "entry-hyperlink") {
    const id = node?.data?.target?.sys?.id;
    return `<ENTRY_LINK:${id || "unknown"}>`;
  }

  // Recurse children
  if (Array.isArray(node.content)) {
    const childText = node.content.map(richTextToStableDiffString).join("");

    // Add structure-aware spacing
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

function extractEmbeddedEntryIdsFromRichText(node, ids = new Set()) {
  if (!node || typeof node !== "object") return ids;

  const entryNodeTypes = new Set([
    "embedded-entry-block",
    "embedded-entry-inline",
    "entry-hyperlink",
  ]);

  if (entryNodeTypes.has(node.nodeType)) {
    const id = node?.data?.target?.sys?.id;
    if (id) ids.add(id);
  }

  if (Array.isArray(node.content)) {
    for (const child of node.content) {
      extractEmbeddedEntryIdsFromRichText(child, ids);
    }
  }

  return ids;
}

function isTemplateEntry(entry) {
  const ct = (entry?.sys?.contentType?.sys?.id || "").toLowerCase();
  return ct.startsWith("template") || ct === "article";
}
