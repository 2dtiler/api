import { Hono } from "hono";

import { registerHealthRoutes } from "./app/routes/health";
import { registerLospecPaletteRoutes } from "./app/routes/lospec-palettes";
import { corsMiddleware } from "./app/middleware/cors";
import type { AppBindings } from "./config/types";

const app = new Hono<AppBindings>();

app.use("*", corsMiddleware);

registerHealthRoutes(app);
registerLospecPaletteRoutes(app);

export default app;
