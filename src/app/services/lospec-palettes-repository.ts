import {
  mapPaletteToRow,
  type ListLospecPalettesOptions,
  type LospecPaletteApiItem,
  type LospecPaletteRow,
} from "../models/lospec-palette";
import { LOSPEC_PALETTES_PAGE_SIZE } from "../../config/constants";

interface ListPalettesQuery {
  whereSql: string;
  bindings: Array<number | string>;
}

export interface ListPalettesResult {
  count: number;
  items: LospecPaletteRow[];
}

function buildListPalettesQuery(
  options: ListLospecPalettesOptions,
): ListPalettesQuery {
  const whereClauses: string[] = [];
  const bindings: Array<number | string> = [];

  if (options.search) {
    whereClauses.push("LOWER(COALESCE(title, '')) LIKE ?");
    bindings.push(`%${options.search.toLowerCase()}%`);
  }

  if (options.tag) {
    whereClauses.push(`EXISTS (
      SELECT 1
      FROM json_each(lospec_palettes.tags)
      WHERE LOWER(CAST(json_each.value AS TEXT)) = ?
    )`);
    bindings.push(options.tag.toLowerCase());
  }

  return {
    whereSql:
      whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "",
    bindings,
  };
}

export async function getExistingPaletteIds(
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

export async function insertPalettes(
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

export async function listPalettes(
  db: D1Database,
  options: ListLospecPalettesOptions,
): Promise<ListPalettesResult> {
  const { whereSql, bindings } = buildListPalettesQuery(options);
  const offset = options.page * LOSPEC_PALETTES_PAGE_SIZE;

  const [countResult, itemsResult] = await Promise.all([
    db
      .prepare(
        `SELECT COUNT(*) AS count
        FROM lospec_palettes
        ${whereSql}`,
      )
      .bind(...bindings)
      .all<{ count: number | string }>(),
    db
      .prepare(
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
        ${whereSql}
        ORDER BY published_at DESC, id DESC
        LIMIT ? OFFSET ?`,
      )
      .bind(...bindings, LOSPEC_PALETTES_PAGE_SIZE, offset)
      .all<LospecPaletteRow>(),
  ]);

  return {
    count: Number(countResult.results[0]?.count ?? 0),
    items: itemsResult.results,
  };
}
