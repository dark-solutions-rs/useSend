import { createRoute, z } from "@hono/zod-openapi";
import { ApiPermission } from "@prisma/client";
import { PublicAPIApp } from "~/server/public-api/hono";
import {
  createdApiKeySchema,
  platformTeamLimitsSchema,
  platformTeamSchema,
} from "~/server/public-api/schemas/platform-schema";
import { createPlatformTeam } from "~/server/service/platform-service";

const route = createRoute({
  method: "post",
  path: "/v1/platform/teams",
  request: {
    body: {
      required: true,
      content: {
        "application/json": {
          schema: z.object({
            name: z.string().trim().min(1).max(255),
            ...platformTeamLimitsSchema,
            apiKeyName: z.string().trim().min(1).max(255).optional(),
            apiKeyPermission: z.nativeEnum(ApiPermission).optional(),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({
            team: platformTeamSchema,
            apiKey: createdApiKeySchema,
          }),
        },
      },
      description: "Create a team and its first API key",
    },
  },
});

function createTeam(app: PublicAPIApp) {
  app.openapi(route, async (c) => {
    const body = c.req.valid("json");
    const result = await createPlatformTeam(body);
    return c.json(result);
  });
}

export default createTeam;
