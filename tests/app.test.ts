import { describe, expect, it } from "vitest";

import app from "../src/app";
import type { LospecPaletteRow } from "../src/app/models/lospec-palette";
import { LOSPEC_PALETTES_PAGE_SIZE } from "../src/config/constants";
import { createTestEnv } from "./helpers/env";

function createListPalettesDb(rows: LospecPaletteRow[]) {
  let sql = "";
  let bindings: Array<number | string> = [];

  const db = {
    prepare(statement: string) {
      sql = statement;

      return {
        bind(...values: Array<number | string>) {
          bindings = values;

          return {
            all: async () => ({ results: rows }),
          };
        },
      };
    },
  } as unknown as D1Database;

  return {
    db,
    getSql: () => sql,
    getBindings: () => bindings,
  };
}

describe("app", () => {
  it("returns an empty JSON body for GET /", async () => {
    const response = await app.request("/", {}, createTestEnv());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({});
  });

  it("applies CORS headers for allowed origins", async () => {
    const response = await app.request(
      "/",
      {
        headers: new Headers({ Origin: "http://localhost:4321" }),
      },
      createTestEnv(),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
      "http://localhost:4321",
    );
    expect(response.headers.get("Access-Control-Allow-Methods")).toBe(
      "GET, OPTIONS",
    );
    expect(response.headers.get("Access-Control-Allow-Headers")).toBe(
      "Content-Type",
    );
    expect(response.headers.get("Vary")).toBe("Origin");
  });

  it("handles OPTIONS preflight requests for allowed origins", async () => {
    const response = await app.request(
      "/",
      {
        method: "OPTIONS",
        headers: new Headers({ Origin: "http://localhost:4321" }),
      },
      createTestEnv(),
    );

    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
      "http://localhost:4321",
    );
    expect(response.headers.get("Access-Control-Allow-Methods")).toBe(
      "GET, OPTIONS",
    );
    expect(response.headers.get("Access-Control-Allow-Headers")).toBe(
      "Content-Type",
    );
    expect(await response.text()).toBe("");
  });

  it("rejects disallowed origins", async () => {
    const response = await app.request(
      "/",
      {
        headers: new Headers({ Origin: "https://evil.example" }),
      },
      createTestEnv(),
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "Forbidden origin" });
  });

  it("allows internal requests to bypass origin checks", async () => {
    const response = await app.request(
      "/",
      {
        headers: new Headers({
          Origin: "https://evil.example",
          "X-Internal-Api-Key": "test-internal-api-key",
        }),
      },
      createTestEnv(),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });

  it("returns 400 for an invalid lospec page query", async () => {
    const response = await app.request(
      "/lospec_palettes?page=abc",
      {},
      createTestEnv(),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: `Invalid page parameter. Expected a non-negative integer with ${LOSPEC_PALETTES_PAGE_SIZE} results per page.`,
    });
  });

  it("returns 429 when the rate limiter rejects the request", async () => {
    const response = await app.request(
      "/lospec_palettes",
      {},
      createTestEnv({
        RATE_LIMITER: {
          limit: async () => ({ success: false }),
        },
      }),
    );

    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({
      error: "Rate limit exceeded. Try again in an hour.",
    });
  });

  it("lists palettes with normalized response data and query filters", async () => {
    const database = createListPalettesDb([
      {
        id: "sunset-1",
        title: "Sunset",
        slug: "sunset",
        description: "Warm palette",
        tags: JSON.stringify(["warm", "sky"]),
        user: JSON.stringify({ name: "alice" }),
        colors: JSON.stringify(["#ff6600", "#220044"]),
        examples: JSON.stringify([
          {
            image: "/pixel-art/sunset.png",
            description: "Preview",
          },
        ]),
        published_at: "2026-04-01T00:00:00.000Z",
      },
    ]);

    const response = await app.request(
      "/lospec_palettes?page=1&search=%20Sunset%20&tags=%20Warm%20",
      {},
      createTestEnv({ DB: database.db }),
    );

    expect(response.status).toBe(200);
    expect(database.getSql()).toContain("LOWER(COALESCE(title, '')) LIKE ?");
    expect(database.getSql()).toContain("FROM json_each(lospec_palettes.tags)");
    expect(database.getBindings()).toEqual(["%sunset%", "warm", 100, 100]);
    expect(await response.json()).toEqual([
      {
        id: "sunset-1",
        title: "Sunset",
        slug: "sunset",
        description: "Warm palette",
        tags: ["warm", "sky"],
        user: "alice",
        colors: ["#ff6600", "#220044"],
        examples: [
          {
            image: "https://cdn.lospec.com/pixel-art/sunset.png",
            description: "Preview",
          },
        ],
        published_at: "2026-04-01T00:00:00.000Z",
      },
    ]);
  });
});
