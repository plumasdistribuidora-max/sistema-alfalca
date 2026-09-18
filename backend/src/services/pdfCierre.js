// El cierre del día en PDF: lo que el encargado le manda a los dueños como adjunto,
// en vez del mensaje largo de WhatsApp. Se arma con los mismos datos que la pantalla
// de cierre (armarDia), así el papel dice exactamente lo que vio el encargado.
//
// Estructura, aprobada por Martín en la maqueta del 18/9/2026: cabecera, cuatro
// números, el cuadro por local y después un cuadro por tema (vencimientos,
// mantenimiento, faltas, quejas, faltantes, café, facturas, gastos). Los cuadros
// vacíos no aparecen y los títulos no llevan conteo.
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
    tanda.map((f, r) => h(View, { key: r, style: [S.tr, f.fondo ? { backgroundColor: f.fondo } : {}] },
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

// ── El documento ─────────────────────────────────────────────────────────────
function Documento({ d, cerradoPor }) {
  const t = d.totales;
  const c = d.consolidado;
  const cerrado = c?.estado === 'cerrado';
  const enMeta = t.horas_sobre_ventas != null && t.objetivo != null && t.horas_sobre_ventas <= t.objetivo;
  const tonoKpi = t.horas_sobre_ventas == null ? {} : enMeta
    ? { borderColor: C.verdeBorde, backgroundColor: C.verdeSuave }
    : { borderColor: '#f3b9b4', backgroundColor: '#fef2f2' };
  const colorKpi = t.horas_sobre_ventas == null ? C.tinta : enMeta ? C.verde : C.rojo;

  const locales = d.locales.filter(l => l.ventas_sistema || l.reportes.length);
  const cafe = d.locales.find(l => l.tipo === 'cafeteria');
  const personasCafe = cafe ? (cafe.personas_reportadas || 0) : 0;

  const noCierran = locales.filter(l => l.diferencia != null && Math.abs(l.diferencia) >= 1);

  // Mantenimiento: estado de cada ítem tal como lo ve el encargado.
  const estadoMant = it => {
    if (it.legado) return { t: 'Reportado', color: C.ambar };
    if (it.estado === 'resuelto') return { t: 'Resuelto hoy', color: C.verde };
    if (it.dias === 0) return { t: 'Nuevo hoy', color: C.ambar };
    const sigue = it.hoy?.some(x => x.respuesta === 'sigue');
    return { t: `${sigue ? 'Sigue igual · ' : ''}${it.dias} día${it.dias === 1 ? '' : 's'}`, color: C.rojo };
  };
  const mant = d.novedades.mantenimiento;

  const nv = d.novedades;
  const p = d.proveedores || {};
  const cafeCtl = d.cafe?.control;

  const movimientos = [
    ...(p.cargadas || []).map(f => ({ c: [
      { t: 'Factura cargada', color: C.ambar, bold: true }, f.proveedor, corto(f.local_nombre),
      `${f.numero ? `N.º ${f.numero}` : 'sin número'}${f.vencimiento ? ` · vence ${fechaCorta(f.vencimiento)}` : ''}`,
      $(f.total),
    ]})),
    ...(p.pagos || []).map(pg => ({ c: [
      { t: 'Pago', color: C.verde, bold: true }, pg.proveedor, '—',
      `${pg.factura_numero ? `N.º ${pg.factura_numero} · ` : ''}${medio(pg.medio)}${pg.comprobante ? ` · ${pg.comprobante}` : ''}`,
      $(pg.monto),
    ]})),
  ];

  return h(Document, { title: `Cierre del día ${d.fecha}`, author: 'Alfalca' },
    h(Page, { size: 'A4', style: S.pagina },

      h(Cabecera, {
        eyebrow: cerrado ? 'Cierre del día' : 'Cierre del día · borrador, sin cerrar',
        titulo: fechaLarga(d.fecha),
        sub: `${cerrado ? `Cerró ${cerradoPor || 'el encargado'} · ${horaDe(c.cerrado_at)} · ` : ''}${locales.reduce((s, l) => s + l.turnos_reportados, 0)} de ${locales.reduce((s, l) => s + l.turnos_esperados, 0)} reportes de venta`,
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
          h(Text, { style: [S.kpiK, { color: colorKpi }] }, 'Personal / ventas'),
          h(Text, { style: [S.kpiV, { color: colorKpi }] }, pct(t.horas_sobre_ventas)),
          h(Text, { style: [S.kpiS, { color: colorKpi }] }, t.objetivo != null ? `meta de la red ${pct(t.objetivo)} · ${enMeta ? 'en meta' : 'pasado'}` : 'sin meta'))),

      h(Cuadro, {
        titulo: 'Ventas y personal por local',
        sub: 'Sistema = Excel del punto de venta · Reportado = lo que cargó cada turno',
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
              { t: k == null ? '—' : `${pct(k)}${l.objetivo != null ? ` / ${Math.round(l.objetivo)}` : ''}`, color: colorK, bold: true },
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
        nota: noCierran.length ? h(View, null, noCierran.map((l, i) => h(View, { key: i, style: S.nota },
          h(Text, { style: { color: C.rojo, fontWeight: 700 } }, `${corto(l.nombre)} no cerró:`),
          h(Text, { style: { flex: 1, color: C.oscuro } },
            `reportaron ${$(l.ventas_reportadas)} contra ${$(l.ventas_sistema)} del sistema.${c?.explicaciones?.[String(l.local_id)]?.trim() ? ` Explicación del encargado: ${c.explicaciones[String(l.local_id)].trim()}` : ' Sin explicación.'}`)))) : null,
      }),

      h(Cuadro, {
        titulo: 'Vencimientos',
        sub: c?.vencimientos_ok ? 'control de vencimientos hecho' : 'control de vencimientos sin marcar',
        cols: [{ t: 'Local', w: 1.4 }, { t: 'Turno', w: 1 }, { t: 'Reportó', w: 1.3 }, { t: 'Producto', w: 4 }, { t: 'Vence en', w: 1.2, num: true }],
        filas: [
          ...nv.vencimientos.map(it => ({ c: [corto(it.local), it.turno, it.quien, it.producto, diasTexto(it.dias)] })),
          ...(c?.acciones_vencimientos?.trim() ? [{ fondo: C.fondo, c: [{ t: 'Encargado', bold: true }, '', '', { t: c.acciones_vencimientos.trim() }, ''] }] : []),
        ],
      }),

      h(Cuadro, {
        titulo: 'Mantenimiento',
        sub: 'cada pendiente con cómo lo resuelve el encargado',
        cols: [{ t: 'Local', w: 1.2 }, { t: 'Turno', w: 0.9 }, { t: 'Reportó', w: 1.1 }, { t: 'Qué pasa', w: 3.2 }, { t: 'Estado', w: 1.6 }, { t: 'Cómo se resuelve', w: 2.8 }],
        filas: [
          ...mant.map(it => ({ c: [corto(it.local), it.turno || '—', it.quien, it.texto, estadoMant(it), it.estado === 'resuelto' ? '—' : (it.plan || { t: 'sin plan', color: C.ambar })] })),
          ...(c?.mantenimiento?.trim() ? [{ fondo: C.fondo, c: [{ t: 'Encargado', bold: true }, '', '', { t: c.mantenimiento.trim() }, '', ''] }] : []),
        ],
      }),

      h(Cuadro, {
        titulo: 'Faltas y tardanzas',
        cols: [{ t: 'Local', w: 1.4 }, { t: 'Turno', w: 1 }, { t: 'Reportó', w: 1.3 }, { t: 'Persona', w: 1.8 }, { t: 'Qué pasó', w: 4 }],
        filas: [
          ...nv.ausencias.map(it => ({ c: [corto(it.local), it.turno, it.quien, it.empleado, it.motivo] })),
          ...(c?.faltas_tardanzas?.trim() ? [{ fondo: C.fondo, c: [{ t: 'Encargado', bold: true }, '', '', '', { t: c.faltas_tardanzas.trim() }] }] : []),
        ],
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

      h(Cuadro, {
        titulo: 'Café · lo que pesaron los baristas contra lo que se vendió',
        sub: 'consumo = mañana − tarde · teórico = lo vendido × los gramos del maestro',
        cols: [{ t: 'Pesaje', w: 1.6 }, { t: 'Barista', w: 1.4 }, { t: 'Bolsa abierta', w: 1.2, num: true }, { t: 'Cerradas', w: 1.1, num: true }, { t: 'Total', w: 1.1, num: true }, { t: 'Teórico', w: 1.1, num: true }, { t: 'Diferencia', w: 1.8, num: true }],
        filas: !d.cafe?.turnos?.length ? [] : [
          ...d.cafe.turnos.map(tr => ({ c: [tr.turno === 'Mañana' ? 'Mañana · al entrar' : 'Tarde · al terminar', tr.usuario, kg(tr.abierta_kg), kg(tr.cerradas_kg), kg(tr.total), '', ''] })),
          { fondo: C.fondo, c: [{ t: 'Consumo del día', bold: true }, '', '', { t: `queda ${kg(d.cafe.queda)}` }, { t: kg(d.cafe.consumo), bold: true }, { t: kg(cafeCtl?.teorico), bold: true }, difCafe(cafeCtl, true)] },
        ],
        nota: cafeAvisos(d.cafe),
      }),

      h(Cuadro, {
        titulo: 'Facturas de proveedores',
        sub: 'lo que se cargó y lo que se pagó en el día',
        cols: [{ t: 'Movimiento', w: 1.5 }, { t: 'Proveedor', w: 1.8 }, { t: 'Local', w: 1.1 }, { t: 'Detalle', w: 3.4 }, { t: 'Monto', w: 1.4, num: true }],
        filas: movimientos,
      }),

      h(Cuadro, {
        titulo: 'Gastos de caja',
        sub: nv.gastos.length ? `plata que salió de la caja · ${$(nv.total_gastos)}` : '',
        cols: [{ t: 'Local', w: 1.2 }, { t: 'Turno', w: 0.9 }, { t: 'Cargó', w: 1.2 }, { t: 'Tipo', w: 1.7 }, { t: 'Detalle', w: 3.2 }, { t: 'Monto', w: 1.3, num: true }],
        filas: nv.gastos.map(g => ({ c: [corto(g.local), g.turno, g.quien, g.tipo, g.detalle, $(g.monto)] })),
      }),

      h(Pie, { texto: `Generado por el sistema Alfalca · control de vencimientos ${c?.vencimientos_ok ? 'hecho' : 'sin marcar'} · control de tienda ${c?.control_tienda_ok ? 'hecho' : 'sin marcar'}` }),
    ),
  );
}

// "Vence en" es texto libre en el formulario: si es un número se le agrega "días".
function diasTexto(v) {
  if (v === null || v === undefined || String(v).trim() === '') return '—';
  const n = Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? `${n} día${n === 1 ? '' : 's'}` : String(v);
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

async function pdfCierre(d, cerradoPor) {
  return renderToBuffer(h(Documento, { d, cerradoPor }));
}


// ── El resumen semanal ───────────────────────────────────────────────────────
// Misma estética que el diario. `w` es lo que arma armarSemana y `R` lo que
// resume resumenSemana (los mismos números del texto de WhatsApp).
const DIA_CORTO = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const diaCorto = fecha => { const d = new Date(`${fecha}T12:00:00`); return `${DIA_CORTO[d.getDay()]} ${d.getDate()}`; };
const variacion = (ahora, antes) => antes > 0 ? { v: (ahora / antes - 1) * 100, t: `${ahora >= antes ? '+' : '−'}${Math.abs((ahora / antes - 1) * 100).toFixed(0)} %` } : null;

function DocumentoSemana({ w, R }) {
  const { locales, nombreDe, objetivoDe, tot, porLocal, ventaTotal, kpiRed, metaRed, diasConHoras, diasConVentas,
          todas, abiertos, resueltos, cerrados, sinCerrar, esperados, recibidos } = R;
  const d0 = new Date(`${w.desde}T12:00:00`), d1 = new Date(`${w.hasta}T12:00:00`);
  const rango = `Sábado ${d0.getDate()}${d0.getMonth() !== d1.getMonth() ? ` de ${MESES[d0.getMonth()]}` : ''} al viernes ${d1.getDate()} de ${MESES[d1.getMonth()]} de ${d1.getFullYear()}`;

  const enMeta = kpiRed != null && metaRed != null && kpiRed <= metaRed;
  const tonoKpi = kpiRed == null ? {} : enMeta ? { borderColor: C.verdeBorde, backgroundColor: C.verdeSuave } : { borderColor: '#f3b9b4', backgroundColor: '#fef2f2' };
  const colorKpi = kpiRed == null ? C.tinta : enMeta ? C.verde : C.rojo;
  const vAnt = variacion(ventaTotal, w.anterior.total.total), vAnio = variacion(ventaTotal, w.anio.total.total);
  const colorVar = x => !x ? C.gris : x.v >= 0 ? C.verde : C.rojo;

  const filasLocales = locales.map(id => {
    const v = w.actual.porLocal[id]?.total || 0;
    const a = porLocal[id];
    if (!v && !a.horas) return null;
    const kpi = a.ventas_con_horas > 0 && a.gasto > 0 ? a.gasto / a.ventas_con_horas * 100 : null;
    const va = variacion(v, w.anterior.porLocal[id]?.total || 0);
    const meta = objetivoDe[id];
    return { c: [
      corto(nombreDe[id]), num(v), va ? { t: va.t, color: colorVar(va) } : '—',
      { t: kpi == null ? '—' : `${pct(kpi)}${meta != null ? ` / ${Math.round(meta)}` : ''}`, color: kpi == null ? C.grisClaro : meta == null ? C.tinta : kpi <= meta ? C.verde : kpi <= meta * 1.15 ? C.ambar : C.rojo, bold: true },
      a.dias_kpi ? `${a.dias_en_meta} de ${a.dias_kpi}` : '—',
      a.mejor ? `${a.mejor.dia} · ${num(a.mejor.v)}` : '—',
      a.peor && a.mejor && a.peor.dia !== a.mejor.dia ? `${a.peor.dia} · ${num(a.peor.v)}` : '—',
      a.no_cierra.length ? { t: a.no_cierra.map(x => `${x.dia} (${x.dif > 0 ? '+' : '−'}${num(Math.abs(x.dif))})`).join(', '), color: C.rojo } : { t: 'cerró todos', color: C.verde },
    ]};
  }).filter(Boolean);
  const sinReportes = locales.filter(id => porLocal[id].dias_sin_reportes.length);

  const circuito = [
    { c: ['Días cerrados', `${cerrados.length} de 7${sinCerrar.length ? ` · sin cerrar: ${sinCerrar.join(', ')}` : ''}`] },
    { c: ['Reportes de venta', `${recibidos} de ${esperados} esperados`] },
    ...(w.tarde.length ? [{ c: ['Llegaron al día siguiente', `${w.tarde.length} · ${[...new Set(w.tarde.map(t => t.usuario))].join(', ')}`] }] : []),
    ...(w.devueltos.length ? [{ c: ['Devueltos para corregir', w.devueltos.map(x => `${x.usuario}${x.veces > 1 ? ` ×${x.veces}` : ''}`).join(', ')] }] : []),
    ...sinReportes.map(id => ({ c: [`Faltaron reportes en ${corto(nombreDe[id])}`, porLocal[id].dias_sin_reportes.join(', ')] })),
  ];

  const estadoMant = it => it.legado ? { t: 'Reportado', color: C.ambar }
    : it.estado === 'resuelto' ? { t: `Resuelto ${it.dia}`, color: C.verde }
    : { t: it.fecha ? `Desde ${diaCorto(it.fecha)}` : it.dia, color: C.rojo };
  const planesEncargado = w.dias.filter(d => d.consolidado?.mantenimiento?.trim()).map(d => ({ fondo: C.fondo, c: [{ t: 'Encargado', bold: true }, diaCorto(d.fecha), '', { t: d.consolidado.mantenimiento.trim() }, '', ''] }));
  const faltasEncargado = w.dias.filter(d => d.consolidado?.faltas_tardanzas?.trim()).map(d => ({ fondo: C.fondo, c: [{ t: 'Encargado', bold: true }, diaCorto(d.fecha), '', '', '', { t: d.consolidado.faltas_tardanzas.trim() }] }));

  // Solo suman los días con los dos pesajes: con uno solo no hay consumo que comparar.
  const diasCafe = w.dias.filter(d => d.cafe?.turnos?.length);
  const diasCompletos = diasCafe.filter(d => d.cafe.consumo !== null);
  const totalCafe = diasCompletos.length ? Math.round(diasCompletos.reduce((s, d) => s + d.cafe.consumo, 0) * 100) / 100 : null;
  const teoCafe = diasCompletos.length && diasCompletos.every(d => d.cafe.control?.teorico != null)
    ? Math.round(diasCompletos.reduce((s, d) => s + d.cafe.control.teorico, 0) * 100) / 100 : null;
  const ultimoCafe = [...diasCafe].reverse().find(d => d.cafe.queda !== null);
  const avisosCafe = diasCafe.filter(d => d.cafe.consumo === null)
    .map(d => `${diaCorto(d.fecha)}: falta el pesaje de la ${d.cafe.manana === null ? 'mañana' : 'tarde'}, no se sabe cuánto se consumió.`);

  const totalGastos = todas.gastos.reduce((s, g) => s + (Number(g.monto) || 0), 0);
  const p = w.proveedores;

  return h(Document, { title: `Resumen semanal ${w.desde} a ${w.hasta}`, author: 'Alfalca' },
    h(Page, { size: 'A4', style: S.pagina },
      h(Cabecera, { eyebrow: 'Resumen semanal', titulo: rango, sub: `${cerrados.length} de 7 días cerrados · ${recibidos} de ${esperados} reportes de venta` }),

      h(View, { style: S.kpis },
        h(Kpi, { k: 'Venta de la semana', v: $(ventaTotal), s: `${num(w.actual.total.tickets)} tickets${w.actual.total.docenas ? ` · ${num(w.actual.total.docenas)} docenas` : ''}` }),
        h(Kpi, { k: 'Contra la semana anterior', v: vAnt ? vAnt.t : 's/d', s: vAnio ? `misma semana del año pasado ${vAnio.t}` : 'sin datos del año pasado', color: colorVar(vAnt) }),
        h(Kpi, { k: 'Horas del personal', v: `${hs(tot.horas)} h`, s: tot.gasto ? `${$(tot.gasto)} de costo${tot.sin_valor ? ` · ${hs(tot.sin_valor)} h sin valor hora` : ''}` : 'sin valor hora cargado' }),
        h(Kpi, { k: 'Personal / ventas', v: pct(kpiRed), s: kpiRed == null ? 'sin datos' : `meta ${pct(metaRed)} · ${enMeta ? 'en meta' : 'pasado'}${diasConHoras < diasConVentas ? ` · sobre ${diasConHoras} de ${diasConVentas} días` : ''}`, tono: tonoKpi, color: colorKpi })),

      h(Cuadro, {
        titulo: 'La semana por local',
        sub: 'venta contra la semana anterior · personal contra la meta de cada uno',
        cols: [{ t: 'Local', w: 1.5 }, { t: 'Venta', w: 1.5, num: true }, { t: 'vs sem. ant.', w: 1.2, num: true }, { t: 'Personal / vta', w: 1.5, num: true }, { t: 'Días en meta', w: 1.2, num: true }, { t: 'Mejor día', w: 1.7 }, { t: 'Peor día', w: 1.7 }, { t: 'No cerró', w: 2.4 }],
        filas: filasLocales,
      }),

      h(Cuadro, {
        titulo: 'Cómo funcionó la semana',
        cols: [{ t: 'Qué', w: 2 }, { t: 'Detalle', w: 6 }],
        filas: circuito,
      }),

      h(Cuadro, {
        titulo: 'Vencimientos',
        cols: [{ t: 'Día', w: 0.9 }, { t: 'Local', w: 1.3 }, { t: 'Turno', w: 1 }, { t: 'Reportó', w: 1.3 }, { t: 'Producto', w: 3.5 }, { t: 'Vence en', w: 1.2, num: true }],
        filas: todas.vencimientos.map(it => ({ c: [it.dia, corto(it.local), it.turno, it.quien, it.producto, diasTexto(it.dias)] })),
      }),

      h(Cuadro, {
        titulo: 'Mantenimiento',
        sub: 'lo que sigue pendiente, una vez por ítem, y lo que se resolvió en la semana',
        cols: [{ t: 'Local', w: 1.2 }, { t: 'Desde', w: 1 }, { t: 'Reportó', w: 1.1 }, { t: 'Qué pasa', w: 3.2 }, { t: 'Estado', w: 1.4 }, { t: 'Cómo se resuelve', w: 2.6 }],
        filas: [
          ...abiertos.map(it => ({ c: [corto(it.local), it.fecha ? diaCorto(it.fecha) : it.dia, it.quien || it.reportado_por, it.texto, estadoMant(it), it.plan || { t: 'sin plan', color: C.ambar }] })),
          ...resueltos.map(it => ({ c: [corto(it.local), it.fecha ? diaCorto(it.fecha) : it.dia, it.quien || it.reportado_por, it.texto, estadoMant(it), '—'] })),
          ...planesEncargado,
        ],
      }),

      h(Cuadro, {
        titulo: 'Faltas y tardanzas',
        cols: [{ t: 'Local', w: 1.3 }, { t: 'Día', w: 0.9 }, { t: 'Turno', w: 1 }, { t: 'Reportó', w: 1.3 }, { t: 'Persona', w: 1.7 }, { t: 'Qué pasó', w: 3.5 }],
        filas: [...todas.ausencias.map(it => ({ c: [corto(it.local), it.dia, it.turno, it.quien, it.empleado, it.motivo] })), ...faltasEncargado],
      }),

      h(Cuadro, {
        titulo: 'Quejas de clientes',
        cols: [{ t: 'Día', w: 0.9 }, { t: 'Local', w: 1.3 }, { t: 'Turno', w: 1 }, { t: 'Reportó', w: 1.3 }, { t: 'Queja', w: 5.5 }],
        filas: todas.quejas.map(it => ({ c: [it.dia, corto(it.local), it.turno, it.quien, it.texto] })),
      }),

      h(Cuadro, {
        titulo: 'Faltantes de insumos',
        cols: [{ t: 'Día', w: 0.9 }, { t: 'Local', w: 1.3 }, { t: 'Turno', w: 1 }, { t: 'Reportó', w: 1.3 }, { t: 'Insumo', w: 3.5 }, { t: 'Proveedor', w: 2 }],
        filas: todas.faltantes.map(it => ({ c: [it.dia, corto(it.local), it.turno, it.quien, it.insumo, it.proveedor] })),
      }),

      h(Cuadro, {
        titulo: 'Café · lo que pesaron los baristas contra lo que se vendió',
        sub: 'teórico = lo vendido × los gramos del maestro de café',
        cols: [{ t: 'Día', w: 1 }, { t: 'Baristas', w: 2.2 }, { t: 'Consumo real', w: 1.3, num: true }, { t: 'Teórico', w: 1.2, num: true }, { t: 'Diferencia', w: 1.8, num: true }, { t: 'Queda', w: 1.2, num: true }],
        filas: !diasCafe.length ? [] : [
          ...diasCafe.map(d => ({ c: [diaCorto(d.fecha), d.cafe.turnos.map(t => t.usuario).join(', '), kg(d.cafe.consumo), kg(d.cafe.control?.teorico), difCafe(d.cafe.control), kg(d.cafe.queda)] })),
          { fondo: C.fondo, c: [{ t: 'Semana', bold: true }, `${diasCompletos.length} día${diasCompletos.length === 1 ? '' : 's'} con los dos pesajes`, { t: kg(totalCafe), bold: true }, { t: kg(teoCafe), bold: true },
            difCafe(teoCafe != null && totalCafe != null ? { diferencia: Math.round((totalCafe - teoCafe) * 100) / 100, teorico: teoCafe } : null, true),
            { t: ultimoCafe ? kg(ultimoCafe.cafe.queda) : '—', bold: true }] },
        ],
        nota: avisosCafe.length ? h(View, null, avisosCafe.map((a, i) => h(View, { key: i, style: S.nota }, h(Text, { style: { color: C.rojo, fontWeight: 700 } }, '!'), h(Text, { style: { flex: 1, color: C.oscuro } }, a)))) : null,
      }),

      h(Cuadro, {
        titulo: 'Gastos de caja',
        sub: todas.gastos.length ? `plata que salió de la caja en la semana · ${$(totalGastos)}` : '',
        cols: [{ t: 'Día', w: 0.9 }, { t: 'Local', w: 1.2 }, { t: 'Turno', w: 0.9 }, { t: 'Cargó', w: 1.2 }, { t: 'Tipo', w: 1.6 }, { t: 'Detalle', w: 2.9 }, { t: 'Monto', w: 1.3, num: true }],
        filas: todas.gastos.map(g => ({ c: [g.dia, corto(g.local), g.turno, g.quien, g.tipo, g.detalle, $(g.monto)] })),
      }),

      h(Cuadro, {
        titulo: 'Proveedores',
        cols: [{ t: 'Qué', w: 3 }, { t: 'Monto', w: 1.5, num: true }, { t: 'Detalle', w: 3.5 }],
        filas: !(p.pagado || p.deuda) ? [] : [
          { c: ['Pagado en la semana', $(p.pagado), ''] },
          ...(p.n_vencidas ? [{ c: [{ t: 'Vencidas sin pagar', color: C.rojo, bold: true }, { t: $(p.vencido), color: C.rojo, bold: true }, `${p.n_vencidas} factura${p.n_vencidas === 1 ? '' : 's'}`] }] : []),
          ...(p.n_proxima ? [{ c: ['Vence la semana que viene', $(p.vence_proxima), `${p.n_proxima} factura${p.n_proxima === 1 ? '' : 's'}`] }] : []),
          { fondo: C.fondo, c: [{ t: 'Deuda total', bold: true }, { t: $(p.deuda), bold: true }, `${p.facturas} factura${p.facturas === 1 ? '' : 's'} abiertas`] },
        ],
      }),

      h(Pie, { texto: `Generado por el sistema Alfalca · resumen de sábado a viernes · solo informa, no marca nada como resuelto` }),
    ),
  );
}

async function pdfSemana(w, R) {
  return renderToBuffer(h(DocumentoSemana, { w, R }));
}

module.exports = { pdfCierre, pdfSemana };
