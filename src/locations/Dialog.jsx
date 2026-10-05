import React, { useEffect, useMemo, useRef, useState } from "react";
import { Note, Spinner } from "@contentful/f36-components";
import { useSDK } from "@contentful/react-apps-toolkit";
import { cmaSDK } from "../lib/contentful";
import { buildDiffTree } from "../lib/buildDiffTree";
import { adoptEntryTree } from "../lib/adoptTree";
import { describeCmaError } from "../lib/cmaErrors";
import { callCMA } from "../lib/rateLimiter";
import {
  isPairAllowed,
  ALLOWED_BASES_DEFAULT,
  PINNED_TARGET_LOCALES,
} from "../lib/localeUtils";
import LocaleSelectors from "../components/LocaleSelectors";
import MergeControls from "../components/MergeControls";
import DiffViewer from "../components/DiffViewer";

const HIDDEN_FIELDS_DEFAULT = [
  "poolpartyTagIDs","LocaleValidation","localeValidation","globaltolocal",
];

const ESTIMATED_MS_PER_LOCALE = 12000;
const BASE_OVERHEAD_MS = 3000;
const MANUAL_MS_PER_LOCALE = 90000;

function collectFields(tree, rootEntryId) {
  const result = [];
  const walk = (nodeMap, currentEntryId) => {
    if (!nodeMap || nodeMap.type === "circular") return;
    Object.entries(nodeMap).forEach(([key, node]) => {
      if (!node || node.type === "circular") return;
      if (node.type === "field") {
        result.push({ entryId: currentEntryId, fieldId: key });
      } else if (node.type === "reference") {
        const childEntryId = node.linkEntryId || node.id || currentEntryId;
        if (node.children) walk(node.children, childEntryId);
      } else if (node.type === "reference-list") {
        Object.values(node.children || {}).forEach((childNode) => {
          if (!childNode || childNode.type === "circular") return;
          const childEntryId = childNode.linkEntryId || childNode.id || currentEntryId;
          if (childNode.children) walk(childNode.children, childEntryId);
        });
      }
    });
  };
  walk(tree, rootEntryId);
  return result;
}

const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

/**
 * Plain-text adopt report. One line per target locale when there is more
 * than one locale or anything failed, so partial success is never hidden.
 */
export function formatAdoptReport(results) {
  const attempted = results.filter((r) => !r.skipped);
  const fields = attempted.reduce((n, r) => n + r.changedFields, 0);
  const entries = attempted.reduce((n, r) => n + r.updatedEntries, 0);
  const failed = attempted.filter((r) => r.failures.length > 0);

  const headline =
    failed.length === 0
      ? `Adopted ${plural(fields, "field")} across ${entries} entries (${attempted.map((r) => r.locale).join(", ")}).`
      : `${failed.length} of ${attempted.length} locale${attempted.length === 1 ? "" : "s"} had failures. ` +
        `${plural(fields, "field")} across ${entries} entries were still saved — ` +
        "locales marked ✓ are complete.\n" +
        "If reporting this issue, include the request IDs below.";

  const anySkips = attempted.some((r) => r.cardSkips?.length > 0);
  if (results.length === 1 && failed.length === 0 && !anySkips) return headline;

  const lines = results.map((r) => {
    if (r.skipped) return `– ${r.locale}: skipped (${r.skipped})`;
    const saved = `${plural(r.changedFields, "field")} across ${r.updatedEntries} entries`;
    // Ticked cards this locale had no match for: not written, not an error.
    const skips = (r.cardSkips ?? []).map(
      (x) => `\n    ↷ ${x.fieldId} card ${x.card} not written: ${x.reason}`,
    ).join("");
    if (r.failures.length === 0) return `✓ ${r.locale}: ${saved}${skips}`;
    const detail = r.failures
      .map((f) => `    • ${f.entryId}: ${f.reason}${f.requestId ? ` (Request ID: ${f.requestId})` : ""}`)
      .join("\n");
    return `✗ ${r.locale}: ${plural(r.failures.length, "entry")} failed, ${saved} saved\n${detail}${skips}`;
  });

  return `${headline}\n\n${lines.join("\n")}`;
}

export default function Dialog() {
  const sdk = useSDK();

  // Read installation config with fallbacks for backwards compatibility
  const installParams = sdk.parameters?.installation ?? {};
  const cmaToken = installParams.cmaToken;
  const cma = useMemo(() => {
    try { return cmaSDK(sdk, cmaToken); } catch { return null; }
  }, [sdk, cmaToken]);
  const allowedBases = installParams.allowedBases ?? ALLOWED_BASES_DEFAULT;
  const pinnedTargets = new Set(installParams.pinnedTargets ?? Array.from(PINNED_TARGET_LOCALES));
  const hiddenFields = installParams.hiddenFields ?? HIDDEN_FIELDS_DEFAULT;
  const defaultSourceLocale = installParams.defaultSourceLocale ?? undefined;
  const defaultTargetLocale = installParams.defaultTargetLocale ?? undefined;

  const invocation = sdk.parameters.invocation;
  const entryId = invocation?.entryId || sdk.ids.entry;
  const environmentId = invocation?.environmentId || sdk.ids.environment;
  const spaceId = invocation?.spaceId || sdk.ids.space;

  const [localesLoading, setLocalesLoading] = useState(true);
  const [localesError, setLocalesError] = useState(null);
  const [locales, setLocales] = useState([]);

  const [sourceLocale, setSourceLocale] = useState(defaultSourceLocale);
  const [targetLocale, setTargetLocale] = useState(defaultTargetLocale);

  const [diffData, setDiffData] = useState(null);
  const [diffLoading, setDiffLoading] = useState(false);
  const [diffError, setDiffError] = useState(null);
  // Bumped by every diff load. A load whose number is no longer current was
  // for a locale pair the user has since moved away from, so it is dropped
  // instead of overwriting the diff for the pair in the dropdowns.
  const diffRequestRef = useRef(0);

  const [adoptAll, setAdoptAll] = useState(false);
  const [overwriteAll, setOverwriteAll] = useState(false);
  const [allFields, setAllFields] = useState([]);
  const [selected, setSelected] = useState({});
  const [overwriteSelected, setOverwriteSelected] = useState({});
  // { [entryId]: { [fieldId]: { picks: { [cardIndex]: card }, addMissing } } }
  const [cardSelected, setCardSelected] = useState({});
  const [adoptTargets, setAdoptTargets] = useState([]);

  const [adopting, setAdopting] = useState(false);
  const [adoptStatus, setAdoptStatus] = useState("idle");
  const [adoptMsg, setAdoptMsg] = useState(null);

  const [adoptStartedAt, setAdoptStartedAt] = useState(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [estimatedTotalMs, setEstimatedTotalMs] = useState(null);
  const [actualDurationMs, setActualDurationMs] = useState(null);
  const [savedMs, setSavedMs] = useState(null);

  // Elapsed timer during adoption
  useEffect(() => {
    if (!adopting || !adoptStartedAt) return;
    const id = setInterval(() => setElapsedMs(performance.now() - adoptStartedAt), 1000);
    return () => clearInterval(id);
  }, [adopting, adoptStartedAt]);

  // Load locales on mount
  useEffect(() => {
    if (!cma) {
      setLocalesError("No Contentful Management token configured — open the Locale Populator app's "
        + "configuration screen and add one, then reopen this dialog.");
      setLocalesLoading(false);
      return;
    }
    const fetch = async () => {
      setLocalesLoading(true);
      setLocalesError(null);
      try {
        const res = await callCMA(() =>
          cma.locale.getMany({
            environmentId: sdk.ids.environment,
            spaceId: sdk.ids.space,
            query: { limit: 1000 },
          }),
        );
        setLocales(res.items);
      } catch (err) {
        const status = err?.status ?? err?.response?.status;
        setLocalesError(
          status === 401
            ? "Authentication failed (401) — the CMA token is invalid or expired."
            : status === 403
              ? "Access denied (403) — insufficient permissions to read locales."
              : `Failed to load locales: ${err?.message ?? "unknown error"}`,
        );
      } finally {
        setLocalesLoading(false);
      }
    };
    fetch();
  }, [cma, sdk.ids.environment, sdk.ids.space]);

  // Load diff when locale pair changes
  useEffect(() => {
    const requestId = ++diffRequestRef.current;
    const isCurrent = () => requestId === diffRequestRef.current;
    const run = async () => {
      if (!sourceLocale || !targetLocale) return;
      try {
        setDiffLoading(true);
        setDiffData(null);
        const entry = await cma.entry.get({ entryId, environmentId, spaceId });
        console.log("Fetched entry for diff:", entry);
        const tree = await buildDiffTree({
          entry, cma, sourceLocale, targetLocale,
          defaultLocale: locales.find((l) => l.default)?.code,
          cache: {}, visited: new Set(), maxDepth: 4, maxNodes: 250,
        });
        if (!isCurrent()) return;
        setDiffData(tree);
        setAllFields(collectFields(tree, entryId));
        setDiffError(null);
      } catch {
        if (isCurrent()) setDiffError("Failed to fetch entry for diff");
      } finally {
        if (isCurrent()) setDiffLoading(false);
      }
    };
    run();
  }, [sourceLocale, targetLocale, entryId, environmentId, spaceId, cma, locales]);

  // Debug: log locale state whenever source or adopt targets change
  useEffect(() => {
    console.log("==== LOCALE DEBUG ====");
    console.log("Source locale:", sourceLocale);
    console.log("All locales:", locales.map((l) => l.code));
    console.log("Allowed bases:", allowedBases);
    console.log("Adopt targets:", adoptTargets);
    console.log("==== END DEBUG ====");
  }, [sourceLocale, locales, allowedBases, adoptTargets]);

  // Reset adoption status when anything selection-related changes
  useEffect(() => {
    setAdoptStatus("idle");
    setAdoptMsg(null);
  }, [sourceLocale, targetLocale, overwriteAll]);

  // Reset per-field overwrite and card picks when locale pair changes
  useEffect(() => {
    setOverwriteSelected({});
    setCardSelected({});
  }, [sourceLocale, targetLocale]);

  const removeFromSet = (setter, entryIdForField, fieldId) =>
    setter((prev) => {
      const next = { ...prev };
      const set = new Set(next[entryIdForField] || []);
      set.delete(fieldId);
      next[entryIdForField] = set;
      return next;
    });

  const onToggleField = (entryIdForField, fieldId, isChecked) => {
    if (adoptAll && !isChecked) {
      setAdoptAll(false);
      setSelected(() => {
        const next = {};
        (allFields || []).forEach(({ entryId: eid, fieldId: fid }) => {
          if (eid === entryIdForField && fid === fieldId) return;
          if (!next[eid]) next[eid] = new Set();
          next[eid].add(fid);
        });
        return next;
      });
      return;
    }
    if (isChecked) {
      removeFromSet(setOverwriteSelected, entryIdForField, fieldId);
    }
    setSelected((prev) => {
      const next = { ...prev };
      const set = new Set(next[entryIdForField] || []);
      if (isChecked) set.add(fieldId); else set.delete(fieldId);
      next[entryIdForField] = set;
      return next;
    });
  };

  const onToggleOverwrite = (entryIdForField, fieldId, isChecked) => {
    if (isChecked && adoptAll) {
      setAdoptAll(false);
      setSelected(() => {
        const next = {};
        (allFields || []).forEach(({ entryId: eid, fieldId: fid }) => {
          if (eid === entryIdForField && fid === fieldId) return;
          if (!next[eid]) next[eid] = new Set();
          next[eid].add(fid);
        });
        return next;
      });
    }
    if (isChecked) {
      removeFromSet(setSelected, entryIdForField, fieldId);
    }
    setOverwriteSelected((prev) => {
      const next = { ...prev };
      const set = new Set(next[entryIdForField] || []);
      if (isChecked) set.add(fieldId); else set.delete(fieldId);
      next[entryIdForField] = set;
      return next;
    });
  };

  const updateCardChoice = (entryIdForField, fieldId, update) =>
    setCardSelected((prev) => {
      const forEntry = prev[entryIdForField] || {};
      const current = forEntry[fieldId] || { picks: {}, addMissing: false };
      return {
        ...prev,
        [entryIdForField]: { ...forEntry, [fieldId]: update(current) },
      };
    });

  // The card itself is stored so adopt can refuse if the source card changed
  // after it was ticked.
  const onToggleCard = (entryIdForField, fieldId, index, card, isChecked) =>
    updateCardChoice(entryIdForField, fieldId, (current) => {
      const picks = { ...current.picks };
      if (isChecked) picks[index] = card; else delete picks[index];
      return { ...current, picks };
    });

  const onToggleAddMissing = (entryIdForField, fieldId, isChecked) =>
    updateCardChoice(entryIdForField, fieldId, (current) => ({
      ...current,
      addMissing: isChecked,
    }));

  const adoptChanges = async () => {
    if (!sourceLocale) return;
    const targets = writeTargets;
    if (targets.length === 0) return;

    setAdoptStartedAt(performance.now());
    setElapsedMs(0);
    setEstimatedTotalMs(BASE_OVERHEAD_MS + targets.length * ESTIMATED_MS_PER_LOCALE);
    setActualDurationMs(null);
    setSavedMs(null);
    setAdoptMsg(null);
    setAdopting(true);
    setAdoptStatus("running");

    const overallStart = performance.now();
    const defaultLocale = locales.find((l) => l.default)?.code;
    console.log("Overwrite all:", overwriteAll);

    // One result per target locale. A locale that throws, or that has entries
    // which failed, doesn't stop the others; everything is reported at the end
    // so "failed" never hides writes that did happen.
    const results = [];
    try {
      for (const tgt of targets) {
        if (tgt === sourceLocale) {
          results.push({ locale: tgt, skipped: "same as source" });
          continue;
        }
        if (!isPairAllowed(sourceLocale, tgt, allowedBases, pinnedTargets)) {
          results.push({ locale: tgt, skipped: "pair not allowed" });
          continue;
        }
        try {
          const summary = await adoptEntryTree({
            cma, entryId, environmentId, spaceId,
            sourceLocale, targetLocale: tgt, defaultLocale,
            selected, adoptAll, overwriteAll, overwriteSelected,
            cardSelected,
          });
          results.push({
            locale: tgt, ...summary,
            failures: summary.failures ?? [], cardSkips: summary.cardSkips ?? [],
          });
        } catch (err) {
          results.push({
            locale: tgt, changedFields: 0, updatedEntries: 0, traversedEntries: 0,
            failures: [{ entryId, ...describeCmaError(err) }], cardSkips: [],
          });
        }
      }
    } finally {
      setAdopting(false);
      setAdoptStartedAt(null);
    }

    const overallMs = performance.now() - overallStart;
    const attempted = results.filter((r) => !r.skipped);
    const totalChangedFields = attempted.reduce((n, r) => n + r.changedFields, 0);
    const totalUpdatedEntries = attempted.reduce((n, r) => n + r.updatedEntries, 0);
    const totalTraversed = attempted.reduce((n, r) => n + (r.traversedEntries ?? 0), 0);
    const failedLocales = attempted.filter((r) => r.failures.length > 0);

    console.log(
      `[ADOPT TOTAL] ${targets.join(", ")} | ${totalTraversed} entries traversed | ` +
        `${totalUpdatedEntries} entries updated | ${totalChangedFields} fields | ` +
        `${failedLocales.length} locale(s) with failures | ${(overallMs / 1000).toFixed(2)}s`,
    );
    setActualDurationMs(overallMs);
    setSavedMs(Math.max(0, attempted.length * MANUAL_MS_PER_LOCALE - overallMs));
    setAdoptMsg(formatAdoptReport(results));
    setAdoptStatus(
      failedLocales.length === 0
        ? "success"
        : totalUpdatedEntries > 0
          ? "partial"
          : "error",
    );

    // Refresh the diff so the user sees what was written. This runs after the
    // status is set: a failed refresh says nothing about whether adopt worked.
    if (targetLocale) {
      const requestId = ++diffRequestRef.current;
      try {
        const fresh = await cma.entry.get({ entryId, environmentId, spaceId });
        const tree = await buildDiffTree({
          entry: fresh, cma, sourceLocale, targetLocale, defaultLocale,
          cache: {}, visited: new Set(),
        });
        if (requestId === diffRequestRef.current) {
          setDiffData(tree);
          setAllFields(collectFields(tree, entryId));
        }
      } catch (err) {
        console.warn("[Locale Populator] Adopt finished but the diff could not be refreshed:", err);
        if (requestId === diffRequestRef.current) {
          setDiffError("Adopt finished, but the diff could not be refreshed. Reopen the dialog to see the latest content.");
        }
      }
    }
  };

  const handleSourceChange = (v) => {
    setSourceLocale(v);
    if (targetLocale && !isPairAllowed(v, targetLocale, allowedBases, pinnedTargets)) {
      setTargetLocale(undefined);
    }
    setAdoptTargets((prev) => prev.filter((code) => isPairAllowed(v, code, allowedBases, pinnedTargets)));
  };

  // A bulk selection made for one target shouldn't carry over to the next, or
  // Adopt writes to locales picked for a different page view.
  const handleTargetChange = (v) => {
    setTargetLocale(v);
    setAdoptTargets([]);
  };

  // The locale on screen plus the "additional locales" picker. Shown next to
  // the Adopt button so the user sees exactly where it will write.
  const writeTargets = Array.from(
    new Set([targetLocale, ...adoptTargets].filter(Boolean)),
  );

  const hasSelection =
    adoptAll ||
    overwriteAll ||
    Object.values(selected).some((s) => s.size > 0) ||
    Object.values(overwriteSelected).some((s) => s.size > 0) ||
    Object.values(cardSelected).some((fields) =>
      Object.values(fields).some((c) => Object.keys(c.picks).length > 0),
    );

  const isActionDisabled =
    adopting ||
    !sourceLocale ||
    (!targetLocale && adoptTargets.length === 0) ||
    !hasSelection;

  if (localesLoading) {
    return (
      <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Spinner variant="primary" size="medium" />
      </div>
    );
  }

  if (localesError) {
    return (
      <div style={{ margin: 20 }}>
        <Note variant="negative" title="Could not load locales">
          {localesError}
        </Note>
      </div>
    );
  }

  const controls = (
    <MergeControls
      adoptAll={adoptAll}
      overwriteAll={overwriteAll}
      onAdoptAllChange={(checked) => {
        setAdoptAll(checked);
        if (checked) { setSelected({}); setOverwriteSelected({}); }
      }}
      onOverwriteAllChange={(checked) => {
        setOverwriteAll(checked);
        if (checked) { setAdoptAll(true); setSelected({}); setOverwriteSelected({}); }
      }}
      adopting={adopting}
      adoptStatus={adoptStatus}
      adoptMsg={adoptMsg}
      isDisabled={isActionDisabled}
      onAdopt={adoptChanges}
      elapsedMs={elapsedMs}
      estimatedTotalMs={estimatedTotalMs}
      actualDurationMs={actualDurationMs}
      savedMs={savedMs}
      locales={locales}
      sourceLocale={sourceLocale}
      targetLocale={targetLocale}
      adoptTargets={adoptTargets}
      writeTargets={writeTargets}
      allowedBases={allowedBases}
      onAdoptTargetsChange={setAdoptTargets}
    />
  );

  return (
    <div>
      <style>{`@keyframes adoptProgress { 0% { transform: translateX(-100%); } 100% { transform: translateX(350%); } }`}</style>

      <LocaleSelectors
        locales={locales}
        sourceLocale={sourceLocale}
        targetLocale={targetLocale}
        allowedBases={allowedBases}
        pinnedTargets={pinnedTargets}
        onSourceChange={handleSourceChange}
        onTargetChange={handleTargetChange}
      />

      {(diffData || diffLoading || diffError) && (
        <>
          {diffData && controls}
          <DiffViewer
            loading={diffLoading}
            error={diffError}
            diffData={diffData}
            spaceId={spaceId}
            environmentId={environmentId}
            entryId={entryId}
            selected={selected}
            onToggleField={onToggleField}
            adoptAll={adoptAll}
            overwriteAll={overwriteAll}
            overwriteSelected={overwriteSelected}
            onToggleOverwrite={onToggleOverwrite}
            cardSelected={cardSelected}
            onToggleCard={onToggleCard}
            onToggleAddMissing={onToggleAddMissing}
            hiddenFields={hiddenFields}
          />
          {diffData && controls}
        </>
      )}
    </div>
  );
}
