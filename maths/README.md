# Statistics tests (Ryan)

Checks that `../stats.js`, the file the website loads, gives the right answers.

```bash
cd maths
python3 -m venv venv && source venv/bin/activate
pip install numpy scipy pymannkendall statsmodels
python compare.py         # every function against answer_key.py (Python, SciPy)
python accuracy_test.py   # libraries, made-up data with a known answer, real NASA POWER data
```

- `answer_key.py` is the same maths written in Python with SciPy, used as the reference.
- `compare.py` runs stats.js and the answer key on the same inputs (about 300 cases) and reports PASS or FAIL per function.
- `accuracy_test.py` checks stats.js against pymannkendall, SciPy and statsmodels on 1,000 random series and 400 maps; on made-up data where the right answer is known (false alarms, 95% range coverage, freak years, missing years, maps); and on real NASA POWER data for Kuala Lumpur, 1981 to 2025. It needs Node.js and an internet connection.

## Checking the maps against NASA

```bash
python check_global.py T2M          # whole-globe trend map and timelapse files
python check_global.py PRECTOTCORR
python check_area.py recorded.json  # the live "This area" map (see the script's docstring)
```

- `check_global.py` downloads 12 areas (4 fixed, 8 random) straight from NASA POWER, recomputes their trends with SciPy and pymannkendall, checks random timelapse months, and recomputes all 2,592 significance flags with statsmodels.
- `check_area.py` takes what the website showed for a "This area" map (the NASA request it made and the panel text), downloads the same box from NASA, recomputes every cell and the false discovery rate correction, and compares the counts and colour scale.
- `check_maps.py` takes what the website drew (every cell's place, colour and dot, and for the timelapse every cell's colour in one month), works out from NASA data what each cell should look like, and compares them cell by cell.
