export const PINNED_TARGET_LOCALES = new Set(["zu-ZA"]);

// Empty by default = no restrictions. Add entries to restrict which source base
// languages are permitted (target must share the same base as source).
export const ALLOWED_BASES_DEFAULT = [];

export function isPairAllowed(
  sourceCode,
  targetCode,
  allowedBases = ALLOWED_BASES_DEFAULT,
  pinnedTargets = PINNED_TARGET_LOCALES,
) {
  if (!sourceCode || !targetCode) return false;
  if (pinnedTargets.has(targetCode)) return true;

  const basesSet = allowedBases instanceof Set ? allowedBases : new Set(allowedBases);

  // No restrictions configured — allow any pair
  if (basesSet.size === 0) return true;

  const srcBase = sourceCode.split("-")[0];
  const tgtBase = targetCode.split("-")[0];

  if (!basesSet.has(srcBase)) return false;
  if (srcBase !== tgtBase) return false;

  return (
    targetCode === sourceCode ||
    targetCode === srcBase ||
    targetCode.startsWith(`${srcBase}-`)
  );
}
