import { createHash, timingSafeEqual } from "crypto";
import { Context } from "hono";
import { env } from "~/env";
import { UnsendApiError } from "./api-error";

export const PLATFORM_PATH_PREFIX = "/api/v1/platform";

function digest(value: string) {
  return createHash("sha256").update(value).digest();
}

/**
 * Checks the bearer token against PLATFORM_API_KEY.
 * Platform routes are disabled (404) when the env var is not set.
 */
export const verifyPlatformToken = (c: Context) => {
  const platformKey = env.PLATFORM_API_KEY;

  if (!platformKey) {
    throw new UnsendApiError({
      code: "NOT_FOUND",
      message: "Platform API is not enabled",
    });
  }

  const token = c.req.header("Authorization")?.split(" ")[1];

  if (!token) {
    throw new UnsendApiError({
      code: "UNAUTHORIZED",
      message: "No Authorization header provided",
    });
  }

  // Compare fixed-length digests so the check is constant time
  if (!timingSafeEqual(digest(token), digest(platformKey))) {
    throw new UnsendApiError({
      code: "FORBIDDEN",
      message: "Invalid platform API token",
    });
  }
};
