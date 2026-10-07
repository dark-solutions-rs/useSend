import { z } from "@hono/zod-openapi";
import { ApiPermission } from "@prisma/client";

export const platformTeamSchema = z.object({
  id: z.number().int().openapi({ example: 12 }),
  name: z.string().openapi({ example: "Acme Store" }),
  isBlocked: z.boolean(),
  apiRateLimit: z.number().int(),
  dailyEmailLimit: z.number().int(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const platformApiKeySchema = z.object({
  id: z.number().int(),
  name: z.string(),
  permission: z.nativeEnum(ApiPermission),
  domainId: z.number().int().nullable(),
  partialToken: z.string().openapi({ example: "us_abc...f9e" }),
  createdAt: z.string().datetime(),
  lastUsed: z.string().datetime().nullable(),
});

export const platformTeamIdParamSchema = z.object({
  teamId: z.coerce
    .number()
    .int()
    .positive()
    .openapi({ param: { name: "teamId", in: "path" }, example: 12 }),
});

export const createdApiKeySchema = z.string().openapi({
  description: "Full API key. It is only returned once, store it securely.",
  example: "us_abc1234567_0123456789abcdef0123456789abcdef",
});

export const platformTeamLimitsSchema = {
  apiRateLimit: z.number().int().positive().optional().openapi({
    description: "Requests per second for this team's API keys",
  }),
  dailyEmailLimit: z.number().int().positive().optional(),
};
