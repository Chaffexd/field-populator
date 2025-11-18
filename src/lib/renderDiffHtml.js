import { diff_match_patch, DIFF_DELETE, DIFF_INSERT } from "diff-match-patch";

const dmp = new diff_match_patch();

/** Extract plain text from a Contentful Rich Text document. */
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

/** Get a localized field value (strict: no fallback). */
function getLocalizedStrict(fields, key, locale) {
  const obj = fields?.[key] || {};
  return obj?.[locale];
}

/**
 * Normalize a field value into a string for diffing.
 * - Strings: as-is
 * - Entry refs: resolved (cached per entryId+locale) & summarized using the EXACT locale (no fallback)
 * - Assets: [Asset <id>]
 * - Rich text: plain text
 * - Objects/arrays: JSON
 */
export async function normalizeForDiff(
  value,
  cma,
  cache = {},
  locale = "en-US"
) {
  if (value == null) return "";
  if (typeof value === "string") return value;

  // Entry reference
  if (
    typeof value === "object" &&
    value.sys?.type === "Link" &&
    value.sys.linkType === "Entry"
  ) {
    const refId = value.sys.id;
    const cacheKey = `${refId}:${locale}`; // ✅ cache per entry + locale

    if (cache[cacheKey]) return cache[cacheKey];

    try {
      const referencedEntry = await cma.entry.get({ entryId: refId });
      const fields = referencedEntry.fields || {};

      // Title strictly in requested locale (no fallback)
      const title =
        getLocalizedStrict(fields, "title", locale) ??
        getLocalizedStrict(fields, "headline", locale) ??
        getLocalizedStrict(fields, "name", locale) ??
        `[Entry ${refId}] (no ${locale} content)`;

      // Prefer a few human-readable fields
      const preferredOrder = [
        "headline",
        "title",
        "name",
        "summary",
        "slug",
        "description",
      ];
      const orderedKeys = Array.from(
        new Set([...preferredOrder, ...Object.keys(fields || {})])
      );

      const summaryParts = [];
      for (const key of orderedKeys) {
        if (summaryParts.length >= 3) break;

        const fieldVal = getLocalizedStrict(fields, key, locale);
        if (fieldVal == null) continue;

        let displayVal = "";
        if (typeof fieldVal === "string") {
          displayVal = fieldVal;
        } else if (fieldVal?.nodeType === "document") {
          displayVal = extractPlainTextFromRichText(fieldVal);
        } else if (
          fieldVal?.sys?.type === "Link" &&
          fieldVal.sys.linkType === "Asset"
        ) {
          displayVal = `[Asset ${fieldVal.sys.id}]`;
        } else if (
          fieldVal?.sys?.type === "Link" &&
          fieldVal.sys.linkType === "Entry"
        ) {
          displayVal = `[Entry ${fieldVal.sys.id}]`;
        } else {
          displayVal = JSON.stringify(fieldVal);
        }

        if (typeof title === "string" && displayVal === title) continue;
        summaryParts.push(`${key}: "${displayVal}"`);
      }

      const result = `[Reference: ${title}]\n${
        summaryParts.join("\n") || "(no fields in locale)"
      }`;
      cache[cacheKey] = result; // ✅ store by entry + locale
      return result;
    } catch (e) {
      console.warn("Failed to resolve reference", value, e);
      return `[Reference: ${value.sys.id}]`;
    }
  }

  // Asset reference
  if (
    typeof value === "object" &&
    value.sys?.type === "Link" &&
    value.sys.linkType === "Asset"
  ) {
    return `[Asset ${value.sys.id}]`;
  }

  // Rich text
  if (value?.nodeType === "document") {
    return extractPlainTextFromRichText(value);
  }

  // Fallback
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

/** Escape HTML for safe dangerouslySetInnerHTML */
function escapeHtml(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Compute HTML diffs between two strings with ins/del styling. */
export function renderDiffHtml(source = "", target = "") {
  const diffs = dmp.diff_main(source, target);
  dmp.diff_cleanupSemantic(diffs);

  return diffs
    .map(([op, text]) => {
      if (op === DIFF_INSERT) {
        return `<ins style="background-color:#e6ffed;text-decoration:none;">${escapeHtml(
          text
        )}</ins>`;
      }
      if (op === DIFF_DELETE) {
        return `<del style="background-color:#ffeef0;">${escapeHtml(
          text
        )}</del>`;
      }
      return `<span>${escapeHtml(text)}</span>`;
    })
    .join("");
}
