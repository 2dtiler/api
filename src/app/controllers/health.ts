import type { Context } from "hono";

import type { AppBindings } from "../../config/types";

export function getHealth(c: Context<AppBindings>): Response {
  return c.json({});
}
