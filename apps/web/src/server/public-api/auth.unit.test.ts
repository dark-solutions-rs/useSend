import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetTeamAndApiKey, mockDb } = vi.hoisted(() => ({
  mockGetTeamAndApiKey: vi.fn(),
  mockDb: {
    apiKey: {
      update: vi.fn(),
    },
  },
}));

vi.mock("~/server/service/api-service", () => ({
  getTeamAndApiKey: mockGetTeamAndApiKey,
}));

vi.mock("~/server/db", () => ({ db: mockDb }));

import { getTeamFromToken } from "~/server/public-api/auth";

function context(authorization = "Bearer us_abc_secret") {
  return { req: { header: () => authorization } } as any;
}

describe("getTeamFromToken", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.apiKey.update.mockResolvedValue({});
  });

  it("returns the team for a valid key", async () => {
    mockGetTeamAndApiKey.mockResolvedValue({
      team: { id: 1, isBlocked: false },
      apiKey: { id: 7, domainId: null },
    });

    const team = await getTeamFromToken(context());

    expect(team).toMatchObject({ id: 1, apiKeyId: 7 });
  });

  it("rejects keys of a blocked team", async () => {
    mockGetTeamAndApiKey.mockResolvedValue({
      team: { id: 1, isBlocked: true },
      apiKey: { id: 7, domainId: null },
    });

    await expect(getTeamFromToken(context())).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "Team is blocked",
    });
    expect(mockDb.apiKey.update).not.toHaveBeenCalled();
  });
});
