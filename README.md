# Trend Detective

Team **Sunway to the Moon**, NASA Space Apps Challenge 2026 (Kuala Lumpur).
Challenge: *Be An Earth System Trend Detective!*

Pick something about Earth, pick a place, and find out from NASA data whether it is
really changing, how fast, and whether the change is statistically significant.

## Run it

Open `index.html` in a browser. There is nothing to install or build. It needs an
internet connection because it reads live NASA data.

## Put it online (free, no login for visitors)

**GitHub Pages:** push this folder to a public GitHub repository, then Settings → Pages →
Deploy from a branch → `main`, folder `/ (root)`. The site appears at
`https://<user>.github.io/<repo>/` within a minute or two.
**Vercel:** import the repository, framework preset "Other", no build command, output folder `.`.
Then set `REPO_URL` at the top of `app.js` so the footer links to the repository.

## Features

| # | Feature | Where | How it works |
|---|---|---|---|
| 1 | Variable picker | Case settings | 17 NASA variables in five topics, each with a plain-language definition |
| 2 | What's changing here? | "Scan every variable" | Tests every variable at the place and ranks them by p-value, with a strength bar |
| 3 | Trend map | Globe → Trend map | Sen's slope for every grid cell in a 10° box. Red rising, blue falling |
| 4 | Significance dots | Trend map | White dot on each cell with Mann-Kendall p < 0.05 |
| 5 | Click → detail card | Click the globe | Line chart, trend line, 95% band, rate per decade, total change, verdict |
| 6 | Plain-English answer | Verdict, globe tag | One sentence, e.g. "Air temperature around Klang Valley is rising by about 0.18 °C per decade." |
| 7 | Live public website | See above | Static files, no server, no login |
| 8 | Opposite-trend finder | Trend map | Finds rising and falling areas in the same box, marks both, captions them, compares the two spots |
| 9 | Timelapse | Globe → Timelapse | Play, slider and speed through every month. Values or difference from normal |
| 10 | Malaysia story mode | "Malaysia stories" | KL heat, haze spikes, east vs west coast rain, warming seas: guided steps |
| 11 | Spike, not trend | Under the evidence | Flags years more than 3.5 robust SDs from the trend, rings them on the chart, re-tests without them |
| 12 | Methods / About | "Methods" button | Sources with citations, statistics, map methods, limits, what is not included and why |
| 13 | Future trend line | "If the trend continues" switch | Dotted line and band 10 years past the data, labelled as an extension, not a forecast |
| 14 | NASA climate projections | Methods page | Not built: NEX-GDDP-CMIP6 has no browser API. See "Not included" below |
| 15 | Bahasa Malaysia / English | "BM / EN" button | Page text, verdicts, evidence, stories and map tools. Methods and footer stay in English |
| 16 | Question box | Search field on the globe | Rule-based, in the browser: finds variable, place (about 90 names), month and years. Not an AI service |
| 17 | Years needed to detect | Verdict and evidence | Weatherhead et al. (1998): "Not proven yet. About N more years of data would be needed to tell." |
| 18 | Live rain animation | Globe → Rain now | Last 12 hours of NASA GPM IMERG (30-minute product), one frame per hour, via NASA GIBS |
| 19 | Wind particles | Globe → Wind | Particles follow the mean MERRA-2 10 m wind; month buttons show the monsoons |
| 20 | Compare two variables | "Compare two variables" card | Both as standard scores on one chart, correlation r, and r after removing trends |
| 21 | Mobile layout | Any phone | Globe on top, case file below, swipeable stories, compact layer bar |
| 22 | Download / share | Under the chart | Save chart as PNG, CSV of the numbers, and a link that reopens the exact view |

### Not included, and why

- **Greenness (NDVI):** MODIS NDVI is only reachable from a browser through the ORNL subset
  service: 10 dates per request at about 17 s each, so roughly 15 minutes for one place.
- **Water storage (GRACE) and NEX-GDDP-CMIP6 projections:** large NetCDF files with no browser
  API. The way forward is a small Python step that pre-computes Malaysia series into JSON files
  stored in this repository, which the app could then load like any other variable.

## Files

| File | Purpose |
|---|---|
| `index.html` | Page structure and text |
| `style.css` | Styling, light and dark themes |
| `stats.js` | Linear regression with t-test, Mann-Kendall test, Sen's slope (no dependencies) |
| `globe.js` | Interactive 3D globe (drag to spin, zoom, click to choose a place) |
| `maplab.js` | Trend map, significance dots, opposite trends, timelapse, live rain, wind |
| `stories.js` | Guided stories (Malaysia, plus wildfire smoke over Wisconsin) |
| `ask.js` | Plain-English question box (rule-based, runs in the browser) |
| `wizard.js` | "Help me choose" question wizard: kind of place, interest, where, then suggested variables |
| `ai.js` | Plain-language explanation of results and an Ask AI chat (built-in, or OpenAI with the user's own key) |
| `i18n.js` | English / Bahasa Malaysia |
| `app.js` | Variable catalogue, NASA data fetching, chart, verdict, scan |
| `polish.js` | Pull-out case file sheet and sliding segmented controls |

## Data

- **NASA POWER** monthly API, NASA Langley Research Center: <https://power.larc.nasa.gov/>
- Temperature, precipitation, soil wetness, evaporation, humidity, wind and ozone come from
  the **MERRA-2** reanalysis (NASA Global Modeling and Assimilation Office).
- Sunlight, cloud cover and aerosol optical depth come from **CERES SYN1deg** and **GEWEX SRB**.

Monthly values are averaged into one value per year (or one chosen month per year). For a
box, grid cells are averaged with cos(latitude) weights. Years with any missing month are skipped.

## Method

- Least-squares line, with a two-sided t-test on the slope and a 95% confidence interval.
- Mann-Kendall test with tie correction and continuity correction. The verdict uses this
  test: p < 0.05 is "significant", p < 0.10 is "borderline".
- Sen's slope (median of all pairwise slopes) for the reported rate of change.
- Both tests are adjusted for year-to-year memory (lag-1 autocorrelation, effective
  sample size n* = n(1 − r)/(1 + r) with a small-sample bias correction); the verdict uses
  the memory-adjusted Mann-Kendall p-value. `stats.js` by Ryan.
- Optional monthly mode: each month minus its calendar-month average (seasonal cycle
  removed), tested with the same adjustment.
- Areas over 10° are fetched from NASA POWER as tiles of at most 10° and merged.

Limits: linear trends only; the memory adjustment uses lag-1 autocorrelation only; areas
up to 20° × 20°, no whole-world average.

## Validation (Python)

The app runs entirely in the browser (JavaScript), so anyone can open the link with
nothing to install. Python is used to check it:

```
pip install -r tools/requirements.txt
python tools/validate_stats.py   # every number stats.js reports vs SciPy (315 checks)
python tools/coverage.py         # simulation: 95% interval coverage and false-alarm rates
```

Both scripts run the website's own `stats.js` through Node.js, so they test the exact
code the site uses. Results are in [tools/VALIDATION.md](tools/VALIDATION.md).

## Other tools used

- D3 7.9.0 (orthographic projection) and topojson-client 3.1.0 for the globe, with
  Natural Earth coastlines and borders from the world-atlas 2.0.2 package.
- Type follows Apple's system font (SF Pro on Apple devices); Inter from Google Fonts is the fallback elsewhere (SIL Open Font License).

## Interaction design

- **The globe fills the screen.** On a wide screen the case file (settings, chart, statistics) is a
  sheet that starts closed. The "Case file" handle on the right pulls it out, the globe moves aside
  to stay in view, and Escape or the arrow button puts it away. A blue dot on the handle means a
  new answer is waiting. Starting a story or opening a shared link opens the sheet. On a phone the
  case file stays below the globe.
- **Satellite globe.** The globe is painted with NASA imagery from GIBS: Blue Marble by default, or
  the latest daily true-colour pass from VIIRS on NOAA-20 (with clouds). The layers button under the
  zoom buttons switches between them and the original dark map. When the globe stops, a sharper
  picture of the area in view is fetched, so you can zoom in about four times further than before.
  The mouse wheel zooms on a wide screen.
- **Momentum.** Flick the globe and it keeps turning and slows down; touch it to stop it mid-spin.
- **Press feedback** on every control at pointer-down, hover styles only where there is a mouse,
  and segmented controls whose selection slides to the new segment.
- **Motion rules:** ease-out curves, UI animation under 300 ms, things appear from where they
  belong (the answer tag from its pin, month bars from the zero line).
- **Settings respected:** reduced motion gets cross-fades instead of movement, reduced transparency
  gets solid surfaces instead of frosted ones, and increased contrast gets stronger text and edges.
- These follow Apple's fluid-interface principles (WWDC "Designing Fluid Interfaces") and Emil
  Kowalski's design engineering guidelines (<https://github.com/emilkowalski/skills>, MIT). No Apple
  fonts, icons or artwork are bundled: Apple devices simply use their own system font.

## Use of AI

The first prototype of this code was written with Claude (Anthropic). The team reviews,
tests and extends it.

## Ideas for the hackathon weekend

- Add the datasets listed on the challenge Resources tab (for example GPM rainfall or GLDAS).
- Ask the user two or three questions and suggest variables from the answers.
- Add a short guided demo for first-time users.

## Privacy, disclaimers and third parties

- **Student project.** Not made, reviewed or endorsed by NASA. For learning, not official use. No NASA logo
  or insignia is used; use the Space Apps event branding for posters and videos.
- **No accounts, analytics or cookies.** Choices live in the page address. The theme choice is kept in the
  browser's own storage. The coordinates of the place being investigated (including "use my location")
  are sent to NASA POWER to fetch data and are not stored by the app. No personal data is handled
  (Malaysia PDPA 2010).
- **Third-party services:** NASA POWER, NASA GIBS (satellite pictures on the globe, and rain images in "Rain now"), Google Fonts (receives visitor IP addresses; the fonts can be
  self-hosted in the repo if that matters), cdnjs (D3) and jsDelivr (topojson-client, world-atlas).
- **Contact:** set `REPO_URL` at the top of `app.js` to show the repository link in the footer.

## Licence

Apache-2.0, the default licence for NASA Space Apps projects.
