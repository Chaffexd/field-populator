import contentful from "contentful-management";

const SPACE_ID = "y44f0yph0jif";
const ENVIRONMENT_ID = "master"; // change if needed

const client = contentful.createClient({
  accessToken: "",
});

async function countPublishedTemplates() {
  const space = await client.getSpace(SPACE_ID);
  const environment = await space.getEnvironment(ENVIRONMENT_ID);

  // 1. Get all content types
  const contentTypesResponse = await environment.getContentTypes({
    limit: 1000,
  });

  const templateContentTypes = contentTypesResponse.items.filter((ct) =>
    ct.name.startsWith("Template -")
  );

  if (templateContentTypes.length === 0) {
    console.log("No content types starting with 'Template -' found.");
    return;
  }

  let totalPublished = 0;

  // 2. Count published entries per content type (FAST + SAFE)
  for (const ct of templateContentTypes) {
    const res = await environment.getEntries({
      content_type: ct.sys.id,
      "sys.publishedAt[exists]": true, // only published
      limit: 0, // ✅ Do NOT return any items, just the count
    });

    const count = res.total;
    totalPublished += count;

    console.log(`${ct.name} (${ct.sys.id}): ${count}`);
  }

  console.log("—".repeat(40));
  console.log(`✅ TOTAL published Template entries: ${totalPublished}`);
}

countPublishedTemplates().catch(console.error);
