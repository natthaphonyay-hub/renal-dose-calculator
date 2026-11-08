#!/usr/bin/env python3
"""
ตัวคำนวณแยก Renal Dose Calculator เขียนจากสเปก ../../01-สเปกกติกาคำนวณ.md อย่างเดียว ไม่ได้ดูโค้ดหน้าเว็บ
คิดด้วย Decimal ความละเอียด 60 หลัก (หน้าเว็บคิดด้วยทศนิยมของเครื่อง) ปัดครึ่งขึ้นแบบตรงตัว
จัดแถวด้วยวิธีต่างจากหน้าเว็บ: หาแถวที่ค่าอยู่ แล้วถ้าไม่มี หาแถวบนที่ขอบล่างใกล้ที่สุดกับแถวล่างที่ขอบบนใกล้ที่สุด

ผลออกในรูปเดียวกับ summarize() ใน run-engine.mjs เพื่อให้ fuzz.py เทียบได้
"""
from decimal import Decimal as D, getcontext, ROUND_HALF_UP, ROUND_FLOOR

getcontext().prec = 60
INTERVALS = (4, 6, 8, 12, 24, 48)

# แถวค่าไตตามสเปกข้อ 6 (ป้าย, ขอบล่าง, รวมขอบล่าง, ขอบบน, รวมขอบบน) None = ไม่มีขอบ
BANDS = {
    "cefazolin": [("R1", 55, True, None, True), ("R2", 35, True, 54, True), ("R3", 11, True, 34, True), ("R4", None, True, 10, True)],
    "ceftazidime": [("R0", 50, False, None, True), ("R1", 31, True, 50, True), ("R2", 16, True, 30, True), ("R3", 6, True, 15, True), ("R4", None, True, 5, False)],
    "acyclovir": [("R1", 50, False, None, True), ("R2", 25, True, 50, True), ("R3", 10, True, 25, True), ("R4", 0, True, 10, True)],
    "amoxclav": [("R1", 30, False, None, True), ("R2", 10, True, 30, True), ("R3", None, True, 10, False)],
}


def dec(x):
    return D(str(x))


def half_up(x, places=1):
    q = D(1).scaleb(-places)
    return x.quantize(q, rounding=ROUND_HALF_UP)


def round_step(x, step):
    return (x / step).quantize(D(1), rounding=ROUND_HALF_UP) * step


def num_out(x):
    """แปลงเป็นตัวเลขของ JSON แบบเดียวกับ JavaScript (จำนวนเต็มไม่มี .0)"""
    if x is None:
        return None
    f = float(x)
    return int(f) if f == int(f) else f


def inside(x, b):
    _, lo, lo_in, hi, hi_in = b
    if lo is not None and (x < lo or (x == lo and not lo_in)):
        return False
    if hi is not None and (x > hi or (x == hi and not hi_in)):
        return False
    return True


def bands_of(x, drug):
    bands = BANDS[drug]
    hit = [b for b in bands if inside(x, b)]
    if len(hit) == 1:
        return "one", [hit[0][0]]
    if len(hit) == 2:
        hit.sort(key=lambda b: -(b[1] if b[1] is not None else -1))
        return "overlap", [hit[0][0], hit[1][0]]
    # ตกช่องว่าง: แถวบน = แถวที่ค่าต่ำกว่าขอบล่าง เลือกขอบล่างต่ำสุด แถวล่าง = แถวที่ค่าสูงกว่าขอบบน เลือกขอบบนสูงสุด
    up = [b for b in bands if b[1] is not None and (x < b[1] or (x == b[1] and not b[2]))]
    dn = [b for b in bands if b[3] is not None and (x > b[3] or (x == b[3] and not b[4]))]
    upper = min(up, key=lambda b: b[1])
    lower = max(dn, key=lambda b: b[3])
    return "gap", [upper[0], lower[0]]


def kidney(p):
    dial = p.get("dial") or "none"
    sex, age, w, h, scr = p.get("sex"), p.get("age"), p.get("weight"), p.get("height"), p.get("scr")
    def ok_num(v):
        return isinstance(v, (int, float)) and v == v
    errs = False
    if sex not in ("M", "F"):
        errs = True
    if not ok_num(age):
        errs = True
    elif float(age) == int(age) and 0 <= age < 18:
        return {"ok": False, "unsupported": True}
    elif float(age) != int(age) or age > 110:
        errs = True
    if not ok_num(w) or w < 20 or w > 250:
        errs = True
    if not ok_num(h) or h < 120 or h > 220:
        errs = True
    if dial == "none" and (not ok_num(scr) or scr < 0.2 or scr > 20):
        errs = True
    if errs:
        return {"ok": False, "unsupported": False}
    W, H = dec(w), dec(h)
    ibw = (D(50) if sex == "M" else D("45.5")) + D("2.3") * (H / D("2.54") - 60)
    adj = ibw + D("0.4") * (W - ibw)
    bmi = half_up(W / (H / 100) ** 2)  # แบ่งกลุ่มด้วย BMI ที่แสดงบนจอ ทศนิยม 1 ตำแหน่ง (สเปก 4.2)
    if bmi < D("18.5"):
        key, cw = "TBW", W
    elif bmi < 25:
        key, cw = "IBW", ibw
    else:
        key, cw = "AdjBW", adj
    k = {"ok": True, "dial": dial, "w": W, "ibw": ibw, "adj": adj, "bmi": bmi, "obese": bmi >= 30, "key": key}
    if dial != "none":
        k.update(crcl=None, crclNorm=None)
        return k
    raw = (140 - int(age)) * cw / (72 * dec(scr)) * (D("0.85") if sex == "F" else 1)
    bsa = (H * W / 3600).sqrt()
    k.update(crcl=half_up(raw), crclNorm=half_up(raw * D("1.73") / bsa))
    return k


def pick(sel, key, values, rec):
    v = (sel or {}).get(key)
    return v if v in values else rec


def drug(item, k):
    """คืน dict แบบ summarize()"""
    u, o = item.get("usual") or {}, item.get("ordered") or {}
    ud, uq, od, oq = u.get("d"), u.get("q"), o.get("d"), o.get("q")
    def pos(v):
        return isinstance(v, (int, float)) and v == v and v > 0
    if not (pos(ud) and uq in INTERVALS and pos(od) and oq in INTERVALS):
        return {"ok": False}
    ud, od = dec(ud), dec(od)
    sel = item.get("sel") or {}
    dial = k["dial"]
    choices, flags, cautions = [], [], 0
    reg = None  # dict dose q load hd
    nodata = False
    name = item["drug"]

    def R(dose, q, load=None, hd=None):
        return {"dose": dose, "q": q, "load": load, "hd": hd}

    def row_choice(x, drugkey):
        kind, rows = bands_of(x, drugkey)
        if kind == "one":
            return rows[0]
        v = pick(sel, "row", ("upper", "lower"), "upper")
        choices.append(["row", v, ["upper", "lower"]])
        return rows[0] if v == "upper" else rows[1]

    o_daily = od * 24 / oq
    if name == "ceftriaxone":
        reg = R(ud, uq)
        sev = dial != "none" or k["crcl"] <= 15
        r30 = dial != "none" or k["crcl"] <= 30
        if o_daily > 4000:
            flags.append("red")
        if item.get("liver") and r30 and o_daily > 2000:
            reg = R(D(2000), 24)
        if o_daily > 2000 and sev:
            cautions += 1
    elif name == "cefazolin":
        if dial == "HD":
            v = pick(sel, "path", ("idsa", "fogel"), "idsa")
            choices.append(["path", v, ["idsa", "fogel"]])
            dose = round_step(20 * k["w"], 250) if v == "idsa" else (D(750) if k["w"] < 50 else D(1000))
            reg = R(dose, None, hd="after")
        elif dial != "none":
            reg = R(D(1000), 12)
        else:
            row = row_choice(k["crcl"], "cefazolin")
            reg = {"R1": R(ud, uq), "R2": R(ud, max(uq, 8)), "R3": R(ud / 2, 12), "R4": R(ud / 2, 24)}[row]
    elif name == "ceftazidime":
        if dial == "HD":
            reg = R(D(1000), None, load=D(1000), hd="after")
        elif dial != "none":
            reg = R(D(500), 24, load=D(1000))
        else:
            auto = ud * 24 / uq >= 6000
            severe = item.get("severe") if item.get("severe") in (True, False) else auto
            row = row_choice(k["crcl"], "ceftazidime")
            if row == "R0":
                reg = R(ud, uq)
            else:
                d, q = {"R1": (1000, 12), "R2": (1000, 24), "R3": (500, 24), "R4": (500, 48)}[row]
                d = D(d) * (D("1.5") if severe else 1)
                reg = R(ud, uq) if ud * 24 / uq < d * 24 / q else R(d, q)
    elif name == "acyclovir":
        dw = k["w"]
        if k["obese"]:
            v = pick(sel, "wt", ("adj", "ibw"), "adj")
            choices.append(["wt", v, ["adj", "ibw"]])
            dw = k["adj"] if v == "adj" else k["ibw"]
        if dial == "HD":
            v = pick(sel, "path", ("label", "shc"), "label")
            choices.append(["path", v, ["label", "shc"]])
            reg = R(round_step(ud * D("0.5") * dw, 50), 24, hd="extraAfter" if v == "label" else "afterOnHD")
        elif dial != "none":
            reg = R(round_step(ud * D("0.5") * dw, 50), 24)
        else:
            kn, rn = bands_of(k["crclNorm"], "acyclovir")
            kr, rr = bands_of(k["crcl"], "acyclovir")
            if kn == "one" and kr == "one" and rn[0] == rr[0]:
                x = k["crclNorm"]
            else:
                v = pick(sel, "ctype", ("norm", "raw"), "norm")
                choices.append(["ctype", v, ["norm", "raw"]])
                x = k["crclNorm"] if v == "norm" else k["crcl"]
            row = row_choice(x, "acyclovir")
            pct, q = {"R1": (1, 8), "R2": (1, 12), "R3": (1, 24), "R4": (D("0.5"), 24)}[row]
            reg = R(round_step(ud * pct * dw, 50), q)
        if od > 20 * dw:
            flags.append("red")
    elif name in ("amoxclav_iv", "amoxclav_po"):
        iv = name == "amoxclav_iv"
        if dial == "HD":
            reg = R(D(500), 24, load=D(1000), hd="endExtra") if iv else R(D(500), 24, hd="duringEnd")
        elif dial != "none":
            if iv:
                nodata = True
            else:
                reg = R(D(250), 12)
        else:
            row = row_choice(k["crcl"], "amoxclav")
            if row == "R1":
                reg = R(ud, uq)
            elif row == "R2":
                reg = R(D(500), 12, load=D(1000) if iv else None)
            else:
                reg = R(D(500), 24, load=D(1000) if iv else None)
        if not iv and od == 875 and (dial != "none" or k["crcl"] < 30):
            flags.append("yellow")

    ed = item.get("edit")
    if reg is not None and ed and pos(ed.get("d")) and (reg["q"] is None or ed.get("q") in INTERVALS):
        reg = dict(reg, dose=dec(ed["d"]), q=None if reg["q"] is None else ed["q"])

    # เทียบคำสั่ง สเปกข้อ 6.6
    if reg is None or reg["dose"] is None:
        status = "none"
    elif reg["q"] is None or reg["hd"] is not None:
        status = "review"
    elif od == reg["dose"] and oq == reg["q"]:
        status = "ok"
    else:
        a, b = od * 24 / oq, reg["dose"] * 24 / reg["q"]
        status = "high" if a > b * D("1.001") else "low" if a < b * D("0.999") else "split"
    return {
        "ok": True, "nodata": nodata,
        "dose": num_out(reg["dose"]) if reg else None, "q": reg["q"] if reg else None,
        "load": num_out(reg["load"]) if reg else None, "hd": reg["hd"] if reg else None,
        "status": status, "choices": choices, "flags": flags, "cautions": cautions,
    }


def scenario(s):
    k = kidney(s["p"])
    if not k["ok"]:
        return {"k": {"ok": False, "unsupported": k["unsupported"]}}
    kk = {"ok": True, "crcl": num_out(k["crcl"]), "crclNorm": num_out(k["crclNorm"]), "key": k["key"], "obese": k["obese"]}
    if not s.get("item"):
        return {"k": kk}
    return {"k": kk, "r": drug(dict(s["item"], liver=s["item"].get("liver", False)), k)}
