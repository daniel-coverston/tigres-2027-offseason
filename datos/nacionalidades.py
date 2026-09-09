#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
nacionalidades.py
=================
Consigue NACIONALIDAD y FECHA DE NACIMIENTO de todos los jugadores que aparecen
en los CSV descargados de la LMB.

POR QUE FUNCIONA:
Los `player_id` de lmb.com.mx son en realidad los IDs de personas de MLB (por eso
las fotos salen de img.mlbstatic.com/.../people/{id}/headshot/milb/current).
Eso deja consultar la API publica de MLB, que si trae pais de nacimiento y edad:

    https://statsapi.mlb.com/api/v1/people?personIds=665648,598724,...

Sin nacionalidad no se puede auditar el uso de los cupos de importado
(la LMB baja de 18 a 16 extranjeros rumbo a 2028-29), que es el eje del proyecto.

USO
---
    python nacionalidades.py

Se corre desde la carpeta del proyecto (donde esta la carpeta `datos_lmb`).
Tarda ~1 minuto: son unas 45 llamadas.

SALIDA
------
    datos_lmb/bio_jugadores.csv   player_id, nombre, pais, fecha_nac, edad_2026,
                                  estatura, peso, batea, lanza, debut_mlb
    datos_lmb/BIO_RESUMEN.txt     cobertura y conteo por pais
"""

import csv
import glob
import json
import os
import sys
import time
from datetime import date

try:
    import requests
except ImportError:
    sys.exit("Falta 'requests'.  Instala con:  pip install requests")

DATOS = "datos_lmb"
API = "https://statsapi.mlb.com/api/v1/people"
LOTE = 40                      # ids por llamada
REF = date(2026, 7, 1)         # fecha de referencia para la edad (mitad de temporada)

HEADERS = {
    "User-Agent": ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                   "(KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"),
    "Accept": "application/json",
}


def leer_ids():
    """Junta todos los player_id unicos de los CSV, con un nombre de respaldo."""
    if not os.path.isdir(DATOS):
        sys.exit("No encuentro la carpeta '%s'. Corre esto desde la carpeta del proyecto." % DATOS)
    nombres = {}
    archivos = sorted(glob.glob(os.path.join(DATOS, "lmb_*.csv")))
    if not archivos:
        sys.exit("No hay archivos lmb_*.csv en %s. Corre primero descargar_datos_lmb.py" % DATOS)
    for ruta in archivos:
        with open(ruta, encoding="utf-8-sig") as fh:
            for fila in csv.DictReader(fh):
                pid = (fila.get("player_id") or "").strip()
                if pid.isdigit():
                    nombres.setdefault(pid, fila.get("nombre", ""))
    print("Archivos leidos: %d" % len(archivos))
    print("Jugadores unicos: %d\n" % len(nombres))
    return nombres


def edad_al(fecha_nac, ref=REF):
    try:
        y, m, d = [int(x) for x in str(fecha_nac).split("-")[:3]]
    except Exception:
        return ""
    e = ref.year - y - ((ref.month, ref.day) < (m, d))
    return e


def consultar(ids):
    """Consulta un lote de ids. Devuelve lista de dicts 'people'."""
    params = {
        "personIds": ",".join(ids),
        "hydrate": "",
        "fields": ("people,id,fullName,birthDate,birthCountry,birthCity,"
                   "height,weight,batSide,code,pitchHand,mlbDebutDate,"
                   "primaryPosition,abbreviation"),
    }
    for intento in range(3):
        try:
            r = requests.get(API, params=params, headers=HEADERS, timeout=40)
            if r.status_code == 200:
                return r.json().get("people", [])
            print("    HTTP %s (intento %d)" % (r.status_code, intento + 1))
        except Exception as e:
            print("    error: %s (intento %d)" % (e, intento + 1))
        time.sleep(2 * (intento + 1))
    return []


def main():
    nombres = leer_ids()
    ids = sorted(nombres.keys())
    lotes = [ids[i:i + LOTE] for i in range(0, len(ids), LOTE)]

    filas = []
    encontrados = set()
    for i, lote in enumerate(lotes, 1):
        print("  lote %d/%d ..." % (i, len(lotes)), end=" ", flush=True)
        gente = consultar(lote)
        print("%d de %d" % (len(gente), len(lote)))
        for p in gente:
            pid = str(p.get("id"))
            encontrados.add(pid)
            filas.append({
                "player_id": pid,
                "nombre": p.get("fullName") or nombres.get(pid, ""),
                "pais": p.get("birthCountry", ""),
                "ciudad_nac": p.get("birthCity", ""),
                "fecha_nac": p.get("birthDate", ""),
                "edad_2026": edad_al(p.get("birthDate", "")),
                "estatura": p.get("height", ""),
                "peso": p.get("weight", ""),
                "batea": (p.get("batSide") or {}).get("code", ""),
                "lanza": (p.get("pitchHand") or {}).get("code", ""),
                "pos_primaria": (p.get("primaryPosition") or {}).get("abbreviation", ""),
                "debut_mlb": p.get("mlbDebutDate", ""),
            })
        time.sleep(0.4)

    # los que no resolvieron quedan igual en el CSV, con pais vacio
    faltantes = [i for i in ids if i not in encontrados]
    for pid in faltantes:
        filas.append({"player_id": pid, "nombre": nombres.get(pid, ""), "pais": "",
                      "ciudad_nac": "", "fecha_nac": "", "edad_2026": "", "estatura": "",
                      "peso": "", "batea": "", "lanza": "", "pos_primaria": "", "debut_mlb": ""})

    filas.sort(key=lambda f: f["nombre"])
    cols = ["player_id", "nombre", "pais", "ciudad_nac", "fecha_nac", "edad_2026",
            "estatura", "peso", "batea", "lanza", "pos_primaria", "debut_mlb"]
    ruta = os.path.join(DATOS, "bio_jugadores.csv")
    with open(ruta, "w", newline="", encoding="utf-8-sig") as fh:
        w = csv.DictWriter(fh, fieldnames=cols)
        w.writeheader()
        w.writerows(filas)

    # resumen
    por_pais = {}
    for f in filas:
        por_pais[f["pais"] or "(sin dato)"] = por_pais.get(f["pais"] or "(sin dato)", 0) + 1
    orden = sorted(por_pais.items(), key=lambda kv: -kv[1])

    lineas = []
    lineas.append("COBERTURA: %d de %d jugadores con pais (%.1f%%)" % (
        len(encontrados), len(ids), 100.0 * len(encontrados) / max(len(ids), 1)))
    lineas.append("")
    lineas.append("JUGADORES POR PAIS DE NACIMIENTO:")
    for pais, n in orden:
        lineas.append("  %-24s %4d" % (pais, n))
    if faltantes:
        lineas.append("")
        lineas.append("SIN RESOLVER (%d): %s" % (len(faltantes), ", ".join(faltantes[:40])))

    with open(os.path.join(DATOS, "BIO_RESUMEN.txt"), "w", encoding="utf-8") as fh:
        fh.write("\n".join(lineas))

    print("\n" + "=" * 60)
    print("\n".join(lineas[:28]))
    print("\nArchivo: %s" % os.path.abspath(ruta))


if __name__ == "__main__":
    main()
