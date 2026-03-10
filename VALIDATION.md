# Validation

This document defines how to validate that locale adoption still works after code changes or deployment.

## Automated Validation

Run the full test suite:

```bash
npm run test:all
```

This covers:

- source locale remains unchanged during adoption
- target locale is populated from the source locale
- overwrite mode replaces different target content
- date fields are copied correctly
- rich text is merged correctly
- localized entry links are copied correctly
- localized arrays of entry links are copied correctly
- referenced child entries are traversed and updated
- dialog UI wiring calls adoption with the expected parameters
- sidebar UI wiring opens the dialog with the correct entry context

## Manual Validation

Use the demo Contentful space:

- Space ID: `vvbytozt5evi`

Use two locales in the same allowed language family, for example:

- Source locale: `en-US`
- Target locale: `en-GB`

Before each test:

- record the source locale field values
- record the target locale field values
- if possible, use the same stable fixture entries between deployments

## Manual Test 1: Populate Empty Target Locale

Goal:

- confirm source locale is untouched
- confirm empty target locale gets populated

Steps:

1. Choose an entry with content in the source locale.
2. Ensure the target locale is empty for one or more fields.
3. Open the app.
4. Select the source locale.
5. Select the target locale.
6. Run adoption without enabling overwrite.

Expected result:

- source locale content is exactly unchanged
- target locale is now populated
- only the target locale changed

## Manual Test 2: Overwrite Existing Target Content

Goal:

- confirm overwrite replaces different target content

Steps:

1. Choose an entry where the source and target locale values are different.
2. Open the app.
3. Select the source locale.
4. Select the target locale.
5. Enable `Overwrite all fields`.
6. Run adoption.

Expected result:

- source locale content is exactly unchanged
- target locale now matches source locale
- previous target content has been replaced

## Manual Test 3: Non-Overwrite Existing Target Content

Goal:

- confirm standard adoption does not blindly replace target content when overwrite is off

Steps:

1. Choose an entry where both source and target locales already have content.
2. Make the source and target values intentionally different.
3. Open the app.
4. Select the source locale.
5. Select the target locale.
6. Leave `Overwrite all fields` unchecked.
7. Run adoption.

Expected result:

- source locale content is exactly unchanged
- target locale changes only according to the app's normal merge/adoption behavior
- target is not blindly overwritten unless overwrite mode is enabled

## Manual Test 4: Referenced Entry Traversal

Goal:

- confirm adoption traverses referenced entries where expected

Steps:

1. Choose a parent entry that links to one or more child entries.
2. Put source-locale content on the child entry.
3. Leave the target locale empty or different on the child entry.
4. Open the app on the parent entry.
5. Select the source locale.
6. Select the target locale.
7. Run adoption.

Expected result:

- parent entry updates as expected
- referenced child entry also updates as expected
- source locale remains unchanged on both parent and child

## Manual Test 5: Rich Text

Goal:

- confirm rich text content is adopted correctly

Steps:

1. Choose an entry with a rich text field.
2. Put source content in the source locale.
3. Put different or partial rich text content in the target locale.
4. Run adoption with overwrite off.

Expected result:

- source locale rich text is unchanged
- target locale rich text is updated according to merge/adoption behavior

## Manual Test 6: Date Fields

Goal:

- confirm date values are copied correctly

Steps:

1. Choose an entry with a localized date field.
2. Set a valid source locale date value.
3. Leave the target locale empty or set a different value.
4. Run adoption.

Expected result:

- source locale date is unchanged
- target locale date is populated or updated correctly

## Manual Test 7: Linked Entry Fields

Goal:

- confirm localized entry-link fields are copied correctly

Steps:

1. Choose an entry with a localized single entry-link field.
2. Set the source locale link.
3. Leave the target locale link empty or different.
4. Run adoption.

Expected result:

- source locale link is unchanged
- target locale link matches the source locale link

## Manual Test 8: Linked Entry Arrays

Goal:

- confirm localized arrays of entry links are copied correctly

Steps:

1. Choose an entry with a localized array-of-entry-links field.
2. Set the source locale links.
3. Leave the target locale empty or set different links.
4. Run adoption.

Expected result:

- source locale links are unchanged
- target locale links match the source locale links when adopted

## Deployment Smoke Test

After every deployment:

1. Run `npm run test:all`.
2. In Contentful, run Manual Test 1 on a stable fixture entry.
3. In Contentful, run Manual Test 2 on a stable fixture entry.

Minimum release gate:

- automated test suite passes
- empty-target populate works
- overwrite works
- source locale remains unchanged in both checks

## Recommended Fixture Strategy

Maintain a small set of stable entries in the demo space:

- one entry for empty-target population
- one entry for overwrite validation
- one parent entry with referenced child entries
- one entry with rich text and date fields

This makes post-deployment validation faster and more consistent.
