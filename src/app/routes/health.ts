import type { Hono } from "hono";

import type { AppBindings } from "../../config/types";
import { getHealth } from "../controllers/health";

export function registerHealthRoutes(app: Hono<AppBindings>): void {
  app.get("/", getHealth);
}
