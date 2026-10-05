/**
 * Card-level adopt for JSON "card list" fields (heroCards, demonstratedResults,
 * featuredSolutions). Each of these is ONE localized JSON field holding an
 * array of cards, so field-level overwrite replaces every card at once.
 *
 * Cards have no stable id, and locales remove cards mid-list, so cards are
 * paired across locales by evidence, never by position:
 *   1. a shared identity key (taxonomy id/ctn, pageLink id, product code or
 *      path from ctaUrl with locale segments removed, image URL)
 *   2. otherwise, clearly-similar text (word-set Jaccard) with no rival
 * Anything uncertain is left unmatched; callers skip it and report it.
 */

export const CARD_FIELDS = new Set([
  "heroCards",
  "demonstratedResults",
  "featuredSolutions",
]);

export const isCardField = (fieldId) => CARD_FIELDS.has(fieldId);

const TEXT_MATCH_THRESHOLD = 0.5;
// A text-only match must beat the runner-up by this much, else it's a guess.
const AMBIGUITY_MARGIN = 0.1;

// Keys whose differing values mean "these are different cards". Image URLs
// are excluded: locales legitimately swap images on the same card.
const IDENTITY_KINDS = new Set(["id", "ctn", "page", "url"]);

const TEXT_KEYS = new Set([
  "entryTitle",
  "title",
  "ctaText",
  "eyebrow",
  "altText",
  "caption",
]);

const LOCALE_SEGMENT = /^[a-z]{2}(-[a-z0-9]{2,4})?$/i;

function normalizeUrl(raw) {
  if (typeof raw !== "string" || !raw.trim()) return null;
  const path = raw
    .trim()
    .replace(/^https?:\/\/[^/]+/i, "")
    .split(/[?#]/)[0];
  const parts = path
    .split("/")
    .filter(Boolean)
    .filter((p) => !LOCALE_SEGMENT.test(p));
  const productAt = parts.findIndex((p) => p.toLowerCase() === "product");
  if (productAt !== -1 && parts[productAt + 1]) {
    return `product:${parts[productAt + 1].toLowerCase()}`;
  }
  return parts.length ? parts.join("/").toLowerCase() : null;
}

function assetUrlOf(value) {
  let v = value;
  if (typeof v === "string") {
    try { v = JSON.parse(v); } catch { return null; }
  }
  const url = v?.assetUrl;
  return typeof url === "string" && url ? url.split("?")[0] : null;
}

/** Identity keys as "kind:value" strings. */
export function cardKeys(card) {
  const keys = new Set();
  if (!card || typeof card !== "object") return keys;
  const add = (kind, value) => {
    if (typeof value === "string" && value.trim()) keys.add(`${kind}:${value.trim()}`);
  };
  add("id", card.id);
  add("ctn", card.ctn);
  add("page", card.pageLink?.id);
  add("url", normalizeUrl(card.ctaUrl));
  for (const field of ["heroImage", "imageVideoAsset", "result", "documentAsset"]) {
    add("asset", assetUrlOf(card[field]));
  }
  return keys;
}

function collectText(value, out, key) {
  if (value == null) return out;
  if (typeof value === "string") {
    if (TEXT_KEYS.has(key)) out.push(value);
    return out;
  }
  if (Array.isArray(value)) {
    value.forEach((v) => collectText(v, out, key));
    return out;
  }
  if (typeof value === "object") {
    // Rich text leaf
    if (value.nodeType === "text" && typeof value.value === "string") {
      out.push(value.value);
      return out;
    }
    for (const [k, v] of Object.entries(value)) collectText(v, out, k);
  }
  return out;
}

function tokens(card) {
  const words = collectText(card, [])
    .join(" ")
    .toLowerCase()
    .match(/[\p{L}\p{N}]+/gu);
  return new Set(words || []);
}

function jaccard(a, b) {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const t of a) if (b.has(t)) shared++;
  return shared / (a.size + b.size - shared);
}

const kindOf = (key) => key.slice(0, key.indexOf(":"));

/** Keys present on exactly one card of the list. */
function uniqueKeys(cards) {
  const counts = new Map();
  cards.forEach((c) => c.keys.forEach((k) => counts.set(k, (counts.get(k) || 0) + 1)));
  return new Set([...counts].filter(([, n]) => n === 1).map(([k]) => k));
}

function describe(list) {
  return (Array.isArray(list) ? list : []).map((card) => ({
    keys: cardKeys(card),
    words: tokens(card),
  }));
}

/**
 * Pair source cards with target cards.
 * Returns { pairs } where pairs[sourceIndex] = targetIndex | null.
 */
export function matchCards(source, target) {
  const src = describe(source);
  const tgt = describe(target);
  const pairs = src.map(() => null);
  const takenTarget = new Set();

  // 1. Shared identity key, unique on both sides.
  const srcUnique = uniqueKeys(src);
  const tgtUnique = uniqueKeys(tgt);
  src.forEach((s, si) => {
    for (const key of s.keys) {
      if (!srcUnique.has(key) || !tgtUnique.has(key)) continue;
      const ti = tgt.findIndex((t) => t.keys.has(key));
      if (ti !== -1 && !takenTarget.has(ti)) {
        pairs[si] = ti;
        takenTarget.add(ti);
        return;
      }
    }
  });

  // 2. Text similarity for what's left, excluding cards whose identity keys
  //    say they're different cards.
  const conflicting = (s, t) => {
    const sKinds = new Map([...s.keys].map((k) => [kindOf(k), k]));
    for (const k of t.keys) {
      const kind = kindOf(k);
      if (IDENTITY_KINDS.has(kind) && sKinds.has(kind) && sKinds.get(kind) !== k) {
        return true;
      }
    }
    return false;
  };

  const freeSrc = src.map((_, i) => i).filter((i) => pairs[i] === null);
  const freeTgt = tgt.map((_, i) => i).filter((i) => !takenTarget.has(i));
  const score = (si, ti) =>
    conflicting(src[si], tgt[ti]) ? 0 : jaccard(src[si].words, tgt[ti].words);

  const best = (scores) => {
    const sorted = [...scores].sort((a, b) => b.score - a.score);
    const [first, second] = sorted;
    if (!first || first.score < TEXT_MATCH_THRESHOLD) return null;
    if (second && first.score - second.score < AMBIGUITY_MARGIN) return null;
    return first;
  };

  for (const si of freeSrc) {
    const choice = best(freeTgt.map((ti) => ({ ti, score: score(si, ti) })));
    if (!choice) continue;
    // ...and the source card must be the target card's clear best too.
    const back = best(freeSrc.map((sj) => ({ sj, score: score(sj, choice.ti) })));
    if (back?.sj !== si || takenTarget.has(choice.ti)) continue;
    pairs[si] = choice.ti;
    takenTarget.add(choice.ti);
  }

  return { pairs };
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const clone = (v) => JSON.parse(JSON.stringify(v));

/**
 * Build the target locale's new card list.
 *
 * picks:      { [sourceIndex]: sourceCardAsTicked }. The snapshot guards
 *             against the source having changed since the user looked.
 * addMissing: insert ticked cards the target has no match for (after the
 *             target card matching the nearest earlier source card).
 *
 * Returns { value, skipped: [{ card (1-based), reason }] }. `value` is the
 * untouched target when nothing applies.
 */
export function applyCardSelection({ source, target, picks = {}, addMissing = false }) {
  const srcList = Array.isArray(source) ? source : [];
  const tgtList = Array.isArray(target) ? target : [];
  const skipped = [];
  const { pairs } = matchCards(srcList, tgtList);

  const next = tgtList.map(clone);
  const inserts = []; // { after: targetIndex | -1, sourceIndex, card }
  let changed = false;

  const indexes = Object.keys(picks)
    .map(Number)
    .sort((a, b) => a - b);

  for (const si of indexes) {
    const card = srcList[si];
    if (!card || !same(card, picks[si])) {
      skipped.push({
        card: si + 1,
        reason: "source card changed since it was ticked — reopen and retry",
      });
      continue;
    }
    const ti = pairs[si];
    if (ti !== null) {
      if (!same(next[ti], card)) {
        next[ti] = clone(card);
        changed = true;
      }
      continue;
    }
    if (!addMissing) {
      skipped.push({ card: si + 1, reason: "no matching card on this locale" });
      continue;
    }
    let after = -1;
    for (let sj = si - 1; sj >= 0; sj--) {
      if (pairs[sj] !== null) { after = pairs[sj]; break; }
    }
    inserts.push({ after, sourceIndex: si, card: clone(card) });
  }

  if (inserts.length) {
    changed = true;
    const out = [];
    const flush = (after) =>
      inserts.filter((x) => x.after === after).forEach((x) => out.push(x.card));
    flush(-1);
    next.forEach((card, ti) => { out.push(card); flush(ti); });
    return { value: out, skipped };
  }

  return { value: changed ? next : target, skipped };
}
