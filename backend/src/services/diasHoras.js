'use strict';

// "Días y horas", del 1/1 al último día cargado:
//  · qué día de la semana vende cada local (promedio de un día abierto),
//  · las semanas completas (lunes a domingo) del año: docenas en las tiendas y
//    facturación en el Café,
//  · cuánto de la venta del día entra en cada hora.
// La hora de los tickets está guardada como el reloj del local con etiqueta UTC: se
// lee en UTC para no correrla 3 horas.

const pool = require('../config/db');

const TZ = 'America/Argentina/Mendoza';
const n = v => Number(v) || 0;

async function diasHoras() {
  const hoy = (await pool.query(`SELECT MAX(fecha)::text AS f FROM ventas_tickets WHERE estado = 'cerrada'`)).rows[0]?.f;
  if (!hoy) return null;
  const desde = `${hoy.slice(0, 4)}-01-01`;

  const [locales, dow, horas, semT, semD] = await Promise.all([
    pool.query(`SELECT id, nombre, (tipo = 'cafeteria') AS es_cafe FROM locales WHERE activo = true ORDER BY id`),
    pool.query(`
      WITH d AS (
        SELECT local_id, fecha, SUM(total) AS f FROM ventas_tickets
        WHERE estado = 'cerrada' AND fecha BETWEEN $1::date AND $2::date GROUP BY 1, 2
      )
      SELECT local_id, EXTRACT(ISODOW FROM fecha)::int AS dia, AVG(f) AS prom, COUNT(*) AS dias
      FROM d GROUP BY 1, 2`, [desde, hoy]),
    pool.query(`
      SELECT local_id, EXTRACT(HOUR FROM creacion AT TIME ZONE 'UTC')::int AS hora, SUM(total) AS f
      FROM ventas_tickets
      WHERE estado = 'cerrada' AND creacion IS NOT NULL AND fecha BETWEEN $1::date AND $2::date
      GROUP BY 1, 2`, [desde, hoy]),
    pool.query(`
      SELECT local_id, DATE_TRUNC('week', fecha)::date::text AS semana, SUM(total) AS f
      FROM ventas_tickets
      WHERE estado = 'cerrada' AND fecha BETWEEN $1::date AND $2::date
      GROUP BY 1, 2`, [desde, hoy]),
    pool.query(`
      SELECT local_id, DATE_TRUNC('week', DATE(fecha_creacion AT TIME ZONE '${TZ}'))::date::text AS semana,
             COALESCE(SUM(docenas_equivalentes) FILTER (WHERE NOT cancelada), 0) AS d
      FROM ventas_items
      WHERE fecha_creacion >= ($1::date - 1)::timestamptz AND fecha_creacion < ($2::date + 2)::timestamptz
        AND DATE(fecha_creacion AT TIME ZONE '${TZ}') BETWEEN $1::date AND $2::date
      GROUP BY 1, 2`, [desde, hoy]),
  ]);

  // Solo semanas completas: empiezan el 1/1 o después y terminan (domingo) hasta hoy
  const completa = s => {
    const ini = Date.parse(`${s}T00:00:00Z`);
    const fin = new Date(ini + 6 * 86400000).toISOString().slice(0, 10);
    return s >= desde && fin <= hoy;
  };
  const semanas = [...new Set(semT.rows.map(r => r.semana))].filter(completa).sort();

  return {
    desde, hasta: hoy, semanas,
    locales: locales.rows.map(l => {
      const id = Number(l.id);
      const dias = Array.from({ length: 7 }, (_, i) => {
        const r = dow.rows.find(x => Number(x.local_id) === id && x.dia === i + 1);
        return r ? { prom: Math.round(n(r.prom)), dias: n(r.dias) } : null;
      });
      const porHora = {};
      horas.rows.filter(r => Number(r.local_id) === id).forEach(r => { porHora[r.hora] = n(r.f); });
      const f = Object.fromEntries(semT.rows.filter(r => Number(r.local_id) === id).map(r => [r.semana, n(r.f)]));
      const d = Object.fromEntries(semD.rows.filter(r => Number(r.local_id) === id).map(r => [r.semana, Math.round(n(r.d) * 100) / 100]));
      return {
        local_id: id, nombre: l.nombre, es_cafe: l.es_cafe,
        dias, horas: porHora,
        semanas: semanas.map(s => ({ f: f[s] || 0, d: d[s] || 0 })),
      };
    }),
  };
}

module.exports = { diasHoras };
