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

  return targetCode === sourceCode || targetCode.startsWith(`${srcBase}-`);
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

  // Per-field selections
  const [selected, setSelected] = useState({});

  // Multiselect state
  const [adoptTargets, setAdoptTargets] = useState([]);
  const [adopting, setAdopting] = useState(false);
  const [adoptMsg, setAdoptMsg] = useState(null);
  const [adoptSearch, setAdoptSearch] = useState("");

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
        })
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

        const tree = await buildDiffTree({
          entry,
          cma,
          sourceLocale,
          targetLocale,
          defaultLocale: locales.find((l) => l.default)?.code,
          cache: {},
        });

        setDiffData(tree);
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

  // Reset status when locales change
  useEffect(() => {
    setAdoptStatus("idle");
    setAdoptMsg(null);
  }, [sourceLocale, targetLocale]);

  // Toggle field selection
  const onToggleField = (entryIdForField, fieldId, isChecked) => {
    setAdoptAll(false);
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
            (l.code || "").toLowerCase().includes(needle)
      );
  }, [locales, sourceLocale, adoptSearch]);

  const handleAdoptSearchValueChange = (e) => {
    setAdoptSearch(e.target.value);
  };

  const handleSelectAdoptItem = (e) => {
    const { checked, value } = e.target;

    setAdoptTargets((prev) =>
      checked
        ? Array.from(new Set([...prev, value]))
        : prev.filter((v) => v !== value)
    );
  };

  // Adopt changes
  const adoptChanges = async () => {
    if (!sourceLocale) return;

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
        });

        totalChangedFields += summary.changedFields;
        totalUpdatedEntries += summary.updatedEntries;
        totalTraversed += summary.traversedEntries;
      }

      setAdoptMsg(
        `Adopted ${totalChangedFields} field${
          totalChangedFields === 1 ? "" : "s"
        } across ${totalUpdatedEntries} entr${
          totalUpdatedEntries === 1 ? "y" : "ies"
        } (${targets.join(", ")}).`
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
        });

        setDiffData(tree);
      }

      setAdoptStatus("success");
    } catch (err) {
      console.error(err);
      setAdoptMsg("Failed to adopt changes.");
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
                prev.filter((code) => isPairAllowed(v, code))
              );
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
          <Note variant="negative" title="Unable to compare">
            {error}
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
                    isLoading={adopting}
                    onClick={adoptChanges}
                    disabled={
                      !sourceLocale ||
                      (!targetLocale && adoptTargets.length === 0)
                    }
                  >
                    Adopt Source → Target
                  </Button>
                  {adoptMsg && <span>{adoptMsg}</span>}
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
