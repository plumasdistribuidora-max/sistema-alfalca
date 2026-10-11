// El reporte del día en PDF, para los dueños.
//
// Es el mismo papel que antes armaba el cierre del día (estructura aprobada por Martín
// el 18/9/2026: cabecera, cuatro números, el cuadro por local y un cuadro por tema),
// pero ya no depende de que alguien cierre: se arma solo con el Fudo de cada local.
// Lo que antes escribía el encargado al cerrar (explicaciones, qué hace con los
// vencimientos, cómo resuelve cada mantenimiento) ahora sale de sus tareas.
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
  tinta: '#1f2022', gris: '#6b6e72', grisClaro: '#9a9c9e', linea: '#dcdbd6', lineaSuave: '#ecebe7',
  fondo: '#f4f4f2', oscuro: '#45484c', verde: '#15803D', verdeSuave: '#f0fdf4', verdeBorde: '#a7e9be',
  verdeOscuro: '#166534', rojo: '#B3261E', ambar: '#A45A09', cobre: '#8a5a3c',
};
const COLOR_TIENDA = {
  'Peatonal Tienda de Alfajores': '#26282a', '9 de Julio Tienda de Alfajores': '#5c5f63',
  'Amigorena Tienda de Alfajores': '#989a9f', 'Sheraton Tienda de Alfajores': '#cfceca',
  'Café Peatonal Cafetería': '#8a5a3c',
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


// ── Las tareas, para el papel ────────────────────────────────────────────────
const ddmm = f => (f ? String(f).slice(0, 10).split('-').reverse().slice(0, 2).join('/') : '');

// En qué está una tarea, dicho en una línea: lo que va a hacer el encargado y para
// cuándo, o que todavía no la tomó, o que espera a los dueños.
function estadoTarea(t) {
  if (!t) return { t: 'sin tarea', color: C.grisClaro };
  if (t.estado === 'terminada') return { t: `terminada: ${t.resultado}`, color: C.verde };
  if (t.estado === 'por_aprobar') return { t: `pide cerrar: ${t.resultado}${t.resultado_monto ? ` (${$(t.resultado_monto)})` : ''} · esperan su aprobación`, color: C.ambar };
  if (t.estado === 'nueva') return { t: 'todavía no la tomó', color: C.rojo };
  return {
    t: `${t.accion}, para el ${ddmm(t.plazo)}${t.dias_vencida > 0 ? ` · vencida hace ${t.dias_vencida} día${t.dias_vencida === 1 ? '' : 's'}` : ''}`,
    color: t.dias_vencida > 0 ? C.rojo : C.oscuro,
  };
}

function diasAbierta(t) {
  return Math.max(0, Math.floor((Date.now() - new Date(t.created_at)) / 86400000));
}

// ── El documento ─────────────────────────────────────────────────────────────
// `x` trae las tareas: las que nacieron ese día, todas las abiertas y lo que hay para
// aprobar. Lo que antes escribía el encargado al cerrar el día ahora sale de ahí.
function Documento({ d, x }) {
  const t = d.totales;
  const enMeta = t.horas_sobre_ventas != null && t.objetivo != null && t.horas_sobre_ventas <= t.objetivo;
  const tonoKpi = t.horas_sobre_ventas == null ? {} : enMeta
    ? { borderColor: C.verdeBorde, backgroundColor: C.verdeSuave }
    : { borderColor: '#f3b9b4', backgroundColor: '#fef2f2' };
  const colorKpi = t.horas_sobre_ventas == null ? C.tinta : enMeta ? C.verde : C.rojo;

  const locales = d.locales.filter(l => l.ventas_sistema || l.reportes.length);
  const cafe = d.locales.find(l => l.tipo === 'cafeteria');
  const personasCafe = cafe ? (cafe.personas_reportadas || 0) : 0;
  const noCierran = locales.filter(l => l.diferencia != null && Math.abs(l.diferencia) >= 1);

  const todas = [...x.delDia, ...x.abiertas.filter(a => !x.delDia.some(t => t.id === a.id))];
  const tareaDe = (tipo, pred) => todas.find(t => t.tipo === tipo && pred(t));

  const enGrilla = d.novedades.vencimientos.length > 0
    && d.novedades.vencimientos.every(it => it.vence && it.producto);

  // Mantenimiento: lo que hace el encargado sale de la tarea de cada ítem.
  const mant = d.novedades.mantenimiento.map(it => {
    const tarea = it.id ? tareaDe('mantenimiento', t => Number(t.detalle?.item_id) === Number(it.id)) : null;
    return { ...it, tarea, plan: tarea && tarea.estado !== 'nueva' ? 'tomada' : '' };
  });

  const nv = d.novedades;
  const p = d.proveedores || {};
  const cafeCtl = d.cafe?.control;
  const vencTareas = todas.filter(t => t.tipo === 'vencimiento' && t.estado !== 'terminada');

  const movimientos = [
    ...(p.cargadas || []).map(f => ({ c: [
      { t: 'Factura cargada', color: C.ambar, bold: true }, f.proveedor, corto(f.local_nombre),
      f.numero ? `N.º ${f.numero}` : 'sin número',
      $(f.total),
    ]})),
    ...(p.pagos || []).map(pg => ({ c: [
      { t: 'Pago', color: C.verde, bold: true }, pg.proveedor, '—',
      `${pg.factura_numero ? `N.º ${pg.factura_numero} · ` : ''}${medio(pg.medio)}${pg.comprobante ? ` · ${pg.comprobante}` : ''}`,
      $(pg.monto),
    ]})),
  ];

  const vencidas = x.abiertas.filter(a => a.dias_vencida > 0).length;

  return h(Document, { title: `Reporte del día ${d.fecha}`, author: 'Alfalca' },
    h(Page, { size: 'A4', style: S.pagina },

      h(Cabecera, {
        eyebrow: x.completo ? 'Reporte del día' : 'Reporte del día · faltan Fudo de algún local',
        titulo: fechaLarga(d.fecha),
        sub: `${x.reportes.recibidos} de ${x.reportes.esperados} reportes de turno · ${x.abiertas.length} tareas abiertas${vencidas ? `, ${vencidas} vencida${vencidas === 1 ? '' : 's'}` : ''}${x.porAprobar ? ` · ${x.porAprobar} para aprobar` : ''}`,
      }),

      h(View, { style: S.kpis },
        h(View, { style: S.kpi },
          h(Text, { style: S.kpiK }, 'Venta del día'),
          h(Text, { style: S.kpiV }, $(t.ventas_sistema)),
          h(Text, { style: S.kpiS }, `${num(t.tickets)} tickets`)),
        h(View, { style: S.kpi },
          h(Text, { style: S.kpiK }, 'Ticket promedio tiendas'),
          h(Text, { style: S.kpiV }, t.ticket_promedio_tiendas ? $(t.ticket_promedio_tiendas) : 's/d'),
          h(Text, { style: S.kpiS }, cafe && cafe.ventas_sistema
            ? (personasCafe ? `café ${$(cafe.ventas_sistema / personasCafe)} por persona (${num(personasCafe)})` : `café ${$(t.ticket_promedio_cafe)} por ticket`)
            : 'café sin ventas')),
        h(View, { style: S.kpi },
          h(Text, { style: S.kpiK }, 'Horas del personal'),
          h(Text, { style: S.kpiV }, `${hs(t.horas)} h`),
          h(Text, { style: S.kpiS }, t.gasto_personal ? `${$(t.gasto_personal)} de costo${t.horas_sin_valor ? ` · ${hs(t.horas_sin_valor)} h sin valor hora` : ''}` : 'sin valor hora cargado')),
        h(View, { style: [S.kpi, tonoKpi] },
          h(Text, { style: [S.kpiK, { color: colorKpi }] }, 'Personal / venta neta'),
          h(Text, { style: [S.kpiV, { color: colorKpi }] }, pct(t.horas_sobre_ventas)),
          h(Text, { style: [S.kpiS, { color: colorKpi }] }, t.horas_sobre_ventas == null
            ? 'sin dato: faltan horas de turnos'
            : `meta ${pct(t.objetivo)} · ${enMeta ? 'en meta' : 'pasado'} · ${t.locales_con_kpi} de ${t.locales_con_venta} locales`))),

      h(Cuadro, {
        titulo: 'Ventas y personal por local',
        sub: 'Sistema = Fudo · Reportado = lo que cargó cada turno · Personal sobre venta neta sin IVA',
        cols: [
          { t: 'Local', w: 3.2 }, { t: 'Sistema', w: 1.6, num: true }, { t: 'Reportado', w: 1.6, num: true },
          { t: 'Cierra', w: 1.2, num: true }, { t: 'Tickets', w: 1, num: true }, { t: 'Horas', w: 1, num: true },
          { t: 'Personal / vta', w: 1.7, num: true },
        ],
        filas: [
          ...locales.map(l => {
            const cierra = l.diferencia == null
              ? { t: l.turnos_esperados ? 'faltan turnos' : '—', color: C.ambar }
              : Math.abs(l.diferencia) < 1 ? { t: 'sí', color: C.verde, bold: true }
              : { t: `${l.diferencia > 0 ? '+' : '−'}${num(Math.abs(l.diferencia))}`, color: C.rojo, bold: true };
            const k = l.horas_sobre_ventas;
            const colorK = k == null ? C.grisClaro : l.objetivo == null ? C.tinta : k <= l.objetivo ? C.verde : k <= l.objetivo * 1.15 ? C.ambar : C.rojo;
            return { c: [
              { t: `${corto(l.nombre)} · ${l.turnos_reportados} de ${l.turnos_esperados} turnos` },
              num(l.ventas_sistema), l.ventas_reportadas ? num(l.ventas_reportadas) : '—', cierra,
              num(l.tickets_sistema), l.horas ? hs(l.horas) : '—',
              { t: k == null ? (l.horas_incompletas ? 'sin dato' : '—') : `${pct(k)}${l.objetivo != null ? ` / ${Math.round(l.objetivo)}` : ''}`, color: colorK, bold: true },
            ]};
          }),
          { fondo: C.fondo, c: [
            { t: 'Toda la red', bold: true }, { t: num(t.ventas_sistema), bold: true },
            { t: t.ventas_reportadas ? num(t.ventas_reportadas) : '—', bold: true },
            (() => { const dif = t.ventas_reportadas - t.ventas_sistema; return noCierran.length
              ? { t: `${dif > 0 ? '+' : '−'}${num(Math.abs(dif))}`, color: C.rojo, bold: true }
              : { t: 'sí', color: C.verde, bold: true }; })(),
            { t: num(t.tickets), bold: true }, { t: hs(t.horas), bold: true },
            { t: pct(t.horas_sobre_ventas), color: colorKpi, bold: true },
          ]},
        ],
        nota: noCierran.length ? h(View, null, noCierran.map((l, i) => {
          const tarea = tareaDe('ventas', tt => tt.local_id === l.local_id && tt.fecha === d.fecha);
          const e = estadoTarea(tarea);
          return h(View, { key: i, style: S.nota },
            h(Text, { style: { color: C.rojo, fontWeight: 700 } }, `${corto(l.nombre)} no cerró:`),
            h(Text, { style: { flex: 1, color: C.oscuro } },
              `reportaron ${$(l.ventas_reportadas)} contra ${$(l.ventas_sistema)} de Fudo. `,
              h(Text, { style: { color: e.color, fontWeight: 700 } }, `Encargado: ${e.t}.`)));
        })) : null,
      }),

      h(Cuadro, {
        titulo: 'Tareas abiertas del encargado',
        sub: x.abiertas.length ? `de la más vieja a la más nueva · ${x.porAprobar ? `${x.porAprobar} esperan su aprobación` : 'ninguna espera aprobación'}` : '',
        cols: [{ t: 'Días', w: 0.7, num: true }, { t: 'Local', w: 1.3 }, { t: 'Problema', w: 3.8 }, { t: 'En qué está', w: 3.6 }],
        filas: x.abiertas.map(tt => ({ c: [
          { t: String(diasAbierta(tt)), bold: true, color: tt.dias_vencida > 0 ? C.rojo : C.tinta },
          tt.local_corto || 'Red', tt.titulo, estadoTarea(tt),
        ]})),
      }),

      h(Cuadro, {
        titulo: 'Vencimientos',
        sub: resumenVencimientos(nv.vencimientos),
        ...(enGrilla
          ? (() => {
              const g = grillaVencimientos(nv.vencimientos, locales);
              return {
                cols: [
                  { t: 'Producto', w: 2.4 },
                  ...g.tiendas.map(t => ({ t: corto(t), w: 1.2, num: true })),
                  { t: 'Total', w: 1, num: true },
                ],
                filas: g.filas.map(f => ({ c: [
                  { t: f.producto, bold: true },
                  ...g.tiendas.map(t => celdaGrilla(f.porLocal.get(t))),
                  { t: `${num(f.unidades)} u`, color: C.gris },
                ]})),
                nota: h(View, null,
                  ...vencTareas.map((tt, i) => {
                    const e = estadoTarea(tt);
                    return h(View, { key: i, style: S.nota },
                      h(Text, { style: { fontWeight: 700 } }, `${tt.local_corto} · ${tt.detalle?.producto}:`),
                      h(Text, { style: { flex: 1, color: e.color } }, e.t));
                  }),
                  h(View, { style: S.nota },
                    h(Text, { style: { color: C.gris } },
                      'Cada casillero dice cuántas unidades hay y en cuántos días vence lo más próximo de ese producto en esa tienda. Los que vencen en 10 días o menos son tarea del encargado.'))),
              };
            })()
          : {
              cols: [
                { t: 'Local', w: 1.4 }, { t: 'Turno', w: 0.9 }, { t: 'Reportó', w: 1.4 }, { t: 'Producto', w: 3 },
                { t: 'Cant.', w: 0.8, num: true }, { t: 'Vence', w: 1.2, num: true }, { t: 'Faltan', w: 1.1, num: true },
              ],
              filas: nv.vencimientos.map(it => ({ c: [
                corto(it.local), it.turno, it.quien, it.producto,
                it.cantidad ? num(it.cantidad) : '—',
                it.vence ? fechaCorta(it.vence) : '—',
                celdaDias(it.dias),
              ]})),
            }),
      }),

      h(Cuadro, {
        titulo: 'Mantenimiento',
        sub: resumenMantenimiento(mant),
        cols: [
          { t: 'Días', w: 0.7, num: true }, { t: 'Qué cosa', w: 1.5 },
          { t: 'Qué pasa', w: 3.6 }, { t: 'Reportó', w: 1.3 }, { t: 'Qué hace el encargado', w: 2.9 },
        ],
        filas: gruposMantenimiento(mant).flatMap(g => [
          { titulo: corto(g.local) },
          ...g.items.map(it => ({ c: [
            celdaEdad(it), it.rubro || { t: 'sin rubro', color: C.grisClaro },
            it.texto, it.quien || it.reportado_por,
            it.estado === 'resuelto' ? '—' : estadoTarea(it.tarea),
          ]})),
        ]),
      }),

      h(Cuadro, {
        titulo: 'Faltas y tardanzas',
        cols: [{ t: 'Local', w: 1.4 }, { t: 'Turno', w: 1 }, { t: 'Reportó', w: 1.3 }, { t: 'Persona', w: 1.8 }, { t: 'Qué pasó', w: 4 }],
        filas: nv.ausencias.map(it => ({ c: [corto(it.local), it.turno, it.quien, it.empleado, it.motivo] })),
      }),

      h(Cuadro, {
        titulo: 'Quejas de clientes',
        cols: [{ t: 'Local', w: 1.4 }, { t: 'Turno', w: 1 }, { t: 'Reportó', w: 1.3 }, { t: 'Queja', w: 6 }],
        filas: nv.quejas.map(it => ({ c: [corto(it.local), it.turno, it.quien, it.texto] })),
      }),

      h(Cuadro, {
        titulo: 'Faltantes de insumos',
        cols: [{ t: 'Local', w: 1.4 }, { t: 'Turno', w: 1 }, { t: 'Reportó', w: 1.3 }, { t: 'Insumo', w: 4 }, { t: 'Proveedor', w: 2 }],
        filas: nv.faltantes.map(it => ({ c: [corto(it.local), it.turno, it.quien, it.insumo, it.proveedor] })),
      }),

      h(CuadroCafe, { cafe: d.cafe, ctl: cafeCtl }),

      h(Cuadro, {
        titulo: 'Facturas de proveedores',
        sub: 'lo que se cargó y lo que se pagó en el día',
        cols: [{ t: 'Movimiento', w: 1.5 }, { t: 'Proveedor', w: 1.8 }, { t: 'Local', w: 1.1 }, { t: 'Detalle', w: 3.4 }, { t: 'Monto', w: 1.4, num: true }],
        filas: movimientos,
      }),

      h(Cuadro, {
        titulo: 'Gastos de caja de los turnos',
        sub: nv.gastos.length ? `plata que salió de la caja · ${$(nv.total_gastos)}` : '',
        cols: [{ t: 'Local', w: 1.2 }, { t: 'Turno', w: 0.9 }, { t: 'Cargó', w: 1.2 }, { t: 'Tipo', w: 1.7 }, { t: 'Detalle', w: 3.2 }, { t: 'Monto', w: 1.3, num: true }],
        filas: nv.gastos.map(g => ({ c: [corto(g.local), g.turno, g.quien, g.tipo, g.detalle, $(g.monto)] })),
      }),

      h(Cuadro, {
        titulo: 'Gastos del encargado para resolver tareas',
        sub: x.gastos.length ? `caja chica · ${$(x.gastos.reduce((s, g) => s + g.monto, 0))}` : '',
        cols: [{ t: 'Local', w: 1.2 }, { t: 'Tarea', w: 3.2 }, { t: 'Gasto', w: 2.2 }, { t: 'Monto', w: 1.3, num: true }, { t: 'Estado', w: 2 }],
        filas: x.gastos.map(g => ({ c: [
          g.local_corto, g.titulo, g.concepto, $(g.monto),
          g.estado === 'pendiente' ? { t: 'espera su aprobación', color: C.ambar }
            : g.estado === 'rechazado' ? { t: 'no aprobado', color: C.rojo }
            : g.con_comprobante ? { t: 'con comprobante', color: C.verde } : { t: 'falta comprobante', color: C.rojo },
        ]})),
      }),

      h(Pie, { texto: 'Generado por el sistema Alfalca · se arma solo con el Fudo de cada local' }),
    ),
  );
}

// "Vence en" puede venir de un reporte viejo como texto libre: si es un número se le
// agrega "días", y si no se muestra tal cual.
function diasTexto(v) {
  if (v === null || v === undefined || String(v).trim() === '') return '—';
  const n = Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? `${n} día${n === 1 ? '' : 's'}` : String(v);
}

// Los días, pintados: lo que corre esta semana en rojo, lo de la quincena en ámbar.
function celdaDias(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return diasTexto(v);
  return { t: diasTexto(n), color: n <= 7 ? C.rojo : n <= 15 ? C.ambar : C.tinta, bold: n <= 15 };
}

// El encabezado del cuadro dice de una lo que hay que saber: cuántos productos y
// cuánto falta para el primero.
function resumenVencimientos(items) {
  if (!items.length) return '';
  const dias = items.map(it => Number(it.dias)).filter(Number.isFinite);
  const unidades = items.reduce((s, it) => s + (Number(it.cantidad) || 0), 0);
  // Se cuentan productos distintos, no avisos: el mismo ron reportado en tres tiendas
  // es un solo producto para mirar, aunque sean tres renglones.
  const cuantos = new Set(items.map(it => it.producto)).size;
  const partes = [`${cuantos} producto${cuantos === 1 ? '' : 's'}`];
  if (unidades) partes.push(`${num(unidades)} unidades`);
  if (dias.length) partes.push(`el más próximo en ${Math.min(...dias)} días`);
  return partes.join(' · ');
}

// La grilla de vencimientos: producto en las filas, tienda en las columnas.
//
// Esto solo se puede armar porque el producto sale de un maestro cerrado. Cuando cada
// uno lo escribía a mano, "ron", "alfajor ron" y "alf ron y cognac" eran tres productos
// distintos para la base y no había cruce posible. Ahora el mismo aviso repetido en tres
// tiendas se ve en un renglón, que es justo lo que decide una promo.
//
// Si un local reportó el mismo producto dos veces (mañana y tarde), las unidades se
// suman y queda el vencimiento más corto: lo que apura es el más próximo.
function grillaVencimientos(items, locales) {
  const tiendas = locales
    .map(l => l.nombre)
    .filter(nombre => items.some(it => it.local === nombre));

  const porProducto = new Map();
  for (const it of items) {
    if (!porProducto.has(it.producto)) porProducto.set(it.producto, new Map());
    const fila  = porProducto.get(it.producto);
    const antes = fila.get(it.local);
    fila.set(it.local, {
      cantidad: (antes?.cantidad || 0) + (Number(it.cantidad) || 0),
      dias: antes ? Math.min(antes.dias, Number(it.dias)) : Number(it.dias),
    });
  }

  const filas = [...porProducto.entries()]
    .map(([producto, porLocal]) => ({
      producto, porLocal,
      urgencia: Math.min(...[...porLocal.values()].map(v => v.dias)),
      unidades: [...porLocal.values()].reduce((s, v) => s + v.cantidad, 0),
    }))
    .sort((a, b) => a.urgencia - b.urgencia || a.producto.localeCompare(b.producto));

  return { tiendas, filas };
}

// Una celda de la grilla: unidades y días juntos, porque uno sin el otro no decide nada.
function celdaGrilla(v) {
  if (!v) return { t: '—', color: C.linea };
  const dias = v.dias;
  const color = !Number.isFinite(dias) ? C.tinta : dias <= 7 ? C.rojo : dias <= 15 ? C.ambar : C.tinta;
  return {
    t: `${v.cantidad ? num(v.cantidad) : '?'} · ${Number.isFinite(dias) ? `${dias} d` : 's/f'}`,
    color, bold: Number.isFinite(dias) && dias <= 15,
  };
}

// Los días que lleva abierto un pendiente, adelante y en grande: es lo que ordena la
// lista y lo que duele. Lo de hoy en ámbar, lo que se arrastra en rojo.
function celdaEdad(it) {
  if (it.estado === 'resuelto') return { t: 'listo', color: C.verde, bold: true };
  if (it.legado) return { t: '—', color: C.gris };
  if (it.dias === 0) return { t: 'hoy', color: C.ambar, bold: true };
  return { t: String(it.dias), color: it.dias >= 3 ? C.rojo : C.ambar, bold: true };
}

// El encabezado del cuadro de mantenimiento: cuántos hay, cuántos son de hoy, cuántos
// se arrastran y qué rubro se repite. Con eso ya se sabe si hay que preocuparse.
function resumenMantenimiento(items) {
  const abiertos = items.filter(it => it.estado !== 'resuelto');
  if (!abiertos.length) return 'nada pendiente';
  const nuevos  = abiertos.filter(it => it.dias === 0).length;
  const viejos  = abiertos.length - nuevos;
  const sinPlan = abiertos.filter(it => !it.plan?.trim()).length;
  const partes  = [`${abiertos.length} pendiente${abiertos.length === 1 ? '' : 's'}`];
  if (nuevos) partes.push(`${nuevos} de hoy`);
  if (viejos) partes.push(`${viejos} que se arrastra${viejos === 1 ? '' : 'n'}`);
  const dias = abiertos.map(it => it.dias).filter(Number.isFinite);
  if (dias.length && Math.max(...dias) > 0) partes.push(`el más viejo, ${Math.max(...dias)} días`);
  partes.push(sinPlan ? `${sinPlan} sin tomar por el encargado` : 'todos tomados por el encargado');
  return partes.join(' · ');
}

// Mantenimiento agrupado por local: el nombre va una sola vez, arriba de los suyos,
// con cuántos tiene y desde cuándo. Antes se repetía en cada renglón y cuatro
// "9 de Julio" seguidos tapaban lo único que importa, que es qué está roto.
//
// Los grupos van por el problema más viejo de cada local, y adentro igual: lo que lleva
// más días primero, lo resuelto al final.
function gruposMantenimiento(items) {
  const edad = it => (it.estado === 'resuelto' ? -1 : (Number.isFinite(it.dias) ? it.dias : 0));
  const porLocal = new Map();
  for (const it of items) {
    if (!porLocal.has(it.local)) porLocal.set(it.local, []);
    porLocal.get(it.local).push(it);
  }
  return [...porLocal.entries()]
    .map(([local, suyos]) => ({
      local,
      items: [...suyos].sort((a, b) => edad(b) - edad(a)),
      viejo: Math.max(...suyos.map(edad)),
      abiertos: suyos.filter(it => it.estado !== 'resuelto').length,
    }))
    .sort((a, b) => b.viejo - a.viejo || a.local.localeCompare(b.local));
}

function medio(m) {
  return { santander: 'Santander', mercadopago: 'Mercado Pago', galicia: 'Galicia', efectivo: 'Efectivo', cheque: 'Cheque' }[m] || m || '';
}

// Diferencia real − teórico en kg y %, verde hasta 10 %, ámbar hasta 25 %, rojo más.
function difCafe(ctl, bold = false) {
  if (!ctl || ctl.diferencia == null || !ctl.teorico) return { t: '—', bold };
  const p = Math.abs(ctl.diferencia) / ctl.teorico * 100;
  const color = p <= 10 ? C.verde : p <= 25 ? C.ambar : C.rojo;
  return { t: `${ctl.diferencia > 0 ? '+' : '−'}${kg(Math.abs(ctl.diferencia))} · ${Math.round(p)} %`, color, bold };
}

// ── El café, en barras ───────────────────────────────────────────────────────
// Antes era una tabla de siete columnas para decir dos números: cuánto café se usó de
// verdad y cuánto tendría que haberse usado según lo que se vendió. Dos barras lo
// dicen sin leer: lo que importa es si una es más larga que la otra y por cuánto.
//
// El cobre es el color del Café en la identidad; el teórico va en gris porque es la
// referencia, no el dato.
function BarraCafe({ etiqueta, valor, max, color }) {
  const ancho = max > 0 && valor > 0 ? Math.max(2, Math.round(valor / max * 100)) : 0;
  return h(View, { style: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 } },
    h(Text, { style: { width: 78, fontSize: 8, color: C.gris } }, etiqueta),
    h(View, { style: { flex: 1, height: 13, borderRadius: 7, backgroundColor: C.lineaSuave } },
      h(View, { style: { width: `${ancho}%`, height: 13, borderRadius: 7, backgroundColor: color } })),
    h(Text, { style: { width: 56, fontFamily: 'Nunito', fontWeight: 800, fontSize: 10.5, textAlign: 'right' } }, kg(valor)));
}

const TONOS = {
  verde: { texto: C.verde, fondo: C.verdeSuave, borde: C.verdeBorde },
  ambar: { texto: C.ambar, fondo: '#fdf8ef',    borde: '#e8c99a' },
  rojo:  { texto: C.rojo,  fondo: '#fef2f2',    borde: '#f3b9b4' },
};

function CuadroCafe({ cafe, ctl }) {
  if (!cafe?.turnos?.length) return null;

  const manana = cafe.turnos.find(t => t.turno === 'Mañana');
  const tarde  = cafe.turnos.find(t => t.turno === 'Tarde');
  const sub = [
    manana ? `${manana.usuario} entró con ${kg(manana.total)}` : null,
    tarde  ? `${tarde.usuario} terminó con ${kg(tarde.total)}` : null,
  ].filter(Boolean).join(' · ');

  const real = cafe.consumo, teorico = ctl?.teorico;
  const max  = Math.max(real || 0, teorico || 0);
  const dif  = real != null && teorico ? real - teorico : null;
  const p    = dif != null ? Math.abs(dif) / teorico * 100 : null;
  const tono = p == null ? TONOS.verde : p <= 10 ? TONOS.verde : p <= 25 ? TONOS.ambar : TONOS.rojo;

  return h(View, { style: S.cuadro, wrap: false },
    h(View, { style: S.cuadroTit },
      h(Text, { style: S.cuadroH }, 'Café'),
      h(Text, { style: S.cuadroSub }, sub)),

    real == null
      ? null
      : h(View, { style: { paddingTop: 11, paddingBottom: 8, paddingHorizontal: 14, borderTopWidth: 1, borderColor: C.linea } },
          h(BarraCafe, { etiqueta: 'Consumo real', valor: real, max, color: C.cobre }),
          teorico ? h(BarraCafe, { etiqueta: 'Consumo teórico', valor: teorico, max, color: '#c8c7c2' }) : null,
          dif == null ? null : h(View, { style: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 5, paddingLeft: 78 } },
            h(View, { style: { backgroundColor: tono.fondo, borderWidth: 1, borderColor: tono.borde, borderRadius: 999, paddingVertical: 3, paddingHorizontal: 10 } },
              h(Text, { style: { fontSize: 9, fontWeight: 700, color: tono.texto } },
                `${kg(Math.abs(dif))} ${dif < 0 ? 'menos' : 'más'} · ${Math.round(p)} %`)),
            h(Text, { style: { fontSize: 8, color: C.gris } },
              `de café del que dicen las ventas · quedan ${kg(cafe.queda)}`))),

    cafeAvisos(cafe));
}

function cafeAvisos(cafe) {
  if (!cafe?.turnos?.length) return null;
  const avisos = [];
  if (cafe.consumo === null) {
    avisos.push(cafe.manana === null
      ? 'Falta el pesaje de la mañana: sin él no se sabe cuánto café se consumió.'
      : 'Falta el pesaje de la tarde: sin él no se sabe cuánto café se consumió.');
  }
  if (cafe.control?.sin_definir > 0) {
    avisos.push(`${cafe.control.sin_definir} unidades vendidas de ${cafe.control.productos_sin_definir} productos sin gramos en el maestro de café: el teórico queda corto.`);
  }
  if (!avisos.length) return null;
  return h(View, null, avisos.map((a, i) => h(View, { key: i, style: S.nota }, h(Text, { style: { color: C.rojo, fontWeight: 700 } }, '!'), h(Text, { style: { flex: 1, color: C.oscuro } }, a))));
}

async function pdfDia(d, x) {
  return renderToBuffer(h(Documento, { d, x }));
}

module.exports = { pdfDia };
