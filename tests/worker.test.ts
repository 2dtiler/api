import { describe, expect, it, vi } from "vitest";

import type { Env } from "../src/config/types";
import worker from "../src/index";
import { syncPalettes } from "../src/jobs/sync-palettes";

vi.mock("../src/jobs/sync-palettes", () => ({
  syncPalettes: vi.fn(async () => {}),
}));

function createEnv(): Env {
  return {
    DB: {} as D1Database,
    RATE_LIMITER: {
      limit: async () => ({ success: true }),
    },
    INTERNAL_API_KEY: "test-key",
  };
}

describe("worker entrypoint", () => {
  it("schedules palette sync with a timeout signal", async () => {
    const env = createEnv();
    const waitUntil = vi.fn();

    await worker.scheduled({} as ScheduledEvent, env, {
      waitUntil,
    } as ExecutionContext);

    expect(vi.mocked(syncPalettes)).toHaveBeenCalledWith(
      env,
      expect.any(AbortSignal),
    );
    expect(waitUntil).toHaveBeenCalledTimes(1);
    await expect(waitUntil.mock.calls[0][0]).resolves.toBeUndefined();
  });
});
