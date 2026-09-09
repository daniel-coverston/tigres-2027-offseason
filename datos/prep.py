# -*- coding: utf-8 -*-
"""Carga y normalizacion de los datos LMB 2024-2026."""
import csv, glob, os, re, json

# Carpeta con los CSV que produce descargar_datos_lmb.py.
# Se busca hacia arriba desde este archivo para que el script corra igual
# desde la raiz del proyecto o desde la carpeta datos/.
def _buscar_datos():
    if os.environ.get("LMB_DATOS"):
        return os.environ["LMB_DATOS"]
    aqui = os.path.dirname(os.path.abspath(__file__))
    for _ in range(4):
        cand = os.path.join(aqui, "datos_lmb")
        if os.path.isdir(cand):
            return cand
        aqui = os.path.dirname(aqui)
    raise SystemExit(
        "No encuentro la carpeta 'datos_lmb'.\n"
        "Corre primero  python datos/descargar_datos_lmb.py  y  python datos/nacionalidades.py,\n"
        "o apunta la variable de entorno LMB_DATOS a la carpeta que los contiene."
    )

BASE = _buscar_datos()

SUFIJOS = re.compile(r"\s+(de\s+(los\s+)?|del\s+)?(Monterrey|Tijuana|Quintana Roo|Campeche|Puebla|"
                     r"Yucatan|Yucatán|Oaxaca|Chihuahua|Saltillo|Durango|Queretaro|Querétaro|"
                     r"Aguascalientes|Jalisco|Leon|León|Veracruz|Tabasco|Mexico|México|"
                     r"Union Laguna|Unión Laguna|Norte|Dos Laredos|Tijuana)\s*$", re.I)

PAIS_FIX = {"MEX": "Mexico", "VEN": "Venezuela", "CUB": "Cuba", "DOM": "Dominican Republic",
            "PUR": "Puerto Rico", "USA": "USA", "": "(sin dato)"}

OF = {"LF", "CF", "RF", "OF"}

def norm_equipo(s):
    s = (s or "").strip()
    s = SUFIJOS.sub("", s).strip()
    s = s.replace("El Aguila", "El Águila")
    return s

def norm_pais(s):
    s = (s or "").strip()
    return PAIS_FIX.get(s, s) or "(sin dato)"

def f(v, default=None):
    """Convierte '.268' / '3.00' / 45 a float."""
    if v is None or v == "":
        return default
    try:
        return float(str(v).strip())
    except ValueError:
        return default

def i(v, default=0):
    x = f(v, None)
    return int(x) if x is not None else default

def ip_dec(s):
    """'88.1' = 88 y 1/3 de entrada. NO es decimal."""
    if s in (None, ""):
        return 0.0
    s = str(s).strip()
    if "." not in s:
        return float(s)
    ent, frac = s.split(".", 1)
    base = float(ent)
    if frac.startswith("1"): return base + 1/3
    if frac.startswith("2"): return base + 2/3
    return base

def cargar_bio():
    bio = {}
    with open(os.path.join(BASE, "bio_jugadores.csv"), encoding="utf-8-sig") as fh:
        for r in csv.DictReader(fh):
            bio[r["player_id"]] = {
                "pais": norm_pais(r["pais"]),
                "edad": i(r["edad_2026"], None),
                "fecha_nac": r["fecha_nac"],
                "batea": r["batea"], "lanza": r["lanza"],
                "debut_mlb": r["debut_mlb"],
                "nombre_mlb": r["nombre"],
            }
    return bio

BIO = cargar_bio()

def _base(r, year):
    pid = r["player_id"]
    b = BIO.get(pid, {})
    pais = b.get("pais", "(sin dato)")
    return {
        "year": year, "pid": pid, "nombre": r["nombre"].strip(),
        "equipo": norm_equipo(r["equipo"]),
        "pais": pais,
        "mexicano": pais == "Mexico",
        "edad": (b.get("edad") - (2026 - year)) if b.get("edad") is not None else None,
        "batea": b.get("batea", ""), "lanza": b.get("lanza", ""),
        "debut_mlb": b.get("debut_mlb", ""),
    }

def cargar_bateo(year):
    out = []
    with open(os.path.join(BASE, "lmb_bateo_%d.csv" % year), encoding="utf-8-sig") as fh:
        for r in csv.DictReader(fh):
            pos = (r["posicion"] or "").strip().upper()
            if pos == "P":            # pitcher bateando
                continue
            d = _base(r, year)
            d.update({
                "pos_raw": pos,
                "pos": "OF" if pos in OF else pos,
                "j": i(r["J"]), "ab": i(r["TB"]), "r": i(r["C"]), "h": i(r["H"]),
                "d2": i(r["2B"]), "d3": i(r["3B"]), "hr": i(r["HR"]), "rbi": i(r["CI"]),
                "bb": i(r["BB"]), "k": i(r["P"]), "sb": i(r.get("BR")), "cs": i(r.get("AR")),
                "avg": f(r["PRO"], 0.0), "obp": f(r["OBP"], 0.0),
                "slg": f(r["SLG"], 0.0), "ops": f(r["OPS"], 0.0),
                "pa": i(r.get("ext_VB")), "hbp": i(r.get("ext_HBP")),
                "sf": i(r.get("ext_ES")), "gidp": i(r.get("ext_GIDP")),
                "tb": i(r.get("ext_BT")), "babip": f(r.get("ext_BABIP"), None),
            })
            out.append(d)
    return out

def cargar_pitcheo(year):
    out = []
    with open(os.path.join(BASE, "lmb_pitcheo_%d.csv" % year), encoding="utf-8-sig") as fh:
        for r in csv.DictReader(fh):
            d = _base(r, year)
            j, a = i(r["J"]), i(r["A"])
            d.update({
                "j": j, "gs": a,
                "pos": "SP" if (j and a / j >= 0.5) else "RP",
                "w": i(r["JG"]), "l": i(r["JP"]),
                "era": f(r["EFE"], None), "sv": i(r["JS"]), "svo": i(r.get("OS")),
                "cg": i(r.get("JC")), "sho": i(r.get("SHO")),
                "ip": ip_dec(r["IL"]), "ip_disp": r["IL"],
                "h": i(r["H"]), "r": i(r["C"]), "er": i(r["CL"]), "hr": i(r["HR"]),
                "bb": i(r["BB"]), "k": i(r["P"]), "whip": f(r["WHIP"], None),
                "avg_against": f(r.get("PRO"), None),
                "hld": i(r.get("ext_HLD")), "gf": i(r.get("ext_JT")),
                "k9": f(r.get("ext_P/9"), None), "bb9": f(r.get("ext_BB/9"), None),
                "kbb": f(r.get("ext_P/BB"), None), "wp": i(r.get("ext_WP")),
                "bf": i(r.get("ext_TBE")),
            })
            out.append(d)
    return out

# Filtros de calificacion
MIN_AB, MIN_IP_SP, MIN_IP_RP = 100, 40, 15

def califica(d, kind):
    if kind == "hit":
        return d["ab"] >= MIN_AB
    return d["ip"] >= (MIN_IP_SP if d["pos"] == "SP" else MIN_IP_RP)

if __name__ == "__main__":
    for y in (2024, 2025, 2026):
        b, p = cargar_bateo(y), cargar_pitcheo(y)
        bc = [x for x in b if califica(x, "hit")]
        pc = [x for x in p if califica(x, "pitch")]
        print(f"{y}: bateo {len(b)} ({len(bc)} calif) | pitcheo {len(p)} ({len(pc)} calif) | equipos {len({x['equipo'] for x in b})}")
    print("\nEquipos normalizados:", sorted({x["equipo"] for x in cargar_bateo(2026)}))
