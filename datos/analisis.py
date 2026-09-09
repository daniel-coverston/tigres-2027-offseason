# -*- coding: utf-8 -*-
"""Genera data.json con todo lo que consume el dashboard."""
import json, os, statistics as st
from prep import *

EQ = "Tigres"
YEARS = (2024, 2025, 2026)
HIT_POS = ["C", "1B", "2B", "3B", "SS", "OF", "DH"]
PIT_POS = ["SP", "RP"]

def wavg(rows, val, w):
    tot = sum(r[w] for r in rows)
    return sum(r[val] * r[w] for r in rows) / tot if tot else 0.0

# ---------------------------------------------------------------- datos base
_H0 = {y: [d for d in cargar_bateo(y) if califica(d, "hit")] for y in YEARS}
# Posiciones raras ("X" = utility sin posicion clara): se apartan, no se descartan en silencio.
REVISAR = [{"year": y, "nombre": d["nombre"], "equipo": d["equipo"], "pos": d["pos"], "ab": d["ab"]}
           for y in YEARS for d in _H0[y] if d["pos"] not in HIT_POS]
H = {y: [d for d in _H0[y] if d["pos"] in HIT_POS] for y in YEARS}
P = {y: [d for d in cargar_pitcheo(y) if califica(d, "pitch")] for y in YEARS}

# ------------------------------------------------- 1. tendencia 3 anios
tendencia = []
for y in YEARS:
    ops = {e: wavg([d for d in H[y] if d["equipo"] == e], "ops", "ab") for e in {d["equipo"] for d in H[y]}}
    era = {e: sum(d["er"] for d in P[y] if d["equipo"] == e) * 9 / sum(d["ip"] for d in P[y] if d["equipo"] == e)
           for e in {d["equipo"] for d in P[y]}}
    ro = sorted(ops, key=lambda e: -ops[e]); re_ = sorted(era, key=lambda e: era[e])
    tendencia.append({"year": y, "ops": round(ops[EQ], 3), "opsRank": ro.index(EQ) + 1,
                      "era": round(era[EQ], 2), "eraRank": re_.index(EQ) + 1,
                      "opsLiga": round(st.mean(ops.values()), 3),
                      "eraLiga": round(st.mean(era.values()), 2)})

# ------------------------------------------------- 2. baselines nacionales
def baseline_hit(y):
    rows = H[y]; g = st.median([d["ops"] for d in rows if d["mexicano"]])
    out = {}
    for pos in HIT_POS:
        mx = [d["ops"] for d in rows if d["pos"] == pos and d["mexicano"]]
        out[pos] = round(st.median(mx) if len(mx) >= 5 else g, 3)
    return out

def baseline_pit(y):
    rows = P[y]
    return {r: round(st.median([d["era"] for d in rows if d["mexicano"] and d["pos"] == r]), 2) for r in PIT_POS}

BH, BP = {y: baseline_hit(y) for y in YEARS}, {y: baseline_pit(y) for y in YEARS}

# ------------------------------------------------- 3. jugadores + percentiles
def pctil(grupo, val, dir=1):
    s = sorted(grupo, key=lambda v: -v if dir == 1 else v)
    n = len(s)
    return lambda x: 0 if n < 2 else round(100 * (n - 1 - s.index(x)) / (n - 1))

METR_H = [("ops", 1, 3), ("avg", 1, 3), ("obp", 1, 3), ("slg", 1, 3), ("hr", 1, 0)]
METR_P = [("era", -1, 2), ("whip", -1, 2), ("k9", 1, 1), ("bb9", -1, 1), ("hr", -1, 0)]

def empaqueta(y):
    out = []
    for kind, rows, metrs, poss in (("hit", H[y], METR_H, HIT_POS), ("pitch", P[y], METR_P, PIT_POS)):
        for pos in poss:
            grp = [d for d in rows if d["pos"] == pos]
            main = "ops" if kind == "hit" else "era"
            grp.sort(key=lambda d: -(d[main] or 0) if kind == "hit" else (d[main] if d[main] is not None else 99))
            pcts = {}
            for m, dr, _ in metrs:
                vals = [d.get(m) for d in grp if d.get(m) is not None]
                pcts[m] = (pctil(vals, m, dr), vals)
            for rank, d in enumerate(grp, 1):
                rec = {"kind": kind, "pos": pos, "rank": rank, "total": len(grp),
                       "pid": d["pid"], "nombre": d["nombre"], "equipo": d["equipo"],
                       "esTigre": d["equipo"] == EQ, "pais": d["pais"],
                       "mexicano": d["mexicano"], "edad": d["edad"]}
                for m, dr, dec in metrs:
                    v = d.get(m)
                    rec[m] = round(v, dec) if isinstance(v, float) else v
                    fn, vals = pcts[m]
                    rec["p_" + m] = fn(v) if v is not None and v in vals else None
                if kind == "hit":
                    rec.update({"ab": d["ab"], "rbi": d["rbi"], "bb": d["bb"], "k": d["k"],
                                "gsn": round(d["ops"] - BH[y][pos], 3)})
                else:
                    rec.update({"ip": round(d["ip"], 1), "ipDisp": d["ip_disp"], "sv": d["sv"],
                                "hld": d["hld"], "w": d["w"], "l": d["l"],
                                "gsn": round(BP[y][pos] - d["era"], 2)})
                out.append(rec)
    return out

JUG = {y: empaqueta(y) for y in YEARS}

# Historial 3 anios de los jugadores que estuvieron con Tigres (trayectoria individual)
HIST = {}
for y in YEARS:
    for d in JUG[y]:
        if d["esTigre"]:
            HIST.setdefault(d["pid"], {"nombre": d["nombre"], "kind": d["kind"], "temporadas": []})
    for d in JUG[y]:
        if d["pid"] in HIST:
            HIST[d["pid"]]["temporadas"].append({
                "year": y, "equipo": d["equipo"], "pos": d["pos"], "edad": d["edad"],
                "val": d["ops"] if d["kind"] == "hit" else d["era"],
                "pctil": d.get("p_ops") if d["kind"] == "hit" else d.get("p_era"),
                "vol": d.get("ab") if d["kind"] == "hit" else d.get("ip"),
                "esTigre": d["esTigre"]})

# ------------------------------------------------- 4. auditoria de cupos
def auditoria(y):
    filas = []
    for kind, rows, base, w, sign in (("hit", H[y], BH[y], "ab", 1), ("pitch", P[y], BP[y], "ip", -1)):
        for eq in sorted({d["equipo"] for d in rows}):
            imp = [d for d in rows if d["equipo"] == eq and not d["mexicano"]]
            if not imp: continue
            tot = sum(d[w] for d in imp)
            if kind == "hit":
                g = sum((d["ops"] - base[d["pos"]]) * d[w] for d in imp) / tot
            else:
                g = sum((base[d["pos"]] - d["era"]) * d[w] for d in imp) / tot
            nac = [d for d in rows if d["equipo"] == eq and d["mexicano"]]
            filas.append({"kind": kind, "equipo": eq, "gsn": round(g, 3),
                          "nImports": len(imp), "vol": round(tot),
                          "shareImport": round(100 * tot / (tot + sum(d[w] for d in nac)), 1)})
    for kind in ("hit", "pitch"):
        sub = sorted([f for f in filas if f["kind"] == kind], key=lambda f: -f["gsn"])
        for i, f in enumerate(sub, 1):
            f["rank"] = i
    return filas

AUD = {y: auditoria(y) for y in YEARS}

# ------------------------------------------------- 5. huecos y perfiles objetivo
def plan():
    y = 2026
    huecos = []
    for pos in HIT_POS:
        mios = [d for d in JUG[y] if d["pos"] == pos and d["esTigre"]]
        grp = [d for d in JUG[y] if d["pos"] == pos]
        if not mios:
            huecos.append({"pos": pos, "kind": "hit", "estado": "sin calificado",
                           "mejorMio": None, "pctilMejor": None})
            continue
        mejor = min(mios, key=lambda d: d["rank"])
        huecos.append({"pos": pos, "kind": "hit", "estado": "cubierto",
                       "mejorMio": mejor["nombre"], "pctilMejor": mejor["p_ops"],
                       "nMios": len(mios), "total": len(grp),
                       "gsnMejor": mejor["gsn"]})
    for pos in PIT_POS:
        mios = [d for d in JUG[y] if d["pos"] == pos and d["esTigre"]]
        mejor = min(mios, key=lambda d: d["rank"]) if mios else None
        huecos.append({"pos": pos, "kind": "pitch",
                       "estado": "cubierto" if mios else "sin calificado",
                       "mejorMio": mejor["nombre"] if mejor else None,
                       "pctilMejor": mejor["p_era"] if mejor else None,
                       "nMios": len(mios), "gsnMejor": mejor["gsn"] if mejor else None})
    # perfiles objetivo: mejores importados de la liga en las posiciones donde Tigres esta abajo
    objetivos = {}
    for pos in HIT_POS:
        cand = [d for d in JUG[y] if d["pos"] == pos and not d["esTigre"] and d["p_ops"] is not None]
        cand.sort(key=lambda d: d["rank"])
        objetivos[pos] = [{"nombre": d["nombre"], "equipo": d["equipo"], "pais": d["pais"],
                           "edad": d["edad"], "ops": d["ops"], "pctil": d["p_ops"],
                           "gsn": d["gsn"], "mexicano": d["mexicano"]} for d in cand[:6]]
    return {"huecos": huecos, "objetivos": objetivos}

# ------------------------------------------------- 6. agregados por equipo
def equipos(y):
    hs, ps = H[y], P[y]
    eqs = sorted({d["equipo"] for d in hs})
    filas = []
    for e in eqs:
        h = [d for d in hs if d["equipo"] == e]
        p = [d for d in ps if d["equipo"] == e]
        pa = [d for d in cargar_pitcheo(y) if d["equipo"] == e]   # todos, para el record real
        ab = sum(d["ab"] for d in h); ip = sum(d["ip"] for d in p)
        filas.append({
            "equipo": e,
            "ops": round(sum(d["ops"] * d["ab"] for d in h) / ab, 3) if ab else None,
            "era": round(sum(d["er"] for d in p) * 9 / ip, 2) if ip else None,
            "hr": sum(d["hr"] for d in h),
            "k9": round(sum(d["k"] for d in p) * 9 / ip, 2) if ip else None,
            "g": sum(d["w"] for d in pa), "pp": sum(d["l"] for d in pa),
            "edadBat": round(sum(d["edad"] * d["ab"] for d in h if d["edad"]) /
                             max(sum(d["ab"] for d in h if d["edad"]), 1), 1),
            "edadPit": round(sum(d["edad"] * d["ip"] for d in p if d["edad"]) /
                             max(sum(d["ip"] for d in p if d["edad"]), 1), 1),
            "shareImportAB": round(100 * sum(d["ab"] for d in h if not d["mexicano"]) / ab, 1) if ab else None,
            "shareImportIP": round(100 * sum(d["ip"] for d in p if not d["mexicano"]) / ip, 1) if ip else None,
        })
    for campo, rev in (("ops", True), ("era", False), ("hr", True), ("k9", True)):
        orden = sorted(filas, key=lambda f: (-f[campo] if rev else f[campo]) if f[campo] is not None else 9e9)
        for i, f in enumerate(orden, 1):
            f["rank_" + campo] = i
    return filas

EQUIPOS = {y: equipos(y) for y in YEARS}

DATA = {
    "equipo": EQ, "years": list(YEARS), "yearActual": 2026,
    "tendencia": tendencia,
    "baselines": {"hit": BH, "pitch": BP},
    "jugadores": {str(y): JUG[y] for y in YEARS},
    "historial": HIST,
    "auditoria": AUD,
    "equipos": EQUIPOS,
    "plan": plan(),
    "revisarManual": REVISAR,
    "filtros": {"minAB": MIN_AB, "minIP_SP": MIN_IP_SP, "minIP_RP": MIN_IP_RP},
}

# El dashboard consume src/data.json; se escribe ahi sin importar desde donde se corra.
RUTA_SALIDA = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "src", "data.json")
if not os.path.isdir(os.path.dirname(RUTA_SALIDA)):
    RUTA_SALIDA = "data.json"

with open(RUTA_SALIDA, "w", encoding="utf-8") as fh:
    json.dump(DATA, fh, ensure_ascii=False, separators=(",", ":"))
print("escrito: %s" % os.path.abspath(RUTA_SALIDA))
print("  jugadores 2026:", len(JUG[2026]))
print("  auditoria filas:", len(AUD[2026]))
print("  tamano: %.0f KB" % (os.path.getsize(RUTA_SALIDA)/1024))
