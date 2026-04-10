import { Hono } from "hono";

interface RateLimiter {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

interface Env {
  DB: D1Database;
  RATE_LIMITER: RateLimiter;
  INTERNAL_API_KEY: string;
}

interface LospecPaletteApiItem {
  _id: string;
  title?: string;
  slug?: string;
  description?: string;
  tags?: unknown;
  user?: unknown;
  colors?: unknown;
  examples?: unknown;
  publishedAt?: string;
}

interface LospecPaletteRow {
  id: string;
  title: string | null;
  slug: string | null;
  description: string | null;
  tags: string | null;
  user: string | null;
  colors: string | null;
  examples: string | null;
  published_at: string | null;
}

interface LospecPaletteResponse {
  id: string;
  title: string | null;
  slug: string | null;
  description: string | null;
  tags: unknown | null;
  user: unknown | null;
  colors: unknown | null;
  examples: unknown | null;
  published_at: string | null;
}

const ALLOWED_ORIGINS = new Set([
  "https://2dtiler.com",
  "https://app.2dtiler.com",
  "http://localhost:4321",
  "http://127.0.0.1:4321",
]);
const INTERNAL_API_KEY_HEADER = "X-Internal-Api-Key";
const LOSPEC_PALETTE_LIST_URL = "https://lospec.com/palette-list/load";

const app = new Hono<{ Bindings: Env }>();

// ─── Helpers ────────────────────────────────────────────────────────────────

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isLospecPaletteApiItem(value: unknown): value is LospecPaletteApiItem {
  return isRecord(value) && typeof value._id === "string";
}

function asNullableString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function serializeJsonField(value: unknown): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  return JSON.stringify(value);
}

function deserializeJsonField(value: string | null): unknown | null {
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

function mapPaletteToRow(palette: LospecPaletteApiItem): LospecPaletteRow {
  return {
    id: palette._id,
    title: asNullableString(palette.title),
    slug: asNullableString(palette.slug),
    description: asNullableString(palette.description),
    tags: serializeJsonField(palette.tags),
    user: serializeJsonField(palette.user),
    colors: serializeJsonField(palette.colors),
    examples: serializeJsonField(palette.examples),
    published_at: asNullableString(palette.publishedAt),
  };
}

function mapRowToResponse(row: LospecPaletteRow): LospecPaletteResponse {
  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    description: row.description,
    tags: deserializeJsonField(row.tags),
    user: deserializeJsonField(row.user),
    colors: deserializeJsonField(row.colors),
    examples: deserializeJsonField(row.examples),
    published_at: row.published_at,
  };
}

async function fetchLospecPalettePage(
  page: number,
  signal: AbortSignal,
): Promise<LospecPaletteApiItem[]> {
  const url = new URL(LOSPEC_PALETTE_LIST_URL);
  url.searchParams.set("colorNumberFilterType", "any");
  url.searchParams.set("page", String(page));
  url.searchParams.set("tag", "");
  url.searchParams.set("sortingType", "newest");

  const response = await fetch(url, { signal });
  if (!response.ok) {
    throw new Error(`Failed to fetch page ${page}: HTTP ${response.status}`);
  }

  const payload = (await response.json()) as { palettes?: unknown };
  if (!Array.isArray(payload.palettes)) {
    return [];
  }

  return payload.palettes.filter(isLospecPaletteApiItem);
}

async function getExistingPaletteIds(
  db: D1Database,
  ids: string[],
): Promise<Set<string>> {
  if (ids.length === 0) {
    return new Set();
  }

  const placeholders = ids.map(() => "?").join(", ");
  const statement = db.prepare(
    `SELECT id FROM lospec_palettes WHERE id IN (${placeholders})`,
  );
  const result = await statement.bind(...ids).all<{ id: string }>();

  return new Set(result.results.map((row) => row.id));
}

async function insertPalettes(
  db: D1Database,
  palettes: LospecPaletteApiItem[],
): Promise<number> {
  if (palettes.length === 0) {
    return 0;
  }

  const statements = palettes.map((palette) => {
    const row = mapPaletteToRow(palette);

    return db
      .prepare(
        `INSERT OR IGNORE INTO lospec_palettes (
          id,
          title,
          slug,
          description,
          tags,
          user,
          colors,
          examples,
          published_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        row.id,
        row.title,
        row.slug,
        row.description,
        row.tags,
        row.user,
        row.colors,
        row.examples,
        row.published_at,
      );
  });

  await db.batch(statements);
  return palettes.length;
}

function applyCorsHeaders(headers: Headers, origin: string): void {
  headers.set("Access-Control-Allow-Origin", origin);
  headers.set("Access-Control-Allow-Methods", "GET, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type");
  headers.set("Vary", "Origin");
}

app.use("*", async (c, next) => {
  const origin = c.req.header("Origin");
  const internalApiKey = c.req.header(INTERNAL_API_KEY_HEADER);

  if (c.env.INTERNAL_API_KEY && internalApiKey === c.env.INTERNAL_API_KEY) {
    await next();
    return;
  }

  if (!origin || !ALLOWED_ORIGINS.has(origin)) {
    return c.json({ error: "Forbidden origin" }, 403);
  }

  if (c.req.method === "OPTIONS") {
    const headers = new Headers();
    applyCorsHeaders(headers, origin);
    return new Response(null, { status: 204, headers });
  }

  await next();
  applyCorsHeaders(c.res.headers, origin);
});

// ─── HTTP Routes ─────────────────────────────────────────────────────────────

/**
 * GET /
 * Returns a blank API route to verify the worker is running.
 */
app.get("/", async (c) => {
  return c.json({});
});

/**
 * GET /lospec_palettes
 * Returns all stored Lospec palette entries from D1.
 */
app.get("/lospec_palettes", async (c) => {
  const ip = c.req.raw.headers.get("CF-Connecting-IP") ?? "unknown";
  const { success } = await c.env.RATE_LIMITER.limit({ key: ip });
  if (!success) {
    return c.json({ error: "Rate limit exceeded. Try again in an hour." }, 429);
  }

  const result = await c.env.DB.prepare(
    `SELECT
      id,
      title,
      slug,
      description,
      tags,
      user,
      colors,
      examples,
      published_at
    FROM lospec_palettes
    ORDER BY published_at DESC, id DESC`,
  ).all<LospecPaletteRow>();

  return c.json(result.results.map(mapRowToResponse));
});

// ─── Scheduled Job ───────────────────────────────────────────────────────────

/**
 * Runs daily at 14:00 UTC (see wrangler.toml).
 *
 * Fetches Lospec palette pages from newest to oldest, inserts unseen rows into
 * D1, and stops once a page contains any IDs that are already present.
 */
async function syncPalettes(env: Env, signal: AbortSignal): Promise<void> {
  let page = 0;
  let pagesProcessed = 0;
  let totalInserted = 0;

  while (!signal.aborted) {
    try {
      const palettes = await fetchLospecPalettePage(page, signal);
      if (palettes.length === 0) {
        console.log(`Page ${page}: no palettes returned; stopping pagination`);
        break;
      }

      const existingIds = await getExistingPaletteIds(
        env.DB,
        palettes.map((palette) => palette._id),
      );
      const unseenPalettes = palettes.filter(
        (palette) => !existingIds.has(palette._id),
      );
      const inserted = await insertPalettes(env.DB, unseenPalettes);

      pagesProcessed++;
      totalInserted += inserted;

      console.log(
        `Page ${page}: fetched ${palettes.length}, inserted ${inserted}, existing ${existingIds.size}`,
      );

      if (existingIds.size > 0) {
        console.log(
          `Page ${page}: encountered existing palette IDs; stopping pagination`,
        );
        break;
      }

      page++;
    } catch (error) {
      if (signal.aborted) {
        console.warn("Palette sync timed out; stopping early");
        break;
      }

      console.error(`Page ${page}: failed to sync palettes`, error);
      return;
    }
  }

  console.log(
    `Palette sync complete: inserted ${totalInserted} palettes across ${pagesProcessed} page(s)`,
  );
}

// ─── Worker Export ───────────────────────────────────────────────────────────

export default {
  fetch: app.fetch,

  async scheduled(
    _event: ScheduledEvent,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<void> {
    const signal = AbortSignal.timeout(15 * 60 * 1000); // 15 minutes
    ctx.waitUntil(syncPalettes(env, signal));
  },
};
