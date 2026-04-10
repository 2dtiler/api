# 2DTiler API

2DTiler API is a Cloudflare Workers service that syncs pixel art color palettes from Lospec into Cloudflare D1 and serves them through a small read-only HTTP API.

The current API is intentionally small: a health check plus a palette listing endpoint with pagination, search, and tag filtering.

## Features

- Daily Lospec palette sync via a scheduled Cloudflare Worker job
- Read-only palette API backed by Cloudflare D1
- Pagination, search, and tag filtering for palette queries
- CORS allowlist for trusted browser clients
- Per-IP rate limiting on the palette listing endpoint
- TypeScript, Hono, Wrangler, and Vitest-based development workflow

## Tech Stack

- TypeScript
- Hono
- Cloudflare Workers
- Cloudflare D1
- Wrangler
- Vitest

## Base URLs

- Production: `https://api.2dtiler.com`
- Local development: `http://127.0.0.1:8787` or `http://localhost:8787`

## API Overview

| Method | Path               | Description                         |
| ------ | ------------------ | ----------------------------------- |
| `GET`  | `/`                | Health check endpoint               |
| `GET`  | `/lospec_palettes` | List synced Lospec palettes from D1 |

## Endpoints

### `GET /`

Simple health check endpoint.

Example:

```bash
curl https://api.2dtiler.com/
```

Response:

```json
{}
```

### `GET /lospec_palettes`

Returns a paginated list of palettes stored in the local D1 cache.

#### Query Parameters

| Name     | Type    | Required | Description                                                                     |
| -------- | ------- | -------- | ------------------------------------------------------------------------------- |
| `page`   | integer | No       | Zero-based page index. Defaults to `0`. Each page returns up to `100` palettes. |
| `search` | string  | No       | Case-insensitive title search. Leading and trailing whitespace is ignored.      |
| `tags`   | string  | No       | Case-insensitive exact tag match. Leading and trailing whitespace is ignored.   |

#### Example Request

```bash
curl "https://api.2dtiler.com/lospec_palettes?page=0&search=sunset&tags=warm"
```

#### Example Response

```json
[
  {
    "id": "sunset-1",
    "title": "Sunset",
    "slug": "sunset",
    "description": "Warm palette",
    "tags": ["warm", "sky"],
    "user": "alice",
    "colors": ["#ff6600", "#220044"],
    "examples": [
      {
        "image": "https://cdn.lospec.com/pixel-art/sunset.png",
        "description": "Preview"
      }
    ],
    "published_at": "2026-04-01T00:00:00.000Z"
  }
]
```

#### Response Notes

- Results are ordered by `published_at` descending, then `id` descending.
- `tags` and `colors` are returned as parsed JSON arrays when present.
- `examples[].image` values are normalized to full Lospec CDN URLs.
- The endpoint is rate limited to `10` requests per minute per IP.

#### Error Responses

| Status | When it happens                                | Example body                                                                                        |
| ------ | ---------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `400`  | `page` is not a non-negative integer           | `{ "error": "Invalid page parameter. Expected a non-negative integer with 100 results per page." }` |
| `403`  | Browser request comes from a disallowed origin | `{ "error": "Forbidden origin" }`                                                                   |
| `429`  | Rate limit is exceeded                         | `{ "error": "Rate limit exceeded. Try again in a minute." }`                                        |

## Getting Started

### Prerequisites

- Node.js and npm
- A Cloudflare account if you want to run against configured resources or deploy changes
- Access to the Cloudflare resources referenced in `wrangler.toml`

This repository does not currently include D1 schema or migration files, so local and deployed environments are expected to have the required database objects and bindings available already.

### Installation

```bash
npm install
```

### Run Locally

```bash
npm run dev
```

Wrangler starts the Worker locally and serves the API on its default development port, usually `8787`.

### Checks and Tests

| Command             | Purpose                                |
| ------------------- | -------------------------------------- |
| `npm run dev`       | Start the local Worker with Wrangler   |
| `npm run test`      | Run the Vitest suite with coverage     |
| `npm run lint`      | Run ESLint on `src/`                   |
| `npm run typecheck` | Run TypeScript without emitting output |
| `npm run deploy`    | Deploy the Worker with Wrangler        |

The test configuration enforces coverage thresholds of `80.01%` for lines, functions, branches, and statements.

## Configuration

### Runtime Bindings

| Name               | Required    | Purpose                                                                                            |
| ------------------ | ----------- | -------------------------------------------------------------------------------------------------- |
| `DB`               | Yes         | Cloudflare D1 database used to store and query palettes                                            |
| `RATE_LIMITER`     | Yes         | Cloudflare rate-limiter binding used by `GET /lospec_palettes`                                     |
| `INTERNAL_API_KEY` | Situational | Trusted internal key used to bypass the browser-origin allowlist when sent as `X-Internal-Api-Key` |

### CORS

Allowed browser origins:

- `https://2dtiler.com`
- `https://app.2dtiler.com`
- `http://localhost:4321`
- `http://127.0.0.1:4321`
- `http://localhost:8787`
- `http://127.0.0.1:8787`

Requests without an `Origin` header are allowed. `OPTIONS` preflight requests are supported for allowed origins.

### Worker Routing

The Worker is configured to handle requests for `api.2dtiler.com/*`.

## Data Sync

Palette data is fetched from Lospec using `https://lospec.com/palette-list/load`.

The scheduled sync job:

- Runs daily at `14:00 UTC`
- Fetches Lospec pages in newest-first order
- Inserts unseen palettes into D1
- Stops when Lospec returns no more results or when a page includes already-known palette IDs
- Uses a `15` minute timeout for the scheduled run

## Repository Layout

```text
src/
	index.ts                  Cloudflare Worker entrypoint
	app.ts                    Hono app used for HTTP route composition
	app/
		controllers/            Request handlers
		middleware/             Cross-cutting HTTP behavior such as CORS
		models/                 Data normalization and response mapping
		routes/                 Route registration
		services/               Lospec and D1 data access
	jobs/
		sync-palettes.ts        Scheduled Lospec sync job
tests/
	*.test.ts                 App, service, sync, and worker tests
```

## Deployment

```bash
npm run deploy
```

Deployment assumes the Cloudflare zone, D1 database, rate-limiter binding, and any required secrets are already configured for this project.

## License

This project is licensed under the MIT License. See [LICENSE](./LICENSE) for details.
