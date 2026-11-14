# Browser edge-case checks — 14 November 2026

Manual checks performed in the local `index.html` browser app against the live NASA POWER API. These are browser checks, not automated unit tests.

Update after the user's rollback request: the short-record warning remains translated, but the stale-results clearing behavior was restored to its original behavior. A previous result can therefore remain visible when the selected period is too short. This post-rollback behavior is inferred from the restored code and was not re-tested in the browser; the earlier test observation that the result panel was hidden no longer describes the current code.

| Place / case | Inputs | Observed result | Assessment |
|---|---|---|---|
| North Pole | 89°N, T2M, 1981–2025, one point | Analysis loaded; rising trend about +0.60 °C/decade, Mann–Kendall p < 0.001. | Pass — no location/API error. |
| South Pole | 89°S, T2M, 1981–2025, one point | Analysis loaded; rising trend about +0.48 °C/decade, p < 0.001. | Pass — no location/API error. |
| Open ocean | 0°N, 140°W, topsoil wetness (`GWETTOP`), 1981–2025 | The app reports no trend. The direct NASA POWER CSV returns 1.0 for every monthly value in 1981 and 2025 (and the inspected series is constant). | **Issue for Danny** — a land-soil variable appears populated over ocean and is presented as meaningful data. See `danny-issue.md`. |
| Date line, east side | 0°N, 179°E, T2M, 2° box, 1981–2025 | Analysis loaded; trend about +0.18 °C/decade. | Pass — no longitude-wrap error. |
| Date line, west side | 0°N, 179°W, T2M, 2° box, 1981–2025 | Analysis loaded; trend about +0.17 °C/decade. | Pass — no longitude-wrap error. |
| Haze, smoke and dust requested from 1981 | 3.1°N, 101.6°E, `AOD_55`, 1981–2025 | The series contains 25 usable annual rows, 2001–2025; page metadata says the source starts in 2001. | Pass with expected coverage note — no false 1981 data. |
| Short record | 3.1°N, 101.6°E, T2M, 2021–2025 | BM warning is translated; original stale-results behavior was restored at the user's request, so a previous result can remain visible. | Restored per request. |
| BM scan and chart labels | 3.1°N, 101.6°E, 1981–2025, scan all variables | Chart title, scan introduction, summary, table headers and multiple-testing note appear in BM. | Pass. |

## Source-data comparison

Nine app values (three years at three Malaysian points) were read from the app’s yearly table and checked against the official NASA POWER monthly CSV. Each app value matched the two-decimal mean of the 12 downloaded monthly values. Two app values differ from POWER’s separately rounded `ANN` column by 0.01 °C; this is consistent with rounding/aggregation, not a material disagreement. The calculation is reproducible with `compare_power.py`; output is `power-app-comparison.csv`.

## Giovanni cross-check

After the account holder confirmed acceptance of the GES DISC End User License Agreement, the authenticated main Giovanni v4.40 interface showed `Log out (weiling629)`. It successfully generated a monthly area-averaged series for MERRA-2 2-meter air temperature (`M2IMNXASM_5_12_4_T2M`), 1981-01 through 2025-12. The requested bounds were 101.25°E–101.875°E, 3.0°N–3.5°N; Giovanni reports the effective data grid as a single point at 101.25°E, 3.0°N.

The official Giovanni CSV was compared with a direct NASA POWER monthly T2M CSV for that same grid point. There are 540 overlapping monthly values across 45 years. After converting Giovanni K to °C and averaging the twelve monthly values into annual means, the 1981, 2000 and 2025 values agree within 0.01°C; the OLS annual trend rates agree to 0.0001°C/decade. This supports the data-processing cross-check. The app's previous Klang Valley spot check used 3.1°N, 101.6°E, so the result should not be presented as a point-for-point comparison to that separate app location. Reproduce the calculations with `compare_giovanni.py`.

## Screenshot status

The Giovanni plot was saved from the site's official Download > PNG control as `assets/giovanni-kl-m2t2-1981-2025.png` and included in the verification PDF. The raw Giovanni CSV and same-grid NASA POWER CSV are preserved alongside the comparison script and annual summary table.
