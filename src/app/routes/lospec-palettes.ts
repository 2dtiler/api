import type { Hono } from "hono";

import type { AppBindings } from "../../config/types";
import { getLospecPalettes } from "../controllers/lospec-palettes";

export function registerLospecPaletteRoutes(app: Hono<AppBindings>): void {
  app.get("/lospec_palettes", getLospecPalettes);
}
