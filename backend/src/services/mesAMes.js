'use strict';

// "Mes a mes": cada mes del año de cada local de Entre Dos (facturación, tickets,
// personas y docenas). El mes en curso viene a medias; el front lo proyecta con los
// días que van. La "línea del mes típico" (mediana) la calcula el front sobre los
// meses completos.

const pool = require('../config/db');

const TZ = 'America/Argentina/Mendoza';
const n = v => Number(v) || 0;

async function mesAMes() {
  const hoy = (await pool.query(`SELECT MAX(fecha)::text AS f FROM ventas_tickets WHERE estado = 'cerrada'`)).rows[0]?.f;
  if (!hoy) return null;
  const anio = Number(hoy.slice(0, 4));
  const mesActual = Number(hoy.slice(5, 7));
  const desde = `${anio}-01-01`;

  const [locales, tk, dz] = await Promise.all([
    pool.query(`SELECT id, nombre, (tipo = 'cafeteria') AS es_cafe FROM locales WHERE activo = true ORDER BY id`),
    pool.query(`
      SELECT local_id, EXTRACT(MONTH FROM fecha)::int AS mes,
             SUM(total) AS f, COUNT(*) AS tk, COALESCE(SUM(personas), 0) AS p
      FROM ventas_tickets
      WHERE estado = 'cerrada' AND fecha BETWEEN $1::date AND $2::date
      GROUP BY 1, 2`, [desde, hoy]),
    pool.query(`
      SELECT local_id, EXTRACT(MONTH FROM fecha_creacion AT TIME ZONE '${TZ}')::int AS mes,
             COALESCE(SUM(docenas_equivalentes) FILTER (WHERE NOT cancelada), 0) AS d
      FROM ventas_items
      WHERE fecha_creacion >= ($1::date - 1)::timestamptz AND fecha_creacion < ($2::date + 2)::timestamptz
        AND DATE(fecha_creacion AT TIME ZONE '${TZ}') BETWEEN $1::date AND $2::date
      GROUP BY 1, 2`, [desde, hoy]),
  ]);

  const vacio = () => Array.from({ length: mesActual }, () => ({ f: 0, tk: 0, p: 0, d: 0 }));
  const porLocal = new Map(locales.rows.map(l => [Number(l.id), vacio()]));
  tk.rows.forEach(r => {
    const m = porLocal.get(Number(r.local_id))?.[r.mes - 1];
    if (m) { m.f = n(r.f); m.tk = n(r.tk); m.p = n(r.p); }
  });
  dz.rows.forEach(r => {
    const m = porLocal.get(Number(r.local_id))?.[r.mes - 1];
    if (m) m.d = Math.round(n(r.d) * 100) / 100;
  });

  const diaHoy = Number(hoy.slice(8, 10));
  const diasMes = new Date(Date.UTC(anio, mesActual, 0)).getUTCDate();
  return {
    anio,
    hasta: hoy,
    mes_actual: { mes: mesActual, n_dias: diaHoy, dias_total: diasMes, completo: diaHoy === diasMes },
    locales: locales.rows.map(l => ({ local_id: Number(l.id), nombre: l.nombre, es_cafe: l.es_cafe, meses: porLocal.get(Number(l.id)) })),
  };
}

module.exports = { mesAMes };
