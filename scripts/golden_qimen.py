"""Regenerate test/fixtures/qimen-golden.json from the reference Python implementation.

Usage: python scripts/golden_qimen.py <qimen-skill-scripts-dir> <path-to-bazi.py>

The reference scripts are the original `qimen.py` (chart), `duanju.py` (judgement) and
`bazi.py` (true solar time). Each case runs them as subprocesses through
`uv run --no-project --with lunar-python python` and records their JSON output unchanged,
so the TypeScript port is checked field by field.

The reference runs from a temporary copy with these corrections, recorded as exact
substitutions in `REFERENCE_FIXES`:

- 天芮: the rotating star ring holds 天芮 at 坤 and a 禽 值符 rotates as 天芮, where the
  reference lists 禽 in 芮's place and so never shows 天芮.
- 陰遁 ring: the counter-clockwise ring runs 艮坎乾兌坤離巽震; the reference swaps 坎 and 艮,
  breaking the rigid rotation of stars, doors and spirits.
- Solar term: with a city the term, and so the 局 and the 遁, is read at the clock time on
  Beijing time (clock − (meridian − 120°) × 4 min), handed to the reference in
  `QIMEN_TERM_DT`; the pillars keep the true solar moment.
- 值符 in the centre with the 旬首仪 at 坤: the heaven plate stays on the earth plate (伏吟).
- 中五寄坤: the centre's earth stem rides with 天芮 as a second heaven stem, output as
  `天盘寄` and per 用神 as `天盘寄`/`克应寄`; stem lookup, every placement pattern (青龙返首,
  飞鸟跌穴, 三奇临吉门, 六仪击刑, 三奇入墓, 日格, 时格, 日干/时干入墓) and the palace 克应
  consult it, and the centre's copy of the earth stem on the heaven layer is skipped. The
  centre's earth stem counts at 坤 for 青龙返首, 飞鸟跌穴, 日格 and 时格.
- 中宫寄坤: a 用神 in the centre is read at 坤 (marked `寄宫`), including the 求财 report;
  palace scores, 驿马 and void de-duplication key on the palace read. A centred 值符 is so
  scored at 坤 and the 值符入中 charge is dropped; 值使入中 keeps its −0.5.
- 坤 holds the centre's earth stem as a second earth stem (`地盘寄`); 坤's heaven stem adds
  its 克应 over it (`克应地寄`). 伏吟 and 反吟 still compare the outer ring only.
- 六仪击刑 tests the 仪 on the heaven plate.
- 门迫 is the door's element controlling the palace's element.
- 克应 table: 己 over 庚 is 刑格返名 (−1); 丁 over 己 is 火入勾陈.
- A stem over itself occurs only in a 伏吟 chart, scored by the 伏吟 pattern; its 克应 keeps
  the name at 0.

Event 求财 runs duanju's default single
moment path, which adds the 求财专项 report; the other events run `interpret` alone.
"""

import json
import os
import shutil
import subprocess
import sys
import tempfile
from datetime import datetime, timedelta
from pathlib import Path

# (file, old, new) substitutions applied to the temporary copy; each `old` must occur exactly
# once in its file.
REFERENCE_FIXES = [
    # The rotating star ring holds 天芮 at 坤; 天禽 of the centre lodges with it.
    ("qimen.py", 'STAR_R = list("蓬任沖輔英禽柱心")', 'STAR_R = list("蓬任沖輔英芮柱心")'),
    # A 禽 值符 rotates as 天芮, the star it lodges with.
    ("qimen.py", 'sstar = zfzs["值符星宮"][0].replace("芮", "禽")',
     'sstar = zfzs["值符星宮"][0].replace("禽", "芮")'),
    # 陰遁 turns the plates counter-clockwise: 坎 follows 艮 on the ring.
    ("qimen.py", 'YIN_ORDER = list("艮乾兌坤離巽震坎")', 'YIN_ORDER = list("艮坎乾兌坤離巽震")'),
    # A solar term begins at one absolute instant: with a city the term is read at the clock
    # time on Beijing time, passed in QIMEN_TERM_DT, while the pillars keep the solar moment.
    ("qimen.py", "import argparse\n", "import argparse\nimport os\n"),
    ("qimen.py",
     "    lunar = Solar.fromYmdHms(dt.year, dt.month, dt.day, dt.hour, dt.minute, 0).getLunar()",
     '    if "QIMEN_TERM_DT" in os.environ:\n'
     '        dt = datetime.strptime(os.environ["QIMEN_TERM_DT"], "%Y-%m-%d %H:%M")\n'
     "    lunar = Solar.fromYmdHms(dt.year, dt.month, dt.day, dt.hour, dt.minute, 0).getLunar()"),
    # 值符 in the centre with the 旬首仪 at 坤: the plate stays on the earth plate (伏吟).
    ("qimen.py", "new_list(a, a[-1])", 'new_list(a, earth.get("坤"))'),
    # 中五寄坤: the centre's earth stem rides with 天芮 as a second heaven stem (天盘寄) of the
    # palace where 天芮 lands; a 禽 值符 so keeps its 旬首仪 on the heaven plate.
    ("qimen.py", '        "天盘": sky,\n',
     '        "天盘": sky,\n'
     '        "天盘寄": {g: earth.get("中") for g, s in star.items() if s == "芮"},\n'),
    # Stem lookup reads the outer heaven plate, then the lodged stem, then the earth plate.
    ("duanju.py",
     '    for layer in ("天盘", "地盘"):\n'
     '        for gua, g in pan[layer].items():\n'
     '            if g == gan:\n'
     '                return gua\n',
     '    for gua, g in [*((k, v) for k, v in pan["天盘"].items() if k != "中"),\n'
     '                   *pan["天盘寄"].items(), *pan["地盘"].items()]:\n'
     '        if g == gan:\n'
     '            return gua\n'),
    # 青龙返首, 飞鸟跌穴 and 日干/时干入墓 find heaven stems the same way.
    ("duanju.py", "    sky_inv = {v: k for k, v in sky.items()}\n",
     '    sky_inv = {**{v: k for k, v in sky.items() if k != "中"},\n'
     '               **{v: k for k, v in pan["天盘寄"].items()}}\n'),
    # 日格/时格 also test the lodged stem.
    ("duanju.py", '    for gua, g in sky.items():\n        if g == "庚":\n',
     '    for gua, g in [*((k, v) for k, v in sky.items() if k != "中"),\n'
     '                   *pan["天盘寄"].items()]:\n'
     '        if g == "庚":\n'),
    # The lodged stem adds its own 克应 over the palace's earth stem.
    ("duanju.py", "    # 门迫：",
     '    lodged = pan["天盘寄"].get(gua)\n'
     '    ky_lodged = keying_of(lodged, c["地盘"]) if lodged else None\n'
     '    if ky_lodged and not (lodged == "庚" and c["地盘"] in\n'
     '                          (pan["干支"]["日"][0], pan["干支"]["时"][0])):\n'
     '        score += ky_lodged[1]\n'
     "    # 门迫："),
    ("duanju.py", '"克应": ky_name, ',
     '"克应": ky_name, **({"天盘寄": lodged, "克应寄": ky_lodged[0] if ky_lodged else None}\n'
     '                         if lodged else {}), '),
    # 六仪击刑 tests the 仪 on the heaven plate.
    ("duanju.py", "        if earth.get(gua) == yi:\n", "        if sky.get(gua) == yi:\n"),
    # 门迫 is the door's element controlling the palace's (门克宫).
    ("duanju.py", "    # 门迫：宫五行克门五行", "    # 门迫：门五行克宫五行"),
    ("duanju.py", "(GONG_WX[gua], MEN_WX.get(men)) in _KE", "(MEN_WX.get(men), GONG_WX[gua]) in _KE"),
    # 己 over 庚 is 刑格返名; 丁 over 己 is 火入勾陈 (己 over 丁 stays 朱雀入墓).
    ("duanju.py", '"丁": ("朱雀入墓", -1), "辛": ("游魂入墓", -1),',
     '"丁": ("朱雀入墓", -1), "庚": ("刑格返名", -1), "辛": ("游魂入墓", -1),'),
    ("duanju.py", '"己": ("朱雀入墓", -1), "庚": ("火炼真金", 1)',
     '"己": ("火入勾陈", -1), "庚": ("火炼真金", 1)'),
    # A stem over itself occurs only in a 伏吟 chart, which the 伏吟 pattern scores; its 克应
    # keeps the name at 0, as 青龙返首 and 飞鸟跌穴 do.
    ("duanju.py", '"戊": {"戊": ("伏吟", -1),', '"戊": {"戊": ("伏吟", 0),'),
    ("duanju.py", '"己": {"己": ("地户逢鬼", -1),', '"己": {"己": ("地户逢鬼", 0),'),
    ("duanju.py", '"丙": {"丙": ("月奇悖师", -1),', '"丙": {"丙": ("月奇悖师", 0),'),
    ("duanju.py", '"庚": {"庚": ("太白同宫(战格)", -1),', '"庚": {"庚": ("太白同宫(战格)", 0),'),
    ("duanju.py", '"壬": {"壬": ("蛇入地罗", -1),', '"壬": {"壬": ("蛇入地罗", 0),'),
    ("duanju.py", '"癸": {"癸": ("天网四张", -1),', '"癸": {"癸": ("天网四张", 0),'),
    # 中宫寄坤: a 用神 in the centre (a centred 值符, or 甲 hiding under it) is read at 坤,
    # marked `寄宫`; scores, 驿马 and void de-duplication key on the palace read (`宫`).
    ("duanju.py",
     '        rep = palace_report(pan, gua, month_wx) if gua else {"宫": None}\n'
     '        if gua and gua != "中":\n'
     '            rep["空亡"] = _linkong(gua, rep.get("旺相"), kong, active_zhi, rep)\n',
     '        read = "坤" if gua == "中" else gua\n'
     '        rep = palace_report(pan, read, month_wx) if gua else {"宫": None}\n'
     '        if gua:\n'
     '            rep["空亡"] = _linkong(read, rep.get("旺相"), kong, active_zhi, rep)\n'
     '            if read != gua:\n'
     '                rep["寄宫"] = read\n'),
    ("duanju.py", 'yong_gongs = {u["落宫"] for u in ys if u.get("落宫") and u["落宫"] != "中"}',
     'yong_gongs = {u["宫"] for u in ys if u.get("宫")}'),
    ("duanju.py", '        g = u.get("落宫")\n', '        g = u.get("宫")\n'),
    ("duanju.py", 'u.get("落宫") == ma_gong', 'u.get("宫") == ma_gong'),
    ("duanju.py", 'kong_gongs = {u["落宫"] for u in ys if u.get("空亡")}',
     'kong_gongs = {u["宫"] for u in ys if u.get("空亡")}'),
    # The 求财 report reads a centred day stem at 坤 as well.
    ("duanju.py", 'sheng_gua != "中" and day_gua != "中":', 'sheng_gua != "中":'),
    # Placement patterns read the lodged heaven stem too: 三奇临吉门, 六仪击刑, 三奇入墓.
    ("duanju.py", '    for gua, g in sky.items():\n        if g in "乙丙丁"',
     '    for gua, g in [*((k, v) for k, v in sky.items() if k != "中"),\n'
     '                   *pan["天盘寄"].items()]:\n'
     '        if g in "乙丙丁"'),
    ("duanju.py", "        if sky.get(gua) == yi:\n",
     '        if yi in (sky.get(gua), pan["天盘寄"].get(gua)):\n'),
    ("duanju.py", '    for gua, g in sky.items():\n        if g in QI_MU_GONG',
     '    for gua, g in [*((k, v) for k, v in sky.items() if k != "中"),\n'
     '                   *pan["天盘寄"].items()]:\n'
     '        if g in QI_MU_GONG'),
    # Earth-side checks count the centre's earth stem at 坤: 青龙返首, 飞鸟跌穴, 日格, 时格.
    ("duanju.py", "    earth_inv = {v: k for k, v in earth.items()}\n",
     '    earth_inv = {v: "坤" if k == "中" else k for k, v in earth.items()}\n'),
    ("duanju.py",
     "            e = earth.get(gua)\n            if e == day_gan:\n",
     '            es = [earth.get(gua)] + ([earth.get("中")] if gua == "坤" else [])\n'
     "            if day_gan in es:\n"),
    ("duanju.py", "            elif e == hour_gan:\n", "            elif hour_gan in es:\n"),
    # A centred 值符 is read and scored at 坤, so the 值符入中 charge is dropped.
    ("duanju.py",
     '    zhong_pen = -1.0 if pan["值符值使"]["值符星宮"][1] == "中" else 0.0\n', ""),
    ("duanju.py", "ma_bonus + zhong_pen + zhishi_pen", "ma_bonus + zhishi_pen"),
    ("duanju.py", '"值符入中": zhong_pen, ', ""),
    # 坤 holds the centre's earth stem as a second earth stem (地盘寄); the heaven stem adds its
    # 克应 over it (克应地寄). A lodged heaven stem at 坤 only occurs in 伏吟, over itself.
    ("duanju.py", "    # 门迫：门五行克宫五行",
     '    earth_lodged = pan["地盘"].get("中") if gua == "坤" else None\n'
     '    ky_earth = keying_of(c["天盘"], earth_lodged) if earth_lodged else None\n'
     '    if ky_earth and not (c["天盘"] == "庚" and earth_lodged in\n'
     '                         (pan["干支"]["日"][0], pan["干支"]["时"][0])):\n'
     '        score += ky_earth[1]\n'
     "    # 门迫：门五行克宫五行"),
    ("duanju.py", '"门迫": bool(men_po)',
     '**({"地盘寄": earth_lodged, "克应地寄": ky_earth[0] if ky_earth else None}\n'
     '           if earth_lodged else {}), "门迫": bool(men_po)'),
]


def corrected_copy(scripts: Path) -> Path:
    """Copies the reference scripts and applies REFERENCE_FIXES to the copy."""
    target = Path(tempfile.mkdtemp(prefix="qimen-ref-"))
    for name in ("qimen.py", "duanju.py"):
        shutil.copy(scripts / name, target / name)
    for name, old, new in REFERENCE_FIXES:
        path = target / name
        source = path.read_text(encoding="utf-8")
        if source.count(old) != 1:
            raise SystemExit(f"reference changed; cannot apply fix to {name}: {old}")
        path.write_text(source.replace(old, new), encoding="utf-8")
    return target

EVENTS = ["求财", "求官", "谋事", "出行", "婚姻", "疾病", "诉讼", "谒贵", "考试"]

# Moments chosen by scanning 2025–2026 so that every 遁/局/元 combination, every reachable
# 天盘 branch (值符 in 中宫, 禽 as 值符, 甲 hour, ordinary), 值使 in 中宫, every pattern,
# both 空亡 releases, 驿马 and every 求财 relation and 任财 grade occur at least once.
SCANNED = [
    "2025-01-10 14:21", "2025-01-17 09:38", "2025-01-20 08:46", "2025-01-26 13:30",
    "2025-02-14 18:15", "2025-02-21 07:04", "2025-02-26 05:05", "2025-03-05 05:13",
    "2025-04-11 20:56", "2025-05-03 18:21", "2025-05-19 20:44", "2025-05-20 22:36",
    "2025-06-16 18:02", "2025-06-20 09:20", "2025-06-24 07:06", "2025-07-01 07:14",
    "2025-07-09 07:37", "2025-07-27 18:35", "2025-08-06 22:42", "2025-08-10 09:09",
    "2025-08-14 21:28", "2025-08-26 16:23", "2025-09-06 17:31", "2025-09-21 18:02",
    "2025-09-23 20:09", "2025-09-24 01:00", "2025-10-14 09:14", "2025-11-14 10:31",
    "2025-11-20 13:38", "2025-11-21 20:21", "2025-12-21 13:18", "2025-12-28 03:44",
    "2025-12-28 11:49", "2026-01-16 00:24", "2026-01-22 22:55", "2026-02-07 04:17",
    "2026-02-18 03:48", "2026-03-06 11:02", "2026-03-29 16:47", "2026-03-31 10:49",
    "2026-04-21 03:08", "2026-05-30 03:11", "2026-06-07 08:25", "2026-07-11 15:18",
    "2026-07-16 06:51", "2026-08-14 20:34", "2026-08-17 19:42", "2026-09-07 15:15",
    "2026-09-25 22:59", "2026-10-18 01:15", "2026-10-24 02:45", "2026-10-28 19:55",
    "2026-11-28 21:12", "2026-12-02 23:49", "2026-12-06 11:53", "2026-12-09 15:52",
    "2026-12-10 16:07", "2026-12-12 06:55", "2026-12-26 18:30",
]

# Solar-term boundaries (冬至 2025-12-21 23:03:05 also falls in the late Zi hour; 夏至
# 2026-06-21 16:24:30 flips 阳遁 to 阴遁; 立春 2026-02-04 04:02:08), the 23:00 day change,
# and the anchors of the reference test suites.
BOUNDARIES = [
    "2025-12-21 23:02", "2025-12-21 23:04", "2026-06-21 16:24", "2026-06-21 16:25",
    "2026-02-04 04:01", "2026-02-04 04:03", "2026-07-24 22:59", "2026-07-24 23:00",
    "2026-07-24 23:30", "2026-07-25 00:30",
    "2026-07-24 18:00", "2024-06-15 14:30", "2026-07-17 22:00", "2020-01-10 08:00",
    "2026-07-01 00:00", "2026-07-01 04:00", "2026-07-01 06:00", "2026-07-01 08:00",
    "2026-07-01 20:00", "2026-07-02 00:00", "2026-07-02 04:00", "2026-07-03 00:00",
    "2026-07-03 04:00", "2026-07-03 08:00", "2026-07-04 00:00", "2026-07-05 16:00",
    "2026-07-09 00:00", "2025-01-02 02:30",
]

# Moments judged for every supported event.
ALL_EVENTS = [
    "2026-07-24 18:00", "2026-07-09 00:00", "2025-11-21 20:21", "2025-09-23 20:09",
    "2026-01-22 22:55", "2026-03-31 10:49", "2025-12-28 03:44", "2026-10-24 02:45",
    "2025-07-27 18:35", "2026-12-10 16:07", "2025-05-19 20:44", "2026-07-03 04:00",
]

# True-solar-time cases: [clock, city, apparent]. 北京 at 00:00 moves back into the
# previous day's late Zi hour, which 奇门 assigns to the next day.
SOLAR = [
    ["2026-07-24 00:00", "北京", False],
    ["2026-07-24 18:00", "乌鲁木齐", True],
    ["2026-02-04 04:10", "上海", True],
    ["2025-11-21 20:21", "东京", False],
    ["2026-03-31 10:49", "纽约", True],
]


def uv_json(script: Path, args: list[str], term_dt: str | None = None) -> dict:
    """Runs a reference script; `term_dt` sets the moment its solar term is read at."""
    cmd = ["uv", "run", "--no-project", "--with", "lunar-python", "python", str(script), *args]
    env = {k: v for k, v in os.environ.items() if k != "QIMEN_TERM_DT"}
    if term_dt is not None:
        env["QIMEN_TERM_DT"] = term_dt
    out = subprocess.run(cmd, check=True, capture_output=True, text=True, env=env)
    return json.loads(out.stdout)


def beijing_time(bazi: Path, clock: str, city: str) -> str:
    """The clock time at `city` on Beijing time (UTC+8), through the city's civil meridian."""
    code = (f"import sys; sys.path.insert(0, {str(bazi.parent)!r}); import bazi; "
            f"print(bazi.resolve_city({city!r})[2])")
    cmd = ["uv", "run", "--no-project", "--with", "lunar-python", "python", "-c", code]
    meridian = float(subprocess.run(cmd, check=True, capture_output=True, text=True).stdout)
    at = datetime.strptime(clock, "%Y-%m-%d %H:%M") - timedelta(minutes=(meridian - 120) * 4)
    return at.strftime("%Y-%m-%d %H:%M")


def solar_time(bazi: Path, clock: str, city: str, apparent: bool) -> str:
    """True solar time `YYYY-MM-DD HH:MM:SS` of a clock time at `city`, as bazi.py computes it."""
    date, hm = clock.split(" ")
    y, mo, d = date.split("-")
    h, mi = hm.split(":")
    args = ["natal", "--year", y, "--month", mo, "--day", d, "--hour", h, "--minute", mi,
            "--city", city]
    if apparent:
        args.append("--apparent-solar")
    return uv_json(bazi, args)["真太阳时"]


def case(scripts: Path, moment: str, events: list[str], extra: dict,
         term_dt: str | None = None) -> dict:
    return {
        **extra,
        "moment": moment,
        "chart": uv_json(scripts / "qimen.py", ["--dt", moment], term_dt),
        "judgements": {
            e: uv_json(scripts / "duanju.py", ["--dt", moment, "--event", e], term_dt)
            for e in events
        },
    }


def main() -> None:
    scripts, bazi = corrected_copy(Path(sys.argv[1])), Path(sys.argv[2])
    moments = sorted(set(SCANNED) | set(BOUNDARIES))
    cases = [
        case(scripts, m, EVENTS if m in ALL_EVENTS else ["求财"], {"clock": m}) for m in moments
    ]
    for clock, city, apparent in SOLAR:
        moment = solar_time(bazi, clock, city, apparent)
        extra = {"clock": clock, "city": city, "apparent": apparent}
        cases.append(case(scripts, moment, ["求财"], extra, beijing_time(bazi, clock, city)))
    target = Path(__file__).resolve().parent.parent / "test" / "fixtures" / "qimen-golden.json"
    target.write_text(json.dumps({"cases": cases}, ensure_ascii=False, indent=1) + "\n",
                      encoding="utf-8")
    print(f"wrote {target} ({len(cases)} cases)")


if __name__ == "__main__":
    main()
