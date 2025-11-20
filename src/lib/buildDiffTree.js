import { callCMA } from "./rateLimiter";

export async function buildDiffTree({
  entry,
  cma,
  sourceLocale,
  targetLocale,
  defaultLocale,
  cache,
  ctCache = {},
  assetCache = {},
}) {
  const tree = {};
  if (!entry?.fields) return tree;

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
      // Helper: get the link value for a side
      const getLinkForSide = (wantedLocale) => {
        if (def.localized) {
          return localizedValues?.[wantedLocale] ?? null;
        }
        // not localized → use default or first available
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
        // no reference on either side
        tree[fieldId] = {
          type: "field",
          source: "",
          target: "(empty)",
        };
        continue;
      }

      // Use one id to traverse, prefer source
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

      const children = await buildDiffTree({
        entry: referencedEntry,
        cma,
        sourceLocale,
        targetLocale,
        defaultLocale,
        cache,
        ctCache,
        assetCache,
      });

      tree[fieldId] = {
        type: "reference",
        id:
          srcId && tgtId && srcId !== tgtId ? `${srcId} → ${tgtId}` : chosenId,
        linkEntryId: chosenId, // for deep-linking and selection
        children,
      };
      continue;
    }

    // -----------------------------
    // 1a) MULTI ENTRY REFERENCE (ARRAY OF LINKS) – NEW
    // -----------------------------
    if (isEntryArrayRef) {
      const getLinksForSide = (wantedLocale) => {
        if (def.localized) {
          return localizedValues?.[wantedLocale] ?? [];
        }

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
        tree[fieldId] = {
          type: "field",
          source: "",
          target: "(empty)",
        };
        continue;
      }

      const allIds = Array.from(new Set([...srcIds, ...tgtIds]));
      const listChildren = {};

      for (const linkedId of allIds) {
        if (!linkedId) continue;

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

        const childTree = await buildDiffTree({
          entry: referencedEntry,
          cma,
          sourceLocale,
          targetLocale,
          defaultLocale,
          cache,
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

      // Helper: fetch asset with caching
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
    if (!def.localized) {
      // Skip non-localized scalar fields entirely
      continue;
    }

    const sourceVal = localizedValues?.[sourceLocale] ?? null;
    const targetVal = localizedValues?.[targetLocale] ?? null;

    // Normalize for display
    tree[fieldId] = {
      type: "field",
      source: sourceVal == null ? "" : stringifyFieldValue(sourceVal),
      target: targetVal == null ? "(empty)" : stringifyFieldValue(targetVal),
    };
  }

  return tree;
}

/** Converts various field types to string for diffing */
function stringifyFieldValue(value) {
  if (typeof value === "string") return value;
  if (value?.nodeType === "document") {
    return extractPlainTextFromRichText(value);
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
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
