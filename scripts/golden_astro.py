"""Regenerate test/fixtures/astro-golden.json from the reference Python implementation.

Usage: uv run --no-project python scripts/golden_astro.py <dir-with-astro.py-and-hours.py>

Each case runs the reference `astro.py` (chart) and `hours.py` (sunrise, sunset and the
planetary hour) as subprocesses under Swiss Ephemeris (Moshier) and records their JSON
output unchanged, so the TypeScript port is checked quantity by quantity.
"""

import json
import subprocess
import sys
from pathlib import Path

# name: (latitude, longitude, utc offset)
PLACES = {
    "beijing": (39.9, 116.41, 8),
    "beijing-ref": (39.9, 116.4, 8),
    "shanghai": (31.23, 121.47, 8),
    "urumqi": (43.83, 87.62, 8),
    "singapore": (1.35, 103.82, 8),
    "tokyo": (35.69, 139.69, 9),
    "sydney": (-33.87, 151.21, 10),
    "wellington": (-41.29, 174.78, 12),
    "buenos-aires": (-34.6, -58.38, -3),
    "lima": (-12.05, -77.04, -5),
    "cape-town": (-33.92, 18.42, 2),
    "new-york": (40.71, -74.01, -5),
    "london": (51.51, -0.13, 0),
    "helsinki": (60.17, 24.94, 2),
    "anchorage": (61.22, -149.9, -9),
    "reykjavik": (64.15, -21.94, 0),
    "longyearbyen": (78.22, 15.65, 1),
}

# (case name, place, local civil time)
CASES = [
    # Anchor of the reference tests: 2000-01-01 12:00 UT.
    ("anchor-j2000", "beijing-ref", "2000-01-01 20:00"),
    ("y1950-new-year", "beijing", "1950-01-01 00:30"),
    ("y1955-summer", "london", "1955-06-21 12:00"),
    ("y1962-autumn-south", "sydney", "1962-03-21 09:15"),
    ("y1969-moon-landing", "new-york", "1969-07-20 16:17"),
    ("y1976-winter", "helsinki", "1976-12-21 15:00"),
    ("y1984-spring", "shanghai", "1984-04-05 07:40"),
    ("y1990-birth", "beijing", "1990-05-06 10:10"),
    ("y1999-eclipse", "london", "1999-08-11 11:11"),
    ("y2000-mercury-rx", "tokyo", "2000-03-01 21:00"),
    ("y2008-olympics", "beijing", "2008-08-08 20:08"),
    ("y2012-solstice", "lima", "2012-12-21 05:30"),
    ("y2016-leap-day", "cape-town", "2016-02-29 18:45"),
    ("y2020-mars-rx", "buenos-aires", "2020-10-13 22:00"),
    ("y2023-venus-rx", "wellington", "2023-08-13 06:00"),
    ("y2023-mercury-rx", "beijing", "2023-12-20 14:00"),
    ("y2024-mercury-rx", "singapore", "2024-04-10 12:00"),
    ("y2024-mercury-station", "beijing", "2024-04-02 06:14"),
    ("y2026-sample", "beijing", "2026-07-24 18:00"),
    ("y2030-equinox", "urumqi", "2030-09-23 08:00"),
    ("y2040-south-winter", "sydney", "2040-06-21 23:59"),
    ("y2049-year-end", "new-york", "2049-12-31 23:30"),
    ("y2050-high-north", "reykjavik", "2050-03-20 13:00"),
    # Polar-ish 60°N in both seasons.
    ("north60-midsummer-night", "helsinki", "2025-06-21 01:30"),
    ("north60-midsummer-noon", "anchorage", "2025-06-21 13:00"),
    ("north60-midwinter", "anchorage", "2025-12-21 09:00"),
    ("north64-midwinter", "reykjavik", "2025-12-21 12:30"),
    # Beyond the polar circle: no sunrise or sunset, so no planetary hour.
    ("polar-day", "longyearbyen", "2025-06-21 12:00"),
    ("polar-night", "longyearbyen", "2025-12-21 12:00"),
    # Day/night edges in Beijing on 2024-03-26 (sunrise ≈ 06:09, sunset ≈ 18:31).
    ("edge-before-sunrise", "beijing", "2024-03-26 06:00"),
    ("edge-at-sunrise", "beijing", "2024-03-26 06:10"),
    ("edge-after-sunrise", "beijing", "2024-03-26 06:30"),
    ("edge-before-sunset", "beijing", "2024-03-26 18:25"),
    ("edge-after-sunset", "beijing", "2024-03-26 18:40"),
    ("edge-deep-night", "beijing", "2024-03-26 03:00"),
    ("edge-late-evening", "beijing", "2024-03-26 23:50"),
    # Southern hemisphere edges.
    ("south-sunrise", "sydney", "2024-12-21 05:50"),
    ("south-sunset", "buenos-aires", "2024-06-21 18:00"),
    ("south-predawn", "cape-town", "2024-06-21 04:00"),
    # A week of first daytime hours and a few weekday spots.
    ("week-mon", "beijing", "2026-07-20 05:30"),
    ("week-tue", "beijing", "2026-07-21 09:00"),
    ("week-wed", "beijing", "2026-07-22 13:00"),
    ("week-thu", "beijing", "2026-07-23 21:00"),
    ("week-fri", "beijing", "2026-07-24 05:10"),
    ("week-sat", "beijing", "2026-07-25 02:00"),
    ("week-sun", "beijing", "2026-07-26 16:40"),
    ("equator-noon", "singapore", "2031-01-15 12:00"),
]


def run(script: Path, dt: str, lat: float, lon: float, offset: float) -> dict:
    cmd = [
        "uv", "run", "--no-project", "--with", "pyswisseph>=2.10", "python", str(script),
        "--dt", dt, "--lat", str(lat), "--lon", str(lon), "--utc-offset", str(offset),
    ]
    out = subprocess.run(cmd, check=True, capture_output=True, text=True)
    return json.loads(out.stdout)


def main() -> None:
    ref = Path(sys.argv[1])
    cases = []
    for name, place, dt in CASES:
        lat, lon, offset = PLACES[place]
        chart = run(ref / "astro.py", dt, lat, lon, offset)
        chart.pop("_asc_sign", None)
        cases.append({
            "name": name,
            "place": place,
            "time": dt,
            "latitude": lat,
            "longitude": lon,
            "utcOffset": offset,
            "chart": chart,
            "hours": run(ref / "hours.py", dt, lat, lon, offset),
        })
    target = Path(__file__).resolve().parent.parent / "test" / "fixtures" / "astro-golden.json"
    target.write_text(json.dumps({"cases": cases}, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"wrote {len(cases)} cases to {target}")


if __name__ == "__main__":
    main()
