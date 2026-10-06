import { createRoute, z } from "@hono/zod-openapi";
import { PublicAPIApp } from "~/server/public-api/hono";
import { platformTeamIdParamSchema } from "~/server/public-api/schemas/platform-schema";
import { deletePlatformTeamApiKey } from "~/server/service/platform-service";

const route = createRoute({
  method: "delete",
  path: "/v1/platform/teams/{teamId}/api-keys/{apiKeyId}",
  request: {
    params: platformTeamIdParamSchema.extend({
      apiKeyId: z.coerce
        .number()
        .int()
        .positive()
        .openapi({ param: { name: "apiKeyId", in: "path" }, example: 3 }),
    }),
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({
            id: z.number().int(),
            success: z.boolean(),
          }),
        },
      },
      description: "Revoke a team's API key",
    },
  },
});

function deleteTeamApiKey(app: PublicAPIApp) {
  app.openapi(route, async (c) => {
    const { teamId, apiKeyId } = c.req.valid("param");
    const apiKey = await deletePlatformTeamApiKey(teamId, apiKeyId);
    return c.json({ id: apiKey.id, success: true });
  });
}

export default deleteTeamApiKey;
