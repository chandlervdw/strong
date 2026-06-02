# Lifting Log

A neon, mobile-friendly website that visualizes ~10 years of training exported from the
[Strong](https://www.strong.app/) app. It **leads with personal records** — showing how close
current lifts are to all-time bests — then covers lifetime totals, strength over time, training
consistency, and an explorer for every exercise.

Static site, no backend, no build toolchain. Built to be hosted on **GitHub Pages**.

## How it works

```
strong_workouts.csv  ──(build.py)──►  data.js  ──►  index.html + styles.css + app.js
```

`build.py` pre-aggregates the 2 MB CSV into a compact ~31 KB `data.js` so the page loads
instantly on mobile (no client-side CSV parsing). The page reads `window.STRONG_DATA` and renders
everything with vanilla JS + [Chart.js](https://www.chartjs.org/) (from a CDN).

## Refresh the data

1. In Strong: **Settings → Export Data** → you'll get `strong_workouts.csv`.
2. Replace the `strong_workouts.csv` in this folder with the new export.
3. Regenerate the data file:
   ```bash
   python3 build.py
   ```
   It prints a summary (volume, sessions, PRs) so you can sanity-check the numbers.
4. Commit and push.

No third-party Python packages are needed — only the standard library.

## Preview locally

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

(Open it through a server, not the `file://` path, so `data.js` and Chart.js load correctly.)

## Deploy to GitHub Pages

```bash
git init
git add .
git commit -m "Lifting Log"
gh repo create lifting-log --public --source=. --push
```

Then in the repo: **Settings → Pages → Build and deployment → Deploy from a branch →
`main` / `(root)`**. Your site goes live at `https://<your-username>.github.io/lifting-log/`.

### Privacy note

Free GitHub Pages requires a **public** repo, so the aggregated stats (and the raw
`strong_workouts.csv`, if committed) will be public. The site only needs `data.js` — if you'd
rather not publish the raw export, uncomment the `strong_workouts.csv` line in `.gitignore`
before committing. (Keep a local copy so you can re-run `build.py` later.)

## Customize

- **Featured lifts / PR logic / windows** — top of `build.py` (`BIG3`, `CURRENT_WINDOW_DAYS`, `E1RM_REP_CAP`).
- **Colors, fonts, glow** — CSS variables at the top of `styles.css`.
- **Copy / section order** — `index.html`.

## Notes

- "Est. 1RM" uses the Epley formula (`weight × (1 + reps/30)`), capped at ≤10 reps for reliability.
- "Current" is the best estimated 1RM in the trailing 90 days (widens automatically if you've had a quiet stretch).
- Animations respect `prefers-reduced-motion`.
