import { createRoute, z } from "@hono/zod-openapi";
import { PublicAPIApp } from "~/server/public-api/hono";
import { platformTeamIdParamSchema } from "~/server/public-api/schemas/platform-schema";
import { deletePlatformTeam } from "~/server/service/platform-service";

const route = createRoute({
  method: "delete",
  path: "/v1/platform/teams/{teamId}",
  request: {
    params: platformTeamIdParamSchema,
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
      description:
        "Delete a team with all its domains, emails, contacts and campaigns",
    },
  },
});

function deleteTeam(app: PublicAPIApp) {
  app.openapi(route, async (c) => {
    const { teamId } = c.req.valid("param");
    const team = await deletePlatformTeam(teamId);
    return c.json({ id: team.id, success: true });
  });
}

export default deleteTeam;
