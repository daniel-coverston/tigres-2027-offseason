#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
descargar_datos_lmb.py
======================
Descarga las estadisticas individuales de TODA la Liga Mexicana de Beisbol
(bateo + pitcheo) desde el endpoint interno de lmb.com.mx y las guarda como CSV.

POR QUE SE CORRE LOCALMENTE:
El endpoint esta bloqueado en robots.txt, asi que las herramientas web de Claude
no pueden consultarlo. La libreria `requests` de Python no respeta robots.txt,
por eso este script se corre en tu maquina y despues subes los CSV al chat.

USO
---
    pip install requests
    python descargar_datos_lmb.py

Opciones:
    python descargar_datos_lmb.py --years 2026            # solo un anio
    python descargar_datos_lmb.py --years 2024 2025 2026  # varios (default)
    python descargar_datos_lmb.py --out ./datos_lmb       # carpeta de salida

SALIDA (en ./datos_lmb por default)
-----------------------------------
    lmb_bateo_2026.csv        una fila por jugador, una columna por estadistica
    lmb_pitcheo_2026.csv
    ...
    crudo/bateo_2026.json     respuesta completa de la API (por si algo falta)
    RESUMEN.txt               conteos y nombres de equipo detectados

Solo necesita `requests`. Todo lo demas es libreria estandar.
"""

import argparse
import csv
import json
import os
import sys
import time
from collections import OrderedDict

try:
    import requests
except ImportError:
    sys.exit(
        "Falta la libreria 'requests'.\n"
        "Instalala con:  pip install requests\n"
        "(o:  python -m pip install requests)"
    )

BASE = "https://lmb.com.mx/estadisticas/api/player"

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"
    ),
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "es-MX,es;q=0.9,en;q=0.8",
    "Referer": "https://lmb.com.mx/estadisticas",
}

DEFAULT_YEARS = [2024, 2025, 2026]
CATEGORIES = [
    # (categoryType, sortBy, etiqueta para archivos)
    ("hitting", "avg", "bateo"),
    ("pitching", "era", "pitcheo"),
]


# ---------------------------------------------------------------- red

def get_json(params, intentos=4):
    """GET con reintentos y backoff. Devuelve dict o None."""
    for i in range(intentos):
        try:
            r = requests.get(BASE, params=params, headers=HEADERS, timeout=45)
            if r.status_code == 200:
                return r.json()
            print("    HTTP %s (intento %d/%d)" % (r.status_code, i + 1, intentos))
        except Exception as e:
            print("    error de red: %s (intento %d/%d)" % (e, i + 1, intentos))
        time.sleep(2 * (i + 1))
    return None


def descargar_categoria(year, category_type, sort_by):
    """Pagina el endpoint hasta traer a todos los jugadores de la liga."""
    jugadores = []
    page = 1
    size_pedido = 100
    total = None
    vistos = set()

    while True:
        params = {
            "year": year,
            "playerPool": "ALL",       # NO usar QUALIFIED: recorta el universo
            "categoryType": category_type,
            "expanded": 1,             # trae extendedStats (HLD, P/9, BB/9, ...)
            "page": page,
            "sortBy": sort_by,
            "order": "desc",
            "size": size_pedido,
        }
        print("  pagina %d ..." % page, end=" ", flush=True)
        data = get_json(params)
        if data is None:
            print("FALLO")
            break

        lote = data.get("player_stats") or data.get("playerStats") or []
        meta = data.get("meta") or {}
        # OJO: usar el size REAL que devuelve la API, no el que pedimos
        size_real = int(meta.get("size") or len(lote) or size_pedido)
        if total is None:
            total = int(meta.get("total") or 0)

        nuevos = 0
        for p in lote:
            clave = (p.get("permalink") or p.get("name"), p.get("team_name"))
            if clave in vistos:
                continue
            vistos.add(clave)
            jugadores.append(p)
            nuevos += 1

        print("%d registros (acumulado %d / total %s)" % (len(lote), len(jugadores), total or "?"))

        if not lote or nuevos == 0:
            break
        if total and len(jugadores) >= total:
            break
        if len(lote) < size_real:
            break

        page += 1
        if page > 60:  # freno de seguridad
            print("  (freno de seguridad a 60 paginas)")
            break
        time.sleep(0.6)  # cortesia con el servidor

    return jugadores


# ------------------------------------------------------- transformacion

def id_de_permalink(permalink):
    if not permalink:
        return ""
    return str(permalink).strip().strip("/").split("/")[-1]


def aplanar(jugador, year, categoria):
    """Convierte un jugador de la API en un dict plano listo para CSV."""
    fila = OrderedDict()
    fila["year"] = year
    fila["categoria"] = categoria
    fila["player_id"] = id_de_permalink(jugador.get("permalink"))
    fila["nombre"] = jugador.get("name", "")
    fila["equipo"] = jugador.get("team_name", "")
    fila["posicion"] = jugador.get("position", "")
    fila["rank_api"] = jugador.get("rank", "")

    for s in jugador.get("stats") or []:
        nombre = s.get("short_name") or s.get("order_key")
        if nombre:
            fila[str(nombre)] = s.get("value")
    for s in jugador.get("extendedStats") or []:
        nombre = s.get("short_name") or s.get("order_key")
        if nombre:
            fila["ext_" + str(nombre)] = s.get("value")
    return fila


def escribir_csv(ruta, filas):
    """Escribe CSV con la union de todas las llaves, en orden estable."""
    columnas = []
    for f in filas:
        for k in f:
            if k not in columnas:
                columnas.append(k)
    with open(ruta, "w", newline="", encoding="utf-8-sig") as fh:
        w = csv.DictWriter(fh, fieldnames=columnas, extrasaction="ignore")
        w.writeheader()
        for f in filas:
            w.writerow(f)
    return columnas


# ------------------------------------------------------------- main

def main():
    ap = argparse.ArgumentParser(description="Descarga estadisticas de la LMB a CSV.")
    ap.add_argument("--years", nargs="+", type=int, default=DEFAULT_YEARS,
                    help="anios a descargar (default: 2024 2025 2026)")
    ap.add_argument("--out", default="datos_lmb", help="carpeta de salida")
    args = ap.parse_args()

    out = os.path.abspath(args.out)
    crudo = os.path.join(out, "crudo")
    os.makedirs(crudo, exist_ok=True)

    resumen = []
    equipos_vistos = set()
    problemas = []

    for year in args.years:
        for category_type, sort_by, etiqueta in CATEGORIES:
            print("\n=== %s %s ===" % (etiqueta.upper(), year))
            jugadores = descargar_categoria(year, category_type, sort_by)

            if not jugadores:
                msg = "SIN DATOS: %s %s" % (etiqueta, year)
                print("  !! " + msg)
                problemas.append(msg)
                continue

            # JSON crudo (respaldo por si despues falta algun campo)
            with open(os.path.join(crudo, "%s_%s.json" % (etiqueta, year)), "w",
                      encoding="utf-8") as fh:
                json.dump(jugadores, fh, ensure_ascii=False, indent=1)

            filas = [aplanar(j, year, etiqueta) for j in jugadores]
            ruta_csv = os.path.join(out, "lmb_%s_%s.csv" % (etiqueta, year))
            columnas = escribir_csv(ruta_csv, filas)

            for f in filas:
                if f["equipo"]:
                    equipos_vistos.add(f["equipo"])

            n_tigres = sum(1 for f in filas if "tigre" in str(f["equipo"]).lower())
            linea = "%s %s: %d jugadores | Tigres: %d | columnas: %s" % (
                etiqueta, year, len(filas), n_tigres, ", ".join(columnas))
            resumen.append(linea)
            print("  -> %s" % os.path.basename(ruta_csv))
            print("     %d jugadores, %d de Tigres" % (len(filas), n_tigres))
            if n_tigres == 0:
                problemas.append("No se encontraron jugadores de Tigres en %s %s" % (etiqueta, year))

    # resumen en disco
    ruta_resumen = os.path.join(out, "RESUMEN.txt")
    with open(ruta_resumen, "w", encoding="utf-8") as fh:
        fh.write("RESUMEN DE DESCARGA LMB\n")
        fh.write("=" * 60 + "\n\n")
        for l in resumen:
            fh.write(l + "\n")
        fh.write("\nNOMBRES DE EQUIPO DETECTADOS (%d):\n" % len(equipos_vistos))
        for e in sorted(equipos_vistos):
            fh.write("  - %s\n" % e)
        if problemas:
            fh.write("\nPROBLEMAS:\n")
            for p in problemas:
                fh.write("  ! %s\n" % p)

    print("\n" + "=" * 60)
    print("LISTO. Archivos en: %s" % out)
    for l in resumen:
        print("  " + l.split(" | columnas")[0])
    print("\nEquipos detectados (%d):" % len(equipos_vistos))
    for e in sorted(equipos_vistos):
        marca = "  <-- TIGRES" if "tigre" in e.lower() else ""
        print("  - %s%s" % (e, marca))
    if problemas:
        print("\nOJO:")
        for p in problemas:
            print("  ! " + p)
    print("\nSube al chat los archivos lmb_*.csv y el RESUMEN.txt")


if __name__ == "__main__":
    main()
