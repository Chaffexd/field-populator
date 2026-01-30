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
    tree[fieldId] = {
      type: "field",
      source: sourceVal == null ? "" : stringifyFieldValue(sourceVal),
      target: targetVal == null ? "(empty)" : stringifyFieldValue(targetVal),
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
    return extractPlainTextFromRichText(value);
  }

  return safeStringify(value);
}

/** Extract plain text from a Rich Text document */
function extractPlainTextFromRichText(richText) {
  if (!richText || typeof richText !== "object") return "";
  if (Array.isArray(richText.content)) {
    return richText.content.map(extractPlainTextFromRichText).join(" ");
  }
  if (richText.nodeType === "text") {
    return richText.value || "";
  }
  if (richText.content) {
    return extractPlainTextFromRichText(richText.content);
  }
  return "";
}

function isTemplateEntry(entry) {
  const ct = (entry?.sys?.contentType?.sys?.id || "").toLowerCase();
  return ct.startsWith("template") || ct === "article";
}
