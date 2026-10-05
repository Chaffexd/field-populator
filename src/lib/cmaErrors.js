/**
 * Pull a readable reason + requestId out of a CMA error. The SDK puts the
 * response body JSON in `message`, so parse that when it looks like JSON.
 */
export function describeCmaError(err) {
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
  const reason =
    errors.length > 0
      ? errors.join("; ")
      : parsed?.message || rawMsg || "Unknown error";
  return { reason, requestId: parsed?.requestId || err?.requestId || null };
}
