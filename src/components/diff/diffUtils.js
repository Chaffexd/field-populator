import { diff_match_patch } from "diff-match-patch";
import { isRichTextDocument } from "../../lib/helpers";

const dmp = new diff_match_patch();

export function extractLTags(raw) {
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

export function asString(val, fallback = "—") {
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

export function extractTags(raw) {
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

export function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function parseJsonOnce(raw) {
  if (!raw || raw === "(empty)") return null;
  if (typeof raw === "object") return raw;

  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function richTextToPlainText(doc) {
  if (!isRichTextDocument(doc)) return "";

  const walk = (node) => {
    if (!node) return "";
    if (node.nodeType === "text") return node.value || "";
    if (!Array.isArray(node.content)) return "";
    return node.content.map(walk).join("");
  };

  return walk(doc).replace(/\s+/g, " ").trim();
}

export function getRelatedEntryCardText(entry) {
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

export function extractFrontendTags(raw) {
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

export function pillVariant(tag, sourceTags, targetTags) {
  const inSource = sourceTags.some((t) => t.id === tag.id);
  const inTarget = targetTags.some((t) => t.id === tag.id);

  if (inSource && !inTarget) return "positive"; // green
  if (!inSource && inTarget) return "negative"; // red
  return "secondary"; // unchanged
}

export function extractRelatedProducts(raw) {
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

export function relatedCardVariant(entry, sourceEntries, targetEntries) {
  const inSource = sourceEntries.some((e) => e.id === entry.id);
  const inTarget = targetEntries.some((e) => e.id === entry.id);

  if (inSource && !inTarget) return "positive";
  if (!inSource && inTarget) return "negative";
  return "secondary";
}

export function extractMainImageAsset(raw) {
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

export function renderDiffHtmlSourceGreen(source = "", target = "") {
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

export function renderDiffHtmlTargetRed(source = "", target = "") {
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

export function buildFieldUrl({ spaceId, environmentId, entryId, fieldKey }) {
  if (!spaceId || !environmentId || !entryId) return undefined;
  return `https://app.contentful.com/spaces/${spaceId}/environments/${environmentId}/entries/${entryId}?focusedField=${encodeURIComponent(
    fieldKey
  )}`;
}

export function parseAssetFromString(value) {
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

export function richTextToStableDiffString(node) {
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
