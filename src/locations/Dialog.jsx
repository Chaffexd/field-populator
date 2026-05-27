import React, { useEffect, useMemo, useState } from "react";
import { Spinner } from "@contentful/f36-components";
import { useSDK } from "@contentful/react-apps-toolkit";
import { cmaSDK } from "../lib/contentful";
import { buildDiffTree } from "../lib/buildDiffTree";
import { adoptEntryTree } from "../lib/adoptTree";
import { callCMA } from "../lib/rateLimiter";
import {
  isPairAllowed,
  ALLOWED_BASES_DEFAULT,
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

export default function Dialog() {
  const sdk = useSDK();
  const cma = useMemo(() => cmaSDK(sdk), [sdk]);

  // Read installation config with fallbacks for backwards compatibility
  const installParams = sdk.parameters?.installation ?? {};
  const allowedBases = installParams.allowedBases ?? ALLOWED_BASES_DEFAULT;
  const hiddenFields = installParams.hiddenFields ?? HIDDEN_FIELDS_DEFAULT;
  const defaultSourceLocale = installParams.defaultSourceLocale ?? undefined;
  const defaultTargetLocale = installParams.defaultTargetLocale ?? undefined;

  const invocation = sdk.parameters.invocation;
  const entryId = invocation?.entryId || sdk.ids.entry;
  const environmentId = invocation?.environmentId || sdk.ids.environment;
  const spaceId = invocation?.spaceId || sdk.ids.space;

  const [localesLoading, setLocalesLoading] = useState(true);
  const [locales, setLocales] = useState([]);

  const [sourceLocale, setSourceLocale] = useState(defaultSourceLocale);
  const [targetLocale, setTargetLocale] = useState(defaultTargetLocale);

  const [diffData, setDiffData] = useState(null);
  const [diffLoading, setDiffLoading] = useState(false);
  const [diffError, setDiffError] = useState(null);

  const [adoptAll, setAdoptAll] = useState(false);
  const [overwriteAll, setOverwriteAll] = useState(false);
  const [allFields, setAllFields] = useState([]);
  const [selected, setSelected] = useState({});
  const [overwriteSelected, setOverwriteSelected] = useState({});
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
    const fetch = async () => {
      setLocalesLoading(true);
      const res = await callCMA(() =>
        cma.locale.getMany({
          environmentId: sdk.ids.environment,
          spaceId: sdk.ids.space,
          query: { limit: 1000 },
        }),
      );
      setLocales(res.items);
      setLocalesLoading(false);
    };
    fetch();
  }, [cma, sdk.ids.environment, sdk.ids.space]);

  // Load diff when locale pair changes
  useEffect(() => {
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
        setDiffData(tree);
        setAllFields(collectFields(tree, entryId));
        setDiffError(null);
      } catch {
        setDiffError("Failed to fetch entry for diff");
      } finally {
        setDiffLoading(false);
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

  // Reset per-field overwrite when locale pair changes
  useEffect(() => {
    setOverwriteSelected({});
  }, [sourceLocale, targetLocale]);

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
      setOverwriteSelected((prev) => {
        const next = { ...prev };
        const set = new Set(next[entryIdForField] || []);
        set.delete(fieldId);
        next[entryIdForField] = set;
        return next;
      });
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
      setSelected((prev) => {
        const next = { ...prev };
        const set = new Set(next[entryIdForField] || []);
        set.delete(fieldId);
        next[entryIdForField] = set;
        return next;
      });
    }
    setOverwriteSelected((prev) => {
      const next = { ...prev };
      const set = new Set(next[entryIdForField] || []);
      if (isChecked) set.add(fieldId); else set.delete(fieldId);
      next[entryIdForField] = set;
      return next;
    });
  };

  const adoptChanges = async () => {
    if (!sourceLocale) return;
    const targets =
      adoptTargets.length > 0 ? adoptTargets : targetLocale ? [targetLocale] : [];
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

    try {
      let totalChangedFields = 0;
      let totalUpdatedEntries = 0;
      let totalTraversed = 0;

      for (const tgt of targets) {
        if (tgt === sourceLocale) continue;
        if (!isPairAllowed(sourceLocale, tgt, allowedBases)) continue;
        const summary = await adoptEntryTree({
          cma, entryId, environmentId, spaceId,
          sourceLocale, targetLocale: tgt, defaultLocale,
          selected, adoptAll, overwriteAll, overwriteSelected,
        });
        totalChangedFields += summary.changedFields;
        totalUpdatedEntries += summary.updatedEntries;
        totalTraversed += summary.traversedEntries ?? 0;
      }

      const overallMs = performance.now() - overallStart;
      console.log(
        `[ADOPT TOTAL] ${targets.join(", ")} | ${totalTraversed} entries traversed | ` +
          `${totalUpdatedEntries} entries updated | ${totalChangedFields} fields | ` +
          `${(overallMs / 1000).toFixed(2)}s`,
      );
      setActualDurationMs(overallMs);
      setSavedMs(Math.max(0, targets.length * MANUAL_MS_PER_LOCALE - overallMs));
      setAdoptMsg(
        `Adopted ${totalChangedFields} field${totalChangedFields === 1 ? "" : "s"} across ${totalUpdatedEntries} entries (${targets.join(", ")}).`,
      );

      if (targetLocale) {
        const fresh = await cma.entry.get({ entryId, environmentId, spaceId });
        const tree = await buildDiffTree({
          entry: fresh, cma, sourceLocale, targetLocale, defaultLocale,
          cache: {}, visited: new Set(),
        });
        setDiffData(tree);
        setAllFields(collectFields(tree, entryId));
      }

      setAdoptStatus("success");
    } catch (err) {
      const rawMsg = typeof err?.message === "string" ? err.message.trim() : "";
      let parsed = null;
      if (rawMsg.startsWith("{") && rawMsg.endsWith("}")) {
        try { parsed = JSON.parse(rawMsg); } catch {}
      }
      const errors = Array.from(
        new Set(
          parsed?.details?.errors?.map((e) => e?.message).filter(Boolean) ??
          err?.details?.errors?.map((e) => e?.message).filter(Boolean) ?? [],
        ),
      );
      const BASE =
        "Adoption failed. Please double check validation rules.\n" +
        "If reporting this issue, include the requestId below.";
      const messagesBlock =
        errors.length > 0
          ? errors.map((m) => `• ${m}`).join("\n")
          : parsed?.message || rawMsg || "Unknown error";
      const requestId = parsed?.requestId || err?.requestId;
      setAdoptMsg(
        `${BASE}\n\n${messagesBlock}${requestId ? `\n\nRequest ID: ${requestId}` : ""}`,
      );
      setAdoptStatus("error");
    } finally {
      setAdopting(false);
      setAdoptStartedAt(null);
    }
  };

  const handleSourceChange = (v) => {
    setSourceLocale(v);
    if (targetLocale && !isPairAllowed(v, targetLocale, allowedBases)) {
      setTargetLocale(undefined);
    }
    setAdoptTargets((prev) => prev.filter((code) => isPairAllowed(v, code, allowedBases)));
  };

  const hasSelection =
    adoptAll ||
    overwriteAll ||
    Object.values(selected).some((s) => s.size > 0) ||
    Object.values(overwriteSelected).some((s) => s.size > 0);

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
        onSourceChange={handleSourceChange}
        onTargetChange={setTargetLocale}
      />

      {(diffData || diffLoading || diffError) && (
        <>
          {controls}
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
            hiddenFields={hiddenFields}
          />
          {diffData && controls}
        </>
      )}
    </div>
  );
}
