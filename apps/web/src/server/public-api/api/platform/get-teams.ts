import { createRoute, z } from "@hono/zod-openapi";
import { PublicAPIApp } from "~/server/public-api/hono";
import { platformTeamSchema } from "~/server/public-api/schemas/platform-schema";
import { listPlatformTeams } from "~/server/service/platform-service";

const route = createRoute({
  method: "get",
  path: "/v1/platform/teams",
  request: {
    query: z.object({
      page: z.coerce.number().int().positive().optional().openapi({
        description: "Page number for pagination (default: 1)",
        example: 1,
      }),
      search: z.string().optional().openapi({
        description: "Search teams by name",
        example: "acme",
      }),
    }),
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({
            teams: z.array(platformTeamSchema),
            totalPage: z.number().int(),
          }),
        },
      },
      description: "List all teams",
    },
  },
});

function getTeams(app: PublicAPIApp) {
  app.openapi(route, async (c) => {
    const { page, search } = c.req.valid("query");
    const result = await listPlatformTeams({ page: page ?? 1, search });
    return c.json(result);
  });
}

export default getTeams;
