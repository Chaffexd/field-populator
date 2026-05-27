import React from "react";
import { Button, Note, Spinner } from "@contentful/f36-components";
import AdoptTargets from "./AdoptTargets";

function formatDuration(ms) {
  if (!ms || ms < 0) return "0s";
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes === 0 ? `${seconds}s` : `${minutes}m ${seconds}s`;
}

export default function MergeControls({
  adoptAll,
  overwriteAll,
  onAdoptAllChange,
  onOverwriteAllChange,
  adopting,
  adoptStatus,
  adoptMsg,
  isDisabled,
  onAdopt,
  elapsedMs,
  estimatedTotalMs,
  actualDurationMs,
  savedMs,
  locales,
  sourceLocale,
  targetLocale,
  adoptTargets,
  allowedBases,
  onAdoptTargetsChange,
}) {
  const remainingMs =
    estimatedTotalMs != null ? Math.max(0, estimatedTotalMs - elapsedMs) : null;

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
          : "Do you wish to merge these changes?";

  return (
    <div style={{ margin: 20 }}>
      <Note variant={noteVariant} title={noteTitle}>
        <div style={{ display: "grid", gap: 12 }}>
          <label style={{ display: "flex", gap: 8 }}>
            <input
              type="checkbox"
              checked={adoptAll}
              onChange={(e) => onAdoptAllChange(e.target.checked)}
            />
            Merge all fields
          </label>

          <label style={{ display: "flex", gap: 8, marginLeft: 20 }}>
            <input
              type="checkbox"
              checked={overwriteAll}
              disabled={!adoptAll}
              onChange={(e) => onOverwriteAllChange(e.target.checked)}
            />
            <span>
              Overwrite all fields
              <span style={{ color: "#c00", marginLeft: 6 }}>
                (replaces all target values)
              </span>
            </span>
          </label>

          <AdoptTargets
            locales={locales}
            sourceLocale={sourceLocale}
            adoptTargets={adoptTargets}
            allowedBases={allowedBases}
            onChange={onAdoptTargetsChange}
          />

          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <Button variant="positive" onClick={onAdopt} isDisabled={isDisabled}>
                {adopting ? (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                    <Spinner size="small" />
                    Adopting…
                  </span>
                ) : adoptStatus === "success" ? (
                  "Adopted ✓"
                ) : (
                  "Merge Source → Target"
                )}
              </Button>

              {adopting && (
                <div
                  style={{
                    display: "inline-block", width: 120, height: 6,
                    background: "#e0e0e0", borderRadius: 3, overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      width: "40%", height: "100%",
                      background: "#0059C8", borderRadius: 3,
                      animation: "adoptProgress 1.2s ease-in-out infinite",
                    }}
                  />
                </div>
              )}
            </div>

            {adopting && (
              <div style={{ fontSize: 12, color: "#666" }}>
                Estimated total time: {formatDuration(estimatedTotalMs)}<br />
                Elapsed: {formatDuration(elapsedMs)}<br />
                Remaining: {formatDuration(remainingMs)}
              </div>
            )}

            {adoptMsg && (
              <Note variant={noteVariant} title={noteTitle}>
                <pre style={{ whiteSpace: "pre-wrap", margin: 0 }}>{adoptMsg}</pre>
                {adoptStatus === "success" && actualDurationMs != null && (
                  <div style={{ fontSize: 12, color: "#666", marginTop: 8 }}>
                    Completed in {formatDuration(actualDurationMs)}.
                    {savedMs != null &&
                      ` Estimated time saved: ${formatDuration(savedMs)}.`}
                  </div>
                )}
              </Note>
            )}
          </div>
        </div>
      </Note>
    </div>
  );
}
