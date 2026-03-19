import React, { useEffect, useMemo, useState } from "react";
import {
  Paragraph,
  Select,
  Spinner,
  TextInput,
  Note,
  Button,
} from "@contentful/f36-components";
import { Multiselect } from "@contentful/f36-multiselect";
import { useSDK } from "@contentful/react-apps-toolkit";
import { cmaSDK } from "../lib/contentful";
import DiffChecker from "../components/DiffChecker";
import { buildDiffTree } from "../lib/buildDiffTree";
import { adoptEntryTree } from "../lib/adoptTree";
import { callCMA } from "../lib/rateLimiter";

// Locale-pairing constraints
const ALLOWED_BASES = new Set([
  "en",
  "de",
  "es",
  "nl",
  "it",
  "ar",
  "fr",
  "zh",
  "jp",
]);

function isPairAllowed(sourceCode, targetCode) {
  if (!sourceCode || !targetCode) return false;

  const srcBase = sourceCode.split("-")[0];
  const tgtBase = targetCode.split("-")[0];

  if (!ALLOWED_BASES.has(srcBase)) return false;
  if (srcBase !== tgtBase) return false;

  // ✅ Allow same exact locale OR base-only locale OR any region variant of the base
  return (
    targetCode === sourceCode ||
    targetCode === srcBase ||
    targetCode.startsWith(`${srcBase}-`)
  );
}

// Flatten diffTree into a list of { entryId, fieldId } so we can build
// "all fields except this one" when the user deselects a field in adoptAll mode.
function collectFields(tree, rootEntryId) {
  const result = [];

  const walk = (nodeMap, currentEntryId) => {
    if (!nodeMap) return;

    // 🚨 Stop on circular node
    if (nodeMap.type === "circular") return;

    Object.entries(nodeMap).forEach(([key, node]) => {
      if (!node) return;
      if (node.type === "circular") return;

      if (node.type === "field") {
        result.push({ entryId: currentEntryId, fieldId: key });
      } else if (node.type === "reference") {
        const childEntryId = node.linkEntryId || node.id || currentEntryId;
        if (node.children) {
          walk(node.children, childEntryId);
        }
      } else if (node.type === "reference-list") {
        Object.values(node.children || {}).forEach((childNode) => {
          if (!childNode) return;
          if (childNode.type === "circular") return;

          const childEntryId =
            childNode.linkEntryId || childNode.id || currentEntryId;

          if (childNode.children) {
            walk(childNode.children, childEntryId);
          }
        });
      }
    });
  };

  walk(tree, rootEntryId);
  return result;
}

const Dialog = () => {
  const sdk = useSDK();
  const cma = useMemo(() => cmaSDK(sdk), [sdk]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [locales, setLocales] = useState([]);

  const [sourceLocale, setSourceLocale] = useState();
  const [targetLocale, setTargetLocale] = useState();
  const [diffData, setDiffData] = useState(null);

  const [adoptStatus, setAdoptStatus] = useState("idle");
  const [adoptAll, setAdoptAll] = useState(true);
  const [allFields, setAllFields] = useState([]); // [{ entryId, fieldId }]
  const [overwriteAll, setOverwriteAll] = useState(false);

  // Per-field selections
  const [selected, setSelected] = useState({});

  // Multiselect state
  const [adoptTargets, setAdoptTargets] = useState([]);
  const [adopting, setAdopting] = useState(false);
  const [adoptMsg, setAdoptMsg] = useState(null);
  const [adoptSearch, setAdoptSearch] = useState("");
  const [selectAllLocales, setSelectAllLocales] = useState(false);
  const [selectAllGlobalEn, setSelectAllGlobalEn] = useState(false);
  const SELECT_ALL_VALUE = "__SELECT_ALL_LOCALES__";
  const SELECT_ALL_GLOBAL_EN_VALUE = "__SELECT_ALL_GLOBAL_EN__";

  const GLOBAL_EN_LOCALES = new Set([
    "en-US",
    "en-SG",
    "en-KE",
    "en-ZA",
    "en-GH",
    "en-NO",
    "en-NG",
    "en-PH",
    "en-PK",
    "en-IN",
    "en-ID",
    "en-HK",
    "en-TH",
    "en-VN",
    "en-SE",
    "en-GR",
    "en-IL",
    "en-FI",
    "en-DK",
    "en-AU",
    "en-NZ",
    "en-GB",
    "en-IE",
    "en-MY",
    "en-BG",
    "en-CZ",
    "en-HU",
    "en-TR",
    "en-HR",
    "en-SK",
    "en-RS",
    "en-RO",
    "en-TW",
  ]);

  // Invocation
  const params = sdk.parameters.invocation;
  const entryId = params?.entryId || sdk.ids.entry;
  const environmentId = params?.environmentId || sdk.ids.environment;
  const spaceId = params?.spaceId || sdk.ids.space;

  // Load locales
  useEffect(() => {
    const fetchLocales = async () => {
      setLoading(true);
      const localesRes = await callCMA(() =>
        cma.locale.getMany({
          environmentId: sdk.ids.environment,
          spaceId: sdk.ids.space,
          query: { limit: 1000 },
        }),
      );
      setLocales(localesRes.items);
      setLoading(false);
    };

    fetchLocales();
  }, [cma, sdk.ids.environment, sdk.ids.space]);

  // Load diff
  useEffect(() => {
    const run = async () => {
      if (!sourceLocale || !targetLocale) return;

      try {
        setLoading(true);

        const entry = await cma.entry.get({
          entryId,
          environmentId,
          spaceId,
        });

        console.log("Fetched entry for diff:", entry);

        const tree = await buildDiffTree({
          entry,
          cma,
          sourceLocale,
          targetLocale,
          defaultLocale: locales.find((l) => l.default)?.code,
          cache: {},
          visited: new Set(),
          maxDepth: 4,
          maxNodes: 250,
        });

        setDiffData(tree);
        setAllFields(collectFields(tree, entryId)); // track all fields in this diff
        setError(null);
      } catch (err) {
        console.error(err);
        setError("Failed to fetch entry for diff");
      } finally {
        setLoading(false);
      }
    };

    run();
  }, [
    sourceLocale,
    targetLocale,
    entryId,
    environmentId,
    spaceId,
    cma,
    locales,
  ]);

  // Re-enable button when locale selection changes after a completed adoption
  const adoptTargetsKey = adoptTargets.join(",");
  useEffect(() => {
    setAdoptStatus((prev) => (prev === "idle" ? prev : "idle"));
    setAdoptMsg((prev) => (prev === null ? prev : null));
  }, [sourceLocale, targetLocale, adoptTargetsKey, overwriteAll]);

  const onToggleField = (entryIdForField, fieldId, isChecked) => {
    // If adoptAll was true and user unticks even one → turn off adoptAll
    if (adoptAll && !isChecked) {
      setAdoptAll(false);

      // Build explicit selected list = all fields except the one they unchecked
      setSelected(() => {
        const next = {};

        (allFields || []).forEach(({ entryId, fieldId: fid }) => {
          if (entryId === entryIdForField && fid === fieldId) return; // skip unchecked
          if (!next[entryId]) next[entryId] = new Set();
          next[entryId].add(fid);
        });

        return next;
      });

      return;
    }

    // Normal partial-mode behaviour (explicit selections)
    setSelected((prev) => {
      const next = { ...prev };
      const set = new Set(next[entryIdForField] || []);

      if (isChecked) set.add(fieldId);
      else set.delete(fieldId);

      next[entryIdForField] = set;
      return next;
    });
  };

  // Filter Multiselect list
  const filteredAdoptLocales = useMemo(() => {
    const needle = adoptSearch.trim().toLowerCase();

    return (locales || [])
      .filter((l) => l.code !== sourceLocale)
      .filter((l) => isPairAllowed(sourceLocale, l.code))
      .filter((l) =>
        !needle
          ? true
          : (l.name || "").toLowerCase().includes(needle) ||
            (l.code || "").toLowerCase().includes(needle),
      );
  }, [locales, sourceLocale, adoptSearch]);

  const globalEnAdoptLocales = useMemo(() => {
    return (locales || [])
      .filter((l) => l.code !== sourceLocale)
      .filter((l) => isPairAllowed(sourceLocale, l.code))
      .filter((l) => GLOBAL_EN_LOCALES.has(l.code));
  }, [locales, sourceLocale]);

  useEffect(() => {
    console.log("==== GLOBAL EN DEBUG ====");
    console.log("Source locale:", sourceLocale);

    console.log(
      "All locales:",
      locales.map((l) => l.code),
    );

    console.log("Global EN allowed list:", Array.from(GLOBAL_EN_LOCALES));

    console.log(
      "Computed Global EN locales:",
      globalEnAdoptLocales.map((l) => l.code),
    );

    console.log("Count:", globalEnAdoptLocales.length);

    console.log("==== END DEBUG ====");
  }, [globalEnAdoptLocales, locales, sourceLocale]);

  const handleAdoptSearchValueChange = (e) => {
    setAdoptSearch(e.target.value);
  };

  const handleSelectAdoptItem = (e) => {
    const { checked, value } = e.target;

    // Select all eligible locales
    if (value === SELECT_ALL_VALUE) {
      if (checked) {
        setSelectAllLocales(true);
        setSelectAllGlobalEn(false);
        setAdoptTargets(filteredAdoptLocales.map((l) => l.code));
      } else {
        setSelectAllLocales(false);
        setAdoptTargets([]);
      }
      return;
    }

    // Select all Global EN locales
    if (value === SELECT_ALL_GLOBAL_EN_VALUE) {
      if (checked) {
        setSelectAllGlobalEn(true);
        setSelectAllLocales(false);
        setAdoptTargets(globalEnAdoptLocales.map((l) => l.code));
      } else {
        setSelectAllGlobalEn(false);
        setAdoptTargets([]);
      }
      return;
    }

    // Normal locale toggle
    setAdoptTargets((prev) => {
      const next = checked
        ? Array.from(new Set([...prev, value]))
        : prev.filter((v) => v !== value);

      // Manual changes disable synthetic selections
      if (selectAllLocales) setSelectAllLocales(false);
      if (selectAllGlobalEn) setSelectAllGlobalEn(false);

      return next;
    });
  };

  // Adopt changes
  const adoptChanges = async () => {
    if (!sourceLocale) return;

    const overallStart = performance.now();

    const targets =
      adoptTargets.length > 0
        ? adoptTargets
        : targetLocale
          ? [targetLocale]
          : [];

    if (targets.length === 0) return;

    setAdoptMsg(null);
    setAdopting(true);
    setAdoptStatus("running");

    try {
      const defaultLocale = locales.find((l) => l.default)?.code;

      let totalChangedFields = 0;
      let totalUpdatedEntries = 0;
      let totalTraversed = 0;

      for (const tgt of targets) {
        if (tgt === sourceLocale) continue;
        if (!isPairAllowed(sourceLocale, tgt)) continue;

        console.log("Overwrite all:", overwriteAll);

        const summary = await adoptEntryTree({
          cma,
          entryId,
          environmentId,
          spaceId,
          sourceLocale,
          targetLocale: tgt,
          defaultLocale,
          selected,
          adoptAll,
          overwriteAll,
        });

        totalChangedFields += summary.changedFields;
        totalUpdatedEntries += summary.updatedEntries;
        totalTraversed += summary.traversedEntries;
      }

      const overallMs = performance.now() - overallStart;
      console.log(
        `[ADOPT TOTAL] ${targets.join(", ")} | ${totalTraversed} entries traversed | ` +
          `${totalUpdatedEntries} entries updated | ${totalChangedFields} fields | ` +
          `${(overallMs / 1000).toFixed(2)}s`,
      );

      setAdoptMsg(
        `Adopted ${totalChangedFields} field${
          totalChangedFields === 1 ? "" : "s"
        } across ${totalUpdatedEntries} entries (${targets.join(", ")}).`,
      );

      // Refresh diff
      if (targetLocale) {
        const fresh = await cma.entry.get({
          entryId,
          environmentId,
          spaceId,
        });

        const tree = await buildDiffTree({
          entry: fresh,
          cma,
          sourceLocale,
          targetLocale,
          defaultLocale,
          cache: {},
          visited: new Set(),
        });

        setDiffData(tree);
        setAllFields(collectFields(tree, entryId)); // keep allFields in sync
      }

      setAdoptStatus("success");
    } catch (err) {
      console.error(err);
      const BASE =
        "Adoption failed. Please double check validation rules.\n" +
        "If reporting this issue, include the requestId below.";

      function formatAdoptError(err) {
        // 1) Try to interpret err.message as JSON (Contentful SDK often puts JSON in message)
        const rawMsg =
          typeof err?.message === "string" ? err.message.trim() : "";
        let parsed = null;

        if (rawMsg.startsWith("{") && rawMsg.endsWith("}")) {
          try {
            parsed = JSON.parse(rawMsg);
          } catch {
            // not JSON, ignore
          }
        }

        // 2) Prefer parsed.details.errors[].message if available
        const errors =
          parsed?.details?.errors?.map((e) => e?.message).filter(Boolean) ??
          err?.details?.errors?.map((e) => e?.message).filter(Boolean) ??
          [];

        // Deduplicate (you have the same message repeated)
        const uniqueErrors = Array.from(new Set(errors));

        const messagesBlock =
          uniqueErrors.length > 0
            ? uniqueErrors.map((m) => `• ${m}`).join("\n")
            : parsed?.message || rawMsg || "Unknown error";

        const requestId = parsed?.requestId || err?.requestId;
        const requestIdBlock = requestId ? `\n\nRequest ID: ${requestId}` : "";

        return `${BASE}\n\n${messagesBlock}${requestIdBlock}`;
      }

      // usage
      setAdoptMsg(formatAdoptError(err));
      setAdoptStatus("error");
    } finally {
      setAdopting(false);
    }
  };

  if (loading)
    return (
      <div
        style={{
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Spinner variant="primary" size="medium" />
      </div>
    );

  const noteVariant =
    adoptStatus === "running"
      ? "warning"
      : adoptStatus === "success"
        ? "positive"
        : adoptStatus === "error"
          ? "negative"
          : "primary";

  const noteTitle =
    adoptStatus === "running"
      ? "Adopting changes…"
      : adoptStatus === "success"
        ? "Adoption complete"
        : adoptStatus === "error"
          ? "Adoption failed"
          : "Do you wish to adopt these changes?";

  return (
    <div>
      <style>{`
        @keyframes adoptProgress {
          0%   { transform: translateX(-100%); }
          100% { transform: translateX(350%); }
        }
      `}</style>
      {/* Locale Pickers */}
      <div
        style={{
          margin: "20px",
          display: "flex",
          alignItems: "center",
          gap: "10px",
        }}
      >
        <div style={{ flex: 1 }}>
          <h3>Source Locale</h3>
          <Select
            name="sourceLocale"
            value={sourceLocale ?? ""}
            onChange={(e) => {
              const v = e.target.value || undefined;
              setSourceLocale(v);

              if (targetLocale && !isPairAllowed(v, targetLocale)) {
                setTargetLocale(undefined);
              }

              setAdoptTargets((prev) =>
                prev.filter((code) => isPairAllowed(v, code)),
              );
              setSelectAllLocales(false);
              setSelectAllGlobalEn(false);
            }}
          >
            <Select.Option value="">-- Select source locale --</Select.Option>

            {locales.map((locale) => (
              <Select.Option key={locale.sys.id} value={locale.code}>
                {locale.name}
              </Select.Option>
            ))}
          </Select>
        </div>

        <div style={{ flex: 1 }}>
          <h3>Target Locale</h3>
          <Select
            name="targetLocale"
            value={targetLocale ?? ""}
            onChange={(e) => {
              const v = e.target.value || undefined;
              setTargetLocale(v);
            }}
          >
            <Select.Option value="">-- Select target locale --</Select.Option>

            {locales
              .filter((l) => isPairAllowed(sourceLocale, l.code))
              .map((locale) => (
                <Select.Option key={locale.sys.id} value={locale.code}>
                  {locale.name}
                </Select.Option>
              ))}
          </Select>
        </div>
      </div>

      {error && (
        <div style={{ margin: 20 }}>
          <Note
            variant="negative"
            title="Unable to compare - please ensure all references are accessible."
          >
            If you wish to report this, please take the requestId at the end of
            the error message. {error}
          </Note>
        </div>
      )}

      {diffData && (
        <>
          <DiffChecker
            diffTree={diffData}
            spaceId={spaceId}
            environmentId={environmentId}
            entryId={entryId}
            selected={selected}
            onToggleField={onToggleField}
            adoptAll={adoptAll}
            overwriteAll={overwriteAll}
          />

          {/* Multi-adopt block */}
          <div style={{ margin: 20 }}>
            <Note variant={noteVariant} title={noteTitle}>
              <div style={{ display: "grid", gap: 12 }}>
                <label style={{ display: "flex", gap: 8 }}>
                  <input
                    type="checkbox"
                    checked={adoptAll}
                    onChange={(e) => {
                      setAdoptAll(e.target.checked);
                      if (e.target.checked) setSelected({});
                    }}
                  />
                  Adopt all fields
                </label>

                <label style={{ display: "flex", gap: 8, marginLeft: 20 }}>
                  <input
                    type="checkbox"
                    checked={overwriteAll}
                    disabled={!adoptAll}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setOverwriteAll(checked);

                      // Overwrite implies adopt-all and no partial selections
                      if (checked) {
                        setAdoptAll(true);
                        setSelected({});
                      }
                    }}
                  />
                  <span>
                    Overwrite all fields
                    <span style={{ color: "#c00", marginLeft: 6 }}>
                      (replaces all target values)
                    </span>
                  </span>
                </label>

                <div>
                  <div style={{ marginBottom: 6, fontWeight: 600 }}>
                    Adopt into additional locales (optional)
                  </div>

                  <Multiselect
                    placeholder="Search and select locales"
                    searchProps={{
                      searchPlaceholder: "Search locales",
                      onSearchValueChange: handleAdoptSearchValueChange,
                    }}
                    popoverProps={{ isFullWidth: true }}
                    currentSelection={adoptTargets}
                  >
                    <Multiselect.Option
                      key="select-all-locales"
                      value={SELECT_ALL_VALUE}
                      label={`Select all eligible locales (${filteredAdoptLocales.length})`}
                      onSelectItem={handleSelectAdoptItem}
                      itemId="select-all-locales"
                      isChecked={
                        selectAllLocales &&
                        adoptTargets.length === filteredAdoptLocales.length &&
                        filteredAdoptLocales.length > 0
                      }
                    />

                    <Multiselect.Option
                      key="select-all-global-en"
                      value={SELECT_ALL_GLOBAL_EN_VALUE}
                      label={`Select all Global EN (${globalEnAdoptLocales.length})`}
                      onSelectItem={handleSelectAdoptItem}
                      itemId="select-all-global-en"
                      isChecked={
                        selectAllGlobalEn &&
                        adoptTargets.length === globalEnAdoptLocales.length &&
                        globalEnAdoptLocales.length > 0
                      }
                    />

                    {/* Optional visual divider */}
                    <div
                      style={{
                        height: 1,
                        background: "#e5e5e5",
                        margin: "6px 0",
                      }}
                    />

                    {filteredAdoptLocales.map((l, index) => (
                      <Multiselect.Option
                        key={`adopt-${l.sys.id}-${index}`}
                        value={l.code}
                        label={`${l.name} (${l.code})`}
                        onSelectItem={handleSelectAdoptItem}
                        itemId={`adopt-${l.sys.id}-${index}`}
                        isChecked={adoptTargets.includes(l.code)}
                        isDisabled={l.code === sourceLocale}
                      />
                    ))}
                  </Multiselect>

                  <div style={{ marginTop: 6, color: "#666", fontSize: 12 }}>
                    If empty, adoption uses the target locale above (
                    {targetLocale || "—"}).
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <Button
                    variant="positive"
                    onClick={adoptChanges}
                    isDisabled={
                      adopting ||
                      !sourceLocale ||
                      (!targetLocale && adoptTargets.length === 0) ||
                      adoptStatus === "success"
                    }
                  >
                    {adopting ? (
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 8,
                        }}
                      >
                        <Spinner size="small" />
                        Adopting…
                      </span>
                    ) : adoptStatus === "success" ? (
                      "Adopted ✓"
                    ) : (
                      "Adopt Source → Target"
                    )}
                  </Button>
                  {adoptMsg && (
                    <Note variant={noteVariant} title={noteTitle}>
                      <pre style={{ whiteSpace: "pre-wrap", margin: 0 }}>
                        {adoptMsg}
                      </pre>
                    </Note>
                  )}
                  {adopting && (
                    <div
                      style={{
                        display: "inline-block",
                        width: 120,
                        height: 6,
                        background: "#e0e0e0",
                        borderRadius: 3,
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          width: "40%",
                          height: "100%",
                          background: "#0059C8",
                          borderRadius: 3,
                          animation: "adoptProgress 1.2s ease-in-out infinite",
                        }}
                      />
                    </div>
                  )}
                </div>
              </div>
            </Note>
          </div>
        </>
      )}
    </div>
  );
};

export default Dialog;
