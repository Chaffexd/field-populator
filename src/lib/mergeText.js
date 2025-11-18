import { diff_match_patch } from "diff-match-patch";
const dmp = new diff_match_patch();

/**
 * OPTION B: Insert-only diff merge
 * -------------------------------------------
 * - Computes a diff from *target → source*
 * - This tells us: what exists in source that does NOT exist in target.
 *
 * Reconstruction rule:
 *  op === 0 (equal)        → keep target text
 *  op === 1 (insert)       → appears in source but missing in target → INSERT IT
 *  op === -1 (delete)      → appears in target but missing in source → KEEP TARGET VERSION (never delete)
 *
 * Result:
 * - Localised target text is fully preserved
 * - Only new content from source is inserted
 * - Insertions appear in the CORRECT position based on the source structure
 */
export function mergeSourceAdditionsIntoTarget(source = "", target = "") {
  const diffs = dmp.diff_main(target || "", source || "");
  dmp.diff_cleanupSemantic(diffs);

  let out = "";

  for (const [op, text] of diffs) {
    if (op === 0) {
      // equal → keep target text as-is
      out += text;
    } else if (op === 1) {
      // insertion → present in source but missing in target
      // INSERT AT THE CORRECT SOURCE LOCATION
      out += text;
    } else if (op === -1) {
      // deletion → text exists in target but removed from source
      // DO NOT DELETE — we preserve localisation
      out += text;
    }
  }

  return out;
}