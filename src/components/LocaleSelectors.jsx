import React from "react";
import { Select } from "@contentful/f36-components";
import { isPairAllowed } from "../lib/localeUtils";

export default function LocaleSelectors({
  locales,
  sourceLocale,
  targetLocale,
  allowedBases,
  pinnedTargets,
  onSourceChange,
  onTargetChange,
}) {
  const filteredTargets = locales.filter((l) =>
    isPairAllowed(sourceLocale, l.code, allowedBases, pinnedTargets),
  );

  return (
    <div style={{ margin: "20px", display: "flex", alignItems: "center", gap: "10px" }}>
      <div style={{ flex: 1 }}>
        <h3>Source Locale</h3>
        <Select
          name="sourceLocale"
          value={sourceLocale ?? ""}
          onChange={(e) => onSourceChange(e.target.value || undefined)}
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
          onChange={(e) => onTargetChange(e.target.value || undefined)}
        >
          <Select.Option value="">-- Select target locale --</Select.Option>
          {filteredTargets.map((locale) => (
            <Select.Option key={locale.sys.id} value={locale.code}>
              {locale.name}
            </Select.Option>
          ))}
        </Select>
      </div>
    </div>
  );
}
