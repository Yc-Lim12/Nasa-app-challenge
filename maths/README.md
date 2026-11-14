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
