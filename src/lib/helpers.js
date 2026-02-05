export function isRichTextDocument(v) {
  return (
    v &&
    typeof v === "object" &&
    v.nodeType === "document" &&
    Array.isArray(v.content)
  );
}

export function richTextToDiffString(doc) {
  if (!isRichTextDocument(doc)) return "";

  const walk = (node) => {
    if (!node) return "";

    // text node
    if (node.nodeType === "text") {
      return node.value || "";
    }

    // paragraphs / headings etc -> add spacing
    if (
      node.nodeType === "paragraph" ||
      node.nodeType?.startsWith("heading-") ||
      node.nodeType === "list-item"
    ) {
      return (node.content || []).map(walk).join("") + "\n\n";
    }

    // EMBEDDED ENTRY BLOCK
    if (node.nodeType === "embedded-entry-block") {
      const id = node?.data?.target?.sys?.id;
      return `\n\n[Embedded Entry: ${id || "unknown"}]\n\n`;
    }

    // EMBEDDED ENTRY INLINE
    if (node.nodeType === "embedded-entry-inline") {
      const id = node?.data?.target?.sys?.id;
      return `[Embedded Entry: ${id || "unknown"}]`;
    }

    // EMBEDDED ASSET BLOCK
    if (node.nodeType === "embedded-asset-block") {
      const id = node?.data?.target?.sys?.id;
      return `\n\n[Embedded Asset: ${id || "unknown"}]\n\n`;
    }

    // hyperlink
    if (node.nodeType === "hyperlink") {
      const uri = node?.data?.uri;
      const text = (node.content || []).map(walk).join("");
      return text ? `${text} (${uri || ""})` : uri || "";
    }

    // default: walk children
    if (Array.isArray(node.content)) {
      return node.content.map(walk).join("");
    }

    return "";
  };

  return walk(doc)
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function toDiffableString(val) {
  if (val == null || val === "(empty)") return "";

  if (typeof val === "string") return val;
  if (typeof val === "number" || typeof val === "boolean") return String(val);

  // Rich text
  if (isRichTextDocument(val)) {
    return richTextToDiffString(val);
  }

  // If it's a JSON string containing rich text, try parse
  if (typeof val === "string") {
    try {
      const parsed = JSON.parse(val);
      if (isRichTextDocument(parsed)) {
        return richTextToDiffString(parsed);
      }
    } catch {}
  }

  // fallback
  try {
    return JSON.stringify(val, null, 2);
  } catch {
    return String(val);
  }
}

export function parseEmbeddedEntryTokens(diffString = "") {
  const tokens = [];
  const regex = /<EMBEDDED_ENTRY:([a-zA-Z0-9]{10,})>/g;

  let match;
  while ((match = regex.exec(diffString)) !== null) {
    tokens.push({
      type: "embedded-entry",
      id: match[1],
      start: match.index,
      end: match.index + match[0].length,
      raw: match[0],
    });
  }

  return tokens;
}

export function splitStringByEmbeddedEntryTokens(diffString = "") {
  const tokens = parseEmbeddedEntryTokens(diffString);

  if (tokens.length === 0) {
    return [{ type: "text", value: diffString }];
  }

  const parts = [];
  let lastIndex = 0;

  for (const t of tokens) {
    if (t.start > lastIndex) {
      parts.push({
        type: "text",
        value: diffString.slice(lastIndex, t.start),
      });
    }

    parts.push({
      type: "embedded-entry",
      id: t.id,
    });

    lastIndex = t.end;
  }

  if (lastIndex < diffString.length) {
    parts.push({
      type: "text",
      value: diffString.slice(lastIndex),
    });
  }

  return parts;
}

export function uniqueEmbeddedEntryParts(parts) {
  const seen = new Set();

  return parts.filter((p) => {
    if (p.type !== "embedded-entry") return true;
    if (seen.has(p.id)) return false;
    seen.add(p.id);
    return true;
  });
}

export function buildEntryUrl({ spaceId, environmentId, entryId }) {
  if (!spaceId || !environmentId || !entryId) return null;

  return `https://app.contentful.com/spaces/${spaceId}/environments/${environmentId}/entries/${entryId}`;
}

export function formatEmbeddedEntryLabel(id) {
  if (!id) return "Embedded Entry";
  return `Embedded Entry: ${id}`;
}

export function stripEmbeddedEntryTokens(str = "") {
  return (
    String(str)
      // remove embedded entry tokens
      .replace(/<EMBEDDED_ENTRY:[a-zA-Z0-9]+>\s*/g, "")
      // remove embedded asset tokens too (optional)
      .replace(/<EMBEDDED_ASSET:[a-zA-Z0-9]+>\s*/g, "")
      // clean up extra blank lines
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  );
}

export function normalizeContentfulDate(value) {
  if (value == null) return value;

  // Contentful Date fields are stored as strings
  if (typeof value !== "string") return null;

  const trimmed = value.trim();

  // Valid date-only
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;

  // Valid datetime (Contentful accepts ISO strings)
  if (/^\d{4}-\d{2}-\d{2}T/.test(trimmed)) return trimmed;

  // Try salvage: extract the first YYYY-MM-DD substring
  const match = trimmed.match(/(\d{4}-\d{2}-\d{2})/);
  if (match) return match[1];

  return null;
}

export function parseJsonAssetField(raw) {
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

  const alt = value.altText || value.caption || "";
  const assetType = value.assetType || "";
  const assetName = value.assetName || "";

  // Prefer cover image / thumbnail
  const previewUrl =
    value.assetUrlCoverImg ||
    value.targetUrl ||
    value.tabletRendition ||
    value.mobileRenditionSm ||
    value.mobileRenditionXs ||
    "";

  // If we have an image preview, return it
  if (previewUrl) {
    return {
      kind: "image",
      url: previewUrl,
      alt,
      assetType,
      assetName,
    };
  }

  // If it's a video with no preview, return a video placeholder
  if (
    assetType.toLowerCase() === "video" ||
    value.assetFileExtension === "mp4"
  ) {
    return {
      kind: "video",
      url: value.assetUrl || "",
      alt,
      assetType,
      assetName,
    };
  }

  return null;
}
