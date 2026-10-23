# Backend

One Rust server for Lithium. Everything the frontend asks a machine for — the AI
proxy, the model registry, shared memory, web search, MCP, and the app/game
downloads — is served by the `li-server` binary in `server/`. Nothing here ships
inside the web app's JS bundle, and the desktop stays fully usable when this is
not running.

## Layout

| Path | What it is |
| ---- | ---------- |
| `server/` | The Axum + Tokio server: Supabase JWT auth, Guest/Full tiers, SQLite persistence, rate/credit limits, local GGUF store, OpenAI-compatible `/v1`, and the package store. |
| `server/store/` | Its own shelf of `.tar.gz` packages — `sources/` (folders you drop in), `packages/` (built archives), `index.json` (the catalog memo). |
| `server/config.toml` | Port, tiers, guest policy, store dir, credit budgets. Read at boot; the path it resolved is printed on stderr. |

## Run it

```
cd server
cargo run                  # or: lithium.bat (Windows) / ./start.sh (Unix)
li-server pack             # rebuild the shelf from store/sources, then exit
```

It listens on `127.0.0.1:8734` by default and the frontend probes that plus LAN
candidates (`app/src/lib/backendApi.js`), caching whichever answers as
`active-server-url`.

## What the server hands out

- `GET /api/apps`, `GET /api/games`, `GET /api/store/catalog` — the shelf,
  filtered by the caller's tier (guests see only `[features]` freebies).
- `GET /api/apps/:id/download`, `GET /api/games/:slug/download` — the packed
  `.tar.gz`, ranged and `Content-Disposition`'d so the browser saves it.
- `GET /play/games/:slug[/…]` — a game's loose entry file and assets, so an
  iframe can run it without unpacking anything.
- `POST /api/store/repack` — re-scan and rebuild, gated on `[store] pack_key`.
- `POST /api/apikeys/me` (sign-in required) — the caller's silent, personal API
  key. The server mints a random secret, stores only its SHA-256, and returns the
  plaintext once; it auto-rotates about weekly (the retired key stays valid for a
  short grace so in-flight calls survive). The user never sees this key — the
  website holds it. `POST /api/apikeys/verify` validates a presented key by hash
  lookup.

The client side of that is `app/src/lib/storeApi.js`: *Save* writes the archive
to the user's computer, *Install* unpacks the same bytes into
`Documents/Store/{Apps,Games}` in the virtual filesystem.

## Notes

- `server/` is gitignored by the root `.gitignore` (`server/` matches at any
  depth) — it is deliberately kept out of the public repo, along with its
  SQLite file and `target/`.
- `store/packages/` and `store/index.json` are derived from `store/sources/`;
  delete them and the next boot rebuilds the shelf.
- Retired here: the Python FastAPI dev backend, the `lithium-server` crate that
  lived in the WASM workspace, and the four Cloudflare Workers (`proxy`,
  `docs-search`, `appstore`, `games`). Their routes are all in `li-server` now,
  and the 767-game corpus lives in `store/sources/games/`.
