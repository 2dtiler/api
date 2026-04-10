import type { Env } from "../config/types";
import { fetchLospecPalettePage } from "../app/services/lospec-api";
import {
  getExistingPaletteIds,
  insertPalettes,
} from "../app/services/lospec-palettes-repository";

export async function syncPalettes(
  env: Env,
  signal: AbortSignal,
): Promise<void> {
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
