'use strict';

// "Crecimiento": de dónde viene lo que creció Entre Dos contra los mismos días del año
// pasado. Separa lo que ya estaba (mismos locales y zonas) de lo que no tiene contra qué
// compararse, y descuenta la inflación, que es el número al que se quiere llegar.
//
// Reglas:
//  · Los locales de una misma zona (locales.zona_de) se comparan como uno solo: Sheraton
//    se abrió al lado de Amigorena, así que lo que una pierde y la otra gana se compensa.
//  · Una zona que el año pasado ya vendía se compara en todo el período, aunque le falten
//    unas semanas al principio (la Peatonal tiene 2025 desde el 25/1): así se mira año
//    contra año, como Entre Dos mira su red. Solo si le faltan más de 45 días (el Café
//    abrió en julio de 2025) se compara desde su primera venta, y lo de antes va a
//    "sin año pasado para comparar".
//  · Pesos y docenas, tiendas y Café: el Café también vende docenas.

const pool = require('../config/db');
const { diarios, periodos, atras, parametrosIpc } = require('./comoVenimos');

const TOLERANCIA_DIAS = 45;
const diasEntre = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
function desdeComparable(inicio, primeraVenta) {
  if (!primeraVenta || primeraVenta <= inicio) return inicio;
  return diasEntre(inicio, primeraVenta) <= TOLERANCIA_DIAS ? inicio : primeraVenta;
}

const CACHE_MS = 10 * 60 * 1000;
const cache = new Map();

function sumar(dias, ids, desde, hasta) {
  const o = { f: 0, d: 0 };
  if (!desde || desde > hasta) return o;
  for (const x of dias) {
    if (!ids.includes(x.local_id) || x.fecha < desde || x.fecha > hasta) continue;
    o.f += x.f; o.d += x.d;
  }
  o.d = Math.round(o.d * 10) / 10;
  return o;
}
const ayer = f => new Date(Date.parse(`${f}T00:00:00Z`) - 86400000).toISOString().slice(0, 10);

async function crecimiento(modo) {
  const hoy = (await pool.query(`SELECT MAX(fecha)::text AS f FROM ventas_tickets WHERE estado = 'cerrada'`)).rows[0]?.f;
  if (!hoy) return null;
  const clave = `${modo}|${hoy}`;
  const enCache = cache.get(clave);
  if (enCache && Date.now() - enCache.t < CACHE_MS) return { ...enCache.data, inflacion: await parametrosIpc() };

  const p = periodos(modo, hoy);
  // zona_de se lee por JSON para que la pantalla funcione aunque la columna todavía no exista.
  const { rows: locales } = await pool.query(`
    SELECT l.id, l.nombre, (l.tipo = 'cafeteria') AS es_cafe, (to_jsonb(l)->>'zona_de')::int AS zona_de,
           (SELECT MIN(vt.fecha)::text FROM ventas_tickets vt WHERE vt.local_id = l.id AND vt.estado = 'cerrada') AS primera_venta
    FROM locales l WHERE l.activo = true ORDER BY l.id`);
  const dias = await diarios([{ desde: p.desde, hasta: p.hasta }, p.anio_ant]);

  const porZona = new Map();
  for (const l of locales) {
    const k = l.zona_de || l.id;
    if (!porZona.has(k)) porZona.set(k, []);
    porZona.get(k).push(l);
  }

  const zonas = [];
  for (const [k, miembros] of porZona) {
    const ids = miembros.map(m => Number(m.id));
    const ancla = miembros.find(m => m.id === k) || miembros[0];
    const primera = miembros.map(m => m.primera_venta).filter(Boolean).sort()[0] || null;
    // Desde cuándo esta zona tiene contra qué compararse
    let cmp = null;
    if (primera && primera <= p.anio_ant.hasta) {
      const antDesde = desdeComparable(p.anio_ant.desde, primera);
      const actDesde = atras(antDesde, -12);
      cmp = {
        desde: actDesde,
        act: sumar(dias, ids, actDesde, p.hasta),
        ant: sumar(dias, ids, antDesde, p.anio_ant.hasta),
        locales: miembros.map(m => ({
          id: Number(m.id), nombre: m.nombre, primera_venta: m.primera_venta,
          act: sumar(dias, [Number(m.id)], actDesde, p.hasta),
          ant: sumar(dias, [Number(m.id)], antDesde, p.anio_ant.hasta),
        })),
      };
    }
    const finSin = cmp ? ayer(cmp.desde) : p.hasta;
    const sin = sumar(dias, ids, p.desde, finSin);
    zonas.push({
      id: Number(k),
      nombre: ancla.nombre,
      es_cafe: miembros.every(m => m.es_cafe),
      locales: miembros.map(m => ({ id: Number(m.id), nombre: m.nombre })),
      comparable: cmp,
      // Lo vendido antes de que la zona tuviera año pasado: no estaba abierta o no hay ventas cargadas.
      sin_comparar: sin.f > 0 || sin.d > 0
        ? { desde: p.desde, hasta: finSin, ...sin, abrio: primera && primera > p.anio_ant.hasta ? null : primera }
        : null,
    });
  }

  const todos = locales.map(l => Number(l.id));
  const data = {
    periodo: p,
    zonas,
    total: { act: sumar(dias, todos, p.desde, p.hasta), ant: sumar(dias, todos, p.anio_ant.desde, p.anio_ant.hasta) },
  };
  cache.set(clave, { t: Date.now(), data });
  return { ...data, inflacion: await parametrosIpc() };
}

module.exports = { crecimiento };
