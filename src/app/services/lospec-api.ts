import { LOSPEC_PALETTE_LIST_URL } from "../../config/constants";
import {
  isLospecPaletteApiItem,
  type LospecPaletteApiItem,
} from "../models/lospec-palette";

export async function fetchLospecPalettePage(
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
