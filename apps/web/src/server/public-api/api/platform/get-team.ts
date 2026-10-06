import { createRoute } from "@hono/zod-openapi";
import { PublicAPIApp } from "~/server/public-api/hono";
import {
  platformTeamIdParamSchema,
  platformTeamSchema,
} from "~/server/public-api/schemas/platform-schema";
import { getPlatformTeam } from "~/server/service/platform-service";

const route = createRoute({
  method: "get",
  path: "/v1/platform/teams/{teamId}",
  request: {
    params: platformTeamIdParamSchema,
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: platformTeamSchema,
        },
      },
      description: "Retrieve a team",
    },
  },
});

function getTeam(app: PublicAPIApp) {
  app.openapi(route, async (c) => {
    const { teamId } = c.req.valid("param");
    const team = await getPlatformTeam(teamId);
    return c.json(team);
  });
}

export default getTeam;
