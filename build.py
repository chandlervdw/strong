#!/usr/bin/env python3
"""
build.py — turn a Strong app CSV export into a compact data.js for the static site.

Reads:  strong_workouts.csv  (Strong -> Settings -> Export Data)
Writes: data.js              (window.STRONG_DATA = {...})

Pure standard library. Run:  python3 build.py
"""

import csv
import json
import re
import datetime
from collections import defaultdict, Counter

CSV_PATH = "strong_workouts.csv"
OUT_PATH = "data.js"

BIG3 = [
    ("squat", "Squat (Barbell)", "Squat"),
    ("bench", "Bench Press (Barbell)", "Bench Press"),
    ("deadlift", "Deadlift (Barbell)", "Deadlift"),
]

CURRENT_WINDOW_DAYS = 90      # "current" = best estimate within this trailing window
E1RM_REP_CAP = 10            # ignore very high-rep sets for 1RM estimation (Epley gets unreliable)
EXPLORER_MIN_SETS = 5        # exercises with at least this many sets appear in the explorer


# ----------------------------- helpers -----------------------------

def pf(x):
    try:
        return float(x)
    except (TypeError, ValueError):
        return 0.0


def pdate(s):
    try:
        return datetime.datetime.strptime(s, "%Y-%m-%d %H:%M:%S")
    except (TypeError, ValueError):
        return None


def e1rm(weight, reps):
    """Epley estimated 1-rep max. Only trust low-rep sets."""
    if weight <= 0 or reps <= 0 or reps > E1RM_REP_CAP:
        return 0.0
    return weight * (1 + reps / 30.0)


def dur_to_min(s):
    if not s:
        return 0
    h = re.search(r"(\d+)\s*h", s)
    m = re.search(r"(\d+)\s*m", s)
    return (int(h.group(1)) * 60 if h else 0) + (int(m.group(1)) if m else 0)


def category(name):
    n = name.lower()
    # explicit equipment tag first (Strong wraps it in parentheses)
    if "(barbell)" in n:
        return "Barbell"
    if "(dumbbell)" in n:
        return "Dumbbell"
    if "(cable)" in n:
        return "Cable"
    if "(machine)" in n or "(smith machine)" in n:
        return "Machine"
    bw = ("pull up", "pull-up", "chin up", "chin-up", "dip", "push up", "push-up",
          "sit up", "sit-up", "plank", "muscle up", "hanging", "ghd", "knee raise",
          "leg raise", "pistol", "hyperextension", "back extension")
    if any(k in n for k in bw):
        return "Bodyweight"
    # keyword fallback
    if "barbell" in n:
        return "Barbell"
    if "dumbbell" in n:
        return "Dumbbell"
    if any(k in n for k in ("cable", "pushdown", "crossover", "pulldown", "pull down", "face pull")):
        return "Cable"
    if any(k in n for k in ("machine", "leg press", "leg extension", "leg curl", "pec deck", "hack")):
        return "Machine"
    return "Other"


def month_key(dt):
    return f"{dt.year:04d}-{dt.month:02d}"


def all_months(dmin, dmax):
    out = []
    y, m = dmin.year, dmin.month
    while (y, m) <= (dmax.year, dmax.month):
        out.append(f"{y:04d}-{m:02d}")
        m += 1
        if m > 12:
            m = 1
            y += 1
    return out


# ----------------------------- load -----------------------------

def load(path):
    rows = []
    with open(path, newline="", encoding="utf-8") as f:
        for r in csv.DictReader(f):
            rows.append(r)
    return rows


# ----------------------------- build -----------------------------

def build(rows):
    dts = [pdate(r["Date"]) for r in rows]
    dts = [d for d in dts if d]
    dmin, dmax = min(dts), max(dts)
    years = round((dmax - dmin).days / 365.25, 1)

    # ---- totals ----
    total_volume = sum(pf(r["Weight"]) * pf(r["Reps"]) for r in rows)
    total_reps = sum(pf(r["Reps"]) for r in rows)
    sessions = {}
    for r in rows:
        d = r["Date"]
        if d not in sessions:
            sessions[d] = dur_to_min(r["Duration"])
    total_hours = round(sum(sessions.values()) / 60)
    exercise_names = set(r["Exercise Name"] for r in rows)

    def heaviest_single(name):
        s = [r for r in rows if r["Exercise Name"] == name and pf(r["Reps"]) == 1 and pf(r["Weight"]) > 0]
        if not s:
            return None
        top = max(s, key=lambda r: pf(r["Weight"]))
        return {"w": round(pf(top["Weight"])), "reps": 1, "date": pdate(top["Date"]).strftime("%Y-%m-%d")}

    pl_total = sum((heaviest_single(full) or {"w": 0})["w"] for _, full, _ in BIG3)

    totals = {
        "volumeLb": round(total_volume),
        "reps": round(total_reps),
        "sessions": len(sessions),
        "exercises": len(exercise_names),
        "hours": total_hours,
        "sets": len(rows),
        "years": years,
        "plTotal": pl_total,
    }

    # ---- big 3 PR cards ----
    big3 = []
    for key, full, label in BIG3:
        sets = [r for r in rows if r["Exercise Name"] == full and pf(r["Weight"]) > 0 and pf(r["Reps"]) > 0]
        if not sets:
            continue
        scored = [(e1rm(pf(r["Weight"]), pf(r["Reps"])), r) for r in sets]
        scored = [(v, r) for v, r in scored if v > 0]
        best_v, best_r = max(scored, key=lambda x: x[0])

        # current = best est-1RM within trailing window (widen if a quiet stretch)
        cur_v, cur_r = 0.0, None
        for win in (CURRENT_WINDOW_DAYS, 180, 365, 100000):
            cutoff = dmax - datetime.timedelta(days=win)
            pool = [(v, r) for v, r in scored if pdate(r["Date"]) >= cutoff]
            if pool:
                cur_v, cur_r = max(pool, key=lambda x: x[0])
                break

        hs = heaviest_single(full)
        last_date = max(pdate(r["Date"]) for r in sets).strftime("%Y-%m-%d")
        pct = round(cur_v / best_v * 100) if best_v else 0

        big3.append({
            "key": key,
            "name": label,
            "bestE1rm": round(best_v),
            "bestSet": {"w": round(pf(best_r["Weight"])), "reps": round(pf(best_r["Reps"])),
                        "date": pdate(best_r["Date"]).strftime("%Y-%m-%d")},
            "heaviestSingle": hs,
            "current": round(cur_v),
            "currentSet": {"w": round(pf(cur_r["Weight"])), "reps": round(pf(cur_r["Reps"])),
                           "date": pdate(cur_r["Date"]).strftime("%Y-%m-%d")} if cur_r else None,
            "pct": pct,
            "lbToGo": max(0, round(best_v - cur_v)),
            "lastDate": last_date,
        })

    # ---- progression: monthly best est-1RM per big-3 lift, aligned to a shared month axis ----
    months = all_months(dmin, dmax)
    progression = {"months": months, "series": {}, "peak": {}}
    for key, full, label in BIG3:
        monthly = defaultdict(float)
        for r in rows:
            if r["Exercise Name"] != full:
                continue
            v = e1rm(pf(r["Weight"]), pf(r["Reps"]))
            if v <= 0:
                continue
            mk = month_key(pdate(r["Date"]))
            if v > monthly[mk]:
                monthly[mk] = v
        series = [round(monthly[m]) if m in monthly else None for m in months]
        progression["series"][key] = series
        # index of peak (for annotation)
        peak_idx, peak_val = -1, 0
        for i, v in enumerate(series):
            if v and v > peak_val:
                peak_val, peak_idx = v, i
        progression["peak"][key] = {"index": peak_idx, "value": peak_val}

    # ---- volume by year ----
    vol_year = defaultdict(float)
    sess_year = defaultdict(set)
    for r in rows:
        d = pdate(r["Date"])
        vol_year[d.year] += pf(r["Weight"]) * pf(r["Reps"])
        sess_year[d.year].add(r["Date"])
    volume_by_year = [{"year": y, "volume": round(vol_year[y]), "sessions": len(sess_year[y])}
                      for y in sorted(vol_year)]

    # ---- consistency calendar: last ~53 weeks of training days ----
    cutoff = dmax - datetime.timedelta(days=371)
    day_sets = Counter()
    for r in rows:
        d = pdate(r["Date"])
        if d >= cutoff:
            day_sets[d.strftime("%Y-%m-%d")] += 1
    calendar = {
        "through": dmax.strftime("%Y-%m-%d"),
        "maxSets": max(day_sets.values()) if day_sets else 0,
        "days": dict(day_sets),
    }

    # ---- exercise explorer ----
    by_ex = defaultdict(list)
    for r in rows:
        by_ex[r["Exercise Name"]].append(r)
    exercises = []
    for name, ex_rows in by_ex.items():
        if len(ex_rows) < EXPLORER_MIN_SETS:
            continue
        scored = [(e1rm(pf(r["Weight"]), pf(r["Reps"])), r) for r in ex_rows]
        scored = [(v, r) for v, r in scored if v > 0]
        best_e = round(max((v for v, _ in scored), default=0))
        weighted = [r for r in ex_rows if pf(r["Weight"]) > 0 and pf(r["Reps"]) > 0]
        if weighted:
            top = max(weighted, key=lambda r: pf(r["Weight"]))
            top_set = {"w": round(pf(top["Weight"])), "reps": round(pf(top["Reps"]))}
        else:
            top_set = None
        last_date = max(pdate(r["Date"]) for r in ex_rows).strftime("%Y-%m-%d")
        exercises.append({
            "name": name,
            "category": category(name),
            "sets": len(ex_rows),
            "bestE1rm": best_e,
            "topSet": top_set,
            "lastDate": last_date,
        })
    exercises.sort(key=lambda e: e["sets"], reverse=True)

    return {
        "meta": {
            "startDate": dmin.strftime("%Y-%m-%d"),
            "endDate": dmax.strftime("%Y-%m-%d"),
            "years": years,
            "generatedAt": datetime.date.today().strftime("%Y-%m-%d"),
        },
        "totals": totals,
        "big3": big3,
        "progression": progression,
        "volumeByYear": volume_by_year,
        "calendar": calendar,
        "exercises": exercises,
    }


def main():
    rows = load(CSV_PATH)
    data = build(rows)
    payload = json.dumps(data, separators=(",", ":"))
    with open(OUT_PATH, "w", encoding="utf-8") as f:
        f.write("// Generated by build.py — do not edit by hand.\n")
        f.write("window.STRONG_DATA = " + payload + ";\n")

    t = data["totals"]
    print(f"Wrote {OUT_PATH}  ({len(payload):,} bytes)")
    print(f"  range      : {data['meta']['startDate']} -> {data['meta']['endDate']} ({t['years']} yrs)")
    print(f"  volume     : {t['volumeLb']:,} lb   reps: {t['reps']:,}   sessions: {t['sessions']:,}")
    print(f"  hours      : {t['hours']:,}   exercises: {t['exercises']}   PL total: {t['plTotal']} lb")
    for b in data["big3"]:
        print(f"  {b['name']:<12}: best e1RM {b['bestE1rm']}  heaviest {b['heaviestSingle']['w'] if b['heaviestSingle'] else '-'}  "
              f"current {b['current']} ({b['pct']}%)  {b['lbToGo']} lb to go")
    print(f"  explorer   : {len(data['exercises'])} exercises")


if __name__ == "__main__":
    main()
