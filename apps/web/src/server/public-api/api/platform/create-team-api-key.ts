import { createRoute, z } from "@hono/zod-openapi";
import { ApiPermission } from "@prisma/client";
import { PublicAPIApp } from "~/server/public-api/hono";
import {
  createdApiKeySchema,
  platformTeamIdParamSchema,
} from "~/server/public-api/schemas/platform-schema";
import { createPlatformTeamApiKey } from "~/server/service/platform-service";

const route = createRoute({
  method: "post",
  path: "/v1/platform/teams/{teamId}/api-keys",
  request: {
    params: platformTeamIdParamSchema,
    body: {
      required: true,
      content: {
        "application/json": {
          schema: z.object({
            name: z.string().trim().min(1).max(255),
            permission: z.nativeEnum(ApiPermission).optional(),
            domainId: z.number().int().positive().optional().openapi({
              description: "Restrict the key to one of the team's domains",
            }),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({ apiKey: createdApiKeySchema }),
        },
      },
      description: "Create an API key for a team",
    },
  },
});

function createTeamApiKey(app: PublicAPIApp) {
  app.openapi(route, async (c) => {
    const { teamId } = c.req.valid("param");
    const body = c.req.valid("json");
    const result = await createPlatformTeamApiKey(teamId, body);
    return c.json(result);
  });
}

export default createTeamApiKey;
