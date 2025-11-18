import { mergeSourceAdditionsIntoTarget } from "./mergeText";
import { callCMA } from "./rateLimiter";
import { mergeRichTextDocuments } from "./mergeRichText";

/**
 * Recursively adopt localized changes from sourceLocale -> targetLocale
 * for an entry and all referenced entries (following entry links).
 *
 * Insert-only strategy:
 * ✅ If target locale already has content → perform insert-only merge
 * ✅ If target locale is empty → full adopt (copy src → tgt)
 */

function isRichText(val) {
  return (
    val &&
    typeof val === "object" &&
    val.nodeType === "document" &&
    Array.isArray(val.content)
  );
}

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
}) {
  const summary = {
    updatedEntries: 0,
    changedFields: 0,
    traversedEntries: 0,
  };

  if (!entryId || visited.has(entryId)) return summary;
  visited.add(entryId);

  // Fetch entry
  const entry = await callCMA(() =>
    cma.entry.get({ entryId, environmentId, spaceId })
  );
  summary.traversedEntries += 1;

  const envId = entry.sys.environment.sys.id;
  const spId = entry.sys.space.sys.id;

  // Fetch content type & cache
  const ctId = entry?.sys?.contentType?.sys?.id;
  let contentType = ctCache[ctId];
  if (!contentType) {
    contentType = await callCMA(() =>
      cma.contentType.get({
        contentTypeId: ctId,
        environmentId: envId,
        spaceId: spId,
      })
    );
    ctCache[ctId] = contentType;
  }

  const allowedForThisEntry = selected[entryId] || new Set();

  const clone = (v) => JSON.parse(JSON.stringify(v));

  const fields = entry.fields || {};
  const newFields = { ...fields };
  let changed = 0;

  const refIds = new Set();

  for (const def of contentType.fields || []) {
    const fieldId = def.id;
    const fieldDef = def;
    const localizedValues = fields[fieldId];

    if (!localizedValues) continue;

    // ---------------------------------------------------------------------
    // SINGLE ENTRY LINK
    // ---------------------------------------------------------------------
    if (fieldDef.type === "Link" && fieldDef.linkType === "Entry") {
      if (fieldDef.localized) {
        const srcLink = localizedValues?.[sourceLocale];
        const tgtLink = localizedValues?.[targetLocale];

        // Full adopt if target empty
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

        // Insert-only (target has something)
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

        const refId = srcLink?.sys?.id || tgtLink?.sys?.id;
        if (refId) refIds.add(refId);
      } else {
        // Non-localized link: only traverse
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
      fieldDef.type === "Array" &&
      fieldDef.items?.type === "Link" &&
      fieldDef.items?.linkType === "Entry"
    ) {
      if (fieldDef.localized) {
        const srcArr = localizedValues?.[sourceLocale];
        const tgtArr = localizedValues?.[targetLocale];

        // Full adopt if empty
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

        // Insert-only if target has content
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
    // LOCALIZED SCALARS / STRINGS / RICH TEXT
    // ---------------------------------------------------------------------
    if (fieldDef.localized) {
      if (!adoptAll && !allowedForThisEntry.has(fieldId)) continue;

      const srcVal = localizedValues?.[sourceLocale];
      const tgtVal = localizedValues?.[targetLocale];

      // ✅ FULL ADOPT IF TARGET EMPTY
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

      // ✅ STRING MERGE (Option B)
      if (typeof srcVal === "string" && typeof tgtVal === "string") {
        const merged = mergeSourceAdditionsIntoTarget(
          srcVal || "",
          tgtVal || ""
        );
        if (merged !== tgtVal) {
          newFields[fieldId] = { ...localizedValues, [targetLocale]: merged };
          changed++;
        }
        continue;
      }

      // ✅ RICH TEXT MERGE
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
      if (isRichText(srcVal) && !isRichText(tgtVal)) {
        continue;
      }

      // ✅ Fallback: deep copy if changed (JSON, arrays, numbers)
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
  }

  // ---------------------------------------------------------------------
  // UPDATE ENTRY
  // ---------------------------------------------------------------------
  if (changed > 0) {
    await callCMA(() =>
      cma.entry.update(
        {
          entryId,
          environmentId: envId,
          spaceId: spId,
          version: entry.sys.version,
        },
        { ...entry, fields: newFields }
      )
    );
    summary.updatedEntries += 1;
    summary.changedFields += changed;
  }

  // ---------------------------------------------------------------------
  // RECURSE INTO CHILD ENTRIES
  // ---------------------------------------------------------------------
  for (const childId of refIds) {
    const s = await adoptEntryTree({
      cma,
      entryId: childId,
      environmentId: envId,
      spaceId: spId,
      sourceLocale,
      targetLocale,
      defaultLocale,
      visited,
      ctCache,
      selected,
      adoptAll,
    });

    summary.updatedEntries += s.updatedEntries;
    summary.changedFields += s.changedFields;
    summary.traversedEntries += s.traversedEntries;
  }

  return summary;
}
  