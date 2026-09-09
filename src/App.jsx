import React, { useMemo, useState, useEffect } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ScatterChart, Scatter, ZAxis, LineChart, Line, ReferenceLine, ReferenceArea, Cell, LabelList,
} from "recharts";
import DATA from "./data.json";

/* ============================================================================
   PALETA — Tigres de Quintana Roo
   El naranja de marca es EXCLUSIVO de "esto es Tigres". Nunca significa bueno
   ni malo. La polaridad bueno/malo vive en una sola escala verde-azulado <->
   carmesi, usada igual en los tiers, en los percentiles y en la auditoria de
   cupos, para que el lector aprenda un solo codigo de color en todo el tablero.
   Validada para daltonismo sobre el fondo #0A1E38: deutan dE 8.2,
   vision normal dE 25.2, contraste >= 3:1 en los tres tonos.
   ========================================================================== */
const C = {
  bg: "#081A31",
  bg2: "#0A1E38",
  panel: "#102A4C",
  panel2: "#0C2242",
  line: "#1E3D64",
  line2: "#2A4E7A",
  ink: "#F3F6FA",
  ink2: "#A3B7D0",
  ink3: "#7089A8",
  tigres: "#E0710D",
  tigresSoft: "rgba(224,113,13,.12)",
  bien: "#12A08A",
  mal: "#D93F52",
  neutro: "#4E6586",
  neutro2: "#7E93AE",
};

const TIERS = {
  Fortaleza: { color: C.bien, label: "Fortaleza" },
  Promedio: { color: C.neutro2, label: "Promedio" },
  Oportunidad: { color: C.mal, label: "Área de oportunidad" },
};

const HIT_POS = ["C", "1B", "2B", "3B", "SS", "OF", "DH"];
const PIT_POS = ["SP", "RP"];
const POS_LABEL = {
  C: "Receptor", "1B": "Primera base", "2B": "Segunda base", "3B": "Tercera base",
  SS: "Shortstop", OF: "Jardineros", DH: "Bateador designado",
  SP: "Abridores", RP: "Relevistas",
};
const POS_CORTO = {
  C: "C", "1B": "1B", "2B": "2B", "3B": "3B", SS: "SS", OF: "OF", DH: "DH", SP: "ABR", RP: "REL",
};

const METRICS = {
  hit: [
    { key: "ops", label: "OPS", dec: 3, dir: 1, largo: "OPS (embasarse + poder)" },
    { key: "avg", label: "AVG", dec: 3, dir: 1, largo: "Promedio de bateo" },
    { key: "obp", label: "OBP", dec: 3, dir: 1, largo: "Porcentaje de embasarse" },
    { key: "slg", label: "SLG", dec: 3, dir: 1, largo: "Slugging (poder)" },
    { key: "hr", label: "HR", dec: 0, dir: 1, largo: "Cuadrangulares" },
  ],
  pitch: [
    { key: "era", label: "ERA", dec: 2, dir: -1, largo: "Efectividad" },
    { key: "whip", label: "WHIP", dec: 2, dir: -1, largo: "Corredores por entrada" },
    { key: "k9", label: "K/9", dec: 1, dir: 1, largo: "Ponches por 9 entradas" },
    { key: "bb9", label: "BB/9", dec: 1, dir: -1, largo: "Bases por bola por 9" },
    { key: "hr", label: "HR", dec: 0, dir: -1, largo: "Cuadrangulares permitidos" },
  ],
};

const PAIS = {
  USA: "Estados Unidos", Mexico: "México", "Dominican Republic": "Rep. Dominicana",
  Venezuela: "Venezuela", Cuba: "Cuba", "Puerto Rico": "Puerto Rico", Panama: "Panamá",
  Colombia: "Colombia", Japan: "Japón", Canada: "Canadá", Curacao: "Curazao",
  Nicaragua: "Nicaragua", Brazil: "Brasil", Italy: "Italia", Australia: "Australia",
  Germany: "Alemania", Bahamas: "Bahamas", "Saint Martin": "San Martín",
  Netherlands: "Países Bajos", Lithuania: "Lituania", "Republic of Korea": "Corea del Sur",
  Chile: "Chile", Spain: "España", Czechia: "Chequia", "South Africa": "Sudáfrica",
  Singapore: "Singapur", "(sin dato)": "Sin dato",
};
const pais = (p) => PAIS[p] || p;

/* ------------------------------------------------------------------ utils */
const fmt = (v, dec) =>
  v === null || v === undefined || Number.isNaN(v) ? "—"
    : dec === 3 ? Number(v).toFixed(3).replace(/^0\./, ".") : Number(v).toFixed(dec);

const ord = (n) => `${n}.º`;

function tierOf(rank, total) {
  const p = rank / total;
  if (p <= 0.33) return "Fortaleza";
  if (p <= 0.66) return "Promedio";
  return "Oportunidad";
}

/* Percentil = magnitud -> rampa secuencial de una sola familia de color.
   (La convencion azul-rojo de Baseball Savant es divergente y chocaria de
   frente con el rojo de "area de oportunidad" del resto del tablero.) */
function pctColor(p) {
  if (p === null || p === undefined) return C.neutro;
  const t = Math.max(0, Math.min(100, p)) / 100;
  const a = [116, 134, 158], b = [53, 214, 180];
  return `rgb(${a.map((x, i) => Math.round(x + (b[i] - x) * t)).join(",")})`;
}
const gsnColor = (g) => (g > 0.001 ? C.bien : g < -0.001 ? C.mal : C.neutro2);

const initials = (n) =>
  (n || "").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
const headshot = (pid, s = 88) =>
  `https://img.mlbstatic.com/mlb-photos/image/upload/w_${s},g_auto,c_fill/v1/people/${pid}/headshot/milb/current`;
const norm = (s) => (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/* =========================================================== estilos base */
const CSS = `
*{box-sizing:border-box}
body{margin:0}
.tqr{
  --gap:18px;
  min-height:100vh;background:${C.bg};color:${C.ink};
  font-family:Inter,'Segoe UI',system-ui,-apple-system,Roboto,Helvetica,Arial,sans-serif;
  font-size:14px;line-height:1.5;-webkit-font-smoothing:antialiased;
}
.tqr .disp{font-family:'Barlow Condensed',Inter,'Segoe UI',system-ui,sans-serif;letter-spacing:.2px}
.tqr .num{font-variant-numeric:tabular-nums;font-feature-settings:"tnum" 1}
.tqr button{font:inherit;color:inherit}
.tqr button:focus-visible,.tqr select:focus-visible,.tqr input:focus-visible{
  outline:2px solid ${C.tigres};outline-offset:2px}
.tqr .wrap{max-width:1200px;margin:0 auto;padding:0 22px 72px}
.tqr .sticky{position:sticky;top:0;z-index:30;background:${C.bg}f2;backdrop-filter:blur(8px);
  border-bottom:1px solid ${C.line};padding-top:14px}
.tqr .row{display:flex;flex-wrap:wrap;gap:var(--gap)}
.tqr .cards{display:flex;flex-wrap:wrap;gap:12px}
.tqr .kpis{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}
@media (max-width:900px){.tqr .kpis{grid-template-columns:repeat(2,1fr)}}
@media (max-width:520px){.tqr .kpis{grid-template-columns:1fr}}
.tqr .two{display:grid;grid-template-columns:1fr 1fr;gap:var(--gap)}
.tqr .card{transition:border-color .14s ease,transform .14s ease,background .14s ease}
.tqr .card:hover{border-color:${C.line2};transform:translateY(-1px)}
.tqr .tab{transition:background .14s ease,color .14s ease,border-color .14s ease}
.tqr table{width:100%;border-collapse:collapse}
.tqr .scrollx{overflow-x:auto;-webkit-overflow-scrolling:touch}
.tqr tbody tr:hover{background:rgba(255,255,255,.035)}
@media (max-width:820px){
  .tqr .two{grid-template-columns:1fr}
  .tqr .wrap{padding:0 14px 56px}
  .tqr .cards>*{flex:1 1 100%!important;width:auto!important}
}
@media (prefers-reduced-motion:reduce){.tqr *{transition:none!important}}
`;

/* --------------------------------------------------------------- piezas */
function Marca({ size = 46 }) {
  const [logo, setLogo] = useState(true);
  if (logo)
    return (
      <img src="logo.png" alt="Tigres de Quintana Roo" onError={() => setLogo(false)}
        style={{ width: size, height: size, objectFit: "contain", flex: `0 0 ${size}px` }} />
    );
  // Sin logo oficial disponible: marca tipografica sobre la silueta del home.
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-label="Tigres de Quintana Roo"
      style={{ flex: `0 0 ${size}px` }}>
      <path d="M6 6h36v22L24 43 6 28Z" fill={C.tigres} />
      <text x="24" y="27" textAnchor="middle" fontSize="15" fontWeight="800"
        fontFamily="'Barlow Condensed',sans-serif" fill={C.bg} letterSpacing="1.2">TQR</text>
    </svg>
  );
}

function Avatar({ p, size = 44 }) {
  const [bad, setBad] = useState(false);
  const ring = p.esTigre ? C.tigres : C.line2;
  const base = {
    width: size, height: size, borderRadius: "50%", flex: `0 0 ${size}px`,
    background: C.panel2, border: `2px solid ${ring}`,
  };
  if (bad)
    return (
      <div style={{
        ...base, color: C.ink2, display: "flex", alignItems: "center",
        justifyContent: "center", fontSize: size * 0.33, fontWeight: 700,
      }}>{initials(p.nombre)}</div>
    );
  return <img src={headshot(p.pid, size * 2)} alt="" onError={() => setBad(true)}
    style={{ ...base, objectFit: "cover" }} />;
}

function Chip({ children, color = C.neutro2, solid = false, title }) {
  return (
    <span title={title} style={{
      display: "inline-block", padding: "2px 8px", borderRadius: 999, fontSize: 11,
      fontWeight: 700, letterSpacing: .3, whiteSpace: "nowrap",
      color: solid ? C.bg : color, background: solid ? color : "transparent",
      border: `1px solid ${color}`,
    }}>{children}</span>
  );
}

function Panel({ title, sub, children, style, aside }) {
  return (
    <section style={{
      background: C.panel, border: `1px solid ${C.line}`, borderRadius: 14,
      padding: 18, marginBottom: 18, ...style,
    }}>
      {(title || aside) && (
        <header style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: sub ? 4 : 14 }}>
          {title && <h3 className="disp" style={{ margin: 0, fontSize: 19, fontWeight: 600, color: C.ink, flex: 1 }}>{title}</h3>}
          {aside}
        </header>
      )}
      {sub && <p style={{ margin: "0 0 14px", fontSize: 12.5, color: C.ink3, lineHeight: 1.55, maxWidth: 880 }}>{sub}</p>}
      {children}
    </section>
  );
}

function StatTile({ label, value, unit, foot, tone = C.ink, big = false }) {
  return (
    <div style={{
      background: C.panel2, border: `1px solid ${C.line}`, borderRadius: 12, padding: "15px 17px",
    }}>
      <div style={{ fontSize: 10.5, color: C.ink3, textTransform: "uppercase", letterSpacing: 1, marginBottom: 9, fontWeight: 600 }}>{label}</div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
        <span className="disp num" style={{ fontSize: big ? 44 : 36, fontWeight: 700, color: tone, lineHeight: .95 }}>{value}</span>
        {unit && <span style={{ fontSize: 13, color: C.ink2, fontWeight: 600 }}>{unit}</span>}
      </div>
      {foot && <div style={{ fontSize: 11.5, color: C.ink2, marginTop: 8, lineHeight: 1.45 }}>{foot}</div>}
    </div>
  );
}

function PercentileBar({ label, largo, raw, pct }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 11, marginBottom: 9 }}>
      <div title={largo} style={{ width: 46, fontSize: 12, color: C.ink2, fontWeight: 700 }}>{label}</div>
      <div className="num" style={{ width: 50, fontSize: 12.5, color: C.ink, textAlign: "right" }}>{raw}</div>
      <div style={{
        flex: 1, height: 10, background: "#071628", borderRadius: 999,
        border: `1px solid ${C.line}`, position: "relative", overflow: "hidden",
      }}>
        <div style={{ position: "absolute", left: "50%", top: 0, bottom: 0, width: 1, background: C.line2 }} />
        <div style={{
          position: "absolute", left: 0, top: 0, bottom: 0,
          width: `max(5px, ${pct ?? 0}%)`, background: pctColor(pct), borderRadius: 999,
        }} />
      </div>
      <div className="num" style={{ width: 28, fontSize: 13, fontWeight: 800, color: pctColor(pct), textAlign: "right" }}>
        {pct ?? "—"}
      </div>
    </div>
  );
}

function PlayerCard({ p, onClick }) {
  const kind = p.kind;
  const main = kind === "hit" ? "ops" : "era";
  const mainPct = kind === "hit" ? p.p_ops : p.p_era;
  const m = METRICS[kind][0];
  const t = TIERS[tierOf(p.rank, p.total)];
  return (
    <button className="card" onClick={onClick} style={{
      flex: "0 0 258px", width: 258, textAlign: "left", cursor: "pointer",
      background: C.panel2, border: `1px solid ${C.line}`, borderLeft: `3px solid ${t.color}`,
      borderRadius: 12, padding: 14,
    }}>
      <div style={{ display: "flex", gap: 11, alignItems: "center" }}>
        <Avatar p={p} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 10.5, color: C.ink3, fontWeight: 700, letterSpacing: .7, textTransform: "uppercase" }}>{POS_LABEL[p.pos]}</div>
          <div className="disp" style={{ fontSize: 17, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.nombre}</div>
          <div style={{ fontSize: 11.5, color: C.ink3, marginTop: 1 }}>
            {p.edad ? `${p.edad} años · ` : ""}{pais(p.pais)}
          </div>
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 12, marginTop: 13 }}>
        <div>
          <div className="disp num" style={{ fontSize: 34, fontWeight: 700, lineHeight: .9, color: pctColor(mainPct) }}>{mainPct ?? "—"}</div>
          <div style={{ fontSize: 10, color: C.ink3, marginTop: 4, letterSpacing: .6, fontWeight: 600 }}>PERCENTIL {m.label}</div>
        </div>
        <div style={{ marginLeft: "auto", textAlign: "right" }}>
          <div className="num" style={{ fontSize: 15, fontWeight: 700 }}>{fmt(p[main], m.dec)}</div>
          <div className="num" style={{ fontSize: 11, color: C.ink3 }}>#{p.rank} de {p.total}</div>
        </div>
      </div>
      <div style={{ marginTop: 11, display: "flex", gap: 6, flexWrap: "wrap" }}>
        <Chip color={t.color}>{t.label}</Chip>
        {!p.mexicano && (
          <Chip color={gsnColor(p.gsn)} title="Rendimiento del cupo de importado frente al jugador mexicano mediano de esta posición">
            {p.gsn > 0 ? "Cupo rentable" : "Cupo no rentable"}
          </Chip>
        )}
      </div>
    </button>
  );
}

/* --------------------------------------------------------------- tooltips */
const box = {
  background: C.panel2, border: `1px solid ${C.line2}`, borderRadius: 10,
  padding: "9px 12px", fontSize: 12.5, color: C.ink, lineHeight: 1.6,
  boxShadow: "0 8px 24px rgba(0,0,0,.35)",
};
const Tip = ({ children }) => <div style={box}>{children}</div>;

/* ============================================================ diagnostico */
function CuadranteEquipos({ eqs }) {
  const mid = {
    ops: eqs.reduce((a, e) => a + e.ops, 0) / eqs.length,
    era: eqs.reduce((a, e) => a + e.era, 0) / eqs.length,
  };
  const minO = Math.min(...eqs.map((e) => e.ops)), maxO = Math.max(...eqs.map((e) => e.ops));
  const minE = Math.min(...eqs.map((e) => e.era)), maxE = Math.max(...eqs.map((e) => e.era));
  // Cuantos equipos comparten el cuadrante y que tan lejos queda Tigres del siguiente.
  const cuad = eqs.filter((e) => e.era < mid.era && e.ops < mid.ops).sort((a, b) => a.ops - b.ops);
  const yo = eqs.find((e) => e.equipo === "Tigres");
  const sig = cuad.find((e) => e.equipo !== "Tigres");
  const ptsAbajo = sig && yo ? Math.round((sig.ops - yo.ops) * 1000) : null;
  return (
    <Panel
      title="Los 20 equipos en un solo cuadro"
      sub={`OPS en el eje horizontal, efectividad en el vertical (invertida: arriba es mejor pitcheo). Siete equipos combinan pitcheo por encima del promedio con ofensiva por debajo — el cuadrante sombreado. Tigres es el caso extremo del grupo: batea ${ptsAbajo} puntos de OPS menos que el siguiente de esa lista.`}
    >
      <ResponsiveContainer width="100%" height={430}>
        <ScatterChart margin={{ top: 14, right: 26, left: 2, bottom: 26 }}>
          <CartesianGrid stroke={C.line} strokeDasharray="2 4" />
          <ReferenceArea x1={minO - .01} x2={mid.ops} y1={minE - .1} y2={mid.era}
            fill={C.tigres} fillOpacity={.05} stroke="none" />
          <XAxis type="number" dataKey="ops" domain={[minO - .012, maxO + .012]}
            tick={{ fill: C.ink3, fontSize: 11 }} axisLine={{ stroke: C.line }} tickLine={false}
            tickFormatter={(v) => fmt(v, 3)}
            label={{ value: "OPS del equipo  →  más ofensiva", position: "insideBottom", offset: -14, fill: C.ink3, fontSize: 11.5 }} />
          <YAxis type="number" dataKey="era" reversed domain={[minE - .15, maxE + .15]}
            tickCount={6} tickFormatter={(v) => Number(v).toFixed(2)} allowDecimals
            tick={{ fill: C.ink3, fontSize: 11 }} axisLine={false} tickLine={false}
            label={{ value: "↑ mejor pitcheo   (ERA)", angle: -90, position: "insideLeft", offset: 16, fill: C.ink3, fontSize: 11.5 }} />
          <ZAxis range={[110, 110]} />
          <ReferenceLine x={mid.ops} stroke={C.line2} strokeDasharray="4 4" />
          <ReferenceLine y={mid.era} stroke={C.line2} strokeDasharray="4 4" />
          <Tooltip cursor={{ strokeDasharray: "3 3", stroke: C.ink3 }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const d = payload[0].payload;
              return (
                <Tip>
                  <div className="disp" style={{ fontSize: 16, fontWeight: 600 }}>{d.equipo}</div>
                  <div className="num">OPS {fmt(d.ops, 3)} · {ord(d.rank_ops)} de 20</div>
                  <div className="num">ERA {fmt(d.era, 2)} · {ord(d.rank_era)} de 20</div>
                  <div className="num" style={{ color: C.ink3 }}>Récord {d.g}-{d.pp}</div>
                </Tip>
              );
            }} />
          <Scatter data={eqs.filter((e) => e.equipo !== "Tigres")} fill={C.neutro} fillOpacity={.85} isAnimationActive={false}>
            <LabelList dataKey="equipo" position="right" offset={9}
              style={{ fill: C.ink3, fontSize: 10 }} />
          </Scatter>
          <Scatter data={eqs.filter((e) => e.equipo === "Tigres")} fill={C.tigres}
            stroke={C.bg} strokeWidth={2.5} isAnimationActive={false}>
            <LabelList dataKey="equipo" position="right" offset={10}
              style={{ fill: C.tigres, fontSize: 12, fontWeight: 700 }} />
          </Scatter>
        </ScatterChart>
      </ResponsiveContainer>
      <p style={{ fontSize: 12, color: C.ink3, marginTop: 4, marginBottom: 0 }}>
        Las líneas punteadas marcan el promedio de la liga en cada eje. La zona sombreada es el
        cuadrante donde el pitcheo alcanza para competir y la ofensiva no. Cada punto resume a los
        jugadores <i>calificados</i> que la liga lista con ese equipo, ponderados por turnos al bate
        y entradas lanzadas; un jugador cambiado a media temporada cuenta con su último equipo.
      </p>
    </Panel>
  );
}

function MapaPosiciones({ jug, ir }) {
  const filas = [...HIT_POS, ...PIT_POS].map((pos) => {
    const grupo = jug.filter((d) => d.pos === pos);
    const mios = grupo.filter((d) => d.esTigre);
    const kind = HIT_POS.includes(pos) ? "hit" : "pitch";
    const mejor = mios.length ? mios.reduce((a, b) => (a.rank < b.rank ? a : b)) : null;
    const p = mejor ? (kind === "hit" ? mejor.p_ops : mejor.p_era) : null;
    return { pos, kind, mejor, pct: p, n: mios.length, total: grupo.length };
  });
  return (
    <Panel
      title="Todo el roster de un vistazo"
      sub="Percentil del mejor jugador de Tigres en cada posición, dentro de los calificados de toda la liga. Más claro y verde es mejor. Haz clic para abrir el detalle."
    >
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(104px,1fr))", gap: 8 }}>
        {filas.map((f) => (
          <button key={f.pos} className="card" onClick={() => ir(f.kind, f.pos)} style={{
            cursor: "pointer", textAlign: "left", borderRadius: 11, padding: "11px 12px",
            background: f.pct === null ? "transparent" : `${pctColor(f.pct)}22`,
            border: `1px solid ${f.pct === null ? C.mal : C.line}`,
          }}>
            <div className="disp" style={{ fontSize: 15, fontWeight: 600, color: C.ink2, letterSpacing: .6 }}>{POS_CORTO[f.pos]}</div>
            <div className="disp num" style={{ fontSize: 30, fontWeight: 700, lineHeight: 1, color: f.pct === null ? C.mal : pctColor(f.pct), marginTop: 4 }}>
              {f.pct ?? "—"}
            </div>
            <div style={{ fontSize: 10.5, color: C.ink3, marginTop: 6, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {f.mejor ? f.mejor.nombre : "sin calificado"}
            </div>
          </button>
        ))}
      </div>
    </Panel>
  );
}

function Diagnostico({ ir, year, jug, aud, eqs }) {
  const t = DATA.tendencia;
  const yo = eqs.find((e) => e.equipo === "Tigres");
  const rankData = t.map((d) => ({ year: d.year, Bateo: 21 - d.opsRank, Pitcheo: 21 - d.eraRank, opsRank: d.opsRank, eraRank: d.eraRank }));
  const miHit = aud.find((a) => a.kind === "hit" && a.equipo === "Tigres");
  const miPit = aud.find((a) => a.kind === "pitch" && a.equipo === "Tigres");
  const esActual = String(year) === "2026";
  const bats = jug.filter((d) => d.esTigre && d.kind === "hit");
  const totalBat = bats.length;
  const sobreMedia = bats.filter((d) => (d.p_ops ?? 0) > 50).length;

  return (
    <div>
      <Panel style={{ background: `linear-gradient(150deg,${C.panel},${C.panel2})`, borderLeft: `3px solid ${C.tigres}` }}>
        <h2 className="disp" style={{ margin: "0 0 12px", fontSize: 30, fontWeight: 600, lineHeight: 1.2 }}>
          El pitcheo de Tigres no es el problema.
        </h2>
        <p style={{ margin: 0, fontSize: 15, color: C.ink2, lineHeight: 1.75, maxWidth: 800 }}>
          En {year} Tigres terminó <b style={{ color: C.bien }}>{ord(yo.rank_era)} de 20 en efectividad</b> y
          {" "}<b style={{ color: C.mal }}>{ord(yo.rank_ops)} de 20 en OPS</b>.
          {esActual && <> No es el efecto de un mal cierre: la ofensiva lleva tres años seguidos en el
          fondo de la liga mientras el pitcheo sube año con año. Es una diferencia estructural,
          no una racha.</>}
        </p>
      </Panel>

      <div className="kpis" style={{ marginBottom: 18 }}>
        <StatTile label="Bateadores sobre la media" value={`${sobreMedia}`} unit={`de ${totalBat}`} big
          tone={sobreMedia / Math.max(totalBat, 1) < .4 ? C.mal : C.ink}
          foot="Calificados que superan el percentil 50 de su posición" />
        <StatTile label="OPS de los calificados" value={fmt(yo.ops, 3)} tone={C.mal}
          foot={`${ord(yo.rank_ops)} de 20 en la liga`} />
        <StatTile label="Efectividad de los calificados" value={fmt(yo.era, 2)} tone={C.bien}
          foot={`${ord(yo.rank_era)} de 20 en la liga`} />
        <StatTile label="Cuadrangulares" value={yo.hr} tone={yo.rank_hr > 14 ? C.mal : C.ink}
          foot={`${ord(yo.rank_hr)} de 20 en la liga`} />
        <StatTile label="Cupos importados · bateo" value={ord(miHit.rank)} unit="de 20" tone={gsnColor(miHit.gsn)}
          foot={`${miHit.gsn > 0 ? "+" : ""}${fmt(miHit.gsn, 3)} de OPS sobre el mexicano mediano`} />
        <StatTile label="Cupos importados · pitcheo" value={ord(miPit.rank)} unit="de 20" tone={gsnColor(miPit.gsn)}
          foot={`${miPit.gsn > 0 ? "+" : ""}${fmt(miPit.gsn, 2)} de efectividad sobre el mexicano mediano`} />
      </div>

      <CuadranteEquipos eqs={eqs} />

      <Panel
        title="Tres años, dos direcciones opuestas"
        sub="Lugar de Tigres entre los 20 equipos. Más alto es mejor. Son dos medidas de escala distinta, así que van en dos paneles: nunca en un mismo eje."
      >
        <div className="two">
          {[["Bateo", "opsRank", C.mal], ["Pitcheo", "eraRank", C.bien]].map(([label, rk, col]) => (
            <div key={label}>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: C.ink, marginBottom: 6 }}>
                {label} <span style={{ color: C.ink3, fontWeight: 400 }}>— lugar en la liga</span>
              </div>
              <ResponsiveContainer width="100%" height={215}>
                <LineChart data={rankData} margin={{ top: 8, right: 18, left: -18, bottom: 4 }}>
                  <CartesianGrid stroke={C.line} strokeDasharray="2 4" vertical={false} />
                  <XAxis dataKey="year" tick={{ fill: C.ink3, fontSize: 11 }} axisLine={{ stroke: C.line }} tickLine={false} />
                  <YAxis domain={[0, 20]} ticks={[1, 5, 10, 15, 20]} tickFormatter={(v) => ord(21 - v)}
                    tick={{ fill: C.ink3, fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={box} labelStyle={{ color: C.ink2 }}
                    formatter={(v, n, o) => [`lugar ${o.payload[rk]} de 20`, label]} />
                  <ReferenceLine y={10.5} stroke={C.ink3} strokeDasharray="4 4"
                    label={{ value: "media de la liga", fill: C.ink3, fontSize: 10, position: "insideBottomRight" }} />
                  <Line type="monotone" dataKey={label} stroke={col} strokeWidth={2.5} isAnimationActive={false}
                    dot={{ r: 5, fill: col, stroke: C.bg, strokeWidth: 2 }}
                    activeDot={{ r: 7, stroke: C.bg, strokeWidth: 2 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ))}
        </div>
        <p style={{ fontSize: 13, color: C.ink2, lineHeight: 1.75, marginTop: 12, marginBottom: 0, maxWidth: 840 }}>
          El pitcheo subió del lugar 13 al 5 en tres temporadas. El bateo estuvo 20.º, 16.º y 19.º.
          Cualquier plan que reparta el presupuesto por igual entre las dos mitades del equipo está
          ignorando lo que estos dos paneles llevan tres años diciendo.
        </p>
      </Panel>

      <MapaPosiciones jug={jug} ir={ir} />

      <Panel title="A dónde ir desde aquí">
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {[["cupos", "La auditoría de cupos de importado"], ["hit", "El detalle del bateo"], ["plan", "El plan 2027"]].map(([k, l]) => (
            <button key={k} className="tab" onClick={() => ir(k)} style={{
              background: "transparent", border: `1px solid ${C.tigres}`, color: C.tigres,
              borderRadius: 10, padding: "10px 16px", cursor: "pointer", fontSize: 13, fontWeight: 600,
            }}>{l} →</button>
          ))}
        </div>
      </Panel>
    </div>
  );
}

/* ====================================================== detalle posicion */
function Tabla({ rows, kind, buscador = true }) {
  const [q, setQ] = useState("");
  const cols = METRICS[kind];
  const vis = useMemo(() => {
    const k = norm(q).trim();
    if (!k) return rows;
    return rows.filter((d) => norm(d.nombre).includes(k) || norm(d.equipo).includes(k) || norm(pais(d.pais)).includes(k));
  }, [rows, q]);
  const th = { textAlign: "right", padding: "9px 10px", color: C.ink3, fontSize: 10.5, fontWeight: 700, letterSpacing: .6, borderBottom: `1px solid ${C.line2}`, whiteSpace: "nowrap", textTransform: "uppercase" };
  const td = { textAlign: "right", padding: "8px 10px", fontSize: 12.5, borderBottom: `1px solid ${C.panel2}` };
  return (
    <>
      {buscador && (
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar jugador, equipo o país…"
          style={{
            background: C.bg2, color: C.ink, border: `1px solid ${C.line}`, borderRadius: 9,
            padding: "8px 12px", fontSize: 13, marginBottom: 12, width: "min(320px,100%)",
            fontFamily: "inherit",
          }} />
      )}
      <div className="scrollx">
        <table style={{ minWidth: 660 }}>
          <thead>
            <tr>
              <th style={{ ...th, textAlign: "left" }}>#</th>
              <th style={{ ...th, textAlign: "left" }}>Jugador</th>
              <th style={{ ...th, textAlign: "left" }}>Equipo</th>
              <th style={{ ...th, textAlign: "left" }}>Origen</th>
              <th style={th}>Edad</th>
              {cols.map((c) => <th key={c.key} style={th} title={c.largo}>{c.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {vis.map((d) => (
              <tr key={d.pid} style={{ background: d.esTigre ? C.tigresSoft : "transparent" }}>
                <td className="num" style={{ ...td, textAlign: "left", color: C.ink3 }}>{d.rank}</td>
                <td style={{ ...td, textAlign: "left", fontWeight: d.esTigre ? 700 : 500, color: d.esTigre ? C.tigres : C.ink }}>{d.nombre}</td>
                <td style={{ ...td, textAlign: "left", color: C.ink2 }}>{d.equipo}</td>
                <td style={{ ...td, textAlign: "left", color: C.ink3 }}>{pais(d.pais)}</td>
                <td className="num" style={td}>{d.edad ?? "—"}</td>
                {cols.map((c) => <td key={c.key} className="num" style={td}>{fmt(d[c.key], c.dec)}</td>)}
              </tr>
            ))}
            {vis.length === 0 && (
              <tr><td colSpan={5 + cols.length} style={{ ...td, textAlign: "center", color: C.ink3, padding: 22 }}>Sin resultados para “{q}”.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

function PositionDetail({ pos, kind, jug, onClose }) {
  const grupo = useMemo(() => jug.filter((d) => d.pos === pos && d.kind === kind), [pos, kind, jug]);
  const mios = grupo.filter((d) => d.esTigre);
  const [sel, setSel] = useState(mios[0]?.pid ?? grupo[0]?.pid);
  const [statKey, setStatKey] = useState(METRICS[kind][0].key);
  useEffect(() => { setSel(mios[0]?.pid ?? grupo[0]?.pid); }, [pos, kind]);
  const metric = METRICS[kind].find((m) => m.key === statKey);
  const jugador = grupo.find((d) => d.pid === sel) || grupo[0];

  const barras = useMemo(() => {
    const rows = grupo.filter((d) => d[metric.key] !== null && d[metric.key] !== undefined);
    rows.sort((a, b) => (metric.dir === 1 ? b[metric.key] - a[metric.key] : a[metric.key] - b[metric.key]));
    const top = rows.slice(0, 25);
    // Si ningun Tigre entra al top, se anexan para que la grafica nunca deje de contestar
    // la pregunta que el usuario vino a hacer.
    const faltan = rows.filter((d) => d.esTigre && !top.includes(d));
    return [...top, ...faltan];
  }, [grupo, metric]);

  const hist = DATA.historial[sel];

  return (
    <div>
      <button className="tab" onClick={onClose} style={{
        background: "transparent", border: `1px solid ${C.line2}`, color: C.ink2,
        borderRadius: 9, padding: "7px 13px", cursor: "pointer", fontSize: 12.5, marginBottom: 14,
      }}>← Volver</button>

      <h2 className="disp" style={{ margin: "0 0 4px", fontSize: 27, fontWeight: 600 }}>
        {POS_LABEL[pos]}{" "}
        <span style={{ color: C.ink3, fontWeight: 400, fontSize: 16 }}>· {grupo.length} calificados en la liga</span>
      </h2>

      {mios.length > 1 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "14px 0 2px" }}>
          {mios.map((m) => (
            <button key={m.pid} className="tab" onClick={() => setSel(m.pid)} style={{
              background: sel === m.pid ? C.tigres : "transparent",
              color: sel === m.pid ? C.bg : C.ink2,
              border: `1px solid ${sel === m.pid ? C.tigres : C.line2}`,
              borderRadius: 999, padding: "5px 14px", cursor: "pointer", fontSize: 12.5, fontWeight: 600,
            }}>{m.nombre}</button>
          ))}
        </div>
      )}

      {jugador && (
        <Panel style={{ marginTop: 14 }}>
          <div className="row">
            <div style={{ flex: "1 1 340px", minWidth: 300 }}>
              <div style={{ display: "flex", gap: 14, alignItems: "center", marginBottom: 16 }}>
                <Avatar p={jugador} size={64} />
                <div>
                  <div className="disp" style={{ fontSize: 23, fontWeight: 600 }}>{jugador.nombre}</div>
                  <div style={{ fontSize: 12.5, color: C.ink3, marginTop: 2 }}>
                    {jugador.equipo} · {pais(jugador.pais)}{jugador.edad ? ` · ${jugador.edad} años` : ""}
                  </div>
                  <div style={{ marginTop: 8, display: "flex", gap: 6, flexWrap: "wrap" }}>
                    <Chip color={TIERS[tierOf(jugador.rank, jugador.total)].color}>
                      {TIERS[tierOf(jugador.rank, jugador.total)].label}
                    </Chip>
                    {!jugador.mexicano && (
                      <Chip color={gsnColor(jugador.gsn)}>
                        Cupo {jugador.gsn > 0 ? "rentable" : "no rentable"}
                      </Chip>
                    )}
                  </div>
                </div>
              </div>
              {METRICS[kind].map((m) => (
                <PercentileBar key={m.key} label={m.label} largo={m.largo}
                  raw={fmt(jugador[m.key], m.dec)} pct={jugador["p_" + m.key]} />
              ))}
              <p style={{ fontSize: 11.5, color: C.ink3, marginTop: 12, lineHeight: 1.55 }}>
                Percentil dentro de los {grupo.length} calificados de la liga en esta posición.
                Más alto siempre es mejor: en ERA, WHIP, BB/9 y HR permitidos la escala ya viene
                invertida. La línea del centro de cada barra marca el percentil 50.
              </p>
            </div>

            {hist && hist.temporadas.length > 1 && (
              <div style={{ flex: "1 1 280px", minWidth: 250 }}>
                <div style={{ fontSize: 12.5, color: C.ink2, fontWeight: 700, marginBottom: 6 }}>
                  Percentil por temporada
                </div>
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={hist.temporadas} margin={{ top: 8, right: 12, left: -18, bottom: 4 }}>
                    <CartesianGrid stroke={C.line} strokeDasharray="2 4" vertical={false} />
                    <XAxis dataKey="year" tick={{ fill: C.ink3, fontSize: 11 }} axisLine={{ stroke: C.line }} tickLine={false} />
                    <YAxis domain={[0, 100]} tick={{ fill: C.ink3, fontSize: 11 }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={box} labelStyle={{ color: C.ink2 }}
                      formatter={(v, n, o) => [`percentil ${v} · ${o.payload.equipo}`, ""]} />
                    <Line type="monotone" dataKey="pctil" stroke={C.tigres} strokeWidth={2.5} isAnimationActive={false}
                      dot={{ r: 4.5, fill: C.tigres, stroke: C.bg, strokeWidth: 2 }} />
                  </LineChart>
                </ResponsiveContainer>
                <p style={{ fontSize: 11.5, color: C.ink3, lineHeight: 1.5, margin: 0 }}>
                  Trayectoria 2024–2026, incluidos los años en que jugó para otro equipo.
                </p>
              </div>
            )}
          </div>
        </Panel>
      )}

      <Panel
        title={`Ranking de la liga — ${POS_LABEL[pos]}`}
        sub="Top 25 de la posición, más cualquier jugador de Tigres que no alcance el top. Las barras naranjas son de Tigres."
        aside={
          <select value={statKey} onChange={(e) => setStatKey(e.target.value)} style={{
            background: C.bg2, color: C.ink, border: `1px solid ${C.line2}`,
            borderRadius: 9, padding: "7px 11px", fontSize: 12.5, fontFamily: "inherit",
          }}>
            {METRICS[kind].map((m) => <option key={m.key} value={m.key}>Ordenar por {m.label}</option>)}
          </select>
        }
      >
        <ResponsiveContainer width="100%" height={Math.max(320, barras.length * 23)}>
          <BarChart data={barras} layout="vertical" margin={{ top: 4, right: 34, left: 104, bottom: 4 }}>
            <CartesianGrid stroke={C.line} strokeDasharray="2 4" horizontal={false} />
            <XAxis type="number" tickFormatter={(v) => fmt(v, metric.dec)}
              tick={{ fill: C.ink3, fontSize: 11 }} axisLine={{ stroke: C.line }} tickLine={false} />
            <YAxis type="category" dataKey="nombre" width={100} interval={0}
              tick={{ fill: C.ink2, fontSize: 10.5 }} axisLine={false} tickLine={false} />
            <Tooltip cursor={{ fill: "rgba(255,255,255,.045)" }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const d = payload[0].payload;
                return (
                  <Tip>
                    <div className="disp" style={{ fontSize: 16, fontWeight: 600 }}>{d.nombre}</div>
                    <div style={{ color: C.ink3 }}>{d.equipo} · {pais(d.pais)}{d.edad ? ` · ${d.edad} años` : ""}</div>
                    <div className="num">{metric.largo}: <b>{fmt(d[metric.key], metric.dec)}</b></div>
                  </Tip>
                );
              }} />
            <Bar dataKey={metric.key} radius={[0, 4, 4, 0]} barSize={13} isAnimationActive={false}>
              {barras.map((d) => <Cell key={d.pid} fill={d.esTigre ? C.tigres : C.neutro} stroke={C.bg} strokeWidth={2} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </Panel>

      <Panel
        title={kind === "hit" ? "Llegar a base vs. poder" : "Control vs. dominio"}
        sub={kind === "hit"
          ? "OBP en el eje horizontal, SLG en el vertical. Arriba a la derecha es el mejor cuadrante."
          : "BB/9 en el eje horizontal (menos es mejor), K/9 en el vertical. Arriba a la izquierda es el mejor cuadrante."}
      >
        <ResponsiveContainer width="100%" height={340}>
          <ScatterChart margin={{ top: 10, right: 24, left: -2, bottom: 20 }}>
            <CartesianGrid stroke={C.line} strokeDasharray="2 4" />
            <XAxis type="number" dataKey={kind === "hit" ? "obp" : "bb9"} domain={["dataMin", "dataMax"]}
              tick={{ fill: C.ink3, fontSize: 11 }} axisLine={{ stroke: C.line }} tickLine={false}
              tickFormatter={(v) => (kind === "hit" ? fmt(v, 3) : fmt(v, 1))}
              label={{ value: kind === "hit" ? "OBP" : "BB/9", position: "insideBottom", offset: -10, fill: C.ink3, fontSize: 11.5 }} />
            <YAxis type="number" dataKey={kind === "hit" ? "slg" : "k9"} domain={["dataMin", "dataMax"]}
              tick={{ fill: C.ink3, fontSize: 11 }} axisLine={false} tickLine={false}
              tickFormatter={(v) => (kind === "hit" ? fmt(v, 3) : fmt(v, 1))}
              label={{ value: kind === "hit" ? "SLG" : "K/9", angle: -90, position: "insideLeft", offset: 20, fill: C.ink3, fontSize: 11.5 }} />
            <ZAxis range={[75, 75]} />
            <Tooltip cursor={{ strokeDasharray: "3 3", stroke: C.ink3 }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const d = payload[0].payload;
                return (
                  <Tip>
                    <div className="disp" style={{ fontSize: 16, fontWeight: 600 }}>{d.nombre}</div>
                    <div style={{ color: C.ink3 }}>{d.equipo}</div>
                    <div className="num">{kind === "hit"
                      ? <>OBP {fmt(d.obp, 3)} · SLG {fmt(d.slg, 3)} · OPS <b>{fmt(d.ops, 3)}</b></>
                      : <>BB/9 {fmt(d.bb9, 1)} · K/9 {fmt(d.k9, 1)} · ERA <b>{fmt(d.era, 2)}</b></>}
                    </div>
                  </Tip>
                );
              }} />
            <Scatter data={grupo.filter((d) => !d.esTigre)} fill={C.neutro} fillOpacity={.72} isAnimationActive={false} />
            <Scatter data={grupo.filter((d) => d.esTigre)} fill={C.tigres} stroke={C.bg} strokeWidth={2} isAnimationActive={false} />
          </ScatterChart>
        </ResponsiveContainer>
        <Leyenda items={[[C.tigres, "Tigres", true], [C.neutro, "Resto de la liga", true]]} />
      </Panel>

      <Panel title="Tabla completa de la posición">
        <Tabla rows={grupo} kind={kind} />
      </Panel>
    </div>
  );
}

function Leyenda({ items }) {
  return (
    <div style={{ display: "flex", gap: 18, fontSize: 12, color: C.ink2, marginTop: 6, flexWrap: "wrap" }}>
      {items.map(([col, txt, redondo]) => (
        <span key={txt} style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
          <i style={{ width: 10, height: 10, borderRadius: redondo ? 10 : 2, background: col, display: "inline-block" }} />
          {txt}
        </span>
      ))}
    </div>
  );
}

/* ======================================================== vista por grupo */
function VistaGrupo({ kind, jug, abierta, setAbierta }) {
  const [sub, setSub] = useState("fort");
  const poss = kind === "hit" ? HIT_POS : PIT_POS;

  const mios = useMemo(
    () => jug.filter((d) => d.esTigre && d.kind === kind).sort((a, b) => a.rank / a.total - b.rank / b.total),
    [kind, jug]
  );
  const fort = mios.filter((d) => tierOf(d.rank, d.total) === "Fortaleza");
  const resto = mios.filter((d) => tierOf(d.rank, d.total) !== "Fortaleza")
    .sort((a, b) => b.rank / b.total - a.rank / a.total);
  const huecos = poss.filter((p) => !mios.some((d) => d.pos === p));

  if (abierta) return <PositionDetail pos={abierta} kind={kind} jug={jug} onClose={() => setAbierta(null)} />;

  const lista = sub === "fort" ? fort : resto;
  const nOpor = resto.length + huecos.length;

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        {[["fort", "Fortalezas", fort.length, C.bien], ["opor", "Áreas de oportunidad", nOpor, C.mal]].map(([k, l, n, col]) => (
          <button key={k} className="tab" onClick={() => setSub(k)} style={{
            background: sub === k ? C.panel : "transparent",
            color: sub === k ? C.ink : C.ink3,
            border: `1px solid ${sub === k ? C.line2 : "transparent"}`,
            borderRadius: 10, padding: "9px 15px", cursor: "pointer", fontSize: 13, fontWeight: 600,
            display: "inline-flex", alignItems: "center", gap: 8,
          }}>
            {l}
            <span className="num" style={{
              background: sub === k ? col : "transparent", color: sub === k ? C.bg : col,
              border: `1px solid ${col}`, borderRadius: 999, padding: "0 7px", fontSize: 11, fontWeight: 800,
            }}>{n}</span>
          </button>
        ))}
      </div>

      {kind === "hit" && sub === "fort" && fort.length <= 1 && (
        <div style={{
          background: C.tigresSoft, border: `1px solid ${C.mal}`, borderRadius: 12,
          padding: "14px 16px", marginBottom: 16, maxWidth: 840,
        }}>
          <div className="disp" style={{ fontSize: 17, fontWeight: 600, color: C.mal, marginBottom: 5 }}>
            Esto no es un error del tablero.
          </div>
          <p style={{ margin: 0, fontSize: 13, color: C.ink2, lineHeight: 1.7 }}>
            De {mios.length} bateadores calificados, {fort.length === 1 ? "solo uno alcanza" : "ninguno alcanza"} el
            tercio superior de su posición en la liga. Los demás están en las áreas de oportunidad.
            Es exactamente el hallazgo del proyecto, visto de cerca.
          </p>
        </div>
      )}

      <p style={{ fontSize: 12.5, color: C.ink3, margin: "0 0 16px", maxWidth: 800, lineHeight: 1.65 }}>
        Cada jugador se clasifica por sí mismo, no por su posición: si hay tres jardineros y solo uno
        rinde, los otros dos aparecen con su propia tarjeta en vez de quedar tapados por el bueno.
        Haz clic en cualquier tarjeta para abrir el detalle de esa posición.
      </p>

      <div className="cards">
        {lista.map((p) => <PlayerCard key={p.pid + p.pos} p={p} onClick={() => setAbierta(p.pos)} />)}
        {sub === "opor" && huecos.map((p) => (
          <button key={p} className="card" onClick={() => setAbierta(p)} style={{
            flex: "0 0 258px", width: 258, textAlign: "left", cursor: "pointer", minHeight: 158,
            background: "transparent", border: `1px dashed ${C.mal}`, borderRadius: 12, padding: 14,
          }}>
            <div style={{ fontSize: 10.5, color: C.ink3, fontWeight: 700, letterSpacing: .7, textTransform: "uppercase" }}>{POS_LABEL[p]}</div>
            <div className="disp" style={{ fontSize: 19, fontWeight: 600, marginTop: 6, color: C.mal }}>Sin jugador calificado</div>
            <p style={{ fontSize: 12, color: C.ink3, marginTop: 8, lineHeight: 1.55 }}>
              Ningún jugador de Tigres alcanzó el mínimo de participación en esta posición.
            </p>
          </button>
        ))}
        {lista.length === 0 && huecos.length === 0 && (
          <p style={{ color: C.ink3, fontSize: 13 }}>Sin jugadores en esta categoría.</p>
        )}
      </div>
    </div>
  );
}

/* ================================================================= cupos */
function EdadRendimiento({ jug }) {
  const datos = jug.filter((d) => d.esTigre && d.edad).map((d) => ({
    ...d, pct: d.kind === "hit" ? d.p_ops : d.p_era,
    grupo: d.mexicano ? "mex" : "imp",
  })).filter((d) => d.pct !== null && d.pct !== undefined);
  const mex = datos.filter((d) => d.grupo === "mex");
  const imp = datos.filter((d) => d.grupo === "imp");
  const prom = (a) => (a.length ? a.reduce((s, d) => s + d.edad, 0) / a.length : 0);
  // Cuadrante caro e improductivo: 31 anios o mas y por debajo de la media de la liga.
  const caros = datos.filter((d) => d.edad >= 31 && d.pct < 50)
    .sort((a, b) => a.pct - b.pct).slice(0, 8).sort((a, b) => a.edad - b.edad);

  return (
    <Panel
      title="Edad contra rendimiento, jugador por jugador"
      sub="Cada punto es un jugador calificado de Tigres. A la derecha, más viejo; arriba, mejor percentil en su posición. El cuadrante de abajo a la derecha —viejo y por debajo de la media— es dinero y cupos que no volvieron."
    >
      <ResponsiveContainer width="100%" height={360}>
        <ScatterChart margin={{ top: 12, right: 26, left: -4, bottom: 22 }}>
          <CartesianGrid stroke={C.line} strokeDasharray="2 4" />
          <ReferenceArea x1={31} x2={40} y1={0} y2={50} fill={C.mal} fillOpacity={.11} stroke="none" />
          <XAxis type="number" dataKey="edad" domain={[19, 40]}
            tick={{ fill: C.ink3, fontSize: 11 }} axisLine={{ stroke: C.line }} tickLine={false}
            label={{ value: "Edad en la temporada", position: "insideBottom", offset: -12, fill: C.ink3, fontSize: 11.5 }} />
          <YAxis type="number" dataKey="pct" domain={[0, 100]}
            tick={{ fill: C.ink3, fontSize: 11 }} axisLine={false} tickLine={false}
            label={{ value: "Percentil en su posición", angle: -90, position: "insideLeft", offset: 18, fill: C.ink3, fontSize: 11.5 }} />
          <ZAxis range={[95, 95]} />
          <ReferenceLine y={50} stroke={C.line2} strokeDasharray="4 4"
            label={{ value: "media de la liga", fill: C.ink3, fontSize: 10, position: "insideTopRight" }} />
          <Tooltip cursor={{ strokeDasharray: "3 3", stroke: C.ink3 }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const d = payload[0].payload;
              return (
                <Tip>
                  <div className="disp" style={{ fontSize: 16, fontWeight: 600 }}>{d.nombre}</div>
                  <div style={{ color: C.ink3 }}>{POS_LABEL[d.pos]} · {pais(d.pais)} · {d.edad} años</div>
                  <div className="num">Percentil <b style={{ color: pctColor(d.pct) }}>{d.pct}</b>{" "}
                    · {d.kind === "hit" ? `OPS ${fmt(d.ops, 3)}` : `ERA ${fmt(d.era, 2)}`}</div>
                </Tip>
              );
            }} />
          <Scatter name="Importados" data={imp} fill={C.mal} fillOpacity={.9} stroke={C.bg} strokeWidth={1.5} isAnimationActive={false} />
          <Scatter name="Mexicanos" data={mex} fill={C.bien} fillOpacity={.9} stroke={C.bg} strokeWidth={1.5} isAnimationActive={false} />
          <Scatter data={caros} fill="transparent" isAnimationActive={false}>
            {/* Etiquetas alternadas arriba/abajo: con ocho nombres en un cuadrante
                pequeno, una sola posicion los encima unos con otros. */}
            <LabelList dataKey="nombre" content={(pr) => {
              const { x, y, value, index } = pr;
              if (x === undefined) return null;
              // Ciclo de cuatro alturas + anclaje al borde: con ocho nombres en un
              // cuadrante chico, una sola posicion los encima unos sobre otros.
              const dy = [-12, 20, -26, 34][index % 4];
              const cerca = x > 1050;
              return (
                <text x={x + (cerca ? -8 : 0)} y={y + dy}
                  textAnchor={cerca ? "end" : "middle"}
                  fill={C.ink2} fontSize={10.5} fontWeight={600}
                  stroke={C.bg} strokeWidth={3} paintOrder="stroke">{value}</text>
              );
            }} />
          </Scatter>
        </ScatterChart>
      </ResponsiveContainer>
      <Leyenda items={[[C.bien, `Mexicanos — edad promedio ${prom(mex).toFixed(1)} años`, true],
      [C.mal, `Importados — edad promedio ${prom(imp).toFixed(1)} años`, true]]} />
      <p style={{ fontSize: 12.5, color: C.ink2, lineHeight: 1.7, marginTop: 12, marginBottom: 0, maxWidth: 840 }}>
        Los importados son en promedio {(prom(imp) - prom(mex)).toFixed(1)} años mayores que los
        mexicanos del roster, y buena parte de ellos vive en la mitad baja del eje vertical.
        Se pagó veteranía y no llegó el rendimiento que la justifica.
      </p>
    </Panel>
  );
}

function Cupos({ jug, aud }) {
  const [kind, setKind] = useState("hit");
  const filas = aud.filter((a) => a.kind === kind).sort((a, b) => a.rank - b.rank);
  const imports = jug.filter((d) => d.esTigre && d.kind === kind && !d.mexicano).sort((a, b) => a.gsn - b.gsn);
  const nacionales = jug.filter((d) => d.esTigre && d.kind === kind && d.mexicano).sort((a, b) => a.rank / a.total - b.rank / b.total);
  const dec = kind === "hit" ? 3 : 2;
  const mio = filas.find((f) => f.equipo === "Tigres");

  return (
    <div>
      <Panel style={{ background: `linear-gradient(150deg,${C.panel},${C.panel2})`, borderLeft: `3px solid ${C.tigres}` }}>
        <h2 className="disp" style={{ margin: "0 0 12px", fontSize: 27, fontWeight: 600, lineHeight: 1.25 }}>
          El cupo de importado es el activo más escaso del club — y se está encogiendo.
        </h2>
        <p style={{ margin: 0, fontSize: 14.5, color: C.ink2, lineHeight: 1.75, maxWidth: 820 }}>
          La LMB pasó de 20 extranjeros por equipo en 2024–2025 a <b>18 en 2026–2027</b>, con la meta
          declarada de llegar a <b>16 en 2028–2029</b>. Un cupo solo se justifica si compra producción
          que el mercado mexicano no da. La medida de abajo es exactamente eso: cuánto rindió cada
          importado <b>por encima del jugador mexicano mediano de su misma posición</b>. Si el número
          es negativo, un nacional habría rendido más y el cupo salió sobrando.
        </p>
      </Panel>

      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {[["hit", "Bateo"], ["pitch", "Pitcheo"]].map(([k, l]) => (
          <button key={k} className="tab" onClick={() => setKind(k)} style={{
            background: kind === k ? C.panel : "transparent", color: kind === k ? C.ink : C.ink3,
            border: `1px solid ${kind === k ? C.line2 : "transparent"}`, borderRadius: 10,
            padding: "9px 16px", cursor: "pointer", fontSize: 13, fontWeight: 600,
          }}>{l}</button>
        ))}
      </div>

      <Panel
        title={`Retorno de los cupos de importado — ${kind === "hit" ? "bateo" : "pitcheo"}`}
        sub={kind === "hit"
          ? "Puntos de OPS que los importados de cada equipo dieron por encima del bateador mexicano mediano de su posición, ponderado por turnos al bate."
          : "Carreras limpias de ventaja que los importados de cada equipo dieron sobre el pitcher mexicano mediano de su rol, ponderado por entradas lanzadas."}
      >
        <ResponsiveContainer width="100%" height={480}>
          <BarChart data={filas} layout="vertical" margin={{ top: 4, right: 34, left: 92, bottom: 4 }}>
            <CartesianGrid stroke={C.line} strokeDasharray="2 4" horizontal={false} />
            <XAxis type="number" tick={{ fill: C.ink3, fontSize: 11 }} axisLine={{ stroke: C.line }} tickLine={false}
              tickFormatter={(v) => (v > 0 ? "+" : "") + fmt(v, dec)} />
            <YAxis type="category" dataKey="equipo" width={88} interval={0}
              tick={{ fill: C.ink2, fontSize: 11 }} axisLine={false} tickLine={false} />
            <Tooltip cursor={{ fill: "rgba(255,255,255,.045)" }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const d = payload[0].payload;
                return (
                  <Tip>
                    <div className="disp" style={{ fontSize: 16, fontWeight: 600 }}>{d.equipo}</div>
                    <div className="num">Ventaja sobre el nacional mediano:{" "}
                      <b style={{ color: gsnColor(d.gsn) }}>{d.gsn > 0 ? "+" : ""}{fmt(d.gsn, dec)}</b></div>
                    <div className="num" style={{ color: C.ink3 }}>
                      {d.nImports} importados calificados · {d.shareImport}% del {kind === "hit" ? "total de turnos" : "total de entradas"}
                    </div>
                  </Tip>
                );
              }} />
            <ReferenceLine x={0} stroke={C.ink3} />
            <Bar dataKey="gsn" barSize={15} isAnimationActive={false}>
              {filas.map((d) => (
                <Cell key={d.equipo} fill={d.equipo === "Tigres" ? C.tigres : gsnColor(d.gsn)}
                  stroke={C.bg} strokeWidth={2} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        <Leyenda items={[[C.tigres, `Tigres — ${ord(mio.rank)} de 20`, false],
        [C.bien, "Los cupos rindieron más que un nacional", false],
        [C.mal, "Los cupos rindieron menos que un nacional", false]]} />
      </Panel>

      <Panel
        title={`Cupo por cupo: los importados de Tigres en ${kind === "hit" ? "el bateo" : "el pitcheo"}`}
        sub="Del peor al mejor retorno, contra la mediana de los mexicanos calificados en su misma posición o rol."
      >
        <div className="scrollx">
          <table style={{ minWidth: 700 }}>
            <thead>
              <tr>
                {["Pos", "Jugador", "Origen", "Edad", kind === "hit" ? "OPS" : "ERA", "Nacional mediano", "Ventaja", "Veredicto"].map((h, i) => (
                  <th key={h} style={{
                    textAlign: i < 3 ? "left" : "right", padding: "9px 10px", color: C.ink3,
                    fontSize: 10.5, fontWeight: 700, letterSpacing: .6, textTransform: "uppercase",
                    borderBottom: `1px solid ${C.line2}`, whiteSpace: "nowrap",
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {imports.map((d) => {
                const base = kind === "hit" ? d.ops - d.gsn : d.era + d.gsn;
                const ok = d.gsn > 0;
                const cel = { padding: "9px 10px", fontSize: 12.5, borderBottom: `1px solid ${C.panel2}` };
                return (
                  <tr key={d.pid}>
                    <td style={{ ...cel, color: C.ink3 }}>{d.pos}</td>
                    <td style={{ ...cel, fontSize: 13, fontWeight: 600 }}>{d.nombre}</td>
                    <td style={{ ...cel, color: C.ink2 }}>{pais(d.pais)}</td>
                    <td className="num" style={{ ...cel, textAlign: "right", color: d.edad >= 33 ? C.mal : C.ink }}>{d.edad ?? "—"}</td>
                    <td className="num" style={{ ...cel, textAlign: "right" }}>{fmt(kind === "hit" ? d.ops : d.era, dec)}</td>
                    <td className="num" style={{ ...cel, textAlign: "right", color: C.ink3 }}>{fmt(base, dec)}</td>
                    <td className="num" style={{ ...cel, textAlign: "right", fontSize: 13, fontWeight: 800, color: gsnColor(d.gsn) }}>
                      {d.gsn > 0 ? "+" : ""}{fmt(d.gsn, dec)}
                    </td>
                    <td style={{ ...cel, textAlign: "right" }}>
                      <Chip color={ok ? C.bien : C.mal}>{ok ? "Cupo rentable" : "Cupo no rentable"}</Chip>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p style={{ fontSize: 12, color: C.ink3, marginTop: 14, lineHeight: 1.65, maxWidth: 860 }}>
          <b style={{ color: C.ink2 }}>Sobre el dato de origen:</b> se usa el país de nacimiento del
          registro público de MLB. La elegibilidad real de la LMB también admite naturalizados y
          descendientes de mexicanos, así que un puñado de casos puede aparecer como extranjero sin
          ocupar cupo. El club tiene el dato exacto; la conclusión agregada no se mueve por unos pocos casos.
        </p>
      </Panel>

      <EdadRendimiento jug={jug} />

      <Panel
        title={`El contraste: los mexicanos de Tigres en ${kind === "hit" ? "el bateo" : "el pitcheo"}`}
        sub="Los mismos jugadores, sin consumir un solo cupo."
      >
        <Tabla rows={nacionales} kind={kind} buscador={false} />
      </Panel>
    </div>
  );
}

/* ================================================================== plan */
function Plan() {
  const jug = DATA.jugadores["2026"];
  const huecos = DATA.plan.huecos.filter((h) => h.kind === "hit")
    .sort((a, b) => (a.pctilMejor ?? -1) - (b.pctilMejor ?? -1));
  const [pos, setPos] = useState(huecos[0]?.pos);
  const objetivos = DATA.plan.objetivos[pos] || [];
  const mios = jug.filter((d) => d.esTigre && d.pos === pos && d.kind === "hit");

  return (
    <div>
      <Panel style={{ background: `linear-gradient(150deg,${C.panel},${C.panel2})`, borderLeft: `3px solid ${C.tigres}` }}>
        <h2 className="disp" style={{ margin: "0 0 12px", fontSize: 27, fontWeight: 600, lineHeight: 1.25 }}>
          Dónde poner el dinero y los cupos en 2027
        </h2>
        <p style={{ margin: 0, fontSize: 14.5, color: C.ink2, lineHeight: 1.75, maxWidth: 820 }}>
          Las posiciones van ordenadas por el percentil del mejor jugador de Tigres en cada una:
          arriba, lo más urgente. Para cada hueco se muestran los seis jugadores que mejor rindieron
          ahí en la liga — no como una lista de fichajes, sino como el <b>perfil de producción</b> que
          hay que igualar. La disponibilidad contractual la tiene el club.
        </p>
      </Panel>

      <Panel title="Prioridades del lineup" sub="Percentil del mejor bateador de Tigres en cada posición, entre los calificados de toda la liga.">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(178px,1fr))", gap: 10 }}>
          {huecos.map((h, i) => {
            const act = h.pos === pos;
            const col = (h.pctilMejor ?? 0) < 34 ? C.mal : (h.pctilMejor ?? 0) < 67 ? C.neutro2 : C.bien;
            return (
              <button key={h.pos} className="card" onClick={() => setPos(h.pos)} style={{
                textAlign: "left", cursor: "pointer", minHeight: 136,
                background: act ? C.panel2 : "transparent",
                border: `1px solid ${act ? C.tigres : C.line}`, borderRadius: 12, padding: 13,
              }}>
                <div style={{ fontSize: 10, color: C.ink3, fontWeight: 700, letterSpacing: .7 }}>PRIORIDAD {i + 1}</div>
                <div className="disp" style={{ fontSize: 16, fontWeight: 600, color: C.ink2, marginTop: 2 }}>{POS_LABEL[h.pos]}</div>
                <div className="disp num" style={{ fontSize: 32, fontWeight: 700, color: col, marginTop: 8, lineHeight: 1 }}>
                  {h.pctilMejor ?? "—"}
                </div>
                <div style={{ fontSize: 10.5, color: C.ink3, marginTop: 2 }}>percentil del mejor</div>
                <div style={{ fontSize: 12, color: C.ink2, marginTop: 7 }}>{h.mejorMio ?? "sin calificado"}</div>
              </button>
            );
          })}
        </div>
      </Panel>

      <Panel
        title={`${POS_LABEL[pos]} — qué tiene Tigres y qué rinde el resto de la liga`}
        sub="Arriba, los jugadores de Tigres en la posición. Abajo, los seis mejores de la liga como referencia de producción."
      >
        <div className="scrollx" style={{ marginBottom: 20 }}>
          <table style={{ minWidth: 560 }}>
            <tbody>
              {mios.map((d) => (
                <tr key={d.pid} style={{ background: C.tigresSoft }}>
                  <td style={{ padding: "10px 10px", fontSize: 13.5, fontWeight: 700, color: C.tigres }}>{d.nombre}</td>
                  <td style={{ padding: "10px 10px", fontSize: 12.5, color: C.ink2 }}>{pais(d.pais)}</td>
                  <td className="num" style={{ padding: "10px 10px", fontSize: 12.5, textAlign: "right" }}>{d.edad ?? "—"} años</td>
                  <td className="num" style={{ padding: "10px 10px", fontSize: 12.5, textAlign: "right" }}>OPS {fmt(d.ops, 3)}</td>
                  <td className="num" style={{ padding: "10px 10px", fontSize: 13.5, fontWeight: 800, textAlign: "right", color: pctColor(d.p_ops) }}>
                    percentil {d.p_ops}
                  </td>
                </tr>
              ))}
              {mios.length === 0 && (
                <tr><td style={{ padding: "10px", fontSize: 13, color: C.mal }}>Ningún jugador calificado de Tigres en esta posición.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="cards">
          {objetivos.map((o) => (
            <div key={o.nombre} className="card" style={{
              flex: "0 0 232px", width: 232, background: C.panel2,
              border: `1px solid ${C.line}`, borderLeft: `3px solid ${C.bien}`,
              borderRadius: 12, padding: 13,
            }}>
              <div className="disp" style={{ fontSize: 17, fontWeight: 600 }}>{o.nombre}</div>
              <div style={{ fontSize: 11.5, color: C.ink3, marginTop: 2 }}>
                {o.equipo} · {pais(o.pais)}{o.edad ? ` · ${o.edad} años` : ""}
              </div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 10 }}>
                <span className="disp num" style={{ fontSize: 23, fontWeight: 700 }}>{fmt(o.ops, 3)}</span>
                <span style={{ fontSize: 11.5, color: C.ink3 }}>OPS · percentil {o.pctil}</span>
              </div>
              <div style={{ marginTop: 9 }}>
                <Chip color={o.mexicano ? C.bien : C.neutro2}>
                  {o.mexicano ? "No ocupa cupo" : "Ocupa cupo"}
                </Chip>
              </div>
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="Cómo leer esto en una junta de tres minutos">
        <ol style={{ margin: 0, paddingLeft: 20, color: C.ink2, fontSize: 14, lineHeight: 1.95, maxWidth: 840 }}>
          <li>El pitcheo funciona y viene mejorando tres años seguidos. No es donde está el problema.</li>
          <li>La ofensiva lleva tres años en el fondo. Ahí va el presupuesto de 2027.</li>
          <li>Los cupos de importado del lineup rindieron por debajo del bateador mexicano mediano.
            No es que se hayan usado demasiados: es que se usaron mal.</li>
          <li>El bullpen que sostuvo la temporada es mexicano y joven. Es la base que se conserva,
            y el cupo que libera se reinvierte en el lineup.</li>
          <li>El límite de extranjeros baja a 16 rumbo a 2028–2029. Cada cupo mal asignado cuesta
            más cada año que pasa.</li>
        </ol>
      </Panel>
    </div>
  );
}

/* =========================================================== metodologia */
function Metodologia() {
  const [open, setOpen] = useState(false);
  const dl = { display: "grid", gridTemplateColumns: "auto 1fr", gap: "10px 18px", fontSize: 12.5, color: C.ink2, lineHeight: 1.65, margin: 0 };
  const dt = { color: C.ink, fontWeight: 700, whiteSpace: "nowrap" };
  return (
    <section style={{ marginTop: 30, paddingTop: 18, borderTop: `1px solid ${C.line}` }}>
      <button className="tab" onClick={() => setOpen(!open)} style={{
        background: "transparent", border: `1px solid ${C.line2}`, color: C.ink2,
        borderRadius: 9, padding: "8px 14px", cursor: "pointer", fontSize: 12.5, fontWeight: 600,
      }}>
        {open ? "Ocultar" : "Ver"} fuentes y método {open ? "▲" : "▼"}
      </button>
      {open && (
        <div style={{ marginTop: 16, maxWidth: 900 }}>
          <dl style={dl}>
            <dt style={dt}>Fuente</dt>
            <dd style={{ margin: 0 }}>Estadísticas individuales de la LMB 2024–2026 del servicio de
              estadísticas de lmb.com.mx. País de nacimiento y fecha de nacimiento del registro
              público de MLB, enlazado por el mismo identificador de jugador (cobertura: 1,787 de 1,787).</dd>
            <dt style={dt}>Calificación</dt>
            <dd style={{ margin: 0 }}>{DATA.filtros.minAB} turnos al bate para bateadores;
              {" "}{DATA.filtros.minIP_SP} entradas para abridores y {DATA.filtros.minIP_RP} para relevistas.
              Los cerradores acumulan pocas entradas por diseño, así que las tablas completas
              incluyen a todos los calificados de la liga, no solo a los de Tigres.</dd>
            <dt style={dt}>Rol</dt>
            <dd style={{ margin: 0 }}>La fuente no distingue abridor de relevista. Se infiere de la
              razón aperturas entre juegos {">="} 0.5.</dd>
            <dt style={dt}>Entradas</dt>
            <dd style={{ margin: 0 }}>Vienen en notación beisbolera (88.1 = 88 y un tercio) y se
              convierten a decimal antes de cualquier cálculo.</dd>
            <dt style={dt}>Posiciones</dt>
            <dd style={{ margin: 0 }}>Se usa la posición realmente jugada según el servicio de
              estadísticas, no la nominal del roster. Los jardines se agrupan porque la fuente a
              veces etiqueta genérico.</dd>
            <dt style={dt}>Percentil</dt>
            <dd style={{ margin: 0 }}>Posición del jugador dentro de los calificados de su misma
              posición en toda la liga. Más alto siempre es mejor; en ERA, WHIP, BB/9 y HR permitidos
              la escala se invierte.</dd>
            <dt style={dt}>Ventaja sobre<br />el nacional</dt>
            <dd style={{ margin: 0 }}>Para cada importado, su OPS (o su ERA) menos la mediana de los
              jugadores mexicanos calificados en su misma posición ese año, ponderado por turnos al
              bate o entradas lanzadas. Cuando hay menos de cinco mexicanos calificados en una
              posición se usa la mediana mexicana global, para no comparar contra una muestra
              de dos o tres jugadores.</dd>
            <dt style={dt}>Clasificación</dt>
            <dd style={{ margin: 0 }}>Cada jugador se clasifica individualmente por su lugar dentro
              de su posición: tercio superior es Fortaleza, tercio inferior es Área de oportunidad.
              Nunca se etiqueta una posición entera con el resultado de su mejor jugador.</dd>
            <dt style={dt}>Atribución<br />por equipo</dt>
            <dd style={{ margin: 0 }}>Las cifras de equipo son la suma ponderada de sus jugadores
              calificados. La fuente asigna a cada jugador un solo equipo por temporada, así que
              quien fue cambiado a media campaña cuenta completo con el último. Por eso el tablero
              no publica récords de ganados y perdidos derivados de esta fuente: el análisis vive
              en el nivel de jugador, donde la atribución sí es exacta.</dd>
            <dt style={dt}>Límite</dt>
            <dd style={{ margin: 0 }}>El país de nacimiento es una aproximación a la condición de
              importado: la LMB también considera nacionales a naturalizados y descendientes de
              mexicanos. La conclusión agregada no depende de unos pocos casos, pero el dato exacto
              de elegibilidad lo tiene el club.</dd>
          </dl>
        </div>
      )}
    </section>
  );
}

/* =================================================================== app */
const TABS = [
  ["diag", "Diagnóstico"], ["hit", "Bateo"], ["pitch", "Pitcheo"],
  ["cupos", "Cupos de importado"], ["plan", "Plan 2027"],
];

export default function App() {
  const [tab, setTab] = useState("diag");
  const [year, setYear] = useState("2026");
  const [abiertaHit, setAbiertaHit] = useState(null);
  const [abiertaPit, setAbiertaPit] = useState(null);

  const jug = DATA.jugadores[year];
  const aud = DATA.auditoria[year];
  const eqs = DATA.equipos[year];

  const ir = (destino, pos) => {
    if (pos) {
      if (destino === "hit") setAbiertaHit(pos); else setAbiertaPit(pos);
    }
    setTab(destino);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  useEffect(() => { window.scrollTo({ top: 0 }); }, [tab, year]);

  return (
    <div className="tqr">
      <style>{CSS}</style>

      <div className="sticky">
        <div className="wrap" style={{ paddingBottom: 0 }}>
          <header style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 14, flexWrap: "wrap" }}>
            <Marca />
            <div style={{ flex: 1, minWidth: 220 }}>
              <h1 className="disp" style={{ margin: 0, fontSize: 25, fontWeight: 600, lineHeight: 1.15 }}>
                Tigres de Quintana Roo <span style={{ color: C.ink3, fontWeight: 400 }}>vs. la Liga</span>
              </h1>
              <p style={{ margin: "3px 0 0", fontSize: 12, color: C.ink3 }}>
                Diagnóstico de roster y plan de offseason · Liga Mexicana de Béisbol
              </p>
            </div>
            <div style={{ display: "flex", gap: 4, background: C.panel2, border: `1px solid ${C.line}`, borderRadius: 999, padding: 3 }}>
              {DATA.years.map((y) => (
                <button key={y} className="tab" onClick={() => setYear(String(y))} style={{
                  background: String(y) === year ? C.tigres : "transparent",
                  color: String(y) === year ? C.bg : C.ink3,
                  border: "none", borderRadius: 999, padding: "6px 14px",
                  cursor: "pointer", fontSize: 12.5, fontWeight: 700,
                }}>{y}</button>
              ))}
            </div>
          </header>

          <nav style={{ display: "flex", gap: 6, flexWrap: "wrap", paddingBottom: 12 }}>
            {TABS.map(([k, l]) => (
              <button key={k} className="tab" onClick={() => setTab(k)} style={{
                background: tab === k ? C.tigres : "transparent",
                color: tab === k ? C.bg : C.ink2,
                border: `1px solid ${tab === k ? C.tigres : C.line}`,
                borderRadius: 999, padding: "8px 16px", cursor: "pointer",
                fontSize: 13, fontWeight: 700,
              }}>{l}</button>
            ))}
          </nav>
        </div>
      </div>

      <div className="wrap" style={{ paddingTop: 22 }}>
        {tab === "diag" && <Diagnostico ir={ir} year={year} jug={jug} aud={aud} eqs={eqs} />}
        {tab === "hit" && <VistaGrupo kind="hit" jug={jug} abierta={abiertaHit} setAbierta={setAbiertaHit} />}
        {tab === "pitch" && <VistaGrupo kind="pitch" jug={jug} abierta={abiertaPit} setAbierta={setAbiertaPit} />}
        {tab === "cupos" && <Cupos jug={jug} aud={aud} />}
        {tab === "plan" && <Plan />}
        <Metodologia />
      </div>
    </div>
  );
}
