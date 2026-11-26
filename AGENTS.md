# Mitdo — agent guide

React 18 + Vite learning app. Auth is `mdg-auth-svc`; garden data is `mdg-tempo-svc` (`GET /map`, review, tempo — no collections). The reducer in `store.jsx` is the client contract; only `user`/`settings` stay in localStorage (`recall-react-v3`).

```bash
# terminal 1 — auth service (Viper: APP_ENV=dev|test|prd)
cd ../mdg-auth-svc && make run-dev

# terminal 2 — tempo / garden API
cd ../mdg-tempo-svc && make migrate && make run-dev   # :8081

# terminal 3 — UI (Vite modes: development|test|production)
npm install
npm run dev           # --mode development
npm run build         # --mode production
npm run build:test    # --mode test
```

UI config: `src/config.js` + `.env.development` / `.env.test` / `.env.production`.  
`VITE_API_BASE_URL` → **mdg-auth-svc** (`:8080`). `VITE_TEMPO_API_BASE_URL` → **mdg-tempo-svc** (`:8081`). Auth secrets stay in **mdg-auth-svc**, never in the UI.

Garden data loads from tempo-svc (`GET /map`) after sign-in via `src/tempoApi.js`. There is no frontend seed garden. The list is a client view; create and delete hit the API.

Verify UI changes in the browser: click, type, and submit. A screenshot of a static screen is not enough. Do not commit unless the user asks.

## Words

A **tempo** is the reviewed unit (`type: "tempo"`). The UI is **tempos only** — no collection or link concept in the client. Organize with **tags**. Do not reintroduce collections or tempo↔tempo links, and do not add a translator that maps old names (`topic`, `category`, `collection`) onto tempos.

## Rules that the UI already enforces

- The list shows tempos only. There is no map position.
- Add a tempo by name. Delete sits on the row. Opening a tempo navigates to `/tempos/:id` and shows the detail popup over the current screen. Tabs are `/examples`, `/review`, and `/reminder` on that same popup. Do not place tempos by clicking a canvas.
- Tags are lowercase tokens on tempos. The list filter searches tags with `GET /tags` as you type and shows each full name. The tag field on a tempo searches existing tags the same way and can add a new one. Replacing tags with `[]` must stick.
- Confidence is the row color and the 1–5 control. Do not add a sentence that restates it.
- Dark mode is the sidebar switch (`theme`: `light` | `dark` | `system`). Persist it. `system` follows the device until the user flips the switch.
- Filters sit in one bar above the list. Review opens on `/review` over that list.

Sort, the review session, tempo flip, and sidebar collapse stay in the browser. Do not add APIs for them.

## Layout

```
src/main.jsx          boot; calls applyTheme before render
src/App.jsx           views: map | tempo | track; login gate
src/config.js         VITE_* app config (apiBaseUrl, env)
src/auth.js           Google via config.apiBaseUrl → mdg-auth-svc; GitHub still local
src/store.jsx         reducer + localStorage
src/data.js           DEFAULT_SETTINGS + settleTempos (no seed garden)
src/lib.js            schedule (SM-2-lite), labels
src/theme.js          dark mode
src/components/TempoMap.jsx    tempo list and delete
src/components/ReviewPanel.jsx review queue on the map screen
src/views/LoginScreen.jsx      Google and GitHub sign-in
src/views/MapView.jsx          tempo list, filters, review session on /review
src/views/TempoPage.jsx        /tempos/:id popup; tabs content, examples, review, reminder
src/views/TrackView.jsx        stats, heatmap, reminder settings
vite.config.js        proxies VITE_API_BASE_URL to AUTH_API_ORIGIN
.env.development|.test|.production
```

Tempos have no map coordinates. Do not store or send `x` / `y`, and do not add a positions API.

## API

Base `/tempos`. JSON. Times are ISO-8601. Errors:

```json
{ "error": { "code": "not_found", "message": "Tempo t_dns was not found." } }
```

`400` malformed, `401` no session, `404` missing id, `409` duplicate tag, `422` rule break.

### User

The garden belongs to one user. Session cookie `mitdo_session` (httpOnly, `SameSite=Lax`, `Secure` outside local dev). Every route except the auth starts and callbacks requires it. A missing or dead session is `401` `unauthenticated`.

`provider` is `google` | `github`. The same email from the other provider signs into the same user and does not open a second garden. `email` and `avatarUrl` may be `null`.

`GET /auth/google` and `GET /auth/github` are browser navigations, not JSON. `302` to that provider. `state` is stored in a short-lived cookie and checked on the way back.

`GET /auth/google/callback` and `GET /auth/github/callback` take `code` and `state`. A mismatch is `400` `invalid_state`. The provider refusing access redirects to `/?error=access_denied` and sets no session. Success sets `mitdo_session` and redirects to `/`.

`POST /auth/logout` → `204`. Clears the cookie.

`GET /me`

```json
{
  "id": "u_01",
  "name": "Ada Lovelace",
  "email": "ada@example.com",
  "avatarUrl": "https://lh3.googleusercontent.com/a/example",
  "provider": "google",
  "theme": "system"
}
```

`PATCH /me` `{ theme }` → `{ theme }`. `theme` is `light` | `dark` | `system`.

### Shell

- `GET /summary` → `{ dueCount, streakDays }`

### Map

`GET /map` query bound to a struct with `validate` tags (`q`, `due`, `tag`, `limit` 1–100 default 40, `offset` ≥ 0). Invalid params → `400`.

List stubs only — no `content`. Ordered due first, then lowest confidence. Response includes `total`, `hasMore`, `dueCount`. Opening a tempo loads `GET /tempos/:id` on demand. UI “Load more” appends the next page.

```json
{
  "tempos": [
    { "id": "t_dns", "name": "DNS", "scale": 1, "confidence": 4, "due": "2026-10-28T01:00:00Z", "tags": ["naming"] }
  ],
  "total": 120,
  "limit": 40,
  "offset": 0,
  "hasMore": true,
  "dueCount": 7
}
```

- `POST /tempos` `{ name }` → `201` tempo.
- `DELETE /tempos/:id` → `204`.

### Review

`GET /review` — lightweight queue only (due tempos, else the five lowest `confidence`). No content payloads.

```json
{ "source": "due", "items": [{ "id": "t_tcp", "name": "TCP handshake", "tags": ["networks"], "confidence": 2, "due": "2026-11-01T01:00:00Z" }] }
```

`GET /review/tempos/:id` — card-shaped detail for one queue item (fetch on demand / prefetch next).

```json
{ "id": "t_tcp", "name": "TCP handshake", "content": "...", "examples": [{ "id": "e_1", "text": "..." }], "tags": ["networks"], "media": [{ "id": "m_1", "kind": "image", "url": "https://...", "title": "SYN" }] }
```

`source` is `due` or `extra`. Flip and queue index stay in the client.

- `POST /tempos/:id/reviews` `{ rating }` `rating` 1–5. Server sets `confidence`, `ease`, `intervalDays`, `due`, appends history, and logs `{ channel: "app", status: "Reviewed" }`. Response is those four schedule fields plus `id`.
- `POST /tempos/:id/examples` `{ text }` → `201` `{ id, text }`
- `POST /tempos/:id/examples/generate` no body. Server writes one example from name and content and returns `{ id, text }`.

### Tempo

`GET /tempos/:id` full tempo.

`PATCH /tempos/:id` any of `name`, `content`, `scale`.

```json
{
  "id": "t_dns",
  "name": "DNS",
  "content": "...",
  "examples": [{ "id": "e_1", "text": "..." }],
  "tags": ["naming", "lookup"],
  "media": [{ "id": "m_1", "kind": "image", "url": "https://cdn.example/a.png", "title": "Lookup" }],
  "confidence": 4,
  "due": "2026-10-28T01:00:00Z",
  "ease": 2.5,
  "intervalDays": 7,
  "reminder": {
    "channels": { "push": true, "email": false, "telegram": false, "slack": false },
    "mode": "auto",
    "time": "08:00",
    "fun": true
  }
}
```

`media.kind` is `image` | `audio` | `video`. `reminder.mode` is `auto` | `daily` | `weekly`. `time` is `HH:mm`.

- `PUT /tempos/:id/tags` `{ tags }` replaces the list. Normalize case, drop duplicates. An empty list stays empty.
- `GET /tags?q=gram` → `{ tags: [{ name, count }] }`. `q` matches anywhere, case-insensitive.
- `DELETE /tempos/:id/examples/:exampleId` → `204`
- `POST /tempos/:id/media` JSON `{ kind, url, title }` or `multipart/form-data` (`file`, `kind`, `title`). Response media object uses a real `url`, not a data URL.
- `DELETE /tempos/:id/media/:mediaId` → `204`
- `PATCH /tempos/:id/reminder` any of `channels`, `mode`, `time`, `fun`.

### Reminders screen

`GET /tracking`

```json
{
  "dueCount": 12,
  "averageConfidence": 2.8,
  "reviewsLast7Days": 9,
  "totalReviews": 140,
  "tempos": [{ "id": "t_dns", "name": "DNS", "confidence": 4, "due": "2026-10-28T01:00:00Z" }],
  "heatmap": [0, 1, 3],
  "log": [{ "tempoId": "t_dns", "name": "DNS", "channel": "push", "status": "Reviewed", "at": "2026-10-22T01:00:00Z" }]
}
```

`heatmap` is 28 days, oldest first. `log` is the newest 8. `channel` is `push` | `email` | `telegram` | `slack` | `app`. `status` is `Reviewed` | `Opened` | `Ignored`.

`GET /settings` and `PATCH /settings`:

```json
{ "channels": { "push": true, "email": true, "telegram": true, "slack": false }, "quietFrom": "22:00", "quietTo": "07:00" }
```

A tempo channel control stays disabled while that channel is off in settings. Per-tempo edits use `PATCH /tempos/:id/reminder`.

## Local persistence

`store.jsx` keeps `user` + `settings` in localStorage. Tempos are loaded from `GET /map` after sign-in and are not seeded in the client. Sign-out clears the in-memory garden. A saved `user` whose `provider` is not `google` or `github` is dropped.

Google and GitHub sign-in are **mdg-auth-svc**. In development the UI calls the backend **directly** (`VITE_API_BASE_URL=http://localhost:8080`) with `credentials: 'include'`. OAuth callbacks are on `:8080` so the HttpOnly `mitdo_session` cookie is set for host `localhost` (ports share it). CORS allows `http://localhost:5173`. Configure providers in `mdg-auth-svc/configs/config.dev.yaml` (OAuth secrets in Vault KV). Register Google/GitHub redirect URIs as `http://localhost:8080/auth/{google|github}/callback`.
