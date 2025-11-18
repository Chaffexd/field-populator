// mergeRichText.js
import { diff_match_patch } from "diff-match-patch";

const dmp = new diff_match_patch();

/**
 * Public API
 * Merge source Rich Text into target Rich Text using Option B:
 * - Insert-only (never delete target content)
 * - Insert in the correct semantic position (diff from target -> source)
 * - RT-FMT2: inserted text inherits formatting/container (marks, hyperlinks) from
 *   the node at the insertion point in the target paragraph.
 */
export function mergeRichTextDocuments(sourceDoc, targetDoc) {
  if (!isRichTextDocument(sourceDoc) || !isRichTextDocument(targetDoc)) {
    return targetDoc; // safety
  }

  // Align block-level content by index (RT-NODE1 choice).
  // If source has extra blocks, we append them (insert-only).
  const out = clone(targetDoc);
  const srcBlocks = sourceDoc.content || [];
  const tgtBlocks = out.content || [];

  const maxLen = Math.max(srcBlocks.length, tgtBlocks.length);
  const mergedBlocks = [];

  for (let i = 0; i < maxLen; i++) {
    const srcBlock = srcBlocks[i];
    const tgtBlock = tgtBlocks[i];

    if (!tgtBlock && srcBlock) {
      // Insert-only: new block from source → append as-is
      mergedBlocks.push(clone(srcBlock));
      continue;
    }

    if (tgtBlock && !srcBlock) {
      // Keep target-only block
      mergedBlocks.push(clone(tgtBlock));
      continue;
    }

    // Both present:
    if (srcBlock.nodeType !== tgtBlock.nodeType) {
      // Different block types → preserve target and then insert the source block after
      mergedBlocks.push(clone(tgtBlock), clone(srcBlock));
      continue;
    }

    switch (tgtBlock.nodeType) {
      case "paragraph":
      case "heading-1":
      case "heading-2":
      case "heading-3":
      case "heading-4":
      case "heading-5":
      case "heading-6":
      case "blockquote":
        mergedBlocks.push(mergeInlineBlock(srcBlock, tgtBlock));
        break;

      case "unordered-list":
      case "ordered-list":
        mergedBlocks.push(mergeListBlock(srcBlock, tgtBlock));
        break;

      // For embedded assets/entries and other leaf blocks, keep target (never delete),
      // and if source has something different, append it (insert-only).
      default: {
        // If structurally same, keep target
        if (jsonEq(srcBlock, tgtBlock)) {
          mergedBlocks.push(clone(tgtBlock));
        } else {
          mergedBlocks.push(clone(tgtBlock), clone(srcBlock));
        }
      }
    }
  }

  out.content = coalesceAdjacentTextNodesInBlocks(mergedBlocks);
  return out;
}

/* --------------------------
   Block & Inline Merging
---------------------------*/

function mergeInlineBlock(srcBlock, tgtBlock) {
  // Flatten each block's text content (including hyperlinks) into a linear sequence of spans.
  const srcPara = flattenInlineBlock(srcBlock);
  const tgtPara = flattenInlineBlock(tgtBlock);

  // diff from target → source (Option B)
  const diffs = dmp.diff_main(tgtPara.text, srcPara.text);
  dmp.diff_cleanupSemantic(diffs);

  // Rebuild spans from diffs; preserve target spans; insert new text with target formatting
  const mergedSpans = rebuildSpansFromDiffs(diffs, tgtPara.spans);

  // Build Rich Text block back from spans, keeping the original block nodeType & data
  const rebuilt = buildInlineBlockFromSpans(
    tgtBlock.nodeType,
    tgtBlock.data || {},
    mergedSpans
  );

  return rebuilt;
}

function mergeListBlock(srcList, tgtList) {
  // Merge lists item-by-item (by index). Insert-only:
  const out = clone(tgtList);
  const srcItems = srcList.content || [];
  const tgtItems = out.content || [];
  const maxLen = Math.max(srcItems.length, tgtItems.length);
  const mergedItems = [];

  for (let i = 0; i < maxLen; i++) {
    const srcItem = srcItems[i];
    const tgtItem = tgtItems[i];

    if (!tgtItem && srcItem) {
      mergedItems.push(clone(srcItem)); // append source-only item
      continue;
    }
    if (tgtItem && !srcItem) {
      mergedItems.push(clone(tgtItem)); // keep target-only item
      continue;
    }
    // Both present. List items usually contain a paragraph as first child; merge recursively.
    if (srcItem.nodeType !== tgtItem.nodeType) {
      mergedItems.push(clone(tgtItem), clone(srcItem));
      continue;
    }

    // Merge children blocks item-wise (paragraphs, etc.)
    const childSrc = srcItem.content || [];
    const childTgt = tgtItem.content || [];
    const maxChild = Math.max(childSrc.length, childTgt.length);
    const childMerged = [];
    for (let j = 0; j < maxChild; j++) {
      const cs = childSrc[j];
      const ct = childTgt[j];
      if (!ct && cs) {
        childMerged.push(clone(cs));
      } else if (ct && !cs) {
        childMerged.push(clone(ct));
      } else if (cs.nodeType === ct.nodeType) {
        if (isInlineBlockType(ct.nodeType)) {
          childMerged.push(mergeInlineBlock(cs, ct));
        } else {
          // fallback keep target + append source
          if (jsonEq(cs, ct)) childMerged.push(clone(ct));
          else childMerged.push(clone(ct), clone(cs));
        }
      } else {
        childMerged.push(clone(ct), clone(cs));
      }
    }

    const newItem = clone(tgtItem);
    newItem.content = coalesceAdjacentTextNodesInBlocks(childMerged);
    mergedItems.push(newItem);
  }

  out.content = mergedItems;
  return out;
}

/* --------------------------
   Span Flatten/Rebuild
---------------------------*/

/**
 * Flatten a paragraph/heading/blockquote into
 *   { text: "full text", spans: [{ start, end, marks:[], hyperlink:null|{data}, text }] }
 * We treat "hyperlink" nodes as containers around text nodes.
 */
function flattenInlineBlock(block) {
  const spans = [];
  let text = "";

  function pushSpan(t, marks = [], hyperlink = null) {
    if (!t) return;
    spans.push({
      start: text.length,
      end: text.length + t.length,
      marks: cloneMarks(marks),
      hyperlink: hyperlink ? cloneHyperlink(hyperlink) : null,
      text: t,
    });
    text += t;
  }

  function walk(nodes, activeMarks = [], activeHyperlink = null) {
    for (const node of nodes || []) {
      switch (node.nodeType) {
        case "text":
          pushSpan(
            node.value || "",
            node.marks || activeMarks,
            activeHyperlink
          );
          break;
        case "hyperlink":
          // Walk children inside hyperlink container
          walk(node.content || [], node.marks || activeMarks, node);
          break;
        // list, embedded, etc. shouldn't appear at this level for paragraph/heading, but ignore safely
        default:
          if (Array.isArray(node.content)) {
            walk(node.content, node.marks || activeMarks, activeHyperlink);
          }
      }
    }
  }

  walk(block.content || []);
  return { text, spans };
}

// Build a block back from spans (merging adjacent like-formatted spans).
function buildInlineBlockFromSpans(nodeType, data, spans) {
  const content = [];
  let currentHyperlink = null;
  let currentMarksKey = "";
  let currentMarks = [];
  let currentText = "";

  function flushText() {
    if (!currentText) return;
    const textNode = {
      nodeType: "text",
      value: currentText,
      marks: currentMarks,
      data: {},
    };
    if (currentHyperlink) {
      content.push({
        nodeType: "hyperlink",
        data: clone(currentHyperlink.data || {}),
        content: [textNode],
      });
    } else {
      content.push(textNode);
    }
    currentText = "";
  }

  function keyFor(marks, hyperlink) {
    const m = (marks || [])
      .map((m) => m.type)
      .sort()
      .join("|");
    const h = hyperlink ? JSON.stringify(hyperlink.data || {}) : "";
    return `${m}::${h}`;
  }

  for (const s of spans) {
    const k = keyFor(s.marks, s.hyperlink);
    if (k !== currentMarksKey) {
      flushText();
      currentMarksKey = k;
      currentMarks = normalizeMarks(s.marks || []);
      currentHyperlink = s.hyperlink
        ? { data: clone(s.hyperlink.data || {}) }
        : null;
    }
    currentText += s.text || "";
  }
  flushText();

  return { nodeType, data: data || {}, content };
}

/**
 * Rebuild spans from diffs, inheriting formatting from the target at insertion point.
 * diffs are from targetText -> sourceText.
 * For op:
 *   0 = equal     → copy the corresponding target spans segment
 *  -1 = delete    → keep target segment (insert-only means do NOT remove)
 *   1 = insert    → create new span with marks/hyperlink of the span at current cursor
 */
function rebuildSpansFromDiffs(diffs, targetSpans) {
  const out = [];
  let cursor = 0; // position in targetText

  for (const [op, text] of diffs) {
    const len = text.length;

    if (op === 0 || op === -1) {
      // Copy existing chunk (equal or delete → we KEEP target content)
      const slice = sliceSpans(targetSpans, cursor, cursor + len);
      out.push(...slice);
      cursor += len;
    } else if (op === 1) {
      // Insertion from source → create a span at current insertion point, inheriting formatting
      const inherit =
        spanAtPosition(targetSpans, cursor) ||
        spanAtPosition(targetSpans, cursor - 1);
      out.push({
        start: -1,
        end: -1,
        marks: inherit ? cloneMarks(inherit.marks) : [],
        hyperlink:
          inherit && inherit.hyperlink
            ? cloneHyperlink(inherit.hyperlink)
            : null,
        text,
      });
      // cursor does not move on insertion
    }
  }

  // Coalesce adjacent spans with same formatting
  return coalesceSpans(out);
}

/* --------------------------
   Span Utilities
---------------------------*/

function sliceSpans(spans, start, end) {
  if (start >= end) return [];
  const out = [];
  for (const s of spans) {
    if (s.end <= start || s.start >= end) continue;
    const from = Math.max(start, s.start);
    const to = Math.min(end, s.end);
    const text = s.text.slice(from - s.start, to - s.start);
    out.push({
      start: from,
      end: to,
      marks: cloneMarks(s.marks),
      hyperlink: s.hyperlink ? cloneHyperlink(s.hyperlink) : null,
      text,
    });
  }
  return out;
}

function spanAtPosition(spans, pos) {
  if (pos < 0) return null;
  for (const s of spans) {
    if (pos >= s.start && pos < s.end) return s;
  }
  // If exactly at end of last span, inherit that span
  if (spans.length && pos === spans[spans.length - 1].end) {
    return spans[spans.length - 1];
  }
  return null;
}

function coalesceSpans(spans) {
  const out = [];
  let prev = null;
  for (const s of spans) {
    if (
      prev &&
      sameMarks(prev.marks, s.marks) &&
      sameHyperlink(prev.hyperlink, s.hyperlink)
    ) {
      prev.text += s.text;
    } else {
      prev = { ...s };
      out.push(prev);
    }
  }
  return out;
}

/* --------------------------
   Helpers
---------------------------*/

function isRichTextDocument(val) {
  return (
    val &&
    typeof val === "object" &&
    val.nodeType === "document" &&
    Array.isArray(val.content)
  );
}

function isInlineBlockType(nodeType) {
  return (
    nodeType === "paragraph" ||
    nodeType === "heading-1" ||
    nodeType === "heading-2" ||
    nodeType === "heading-3" ||
    nodeType === "heading-4" ||
    nodeType === "heading-5" ||
    nodeType === "heading-6" ||
    nodeType === "blockquote"
  );
}

function coalesceAdjacentTextNodesInBlocks(blocks) {
  // We already coalesce inside buildInlineBlockFromSpans. This is a noop placeholder in case
  // other block types need normalization later.
  return blocks;
}

function normalizeMarks(marks) {
  // Ensure marks are in the Contentful expected shape and deduped
  const by = new Map();
  for (const m of marks || []) {
    if (m && m.type) by.set(m.type, { type: m.type });
  }
  return Array.from(by.values());
}

function clone(v) {
  return v == null ? v : JSON.parse(JSON.stringify(v));
}

function jsonEq(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function sameMarks(a = [], b = []) {
  if (a.length !== b.length) return false;
  const as = a
    .map((m) => m.type)
    .sort()
    .join("|");
  const bs = b
    .map((m) => m.type)
    .sort()
    .join("|");
  return as === bs;
}

function sameHyperlink(a, b) {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return JSON.stringify(a.data || {}) === JSON.stringify(b.data || {});
}

function cloneMarks(marks) {
  return (marks || []).map((m) => ({ type: m.type }));
}

function cloneHyperlink(h) {
  return { data: clone(h.data || {}) };
}
