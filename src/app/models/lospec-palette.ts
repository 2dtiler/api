import { LOSPEC_CDN_BASE_URL } from "../../config/constants";

export interface LospecPaletteApiItem {
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

export interface LospecPaletteRow {
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

export interface LospecPaletteExample {
  image: string;
  description: string | null;
}

export interface LospecPaletteResponse {
  id: string;
  title: string | null;
  slug: string | null;
  description: string | null;
  tags: unknown | null;
  user: string | null;
  colors: unknown | null;
  examples: LospecPaletteExample[] | null;
  published_at: string | null;
}

export interface ListLospecPalettesOptions {
  page: number;
  search?: string;
  tag?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function isLospecPaletteApiItem(
  value: unknown,
): value is LospecPaletteApiItem {
  return isRecord(value) && typeof value._id === "string";
}

function asNullableString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function normalizePaletteUser(value: unknown): string | null {
  if (typeof value === "string") {
    return value;
  }

  if (!isRecord(value)) {
    return null;
  }

  return asNullableString(value.name);
}

function normalizePaletteExampleImage(value: string): string {
  return new URL(value, LOSPEC_CDN_BASE_URL).toString();
}

function normalizePaletteExamples(
  value: unknown,
): LospecPaletteExample[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  return value.flatMap((example) => {
    if (!isRecord(example)) {
      return [];
    }

    const image = asNullableString(example.image);
    if (!image) {
      return [];
    }

    return [
      {
        image: normalizePaletteExampleImage(image),
        description: asNullableString(example.description),
      },
    ];
  });
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

export function mapPaletteToRow(
  palette: LospecPaletteApiItem,
): LospecPaletteRow {
  return {
    id: palette._id,
    title: asNullableString(palette.title),
    slug: asNullableString(palette.slug),
    description: asNullableString(palette.description),
    tags: serializeJsonField(palette.tags),
    user: normalizePaletteUser(palette.user),
    colors: serializeJsonField(palette.colors),
    examples: serializeJsonField(normalizePaletteExamples(palette.examples)),
    published_at: asNullableString(palette.publishedAt),
  };
}

export function mapRowToResponse(row: LospecPaletteRow): LospecPaletteResponse {
  const user = normalizePaletteUser(deserializeJsonField(row.user));
  const examples = normalizePaletteExamples(deserializeJsonField(row.examples));

  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    description: row.description,
    tags: deserializeJsonField(row.tags),
    user,
    colors: deserializeJsonField(row.colors),
    examples,
    published_at: row.published_at,
  };
}
