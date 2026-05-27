# Diff-Adopter Rework Design

**Date:** 2026-05-27
**Status:** Approved

## Goal

Rework the app to be less janky and more maintainable by splitting two monolithic components into focused units, introducing a working config screen, and fixing the UX rough edges. All core logic (buildDiffTree, adoptTree, mergeText, mergeRichText, rateLimiter, helpers) is unchanged.

## Problem Summary

- `Dialog.jsx` (2096 lines) and `DiffChecker.jsx` (2448 lines) do too much — every state change re-renders the whole UI
- Diff can get stuck or feel slow because there is no clear loading/error boundary and no way to signal when a locale change should clear stale state
- Debug console spam left in production
- Adopt button stays disabled after a successful adoption until the page reloads
- Config screen is a placeholder — locale pairing rules, default locales, and hidden fields are all hardcoded

## What Does Not Change

- `src/lib/buildDiffTree.js`
- `src/lib/adoptTree.js`
- `src/lib/mergeText.js`
- `src/lib/mergeRichText.js`
- `src/lib/rateLimiter.js`
- `src/lib/helpers.js`
- `src/lib/contentful.js`
- CMA-only strategy for both reading (diff) and writing (adoption)
- Insert-only merge strategy
- Worker pool pattern (MAX_WORKERS = 50)
- All field type handling and diff output shape
- All existing packages

## Component Architecture

### New file layout

```
src/
  locations/
    Dialog.jsx          ← thin shell: top-level state + layout only
    ConfigScreen.jsx    ← full config UI (replaces placeholder)
    Sidebar.jsx         ← unchanged
    Home.jsx            ← unchanged
    Page.jsx            ← unchanged

  components/
    LocaleSelectors.jsx       ← source + target dropdowns, pairing validation
    AdoptTargets.jsx          ← multiselect for additional adoption locales
    MergeControls.jsx         ← merge/overwrite toggles + adopt button + progress
    DiffViewer.jsx            ← loading / error / empty shell around DiffChecker
    DiffChecker.jsx           ← thin orchestrator, renders the tree
    diff/
      NodeRenderer.jsx        ← recursive node renderer + CollapsibleReference
      FieldRenderers.jsx      ← all specialised renderers (tags, JSON arrays, rich text, assets, L-tags)
      diffUtils.js            ← pure helpers extracted from DiffChecker (richTextToStableDiffString, asString, parseJsonAssetField, extractFrontendTags, pillVariant)
```

### Responsibility boundaries

**Dialog.jsx** owns: `sourceLocale`, `targetLocale`, `locales`, `diffData`, `diffLoading`, `diffError`, `adoptAll`, `overwriteAll`, `selected`, `overwriteSelected`, `adoptTargets`, `adopting`, `adoptStatus`, performance metrics. It passes slices of this state as props to each child — no child manages state that belongs to Dialog.

**LocaleSelectors.jsx** receives: `locales`, `sourceLocale`, `targetLocale`, `allowedBases` (from config), `onSourceChange`, `onTargetChange`. Renders the two Select dropdowns and enforces pairing rules internally.

**AdoptTargets.jsx** receives: `locales`, `sourceLocale`, `adoptTargets`, `allowedBases`, `onChange`. The Global EN locale list remains hardcoded (not a config option). Renders the multiselect + "Select all Global EN" shortcut.

**MergeControls.jsx** receives: `adoptAll`, `overwriteAll`, `adopting`, `adoptStatus`, `isDisabled`, `onAdoptAll`, `onOverwriteAll`, `onAdopt`, `elapsedMs`, `estimatedTotalMs`, `actualDurationMs`, `savedMs`. Renders toggles, button, and metrics.

**DiffViewer.jsx** receives: `loading`, `error`, `diffData`. Renders a Forma 36 Spinner when loading, an inline error when failed, an empty state when no diff, otherwise renders DiffChecker.

**DiffChecker.jsx** receives: `diffData`, `hiddenFields`, `selected`, `overwriteSelected`, `adoptAll`, `overwriteAll`, `onToggleField`, `onToggleOverwrite`. Delegates rendering to NodeRenderer and FieldRenderers.

**diff/NodeRenderer.jsx** is the recursive renderer. It handles `field`, `reference`, `reference-list`, `template`, and `circular` node types. CollapsibleReference lives here.

**diff/FieldRenderers.jsx** exports one named component per specialised renderer. NodeRenderer imports from here.

**diff/diffUtils.js** exports pure functions with no React dependency.

## Config Screen

### Parameters schema

Stored as Contentful app installation parameters via `sdk.app.setParameters()` / `sdk.parameters.installation`:

```json
{
  "defaultSourceLocale": "en-US",
  "defaultTargetLocale": null,
  "allowedBases": ["en", "de", "es", "nl", "it", "ar", "fr", "zh", "ja", "ko", "pl", "pt", "ru", "uk"],
  "hiddenFields": ["poolpartyTagIDs", "LocaleValidation", "localeValidation", "globaltolocal"]
}
```

### Config screen sections

1. **Default Locales** — two Select dropdowns (source, target). Options populated from `sdk.space.getLocales()`. Saved into `defaultSourceLocale` / `defaultTargetLocale`.

2. **Locale Pairing Rules** — editable tag-pill list of allowed base language codes. Admins can add (text input + enter) or remove (✕) base codes. Saved into `allowedBases`.

3. **Hidden Fields** — editable tag-pill list of field IDs. Same add/remove interaction. Saved into `hiddenFields`.

4. **Save** button calls `sdk.app.setParameters(params)` then shows a success note.

### How Dialog reads config

On mount, Dialog reads `sdk.parameters.installation` and falls back to the hardcoded defaults if parameters are missing (for backwards compatibility with existing installations):

```js
const config = sdk.parameters.installation ?? {}
const allowedBases = config.allowedBases ?? ALLOWED_BASES_DEFAULT
const hiddenFields = config.hiddenFields ?? HIDDEN_FIELDS_DEFAULT
const defaultSourceLocale = config.defaultSourceLocale ?? undefined
const defaultTargetLocale = config.defaultTargetLocale ?? undefined
```

## UX Fixes

1. **Stuck adopt button** — reset `adoptStatus` to `null` whenever `diffData` is rebuilt or field selections change. The button is only disabled while `adopting === true` or there is nothing selected; `adoptStatus === "success"` no longer locks it.

2. **Stale diff on locale change** — set `diffData = null` and `diffLoading = true` immediately when either locale changes, before awaiting the new tree. This clears the old diff visually rather than showing it while the new one loads.

3. **Debug console spam** — remove all `console.log` blocks from Dialog.jsx (the `==== GLOBAL EN DEBUG ====` useEffect and any other debug logs).

4. **DiffViewer loading state** — show a centred Forma 36 Spinner with a "Loading diff…" label while `diffLoading` is true. Show an inline Note (type="negative") if `diffError` is set.

## Error Handling

No change to error handling in adoptTree (existing behaviour is acceptable). DiffViewer surfaces diff-build errors via the Note component instead of silently leaving the UI empty.

## Testing

Existing unit tests (`src/lib/*.spec.js`, `src/locations/*.spec.jsx`) are preserved and should continue to pass without modification since core logic files are not touched. New component tests are not required for this rework — the goal is structural improvement, not coverage expansion.

## Branch

All work on branch `rework/component-split`.
