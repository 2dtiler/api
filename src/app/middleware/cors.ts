import type { MiddlewareHandler } from "hono";

import {
  ALLOWED_ORIGINS,
  INTERNAL_API_KEY_HEADER,
} from "../../config/constants";
import type { AppBindings } from "../../config/types";

function applyCorsHeaders(headers: Headers, origin: string): void {
  headers.set("Access-Control-Allow-Origin", origin);
  headers.set("Access-Control-Allow-Methods", "GET, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type");
  headers.set("Vary", "Origin");
}

export const corsMiddleware: MiddlewareHandler<AppBindings> = async (
  c,
  next,
) => {
  const origin = c.req.header("Origin");
  const internalApiKey = c.req.header(INTERNAL_API_KEY_HEADER);

  if (c.env.INTERNAL_API_KEY && internalApiKey === c.env.INTERNAL_API_KEY) {
    await next();
    return;
  }

  if (!origin) {
    await next();
    return;
  }

  if (!ALLOWED_ORIGINS.has(origin)) {
    return c.json({ error: "Forbidden origin" }, 403);
  }

  if (c.req.method === "OPTIONS") {
    const headers = new Headers();
    applyCorsHeaders(headers, origin);
    return new Response(null, { status: 204, headers });
  }

  await next();
  applyCorsHeaders(c.res.headers, origin);
};
