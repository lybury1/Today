# Today — working notes for Claude Code

A personal "what's worth doing today" PWA. Owner: Henry. Live at https://lybury1.github.io/Today/ (GitHub Pages, `main` branch, root).

## The one rule the whole app is built on
Every task has a rough **cadence** (days) and the **days it can happen** (`opps`: null = any day, else array of weekday numbers, 0 = Sun).
`urgency = days since last done ÷ cadence`. A task only surfaces on its opportunity days.
**Nothing is ever "overdue"** — there is no red badge, no streak, no guilt. A skipped task just comes back a bit higher next time it's possible. Do not add due dates, overdue counts or streak-break mechanics. One-off tasks (`once: true`) start at "ready", climb gently, and vanish when done.

## Files
- `index.html` — shell. React 18 + Babel standalone from cdnjs. No build step; `app.jsx` is transpiled in the browser.
- `app.jsx` — the whole app, one component (`DailyPicker`) plus `Detail` sheet and small bits. Inline styles in the `S` object at the bottom.
- `tasks.js` — the task library, `window.TASK_LIBRARY = { Category: [[name, cadence, opps, effort_mins, energy_1to3], …] }` and `window.STARTER_TASKS`. ~800 tasks. **Task id = `Category:Name`**, so renaming a task or moving it between categories resets its history for the user — avoid unless asked.
- `sw.js` — offline cache. **Bump `CACHE` (today-vN → today-vN+1) on every change to any file**, or users get the stale version.
- `manifest.json`, `icon-*.png` — PWA install.
- `README.md` — user-facing setup notes.

## State
- Saved in `localStorage` under `today-app-v1`. Shape: `{ active: {id: {lastDone, history[], added?}}, overrides: {id: partial task}, custom: {id: task}, points, skipped: {day, ids}, snoozed: {id: untilDay}, pinned: {day, ids}, holiday: {since} | null, removed: {id: day}, hiddenLib[], hiddenCats[], customCats[], doneOnce[], updatedAt }`.
- `snoozed` = "not this week" (hidden until `untilDay`, next Monday). `pinned` = day-scoped "do today" (bypasses the time/energy filters, sits at the top of picks). `holiday` freezes urgency (u is computed against `min(day, holiday.since)`); ending it shifts every `lastDone`/`added` forward by the gap so nothing piles up. `removed` holds tombstones so sync-merge can tell "removed here" from "added there".
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
`git add -A && git commit -m "…" && git push` — Pages redeploys in ~1–3 min, then a 10-min edge cache. Henry opens the app twice on the phone to pick up a new service-worker version.

## Backlog / ideas Henry has mentioned
- "Surprise me with 5 untracked tasks" in the Library
- Shuffle / re-deal the suggested list
- Search on the Mine tab; bulk-add from the Library
- Variety guard (max ~3 picks per category); notes field per task; dark mode
- Push notifications / native wrap via Capacitor later, if the PWA sticks

Done in v4 (Sep 2026): "not this week" snooze, pin-to-today, one-offs start at u=1.2, Week tab (weekly recap), merge-based gist sync, category view toggle on Today, holiday mode.
