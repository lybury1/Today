# Today — working notes for Claude Code

A personal "what's worth doing today" PWA. Owner: Henry. Live at https://lybury1.github.io/Today/ (GitHub Pages, `main` branch, root).

## The one rule the whole app is built on
Every task has a rough **cadence** (days) and the **days it can happen** (`opps`: null = any day, else array of weekday numbers, 0 = Sun).
`urgency = days since last done ÷ cadence`. A task only surfaces on its opportunity days.
**Nothing is ever "overdue"** — there is no red badge, no streak, no guilt. A skipped task just comes back a bit higher next time it's possible. Do not add due dates, overdue counts or streak-break mechanics. One-off tasks (`once: true`) start at "ready", climb gently, and vanish when done.

## Files
Vite build (Node lives at `~/.local/node/bin`, on PATH via `.zshrc`). `npm run dev` / `npm run build`.
- `index.html` — Vite entry. Loads `public/tasks.js` as a plain script (deliberately unbundled so it stays hand-editable), then `src/main.jsx`.
- `src/app.jsx` — the whole app, one component (`DailyPicker`) plus `Detail` sheet and small bits. Inline styles in the `S` object at the bottom.
- `src/main.jsx` — loads saved state async (so no starter-set flash), then renders.
- `src/storage.js` — ALL persistence goes through here: localStorage on web, Capacitor Preferences on native.
- `src/notify.js` — daily-reminder local notifications; no-op on web (`canNotify` gates the settings UI).
- `public/tasks.js` — the task library, `window.TASK_LIBRARY = { Category: [[name, cadence, opps, effort_mins, energy_1to3], …] }` and `window.STARTER_TASKS`. ~800 tasks. **Task id = `Category:Name`**, so renaming a task or moving it between categories resets its history for the user — avoid unless asked.
- `public/sw.js` — offline cache, runtime (network-first) since bundle names are hashed. Bump `CACHE` to force a clean slate.
- `public/manifest.json`, `public/icon-*.png` — PWA install.
- `ios/` — Capacitor iOS shell (SPM, no CocoaPods). App id `com.lybury1.today`. Needs full Xcode to build/run.
  - After a web build, copy `dist/` into `ios/App/App/public/` (keep `cordova.js` + `cordova_plugins.js`). NOTE: `npx cap sync ios` hangs on this project's hand-wired pbxproj — do the copy manually.
  - `App/WidgetBridge.swift` + `App/AlarmBridge.swift` — app-local Capacitor plugins, registered in `App/AppViewController.swift` (which `SceneDelegate` must instantiate — NOT plain `CAPBridgeViewController`, or the plugins silently vanish).
  - `TodayWidget/` — WidgetKit extension (medium + large home-screen widget). Reads JSON the app writes to app group `group.com.lybury1.today` (key `widget-data`) via `src/widget.js` → WidgetBridge on every picks change. Both targets carry the app-group entitlement.
  - `AlarmBridge` schedules a daily full-screen AlarmKit alarm (iOS 26+, same as Todoist urgent reminders) when reminder Style = Alarm; gentle style uses local notifications. State: `reminder` (hour), `reminderStyle` ("gentle" | "alarm").
  - New Swift files must be added to the Xcode target via the `xcodeproj` ruby gem (see `ios/add_widget_target.rb` for the pattern) — nothing is auto-discovered.
- `README.md` — user-facing setup notes.

## State
- Saved in `localStorage` under `today-app-v1`. Shape: `{ active: {id: {lastDone, history[], added?}}, overrides: {id: partial task}, custom: {id: task}, points, skipped: {day, ids}, snoozed: {id: untilDay}, pinned: {day, ids}, holiday: {since} | null, removed: {id: day}, hiddenLib[], hiddenCats[], customCats[], doneOnce[], updatedAt }`.
- `snoozed` = "not this week": entries are `{until, at}` (timestamped so unsnooze survives sync merges; bare numbers are legacy — always read via `snUntil()`). `pinned` = day-scoped "do today" (bypasses the time/energy filters, sits at the top of picks). `holiday` freezes urgency and silences reminders/alarms while on (settings kept, restored on return). `removed` holds tombstones so sync-merge can tell "removed here" from "added there".
- v5 learning: `tlog {id: [[day, minute], ...]}` (last 40 completions/task) and `skiplog {id: [day, ...]}` (last 20) power a ±2h time-of-day boost in the picks sort (max +15%, labelled "usually about now"), the adopt-observed-cadence button, skip counsel, and the Week-tab coach card. `keystone: true` on a task (override) = ★ non-negotiable: due keystones sort first and ignore the energy filter, and skip counsel inverts (pin/alarm, never "let it go").
- v5 finishable day: `spentToday` (today's completed effort, incl. `doneOnce[].effort`) draws down the time budget; `moreAnyway` is the session-scoped escape hatch. Quick-add on Today (`createOneOffNamed`) pins the new one-off so it's visible even with the budget spent.
- Sync rules (hard-won — do not regress): all post-await state applications MUST be functional `setSt((s) => ...)` merges, never object replacement (stale-closure wipes); pushes merge the remote first; `sameCore()` gates every write to stop churn loops; widget Done drains are deduped + idempotent per day and applied unconditionally (the native queue is destructive).
- Days are integers since 1 Jan 2026 (`todayIndex()` / `dateOf(day)`).
- Optional sync to a private GitHub Gist (`today.json`); token + gistId in `localStorage` `today-app-sync`. On pull, local and remote are **merged** (`mergeStates`): histories unioned, `lastDone` max, points max, tombstone-aware; simple fields favour the newer state. Every state change must go through `setStamped` so `updatedAt` updates.
- Never break backwards compatibility of the saved state without a migration — Henry has real history in there.

## Style
- UK English. Calm, unguilty copy ("been a while", never "overdue").
- Palette: ink `#1F2A22`, moss `#2F6F4E`, amber `#C9892A` for high urgency (never red), backgrounds `#E6ECE4` / `#F6F8F4`.
- Mobile-first, 420px column. Bullet-light, no clutter. Keep the daily list to 5–8 items.

## Testing
No test suite. Sanity-check with:
```bash
python3 -m http.server 8000   # then open http://localhost:8000
```
and, for a syntax check of tasks.js:
```bash
node -e 'global.window={};eval(require("fs").readFileSync("tasks.js","utf8"));const L=window.TASK_LIBRARY;let n=0,ids=new Set();for(const c in L)for(const t of L[c]){n++;if(t.length!==5)throw "bad "+t;const id=c+":"+t[0];if(ids.has(id))throw "dup "+id;ids.add(id)}console.log(n,"tasks ok")'
```

## Deploying
`git add -A && git commit -m "…" && git push` — the GitHub Actions workflow (`.github/workflows/deploy.yml`) builds and deploys Pages on every push to main (Pages source must be "GitHub Actions"). ~10-min edge cache after deploy. Henry opens the app twice on the phone to pick up a new service-worker version. Henry pushes via GitHub Desktop; command-line git has no push credentials on this Mac.

## Backlog / ideas Henry has mentioned
- "Surprise me with 5 untracked tasks" in the Library
- Shuffle / re-deal the suggested list
- Search on the Mine tab; bulk-add from the Library
- Variety guard (max ~3 picks per category); notes field per task; dark mode
- Push notifications / native wrap via Capacitor later, if the PWA sticks

Done in v4 (Sep 2026): "not this week" snooze, pin-to-today, one-offs start at u=1.2, Week tab (weekly recap), merge-based gist sync, category view toggle on Today, holiday mode.
