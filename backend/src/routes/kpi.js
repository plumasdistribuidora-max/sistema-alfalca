const express = require('express');
const pool    = require('../config/db');
const { requireAuth, requireRol, ROLES } = require('../middleware/auth');

const router = express.Router();
const n = v => Number(v) || 0;

function mesActual() {
  const t = new Date();
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}`;
}

function restarMeses(mes, cantidad) {
  const [y, m] = mes.split('-').map(Number);
  const d = new Date(y, m - 1 - cantidad, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function finDeMes(mes) {
  const [y, m] = mes.split('-').map(Number);
  return `${mes}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`;
}

// Las horas de un reporte: la plantilla de café trae las de todo el turno,
// las demás solo las de quien firma.
function horasDe(reporte) {
  const r = reporte.respuestas || {};
  if (Array.isArray(r.horas_equipo)) {
    return r.horas_equipo
      .filter(f => f.empleado_id && Number(f.horas) > 0)
      .map(f => ({ empleado_id: Number(f.empleado_id), horas: Number(f.horas) }));
  }
  if (r.horas && Number(r.horas) > 0 && reporte.empleado_id) {
    return [{ empleado_id: reporte.empleado_id, horas: Number(r.horas) }];
  }
  return [];
}

// ── GET / ─────────────────────────────────────────────────────────────────────
// Toda el área en una sola llamada: la serie de cada indicador, por local y para
// la red, sobre los últimos N meses. El frontend arma el resumen y el detalle
// sin volver a pedir nada.

router.get('/', requireAuth, requireRol(ROLES.ENCARGADO_GENERAL), async (req, res) => {
  try {
    const hasta = req.query.hasta || mesActual();
    if (!/^\d{4}-\d{2}$/.test(hasta)) {
      return res.status(400).json({ ok: false, error: 'Mes inválido (usá YYYY-MM)' });
    }
    const cantidad = Math.min(Math.max(parseInt(req.query.meses) || 6, 2), 24);

    const meses = [];
    for (let i = cantidad - 1; i >= 0; i--) meses.push(restarMeses(hasta, i));
    const desde = `${meses[0]}-01`;
    const hastaFecha = finDeMes(hasta);

    const locales = (await pool.query(
      'SELECT id, nombre, tipo, objetivo_horas_ventas FROM locales WHERE activo = true ORDER BY id'
    )).rows;

    // Ventas y tickets por local y mes, más los días con actividad de cada uno.
    const ventas = (await pool.query(`
      SELECT local_id, to_char(fecha, 'YYYY-MM') AS mes,
             COALESCE(SUM(total), 0) AS total,
             COUNT(*)::int            AS tickets,
             COUNT(DISTINCT fecha)::int AS dias
      FROM ventas_tickets
      WHERE fecha BETWEEN $1 AND $2 AND estado = 'cerrada'
      GROUP BY local_id, to_char(fecha, 'YYYY-MM')
    `, [desde, hastaFecha])).rows;

    const reportes = (await pool.query(`
      SELECT local_id, fecha::text, to_char(fecha, 'YYYY-MM') AS mes, empleado_id, respuestas
      FROM reportes
      WHERE fecha BETWEEN $1 AND $2 AND estado <> 'borrador'
    `, [desde, hastaFecha])).rows;

    const vigencias = (await pool.query(
      'SELECT empleado_id, valor_hora, vigente_desde::text FROM valor_hora_empleado ORDER BY vigente_desde'
    )).rows;
    // El valor de un día es el último que empezó a regir en o antes de ese día.
    const valorEn = (empleadoId, fecha) => {
      let v = null;
      for (const x of vigencias) {
        if (x.empleado_id === empleadoId && x.vigente_desde <= fecha) v = n(x.valor_hora);
      }
      return v;
    };

    const empleados = Object.fromEntries(
      (await pool.query('SELECT id, puesto FROM empleados')).rows.map(e => [e.id, e])
    );

    // Acumulador: celda[localId][mes]
    const celda = {};
    const vacia = () => ({
      ventas: 0, tickets: 0, dias_venta: 0,
      horas: 0, gasto: 0, horas_sin_valor: 0,
      dias_con_reporte: new Set(),
    });
    for (const l of locales) {
      celda[l.id] = {};
      for (const m of meses) celda[l.id][m] = vacia();
    }

    for (const v of ventas) {
      const c = celda[v.local_id]?.[v.mes];
      if (!c) continue;
      c.ventas     += n(v.total);
      c.tickets    += v.tickets;
      c.dias_venta += v.dias;
    }

    for (const rep of reportes) {
      const c = celda[rep.local_id]?.[rep.mes];
      if (!c) continue;
      c.dias_con_reporte.add(rep.fecha);
      for (const fila of horasDe(rep)) {
        const valor = valorEn(fila.empleado_id, rep.fecha);
        c.horas += fila.horas;
        if (valor) c.gasto += fila.horas * valor;
        else c.horas_sin_valor += fila.horas;
      }
    }

    // Los indicadores derivan de esas celdas. Cada uno sabe si un valor más alto
    // es mejor y cómo mostrarse, porque eso decide el color del delta.
    const INDICADORES = [
      {
        id: 'ventas', nombre: 'Ventas del mes', formato: 'millones', mejorSube: true,
        calc: c => c.ventas,
      },
      {
        id: 'tprom', nombre: 'Ticket promedio', formato: 'moneda', mejorSube: true,
        calc: c => (c.tickets > 0 ? c.ventas / c.tickets : null),
      },
      {
        id: 'tickets', nombre: 'Personas atendidas', formato: 'entero', mejorSube: true,
        calc: c => c.tickets,
      },
      {
        id: 'horas_ventas', nombre: 'Gasto de personal sobre ventas', formato: 'porcentaje',
        mejorSube: false, conObjetivo: true,
        calc: c => (c.ventas > 0 && c.gasto > 0 ? (c.gasto / c.ventas) * 100 : null),
      },
      {
        id: 'venta_hora', nombre: 'Venta por hora trabajada', formato: 'moneda', mejorSube: true,
        calc: c => (c.horas > 0 ? c.ventas / c.horas : null),
      },
      {
        id: 'cumplimiento', nombre: 'Días con reporte cargado', formato: 'porcentaje',
        mejorSube: true,
        // dias_reportados solo existe en la celda de la red, donde se cuenta por
        // local-día; en la de un local alcanza el tamaño del conjunto de fechas.
        calc: c => {
          if (!(c.dias_venta > 0)) return null;
          const conReporte = c.dias_reportados ?? c.dias_con_reporte.size;
          return (conReporte / c.dias_venta) * 100;
        },
      },
    ];

    // Para la red se suman las celdas de todos los locales y recién ahí se calcula:
    // el promedio de razones no es la razón de los totales.
    //
    // El cumplimiento se cuenta por local-día, no por día: si abrieron los cinco
    // locales y reportó uno solo, unir los días daría 100% cuando la respuesta
    // correcta es 20%.
    const celdaRed = {};
    for (const m of meses) {
      const t = vacia();
      t.dias_reportados = 0;
      for (const l of locales) {
        const c = celda[l.id][m];
        t.ventas           += c.ventas;
        t.tickets          += c.tickets;
        t.horas            += c.horas;
        t.gasto            += c.gasto;
        t.horas_sin_valor  += c.horas_sin_valor;
        t.dias_venta       += c.dias_venta;
        t.dias_reportados  += c.dias_con_reporte.size;
      }
      celdaRed[m] = t;
    }

    const series = {};
    for (const ind of INDICADORES) {
      series[ind.id] = {
        id: ind.id, nombre: ind.nombre, formato: ind.formato,
        mejorSube: ind.mejorSube, conObjetivo: !!ind.conObjetivo,
        red: meses.map(m => ind.calc(celdaRed[m])),
        porLocal: Object.fromEntries(
          locales.map(l => [l.id, meses.map(m => ind.calc(celda[l.id][m]))])
        ),
      };
    }

    // Horas sin valor hora cargado: si son muchas, el indicador de personal miente.
    const horasSinValor = meses.map(m => celdaRed[m].horas_sin_valor);

    res.json({
      ok: true,
      data: {
        meses,
        locales: locales.map(l => ({
          id: l.id, nombre: l.nombre, tipo: l.tipo,
          objetivo: n(l.objetivo_horas_ventas),
        })),
        series,
        horas_sin_valor: horasSinValor,
      },
    });
  } catch (err) {
    console.error('[kpi GET]', err);
    res.status(500).json({ ok: false, error: 'Error al calcular los indicadores' });
  }
});

// ── POST /objetivo ────────────────────────────────────────────────────────────

router.post('/objetivo', requireAuth, requireRol(ROLES.ENCARGADO_GENERAL), async (req, res) => {
  try {
    const { local_id, objetivo } = req.body;
    if (!local_id || !(Number(objetivo) > 0)) {
      return res.status(400).json({ ok: false, error: 'Falta el local o el objetivo' });
    }
    await pool.query('UPDATE locales SET objetivo_horas_ventas = $1 WHERE id = $2',
      [Number(objetivo), local_id]);
    res.json({ ok: true });
  } catch (err) {
    console.error('[kpi/objetivo]', err);
    res.status(500).json({ ok: false, error: 'Error al guardar el objetivo' });
  }
});

module.exports = router;
