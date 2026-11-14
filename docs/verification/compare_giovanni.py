"""Compare Giovanni's exported monthly series with NASA POWER at the same grid point."""

import csv
import statistics
from pathlib import Path


ROOT = Path(__file__).resolve().parent
GIOVANNI_FILE = ROOT / "assets" / "giovanni-kl-m2t2-1981-2025.csv"
POWER_FILE = ROOT / "power-t2m-giovanni-gridpoint-1981-2025.csv"
OUTPUT_FILE = ROOT / "giovanni-power-comparison.csv"
VARIABLE = "mean_M2IMNXASM_5_12_4_T2M"
MONTHS = ("JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC")


def find_header(lines, prefix):
    return next(i for i, line in enumerate(lines) if line.startswith(prefix))


def read_giovanni():
    lines = GIOVANNI_FILE.read_text(encoding="utf-8-sig").splitlines()
    rows = csv.DictReader(lines[find_header(lines, "time,"):], skipinitialspace=True)
    return {
        row["time"][:7]: float(row[VARIABLE]) - 273.15
        for row in rows
        if row.get("time") and row.get(VARIABLE)
        and float(row[VARIABLE]) < 1e14
    }


def read_power():
    lines = POWER_FILE.read_text(encoding="utf-8-sig").splitlines()
    rows = csv.DictReader(lines[find_header(lines, "PARAMETER,YEAR,"):])
    return {
        f"{int(row['YEAR']):04d}-{month_index:02d}": float(row[month])
        for row in rows
        if row.get("PARAMETER") == "T2M"
        for month_index, month in enumerate(MONTHS, 1)
        if row.get(month) not in (None, "", "-999")
    }


def ols_per_decade(series):
    years = sorted(series)
    x_mean = statistics.mean(years)
    y_mean = statistics.mean(series.values())
    numerator = sum((year - x_mean) * (series[year] - y_mean) for year in years)
    denominator = sum((year - x_mean) ** 2 for year in years)
    return numerator / denominator * 10


giovanni = read_giovanni()
power = read_power()
months = sorted(set(giovanni) & set(power))
if len(months) != 540:
    raise ValueError(f"Expected 540 overlapping monthly values; found {len(months)}")

years = sorted({int(month[:4]) for month in months})
giovanni_annual = {
    year: statistics.mean(giovanni[month] for month in months if int(month[:4]) == year)
    for year in years
}
power_annual = {
    year: statistics.mean(power[month] for month in months if int(month[:4]) == year)
    for year in years
}

with OUTPUT_FILE.open("w", newline="", encoding="utf-8") as stream:
    writer = csv.writer(stream)
    writer.writerow(("year", "Giovanni_annual_mean_C", "POWER_mean_of_months_C", "difference_C"))
    for year in years:
        writer.writerow((year, f"{giovanni_annual[year]:.6f}", f"{power_annual[year]:.6f}", f"{giovanni_annual[year] - power_annual[year]:.6f}"))

monthly_differences = [giovanni[month] - power[month] for month in months]
print(f"Matched monthly values: {len(months)} across {len(years)} years")
print(f"Mean absolute monthly difference: {statistics.mean(map(abs, monthly_differences)):.4f} C")
print(f"Maximum absolute monthly difference: {max(map(abs, monthly_differences)):.4f} C")
print(f"Annual mean absolute difference: {statistics.mean(abs(giovanni_annual[y] - power_annual[y]) for y in years):.4f} C")
for year in (1981, 2000, 2025):
    print(f"{year}: Giovanni {giovanni_annual[year]:.6f} C; POWER {power_annual[year]:.6f} C; difference {giovanni_annual[year] - power_annual[year]:+.6f} C")
giovanni_trend = ols_per_decade(giovanni_annual)
power_trend = ols_per_decade(power_annual)
print(f"OLS trend: Giovanni {giovanni_trend:+.6f} C/decade; POWER {power_trend:+.6f} C/decade; difference {giovanni_trend - power_trend:+.6f} C/decade")
print(f"Wrote {OUTPUT_FILE}")
