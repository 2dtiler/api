export interface RateLimiter {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

export interface Env {
  DB: D1Database;
  RATE_LIMITER: RateLimiter;
  INTERNAL_API_KEY: string;
}

export type AppBindings = { Bindings: Env };
