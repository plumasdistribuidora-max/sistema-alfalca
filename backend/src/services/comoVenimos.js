'use strict';

// "Cómo venimos": el mes en curso (o el año, del 1/1 a hoy) de cada local de Entre Dos,
// contra los mismos días del mes pasado y del año pasado, más cuánto subimos los
// precios en ese tiempo. Lo usa la primera pestaña del tablero (/red).
//
// Reglas:
//  · "Hoy" es el último día con ventas cerradas cargadas, no el reloj: si no, el mes en
//    curso compararía días sin importar contra días completos.
//  · Contra el año pasado cada local se compara solo en los días que también tiene
//    cargados en ese año (la Peatonal tiene 2025 desde el 25/1, el Café desde julio).
//    Si el local no tenía ventas en ese momento, no se compara.
//  · La suba de precios mira los productos que hacen el 80 % de la venta del año.
//    En el mes: el precio más cobrado de cada uno, contra los mismos días del año
//    pasado. En el año: el precio promedio, contra el mismo período del año pasado.
//    Cada producto pesa según lo que vende; los que no existían el año pasado no entran.

const pool = require('../config/db');

const TZ = 'America/Argentina/Mendoza';
const CACHE_MS = 10 * 60 * 1000;
const cache = new Map();

const n = v => Number(v) || 0;

// ── Fechas (siempre como texto YYYY-MM-DD, sin husos horarios) ───────────────
function partes(iso) { const [y, m, d] = iso.split('-').map(Number); return { y, m, d }; }
function iso(y, m, d) { return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`; }
function diasDelMes(y, m) { return new Date(Date.UTC(y, m, 0)).getUTCDate(); }
function diasEntre(a, b) { return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000) + 1; }
// Mueve una fecha meses o años para atrás; si el día no existe (31/9), queda en el último del mes.
function atras(fecha, meses) {
  const { y, m, d } = partes(fecha);
  const total = y * 12 + (m - 1) - meses;
  const ny = Math.floor(total / 12), nm = total % 12 + 1;
  return iso(ny, nm, Math.min(d, diasDelMes(ny, nm)));
}
function maxIso(a, b) { return a > b ? a : b; }
// Desde cuándo se compara contra el año pasado: desde la primera venta cargada de ese
// año, salvo que falten solo un par de días al principio (un 1 de enero cerrado no
// es un recorte: el local estaba, solo no abrió).
const TOLERANCIA_DIAS = 3;
function desdeComparable(inicio, primeraVenta) {
  if (!primeraVenta || primeraVenta <= inicio) return inicio;
  return diasEntre(inicio, primeraVenta) - 1 <= TOLERANCIA_DIAS ? inicio : primeraVenta;
}

function periodos(modo, hoy) {
  const { y, m } = partes(hoy);
  const desde = modo === 'anio' ? iso(y, 1, 1) : iso(y, m, 1);
  const p = {
    modo,
    desde,
    hasta: hoy,
    n_dias: diasEntre(desde, hoy),
    dias_total: modo === 'anio' ? diasEntre(iso(y, 1, 1), iso(y, 12, 31)) : diasDelMes(y, m),
    anio_ant: { desde: atras(desde, 12), hasta: atras(hoy, 12) },
    mes_ant: null,
    mes_completo_ant: null,
  };
  if (modo === 'mes') {
    p.mes_ant = { desde: atras(desde, 1), hasta: atras(hoy, 1) };
    const finAnt = atras(desde, 1);
    const { y: ay, m: am } = partes(finAnt);
    p.mes_completo_ant = { desde: iso(ay, am, 1), hasta: iso(ay, am, diasDelMes(ay, am)) };
  }
  return p;
}

// ── Ventas por local y día ───────────────────────────────────────────────────
// Un solo agregado diario por tabla para todos los rangos que se piden; después se
// suma en JS. Los rangos van con OR para no recorrer los meses del medio.
async function diarios(rangos) {
  const conds = (col) => rangos.map((_, i) => `${col} BETWEEN $${i * 2 + 1}::date AND $${i * 2 + 2}::date`).join(' OR ');
  const params = rangos.flatMap(r => [r.desde, r.hasta]);
  const min = rangos.reduce((a, r) => (r.desde < a ? r.desde : a), rangos[0].desde);
  const max = rangos.reduce((a, r) => (r.hasta > a ? r.hasta : a), rangos[0].hasta);
  const pi = params.length;

  const [tk, dz] = await Promise.all([
    pool.query(`
      SELECT vt.local_id, vt.fecha::text AS d,
             SUM(vt.total) AS f, COUNT(*) AS tk, COALESCE(SUM(vt.personas), 0) AS p
      FROM ventas_tickets vt
      WHERE vt.estado = 'cerrada' AND (${conds('vt.fecha')})
      GROUP BY vt.local_id, vt.fecha`, params),
    pool.query(`
      SELECT vi.local_id, DATE(vi.fecha_creacion AT TIME ZONE '${TZ}')::text AS d,
             COALESCE(SUM(vi.docenas_equivalentes) FILTER (WHERE NOT vi.cancelada), 0) AS dz
      FROM ventas_items vi
      -- cota amplia sobre la columna cruda para que entre por el índice
      WHERE vi.fecha_creacion >= ($${pi + 1}::date - 1)::timestamptz
        AND vi.fecha_creacion <  ($${pi + 2}::date + 2)::timestamptz
        AND (${conds(`DATE(vi.fecha_creacion AT TIME ZONE '${TZ}')`)})
      GROUP BY vi.local_id, DATE(vi.fecha_creacion AT TIME ZONE '${TZ}')`, [...params, min, max]),
  ]);

  const dias = new Map(); // `${local}|${fecha}` → {f, tk, p, d}
  const fila = (l, d) => {
    const k = `${l}|${d}`;
    if (!dias.has(k)) dias.set(k, { local_id: Number(l), fecha: d, f: 0, tk: 0, p: 0, d: 0 });
    return dias.get(k);
  };
  tk.rows.forEach(r => { const x = fila(r.local_id, r.d); x.f = n(r.f); x.tk = n(r.tk); x.p = n(r.p); });
  dz.rows.forEach(r => { fila(r.local_id, r.d).d = n(r.dz); });
  return [...dias.values()];
}

function sumar(dias, localId, desde, hasta) {
  const o = { f: 0, tk: 0, p: 0, d: 0 };
  for (const x of dias) {
    if (x.local_id !== localId || x.fecha < desde || x.fecha > hasta) continue;
    o.f += x.f; o.tk += x.tk; o.p += x.p; o.d += x.d;
  }
  o.d = Math.round(o.d * 100) / 100;
  return o;
}

// ── Suba de precios de los productos del 80 % ────────────────────────────────
async function subaPrecios(modo, p, primeraPorGrupo) {
  const anio = Number(p.hasta.slice(0, 4));
  // Lo que vendió cada producto en el año, por tipo de local
  const { rows: ventas } = await pool.query(`
    SELECT (l.tipo = 'cafeteria') AS es_cafe,
           LOWER(TRIM(COALESCE(pc.nombre_display, vi.producto_nombre_raw))) AS prod,
           MIN(TRIM(COALESCE(pc.nombre_display, vi.producto_nombre_raw))) AS nombre,
           SUM(vi.precio_total) AS venta
    FROM ventas_items vi
    JOIN ventas_tickets vt ON vt.id = vi.ticket_id AND vt.estado = 'cerrada'
    JOIN locales l ON l.id = vi.local_id
    LEFT JOIN productos_catalogo pc ON pc.id = vi.producto_id
    WHERE NOT vi.cancelada AND vt.fecha BETWEEN $1::date AND $2::date
    GROUP BY 1, 2
    HAVING SUM(vi.precio_total) > 0`, [`${anio}-01-01`, p.hasta]);

  // El precio de cada producto en una ventana: el más cobrado (mes) o el promedio (año)
  const precioSql = modo === 'anio'
    ? 'SUM(vi.precio_total) / NULLIF(SUM(vi.cantidad), 0)'
    : 'mode() WITHIN GROUP (ORDER BY ROUND(vi.precio_total / vi.cantidad))';
  const precios = async (desde, hasta) => {
    const { rows } = await pool.query(`
      SELECT (l.tipo = 'cafeteria') AS es_cafe,
             LOWER(TRIM(COALESCE(pc.nombre_display, vi.producto_nombre_raw))) AS prod,
             ${precioSql} AS precio
      FROM ventas_items vi
      JOIN ventas_tickets vt ON vt.id = vi.ticket_id AND vt.estado = 'cerrada'
      JOIN locales l ON l.id = vi.local_id
      LEFT JOIN productos_catalogo pc ON pc.id = vi.producto_id
      WHERE NOT vi.cancelada AND vi.cantidad > 0 AND vi.precio_total > 0
        AND vt.fecha BETWEEN $1::date AND $2::date
      GROUP BY 1, 2`, [desde, hasta]);
    return new Map(rows.map(r => [`${r.es_cafe}|${r.prod}`, n(r.precio)]));
  };
  // Cada grupo (tiendas / Café) se compara en los días que tiene cargados el año pasado
  const ventanas = [false, true].map(esCafe => {
    const antDesde = desdeComparable(p.anio_ant.desde, primeraPorGrupo[esCafe]);
    return { esCafe, antDesde, actDesde: maxIso(p.desde, atras(antDesde, -12)) };
  });
  const leidos = await Promise.all(ventanas.map(v => Promise.all([precios(v.actDesde, p.hasta), precios(v.antDesde, p.anio_ant.hasta)])));
  const hoy = new Map(), antes = new Map();
  ventanas.forEach((v, i) => {
    const [h, a] = leidos[i];
    for (const [k, val] of h) if (k.startsWith(`${v.esCafe}|`)) hoy.set(k, val);
    for (const [k, val] of a) if (k.startsWith(`${v.esCafe}|`)) antes.set(k, val);
  });

  const grupo = esCafe => {
    const lista = ventas.filter(v => v.es_cafe === esCafe).map(v => ({ prod: v.prod, nombre: v.nombre, venta: n(v.venta) }))
      .sort((a, b) => b.venta - a.venta);
    const total = lista.reduce((s, v) => s + v.venta, 0);
    const top = [];
    let acc = 0;
    for (const v of lista) { top.push(v); acc += v.venta; if (acc >= total * 0.8) break; }
    const out = top.map(v => ({ ...v, hoy: hoy.get(`${esCafe}|${v.prod}`) ?? null, antes: antes.get(`${esCafe}|${v.prod}`) ?? null }));
    out.total = total; out.productos = lista.length;
    return out;
  };
  const indice = lista => {
    let w = 0, s = 0, usados = 0;
    for (const v of lista) {
      if (!v.hoy || !v.antes) continue;
      w += v.venta; s += v.venta * (v.hoy / v.antes); usados++;
    }
    return w > 0 ? { pct: Math.round((s / w - 1) * 1000) / 10, productos: usados, de: lista.length } : null;
  };
  const tiendas = grupo(false), cafe = grupo(true);
  const res = { tiendas: indice(tiendas), cafe: indice(cafe), red: indice([...tiendas, ...cafe]) };
  // El detalle (los productos del 80 % con sus precios) lo usa la solapa Productos
  Object.defineProperty(res, 'detalle', { enumerable: false, value: {
    tiendas: { total: tiendas.total, productos: tiendas.productos, top: tiendas.map(({ prod, ...v }) => v) },
    cafe:    { total: cafe.total,    productos: cafe.productos,    top: cafe.map(({ prod, ...v }) => v) },
  } });
  return res;
}

// ── Docenas por mes del año, para la curvita de cada tienda ──────────────────
async function docenasPorMes(p) {
  const anio = p.hasta.slice(0, 4);
  const { rows } = await pool.query(`
    SELECT vi.local_id, EXTRACT(MONTH FROM vi.fecha_creacion AT TIME ZONE '${TZ}')::int AS mes,
           COALESCE(SUM(vi.docenas_equivalentes) FILTER (WHERE NOT vi.cancelada), 0) AS dz
    FROM ventas_items vi
    WHERE vi.fecha_creacion >= ($1::date - 1)::timestamptz AND vi.fecha_creacion < ($2::date + 2)::timestamptz
      AND DATE(vi.fecha_creacion AT TIME ZONE '${TZ}') BETWEEN $1::date AND $2::date
    GROUP BY 1, 2`, [`${anio}-01-01`, p.hasta]);
  const out = new Map();
  rows.forEach(r => {
    const l = Number(r.local_id);
    if (!out.has(l)) out.set(l, {});
    out.get(l)[r.mes] = Math.round(n(r.dz) * 100) / 100;
  });
  return out;
}

async function parametrosIpc() {
  const { rows } = await pool.query(`SELECT clave, valor FROM parametros WHERE clave IN ('ipc_interanual', 'ipc_mes')`);
  const m = Object.fromEntries(rows.map(r => [r.clave, r.valor]));
  return { valor: m.ipc_interanual != null ? Number(m.ipc_interanual) : null, mes: m.ipc_mes || null };
}

async function comoVenimos(modo) {
  const hoy = (await pool.query(`SELECT MAX(fecha)::text AS f FROM ventas_tickets WHERE estado = 'cerrada'`)).rows[0]?.f;
  if (!hoy) return null;

  const clave = `${modo}|${hoy}`;
  const enCache = cache.get(clave);
  if (enCache && Date.now() - enCache.t < CACHE_MS) {
    return { ...enCache.data, inflacion: await parametrosIpc() };
  }

  const p = periodos(modo, hoy);
  const { rows: locales } = await pool.query(`
    SELECT l.id, l.nombre, l.tipo, (l.tipo = 'cafeteria') AS es_cafe,
           (SELECT MIN(vt.fecha)::text FROM ventas_tickets vt WHERE vt.local_id = l.id AND vt.estado = 'cerrada') AS primera_venta
    FROM locales l WHERE l.activo = true ORDER BY l.id`);

  const rangos = [{ desde: p.desde, hasta: p.hasta }, p.anio_ant];
  if (p.mes_ant) rangos.push(p.mes_ant);
  if (p.mes_completo_ant) rangos.push(p.mes_completo_ant);

  // La primera venta cargada de cada grupo, para saber desde cuándo compararlo
  const primera = esCafe => locales.filter(l => l.es_cafe === esCafe && l.primera_venta)
    .reduce((a, l) => (!a || l.primera_venta < a ? l.primera_venta : a), null);
  const primeraPorGrupo = { false: primera(false), true: primera(true) };

  const [dias, suba, porMes] = await Promise.all([diarios(rangos), subaPrecios(modo, p, primeraPorGrupo), docenasPorMes(p)]);

  const mesActual = Number(p.hasta.slice(5, 7));
  const data = {
    periodo: p,
    suba_precios: suba,
    locales: locales.map(l => {
      const id = Number(l.id);
      // Contra el año pasado: solo los días en que el local ya tenía ventas cargadas
      let cmp = null;
      if (l.primera_venta && l.primera_venta <= p.anio_ant.hasta) {
        const antDesde = desdeComparable(p.anio_ant.desde, l.primera_venta);
        const actDesde = atras(antDesde, -12);
        cmp = {
          desde: actDesde,
          completo: antDesde === p.anio_ant.desde,
          act: sumar(dias, id, actDesde, p.hasta),
          ant: sumar(dias, id, antDesde, p.anio_ant.hasta),
        };
      }
      const serie = [];
      for (let m = 1; m < mesActual; m++) serie.push(porMes.get(id)?.[m] || 0);
      return {
        local_id: id,
        nombre: l.nombre,
        es_cafe: l.es_cafe,
        act: sumar(dias, id, p.desde, p.hasta),
        mes_ant: p.mes_ant ? sumar(dias, id, p.mes_ant.desde, p.mes_ant.hasta) : null,
        mes_completo_ant: p.mes_completo_ant ? sumar(dias, id, p.mes_completo_ant.desde, p.mes_completo_ant.hasta) : null,
        anio_ant: cmp,
        // Todo lo vendido en los mismos días del año pasado, sin sacar nada (aunque el local
        // tuviera esos días a medias o no existiera): es lo que realmente se vendió.
        anio_ant_total: sumar(dias, id, p.anio_ant.desde, p.anio_ant.hasta),
        docenas_por_mes: serie,
      };
    }),
  };
  cache.set(clave, { t: Date.now(), data });
  return { ...data, inflacion: await parametrosIpc() };
}

// Los productos que hacen el 80 % de la venta del año, tiendas y Café, con su precio
// de estos días del mes contra los mismos días del año pasado.
async function productos80() {
  const hoy = (await pool.query(`SELECT MAX(fecha)::text AS f FROM ventas_tickets WHERE estado = 'cerrada'`)).rows[0]?.f;
  if (!hoy) return null;
  const p = periodos('mes', hoy);
  const { rows: locales } = await pool.query(`
    SELECT (l.tipo = 'cafeteria') AS es_cafe,
           (SELECT MIN(vt.fecha)::text FROM ventas_tickets vt WHERE vt.local_id = l.id AND vt.estado = 'cerrada') AS primera_venta
    FROM locales l WHERE l.activo = true`);
  const primera = esCafe => locales.filter(l => l.es_cafe === esCafe && l.primera_venta)
    .reduce((a, l) => (!a || l.primera_venta < a ? l.primera_venta : a), null);
  const suba = await subaPrecios('mes', p, { false: primera(false), true: primera(true) });
  return {
    desde: `${hoy.slice(0, 4)}-01-01`,
    hasta: hoy,
    precios: { desde: p.desde, hasta: p.hasta, anio_ant: p.anio_ant },
    suba: { tiendas: suba.tiendas, cafe: suba.cafe, red: suba.red },
    ...suba.detalle,
    inflacion: await parametrosIpc(),
  };
}

module.exports = { comoVenimos, productos80, parametrosIpc, diarios, periodos, atras, _periodos: periodos, _atras: atras };
