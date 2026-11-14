from pathlib import Path
import csv

ROOT = Path(__file__).resolve().parent

def fmt_delta(value):
    return f"{0.0 if abs(value) < 0.005 else value:.2f}"

CASES = [
    ("Klang Valley", 3.1, 101.6, "power-t2m-klang-valley-1981-2025.csv", {1981: 25.18, 2000: 25.17, 2025: 25.68}),
    ("Penang", 5.35, 100.4, "power-t2m-penang-1981-2025.csv", {1981: 25.76, 2000: 25.80, 2025: 26.49}),
    ("East Coast", 5.4, 102.6, "power-t2m-east-coast-1981-2025.csv", {1981: 25.11, 2000: 25.15, 2025: 25.69}),
]
rows = []
for place, lat, lon, filename, app_values in CASES:
    lines = (ROOT / filename).read_text(encoding="utf-8-sig").splitlines()
    header_at = next(i for i, line in enumerate(lines) if line.startswith("PARAMETER,YEAR,"))
    data = csv.DictReader(lines[header_at:])
    by_year = {int(row["YEAR"]): row for row in data if row.get("PARAMETER") == "T2M"}
    for year, app_value in app_values.items():
        row = by_year[year]
        monthly_mean = sum(float(row[m]) for m in ("JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC")) / 12
        rows.append({
            "place": place, "latitude": lat, "longitude": lon, "year": year,
            "POWER_mean_from_12_months_C": f"{monthly_mean:.2f}",
            "POWER_ANN_C": row["ANN"], "Trend_Detective_C": f"{app_value:.2f}",
            "app_minus_month_mean_C": fmt_delta(app_value - monthly_mean),
            "app_minus_POWER_ANN_C": fmt_delta(app_value - float(row["ANN"])),
        })
with (ROOT / "power-app-comparison.csv").open("w", newline="", encoding="utf-8") as out:
    writer = csv.DictWriter(out, fieldnames=rows[0].keys())
    writer.writeheader(); writer.writerows(rows)
for row in rows:
    print("{place}, {year}: monthly mean {POWER_mean_from_12_months_C} C; POWER ANN {POWER_ANN_C} C; app {Trend_Detective_C} C; delta monthly {app_minus_month_mean_C} C; delta ANN {app_minus_POWER_ANN_C} C".format(**row))
