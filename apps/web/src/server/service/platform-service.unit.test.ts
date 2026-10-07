import { beforeEach, describe, expect, it, vi } from "vitest";
import { UnsendApiError } from "~/server/public-api/api-error";

const {
  mockDb,
  mockAddApiKey,
  mockDeleteApiKey,
  mockDeleteDomain,
  mockTeamService,
} = vi.hoisted(() => ({
  mockDb: {
    team: {
      create: vi.fn(),
      delete: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
    },
    domain: {
      findMany: vi.fn(),
    },
    apiKey: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
  },
  mockAddApiKey: vi.fn(),
  mockDeleteApiKey: vi.fn(),
  mockDeleteDomain: vi.fn(),
  mockTeamService: {
    refreshTeamCache: vi.fn(),
    invalidateTeamCache: vi.fn(),
    updateTeam: vi.fn(),
  },
}));

vi.mock("~/server/db", () => ({ db: mockDb }));

vi.mock("~/server/service/api-service", () => ({
  addApiKey: mockAddApiKey,
  deleteApiKey: mockDeleteApiKey,
}));

vi.mock("~/server/service/domain-service", () => ({
  deleteDomain: mockDeleteDomain,
}));

vi.mock("~/server/service/team-service", () => ({
  TeamService: mockTeamService,
}));

import {
  createPlatformTeam,
  createPlatformTeamApiKey,
  deletePlatformTeam,
  deletePlatformTeamApiKey,
  listPlatformTeams,
} from "~/server/service/platform-service";

const team = { id: 12, name: "Acme Store" };

describe("platform-service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.team.delete.mockResolvedValue(team);
  });

  describe("createPlatformTeam", () => {
    it("creates a team without users and a FULL api key", async () => {
      mockDb.team.create.mockResolvedValue(team);
      mockAddApiKey.mockResolvedValue("us_abc_secret");

      const result = await createPlatformTeam({
        name: "Acme Store",
        dailyEmailLimit: 500,
      });

      expect(mockDb.team.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            name: "Acme Store",
            apiRateLimit: undefined,
            dailyEmailLimit: 500,
          },
        }),
      );
      expect(mockAddApiKey).toHaveBeenCalledWith({
        name: "Platform key",
        permission: "FULL",
        teamId: 12,
      });
      expect(mockTeamService.refreshTeamCache).toHaveBeenCalledWith(12);
      expect(result).toEqual({ team, apiKey: "us_abc_secret" });
    });

    it("rolls back the team when the api key cannot be created", async () => {
      mockDb.team.create.mockResolvedValue(team);
      mockAddApiKey.mockRejectedValue(new Error("boom"));

      await expect(createPlatformTeam({ name: "Acme Store" })).rejects.toThrow(
        "boom",
      );
      expect(mockDb.team.delete).toHaveBeenCalledWith({ where: { id: 12 } });
    });
  });

  it("paginates teams", async () => {
    mockDb.team.count.mockResolvedValue(120);
    mockDb.team.findMany.mockResolvedValue([team]);

    const result = await listPlatformTeams({ page: 2, search: "acme" });

    expect(mockDb.team.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { name: { contains: "acme", mode: "insensitive" } },
        skip: 50,
        take: 50,
      }),
    );
    expect(result.totalPage).toBe(3);
  });

  describe("deletePlatformTeam", () => {
    it("deletes domains through the domain service before the team", async () => {
      mockDb.team.findUnique.mockResolvedValue(team);
      mockDb.domain.findMany.mockResolvedValue([{ id: 1 }, { id: 2 }]);

      await deletePlatformTeam(12);

      expect(mockDb.domain.findMany).toHaveBeenCalledWith({
        where: { teamId: 12 },
        select: { id: true },
      });
      expect(mockDeleteDomain).toHaveBeenNthCalledWith(1, 1);
      expect(mockDeleteDomain).toHaveBeenNthCalledWith(2, 2);
      expect(mockDb.team.delete).toHaveBeenCalledWith({ where: { id: 12 } });
      expect(mockTeamService.invalidateTeamCache).toHaveBeenCalledWith(12);
    });

    it("keeps the team when a domain cannot be deleted from SES", async () => {
      mockDb.team.findUnique.mockResolvedValue(team);
      mockDb.domain.findMany.mockResolvedValue([{ id: 1 }]);
      mockDeleteDomain.mockRejectedValue(new Error("Error in deleting domain"));

      await expect(deletePlatformTeam(12)).rejects.toThrow();
      expect(mockDb.team.delete).not.toHaveBeenCalled();
    });

    it("throws NOT_FOUND for an unknown team", async () => {
      mockDb.team.findUnique.mockResolvedValue(null);

      await expect(deletePlatformTeam(999)).rejects.toBeInstanceOf(
        UnsendApiError,
      );
      expect(mockDeleteDomain).not.toHaveBeenCalled();
    });
  });

  describe("api keys", () => {
    it("maps an unknown domain to NOT_FOUND", async () => {
      mockDb.team.findUnique.mockResolvedValue(team);
      mockAddApiKey.mockRejectedValue(new Error("DOMAIN_NOT_FOUND"));

      await expect(
        createPlatformTeamApiKey(12, { name: "key", domainId: 99 }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });

    it("only deletes keys that belong to the team", async () => {
      mockDb.apiKey.findFirst.mockResolvedValue(null);

      await expect(deletePlatformTeamApiKey(12, 3)).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
      expect(mockDb.apiKey.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 3, teamId: 12 } }),
      );
      expect(mockDeleteApiKey).not.toHaveBeenCalled();
    });
  });
});
