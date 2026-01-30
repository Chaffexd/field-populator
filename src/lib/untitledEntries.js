import contentful from "contentful-management";

const client = contentful.createClient({
  accessToken: "",
});

const SPACE_ID = "y44f0yph0jif";
const ENVIRONMENT_ID = "acc";
const BATCH_SIZE = 100;

function isUntitled(value) {
  if (!value) return true;
  if (typeof value !== "string") return false;
  return value.trim() === "" || value.trim().toLowerCase() === "untitled";
}

async function run() {
  const space = await client.getSpace(SPACE_ID);
  const env = await space.getEnvironment(ENVIRONMENT_ID);

  console.log("Fetching content types...");
  const contentTypesRes = await env.getContentTypes({ limit: 1000 });

  // contentTypeId -> displayField
  const displayFieldMap = {};
  for (const ct of contentTypesRes.items) {
    displayFieldMap[ct.sys.id] = ct.displayField;
  }

  let skip = 0;
  let untitledEntryIds = [];

  console.log("Scanning entries...");

  while (true) {
    const entriesRes = await env.getEntries({
      limit: BATCH_SIZE,
      skip,
      order: "sys.createdAt",
    });

    for (const entry of entriesRes.items) {
      const contentTypeId = entry.sys.contentType.sys.id;
      const displayField = displayFieldMap[contentTypeId];
      if (!displayField) continue;

      const fieldValueByLocale = entry.fields[displayField];
      if (!fieldValueByLocale) {
        untitledEntryIds.push(entry.sys.id);
        continue;
      }

      const locales = Object.keys(fieldValueByLocale);
      const value = fieldValueByLocale[locales[0]];

      if (isUntitled(value)) {
        untitledEntryIds.push(entry.sys.id);
      }
    }

    console.log(
      `Processed ${Math.min(skip + BATCH_SIZE, entriesRes.total)}/${
        entriesRes.total
      }`
    );

    if (skip + BATCH_SIZE >= entriesRes.total) break;
    skip += BATCH_SIZE;
  }

  console.log("\nUntitled entry IDs:");
  console.log(JSON.stringify(untitledEntryIds, null, 2));
  console.log(`Total: ${untitledEntryIds.length}`);

  // This is the logic to delete entries if they are untitled
  // Only uncomment this if you want to delete entries
  // The use case is to keep spaces clean

  //   for (const id of untitledEntryIds) {
  //     try {
  //       const entry = await env.getEntry(id);

  //       if (entry.isPublished()) {
  //         console.log(`Unpublishing ${id}`);
  //         await entry.unpublish();
  //       }

  //       console.log(`Deleting ${id}`);
  //       await entry.delete();
  //     } catch (err) {
  //       console.error(`Failed to delete ${id}:`, err.message);
  //     }
  //   }

  //  console.log("\nDeletion complete.");
}

run().catch(console.error);
