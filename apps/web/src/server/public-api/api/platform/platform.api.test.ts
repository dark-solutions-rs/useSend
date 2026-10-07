import { beforeEach, describe, expect, it, vi } from "vitest";
import { UnsendApiError } from "~/server/public-api/api-error";

const PLATFORM_KEY = "platform-key-0123456789abcdef0123456789abcdef";

const { mockEnv, mockGetTeamFromToken, mockRedis, mockPlatformService } =
  vi.hoisted(() => ({
    mockEnv: {
      NEXTAUTH_URL: "http://localhost:3000",
      PLATFORM_API_KEY: undefined as string | undefined,
    },
    mockGetTeamFromToken: vi.fn(),
    mockRedis: {
      incr: vi.fn(),
      expire: vi.fn(),
      ttl: vi.fn(),
    },
    mockPlatformService: {
      createPlatformTeam: vi.fn(),
      listPlatformTeams: vi.fn(),
      getPlatformTeam: vi.fn(),
      updatePlatformTeam: vi.fn(),
      deletePlatformTeam: vi.fn(),
      createPlatformTeamApiKey: vi.fn(),
      listPlatformTeamApiKeys: vi.fn(),
      deletePlatformTeamApiKey: vi.fn(),
    },
  }));

vi.mock("~/env", () => ({ env: mockEnv }));

vi.mock("~/server/public-api/auth", () => ({
  getTeamFromToken: mockGetTeamFromToken,
}));

vi.mock("~/server/redis", () => ({
  getRedis: () => mockRedis,
  redisKey: (key: string) => key,
}));

vi.mock("~/utils/common", () => ({
  isSelfHosted: () => false,
}));

vi.mock("~/server/service/platform-service", () => mockPlatformService);

import { getApp } from "~/server/public-api/hono";
import createTeamRoute from "~/server/public-api/api/platform/create-team";
import getTeamsRoute from "~/server/public-api/api/platform/get-teams";
import updateTeamRoute from "~/server/public-api/api/platform/update-team";
import deleteTeamRoute from "~/server/public-api/api/platform/delete-team";
import createTeamApiKeyRoute from "~/server/public-api/api/platform/create-team-api-key";
import deleteTeamApiKeyRoute from "~/server/public-api/api/platform/delete-team-api-key";

const team = {
  id: 12,
  name: "Acme Store",
  isBlocked: false,
  apiRateLimit: 2,
  dailyEmailLimit: 10000,
  createdAt: new Date("2026-10-01T00:00:00.000Z"),
  updatedAt: new Date("2026-10-01T00:00:00.000Z"),
};

function buildApp() {
  const app = getApp();
  createTeamRoute(app);
  getTeamsRoute(app);
  updateTeamRoute(app);
  deleteTeamRoute(app);
  createTeamApiKeyRoute(app);
  deleteTeamApiKeyRoute(app);
  return app;
}

function request(
  path: string,
  init?: { method?: string; token?: string | null; body?: unknown },
) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  const token = init?.token === undefined ? PLATFORM_KEY : init.token;
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  return buildApp().request(`http://localhost/api${path}`, {
    method: init?.method ?? "GET",
    headers,
    body: init?.body === undefined ? undefined : JSON.stringify(init.body),
  });
}

describe("platform API", () => {
  beforeEach(() => {
    mockEnv.PLATFORM_API_KEY = PLATFORM_KEY;
    mockGetTeamFromToken.mockReset();
    Object.values(mockRedis).forEach((fn) => fn.mockReset());
    Object.values(mockPlatformService).forEach((fn) => fn.mockReset());
  });

  describe("auth", () => {
    it("returns 404 when PLATFORM_API_KEY is not configured", async () => {
      mockEnv.PLATFORM_API_KEY = undefined;

      const response = await request("/v1/platform/teams");

      expect(response.status).toBe(404);
      expect(mockPlatformService.listPlatformTeams).not.toHaveBeenCalled();
    });

    it("returns 401 without an Authorization header", async () => {
      const response = await request("/v1/platform/teams", { token: null });

      expect(response.status).toBe(401);
    });

    it("rejects a team API key with 403", async () => {
      const response = await request("/v1/platform/teams", {
        token: "us_abc1234567_0123456789abcdef0123456789abcdef",
      });

      expect(response.status).toBe(403);
      expect(mockPlatformService.listPlatformTeams).not.toHaveBeenCalled();
    });

    it("does not resolve a team or apply team rate limits", async () => {
      mockPlatformService.listPlatformTeams.mockResolvedValue({
        teams: [team],
        totalPage: 1,
      });

      const response = await request("/v1/platform/teams");

      expect(response.status).toBe(200);
      expect(mockGetTeamFromToken).not.toHaveBeenCalled();
      expect(mockRedis.incr).not.toHaveBeenCalled();
    });

    it("does not accept the platform key on team endpoints", async () => {
      mockGetTeamFromToken.mockRejectedValue(
        new UnsendApiError({ code: "FORBIDDEN", message: "Invalid API token" }),
      );

      const app = getApp();
      app.get("/v1/domains", (c) => c.json([]));
      const response = await app.request("http://localhost/api/v1/domains", {
        headers: { Authorization: `Bearer ${PLATFORM_KEY}` },
      });

      expect(response.status).toBe(403);
    });
  });

  it("creates a team and returns its API key", async () => {
    mockPlatformService.createPlatformTeam.mockResolvedValue({
      team,
      apiKey: "us_abc1234567_secret",
    });

    const response = await request("/v1/platform/teams", {
      method: "POST",
      body: { name: "Acme Store", dailyEmailLimit: 500 },
    });

    expect(response.status).toBe(200);
    expect(mockPlatformService.createPlatformTeam).toHaveBeenCalledWith({
      name: "Acme Store",
      dailyEmailLimit: 500,
    });
    expect(await response.json()).toMatchObject({
      team: { id: 12, name: "Acme Store" },
      apiKey: "us_abc1234567_secret",
    });
  });

  it("validates the team name", async () => {
    const response = await request("/v1/platform/teams", {
      method: "POST",
      body: { name: "  " },
    });

    expect(response.status).toBe(400);
    expect(mockPlatformService.createPlatformTeam).not.toHaveBeenCalled();
  });

  it("lists teams with page and search", async () => {
    mockPlatformService.listPlatformTeams.mockResolvedValue({
      teams: [team],
      totalPage: 1,
    });

    const response = await request("/v1/platform/teams?page=2&search=acme");

    expect(response.status).toBe(200);
    expect(mockPlatformService.listPlatformTeams).toHaveBeenCalledWith({
      page: 2,
      search: "acme",
    });
  });

  it("blocks a team", async () => {
    mockPlatformService.updatePlatformTeam.mockResolvedValue({
      ...team,
      isBlocked: true,
    });

    const response = await request("/v1/platform/teams/12", {
      method: "PATCH",
      body: { isBlocked: true },
    });

    expect(response.status).toBe(200);
    expect(mockPlatformService.updatePlatformTeam).toHaveBeenCalledWith(12, {
      isBlocked: true,
    });
  });

  it("deletes a team", async () => {
    mockPlatformService.deletePlatformTeam.mockResolvedValue(team);

    const response = await request("/v1/platform/teams/12", {
      method: "DELETE",
    });

    expect(response.status).toBe(200);
    expect(mockPlatformService.deletePlatformTeam).toHaveBeenCalledWith(12);
    expect(await response.json()).toEqual({ id: 12, success: true });
  });

  it("returns 404 for an unknown team", async () => {
    mockPlatformService.deletePlatformTeam.mockRejectedValue(
      new UnsendApiError({ code: "NOT_FOUND", message: "Team not found" }),
    );

    const response = await request("/v1/platform/teams/999", {
      method: "DELETE",
    });

    expect(response.status).toBe(404);
  });

  it("creates an API key for a team", async () => {
    mockPlatformService.createPlatformTeamApiKey.mockResolvedValue({
      apiKey: "us_def1234567_secret",
    });

    const response = await request("/v1/platform/teams/12/api-keys", {
      method: "POST",
      body: { name: "Sending only", permission: "SENDING", domainId: 4 },
    });

    expect(response.status).toBe(200);
    expect(mockPlatformService.createPlatformTeamApiKey).toHaveBeenCalledWith(
      12,
      { name: "Sending only", permission: "SENDING", domainId: 4 },
    );
  });

  it("revokes an API key of a team", async () => {
    mockPlatformService.deletePlatformTeamApiKey.mockResolvedValue({ id: 3 });

    const response = await request("/v1/platform/teams/12/api-keys/3", {
      method: "DELETE",
    });

    expect(response.status).toBe(200);
    expect(mockPlatformService.deletePlatformTeamApiKey).toHaveBeenCalledWith(
      12,
      3,
    );
  });
});
