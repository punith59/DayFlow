# DayFlow

A calm, personal day-planning PWA. Midnight Green theme, five screens (Today, Calendar,
Memory, Goals, More), local-first storage — no backend, no account, no automatic scheduling.

Plain HTML/CSS/JS (ES modules), no build step, no dependencies. Works fully offline once
installed.

## Run it locally

Because it uses ES modules, open it through a local server rather than `file://`:

```bash
cd dayflow
python3 -m http.server 8080
# then open http://localhost:8080
```

## Deploy to GitHub Pages

1. Create a new GitHub repository and push the contents of this folder to it
   (the repo root should contain `index.html`, `manifest.json`, `sw.js`, `css/`, `js/`, `icons/`).

   ```bash
   cd dayflow
   git init
   git add .
   git commit -m "DayFlow v1"
   git branch -M main
   git remote add origin https://github.com/<your-username>/<your-repo>.git
   git push -u origin main
   ```

2. In the repository on GitHub: **Settings → Pages → Build and deployment → Source**,
   choose **Deploy from a branch**, branch `main`, folder `/ (root)`. Save.

3. Your app will be live at `https://<your-username>.github.io/<your-repo>/`.
   Every path in this project is relative (`./css/...`, `./js/...`), so it works whether
   it's served from a project subpath like that, or from a custom domain at the root —
   no config changes needed either way.

4. Open the URL on your phone (or desktop Chrome/Edge) and use **"Add to Home Screen"**
   / **Install app**, or use the **Install DayFlow** row under **More** in the app itself.

## Updating after changes

GitHub Pages serves whatever is on the `main` branch, so just commit and push again.
The service worker uses a network-first strategy for the app shell, so most users will
see updates on their next load; a hard refresh clears any stale cache immediately.

## Data

Everything (tasks, events, goals, memories, notes, college schedule, settings) is stored
in the browser's `localStorage` on the device you're using — nothing is sent anywhere.
Use **More → Data Export/Import** to back up or move your data between devices/browsers.
