'use strict';

// Vendedores de un local: lo que vendió cada uno por mes y por turno, para que el
// front compare entre ellos en las fechas que se elijan. Mañana es hasta las 15 h
// (el cambio de turno de las tiendas y del Café). La hora del ítem está guardada como
// el reloj del local con etiqueta UTC: se lee en UTC para no correrla 3 horas.

const pool = require('../config/db');
const n = v => Number(v) || 0;

const CORTE_TURNO = 15;
const GENERICOS = ['admin', 'mozos'];

async function vendedores(localId, desde, hasta) {
  const { rows } = await pool.query(`
    SELECT vi.empleado AS nombre,
           TO_CHAR(vt.fecha, 'YYYY-MM') AS mes,
           CASE WHEN EXTRACT(HOUR FROM vi.fecha_creacion AT TIME ZONE 'UTC') < $4 THEN 'm' ELSE 't' END AS turno,
           SUM(vi.docenas_equivalentes) AS d,
           SUM(vi.precio_total)         AS f,
           COUNT(DISTINCT vt.fecha)     AS turnos,
           COUNT(DISTINCT vt.id)        AS tk
    FROM ventas_items vi
    JOIN ventas_tickets vt ON vt.id = vi.ticket_id AND vt.estado = 'cerrada'
    WHERE vi.local_id = $1 AND NOT vi.cancelada
      AND vi.empleado IS NOT NULL AND TRIM(vi.empleado) <> ''
      AND vt.fecha BETWEEN $2::date AND $3::date
    GROUP BY 1, 2, 3
    ORDER BY 1, 2, 3`, [localId, desde, hasta, CORTE_TURNO]);
  return {
    corte_turno: CORTE_TURNO,
    genericos: GENERICOS,
    filas: rows.map(r => ({
      nombre: r.nombre, mes: r.mes, turno: r.turno,
      d: Math.round(n(r.d) * 100) / 100, f: n(r.f), turnos: n(r.turnos), tk: n(r.tk),
    })),
  };
}

module.exports = { vendedores };
