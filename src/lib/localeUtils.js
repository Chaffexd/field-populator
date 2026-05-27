export const PINNED_TARGET_LOCALES = new Set(["zu-ZA"]);

export const ALLOWED_BASES_DEFAULT = [
  "en","de","es","nl","it","ar","fr","zh","ja","ko","pl","pt","ru","uk",
];

export function isPairAllowed(
  sourceCode,
  targetCode,
  allowedBases = ALLOWED_BASES_DEFAULT,
  pinnedTargets = PINNED_TARGET_LOCALES,
) {
  if (!sourceCode || !targetCode) return false;
  if (pinnedTargets.has(targetCode)) return true;

  const srcBase = sourceCode.split("-")[0];
  const tgtBase = targetCode.split("-")[0];
  const basesSet = allowedBases instanceof Set ? allowedBases : new Set(allowedBases);

  if (!basesSet.has(srcBase)) return false;
  if (srcBase !== tgtBase) return false;

  return (
    targetCode === sourceCode ||
    targetCode === srcBase ||
    targetCode.startsWith(`${srcBase}-`)
  );
}
