import { mergeSourceAdditionsIntoTarget } from "./mergeText";
import { callCMA } from "./rateLimiter";
import { mergeRichTextDocuments } from "./mergeRichText";
import { normalizeContentfulDate } from "./helpers";

/**
 * Fast + safe adoption with bounded concurrency (no recursion explosion).
 *
 * - Uses a worker queue instead of recursive await
 * - Hard caps concurrency to MAX_WORKERS (default 50)
 * - Avoids duplicates via `scheduled` set
 * - Handles cycles safely (no deadlocks)
 */

const MAX_WORKERS = 50;

function isRichText(val) {
  return (
    val &&
    typeof val === "object" &&
    val.nodeType === "document" &&
    Array.isArray(val.content)
  );
}

const clone = (v) => JSON.parse(JSON.stringify(v));

/**
 * Tiny async queue that supports multiple workers.
 */
class AsyncQueue {
  constructor() {
    this.items = [];
    this.waiters = [];
    this.closed = false;
  }

  push(item) {
    if (this.closed) return;
    if (this.waiters.length) {
      const resolve = this.waiters.shift();
      resolve(item);
      return;
    }
    this.items.push(item);
  }

  async shift() {
    if (this.items.length) return this.items.shift();
    if (this.closed) return null;
    return new Promise((resolve) => this.waiters.push(resolve));
  }

  close() {
    this.closed = true;
    while (this.waiters.length) {
      const resolve = this.waiters.shift();
      resolve(null);
    }
  }
}

/**
 * Process a single entry:
 * - fetch entry
 * - fetch content type (cached)
 * - compute field updates
 * - update entry if changed
 * - return referenced entryIds to traverse next
 */
async function processOneEntry({
  cma,
  entryId,
  environmentId,
  spaceId,
  sourceLocale,
  targetLocale,
  defaultLocale,
  ctCache,
  selected,
  adoptAll,
  overwriteAll,
}) {
  const summary = { updatedEntries: 0, changedFields: 0, traversedEntries: 0 };
  const refIds = new Set();

  const entry = await callCMA(() =>
    cma.entry.get({ entryId, environmentId, spaceId }),
  );
  summary.traversedEntries += 1;

  const envId = entry.sys.environment.sys.id;
  const spId = entry.sys.space.sys.id;

  const ctId = entry?.sys?.contentType?.sys?.id;
  let contentType = ctCache[ctId];
  if (!contentType) {
    contentType = await callCMA(() =>
      cma.contentType.get({
        contentTypeId: ctId,
        environmentId: envId,
        spaceId: spId,
      }),
    );
    ctCache[ctId] = contentType;
  }

  const allowedForThisEntry = selected?.[entryId] || new Set();

  const fields = entry.fields || {};
  const newFields = { ...fields };
  let changed = 0;

  for (const def of contentType.fields || []) {
    const fieldId = def.id;
    const localizedValues = fields[fieldId];
    if (!localizedValues) continue;

    // ---------------------------------------------------------------------
    // SINGLE ENTRY LINK
    // ---------------------------------------------------------------------
    if (def.type === "Link" && def.linkType === "Entry") {
      if (def.localized) {
        const srcLink = localizedValues?.[sourceLocale];
        const tgtLink = localizedValues?.[targetLocale];

        // overwrite
        if (overwriteAll && srcLink !== undefined) {
          newFields[fieldId] = {
            ...localizedValues,
            [targetLocale]: clone(srcLink),
          };
          changed++;
        } else {
          // full adopt if empty
          if (
            (tgtLink === undefined || tgtLink === null) &&
            srcLink &&
            (adoptAll || allowedForThisEntry.has(fieldId))
          ) {
            newFields[fieldId] = {
              ...localizedValues,
              [targetLocale]: clone(srcLink),
            };
            changed++;
          }

          // insert-only overwrite if different
          if (
            (adoptAll || allowedForThisEntry.has(fieldId)) &&
            srcLink &&
            tgtLink &&
            JSON.stringify(srcLink) !== JSON.stringify(tgtLink)
          ) {
            newFields[fieldId] = {
              ...localizedValues,
              [targetLocale]: clone(srcLink),
            };
            changed++;
          }
        }

        const refId = srcLink?.sys?.id || tgtLink?.sys?.id;
        if (refId) refIds.add(refId);
      } else {
        // non-localized link: traverse only
        const linkVal =
          localizedValues?.[defaultLocale] ??
          Object.values(localizedValues || {})[0];

        const refId = linkVal?.sys?.id;
        if (refId) refIds.add(refId);
      }
      continue;
    }

    // ---------------------------------------------------------------------
    // ARRAY OF ENTRY LINKS
    // ---------------------------------------------------------------------
    if (
      def.type === "Array" &&
      def.items?.type === "Link" &&
      def.items?.linkType === "Entry"
    ) {
      if (def.localized) {
        const srcArr = localizedValues?.[sourceLocale];
        const tgtArr = localizedValues?.[targetLocale];

        if (overwriteAll && srcArr !== undefined) {
          newFields[fieldId] = {
            ...localizedValues,
            [targetLocale]: clone(srcArr),
          };
          changed++;
        } else {
          // full adopt if empty
          if (
            (tgtArr === undefined || tgtArr === null) &&
            srcArr &&
            (adoptAll || allowedForThisEntry.has(fieldId))
          ) {
            newFields[fieldId] = {
              ...localizedValues,
              [targetLocale]: clone(srcArr),
            };
            changed++;
          }

          // insert-only if different
          if (
            (adoptAll || allowedForThisEntry.has(fieldId)) &&
            Array.isArray(srcArr) &&
            Array.isArray(tgtArr) &&
            JSON.stringify(srcArr) !== JSON.stringify(tgtArr)
          ) {
            newFields[fieldId] = {
              ...localizedValues,
              [targetLocale]: clone(srcArr),
            };
            changed++;
          }
        }

        const ids = new Set([
          ...(Array.isArray(srcArr)
            ? srcArr.map((l) => l?.sys?.id).filter(Boolean)
            : []),
          ...(Array.isArray(tgtArr)
            ? tgtArr.map((l) => l?.sys?.id).filter(Boolean)
            : []),
        ]);
        ids.forEach((id) => refIds.add(id));
      } else {
        const arr =
          localizedValues?.[defaultLocale] ??
          Object.values(localizedValues || {})[0];

        (Array.isArray(arr) ? arr : []).forEach((l) => {
          const id = l?.sys?.id;
          if (id) refIds.add(id);
        });
      }
      continue;
    }

    // ---------------------------------------------------------------------
    // LOCALIZED SCALARS / STRINGS / RICH TEXT / DATE
    // ---------------------------------------------------------------------
    if (!def.localized) continue;

    if (!overwriteAll && !adoptAll && !allowedForThisEntry.has(fieldId)) {
      continue;
    }

    const srcVal = localizedValues?.[sourceLocale];
    const tgtVal = localizedValues?.[targetLocale];

    // Date fields: normalize + validate before writing
    if (def.type === "Date") {
      const normalizedSrc = normalizeContentfulDate(srcVal);
      const normalizedTgt = normalizeContentfulDate(tgtVal);

      // If src is invalid, skip
      if (srcVal != null && !normalizedSrc) {
        console.warn(
          `[Locale Populator] Skipping invalid date for ${entryId}.${fieldId}.${sourceLocale}:`,
          srcVal,
        );
        continue;
      }

      if (overwriteAll) {
        if (normalizedSrc !== undefined) {
          newFields[fieldId] = {
            ...localizedValues,
            [targetLocale]: normalizedSrc,
          };
          changed++;
        }
        continue;
      }

      // full adopt if empty
      if (tgtVal === undefined || tgtVal === null) {
        if (normalizedSrc !== undefined) {
          newFields[fieldId] = {
            ...localizedValues,
            [targetLocale]: normalizedSrc,
          };
          changed++;
        }
        continue;
      }

      // update if different
      if (
        normalizedSrc !== undefined &&
        normalizedSrc !== normalizedTgt &&
        (adoptAll || allowedForThisEntry.has(fieldId))
      ) {
        newFields[fieldId] = {
          ...localizedValues,
          [targetLocale]: normalizedSrc,
        };
        changed++;
      }
      continue;
    }

    // OVERWRITE MODE — replace target with source
    if (overwriteAll) {
      if (srcVal !== undefined) {
        newFields[fieldId] = {
          ...localizedValues,
          [targetLocale]: clone(srcVal),
        };
        changed++;
      }
      continue;
    }

    // FULL ADOPT IF TARGET EMPTY
    if (tgtVal === undefined || tgtVal === null) {
      if (srcVal !== undefined) {
        newFields[fieldId] = {
          ...localizedValues,
          [targetLocale]: clone(srcVal),
        };
        changed++;
      }
      continue;
    }

    // STRING MERGE (insert-only)
    if (typeof srcVal === "string" && typeof tgtVal === "string") {
      const merged = mergeSourceAdditionsIntoTarget(srcVal || "", tgtVal || "");
      if (merged !== tgtVal) {
        newFields[fieldId] = { ...localizedValues, [targetLocale]: merged };
        changed++;
      }
      continue;
    }

    // RICH TEXT MERGE
    if (isRichText(srcVal) && isRichText(tgtVal)) {
      const mergedDoc = mergeRichTextDocuments(srcVal, tgtVal);
      if (JSON.stringify(mergedDoc) !== JSON.stringify(tgtVal)) {
        newFields[fieldId] = {
          ...localizedValues,
          [targetLocale]: mergedDoc,
        };
        changed++;
      }
      continue;
    }

    // If one is rich text and the other isn't → skip (insert-only)
    if (isRichText(srcVal) && !isRichText(tgtVal)) continue;

    // Fallback: deep copy if changed
    if (
      srcVal !== undefined &&
      JSON.stringify(srcVal) !== JSON.stringify(tgtVal)
    ) {
      newFields[fieldId] = {
        ...localizedValues,
        [targetLocale]: clone(srcVal),
      };
      changed++;
    }
  }

  // UPDATE ENTRY
  if (changed > 0) {
    try {
      const start = performance.now();
      await callCMA(() =>
        cma.entry.update(
          {
            entryId,
            environmentId: envId,
            spaceId: spId,
            version: entry.sys.version,
          },
          { ...entry, fields: newFields },
        ),
      );

      const duration = performance.now() - start;

      console.log(`[UPDATE] ${entryId} | ${duration.toFixed(1)} ms`);
      summary.updatedEntries += 1;
      summary.changedFields += changed;
    } catch (e) {
      console.error("Error updating entry:", {
        entryId,
        environmentId: envId,
        spaceId: spId,
        expectedVersion: entry.sys.version,
        status: e?.status,
        code: e?.code,
        sysId: e?.sys?.id,
        name: e?.name,
        message: e?.message,
        details: e?.details,
        fullError: e,
      });
      throw e;
    }
  }

  return { summary, refIds, envId, spId };
}

/**
 * PUBLIC API (same name/signature):
 * Traverses the entry graph concurrently with a hard cap (50).
 */
export async function adoptEntryTree({
  cma,
  entryId,
  environmentId,
  spaceId,
  sourceLocale,
  targetLocale,
  defaultLocale,
  visited = new Set(),
  ctCache = {},
  selected = {},
  adoptAll = false,
  overwriteAll = false,
}) {
  const total = { updatedEntries: 0, changedFields: 0, traversedEntries: 0 };

  if (!entryId) return total;

  // scheduled prevents duplicates + prevents cycles from causing deadlocks
  const scheduled = visited; // reuse your existing visited set

  const q = new AsyncQueue();
  let pending = 0;

  const enqueue = (id) => {
    if (!id) return;
    if (scheduled.has(id)) return;
    scheduled.add(id);
    pending++;
    q.push(id);
  };

  enqueue(entryId);

  const worker = async () => {
    for (;;) {
      const id = await q.shift();
      if (id === null) return;

      try {
        const { summary, refIds, envId, spId } = await processOneEntry({
          cma,
          entryId: id,
          environmentId,
          spaceId,
          sourceLocale,
          targetLocale,
          defaultLocale,
          ctCache,
          selected,
          adoptAll,
          overwriteAll,
        });

        total.updatedEntries += summary.updatedEntries;
        total.changedFields += summary.changedFields;
        total.traversedEntries += summary.traversedEntries;

        // enqueue children
        for (const childId of refIds) enqueue(childId);

        // keep env/space consistent after first hop (optional)
        environmentId = envId ?? environmentId;
        spaceId = spId ?? spaceId;
      } finally {
        pending--;
        if (pending === 0) q.close();
      }
    }
  };

  // Start exactly MAX_WORKERS workers (hard cap)
  const workers = Array.from({ length: MAX_WORKERS }, () => worker());
  await Promise.all(workers);

  return total;
}
