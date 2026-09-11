# -*- coding: utf-8 -*-
"""
Métricas derivadas: wOBA y OPS+ para bateo; FIP y K-BB% para pitcheo.

POR QUÉ NO BASTA CON OPS Y EFECTIVIDAD
--------------------------------------
**Efectividad (ERA).** Mide carreras limpias permitidas, pero un lanzador no
controla lo que pasa cuando la pelota se pone en juego: eso depende de la
defensa detrás de él, del parque y del orden en que caen los hits. Dos equipos
con el mismo pitcheo real pueden terminar con medio punto de diferencia en
efectividad. **FIP** (Fielding Independent Pitching) reconstruye la efectividad
usando solo las tres cosas que sí dependen del lanzador —ponches, bases por bola
más golpeados, y cuadrangulares permitidos— y la pone en la misma escala que la
ERA para que sean comparables. **K-BB%** va un paso más allá: la diferencia entre
el porcentaje de bateadores ponchados y el de bateadores que reciben boleto es la
medida más estable que existe de la habilidad de un lanzador.

**OPS.** Suma OBP y SLG como si valieran lo mismo, y no es cierto: un punto de
OBP produce alrededor de 1.8 veces más carreras que un punto de SLG. **wOBA** le
da a cada evento ofensivo el peso que realmente tiene en carreras, en la misma
escala del OBP para que sea legible. **OPS+** normaliza contra el promedio de la
liga de ese año: 100 es exactamente el promedio, 120 es 20% mejor. Hace falta
porque el ambiente de carreras de la LMB se mueve mucho entre temporadas —el OPS
de la liga pasó de .861 en 2025 a .807 en 2026— y comparar OPS crudos entre años
distintos compara cosas distintas.

LÍMITE QUE HAY QUE DECLARAR
---------------------------
Los pesos lineales de wOBA que se usan aquí son los estándar derivados de Grandes
Ligas. Los propios de la LMB requerirían una matriz de expectativa de carreras
construida jugada por jugada, que no está en estos datos. Es una aproximación
razonable —el orden de los equipos apenas se mueve— pero es una aproximación.
Tampoco hay factores de parque: sin desgloses de local y visitante no se pueden
calcular, así que ni OPS+ ni FIP están ajustados por estadio.
"""

# Pesos lineales estándar (escala wOBA). Ver el límite declarado arriba.
W = {"bb": 0.69, "hbp": 0.72, "1b": 0.89, "2b": 1.27, "3b": 1.62, "hr": 2.10}


# ------------------------------------------------------------------ bateo
def woba_crudo(r):
    """wOBA sin escalar, sobre un jugador o sobre un agregado."""
    den = r["ab"] + r["bb"] + r.get("sf", 0) + r.get("hbp", 0)
    if den <= 0:
        return None
    sencillos = r["h"] - r["d2"] - r["d3"] - r["hr"]
    num = (W["bb"] * r["bb"] + W["hbp"] * r.get("hbp", 0) + W["1b"] * sencillos
           + W["2b"] * r["d2"] + W["3b"] * r["d3"] + W["hr"] * r["hr"])
    return num / den


def suma(rows, *campos):
    return {c: sum(r.get(c, 0) or 0 for r in rows) for c in campos}


def agregado_bateo(rows):
    """Totales de un grupo de bateadores, listos para las funciones de arriba."""
    t = suma(rows, "ab", "bb", "hbp", "sf", "h", "d2", "d3", "hr", "tb", "k", "pa")
    return t


def obp(t):
    den = t["ab"] + t["bb"] + t["hbp"] + t["sf"]
    return (t["h"] + t["bb"] + t["hbp"]) / den if den else None


def slg(t):
    return t["tb"] / t["ab"] if t["ab"] else None


def ops(t):
    a, b = obp(t), slg(t)
    return a + b if a is not None and b is not None else None


def contexto_bateo(todos):
    """Constantes de liga del año: escala de wOBA y promedios para el OPS+."""
    t = agregado_bateo(todos)
    lg_obp, lg_slg = obp(t), slg(t)
    lg_woba_crudo = woba_crudo(t)
    # Escala clásica: se ajusta wOBA para que el promedio de la liga caiga en el OBP.
    escala = lg_obp / lg_woba_crudo if lg_woba_crudo else 1.0
    return {"lgOBP": lg_obp, "lgSLG": lg_slg, "escalaWOBA": escala,
            "lgWOBA": lg_woba_crudo * escala}


def woba(r, ctx):
    c = woba_crudo(r)
    return c * ctx["escalaWOBA"] if c is not None else None


def ops_plus(t, ctx):
    """100 = promedio de la liga. Sin ajuste de parque."""
    a, b = obp(t), slg(t)
    if a is None or b is None:
        return None
    return 100 * (a / ctx["lgOBP"] + b / ctx["lgSLG"] - 1)


# ---------------------------------------------------------------- pitcheo
def agregado_pitcheo(rows):
    t = suma(rows, "ip", "er", "r", "h", "bb", "hbp", "k", "hr", "bf", "pitches")
    return t


def era(t):
    return 9 * t["er"] / t["ip"] if t["ip"] else None


def whip(t):
    return (t["h"] + t["bb"]) / t["ip"] if t["ip"] else None


def contexto_pitcheo(todos):
    """La constante que pone al FIP en la escala de la efectividad de la liga."""
    t = agregado_pitcheo(todos)
    if not t["ip"]:
        return {"cFIP": 3.10, "lgERA": None, "lgKBB": None}
    bruto = (13 * t["hr"] + 3 * (t["bb"] + t["hbp"]) - 2 * t["k"]) / t["ip"]
    lg_era = era(t)
    return {"cFIP": lg_era - bruto, "lgERA": lg_era,
            "lgKBB": 100 * (t["k"] - t["bb"]) / t["bf"] if t["bf"] else None,
            "lgFIP": lg_era}


def fip(t, ctx):
    if not t["ip"]:
        return None
    return (13 * t["hr"] + 3 * (t["bb"] + t["hbp"]) - 2 * t["k"]) / t["ip"] + ctx["cFIP"]


def kbb(t):
    """Ponches menos bases por bola, como porcentaje de bateadores enfrentados."""
    return 100 * (t["k"] - t["bb"]) / t["bf"] if t.get("bf") else None


def k_pct(t):
    return 100 * t["k"] / t["bf"] if t.get("bf") else None


def bb_pct(t):
    return 100 * t["bb"] / t["bf"] if t.get("bf") else None


def era_menos_fip(t, ctx):
    """Negativo = la efectividad se ve mejor de lo que el fondo justifica."""
    e, f_ = era(t), fip(t, ctx)
    return e - f_ if e is not None and f_ is not None else None
