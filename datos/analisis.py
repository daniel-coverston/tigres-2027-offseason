# -*- coding: utf-8 -*-
"""Genera src/data.json: todo lo que consume el dashboard.

Métricas principales: wOBA y OPS+ en bateo, FIP y K-BB% en pitcheo.
El porqué de esa elección está documentado en metricas.py.
"""
import json, os, statistics as st
from prep import *
import metricas as M
import ajuste_parque as AP

EQ = "Tigres"
YEARS = (2024, 2025, 2026)
HIT_POS = ["C", "1B", "2B", "3B", "SS", "OF", "DH"]
PIT_POS = ["SP", "RP"]

# ------------------------------------------------------------ datos base
# Universo completo (para contextos de liga y agregados por equipo) y
# subconjunto calificado (para comparaciones entre jugadores).
_H0 = {y: cargar_bateo(y) for y in YEARS}
_P0 = {y: cargar_pitcheo(y) for y in YEARS}

REVISAR = [{"year": y, "nombre": d["nombre"], "equipo": d["equipo"], "pos": d["pos"], "ab": d["ab"]}
           for y in YEARS for d in _H0[y] if d["pos"] not in HIT_POS]

H_TODOS = {y: [d for d in _H0[y] if d["pos"] in HIT_POS] for y in YEARS}
P_TODOS = {y: _P0[y] for y in YEARS}

CTX_H = {y: M.contexto_bateo(H_TODOS[y]) for y in YEARS}
CTX_P = {y: M.contexto_pitcheo(P_TODOS[y]) for y in YEARS}


def enriquecer(y):
    """Métricas derivadas, en versión cruda y en versión ajustada por parque."""
    for d in H_TODOS[y]:
        t = M.agregado_bateo([d])
        d["woba"] = M.woba(d, CTX_H[y])
        d["opsPlus"] = M.ops_plus(t, CTX_H[y])
        d["_aj"] = AP.ajusta_bateador(d)
    for d in P_TODOS[y]:
        t = M.agregado_pitcheo([d])
        d["fip"] = M.fip(t, CTX_P[y])
        d["kbb"] = M.kbb(t)
        d["kpct"] = M.k_pct(t)
        d["bbpct"] = M.bb_pct(t)
        d["eraFip"] = M.era_menos_fip(t, CTX_P[y])
        d["_aj"] = AP.ajusta_pitcher(d)


for y in YEARS:
    enriquecer(y)


# ------------------------- contexto de liga sobre el universo YA ajustado
def _ctx_bateo_aj(rows):
    t = AP.suma([d["_aj"] for d in rows])
    den = t["ab"] + t["bb"] + t["sf"] + t["hbp"]
    lg_obp = (t["h"] + t["bb"] + t["hbp"]) / den
    lg_slg = t["tb"] / t["ab"]
    crudo = M.woba_crudo({"ab": t["ab"], "bb": t["bb"], "sf": t["sf"], "hbp": t["hbp"],
                          "h": t["h"], "d2": t["d2"], "d3": t["d3"], "hr": t["hr"]})
    esc = lg_obp / crudo
    return {"lgOBP": lg_obp, "lgSLG": lg_slg, "escalaWOBA": esc, "lgWOBA": crudo * esc}


def _ctx_pitcheo_aj(rows):
    t = AP.suma([d["_aj"] for d in rows])
    bruto = (13 * t["hr"] + 3 * (t["bb"] + t["hbp"]) - 2 * t["k"]) / t["ip"]
    lg_era = 9 * t["er"] / t["ip"]
    return {"cFIP": lg_era - bruto, "lgERA": lg_era, "lgFIP": lg_era}


CTX_HA = {y: _ctx_bateo_aj(H_TODOS[y]) for y in YEARS}
CTX_PA = {y: _ctx_pitcheo_aj(P_TODOS[y]) for y in YEARS}


def _woba_aj(t, ctx):
    crudo = M.woba_crudo({"ab": t["ab"], "bb": t["bb"], "sf": t["sf"], "hbp": t["hbp"],
                          "h": t["h"], "d2": t["d2"], "d3": t["d3"], "hr": t["hr"]})
    return crudo * ctx["escalaWOBA"] if crudo is not None else None


def _fip_aj(t, ctx):
    if not t.get("ip"):
        return None
    return (13 * t["hr"] + 3 * (t["bb"] + t["hbp"]) - 2 * t["k"]) / t["ip"] + ctx["cFIP"]


def _kbb_aj(t):
    return 100 * (t["k"] - t["bb"]) / t["bf"] if t.get("bf") else None


def _ops_plus_aj(t, ctx):
    """OPS+ sobre componentes ya ajustados. None si el jugador no tiene turnos."""
    if not t or not t.get("ab"):
        return None
    den = t["ab"] + t["bb"] + t["sf"] + t["hbp"]
    if den <= 0:
        return None
    obp = (t["h"] + t["bb"] + t["hbp"]) / den
    slg = t["tb"] / t["ab"]
    return 100 * (obp / ctx["lgOBP"] + slg / ctx["lgSLG"] - 1)


for y in YEARS:
    for d in H_TODOS[y]:
        a = d["_aj"]
        d["wobaAj"] = _woba_aj(a, CTX_HA[y]) if a else None
        d["opsPlusAj"] = _ops_plus_aj(a, CTX_HA[y])
    for d in P_TODOS[y]:
        a = d["_aj"]
        d["fipAj"] = _fip_aj(a, CTX_PA[y]) if a else None
        d["kbbAj"] = _kbb_aj(a) if a else None

H = {y: [d for d in H_TODOS[y] if califica(d, "hit")] for y in YEARS}
P = {y: [d for d in P_TODOS[y] if califica(d, "pitch")] for y in YEARS}


# ------------------------------------------------- 1. agregados por equipo
def equipos(y):
    filas = []
    for e in sorted({d["equipo"] for d in H_TODOS[y]}):
        hb = [d for d in H_TODOS[y] if d["equipo"] == e]
        pt = [d for d in P_TODOS[y] if d["equipo"] == e]
        th, tp = M.agregado_bateo(hb), M.agregado_pitcheo(pt)
        tha, tpa = AP.suma([d["_aj"] for d in hb]), AP.suma([d["_aj"] for d in pt])
        edad_h = [d for d in hb if d["edad"]]
        edad_p = [d for d in pt if d["edad"]]
        filas.append({
            "equipo": e,
            "woba": round(M.woba(th, CTX_H[y]), 3),
            "ops": round(M.ops(th), 3),
            "opsPlus": round(M.ops_plus(th, CTX_H[y])),
            "hr": th["hr"],
            "era": round(M.era(tp), 2),
            "fip": round(M.fip(tp, CTX_P[y]), 2),
            "kbb": round(M.kbb(tp), 1),
            "eraFip": round(M.era_menos_fip(tp, CTX_P[y]), 2),
            "wobaAj": round(_woba_aj(tha, CTX_HA[y]), 3),
            "opsPlusAj": round(_ops_plus_aj(tha, CTX_HA[y])),
            "fipAj": round(_fip_aj(tpa, CTX_PA[y]), 2),
            "kbbAj": round(_kbb_aj(tpa), 1),
            "pf": AP.PF[e]["crudo"], "pfIcBajo": AP.PF[e]["icBajo"],
            "pfIcAlto": AP.PF[e]["icAlto"], "altitud": AP.PF[e]["altitud"],
            "sede": AP.PF[e]["sede"],
            "shareImportAB": round(100 * sum(d["ab"] for d in hb if not d["mexicano"]) / th["ab"], 1) if th["ab"] else None,
            "shareImportIP": round(100 * sum(d["ip"] for d in pt if not d["mexicano"]) / tp["ip"], 1) if tp["ip"] else None,
            "edadBat": round(sum(d["edad"] * d["ab"] for d in edad_h) / max(sum(d["ab"] for d in edad_h), 1), 1),
            "edadPit": round(sum(d["edad"] * d["ip"] for d in edad_p) / max(sum(d["ip"] for d in edad_p), 1), 1),
        })
    for campo, mayor_mejor in (("woba", True), ("ops", True), ("hr", True),
                               ("era", False), ("fip", False), ("kbb", True),
                               ("wobaAj", True), ("fipAj", False), ("kbbAj", True)):
        orden = sorted(filas, key=lambda f: -f[campo] if mayor_mejor else f[campo])
        for i, f in enumerate(orden, 1):
            f["rank_" + campo] = i
    return filas


EQUIPOS = {y: equipos(y) for y in YEARS}

# ------------------------------------------------- 2. tendencia a tres años
tendencia = []
for y in YEARS:
    e = EQUIPOS[y]
    yo = [f for f in e if f["equipo"] == EQ][0]
    tendencia.append({
        "year": y,
        "woba": yo["woba"], "wobaRank": yo["rank_woba"],
        "ops": yo["ops"], "opsRank": yo["rank_ops"], "opsPlus": yo["opsPlus"],
        "fip": yo["fip"], "fipRank": yo["rank_fip"],
        "era": yo["era"], "eraRank": yo["rank_era"],
        "kbb": yo["kbb"], "kbbRank": yo["rank_kbb"],
        "wobaAj": yo["wobaAj"], "wobaAjRank": yo["rank_wobaAj"], "opsPlusAj": yo["opsPlusAj"],
        "fipAj": yo["fipAj"], "fipAjRank": yo["rank_fipAj"],
        "kbbAj": yo["kbbAj"], "kbbAjRank": yo["rank_kbbAj"],
        "wobaLiga": round(CTX_H[y]["lgWOBA"], 3),
        "eraLiga": round(CTX_P[y]["lgERA"], 2),
    })

# ------------------------------------------------- 3. líneas base nacionales
def baseline(y, kind, ajustado=False):
    rows = H[y] if kind == "hit" else P[y]
    metrica = ("wobaAj" if ajustado else "woba") if kind == "hit" else ("fipAj" if ajustado else "fip")
    poss = HIT_POS if kind == "hit" else PIT_POS
    vals = [d[metrica] for d in rows if d["mexicano"] and d[metrica] is not None]
    glob = st.median(vals) if vals else 0
    out = {}
    for pos in poss:
        mx = [d[metrica] for d in rows if d["pos"] == pos and d["mexicano"] and d[metrica] is not None]
        # Con menos de cinco mexicanos calificados la mediana de posición no es
        # una muestra, es una anécdota: se usa la mediana nacional global.
        out[pos] = round(st.median(mx) if len(mx) >= 5 else glob, 4)
    return out


BH = {y: baseline(y, "hit") for y in YEARS}
BP = {y: baseline(y, "pitch") for y in YEARS}
BHA = {y: baseline(y, "hit", True) for y in YEARS}
BPA = {y: baseline(y, "pitch", True) for y in YEARS}

# ------------------------------------------- 4. jugadores con percentiles
METR_H = [("woba", 1, 3), ("ops", 1, 3), ("obp", 1, 3), ("slg", 1, 3), ("hr", 1, 0)]
METR_P = [("fip", -1, 2), ("kbb", 1, 1), ("era", -1, 2), ("whip", -1, 2), ("hr", -1, 0)]
# Las mismas dos métricas principales, ya descontado el parque.
METR_HA = [("wobaAj", 1, 3)]
METR_PA = [("fipAj", -1, 2), ("kbbAj", 1, 1)]


def empaqueta(y):
    out = []
    for kind, rows, metrs, poss in (("hit", H[y], METR_H + METR_HA, HIT_POS),
                                    ("pitch", P[y], METR_P + METR_PA, PIT_POS)):
        principal = "woba" if kind == "hit" else "fip"
        for pos in poss:
            grp = [d for d in rows if d["pos"] == pos]
            grp.sort(key=lambda d: -(d[principal] or 0) if kind == "hit"
                     else (d[principal] if d[principal] is not None else 99))
            pcts = {}
            for m, dr, _ in metrs:
                vals = sorted([d[m] for d in grp if d.get(m) is not None],
                              key=lambda v: -v if dr == 1 else v)
                n = len(vals)
                pcts[m] = (vals, n)
            for rank, d in enumerate(grp, 1):
                rec = {"kind": kind, "pos": pos, "rank": rank, "total": len(grp),
                       "pid": d["pid"], "nombre": d["nombre"], "equipo": d["equipo"],
                       "esTigre": d["equipo"] == EQ, "pais": d["pais"],
                       "mexicano": d["mexicano"], "edad": d["edad"]}
                for m, dr, dec in metrs:
                    v = d.get(m)
                    rec[m] = round(v, dec) if isinstance(v, float) else v
                    vals, n = pcts[m]
                    rec["p_" + m] = (0 if n < 2 else
                                     round(100 * (n - 1 - vals.index(v)) / (n - 1))) if v in vals else None
                if kind == "hit":
                    rec.update({"ab": d["ab"], "rbi": d["rbi"], "bb": d["bb"], "k": d["k"],
                                "opsPlus": round(d["opsPlus"]) if d["opsPlus"] is not None else None,
                                "opsPlusAj": round(d["opsPlusAj"]) if d["opsPlusAj"] is not None else None,
                                "gsn": round(d["woba"] - BH[y][pos], 4),
                                "gsnAj": round(d["wobaAj"] - BHA[y][pos], 4)})
                else:
                    rec.update({"ip": round(d["ip"], 1), "ipDisp": d["ip_disp"], "sv": d["sv"],
                                "hld": d["hld"], "w": d["w"], "l": d["l"],
                                "kpct": round(d["kpct"], 1) if d["kpct"] is not None else None,
                                "bbpct": round(d["bbpct"], 1) if d["bbpct"] is not None else None,
                                "eraFip": round(d["eraFip"], 2) if d["eraFip"] is not None else None,
                                "gsn": round(BP[y][pos] - d["fip"], 3),
                                "gsnAj": round(BPA[y][pos] - d["fipAj"], 3)})
                out.append(rec)
    return out


JUG = {y: empaqueta(y) for y in YEARS}

# Historial de los jugadores que pasaron por Tigres
HIST = {}
for y in YEARS:
    for d in JUG[y]:
        if d["esTigre"]:
            HIST.setdefault(d["pid"], {"nombre": d["nombre"], "kind": d["kind"], "temporadas": []})
    for d in JUG[y]:
        if d["pid"] in HIST:
            HIST[d["pid"]]["temporadas"].append({
                "year": y, "equipo": d["equipo"], "pos": d["pos"], "edad": d["edad"],
                "val": d["woba"] if d["kind"] == "hit" else d["fip"],
                "pctil": d.get("p_woba") if d["kind"] == "hit" else d.get("p_fip"),
                "vol": d.get("ab") if d["kind"] == "hit" else d.get("ip"),
                "esTigre": d["esTigre"]})


# --------------------------------------------- 5. auditoría de cupos
def auditoria(y, ajustado=False):
    filas = []
    for kind, rows, base, peso, mayor_mejor in (
            ("hit", H[y], (BHA[y] if ajustado else BH[y]), "ab", True),
            ("pitch", P[y], (BPA[y] if ajustado else BP[y]), "ip", False)):
        metrica = (("wobaAj" if ajustado else "woba") if kind == "hit"
                   else ("fipAj" if ajustado else "fip"))
        for eq in sorted({d["equipo"] for d in rows}):
            imp = [d for d in rows if d["equipo"] == eq and not d["mexicano"] and d[metrica] is not None]
            if not imp:
                continue
            tot = sum(d[peso] for d in imp)
            g = sum(((d[metrica] - base[d["pos"]]) if mayor_mejor
                     else (base[d["pos"]] - d[metrica])) * d[peso] for d in imp) / tot
            nac = [d for d in rows if d["equipo"] == eq and d["mexicano"]]
            filas.append({"kind": kind, "equipo": eq, "gsn": round(g, 4),
                          "nImports": len(imp), "vol": round(tot),
                          "shareImport": round(100 * tot / (tot + sum(d[peso] for d in nac)), 1)})
    for kind in ("hit", "pitch"):
        sub = sorted([f for f in filas if f["kind"] == kind], key=lambda f: -f["gsn"])
        for i, f in enumerate(sub, 1):
            f["rank"] = i
    return filas


AUD = {y: auditoria(y) for y in YEARS}
AUD_AJ = {y: auditoria(y, True) for y in YEARS}


# ---------------------------------------------------- 6. huecos y objetivos
def plan():
    y = 2026
    huecos = []
    for pos in HIT_POS + PIT_POS:
        kind = "hit" if pos in HIT_POS else "pitch"
        clave = "p_woba" if kind == "hit" else "p_fip"
        mios = [d for d in JUG[y] if d["pos"] == pos and d["esTigre"] and d["kind"] == kind]
        grp = [d for d in JUG[y] if d["pos"] == pos and d["kind"] == kind]
        mejor = min(mios, key=lambda d: d["rank"]) if mios else None
        huecos.append({"pos": pos, "kind": kind,
                       "estado": "cubierto" if mios else "sin calificado",
                       "mejorMio": mejor["nombre"] if mejor else None,
                       "pctilMejor": mejor[clave] if mejor else None,
                       "gsnMejor": mejor["gsn"] if mejor else None,
                       "nMios": len(mios), "total": len(grp)})
    objetivos = {}
    for pos in HIT_POS:
        cand = [d for d in JUG[y] if d["pos"] == pos and d["kind"] == "hit"
                and not d["esTigre"] and d["p_woba"] is not None]
        cand.sort(key=lambda d: d["rank"])
        objetivos[pos] = [{"nombre": d["nombre"], "equipo": d["equipo"], "pais": d["pais"],
                           "edad": d["edad"], "woba": d["woba"], "ops": d["ops"],
                           "pctil": d["p_woba"], "gsn": d["gsn"], "mexicano": d["mexicano"]}
                          for d in cand[:6]]
    return {"huecos": huecos, "objetivos": objetivos}


# ------------------------------------------- 7. parques y sensibilidad
def parques():
    """Los 21 parques con su factor, intervalo y factores por evento."""
    out = []
    for eq, f in AP.PF.items():
        out.append({
            "equipo": eq, "sede": f["sede"], "altitud": f["altitud"],
            "factor": f["crudo"], "icBajo": f["icBajo"], "icAlto": f["icAlto"],
            "juegos": f["juegos"],
            "eventos": {e: round(2 * f[e] - 1, 3) for e in AP.EVENTOS},
        })
    out.sort(key=lambda d: -d["factor"])
    for i, d in enumerate(out, 1):
        d["rank"] = i
    return out


def sensibilidad(y=2026):
    """Las conclusiones de Tigres recalculadas en los extremos del intervalo de
    confianza del factor de su parque (0.672 a 0.800).

    Responde a la pregunta honesta: ¿de cuánto tendría que equivocarse el factor
    para que el diagnóstico cambie? Cada factor por evento se reescala en
    proporción a lo que se aleja del neutral el factor global, de modo que un
    parque menos extremo encoge TODAS las correcciones, incluida la de ponches,
    que en Cancún va en la dirección contraria a las demás.
    """
    base = AP.PF[EQ]
    hb = [d for d in H_TODOS[y] if d["equipo"] == EQ]
    pt = [d for d in P_TODOS[y] if d["equipo"] == EQ]
    desvio_base = base["carreras"] - 1.0          # negativo: parque de pitcher

    escenarios = []
    for etiqueta, pf in (("Sin ajustar (parque neutral)", 1.0),
                         ("Extremo conservador — IC alto", base["icAlto"]),
                         ("Estimación central", base["crudo"]),
                         ("Extremo agresivo — IC bajo", base["icBajo"])):
        k = 0.0 if desvio_base == 0 else (((pf + 1) / 2) - 1.0) / desvio_base
        f = {e: 1 + (base[e] - 1) * k for e in AP.EVENTOS}
        f["carreras"] = 1 + desvio_base * k

        th = {"ab": 0, "sf": 0, "s": 0, "d2": 0, "d3": 0, "hr": 0, "bb": 0, "hbp": 0}
        for d in hb:
            sen = d["h"] - d["d2"] - d["d3"] - d["hr"]
            th["ab"] += d["ab"]; th["sf"] += d.get("sf", 0)
            th["s"] += sen / f["sencillos"]; th["d2"] += d["d2"] / f["2B"]
            th["d3"] += d["d3"] / f["3B"];   th["hr"] += d["hr"] / f["HR"]
            th["bb"] += d["bb"] / f["BB"];   th["hbp"] += d.get("hbp", 0) / f["golpeado"]
        th["h"] = th["s"] + th["d2"] + th["d3"] + th["hr"]
        th["tb"] = th["s"] + 2 * th["d2"] + 3 * th["d3"] + 4 * th["hr"]

        tp = {"ip": 0, "hr": 0, "bb": 0, "hbp": 0, "k": 0, "er": 0, "bf": 0}
        for d in pt:
            tp["ip"] += d["ip"]; tp["bf"] += d.get("bf", 0)
            tp["hr"] += d["hr"] / f["HR"];  tp["bb"] += d["bb"] / f["BB"]
            tp["hbp"] += d["hbp"] / f["golpeado"]; tp["k"] += d["k"] / f["K"]
            tp["er"] += d["er"] / f["carreras"]

        ctxh, ctxp = (CTX_H[y], CTX_P[y]) if pf == 1.0 else (CTX_HA[y], CTX_PA[y])
        escenarios.append({
            "etiqueta": etiqueta, "pf": round(pf, 3),
            "woba": round(_woba_aj(th, ctxh), 3),
            "opsPlus": round(_ops_plus_aj(th, ctxh)),
            "fip": round(_fip_aj(tp, ctxp), 2),
            "kbb": round(_kbb_aj(tp), 1),
        })
    return escenarios


DATA = {
    "equipo": EQ, "years": list(YEARS), "yearActual": 2026,
    "tendencia": tendencia,
    "contexto": {str(y): {"hit": {k: round(v, 4) for k, v in CTX_H[y].items()},
                          "pitch": {k: (round(v, 4) if v is not None else None)
                                    for k, v in CTX_P[y].items()}} for y in YEARS},
    "baselines": {"hit": {str(y): BH[y] for y in YEARS},
                  "pitch": {str(y): BP[y] for y in YEARS}},
    "jugadores": {str(y): JUG[y] for y in YEARS},
    "historial": HIST,
    "auditoria": {str(y): AUD[y] for y in YEARS},
    "auditoriaAj": {str(y): AUD_AJ[y] for y in YEARS},
    "equipos": {str(y): EQUIPOS[y] for y in YEARS},
    "parques": parques(),
    "sensibilidad": sensibilidad(),
    "plan": plan(),
    "revisarManual": REVISAR,
    "filtros": {"minAB": MIN_AB, "minIP_SP": MIN_IP_SP, "minIP_RP": MIN_IP_RP},
}

RUTA_SALIDA = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "src", "data.json")
if not os.path.isdir(os.path.dirname(RUTA_SALIDA)):
    RUTA_SALIDA = "data.json"

with open(RUTA_SALIDA, "w", encoding="utf-8") as fh:
    json.dump(DATA, fh, ensure_ascii=False, separators=(",", ":"))

print("escrito: %s" % os.path.abspath(RUTA_SALIDA))
print("  tamano: %.0f KB" % (os.path.getsize(RUTA_SALIDA) / 1024))
print("\n  %-6s %-26s %-26s" % ("", "SIN AJUSTAR", "AJUSTADO POR PARQUE"))
for t in tendencia:
    print("  %d  wOBA %.3f (#%2d) OPS+ %3d | wOBA %.3f (#%2d) OPS+ %3d | FIP %.2f (#%2d) -> %.2f (#%2d) | K-BB%% %.1f (#%2d) -> %.1f (#%2d)"
          % (t["year"], t["woba"], t["wobaRank"], t["opsPlus"],
             t["wobaAj"], t["wobaAjRank"], t["opsPlusAj"],
             t["fip"], t["fipRank"], t["fipAj"], t["fipAjRank"],
             t["kbb"], t["kbbRank"], t["kbbAj"], t["kbbAjRank"]))
a, aa = AUD[2026], AUD_AJ[2026]
h = [x for x in a if x["kind"] == "hit" and x["equipo"] == EQ][0]
ha = [x for x in aa if x["kind"] == "hit" and x["equipo"] == EQ][0]
print("\n  Cupos de bateo: #%d (gsn %+.4f) -> ajustado #%d (gsn %+.4f)"
      % (h["rank"], h["gsn"], ha["rank"], ha["gsn"]))
print("\n  SENSIBILIDAD al factor del parque:")
for e in DATA["sensibilidad"]:
    print("    %-32s PF %.3f  wOBA %.3f  OPS+ %3d  FIP %.2f  K-BB%% %.1f"
          % (e["etiqueta"], e["pf"], e["woba"], e["opsPlus"], e["fip"], e["kbb"]))
