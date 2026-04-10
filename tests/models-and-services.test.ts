import { afterEach, describe, expect, it, vi } from "vitest";

import {
  isLospecPaletteApiItem,
  mapRowToResponse,
} from "../src/app/models/lospec-palette";
import { fetchLospecPalettePage } from "../src/app/services/lospec-api";
import {
  getExistingPaletteIds,
  insertPalettes,
} from "../src/app/services/lospec-palettes-repository";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("lospec palette models", () => {
  it("accepts API items with an id", () => {
    expect(isLospecPaletteApiItem({ _id: "palette-1" })).toBe(true);
    expect(isLospecPaletteApiItem({ title: "missing id" })).toBe(false);
  });

  it("maps rows back into API responses", () => {
    const response = mapRowToResponse({
      id: "palette-1",
      title: "Palette",
      slug: "palette",
      description: "Example",
      tags: "not-json",
      user: JSON.stringify({ name: "alice" }),
      colors: JSON.stringify(["#ffffff"]),
      examples: JSON.stringify([
        {
          image: "/sprites/example.png",
          description: "Preview",
        },
      ]),
      published_at: "2026-04-02T00:00:00.000Z",
    });

    expect(response).toEqual({
      id: "palette-1",
      title: "Palette",
      slug: "palette",
      description: "Example",
      tags: "not-json",
      user: "alice",
      colors: ["#ffffff"],
      examples: [
        {
          image: "https://cdn.lospec.com/sprites/example.png",
          description: "Preview",
        },
      ],
      published_at: "2026-04-02T00:00:00.000Z",
    });
  });
});

describe("lospec API service", () => {
  it("fetches and filters a page of Lospec palettes", async () => {
    const fetchMock = vi.fn(async (url: URL, init?: RequestInit) => {
      expect(url.searchParams.get("colorNumberFilterType")).toBe("any");
      expect(url.searchParams.get("page")).toBe("3");
      expect(url.searchParams.get("tag")).toBe("");
      expect(url.searchParams.get("sortingType")).toBe("newest");
      expect(init?.signal).toBeDefined();

      return new Response(
        JSON.stringify({
          palettes: [{ _id: "palette-1" }, { title: "missing id" }],
        }),
        { status: 200 },
      );
    });

    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchLospecPalettePage(
      3,
      new AbortController().signal,
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result).toEqual([{ _id: "palette-1" }]);
  });

  it("returns an empty array when the payload has no palettes list", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({}), { status: 200 })),
    );

    const result = await fetchLospecPalettePage(
      0,
      new AbortController().signal,
    );

    expect(result).toEqual([]);
  });

  it("throws when Lospec returns a non-success response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("upstream error", { status: 503 })),
    );

    await expect(
      fetchLospecPalettePage(4, new AbortController().signal),
    ).rejects.toThrow("Failed to fetch page 4: HTTP 503");
  });
});

describe("lospec palette repository", () => {
  it("skips querying when there are no ids", async () => {
    const prepare = vi.fn();
    const database = { prepare } as unknown as D1Database;

    const result = await getExistingPaletteIds(database, []);

    expect(prepare).not.toHaveBeenCalled();
    expect(result).toEqual(new Set());
  });

  it("loads existing palette ids from D1", async () => {
    const all = vi.fn(async () => ({
      results: [{ id: "palette-1" }, { id: "palette-2" }],
    }));
    const bind = vi.fn(() => ({ all }));
    const prepare = vi.fn(() => ({ bind }));
    const database = { prepare } as unknown as D1Database;

    const result = await getExistingPaletteIds(database, [
      "palette-1",
      "palette-2",
    ]);

    expect(prepare).toHaveBeenCalledWith(
      "SELECT id FROM lospec_palettes WHERE id IN (?, ?)",
    );
    expect(bind).toHaveBeenCalledWith("palette-1", "palette-2");
    expect(result).toEqual(new Set(["palette-1", "palette-2"]));
  });

  it("inserts normalized palette rows in a batch", async () => {
    const preparedStatements: Array<{ sql: string; bindings: unknown[] }> = [];
    const batch = vi.fn(async (statements: unknown[]) => statements);
    const database = {
      prepare(sql: string) {
        return {
          bind(...bindings: unknown[]) {
            const statement = { sql, bindings };
            preparedStatements.push(statement);
            return statement;
          },
        };
      },
      batch,
    } as unknown as D1Database;

    const inserted = await insertPalettes(database, [
      {
        _id: "palette-1",
        title: "Palette",
        slug: "palette",
        description: "Example",
        tags: ["warm"],
        user: { name: "alice" },
        colors: ["#ffffff"],
        examples: [
          { image: "/sprites/example.png", description: "Preview" },
          { description: "Ignored because it has no image" },
        ],
        publishedAt: "2026-04-02T00:00:00.000Z",
      },
    ]);

    expect(inserted).toBe(1);
    expect(batch).toHaveBeenCalledWith(preparedStatements);
    expect(preparedStatements).toHaveLength(1);
    expect(preparedStatements[0].sql).toContain(
      "INSERT OR IGNORE INTO lospec_palettes",
    );
    expect(preparedStatements[0].bindings).toEqual([
      "palette-1",
      "Palette",
      "palette",
      "Example",
      JSON.stringify(["warm"]),
      "alice",
      JSON.stringify(["#ffffff"]),
      JSON.stringify([
        {
          image: "https://cdn.lospec.com/sprites/example.png",
          description: "Preview",
        },
      ]),
      "2026-04-02T00:00:00.000Z",
    ]);
  });

  it("returns zero inserts without calling batch for an empty palette list", async () => {
    const batch = vi.fn();
    const database = { batch } as unknown as D1Database;

    const inserted = await insertPalettes(database, []);

    expect(inserted).toBe(0);
    expect(batch).not.toHaveBeenCalled();
  });
});
