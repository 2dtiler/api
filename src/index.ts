import app from "./app";
import { syncPalettes } from "./jobs/sync-palettes";
import type { Env } from "./config/types";

export default {
  fetch: app.fetch,

  async scheduled(
    _event: ScheduledEvent,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<void> {
    const signal = AbortSignal.timeout(15 * 60 * 1000);
    ctx.waitUntil(syncPalettes(env, signal));
  },
};
