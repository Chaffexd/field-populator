import { createClient } from "contentful-management";

export const cmaSDK = (sdk) => createClient(
  { apiAdapter: sdk.cmaAdapter },
  {
    type: "plain",
    defaults: {
      environmentId: sdk.ids.environmentAlias ?? sdk.ids.environment,
      spaceId: sdk.ids.space,
    },
  }
);
