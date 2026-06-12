import { createClient } from "contentful-management";

export const cmaSDK = (sdk) => createClient(
  { accessToken: import.meta.env.VITE_CMA_KEY },
  {
    type: "plain",
    defaults: {
      environmentId: sdk.ids.environmentAlias ?? sdk.ids.environment,
      spaceId: sdk.ids.space,
    },
  }
);
