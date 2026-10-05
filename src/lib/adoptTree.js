import { mergeSourceAdditionsIntoTarget } from "./mergeText";
import { callCMA } from "./rateLimiter";
import { mergeRichTextDocuments } from "./mergeRichText";
import { normalizeContentfulDate } from "./helpers";
import { describeCmaError } from "./cmaErrors";
import { applyCardSelection, isCardField } from "./cardMatch";

/**
 * Fast + safe adoption with bounded concurrency (no recursion explosion).
 *
 * - Uses a worker queue instead of recursive await
 * - Hard caps concurrency to MAX_WORKERS
 * - Avoids duplicates via `scheduled` set
 * - Handles cycles safely (no deadlocks)
 */

// The rate limiter is what actually paces CMA calls; more workers than the
// limiter allows per second only queue up inside callCMA.
const MAX_WORKERS = 8;

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

// A 409 means someone saved the entry between our GET and our PUT. We refetch
// and recompute from their version, so their edits (in any locale) survive.
const MAX_CONFLICT_RETRIES = 3;

function isVersionMismatch(err) {
  return err?.status === 409 || err?.sys?.id === "VersionMismatch";
}

/**
 * Work out the new field values for one entry. Pure: reads `entry`, returns
 * the fields to write, how many changed, and the linked entryIds to visit.
 */
function computeEntryUpdate({
  entry,
  contentType,
  entryId,
  sourceLocale,
  targetLocale,
  defaultLocale,
  selected,
  adoptAll,
  overwriteAll,
  overwriteSelected = {},
  cardSelected = {},
}) {
  const refIds = new Set();
  const cardSkips = [];

  const allowedForThisEntry = selected?.[entryId] || new Set();
  const overwriteForThisEntry = overwriteSelected?.[entryId] || new Set();

  const fields = entry.fields || {};
  const newFields = { ...fields };
  let changed = 0;

  for (const def of contentType.fields || []) {
    const fieldId = def.id;
    const localizedValues = fields[fieldId];
    if (!localizedValues) continue;

    const shouldOverwrite = overwriteAll || overwriteForThisEntry.has(fieldId);
    const shouldMerge = adoptAll || allowedForThisEntry.has(fieldId);

    // ---------------------------------------------------------------------
    // SINGLE ENTRY LINK
    // ---------------------------------------------------------------------
    if (def.type === "Link" && def.linkType === "Entry") {
      if (def.localized) {
        const srcLink = localizedValues?.[sourceLocale];
        const tgtLink = localizedValues?.[targetLocale];

        // overwrite
        if (shouldOverwrite && srcLink !== undefined) {
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
            shouldMerge
          ) {
            newFields[fieldId] = {
              ...localizedValues,
              [targetLocale]: clone(srcLink),
            };
            changed++;
          }
          // an existing, different target link is kept (merge never replaces)
        }

        // follow the link the target locale actually ends up with
        const effectiveLink = newFields[fieldId]?.[targetLocale] ?? srcLink;
        const refId = effectiveLink?.sys?.id;
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

        if (shouldOverwrite && srcArr !== undefined) {
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
            shouldMerge
          ) {
            newFields[fieldId] = {
              ...localizedValues,
              [targetLocale]: clone(srcArr),
            };
            changed++;
          }
          // an existing, different target list is kept (merge never replaces)
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

    // CARD-LEVEL ADOPT (heroCards, demonstratedResults, ...): only the ticked
    // cards are written, each into the target card it matches. Field-level
    // overwrite still replaces the whole list.
    const cardChoice = cardSelected?.[entryId]?.[fieldId];
    if (
      !shouldOverwrite &&
      isCardField(fieldId) &&
      Object.keys(cardChoice?.picks || {}).length > 0
    ) {
      const tgtVal = localizedValues?.[targetLocale];
      const { value, skipped } = applyCardSelection({
        source: localizedValues?.[sourceLocale],
        target: tgtVal,
        picks: cardChoice.picks,
        addMissing: Boolean(cardChoice.addMissing),
      });
      skipped.forEach((x) => cardSkips.push({ entryId, fieldId, ...x }));
      if (value !== tgtVal && value !== undefined) {
        newFields[fieldId] = { ...localizedValues, [targetLocale]: value };
        changed++;
      }
      continue;
    }

    if (!shouldOverwrite && !shouldMerge) continue;

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

      if (shouldOverwrite) {
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
        shouldMerge
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
    if (shouldOverwrite) {
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

    // Anything else (JSON objects, asset links, numbers, booleans, arrays):
    // the target already has a value and there is no safe way to merge it,
    // so keep it. Only overwrite mode replaces these.
  }

  return { newFields, changed, refIds, cardSkips };
}

/**
 * Process a single entry:
 * - fetch entry
 * - fetch content type (cached)
 * - compute field updates
 * - update entry if changed, refetching + recomputing on a 409
 * - return referenced entryIds to traverse next
 *
 * A failed update is returned as `error` (not thrown) so the caller still
 * gets `refIds` and can carry on into the linked entries. A failed GET throws.
 */
async function processOneEntry({
  cma,
  entryId,
  environmentId,
  spaceId,
  ctCache,
  ...computeOptions
}) {
  const summary = { updatedEntries: 0, changedFields: 0, traversedEntries: 1 };

  for (let attempt = 0; ; attempt++) {
    const entry = await callCMA(() =>
      cma.entry.get({ entryId, environmentId, spaceId }),
    );

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

    const { newFields, changed, refIds, cardSkips } = computeEntryUpdate({
      entry,
      contentType,
      entryId,
      ...computeOptions,
    });

    if (changed === 0) return { summary, refIds, envId, spId, cardSkips };

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
      return { summary, refIds, envId, spId, cardSkips };
    } catch (e) {
      if (isVersionMismatch(e) && attempt < MAX_CONFLICT_RETRIES) {
        console.warn(
          `[Locale Populator] ${entryId} changed while adopting (409), retrying with the latest version`,
        );
        continue;
      }
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
      return { summary, refIds, envId, spId, cardSkips, error: e };
    }
  }
}

/**
 * PUBLIC API:
 * Traverses the entry graph concurrently with a hard cap (MAX_WORKERS).
 *
 * Never throws for a single entry: entries that fail are listed in
 * `failures` ({ entryId, reason, requestId }) and the rest are still adopted.
 * Ticked cards that couldn't be placed on the target are in `cardSkips`
 * ({ entryId, fieldId, card, reason }); those cards were not written.
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
  overwriteSelected = {},
  cardSelected = {},
}) {
  const total = {
    updatedEntries: 0,
    changedFields: 0,
    traversedEntries: 0,
    failures: [],
    cardSkips: [],
  };

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
        const { summary, refIds, envId, spId, error, cardSkips } = await processOneEntry({
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
          overwriteSelected,
          cardSelected,
        });

        total.updatedEntries += summary.updatedEntries;
        total.changedFields += summary.changedFields;
        total.traversedEntries += summary.traversedEntries;
        if (error) total.failures.push({ entryId: id, ...describeCmaError(error) });
        else total.cardSkips.push(...(cardSkips || []));

        // enqueue children
        for (const childId of refIds) enqueue(childId);

        // keep env/space consistent after first hop (optional)
        environmentId = envId ?? environmentId;
        spaceId = spId ?? spaceId;
      } catch (err) {
        // Couldn't even read the entry; its children are unknown.
        console.error(`[Locale Populator] Could not process ${id}:`, err);
        total.failures.push({ entryId: id, ...describeCmaError(err) });
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
