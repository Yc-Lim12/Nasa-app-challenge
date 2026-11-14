# Verification files and reproduction links

NASA POWER monthly point CSVs downloaded on 14 November 2026 for the same points and years used in Trend Detective:

- Klang Valley (3.1 N, 101.6 E): https://power.larc.nasa.gov/api/temporal/monthly/point?parameters=T2M&community=AG&longitude=101.6&latitude=3.1&start=1981&end=2025&format=CSV
- Penang (5.35 N, 100.4 E): https://power.larc.nasa.gov/api/temporal/monthly/point?parameters=T2M&community=AG&longitude=100.4&latitude=5.35&start=1981&end=2025&format=CSV
- East Coast (5.4 N, 102.6 E): https://power.larc.nasa.gov/api/temporal/monthly/point?parameters=T2M&community=AG&longitude=102.6&latitude=5.4&start=1981&end=2025&format=CSV
- Open ocean soil wetness check: https://power.larc.nasa.gov/api/temporal/monthly/point?parameters=GWETTOP&community=AG&longitude=-140&latitude=0&start=1981&end=2025&format=CSV

The requests are plain public GETs; no login or API key was used. The app fetched its monthly values from NASA POWER directly in the browser. Its annual mean is the arithmetic mean of the valid monthly values (ignoring NASA's -999 missing marker). `compare_power.py` reproduces the three-year spot checks from the saved NASA POWER CSVs and writes `power-app-comparison.csv`.

Official references:

- NASA POWER Monthly API: https://power.larc.nasa.gov/docs/services/api/temporal/monthly/
- NASA POWER data processing (monthly to annual): https://power.larc.nasa.gov/docs/methodology/data/processing/
- NASA Giovanni BETA: https://giovanni.earthdata.nasa.gov/
- Giovanni User Guide: https://giovanni.gsfc.nasa.gov/giovanni/doc/UsersManualworkingdocument.docx.html

## Giovanni comparison

The authenticated main Giovanni v4.40 interface produced a monthly area-averaged time series for MERRA-2 2-meter air temperature (`M2IMNXASM_5_12_4_T2M`) from January 1981 through December 2025. The selected bounds were 101.25°E–101.875°E and 3.0°N–3.5°N. Giovanni reports that the data grid resolves this box to one point at 101.25°E, 3.0°N. Its plot is saved as `assets/giovanni-kl-m2t2-1981-2025.png`, and the downloaded monthly CSV is saved beside it.

For a like-for-like cross-check, NASA POWER monthly T2M was downloaded at that same reported grid point, 101.25°E, 3.0°N. Giovanni values were converted from K to °C. `compare_giovanni.py` averages each set of 12 monthly values into annual means and fits ordinary least-squares trends across 1981–2025. The output table is `giovanni-power-comparison.csv`. This comparison is at the Giovanni data-grid point; the earlier Trend Detective Klang Valley spot check used 3.1°N, 101.6°E, so those two locations should not be treated as an exact point-to-point match.

Reproduce the NASA POWER point request: https://power.larc.nasa.gov/api/temporal/monthly/point?parameters=T2M&community=AG&longitude=101.25&latitude=3&start=1981&end=2025&format=CSV

The Giovanni chart is a monthly visualization. Giovanni did not report a trend test in this run; the annual trend rates above were independently calculated from the two exported CSVs.
