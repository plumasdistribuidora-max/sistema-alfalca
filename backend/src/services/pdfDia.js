// El reporte del día en PDF, para los dueños.
//
// Es el mismo reporte que se ve en el sistema, con las mismas secciones y en el mismo
// orden: solo cambia dónde se ve (Martín, 11/10/2026). Los datos los arma una sola vez
// armarReporte (routes/tareas.js) para la pantalla y para el papel.
const path  = require('path');
const React = require('react');
const { Document, Page, Text, View, Svg, Path, Rect, Font, StyleSheet, renderToBuffer } = require('@react-pdf/renderer');

const h = React.createElement;

// Identidad: Inter para el texto, Nunito para títulos, Rubik solo para "alfalca".
const FUENTES = path.join(__dirname, '../../assets/fonts');
Font.register({ family: 'Inter', fonts: [
  { src: path.join(FUENTES, 'Inter-Regular.ttf'),  fontWeight: 400 },
  { src: path.join(FUENTES, 'Inter-SemiBold.ttf'), fontWeight: 600 },
  { src: path.join(FUENTES, 'Inter-Bold.ttf'),     fontWeight: 700 },
]});
Font.register({ family: 'Nunito', src: path.join(FUENTES, 'Nunito-ExtraBold.ttf'), fontWeight: 800 });
Font.register({ family: 'Rubik',  src: path.join(FUENTES, 'Rubik-ExtraBold.ttf'),  fontWeight: 800 });
// Sin guionado: los nombres y montos no se parten.
Font.registerHyphenationCallback(w => [w]);

const C = {
  tinta: '#241a16', gris: '#75665a', grisClaro: '#a8998a', linea: '#e6dccb', lineaSuave: '#f7f2ea',
  fondo: '#faf6ef', oscuro: '#8a705e', verde: '#15803D', verdeSuave: '#f0fdf4', verdeBorde: '#a7e9be',
  verdeOscuro: '#166534', rojo: '#B3261E', ambar: '#A45A09', cobre: '#e8735a',
};
const COLOR_TIENDA = {
  'Peatonal Tienda de Alfajores': '#3b2a24', '9 de Julio Tienda de Alfajores': '#8a705e',
  'Amigorena Tienda de Alfajores': '#c9a273', 'Sheraton Tienda de Alfajores': '#7d8a74',
  'Café Peatonal Cafetería': '#e8735a',
};

const S = StyleSheet.create({
  pagina: { paddingTop: 30, paddingBottom: 34, paddingHorizontal: 33, fontFamily: 'Inter', fontSize: 8.5, color: C.tinta, lineHeight: 1.35 },
  cabecera: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: C.oscuro, color: '#ffffff', borderRadius: 9, paddingVertical: 13, paddingHorizontal: 16, marginBottom: 10 },
  marca: { fontFamily: 'Rubik', fontWeight: 800, fontSize: 16, letterSpacing: -0.5, lineHeight: 1 },
  bajada: { fontSize: 6.5, color: '#ffffffaa', marginTop: 2 },
  eyebrow: { fontSize: 6.5, letterSpacing: 1.2, textTransform: 'uppercase', color: '#ffffff99', fontWeight: 700 },
  titulo: { fontFamily: 'Nunito', fontWeight: 800, fontSize: 15, lineHeight: 1.1 },
  sub: { fontSize: 7.5, color: '#ffffffb3', marginTop: 1 },
  kpis: { flexDirection: 'row', gap: 7, marginBottom: 10 },
  kpi: { flex: 1, borderWidth: 1, borderColor: C.linea, borderRadius: 7, paddingVertical: 7, paddingHorizontal: 9 },
  kpiK: { fontSize: 6.3, letterSpacing: 0.9, textTransform: 'uppercase', color: C.gris, fontWeight: 700 },
  kpiV: { fontFamily: 'Nunito', fontWeight: 800, fontSize: 15, marginTop: 1 },
  kpiS: { fontSize: 7.3, color: C.gris },
  cuadro: { borderWidth: 1, borderColor: C.linea, borderRadius: 7, marginBottom: 9, overflow: 'hidden' },
  cuadroTit: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', paddingVertical: 6, paddingHorizontal: 9 },
  cuadroH: { fontFamily: 'Nunito', fontWeight: 800, fontSize: 9.5 },
  cuadroSub: { fontSize: 7, color: C.gris },
  th: { flexDirection: 'row', backgroundColor: C.fondo, borderTopWidth: 1, borderBottomWidth: 1, borderColor: C.linea },
  thc: { paddingVertical: 4, paddingHorizontal: 7, fontSize: 6.3, letterSpacing: 0.8, textTransform: 'uppercase', color: C.gris, fontWeight: 700 },
  tr: { flexDirection: 'row', borderBottomWidth: 1, borderColor: C.lineaSuave },
  td: { paddingVertical: 4, paddingHorizontal: 7, fontSize: 8 },
  num: { textAlign: 'right' },
  nota: { flexDirection: 'row', gap: 5, paddingVertical: 6, paddingHorizontal: 9, borderTopWidth: 1, borderColor: C.lineaSuave, fontSize: 7.8 },
  pie: { position: 'absolute', bottom: 16, left: 33, right: 33, flexDirection: 'row', justifyContent: 'space-between', fontSize: 6.8, color: C.gris, borderTopWidth: 1, borderColor: C.linea, paddingTop: 5 },
});

// ── Formatos ─────────────────────────────────────────────────────────────────
const money = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 });
const $ = v => `$ ${money.format(Math.round(Number(v) || 0))}`;
const num = v => money.format(Math.round(Number(v) || 0));
const pct = v => v == null ? 's/d' : `${v.toFixed(1).replace('.', ',')} %`;
const hs  = v => `${(Number(v) || 0).toFixed(1).replace('.', ',')}`;
const kg  = v => v === null || v === undefined ? '—' : `${String(Math.round(v * 100) / 100).replace('.', ',')} kg`;
const corto = nombre => (nombre || '').replace(' Tienda de Alfajores', '').replace(' Cafetería', '');
const cap = s => s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
const DIAS  = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
function fechaLarga(fecha) {
  const d = new Date(`${fecha}T12:00:00`);
  return `${cap(DIAS[d.getDay()])} ${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`;
}
function fechaCorta(fecha) {
  if (!fecha) return '';
  const [y, m, d] = fecha.split('-');
  return `${d}/${m}/${y.slice(2)}`;
}
// La hora está guardada como hora de Mendoza aunque diga UTC: se lee tal cual.
function horaDe(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}

// ── Piezas ───────────────────────────────────────────────────────────────────
function Isotipo() {
  return h(Svg, { viewBox: '0 0 100 100', width: 26, height: 26 },
    h(Path, { d: 'M0 47A47 47 0 0 1 47 0V47Z', fill: '#ffffff' }),
    h(Path, { d: 'M53 0V47H100Z', fill: '#ffffff' }),
    h(Rect, { x: 0, y: 53, width: 47, height: 47, fill: '#ffffff' }),
    h(Path, { d: 'M53 53H100A23.5 23.5 0 0 1 53 53Z', fill: '#ffffff' }),
  );
}

function Punto({ color }) {
  return h(Svg, { viewBox: '0 0 10 10', width: 6, height: 6, style: { marginRight: 4 } },
    h(Path, { d: 'M5 0A5 5 0 1 1 5 10A5 5 0 1 1 5 0Z', fill: color }));
}

// Un cuadro por tema: título, columnas y filas. `cols` = [{ t, w, num }], w es el
// ancho relativo (flex). Una celda puede ser texto o { t, color, bold }.
//
// Un cuadro nunca se parte entre dos hojas: si no entra en lo que queda de la
// hoja, se va entero a la siguiente. Y si es más alto que una hoja, se corta en
// tandas de filas, cada una con su título y su encabezado, así ninguna tanda
// queda a medias.
const ANCHO_UTIL = 595 - 33 * 2 - 2;   // A4 menos márgenes y el borde del cuadro
const ALTO_TANDA = 620;                  // lo que entra en una hoja debajo de la cabecera

function altoEstimado(fila, cols) {
  if (fila.titulo) return 10.8 + 9;   // una fila de título es siempre un renglón
  const sumW = cols.reduce((s, c) => s + c.w, 0);
  let lineas = 1;
  cols.forEach((c, i) => {
    const v = fila.c[i];
    const t = String((v && typeof v === 'object') ? v.t ?? '' : v ?? '');
    const anchoCol = ANCHO_UTIL * c.w / sumW - 14;
    const porLinea = Math.max(4, Math.floor(anchoCol / 4.3));
    const l = t.split('\n').reduce((n, linea) => n + Math.max(1, Math.ceil(linea.length / porLinea)), 0);
    lineas = Math.max(lineas, l);
  });
  return lineas * 10.8 + 9;
}

function enTandas(filas, cols) {
  const tandas = [];
  let actual = [], alto = 0;
  for (const f of filas) {
    const h = altoEstimado(f, cols);
    if (actual.length && alto + h > ALTO_TANDA) { tandas.push(actual); actual = []; alto = 0; }
    actual.push(f); alto += h;
  }
  if (actual.length) tandas.push(actual);
  return tandas;
}

function Cuadro({ titulo, sub, cols, filas, nota }) {
  if (!filas.length) return null;
  const celda = (v, col, i, esCab) => {
    // null = el casillero va en blanco a propósito (lo que sobra de una fila de título).
    // '' sigue siendo un dato que falta, y ése lleva guión.
    if (v === null) return h(Text, { key: i, style: [S.td, { flex: col.w }] }, ' ');
    const o = (v && typeof v === 'object') ? v : { t: v };
    return h(Text, {
      key: i,
      style: [esCab ? S.thc : S.td, { flex: col.w }, col.num ? S.num : {},
              o.color ? { color: o.color } : {}, o.bold ? { fontWeight: 700 } : {}],
    }, o.t === undefined || o.t === null || o.t === '' ? '—' : String(o.t));
  };
  const tandas = enTandas(filas, cols);
  return h(React.Fragment, null, tandas.map((tanda, k) => h(View, { key: k, style: S.cuadro, wrap: false },
    h(View, { style: S.cuadroTit },
      h(Text, { style: S.cuadroH }, k === 0 ? titulo : `${titulo} (sigue)`),
      sub && k === 0 ? h(Text, { style: S.cuadroSub }, sub) : null),
    h(View, { style: S.th }, cols.map((c, i) => celda(c.t, c, i, true))),
    // Una fila con `titulo` no tiene columnas: es un renglón entero que separa un grupo
    // (el local, en mantenimiento). Va centrado y de ancho completo, sin casilleros.
    tanda.map((f, r) => f.titulo
      ? h(View, { key: r, style: [S.tr, { backgroundColor: f.fondo || C.fondo }] },
          h(Text, { style: [S.td, { flex: 1, textAlign: 'center', fontWeight: 700 }] }, f.titulo))
      : h(View, { key: r, style: [S.tr, f.fondo ? { backgroundColor: f.fondo } : {}] },
          cols.map((c, i) => celda(f.c[i], c, i, false)))),
    k === tandas.length - 1 ? (nota || null) : null,
  )));
}

// Cabecera oscura con la marca a la izquierda y el título a la derecha.
function Cabecera({ eyebrow, titulo, sub }) {
  return h(View, { style: S.cabecera },
    h(View, { style: { flexDirection: 'row', alignItems: 'center', gap: 9 } },
      h(Isotipo),
      h(View, null, h(Text, { style: S.marca }, 'alfalca'), h(Text, { style: S.bajada }, 'grupo inversor · mendoza'))),
    h(View, { style: { alignItems: 'flex-end' } },
      h(Text, { style: S.eyebrow }, eyebrow),
      h(Text, { style: S.titulo }, titulo),
      h(Text, { style: S.sub }, sub)));
}

function Kpi({ k, v, s, tono, color }) {
  return h(View, { style: [S.kpi, tono || {}] },
    h(Text, { style: [S.kpiK, color ? { color } : {}] }, k),
    h(Text, { style: [S.kpiV, color ? { color } : {}] }, v),
    h(Text, { style: [S.kpiS, color ? { color } : {}] }, s));
}

function Pie({ texto }) {
  return h(View, { style: S.pie, fixed: true },
    h(Text, null, texto),
    h(Text, { render: ({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}` }));
}



// ── El reporte, en papel ─────────────────────────────────────────────────────
// Recibe exactamente lo mismo que la pantalla (armarReporte) y lo pone en el mismo
// orden: página 1 lo que importa, página 2 el detalle, página 3 la deuda.

const ddmm = f => (f ? String(f).slice(0, 10).split('-').reverse().slice(0, 2).join('/') : '');
const n1 = v => (v == null ? '—' : Number(v).toFixed(1).replace('.', ','));
const varTxt = v => (v == null ? '—' : `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(1).replace('.', ',')} %`);
const varCelda = v => ({ t: varTxt(v), color: v == null ? C.grisClaro : v >= 0 ? C.verde : C.rojo, bold: true });
const duracionTxt = ms => {
  const min = Math.max(0, Math.round((ms || 0) / 60000));
  if (min < 60) return `${min} min`;
  const hh = Math.floor(min / 60);
  if (hh < 24) return `${hh} h`;
  const dd = Math.floor(hh / 24), r = hh % 24;
  return `${dd} día${dd === 1 ? '' : 's'}${r ? ` ${r} h` : ''}`;
};

function estadoCelda(t) {
  if (!t) return { t: '—', color: C.grisClaro };
  if (t.estado === 'terminada') return { t: t.aprobada_sola ? 'aprobada sola' : 'aprobada', color: C.verde, bold: true };
  if (t.estado === 'por_aprobar') return { t: 'por aprobar', color: C.ambar, bold: true };
  if (t.estado === 'en_curso') return t.dias_vencida > 0
    ? { t: `vencida ${t.dias_vencida} d`, color: C.rojo, bold: true }
    : { t: t.accion ? `en curso: ${t.accion}` : 'en curso', color: '#2b5991' };
  return { t: 'sin tomar', color: C.rojo, bold: true };
}

function personalCelda(l) {
  if (l.personal == null) return { t: l.personal_sin_dato ? 'sin dato' : '—', color: C.grisClaro };
  const malo = l.objetivo != null && l.personal > l.objetivo;
  return { t: `${pct(l.personal)}${l.objetivo != null ? ` / ${Math.round(l.objetivo)}` : ''}`, color: malo ? C.rojo : C.verde, bold: true };
}

function fudoCelda(l) {
  if (!l.fudo) return { t: 'sin Fudo', color: C.grisClaro };
  if (l.diferencia == null) return l.reportes.esperados ? { t: 'faltan turnos', color: C.ambar } : '—';
  if (Math.abs(l.diferencia) < 1) return { t: 'cierra', color: C.verde, bold: true };
  const ok = l.tarea_ventas?.estado === 'terminada';
  return { t: `${l.diferencia > 0 ? '+' : '−'}${num(Math.abs(l.diferencia))}${ok ? ' · aprobada' : ''}`, color: ok ? C.verde : C.rojo, bold: true };
}

function Bloque({ titulo, sub, children, borde }) {
  return h(View, { style: [S.cuadro, borde ? { borderColor: borde, borderWidth: 1.5 } : {}], wrap: false },
    h(View, { style: S.cuadroTit },
      h(Text, { style: [S.cuadroH, borde ? { color: C.ambar } : {}] }, titulo),
      sub ? h(Text, { style: S.cuadroSub }, sub) : null),
    h(View, { style: { paddingHorizontal: 9, paddingBottom: 8 } }, children));
}

function Mini({ items }) {
  return h(View, { style: { flexDirection: 'row', gap: 6 } }, items.map((it, i) =>
    h(View, { key: i, style: { flex: 1, backgroundColor: C.fondo, borderRadius: 6, paddingVertical: 5, paddingHorizontal: 7 } },
      h(Text, { style: { fontFamily: 'Nunito', fontWeight: 800, fontSize: 12, color: it.color || C.tinta } }, it.v),
      h(Text, { style: { fontSize: 7, color: C.gris } }, it.s))));
}

function BarraCafe({ etiqueta, valor, max, color }) {
  const ancho = max > 0 && valor > 0 ? Math.max(2, Math.round(valor / max * 100)) : 0;
  return h(View, { style: { flexDirection: 'row', alignItems: 'center', marginBottom: 5 } },
    h(Text, { style: { width: 78, fontSize: 8, color: C.gris } }, etiqueta),
    h(View, { style: { flex: 1, height: 11, borderRadius: 6, backgroundColor: C.lineaSuave } },
      h(View, { style: { width: `${ancho}%`, height: 11, borderRadius: 6, backgroundColor: color } })),
    h(Text, { style: { width: 50, fontFamily: 'Nunito', fontWeight: 800, fontSize: 10, textAlign: 'right' } }, kg(valor)));
}

const MEDIO_PAGO = { santander: 'Santander', mercadopago: 'Mercado Pago', galicia: 'Galicia', efectivo: 'Efectivo', cheque: 'Cheque' };
const DIA_CORTO_PDF = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];

function Documento({ r }) {
  const k = r.kpis;
  const enMeta = k.personal != null && k.objetivo != null && k.personal <= k.objetivo;
  const colorKpi = k.personal == null ? C.tinta : enMeta ? C.verde : C.rojo;
  const tonoKpi = k.personal == null ? {} : enMeta
    ? { borderColor: C.verdeBorde, backgroundColor: C.verdeSuave }
    : { borderColor: '#f3b9b4', backgroundColor: '#fef2f2' };
  const decidir = [...r.para_decidir.tareas, ...r.para_decidir.gastos];
  const refCorta = `${r.ref.larga.split(' ')[0].slice(0, 3)} ${ddmm(r.ref.fecha)}`;
  const pie = `Alfalca · Reporte del día ${r.fecha_larga}`;
  const pl = r.plata;
  const cafe = r.cafe;
  const v = r.vencimientos;

  return h(Document, { title: `Reporte del día ${r.fecha}`, author: 'Alfalca' },

    // ── Página 1: lo que importa ──
    h(Page, { size: 'A4', style: S.pagina },
      h(Cabecera, {
        eyebrow: 'Reporte del día',
        titulo: cap(r.fecha_larga),
        sub: `${r.completo ? 'Fudo de los 5 locales' : `Falta el Fudo de ${r.sin_fudo.join(', ')}`} · ${r.reportes.recibidos} de ${r.reportes.esperados} reportes de turno`,
      }),

      decidir.length ? h(Bloque, { titulo: `Para decidir · ${decidir.length}`, sub: 'lo primero que hay que mirar', borde: '#e8c99a' },
        ...r.para_decidir.tareas.map((t, i) => h(View, { key: `t${i}`, style: { flexDirection: 'row', gap: 6, paddingVertical: 3, borderTopWidth: i ? 1 : 0, borderColor: C.lineaSuave } },
          h(Text, { style: { color: C.ambar, fontWeight: 700, width: 58 } }, 'Por aprobar'),
          h(Text, { style: { flex: 1 } }, `${t.local} · ${t.titulo} — ${t.cierre_tipo === 'descarte' ? 'pide descartarla' : 'dice'}: ${t.resultado}${t.resultado_monto ? ` (${$(t.resultado_monto)})` : ''} · esperando hace ${duracionTxt(t.esperando_ms)}`))),
        ...r.para_decidir.gastos.map((g, i) => h(View, { key: `g${i}`, style: { flexDirection: 'row', gap: 6, paddingVertical: 3, borderTopWidth: 1, borderColor: C.lineaSuave } },
          h(Text, { style: { color: '#2b5991', fontWeight: 700, width: 58 } }, 'Gasto'),
          h(Text, { style: { flex: 1 } }, `${g.local_corto} · ${g.concepto} ${$(g.monto)} — ${g.titulo}`))),
      ) : null,

      h(View, { style: S.kpis },
        h(Kpi, { k: 'Venta del día', v: $(k.venta), s: `${varTxt(k.var_venta)} vs. ${r.ref.larga} (${$(k.venta_ref)})` }),
        h(Kpi, { k: 'Docenas tiendas', v: n1(k.docenas), s: `${varTxt(k.var_docenas)} vs. ${r.ref.larga} (${n1(k.docenas_ref)})` }),
        h(Kpi, { k: 'Mes hasta hoy', v: $(k.mes), s: `${varTxt(k.var_mes)} vs. ${ddmm(r.mes.pasado_desde)} al ${ddmm(r.mes.pasado_hasta)} (${$(k.mes_pasado)})` }),
        h(Kpi, { k: 'Personal / venta neta', v: pct(k.personal), tono: tonoKpi, color: colorKpi,
          s: k.personal == null ? 'sin dato: faltan horas de turnos' : `meta ${pct(k.objetivo)} · ${k.locales_con_kpi} de ${k.locales_con_venta} locales` })),

      h(Cuadro, {
        titulo: 'Cada local',
        sub: `comparado con el ${r.ref.larga} · personal sobre venta neta sin IVA`,
        cols: [
          { t: 'Local', w: 1.9 }, { t: 'Venta', w: 1.45, num: true }, { t: refCorta, w: 1.45, num: true }, { t: 'vs.', w: 1.3, num: true },
          { t: 'Docenas', w: 1.35, num: true }, { t: 'Ticket', w: 1.2, num: true }, { t: 'Personal', w: 1.45, num: true },
          { t: 'Report.', w: 1.0, num: true }, { t: 'Fudo vs. turnos', w: 1.6, num: true },
        ],
        filas: [
          ...r.locales.map(l => ({ c: [
            l.personas ? `${l.nombre} · ${l.personas} personas` : l.nombre,
            l.abrio ? num(l.venta) : { t: l.fudo ? 'no abrió' : '—', color: C.grisClaro },
            num(l.venta_ref), varCelda(l.var_venta),
            l.docenas == null ? '—' : `${n1(l.docenas)} (${n1(l.docenas_ref)})`,
            l.ticket ? `${num(l.ticket)}${l.ticket_es === 'por persona' ? ' p/pers.' : ''}` : '—',
            personalCelda(l),
            l.reportes.esperados ? { t: `${l.reportes.recibidos} de ${l.reportes.esperados}`, color: l.reportes.recibidos < l.reportes.esperados ? C.rojo : C.tinta, bold: l.reportes.recibidos < l.reportes.esperados } : '—',
            fudoCelda(l),
          ]})),
          { fondo: C.fondo, c: [
            { t: 'Toda la red', bold: true }, { t: num(k.venta), bold: true }, { t: num(k.venta_ref), bold: true }, varCelda(k.var_venta),
            { t: n1(k.docenas), bold: true }, { t: k.ticket_tiendas ? num(k.ticket_tiendas) : '—', bold: true },
            { t: pct(k.personal), color: colorKpi, bold: true }, { t: `${r.reportes.recibidos} de ${r.reportes.esperados}`, bold: true }, null,
          ]},
        ],
      }),

      h(Cuadro, {
        titulo: 'Lo que salió mal',
        sub: 'cada cosa es una tarea del encargado · en qué está',
        cols: [{ t: 'Local', w: 1.3 }, { t: 'Qué pasó', w: 5 }, { t: 'En qué está', w: 2.6 }],
        filas: r.salio_mal.length
          ? r.salio_mal.map(t => ({ c: [t.local || 'Red', t.titulo, estadoCelda(t)] }))
          : [{ c: ['—', { t: 'Nada: todo cerró bien ese día.', color: C.verde }, null] }],
      }),

      h(Bloque, { titulo: 'El encargado', sub: 'cómo viene con todas sus tareas, no solo las de hoy' },
        h(Mini, { items: [
          { v: String(r.encargado.abiertas), s: `abiertas · ${r.encargado.sin_tomar} sin tomar` },
          { v: String(r.encargado.vencidas), s: r.encargado.vencidas ? `vencidas · la más vieja ${r.encargado.mas_vieja_vencida} d` : 'vencidas', color: r.encargado.vencidas ? C.rojo : C.verde },
          { v: String(r.encargado.arreglos), s: r.encargado.arreglos ? `arreglos abiertos · el más viejo ${r.encargado.arreglo_mas_viejo} d` : 'arreglos abiertos', color: r.encargado.arreglos ? C.rojo : C.tinta },
        ] })),

      h(Pie, { texto: pie }),
    ),

    // ── Página 2: el detalle ──
    h(Page, { size: 'A4', style: S.pagina },
      h(Cuadro, {
        titulo: 'Mantenimiento',
        sub: `${r.mantenimiento.length} abiertos, por días`,
        cols: [{ t: 'Días', w: 0.7, num: true }, { t: 'Local', w: 1.4 }, { t: 'Qué pasa', w: 4.4 }, { t: 'En qué está', w: 2.8 }],
        filas: r.mantenimiento.map(m => ({ c: [
          { t: String(m.dias), color: m.dias >= 7 ? C.rojo : C.ambar, bold: true },
          m.local, `${m.rubro ? `${m.rubro}: ` : ''}${m.texto}`, estadoCelda(m),
        ]})),
      }),

      v.filas.length ? h(Cuadro, {
        titulo: 'Vencimientos',
        sub: `${v.filas.length} productos · el más próximo en ${v.mas_proximo} días · unidades · días que faltan`,
        cols: [{ t: 'Producto', w: 2.4 }, ...v.tiendas.map(t => ({ t, w: 1.3, num: true })), { t: 'Total', w: 1, num: true }],
        filas: v.filas.map(f => ({ c: [
          { t: f.producto, bold: true },
          ...v.tiendas.map(t => {
            const c = f.celdas[t];
            if (!c) return { t: '—', color: C.linea };
            return { t: `${num(c.cantidad)} · ${c.dias} d`, color: c.dias <= 7 ? C.rojo : c.dias <= 15 ? C.ambar : C.tinta, bold: c.dias <= 15 };
          }),
          { t: `${num(f.unidades)} u`, color: C.gris },
        ]})),
      }) : null,

      cafe ? h(Bloque, {
        titulo: 'Café en grano',
        sub: [cafe.manana && `${cafe.manana.usuario} entró con ${kg(cafe.manana.kg)}`, cafe.tarde && `${cafe.tarde.usuario} terminó con ${kg(cafe.tarde.kg)}`].filter(Boolean).join(' · '),
      },
        cafe.consumo == null
          ? h(Text, { style: { color: C.rojo } }, 'Falta un pesaje: sin los dos no se sabe cuánto se usó.')
          : h(View, null,
              h(BarraCafe, { etiqueta: 'Se usó', valor: cafe.consumo, max: Math.max(cafe.consumo, cafe.teorico || 0), color: C.cobre }),
              cafe.teorico != null ? h(BarraCafe, { etiqueta: 'Según lo vendido', valor: cafe.teorico, max: Math.max(cafe.consumo, cafe.teorico), color: '#d3c8ba' }) : null,
              cafe.teorico ? h(Text, { style: { fontSize: 8, color: C.gris, marginTop: 2 } },
                `${kg(Math.abs(cafe.consumo - cafe.teorico))} ${cafe.consumo < cafe.teorico ? 'menos' : 'más'} que lo vendido (${Math.round(Math.abs(cafe.consumo - cafe.teorico) / cafe.teorico * 100)} %) · quedan ${kg(cafe.queda)}`) : null),
      ) : null,

      h(Bloque, { titulo: 'Plata del día', sub: 'proveedores y cajas' },
        h(Mini, { items: [
          { v: $(pl.facturas_hoy.monto), s: `facturas cargadas (${pl.facturas_hoy.cantidad})` },
          { v: $(pl.pagado_hoy.monto), s: `pagado (${pl.pagado_hoy.cantidad})` },
          { v: $(pl.gastos_caja.monto), s: 'gastos de caja de los turnos' },
        ] }),
        ...pl.gastos_tareas.map((g, i) => h(Text, { key: i, style: { fontSize: 8, marginTop: 4 } },
          `Caja chica · ${g.local_corto}: ${g.concepto} ${$(g.monto)} · ${g.estado === 'pendiente' ? 'espera aprobación' : g.estado === 'rechazado' ? 'no aprobado' : g.con_comprobante ? 'con comprobante' : 'falta comprobante'}`)),
        h(Text, { style: { fontSize: 8, color: C.gris, marginTop: 6 } },
          `Deuda con proveedores: ${$(pl.deuda.total)} en ${pl.deuda.facturas} facturas${pl.deuda.mas_vieja ? ` · la más vieja, ${pl.deuda.mas_vieja.dias} días (${pl.deuda.mas_vieja.proveedor})` : ''} · el detalle, en la página 3.`)),

      h(Pie, { texto: pie }),
    ),

    // ── Página 3: la deuda ──
    h(Page, { size: 'A4', style: S.pagina },
      h(Bloque, { titulo: 'Deuda con proveedores', sub: `al ${ddmm(r.fecha)} · sin vencimientos: se mira cuánto hace que está sin pagar` },
        h(Mini, { items: [{ v: $(pl.deuda.total), s: `${pl.deuda.facturas} facturas sin pagar` }, ...pl.deuda.tramos.map(t => ({ v: $(t.monto), s: `${t.label} · ${t.facturas} fact.`, color: t.label.startsWith('Más') && t.monto ? C.rojo : C.tinta }))] })),
      // Cada proveedor con su total y sus 3 facturas más viejas, como la tarjeta de la
      // pantalla (Martín, 11/10/2026: con todas el PDF pasaba a 6 hojas). Un cuadro por
      // proveedor, para que ninguno quede partido entre dos hojas.
      ...pl.deuda.por_proveedor.map((p, i) => h(Cuadro, {
        key: i,
        titulo: `${p.proveedor} · ${$(p.deuda)}`,
        sub: `${p.facturas} factura${p.facturas === 1 ? '' : 's'} · la más vieja ${p.mas_vieja} días${p.medio ? ` · ${MEDIO_PAGO[p.medio] || p.medio}` : ''}${p.dias_pago?.length ? `, cobra ${p.dias_pago.map(d => DIA_CORTO_PDF[d]).join(', ')}` : ''}`,
        cols: [{ t: 'Días', w: 0.7, num: true }, { t: 'Fecha', w: 0.9 }, { t: 'Factura', w: 2.4 }, { t: 'Local', w: 1.6 }, { t: 'Saldo', w: 1.4, num: true }],
        nota: p.lista.length > 3 ? h(View, { style: S.nota },
          h(Text, { style: { color: C.gris } }, `y ${p.lista.length - 3} factura${p.lista.length - 3 === 1 ? '' : 's'} más, por ${$(p.lista.slice(3).reduce((s, f) => s + f.saldo, 0))} · el detalle completo, en Proveedores`)) : null,
        filas: p.lista.slice(0, 3).map(f => ({ c: [
          { t: String(f.dias), color: f.dias > 30 ? C.rojo : f.dias > 15 ? C.ambar : C.tinta, bold: true },
          ddmm(f.fecha), f.numero || 'sin número', f.local, num(f.saldo),
        ]})),
      })),
      h(Pie, { texto: pie }),
    ),
  );
}

async function pdfDia(r) {
  return renderToBuffer(h(Documento, { r }));
}

module.exports = { pdfDia };
