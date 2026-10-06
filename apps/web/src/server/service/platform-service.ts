import { ApiPermission, Prisma } from "@prisma/client";
import { db } from "../db";
import { logger } from "../logger/log";
import { UnsendApiError } from "../public-api/api-error";
import { addApiKey, deleteApiKey } from "./api-service";
import { deleteDomain } from "./domain-service";
import { TeamService } from "./team-service";

export const platformTeamSelect = {
  id: true,
  name: true,
  isBlocked: true,
  apiRateLimit: true,
  dailyEmailLimit: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.TeamSelect;

export const platformApiKeySelect = {
  id: true,
  name: true,
  permission: true,
  domainId: true,
  partialToken: true,
  createdAt: true,
  lastUsed: true,
} satisfies Prisma.ApiKeySelect;

const TEAMS_PAGE_SIZE = 50;

async function getTeamOrThrow(teamId: number) {
  const team = await db.team.findUnique({
    where: { id: teamId },
    select: platformTeamSelect,
  });

  if (!team) {
    throw new UnsendApiError({ code: "NOT_FOUND", message: "Team not found" });
  }

  return team;
}

/**
 * Creates a team without any users, plus its first API key.
 * Unlike TeamService.createTeam this skips the self-hosted single-team guard.
 */
export async function createPlatformTeam({
  name,
  apiRateLimit,
  dailyEmailLimit,
  apiKeyName,
  apiKeyPermission,
}: {
  name: string;
  apiRateLimit?: number;
  dailyEmailLimit?: number;
  apiKeyName?: string;
  apiKeyPermission?: ApiPermission;
}) {
  const team = await db.team.create({
    data: { name, apiRateLimit, dailyEmailLimit },
    select: platformTeamSelect,
  });

  try {
    const apiKey = await addApiKey({
      name: apiKeyName ?? "Platform key",
      permission: apiKeyPermission ?? "FULL",
      teamId: team.id,
    });

    await TeamService.refreshTeamCache(team.id);

    return { team, apiKey };
  } catch (error) {
    // Don't leave a team behind that nobody has a key for
    await db.team.delete({ where: { id: team.id } }).catch((err) =>
      logger.error({ err, teamId: team.id }, "Failed to roll back team"),
    );
    throw error;
  }
}

export async function listPlatformTeams({
  page,
  search,
}: {
  page: number;
  search?: string;
}) {
  const where: Prisma.TeamWhereInput = search
    ? { name: { contains: search, mode: "insensitive" } }
    : {};

  const [count, teams] = await Promise.all([
    db.team.count({ where }),
    db.team.findMany({
      where,
      select: platformTeamSelect,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * TEAMS_PAGE_SIZE,
      take: TEAMS_PAGE_SIZE,
    }),
  ]);

  return { teams, totalPage: Math.ceil(count / TEAMS_PAGE_SIZE) };
}

export async function getPlatformTeam(teamId: number) {
  return getTeamOrThrow(teamId);
}

export async function updatePlatformTeam(
  teamId: number,
  data: {
    name?: string;
    isBlocked?: boolean;
    apiRateLimit?: number;
    dailyEmailLimit?: number;
  },
) {
  await getTeamOrThrow(teamId);
  await TeamService.updateTeam(teamId, data);
  return getTeamOrThrow(teamId);
}

/**
 * Deletes the team and everything it owns. Domains are removed one by one
 * first so their SES identities are cleaned up; the rest cascades in the DB.
 */
export async function deletePlatformTeam(teamId: number) {
  const team = await getTeamOrThrow(teamId);

  const domains = await db.domain.findMany({
    where: { teamId },
    select: { id: true },
  });

  for (const domain of domains) {
    await deleteDomain(domain.id);
  }

  await db.team.delete({ where: { id: teamId } });
  await TeamService.invalidateTeamCache(teamId);

  return team;
}

export async function createPlatformTeamApiKey(
  teamId: number,
  {
    name,
    permission,
    domainId,
  }: { name: string; permission?: ApiPermission; domainId?: number },
) {
  await getTeamOrThrow(teamId);

  try {
    const apiKey = await addApiKey({
      name,
      permission: permission ?? "FULL",
      teamId,
      domainId,
    });
    return { apiKey };
  } catch (error) {
    if (error instanceof Error && error.message === "DOMAIN_NOT_FOUND") {
      throw new UnsendApiError({
        code: "NOT_FOUND",
        message: "Domain not found for this team",
      });
    }
    throw error;
  }
}

export async function listPlatformTeamApiKeys(teamId: number) {
  await getTeamOrThrow(teamId);

  return db.apiKey.findMany({
    where: { teamId },
    select: platformApiKeySelect,
    orderBy: { createdAt: "desc" },
  });
}

export async function deletePlatformTeamApiKey(
  teamId: number,
  apiKeyId: number,
) {
  const apiKey = await db.apiKey.findFirst({
    where: { id: apiKeyId, teamId },
    select: platformApiKeySelect,
  });

  if (!apiKey) {
    throw new UnsendApiError({
      code: "NOT_FOUND",
      message: "API key not found for this team",
    });
  }

  await deleteApiKey(apiKey.id);
  return apiKey;
}
