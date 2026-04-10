import type { Env, RateLimiter } from "../../src/config/types";

function createDbStub(): D1Database {
  return {
    prepare() {
      throw new Error("DB stub should not be used in this test.");
    },
    batch() {
      throw new Error("DB stub should not be used in this test.");
    },
    dump() {
      throw new Error("DB stub should not be used in this test.");
    },
    exec() {
      throw new Error("DB stub should not be used in this test.");
    },
  } as unknown as D1Database;
}

export function createTestEnv(overrides: Partial<Env> = {}): Env {
  const rateLimiter: RateLimiter = {
    limit: async () => ({ success: true }),
  };

  return {
    DB: createDbStub(),
    RATE_LIMITER: rateLimiter,
    INTERNAL_API_KEY: "test-internal-api-key",
    ...overrides,
  };
}
