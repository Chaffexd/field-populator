import React from "react";
import { Note, Spinner } from "@contentful/f36-components";
import DiffChecker from "./DiffChecker";

export default function DiffViewer({ loading, error, diffData, ...checkerProps }) {
  if (loading) {
    return (
      <div
        data-test-id="diff-loading"
        style={{
          height: 200,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "column",
          gap: 12,
        }}
      >
        <Spinner variant="primary" size="medium" />
        <span style={{ fontSize: 13, color: "#666" }}>Loading diff…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ margin: 20 }}>
        <Note
          variant="negative"
          title="Unable to compare — please ensure all references are accessible."
        >
          {error}
        </Note>
      </div>
    );
  }

  if (!diffData) return null;

  return <DiffChecker diffTree={diffData} {...checkerProps} />;
}
