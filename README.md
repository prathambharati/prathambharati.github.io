# pratham-portfolio

My personal site. Plain HTML, CSS and JavaScript, no build step, hosted on GitHub Pages.

To preview it locally, serve the folder (the portrait effect needs a real origin, not `file://`):

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000.

- `assets/css/site.css`: the whole look, including the motion layer and its reduced-motion and paused-motion rules.
- `assets/js/site.js`: the headline, the portrait, the leaderboard figure, the toolkit and the scroll effects.
- `assets/js/swe-data.js`: top 25 of SWE-bench Verified with per-task outcomes, exported from the Skill vs Luck project.
