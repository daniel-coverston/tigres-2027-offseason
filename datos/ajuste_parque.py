# -*- coding: utf-8 -*-
"""
Ajuste por factores de parque de la LMB.

FUENTE
------
Proyecto propio: github.com/daniel-coverston/lmb-analytics, carpeta `data/agregados/`.
5,150 juegos de casa de la LMB 2021-2026 tomados de la MLB Stats API. La altitud de la sede
explica R^2 = 0.941 de la variación entre parques.

POR QUÉ IMPORTA AQUÍ
--------------------
El Estadio de Béisbol Beto Ávila de Cancún tiene factor de carreras **0.733**: el tercer
parque más difícil para anotar de los 21 de la liga. Tigres juega la mitad de su calendario
ahí, así que sus bateadores se ven peor de lo que son y sus lanzadores mejor de lo que son.
Sin corregir eso, cualquier comparación contra el resto de la liga mide el estadio tanto
como al jugador.

CÓMO SE APLICA
--------------
Un equipo juega alrededor de la mitad en casa, así que el multiplicador que afecta a una
línea de temporada completa no es el factor del parque sino **(factor + 1) / 2**. Para
Tigres: (0.733 + 1) / 2 = 0.866.

Cada evento se ajusta con su propio factor —no todos se mueven igual: en Cancún los dobles
caen 29% pero los cuadrangulares son neutrales— y con los componentes ya corregidos se
vuelven a calcular wOBA, OPS+ y FIP desde cero.

LÍMITES, QUE SON REALES
-----------------------
1. **El método comprime.** Lo declara el propio proyecto de origen: el denominador de cada
   sede incluye juegos en otras sedes con sus propios efectos, así que los factores son un
   *piso*. El efecto verdadero es mayor y estos ajustes quedan cortos.
2. **No hay desgloses de local y visitante por jugador.** Se aplica a todos los jugadores de
   un equipo el mismo factor, que es la aproximación estándar para líneas de temporada
   (es lo que hacen OPS+ y wRC+), pero es una aproximación.
3. **Los intervalos de confianza son anchos.** El de Cancún va de 0.672 a 0.800. Por eso el
   tablero publica el rango completo y no solo el punto medio: ver `sensibilidad()`.
4. **Seis temporadas agrupadas.** Un factor por sede para 2021-2026, no uno por año. Gana
   estabilidad y pierde capacidad de detectar cambios de un año a otro.
"""

import csv
import os

AQUI = os.path.dirname(os.path.abspath(__file__))
CARPETA = os.path.join(AQUI, "parque")

# Sede -> equipo. Sale de la columna `ciudad` del proyecto de origen; sin ambigüedad
# salvo Tecos, que juega en dos sedes y se pondera por juegos de casa.
SEDE_EQUIPO = {
    5340: "Diablos Rojos", 2869: "Pericos", 5321: "Caliente", 6070: "Conspiradores",
    5320: "Bravos", 3210: "Dorados", 2929: "Rieleros", 4710: "Charros",
    2953: "Saraperos", 2951: "Guerreros", 2956: "Algodoneros", 2950: "Acereros",
    2701: "Sultanes", 2949: "Piratas", 2957: "Toros", 2958: "El Águila",
    3410: "Tecos", 5330: "Tecos", 3929: "Tigres", 2959: "Leones", 2955: "Olmecas",
}

EVENTOS = ("HR", "2B", "3B", "sencillos", "BB", "golpeado", "K")


def _leer():
    with open(os.path.join(CARPETA, "factores_parque.csv"), encoding="utf-8") as fh:
        sedes = {int(r["estadio_id"]): r for r in csv.DictReader(fh)}
    ev = {}
    with open(os.path.join(CARPETA, "factores_por_evento.csv"), encoding="utf-8") as fh:
        for r in csv.DictReader(fh):
            ev.setdefault(int(r["estadio_id"]), {})[r["evento"]] = float(r["factor"])
    return sedes, ev


SEDES, EV = _leer()


def _medio(f):
    """Factor de temporada completa: la mitad de los juegos son en casa."""
    return (f + 1) / 2


def por_equipo():
    """{equipo: {evento: factor_medio, 'carreras': ..., 'crudo': ..., 'ic': (lo,hi), ...}}"""
    grupos = {}
    for sid, eq in SEDE_EQUIPO.items():
        grupos.setdefault(eq, []).append(sid)
    out = {}
    for eq, sids in grupos.items():
        w = [int(SEDES[s]["juegos_casa"]) for s in sids]
        tot = sum(w)
        prom = lambda vals: sum(v * wi for v, wi in zip(vals, w)) / tot
        crudo = prom([float(SEDES[s]["factor"]) for s in sids])
        out[eq] = {e: _medio(prom([EV[s][e] for s in sids])) for e in EVENTOS}
        out[eq]["carreras"] = _medio(crudo)
        out[eq]["crudo"] = round(crudo, 4)
        out[eq]["icBajo"] = round(prom([float(SEDES[s]["ic_bajo"]) for s in sids]), 4)
        out[eq]["icAlto"] = round(prom([float(SEDES[s]["ic_alto"]) for s in sids]), 4)
        out[eq]["altitud"] = round(prom([float(SEDES[s]["altitud_m"]) for s in sids]))
        out[eq]["sede"] = " / ".join(SEDES[s]["sede"] for s in sids)
        out[eq]["juegos"] = tot
    return out


PF = por_equipo()


# ------------------------------------------------------------------ bateo
def ajusta_bateador(d):
    """Devuelve los componentes ofensivos de `d` como habrían sido en un parque neutral."""
    f = PF.get(d["equipo"])
    if not f:
        return None
    sencillos = d["h"] - d["d2"] - d["d3"] - d["hr"]
    a = {
        "ab": d["ab"], "sf": d.get("sf", 0),
        "s": sencillos / f["sencillos"],
        "d2": d["d2"] / f["2B"],
        "d3": d["d3"] / f["3B"],
        "hr": d["hr"] / f["HR"],
        "bb": d["bb"] / f["BB"],
        "hbp": d.get("hbp", 0) / f["golpeado"],
        "k": d["k"] / f["K"] if d.get("k") else 0,
    }
    a["h"] = a["s"] + a["d2"] + a["d3"] + a["hr"]
    a["tb"] = a["s"] + 2 * a["d2"] + 3 * a["d3"] + 4 * a["hr"]
    return a


# ---------------------------------------------------------------- pitcheo
def ajusta_pitcher(d):
    f = PF.get(d["equipo"])
    if not f or not d["ip"]:
        return None
    return {
        "ip": d["ip"],
        "hr": d["hr"] / f["HR"],
        "bb": d["bb"] / f["BB"],
        "hbp": d["hbp"] / f["golpeado"],
        "k": d["k"] / f["K"],
        "er": d["er"] / f["carreras"],
        "bf": d.get("bf", 0),
    }


def suma(lista):
    """Suma una lista de dicts de componentes ya ajustados."""
    out = {}
    for t in lista:
        if not t:
            continue
        for k, v in t.items():
            out[k] = out.get(k, 0) + v
    return out
