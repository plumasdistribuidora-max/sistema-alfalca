const express = require('express');
const pool    = require('../config/db');
const { requireAuth, requireRol, ROLES } = require('../middleware/auth');
const { hoyStr } = require('../utils/fechas');
const { unoPorTurno, esNovedad } = require('../utils/reportes');
const { valorMantenimiento, itemsDelDia } = require('../utils/mantenimiento');
const { nombresDeProductos, items: itemsVencimiento, paraCierre } = require('../utils/vencimientos');
const { localCafeteria, teoricoCafe, cafeDelDia } = require('../utils/cafe');

const router = express.Router();


const n = v => Number(v) || 0;

// Las horas de un reporte según el tipo de plantilla: la de café trae las de todo
// el turno, las otras solo las de quien firma.
// Filas de detalle sin nada cargado (la vacía que deja el formulario al tocar "Sí").
function filasConDatos(items) {
  return (Array.isArray(items) ? items : []).filter(
    f => f && Object.values(f).some(x => x !== undefined && x !== null && String(x).trim() !== '')
  );
}

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

// Las facturas de proveedores que le tienen que llegar al dueño con el cierre: lo que
// se pagó ese día, lo que ya venció y lo que vence antes del domingo. Se arma solo:
// el encargado no transcribe nada de esto.
async function facturasDelDia(fecha) {
  // Las facturas que entraron ese día, cargadas desde el reporte del turno o desde Proveedores.
  const cargadas = (await pool.query(`
    SELECT f.numero, f.total,
           COALESCE(p.nombre, f.proveedor) AS proveedor,
           l.nombre AS local_nombre
    FROM facturas f
    LEFT JOIN proveedores p ON p.id = f.proveedor_id
    LEFT JOIN locales     l ON l.id = f.local_id
    WHERE f.fecha = $1
    ORDER BY f.id
  `, [fecha])).rows.map(r => ({ ...r, total: n(r.total) }));

  const pagos = (await pool.query(`
    SELECT pg.monto, pg.medio, pg.comprobante,
           f.numero AS factura_numero,
           COALESCE(p.nombre, f.proveedor) AS proveedor
    FROM pagos_proveedor pg
    JOIN facturas f ON f.id = pg.factura_id
    LEFT JOIN proveedores p ON p.id = f.proveedor_id
    WHERE pg.fecha = $1
    ORDER BY pg.id
  `, [fecha])).rows;

  // Las facturas no tienen vencimiento fijo: se mira la deuda y cuánto hace que está
  // sin pagar cada una (por la fecha de la factura).
  const abiertas = (await pool.query(`
    SELECT f.fecha::text AS fecha, f.local_id,
           COALESCE(p.nombre, f.proveedor) AS proveedor,
           f.total - COALESCE((SELECT SUM(monto) FROM pagos_proveedor WHERE factura_id = f.id), 0) AS saldo
    FROM facturas f
    LEFT JOIN proveedores p ON p.id = f.proveedor_id
    WHERE f.total - COALESCE((SELECT SUM(monto) FROM pagos_proveedor WHERE factura_id = f.id), 0) > 0
    ORDER BY f.fecha, f.id
  `)).rows.map(r => ({ ...r, saldo: n(r.saldo) }));

  return {
    cargadas,
    total_cargadas: cargadas.reduce((s, f) => s + f.total, 0),
    pagos,
    pagado_hoy: pagos.reduce((s, p) => s + n(p.monto), 0),
    deuda_total: abiertas.reduce((s, f) => s + f.saldo, 0),
    mas_vieja: abiertas[0]?.fecha || null,
    facturas_abiertas: abiertas.length,
  };
}

// Arma el consolidado del día: lo que ya sabe el sistema más lo que cargó cada turno.
// El encargado no transcribe nada de esto — lo verifica.
async function armarDia(fecha) {
  const locales = (await pool.query(
    'SELECT id, nombre, tipo, objetivo_horas_ventas FROM locales WHERE activo = true ORDER BY id'
  )).rows;

  // Ventas y tickets del Excel de Fudo ya importado.
  const ventas = (await pool.query(`
    SELECT local_id, COALESCE(SUM(total), 0) AS total, COUNT(*)::int AS tickets
    FROM ventas_tickets
    WHERE fecha = $1 AND estado = 'cerrada'
    GROUP BY local_id
  `, [fecha])).rows;
  const ventasPorLocal = Object.fromEntries(
    ventas.map(v => [v.local_id, { total: n(v.total), tickets: v.tickets }])
  );

  // Reportes de turno del día.
  // Si dos personas enviaron el mismo turno, cuenta uno solo (la misma regla que la
  // grilla del día): si no, las ventas de ese turno se suman dos veces.
  const reportes = unoPorTurno((await pool.query(`
    SELECT r.id, r.local_id, r.turno, r.estado, r.empleado_id, r.respuestas,
           r.plantilla_codigo, r.enviado_at, u.nombre AS usuario_nombre
    FROM reportes r
    JOIN usuarios u ON u.id = r.usuario_id
    WHERE r.fecha = $1 AND r.estado <> 'borrador'
    ORDER BY r.local_id, r.turno
  `, [fecha])).rows);

  // Valor hora vigente a esa fecha, por persona.
  const valores = (await pool.query(`
    SELECT DISTINCT ON (empleado_id) empleado_id, valor_hora
    FROM valor_hora_empleado
    WHERE vigente_desde <= $1
    ORDER BY empleado_id, vigente_desde DESC
  `, [fecha])).rows;
  const valorDe = Object.fromEntries(valores.map(v => [v.empleado_id, n(v.valor_hora)]));

  const empleados = Object.fromEntries(
    (await pool.query('SELECT id, nombre, puesto, local_id_principal FROM empleados')).rows
      .map(e => [e.id, e])
  );

  // Acumular horas, gasto y personas atendidas por local.
  const porLocal = {};
  for (const l of locales) {
    porLocal[l.id] = {
      local_id: l.id, nombre: l.nombre, tipo: l.tipo,
      ventas_sistema: ventasPorLocal[l.id]?.total ?? 0,
      tickets_sistema: ventasPorLocal[l.id]?.tickets ?? 0,
      objetivo: n(l.objetivo_horas_ventas),
      personas_reportadas: 0,
      ventas_reportadas: 0,
      horas: 0, gasto_personal: 0,
      horas_sin_valor: 0,
      reportes: [], turnos_con_reporte: [],
    };
  }

  const novedades = { vencimientos: [], mantenimiento: [], faltantes: [], ausencias: [], quejas: [], gastos: [] };
  // El maestro de productos, para ponerle nombre a lo que el check guardó como id.
  const nombresProducto = await nombresDeProductos();
  const horasPorPersona = new Map();
  const dichoHoy = [];   // { id, turno, respuesta } por cada ítem de mantenimiento que nombró un turno

  for (const rep of reportes) {
    const acc = porLocal[rep.local_id];
    if (!acc) continue;

    acc.reportes.push({
      id: rep.id, turno: rep.turno, estado: rep.estado,
      usuario_nombre: rep.usuario_nombre, plantilla: rep.plantilla_codigo,
    });
    acc.turnos_con_reporte.push(rep.turno);

    const r = rep.respuestas || {};
    acc.personas_reportadas += n(r.personas);
    acc.ventas_reportadas   += n(r.ventas);

    // Las horas se juntan por persona y turno, no por reporte: la cocinera aparece en
    // el equipo del café Y en su propio reporte de cocina, y son las mismas horas.
    for (const fila of horasDe(rep)) {
      const clave = `${rep.local_id}|${rep.turno}|${fila.empleado_id}`;
      const previa = horasPorPersona.get(clave);
      if (!previa || fila.horas > previa.horas) {
        horasPorPersona.set(clave, { acc, empleado_id: fila.empleado_id, horas: fila.horas });
      }
    }

    // Novedades que el encargado tiene que mirar y resumir para los dueños.
    const local = porLocal[rep.local_id].nombre;
    const quien = rep.usuario_nombre;
    // Los días que faltan se calculan acá, contra la fecha del cierre: el reporte
    // guarda la fecha del paquete y nada más, así que un cierre viejo sigue diciendo
    // los días que faltaban ese día.
    if (r.vencimientos?.hubo) {
      for (const it of itemsVencimiento(r.vencimientos)) {
        const fila = paraCierre(it, fecha, nombresProducto);
        if (!fila.producto) continue;
        novedades.vencimientos.push({ local, turno: rep.turno, quien, ...fila });
      }
    }
    // Mantenimiento: lo que dijo el turno sobre cada ítem (nuevo, sigue igual, se
    // solucionó). Los reportes anteriores al seguimiento traen un texto suelto.
    const m = valorMantenimiento(r.mantenimiento);
    if (m.legado) {
      novedades.mantenimiento.push({ id: null, local, local_id: rep.local_id, turno: rep.turno, quien, texto: m.legado, legado: true, hoy: [] });
    }
    for (const [id, resp] of Object.entries(m.seguimiento)) {
      dichoHoy.push({ id: Number(id), turno: rep.turno, quien, respuesta: resp });
    }
    for (const nuevo of m.nuevos) {
      if (nuevo.item_id) dichoHoy.push({ id: nuevo.item_id, turno: rep.turno, quien, respuesta: 'nuevo' });
    }
    if (r.faltantes?.hubo) {
      for (const it of filasConDatos(r.faltantes.items)) {
        novedades.faltantes.push({ local, turno: rep.turno, quien, ...it });
      }
    }
    if (r.ausencias?.hubo) {
      for (const it of filasConDatos(r.ausencias.items)) {
        novedades.ausencias.push({ local, turno: rep.turno, quien, ...it });
      }
    }
    if (esNovedad(r.quejas)) {
      novedades.quejas.push({ local, turno: rep.turno, quien, texto: r.quejas.trim() });
    }
    // Plata que salió de la caja del turno: pagos a proveedores, compras de insumos.
    if (r.gastos?.hubo) {
      for (const it of filasConDatos(r.gastos.items)) {
        novedades.gastos.push({ local, turno: rep.turno, quien, ...it, monto: n(it.monto) });
      }
    }
  }
  novedades.total_gastos = novedades.gastos.reduce((s, g) => s + g.monto, 0);

  // Los ítems de mantenimiento tal como estaban ese día, con lo que dijo cada turno.
  // Primero lo nuevo de hoy, después lo que sigue arrastrándose, al final lo resuelto.
  const diasEntre = (desde, hasta) => Math.round((Date.parse(`${hasta}T12:00:00`) - Date.parse(`${desde}T12:00:00`)) / 86400000);
  for (const it of await itemsDelDia(fecha)) {
    if (!porLocal[it.local_id]) continue;
    const resueltoHoy = it.resuelto_fecha === fecha;
    novedades.mantenimiento.push({
      id: it.id, local: porLocal[it.local_id].nombre, local_id: it.local_id,
      texto: it.texto, rubro: it.rubro || '', fecha: it.fecha, reportado_por: it.reportado_por,
      dias: diasEntre(it.fecha, fecha),
      estado: resueltoHoy ? 'resuelto' : 'abierto',
      plan: it.plan || '',
      hoy: dichoHoy.filter(d => d.id === it.id).map(({ turno, respuesta }) => ({ turno, respuesta })),
      // El turno de hoy que lo informó, para mostrarlo como el resto de las novedades.
      turno: dichoHoy.find(d => d.id === it.id)?.turno || '',
      quien: dichoHoy.find(d => d.id === it.id)?.quien || it.reportado_por || '',
    });
  }
  const orden = it => it.legado ? 3 : it.estado === 'resuelto' ? 2 : it.fecha === fecha ? 0 : 1;
  novedades.mantenimiento.sort((a, b) => a.local_id - b.local_id || orden(a) - orden(b) || (a.id || 0) - (b.id || 0));

  // Los vencimientos van por urgencia, no por local: lo que vence primero es lo único
  // que hay que mirar, y por local quedaba enterrado al final de la lista.
  const cuantosDias = it => { const n = Number(it.dias); return Number.isFinite(n) ? n : Infinity; };
  novedades.vencimientos.sort((a, b) => cuantosDias(a) - cuantosDias(b) || a.local.localeCompare(b.local));

  for (const { acc, empleado_id, horas } of horasPorPersona.values()) {
    const valor = valorDe[empleado_id];
    acc.horas += horas;
    if (valor) acc.gasto_personal += horas * valor;
    else acc.horas_sin_valor += horas;
  }

  const guardado = (await pool.query('SELECT * FROM consolidados WHERE fecha = $1', [fecha])).rows[0] || null;

  // Cuántos reportes de venta se esperan en cada local. Solo cuentan las plantillas
  // que piden ventas (cocina no las pide), y solo si el local tiene gente de esa área
  // cargando reportes.
  //
  // Es una aproximación: cuenta todos los turnos de la plantilla, sin saber quién
  // trabajó hoy. La cuenta exacta va a salir de la grilla de turnos.
  const plantillas = (await pool.query(
    'SELECT codigo, area, campos FROM reporte_plantillas WHERE activo = true'
  )).rows;
  const areasQueReportan = (await pool.query(`
    SELECT DISTINCT local_id_principal AS local_id, area
    FROM empleados WHERE activo = true AND carga_reporte = true
  `)).rows;

  // Un local cerrado ese día no espera ningún turno. Sin esto el domingo del café
  // quedaba como un día incompleto y arrastraba el cierre y el resumen de la semana.
  const diaSemana = new Date(`${fecha}T12:00:00`).getDay();
  const abiertos = new Set(
    (await pool.query('SELECT id, dias_abierto FROM locales')).rows
      .filter(l => (l.dias_abierto || [0, 1, 2, 3, 4, 5, 6]).includes(diaSemana))
      .map(l => l.id)
  );

  const esperadosPorLocal = {};
  for (const { local_id, area } of areasQueReportan) {
    if (!abiertos.has(local_id)) continue;
    const p = plantillas.find(x => x.area === area);
    if (!p) continue;
    const pideVentas = p.campos.some(c => c.codigo === 'ventas');
    if (!pideVentas) continue;
    const turnos = p.campos.find(c => c.codigo === 'turno')?.opciones || [];
    esperadosPorLocal[local_id] = (esperadosPorLocal[local_id] || 0) + turnos.length;
  }

  // El control real: lo que reportó cada turno a mano contra lo que trajo el Excel
  // de Fudo. Son dos fuentes independientes; si no cierran, algo pasó. Pero solo
  // vale comparar cuando están todos los turnos: si falta uno, la diferencia es
  // el turno que falta, no un error de nadie.
  const filas = Object.values(porLocal).map(l => {
    const esperados = esperadosPorLocal[l.local_id] || 0;
    const conVentas = l.reportes.filter(r => {
      const p = plantillas.find(x => x.codigo === r.plantilla);
      return p?.campos.some(c => c.codigo === 'ventas');
    }).length;
    const completo = esperados > 0 && conVentas >= esperados;

    return {
      ...l,
      turnos_esperados: esperados,
      turnos_reportados: conVentas,
      completo,
      diferencia: completo ? l.ventas_reportadas - l.ventas_sistema : null,
      horas_sobre_ventas: (l.ventas_sistema > 0 && l.gasto_personal > 0)
        ? (l.gasto_personal / l.ventas_sistema) * 100
        : null,
      ticket_promedio: l.tickets_sistema > 0 ? l.ventas_sistema / l.tickets_sistema : null,
    };
  });

  const totales = filas.reduce((t, l) => ({
    ventas_sistema:    t.ventas_sistema + l.ventas_sistema,
    ventas_reportadas: t.ventas_reportadas + l.ventas_reportadas,
    tickets:           t.tickets + l.tickets_sistema,
    personas:          t.personas + (l.personas_reportadas || l.tickets_sistema),
    horas:             t.horas + l.horas,
    gasto_personal:    t.gasto_personal + l.gasto_personal,
    horas_sin_valor:   t.horas_sin_valor + l.horas_sin_valor,
  }), {
    ventas_sistema: 0, ventas_reportadas: 0, tickets: 0, personas: 0,
    horas: 0, gasto_personal: 0, horas_sin_valor: 0,
  });

  // Objetivo de la red: el de cada local pesado por su venta. Un café con objetivo 22 y
  // tiendas con 12 no se pueden comparar contra un número fijo.
  totales.objetivo = totales.ventas_sistema > 0
    ? filas.reduce((s, l) => s + (l.objetivo || 0) * l.ventas_sistema, 0) / totales.ventas_sistema
    : null;

  totales.horas_sobre_ventas = (totales.ventas_sistema > 0 && totales.gasto_personal > 0)
    ? (totales.gasto_personal / totales.ventas_sistema) * 100
    : null;
  totales.ticket_promedio = totales.tickets > 0 ? totales.ventas_sistema / totales.tickets : null;

  // Un ticket de café y uno de tienda no se parecen en nada: el promedio mezclado
  // no le dice nada a nadie. Van separados.
  const promedioDe = grupo => {
    const v = grupo.reduce((s, l) => s + l.ventas_sistema, 0);
    const k = grupo.reduce((s, l) => s + l.tickets_sistema, 0);
    return k > 0 ? v / k : null;
  };
  totales.ticket_promedio_tiendas = promedioDe(filas.filter(l => l.tipo !== 'cafeteria'));
  totales.ticket_promedio_cafe    = promedioDe(filas.filter(l => l.tipo === 'cafeteria'));

  // Café del día: lo que pesó la barista de la mañana al entrar y la de la tarde al
  // terminar, cuánto se consumió, y el control contra lo vendido según el maestro.
  const cafe = cafeDelDia(reportes, plantillas, await teoricoCafe(fecha, await localCafeteria()));

  return {
    fecha, locales: filas, totales, novedades, cafe,
    proveedores: await facturasDelDia(fecha),
    consolidado: guardado,
  };
}


// ── GET / ─────────────────────────────────────────────────────────────────────
// El dueño también entra: requireRol deja pasar admin siempre.

router.get('/', requireAuth, requireRol(ROLES.ENCARGADO_GENERAL), async (req, res) => {
  try {
    const fecha = req.query.fecha || hoyStr();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
      return res.status(400).json({ ok: false, error: 'Fecha inválida' });
    }
    res.json({ ok: true, data: await armarDia(fecha) });
  } catch (err) {
    console.error('[consolidado GET]', err);
    res.status(500).json({ ok: false, error: 'Error al armar el consolidado' });
  }
});


module.exports = router;
module.exports.armarDia = armarDia;
