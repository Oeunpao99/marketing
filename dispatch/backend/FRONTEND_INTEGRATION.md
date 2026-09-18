# Wiring the React app to this backend

You were editing the frontend while this backend was being built, so the React
side is left untouched apart from three non-conflicting additions:

| File | What it is |
| --- | --- |
| `dispatch/vite.config.js` | dev-server proxy: `/api` → `http://localhost:8000` |
| `dispatch/src/api/client.js` | tiny `fetch` wrapper (`api.get/post/patch/del`) |
| `dispatch/src/api/useApi.js` | `useApi(path)` → `{ data, loading, error, reload }` |
| `dispatch/src/lib/format.js` | `isKhmer`, `mmss`, byte/date helpers |
| `dispatch/src/components/ui/States.jsx` | `<Loading />`, `<ErrorNote />` |

## Endpoint → screen map

| Screen | Endpoint(s) |
| --- | --- |
| Today | `GET /api/views/today` — one row per channel target; group by `post_id` |
| Waiting for you | `GET /api/views/review`, `POST /api/views/drafts/{id}/approve` · `/reject` |
| Channels | `GET /api/views/channels` (rows incl. `platform_slug`, `char_limit`, `supports_title`, `post_as`, `configured`, `config_keys`), `POST /api/views/channels/{id}/connect` |
| Add platform | `POST /api/views/channels` — JSON body `{ brand_id, platform_slug, handle?, config? }` |
| New post | `GET /api/views/channels` + `GET /api/videos`, then `POST /api/views/schedule` |
| Auto-generate | `GET /api/views/auto`, `PATCH /api/automations/{id}` |
| Publish | `POST /api/views/post-targets/{id}/publish` (one now) · `POST /api/views/publish-due` (all due) |
| Sidebar badges | `GET /api/views/sidebar` (`channels_live/total`, `today_count`, `waiting_count`, `brands[]`) |
| Sidebar "Data" section | `GET /api/meta/models` → `[{name,label,icon,group,list_columns,fields[]}]` |

`POST /api/views/schedule` body:

```json
{ "brand_id": 1, "video_id": 2, "title": "…",
  "targets": [ { "channel_id": 1, "caption": "…", "title": "", "scheduled_for": "2026-09-04T19:30:00Z" } ] }
```

The picker lets you choose channels across brands — group the selected channels by
brand and POST once per brand.

## Suggested store shape

```jsx
// store.jsx
const today    = useApi('/api/views/today')
const channels = useApi('/api/views/channels')
const review   = useApi('/api/views/review')
const auto     = useApi('/api/views/auto')
const sidebar  = useApi('/api/views/sidebar')
const models   = useApi('/api/meta/models')

const refresh = () => { today.reload(); channels.reload(); review.reload(); auto.reload(); sidebar.reload() }

const actions = {
  schedule: (body)          => api.post('/api/views/schedule', body).then(refresh),
  connect:  (id, body)      => api.post(`/api/views/channels/${id}/connect`, body).then(refresh),
  approve:  (id)            => api.post(`/api/views/drafts/${id}/approve`).then(refresh),
  reject:   (id)            => api.post(`/api/views/drafts/${id}/reject`).then(refresh),
  saveAuto: (id, patch)     => api.patch(`/api/automations/${id}`, patch).then(refresh),
}
```

## Sidebar "Data" section — one nav entry per model

```jsx
const { data: models } = useApi('/api/meta/models')
// group models by `group` ("Content" | "Scheduling" | "Team"), render each as
// <NavLink to={`/data/${m.name}`}>{m.icon} {m.label}</NavLink>
```

Add generic routes:

```jsx
<Route path="/data/:resource"      element={<DataListPage />} />
<Route path="/data/:resource/:id"  element={<DataRecordPage />} />
```

`DataListPage`: `api.get('/api/' + resource)` → table from `m.list_columns`.
`DataRecordPage`: build a form from `m.fields` (skip `id`/`created_at`/`updated_at`),
POST for new / PATCH `/api/{resource}/{id}` to save, DELETE to remove.

Every model in `app/registry.py` therefore shows up in the sidebar automatically.
