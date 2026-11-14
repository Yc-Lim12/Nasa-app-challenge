# Issue for Danny — mask ocean values for soil moisture

**Reproducer**

- Open the app and choose topsoil wetness (`GWETTOP`) at 0°N, 140°W, one point, 1981–2025:
  `http://127.0.0.1:5500/index.html#v=GWETTOP&lat=0&lon=-140&size=0&y0=1981&y1=2025&m=0&p=custom`
- NASA POWER direct CSV request:
  `https://power.larc.nasa.gov/api/temporal/monthly/point?parameters=GWETTOP&community=AG&longitude=-140&latitude=0&start=1981&end=2025&format=CSV`
- Preserved response: `power-gwettop-open-ocean-1981-2025.csv`.

**Observed**

Trend Detective treats the values as valid and says topsoil wetness has no trend. POWER returns 1.0 for all twelve months of 1981 and 2025 at this open-ocean point. A land-soil variable should not be presented as an informative ocean measurement.

**Suggested fix**

For soil variables, apply a land/valid-data mask or return a clear “no land data here” message when the requested cell is ocean. Keep the raw NASA response visible in debugging so it is clear the constant value comes from the source response rather than the trend calculation.
