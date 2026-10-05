import { createClient } from "contentful-management";

/**
 * Builds a plain CMA client from the token stored in the app's installation
 * parameters (Configuration screen → "Contentful Management token").
 *
 * The token is the only source of CMA credentials — there is no build-time
 * env var fallback, so an installation without a token is a hard error.
 */
export const cmaSDK = (sdk, accessToken) => {
  if (typeof accessToken !== "string" || accessToken.trim() === "") {
    throw new Error(
      "No Contentful Management token configured — add one in the app's configuration screen.",
    );
  }

  return createClient(
    { accessToken: accessToken.trim() },
    {
      type: "plain",
      defaults: {
        environmentId: sdk.ids.environmentAlias ?? sdk.ids.environment,
        spaceId: sdk.ids.space,
      },
    },
  );
};
