import React, { useMemo, useState } from "react";
import { Multiselect } from "@contentful/f36-multiselect";
import { isPairAllowed } from "../lib/localeUtils";

const GLOBAL_EN_LOCALES = new Set([
  "en-AU","en-BH","en-BG","en-HR","en-CZ","en-DK","en-EG","en-FI",
  "en-GH","en-GR","en-HK","en-HU","en-IN","en-ID","en-IQ","en-IL",
  "en-JO","en-KE","en-KW","en-LB","en-NZ","en-NG","en-NO","en-OM",
  "en-PK","en-PH","en-QA","en-RO","en-SA","en-RS","en-SG","en-SK",
  "en-ZA","en-SE","en-TW","en-TH","en-TR","en-AE","en-VN",
]);

const SELECT_ALL_GLOBAL_EN_VALUE = "__SELECT_ALL_GLOBAL_EN__";

export default function AdoptTargets({
  locales,
  sourceLocale,
  adoptTargets,
  allowedBases,
  onChange,
}) {
  const [search, setSearch] = useState("");
  const [selectAllGlobalEn, setSelectAllGlobalEn] = useState(false);

  const filteredLocales = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return (locales || [])
      .filter((l) => l.code !== sourceLocale)
      .filter((l) => isPairAllowed(sourceLocale, l.code, allowedBases))
      .filter((l) =>
        !needle
          ? true
          : (l.name || "").toLowerCase().includes(needle) ||
            (l.code || "").toLowerCase().includes(needle),
      );
  }, [locales, sourceLocale, allowedBases, search]);

  const globalEnLocales = useMemo(
    () =>
      (locales || [])
        .filter((l) => l.code !== sourceLocale)
        .filter((l) => isPairAllowed(sourceLocale, l.code, allowedBases))
        .filter((l) => GLOBAL_EN_LOCALES.has(l.code)),
    [locales, sourceLocale, allowedBases],
  );

  const handleSelect = (e) => {
    const { checked, value } = e.target;

    if (value === SELECT_ALL_GLOBAL_EN_VALUE) {
      setSelectAllGlobalEn(checked);
      onChange(checked ? globalEnLocales.map((l) => l.code) : []);
      return;
    }

    const next = checked
      ? Array.from(new Set([...adoptTargets, value]))
      : adoptTargets.filter((v) => v !== value);

    if (selectAllGlobalEn) setSelectAllGlobalEn(false);
    onChange(next);
  };

  return (
    <div>
      <div style={{ marginBottom: 6, fontWeight: 600 }}>
        Adopt into additional locales (optional)
      </div>
      <Multiselect
        placeholder="Search and select locales"
        searchProps={{
          searchPlaceholder: "Search locales",
          onSearchValueChange: (e) => setSearch(e.target.value),
        }}
        popoverProps={{ isFullWidth: true }}
        currentSelection={adoptTargets}
      >
        <Multiselect.Option
          key="select-all-global-en"
          value={SELECT_ALL_GLOBAL_EN_VALUE}
          label={`Select all Global EN (${globalEnLocales.length})`}
          onSelectItem={handleSelect}
          itemId="select-all-global-en"
          isChecked={
            selectAllGlobalEn &&
            adoptTargets.length === globalEnLocales.length &&
            globalEnLocales.length > 0
          }
        />
        <div style={{ height: 1, background: "#e5e5e5", margin: "6px 0" }} />
        {filteredLocales.map((l, index) => (
          <Multiselect.Option
            key={`adopt-${l.sys.id}-${index}`}
            value={l.code}
            label={`${l.name} (${l.code})`}
            onSelectItem={handleSelect}
            itemId={`adopt-${l.sys.id}-${index}`}
            isChecked={adoptTargets.includes(l.code)}
            isDisabled={l.code === sourceLocale}
          />
        ))}
      </Multiselect>
      <div style={{ marginTop: 6, color: "#666", fontSize: 12 }}>
        If empty, adoption uses the target locale selected above.
      </div>
    </div>
  );
}
