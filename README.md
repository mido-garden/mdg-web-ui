# Mitdo garden app (React)

React 18 + Vite. Garden data loads from [`mdg-tempo-svc`](../mdg-tempo-svc). **Google sign-in** uses sibling service [`mdg-auth-svc`](../mdg-auth-svc) (Go + MySQL); Vite proxies `/v1` to it.

### Environments (Vite modes)

| Script | Mode | Env files |
|--------|------|-----------|
| `npm run dev` | `development` | `.env` + `.env.development` |
| `npm run build:test` / `preview:test` | `test` | `.env` + `.env.test` |
| `npm run build` / `preview` | `production` | `.env` + `.env.production` |

Browser config lives in `src/config.js` (`VITE_*` only). Dev proxy target is `AUTH_API_ORIGIN` (not exposed to the browser).

```bash
# terminal 1
cd ../mdg-auth-svc && make run-dev

# terminal 2
cd ../mdg-tempo-svc && make migrate && make run-dev

# terminal 3
npm install
npm run dev               # http://localhost:5173
```

Register Google redirect URI: `http://localhost:8080/v1/auth/google/callback` (on **mdg-auth-svc**, not this app).

## Structure

```
src/
  main.jsx, App.jsx        entry + routes
  store.jsx                useReducer store + localStorage (user/settings)
  data.js                  DEFAULT_SETTINGS + settleTempos
  lib.js                   scheduling and labels
  styles.css               theme tokens (light/dark) and layout
  components/
    TempoMap.jsx           tempo list
    ReviewPanel.jsx        inline review queue
    Sidebar.jsx, Burst.jsx
  views/
    MapView.jsx            toolbar, tag filter, map + review
    TempoPage.jsx          /tempos/:id detail popup
    TrackView.jsx          stats, heatmap, log, reminder settings
```

## Data model

Tempos only. Organize with **tags**. `x` and `y` are 0–1 fractions of the map size.

## Where to plug in a backend

- `lib.js` `generateExample`: call an LLM to create examples.
- `lib.js` `schedule`: replace SM-2-lite with FSRS.
- Reminders: a server job sends to the enabled channels; the UI only stores preferences today.
