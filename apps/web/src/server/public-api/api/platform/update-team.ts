import { createRoute, z } from "@hono/zod-openapi";
import { PublicAPIApp } from "~/server/public-api/hono";
import {
  platformTeamIdParamSchema,
  platformTeamLimitsSchema,
  platformTeamSchema,
} from "~/server/public-api/schemas/platform-schema";
import { updatePlatformTeam } from "~/server/service/platform-service";

const route = createRoute({
  method: "patch",
  path: "/v1/platform/teams/{teamId}",
  request: {
    params: platformTeamIdParamSchema,
    body: {
      required: true,
      content: {
        "application/json": {
          schema: z.object({
            name: z.string().trim().min(1).max(255).optional(),
            isBlocked: z.boolean().optional().openapi({
              description: "Blocked teams get 403 on every API call",
            }),
            ...platformTeamLimitsSchema,
          }),
        },
      },
    },
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: platformTeamSchema,
        },
      },
      description: "Update a team",
    },
  },
});

function updateTeam(app: PublicAPIApp) {
  app.openapi(route, async (c) => {
    const { teamId } = c.req.valid("param");
    const body = c.req.valid("json");
    const team = await updatePlatformTeam(teamId, body);
    return c.json(team);
  });
}

export default updateTeam;
