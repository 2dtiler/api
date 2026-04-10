import { afterEach, describe, expect, it, vi } from "vitest";

import type { Env } from "../src/config/types";
import { fetchLospecPalettePage } from "../src/app/services/lospec-api";
import {
  getExistingPaletteIds,
  insertPalettes,
} from "../src/app/services/lospec-palettes-repository";
import { syncPalettes } from "../src/jobs/sync-palettes";

vi.mock("../src/app/services/lospec-api", () => ({
  fetchLospecPalettePage: vi.fn(),
}));

vi.mock("../src/app/services/lospec-palettes-repository", () => ({
  getExistingPaletteIds: vi.fn(),
  insertPalettes: vi.fn(),
}));

function createEnv(): Env {
  return {
    DB: {} as D1Database,
    RATE_LIMITER: {
      limit: async () => ({ success: true }),
    },
    INTERNAL_API_KEY: "test-key",
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe("syncPalettes", () => {
  it("syncs pages until Lospec returns an empty page", async () => {
    const env = createEnv();
    const fetchMock = vi.mocked(fetchLospecPalettePage);
    const existingIdsMock = vi.mocked(getExistingPaletteIds);
    const insertMock = vi.mocked(insertPalettes);

    fetchMock
      .mockResolvedValueOnce([{ _id: "palette-1" }])
      .mockResolvedValueOnce([]);
    existingIdsMock.mockResolvedValue(new Set());
    insertMock.mockResolvedValue(1);
    vi.spyOn(console, "log").mockImplementation(() => {});

    await syncPalettes(env, new AbortController().signal);

    expect(fetchMock).toHaveBeenNthCalledWith(1, 0, expect.any(AbortSignal));
    expect(fetchMock).toHaveBeenNthCalledWith(2, 1, expect.any(AbortSignal));
    expect(existingIdsMock).toHaveBeenCalledWith(env.DB, ["palette-1"]);
    expect(insertMock).toHaveBeenCalledWith(env.DB, [{ _id: "palette-1" }]);
  });

  it("stops when it encounters existing palette ids", async () => {
    const env = createEnv();
    const fetchMock = vi.mocked(fetchLospecPalettePage);
    const existingIdsMock = vi.mocked(getExistingPaletteIds);
    const insertMock = vi.mocked(insertPalettes);

    fetchMock.mockResolvedValueOnce([{ _id: "palette-1" }]);
    existingIdsMock.mockResolvedValueOnce(new Set(["palette-1"]));
    insertMock.mockResolvedValue(0);
    vi.spyOn(console, "log").mockImplementation(() => {});

    await syncPalettes(env, new AbortController().signal);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(insertMock).toHaveBeenCalledWith(env.DB, []);
  });

  it("warns instead of erroring when the sync times out", async () => {
    const env = createEnv();
    const controller = new AbortController();
    const fetchMock = vi.mocked(fetchLospecPalettePage);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});

    fetchMock.mockImplementationOnce(async () => {
      controller.abort();
      throw new Error("timed out");
    });

    await syncPalettes(env, controller.signal);

    expect(warnSpy).toHaveBeenCalledWith(
      "Palette sync timed out; stopping early",
    );
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("logs and returns when a page fails to sync", async () => {
    const env = createEnv();
    const fetchMock = vi.mocked(fetchLospecPalettePage);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});

    fetchMock.mockRejectedValueOnce(new Error("boom"));

    await syncPalettes(env, new AbortController().signal);

    expect(errorSpy).toHaveBeenCalledWith(
      "Page 0: failed to sync palettes",
      expect.any(Error),
    );
  });
});
