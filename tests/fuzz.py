#!/usr/bin/env python3
"""สุ่มเทียบตัวคำนวณจริง (index.html ผ่าน node tests/run-engine.mjs) กับตัวคำนวณแยก tests/reference.py

ใช้: python3 -I tests/fuzz.py [จำนวนโจทย์สุ่ม=40000] [seed=20261108]
ไล่ครบ: การจัดแถวของยาทุกตาราง ค่าไต 0.0 ถึง 200.0 ทีละ 0.1
สุ่ม: เพศ อายุ น้ำหนัก ส่วนสูง SCr การฟอกไต ยา ขนาดปกติ ขนาดที่สั่ง ตัวเลือกทุกแบบ ติ๊กติดเชื้อรุนแรง ตับผิดปกติ การแก้ขนาด
       และค่านอกช่วงบางส่วน เพื่อดูว่าทั้งสองตัวปฏิเสธเหมือนกัน
ล้มเมื่อ: ผลไม่ตรงแม้แต่ข้อเดียว หรือโจทย์ที่ควรคำนวณได้กลับคำนวณไม่ได้
"""
import json
import pathlib
import random
import subprocess
import sys
import tempfile

HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import reference as ref  # noqa: E402

N = int(sys.argv[1]) if len(sys.argv) > 1 else 40000
SEED = int(sys.argv[2]) if len(sys.argv) > 2 else 20261108
rnd = random.Random(SEED)
INTERVALS = [4, 6, 8, 12, 24, 48]
DRUGS = ["ceftriaxone", "cefazolin", "ceftazidime", "acyclovir", "amoxclav_iv", "amoxclav_po"]
SEL = {"row": ["upper", "lower", "x"], "ctype": ["norm", "raw", "x"], "wt": ["adj", "ibw", "x"], "path": ["idsa", "fogel", "label", "shc", "x"]}


def r(lo, hi, step):
    n = int(round((hi - lo) / step))
    return round(lo + rnd.randint(0, n) * step, 4)


def dose_for(drug, usual):
    if drug == "acyclovir":
        return rnd.choice([5, 10, 7.5, 15, 10, 5]) if usual else r(100, 1600, 50)
    if drug == "amoxclav_iv":
        return rnd.choice([1000, 1000, 500, 1200, 2000])
    if drug == "amoxclav_po":
        return rnd.choice([500, 875, 250, 1000, 875])
    if drug == "ceftriaxone":
        return rnd.choice([1000, 2000, 500, 1500, 2500, 3000])
    return rnd.choice([250, 500, 750, 1000, 1500, 2000, 1000, 2000])


def make_case():
    dial = rnd.choices(["none", "HD", "CAPD", "APD"], [60, 16, 12, 12])[0]
    def pick_value(good, *bad_options):
        return rnd.choice(bad_options) if rnd.random() < 0.03 else good
    p = {"sex": rnd.choice(["M", "F"]),
         "age": pick_value(r(18, 100, 1), r(10, 17, 1), r(101, 115, 1), 30.5),
         "weight": pick_value(r(25, 200, 0.1), r(10, 19.9, 0.1), r(250.1, 300, 0.1)),
         "height": pick_value(rnd.choice([r(125, 205, 0.1), r(140, 185, 1), r(140, 185, 1)]), r(100, 119, 1), r(221, 240, 1)),
         "scr": pick_value(rnd.choice([r(0.3, 3, 0.01), r(0.3, 12, 0.01)]), r(0.05, 0.19, 0.01), r(20.01, 30, 0.01)),
         "dial": dial}
    if rnd.random() < 0.01:
        p["sex"] = None
    drug = rnd.choice(DRUGS)
    item = {"drug": drug,
            "usual": {"d": dose_for(drug, True), "q": rnd.choice(INTERVALS)},
            "ordered": {"d": dose_for(drug, False), "q": rnd.choice(INTERVALS)},
            "sel": {k: rnd.choice(v) for k, v in SEL.items() if rnd.random() < 0.5},
            "severe": rnd.choice([None, None, True, False]),
            "liver": rnd.random() < 0.3,
            "edit": None}
    if rnd.random() < 0.2:
        item["usual"]["q"] = 8
    if rnd.random() < 0.1:
        item["edit"] = {"d": r(100, 2000, 50), "q": rnd.choice(INTERVALS)}
    if rnd.random() < 0.02:
        item["ordered"]["d"] = 0
    return {"p": p, "item": item}


def norm(res):
    """เรียงตัวเลือกก่อนเทียบ (ลำดับบนจอไม่ใช่เรื่องที่สเปกกำหนด)"""
    if "r" in res and res["r"].get("ok"):
        res = json.loads(json.dumps(res))
        res["r"]["choices"] = sorted(res["r"]["choices"])
    return res


def run_engine(cases):
    with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False, encoding="utf-8") as f:
        json.dump(cases, f)
        path = f.name
    out = subprocess.run(["node", str(HERE / "run-engine.mjs"), path], capture_output=True, text=True, check=True)
    pathlib.Path(path).unlink()
    return json.loads(out.stdout)


def main():
    bad = 0
    # 1 จัดแถวทุกตาราง ค่าไต 0.0 ถึง 200.0
    grid = [{"kind": "classify", "rows": rows, "x": i / 10} for rows in ref.BANDS for i in range(0, 2001)]
    eng = run_engine(grid)
    for g, e in zip(grid, eng):
        kind, ids = ref.bands_of(ref.D(str(g["x"])), g["rows"])
        if e["c"] != [kind, ids]:
            bad += 1
            if bad <= 10:
                print("จัดแถวไม่ตรง", g, e["c"], [kind, ids])
    print(f"จัดแถว {len(grid):,} ค่า ไม่ตรง {bad}")

    # 2 สุ่มโจทย์เต็ม
    cases = [make_case() for _ in range(N)]
    eng = []
    for i in range(0, N, 5000):
        eng += run_engine(cases[i:i + 5000])
    mism = 0
    computed = {"none": 0, "HD": 0, "CAPD": 0, "APD": 0}
    status_count, choice_count, flag_count = {}, 0, 0
    for c, e in zip(cases, eng):
        rr = ref.scenario(c)
        if norm(e) != norm(rr):
            mism += 1
            if mism <= 10:
                print("ไม่ตรง", json.dumps(c, ensure_ascii=False), "\n  engine", json.dumps(norm(e), ensure_ascii=False), "\n  ref   ", json.dumps(norm(rr), ensure_ascii=False))
        if rr["k"]["ok"] and rr.get("r", {}).get("ok"):
            computed[c["p"]["dial"]] += 1
            st = rr["r"]["status"]
            status_count[st] = status_count.get(st, 0) + 1
            choice_count += len(rr["r"]["choices"]) > 0
            flag_count += len(rr["r"]["flags"]) > 0
    total = sum(computed.values())
    print(f"สุ่ม {N:,} โจทย์ คำนวณได้ {total:,} (ไม่ฟอก {computed['none']:,} HD {computed['HD']:,} CAPD {computed['CAPD']:,} APD {computed['APD']:,})")
    print(f"ผลเทียบคำสั่ง {status_count} มีตัวเลือกให้เภสัช {choice_count:,} มีป้ายเตือน {flag_count:,}")
    print(f"ไม่ตรง {mism}")
    if bad or mism or total < N * 0.6:
        print("ล้ม")
        sys.exit(1)
    print("ผ่าน")


if __name__ == "__main__":
    main()
