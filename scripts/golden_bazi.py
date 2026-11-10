"""Regenerate test/fixtures/bazi-golden.json from the reference Python implementation.

Usage: uv run --with lunar-python python scripts/golden_bazi.py <path-to-bazi.py>

The reference script is the original `bazi.py`; each case runs it as a subprocess and
records its JSON output unchanged, so the TypeScript port is checked field by field.
"""

import json
import subprocess
import sys
from pathlib import Path

NATAL_CASES = [
    {"name": "sample-dst-beijing-male", "args": ["--year", "1990", "--month", "5", "--day", "6", "--hour", "11", "--minute", "10", "--dst", "--city", "北京", "--gender", "male"]},
    {"name": "sample-apparent-solar", "args": ["--year", "1990", "--month", "5", "--day", "6", "--hour", "11", "--minute", "10", "--dst", "--city", "北京", "--apparent-solar"]},
    {"name": "late-zi-today", "args": ["--year", "1990", "--month", "5", "--day", "6", "--hour", "23", "--minute", "30"]},
    {"name": "late-zi-tomorrow-female", "args": ["--year", "1990", "--month", "5", "--day", "6", "--hour", "23", "--minute", "30", "--zi-mode", "tomorrow", "--gender", "female", "--dayun-count", "8"]},
    {"name": "early-zi", "args": ["--year", "2001", "--month", "1", "--day", "1", "--hour", "0", "--minute", "20", "--gender", "male"]},
    {"name": "lichun-boundary-before", "args": ["--year", "2024", "--month", "2", "--day", "4", "--hour", "16", "--minute", "20", "--gender", "female"]},
    {"name": "lichun-boundary-after", "args": ["--year", "2024", "--month", "2", "--day", "4", "--hour", "16", "--minute", "40", "--gender", "female"]},
    {"name": "urumqi-west", "args": ["--year", "1985", "--month", "11", "--day", "20", "--hour", "9", "--minute", "0", "--city", "乌鲁木齐", "--gender", "male"]},
    {"name": "tokyo", "args": ["--year", "1978", "--month", "8", "--day", "15", "--hour", "12", "--minute", "0", "--city", "东京", "--gender", "female"]},
    {"name": "new-york", "args": ["--year", "1995", "--month", "3", "--day", "1", "--hour", "6", "--minute", "45", "--city", "纽约", "--gender", "male"]},
    {"name": "old-1949", "args": ["--year", "1949", "--month", "10", "--day", "1", "--hour", "15", "--minute", "0", "--city", "北京", "--gender", "male"]},
    {"name": "future-2060", "args": ["--year", "2060", "--month", "12", "--day", "31", "--hour", "21", "--minute", "59", "--city", "上海", "--gender", "female"]},
    {"name": "alias-city", "args": ["--year", "2010", "--month", "7", "--day", "7", "--hour", "7", "--minute", "7", "--city", "shenzhen"]},
]

FLOW_CASES = [
    {"name": "flow-plain", "args": ["--start", "2026-07-20 22:00", "--end", "2026-07-21 03:00"]},
    {"name": "flow-city-detail", "args": ["--start", "2026-11-09 00:00", "--end", "2026-11-09 23:59", "--city", "北京", "--detail", "--birth-year", "1990", "--birth-month", "5", "--birth-day", "6", "--birth-hour", "11", "--birth-minute", "10", "--birth-dst", "--birth-city", "北京"]},
]


def run(script: str, cmd: str, args: list[str]) -> dict:
    out = subprocess.run([sys.executable, script, cmd, *args], check=True, capture_output=True, text=True)
    return json.loads(out.stdout)


def main() -> None:
    script = sys.argv[1]
    golden = {
        "natal": [{**c, "output": run(script, "natal", c["args"])} for c in NATAL_CASES],
        "flow": [{**c, "output": run(script, "liupan", c["args"])} for c in FLOW_CASES],
    }
    target = Path(__file__).resolve().parent.parent / "test" / "fixtures" / "bazi-golden.json"
    target.write_text(json.dumps(golden, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"wrote {target}")


if __name__ == "__main__":
    main()
