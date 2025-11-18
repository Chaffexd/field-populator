/**
 * Recursively builds a structured diff tree for an entry.
 *
 * - Localized scalar fields → compare source vs target
 * - Non-localized scalar fields → skipped
 * - Reference fields (Link → Entry) → ALWAYS recurse (even if non-localized)
 *   The referenced entry's localized fields are compared by source/target locale.
 *
 * Returns:
 * {
 *   fieldId: {
 *     type: 'field',
 *     source: string | "(empty)" | "",
 *     target: string | "(empty)" | ""
 *   } | {
 *     type: 'reference',
 *     id: string,            // label (can show "srcId → tgtId")
 *     linkEntryId: string,   // the actual entry id we traversed (for deep-links)
 *     children: {...diff tree of referenced entry...}
 *   }
 * }
 */
import { callCMA } from "./rateLimiter";

export async function buildDiffTree({
  entry,
  cma,
  sourceLocale,
  targetLocale,
  defaultLocale,
  cache,
  ctCache = {},
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

    const isRef = def.type === "Link" && def.linkType === "Entry";

    // -----------------------------
    // 1) REFERENCE FIELDS (handled first)
    // -----------------------------
    if (isRef) {
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
      });

      tree[fieldId] = {
        type: "reference",
        id:
          srcId && tgtId && srcId !== tgtId ? `${srcId} → ${tgtId}` : chosenId,
        linkEntryId: chosenId, // ✅ always provide the actual id for deep-linking
        children,
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
