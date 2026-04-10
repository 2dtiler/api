import type { Context } from "hono";

import { LOSPEC_PALETTES_PAGE_SIZE } from "../../config/constants";
import type { AppBindings } from "../../config/types";
import {
  mapRowToResponse,
  type ListLospecPalettesOptions,
} from "../models/lospec-palette";
import { listPalettes } from "../services/lospec-palettes-repository";

function parsePage(value: string | undefined): number | null {
  if (value === undefined) {
    return 0;
  }

  if (!/^\d+$/.test(value)) {
    return null;
  }

  return Number.parseInt(value, 10);
}

function normalizeQueryValue(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function parseListLospecPalettesOptions(
  query: Record<string, string | undefined>,
): ListLospecPalettesOptions | null {
  const page = parsePage(query.page);
  if (page === null) {
    return null;
  }

  return {
    page,
    search: normalizeQueryValue(query.search),
    tag: normalizeQueryValue(query.tags),
  };
}

export async function getLospecPalettes(
  c: Context<AppBindings>,
): Promise<Response> {
  const options = parseListLospecPalettesOptions(c.req.query());
  if (!options) {
    return c.json(
      {
        error: `Invalid page parameter. Expected a non-negative integer with ${LOSPEC_PALETTES_PAGE_SIZE} results per page.`,
      },
      400,
    );
  }

  const ip = c.req.raw.headers.get("CF-Connecting-IP") ?? "unknown";
  const { success } = await c.env.RATE_LIMITER.limit({ key: ip });
  if (!success) {
    return c.json({ error: "Rate limit exceeded. Try again in an hour." }, 429);
  }

  const palettes = await listPalettes(c.env.DB, options);
  return c.json(palettes.map(mapRowToResponse));
}
