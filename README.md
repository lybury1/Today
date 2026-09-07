# Today

A "what's worth doing today" app. No due dates, no overdue badge. Every task has a rough cadence and the days it can happen; it surfaces when it's ready and just comes back a bit higher if you skip it.

## Files

- `index.html` — shell. Loads React from a CDN and the two files below.
- `app.jsx` — the app.
- `tasks.js` — the task library. **This is the file to edit** to add / change tasks.
- `manifest.json`, `sw.js`, `icon-*.png` — makes it installable and work offline.

Your progress (history, edits, points) is saved in the browser's localStorage on the phone. Nothing leaves the device.

## Put it online (GitHub Pages, ~10 min)

1. Create a new **public** repo on GitHub called `today` (or anything).
2. In Terminal:

```bash
cd ~/Downloads/today          # wherever you unzipped this
git init
git add .
git commit -m "Today app v1"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/today.git
git push -u origin main
```

3. On GitHub: repo → **Settings → Pages** → Source: *Deploy from a branch* → Branch: `main` / `/ (root)` → Save.
4. Wait a minute. Your app is at `https://YOUR-USERNAME.github.io/today/`.

## Put it on your iPhone

1. Open that URL in **Safari** (must be Safari, not Chrome, for home-screen install).
2. Share button → **Add to Home Screen** → Add.
3. Open it from the icon. It runs full screen and works offline.

## Updating the app after changes

Upload the changed files over the old ones: repo page → **Add file → Upload files** → drag them in → Commit. Same-named files are replaced. Then open the app on the phone twice (once to fetch, once to run the new version).

## Sync between devices (GitHub Gist)

The ⚙ tab can keep your data in a private gist on your GitHub account, so Safari, the home-screen app and your Mac all see the same thing.

Make a token (once):

1. GitHub → your avatar → **Settings** → **Developer settings** (bottom of the left menu) → **Personal access tokens** → **Fine-grained tokens** → **Generate new token**
2. Name: `Today app`. Expiration: 1 year (you'll paste a new one when it expires)
3. Repository access: **Public repositories (read-only)** is fine — it isn't used
4. **Account permissions** → **Gists** → *Read and write*. Nothing else
5. Generate, copy the token (it starts `github_pat_`)
6. In the app: ⚙ → paste → **Connect**

It finds or creates a private gist called "Today app data" and saves a couple of seconds after each change. On a second device, paste the same token and it picks up the same gist.

The token is stored only in the app on that device. It can read and write your gists and nothing else.

## Backup

⚙ → **Export file** downloads a JSON of everything (iPhone: save to Files / iCloud). **Import file** restores from one.

## Editing tasks

Open `tasks.js`. Each line is:

```js
["Task name", roughlyEveryNDays, daysItCanHappen, minutesItTakes, energy]
```

- `daysItCanHappen`: `null` for any day, or a list like `[0, 6]` (0 = Sun … 6 = Sat)
- `energy`: 1 low, 2 some, 3 real effort

Then:

```bash
git add . && git commit -m "tasks" && git push
```

Reload the app on your phone. (If you don't see changes, bump `CACHE` in `sw.js` to `today-v2`, push again.)

Tasks you edit inside the app are stored on the phone as overrides, so they survive library updates.

## Local preview on the Mac

```bash
cd ~/Downloads/today
python3 -m http.server 8000
```

Open http://localhost:8000. (Opening `index.html` directly from Finder won't work — it needs a server for the service worker.)

## Later: native iOS

Same code, wrapped:

```bash
npm init -y && npm i @capacitor/core @capacitor/cli @capacitor/ios
npx cap init Today com.henry.today --web-dir .
npx cap add ios && npx cap open ios
```

Then run to your phone from Xcode.

## Reset

"Mine" tab → *reset to starter set* at the bottom, or clear site data in Safari settings.
