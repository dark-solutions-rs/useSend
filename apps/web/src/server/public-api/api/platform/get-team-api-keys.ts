import { createRoute, z } from "@hono/zod-openapi";
import { PublicAPIApp } from "~/server/public-api/hono";
import {
  platformApiKeySchema,
  platformTeamIdParamSchema,
} from "~/server/public-api/schemas/platform-schema";
import { listPlatformTeamApiKeys } from "~/server/service/platform-service";

const route = createRoute({
  method: "get",
  path: "/v1/platform/teams/{teamId}/api-keys",
  request: {
    params: platformTeamIdParamSchema,
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.array(platformApiKeySchema),
        },
      },
      description: "List a team's API keys (tokens are never returned)",
    },
  },
});

function getTeamApiKeys(app: PublicAPIApp) {
  app.openapi(route, async (c) => {
    const { teamId } = c.req.valid("param");
    const apiKeys = await listPlatformTeamApiKeys(teamId);
    return c.json(apiKeys);
  });
}

export default getTeamApiKeys;
